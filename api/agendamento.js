export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { eventUri, nome, telefone, instagram } = req.body
  if (!eventUri) return res.status(200).json({ ok: true })

  const CALENDLY_TOKEN    = process.env.CALENDLY_TOKEN
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID

  let dataHora = null

  if (CALENDLY_TOKEN) {
    try {
      const resp = await fetch(eventUri, {
        headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` }
      })
      const json = await resp.json()
      const startTime = json.resource?.start_time
      if (startTime) {
        dataHora = new Date(startTime).toLocaleString('pt-BR', {
          timeZone:  'America/Sao_Paulo',
          weekday:   'long',
          day:       '2-digit',
          month:     'long',
          year:      'numeric',
          hour:      '2-digit',
          minute:    '2-digit',
        })
      }
    } catch (_) {}
  }

  const whatsappLink = telefone
    ? `https://wa.me/55${telefone.replace(/\D/g, '')}`
    : null

  const linha = (label, val) => val ? `${label} ${val}` : null

  const msg = [
    '📅 *Reunião Agendada — AceleraGO*',
    '',
    linha('👤 *Nome:*',      nome),
    linha('📱 *WhatsApp:*',  telefone),
    linha('📸 *Instagram:*', instagram ? `@${instagram}` : null),
    linha('🗓 *Data/Hora:*', dataHora),
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
