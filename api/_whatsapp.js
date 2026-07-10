// Envio de WhatsApp via Cloud API oficial (coexistência DualHook).
// Substitui a Evolution API (desativada em 08/07/2026 após restrição do número).
// Crons usam SEMPRE template aprovado: mensagem livre fora da janela de 24h é
// aceita pela API mas falha de forma assíncrona (erro 131047 só no webhook),
// o que tornaria o cron silenciosamente inútil de novo.

const TOKEN    = process.env.WHATSAPP_CLOUD_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

export function normalizarNumero(telefone) {
  const digits = String(telefone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  // DDI 55 só quando já tem 12+ dígitos; senão é DDD 55 (RS) e precisa do prefixo
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
}

async function post(payload) {
  const r = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/messages`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) console.error('[whatsapp] envio falhou:', d.error?.code, d.error?.message)
  return r.ok
}

export async function sendTemplate(telefone, nomeTemplate, parametros = []) {
  const to = normalizarNumero(telefone)
  if (!TOKEN || !PHONE_ID || !to) return false
  const components = parametros.length
    ? [{ type: 'body', parameters: parametros.map(t => ({ type: 'text', text: String(t || '—') })) }]
    : undefined
  return post({
    to,
    type: 'template',
    template: { name: nomeTemplate, language: { code: 'pt_BR' }, ...(components && { components }) },
  })
}

export async function sendText(telefone, texto) {
  const to = normalizarNumero(telefone)
  if (!TOKEN || !PHONE_ID || !to) return false
  return post({ to, type: 'text', text: { body: texto } })
}
