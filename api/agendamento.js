import crypto from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { eventUri, eventId, nome, telefone, instagram, site, faturamento, investimento,
          fbc, fbp, userAgent,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body
  const utmLabel = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ') || null
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress

  const CALENDLY_TOKEN     = process.env.CALENDLY_TOKEN
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID

  let dataHora = null
  let startTimeIso = null

  if (CALENDLY_TOKEN && eventUri) {
    try {
      const resp = await fetch(eventUri, {
        headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` }
      })
      const json = await resp.json()
      const startTime = json.resource?.start_time
      startTimeIso = startTime || null
      if (startTime) {
        dataHora = new Date(startTime).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          weekday:  'long',
          day:      '2-digit',
          month:    'long',
          year:     'numeric',
          hour:     '2-digit',
          minute:   '2-digit',
        })
      }
    } catch (_) {}
  }

  // Meta CAPI — evento CompleteRegistration via servidor (garante rastreamento no iOS)
  const META_TOKEN = process.env.META_ACCESS_TOKEN
  if (META_TOKEN) {
    const sha256 = (val) => crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex')

    const phoneDigits = telefone ? telefone.replace(/\D/g, '') : null
    const phoneE164   = phoneDigits ? (phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`) : null
    const nomeParts   = nome ? nome.trim().split(/\s+/) : []

    const userData = {}
    if (phoneE164)            userData.ph          = [sha256(phoneE164)]
    if (nomeParts[0])         userData.fn          = [sha256(nomeParts[0])]
    if (nomeParts.length > 1) userData.ln          = [sha256(nomeParts[nomeParts.length - 1])]
    if (clientIp)             userData.client_ip_address = clientIp
    if (userAgent)            userData.client_user_agent = userAgent
    if (fbc)                  userData.fbc         = fbc
    if (fbp)                  userData.fbp         = fbp

    try {
      await fetch(`https://graph.facebook.com/v21.0/3236771719838015/events?access_token=${META_TOKEN}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{
            event_name:       'CompleteRegistration',
            event_time:       Math.floor(Date.now() / 1000),
            ...(eventId && { event_id: eventId }),
            action_source:    'website',
            event_source_url: 'https://acelerago.com.br/diagnostico',
            user_data:        userData,
            custom_data:      {
              content_name: 'Diagnóstico AceleraGO',
              ...(utm_source   && { utm_source }),
              ...(utm_medium   && { utm_medium }),
              ...(utm_campaign && { utm_campaign }),
              ...(utm_content  && { utm_content }),
              ...(utm_term     && { utm_term }),
            },
          }],
          ...(process.env.META_TEST_EVENT_CODE && { test_event_code: process.env.META_TEST_EVENT_CODE }),
        }),
      })
    } catch (_) {}
  }

  // ── Follow-up automático no WhatsApp da lead (Evolution API, instância AceleraGO) ──
  // Confirma o compromisso no horário agendado, no momento do agendamento.
  // Fica dormente se as env vars não estiverem configuradas (não envia nada por engano).
  const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL
  const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY
  const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE && telefone) {
    const waDigits = telefone.replace(/\D/g, '')
    // DDI 55 só quando já tem 12+ dígitos; senão é DDD 55 (RS) e precisa do prefixo
    const waNumber = waDigits.startsWith('55') && waDigits.length >= 12 ? waDigits : `55${waDigits}`
    const pnome    = nome ? nome.trim().split(/\s+/)[0] : ''
    const quando   = dataHora ? ` para ${dataHora}` : ''
    const texto =
      `📅 *Reunião de diagnóstico agendada*\n\n` +
      `Olá, ${pnome}! Reservamos o seu horário com a AceleraGO${quando}.\n\n` +
      `Para confirmar a sua presença, responda esta mensagem com a palavra *CONFIRMO*.\n\n` +
      `Se não puder comparecer, avise por aqui para que possamos liberar o horário para outra profissional.\n\n` +
      `Equipe AceleraGO`
    try {
      const wa = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body:    JSON.stringify({ number: waNumber, text: texto }),
      })
      if (!wa.ok) console.error(`[agendamento] WhatsApp follow-up falhou: HTTP ${wa.status}`)
    } catch (e) { console.error('[agendamento] WhatsApp follow-up erro:', e) }
  }

  // ── Persiste o agendamento para o lembrete de 2h antes (cron /api/lembretes) ──
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SECRET_KEY
  if (SB_URL && SB_KEY && telefone && startTimeIso) {
    const telDigits = telefone.replace(/\D/g, '')
    const telE164   = telDigits.startsWith('55') && telDigits.length >= 12 ? telDigits : `55${telDigits}`
    try {
      const ins = await fetch(`${SB_URL}/rest/v1/agendamentos`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:         SB_KEY,
          Authorization:  `Bearer ${SB_KEY}`,
          Prefer:         'return=minimal',
        },
        body: JSON.stringify({
          nome:               nome || null,
          telefone:           telE164,
          reuniao_at:         startTimeIso,
          calendly_event_uri: eventUri || null,
        }),
      })
      if (!ins.ok) console.error(`[agendamento] Supabase insert falhou: HTTP ${ins.status} — ${await ins.text()}`)
    } catch (e) { console.error('[agendamento] Supabase insert erro:', e) }
  }

  const whatsappLink = telefone
    ? `https://wa.me/55${telefone.replace(/\D/g, '')}`
    : null

  // HTML (não Markdown): valores dinâmicos como utm_medium "paid_social" têm '_'
  // que quebram o Markdown legado e fazem o Telegram descartar a mensagem.
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linha = (label, val) => val ? `${label} ${esc(val)}` : null
  const qualificado = investimento && investimento.startsWith('Sim')

  const msg = [
    qualificado ? '🟢 <b>Lead QUALIFICADO — AceleraGO</b>' : '🔴 <b>Lead Concluído — AceleraGO</b>',
    '',
    linha('👤 <b>Nome:</b>',        nome),
    linha('📱 <b>WhatsApp:</b>',    telefone),
    linha('📸 <b>Instagram:</b>',   instagram ? `@${instagram}` : null),
    linha('🌐 <b>Site:</b>',        site || 'Não informado'),
    linha('💰 <b>Faturamento:</b>', faturamento),
    linha('✅ <b>Investimento:</b>', investimento),
    linha('📊 <b>Origem:</b>',      utmLabel),
    linha('🗓 <b>Reunião:</b>',     dataHora),
    '',
    whatsappLink ? `💬 <a href="${whatsappLink}">Abordar no WhatsApp</a>` : null,
  ].filter(Boolean).join('\n')

  try {
    const tg = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' }),
    })
    if (!tg.ok) console.error(`[agendamento] Telegram falhou: HTTP ${tg.status} — ${await tg.text()}`)
  } catch (e) { console.error('[agendamento] Telegram erro:', e) }

  return res.status(200).json({ ok: true })
}
