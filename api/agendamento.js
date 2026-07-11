import crypto from 'crypto'

import { sendTemplate, volumeAnormal } from './_whatsapp.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { eventUri, eventId, nome, telefone, instagram, site, faturamento, investimento, especialidade,
          fbc, fbp, userAgent,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body
  const utmLabel = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ') || null
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress

  // trim(): o token já foi salvo na Vercel com \n no final e quebrou a auth em silêncio (11/07)
  const CALENDLY_TOKEN     = (process.env.CALENDLY_TOKEN || '').trim()
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

  // ── Confirmação automática no WhatsApp da lead, no momento do agendamento ──
  // Disjuntor anti-abuso: endpoint é público; volume anormal de agendamentos
  // suspende o envio (o registro continua sendo gravado normalmente).
  const inundado = telefone ? await volumeAnormal('agendamentos', 'criado_em', 15, 6) : false
  if (inundado) console.error('[agendamento] volume anormal — confirmação suspensa')
  if (telefone && !inundado) {
    // Cloud API oficial: template aprovado confirmacao_reuniao_v2 (nome + data/hora)
    const pnome  = nome ? nome.trim().split(/\s+/)[0] : 'Doutora'
    const quando = dataHora || 'em breve'
    // Previews gravados no inbox do CRM — manter em sincronia com os templates na Meta.
    // v5 = copy aprovada pelo Ronaldo em 11/07 (valor da sessão, sem citar o Ronaldo).
    const previewV5 =
      `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
      `Sua sessão de diagnóstico está confirmada para ${quando}, e ela será preparada especialmente pra você.\n\n` +
      `Reserve esses 30 minutos com atenção: o nosso estrategista vai te mostrar, ponto por ponto, o que está impedindo o seu consultório de atrair mais pacientes e o que fazer em cada frente. ` +
      `É o tipo de clareza que economiza meses de tentativa e erro.\n\n` +
      `O convite com o link da chamada chegou no seu e-mail. Posso confirmar a sua presença?`
    const previewV3 =
      `Oi, ${pnome}! Sua reunião de diagnóstico com o Ronaldo, da AceleraGO, está confirmada para ${quando}.\n\n` +
      `O link da chamada chega no seu e-mail. Podemos contar com você?`
    const ok = await sendTemplate(telefone, 'confirmacao_reuniao_v5', [pnome, quando], previewV5)
      || await sendTemplate(telefone, 'confirmacao_reuniao_v3', [pnome, quando], previewV3)
      || await sendTemplate(telefone, 'confirmacao_reuniao_v2', [pnome, quando], previewV3)
    if (!ok) console.error('[agendamento] WhatsApp follow-up falhou (Cloud API)')
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

      // Kanban acompanha o funil: lead agendou → card vai pra "reuniao"
      // (match pelos últimos 8 dígitos; não regride card já em proposta/fechado)
      const last8 = telDigits.slice(-8)
      if (last8.length === 8) {
        await fetch(
          `${SB_URL}/rest/v1/prospects?telefone=ilike.${encodeURIComponent('%' + last8 + '%')}&etapa=in.(prospeccao,contato)`,
          {
            method:  'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey:         SB_KEY,
              Authorization:  `Bearer ${SB_KEY}`,
              Prefer:         'return=minimal',
            },
            body: JSON.stringify({ etapa: 'reuniao' }),
          },
        ).catch(() => {})
      }
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
    linha('🩺 <b>Especialidade:</b>', especialidade),
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
