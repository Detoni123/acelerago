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

  if (CALENDLY_TOKEN && eventUri) {
    try {
      const resp = await fetch(eventUri, {
        headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` }
      })
      const json = await resp.json()
      const startTime = json.resource?.start_time
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

  const whatsappLink = telefone
    ? `https://wa.me/55${telefone.replace(/\D/g, '')}`
    : null

  const linha = (label, val) => val ? `${label} ${val}` : null
  const qualificado = investimento && investimento.startsWith('Sim')

  const msg = [
    qualificado ? '🟢 *Lead QUALIFICADO — AceleraGO*' : '🔴 *Lead Concluído — AceleraGO*',
    '',
    linha('👤 *Nome:*',        nome),
    linha('📱 *WhatsApp:*',    telefone),
    linha('📸 *Instagram:*',   instagram ? `@${instagram}` : null),
    linha('🌐 *Site:*',        site || 'Não informado'),
    linha('💰 *Faturamento:*', faturamento),
    linha('✅ *Investimento:*', investimento),
    linha('📊 *Origem:*',      utmLabel),
    linha('🗓 *Reunião:*',     dataHora),
    '',
    whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
  ].filter(Boolean).join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    })
  } catch (_) {}

  return res.status(200).json({ ok: true })
}
