// Envio de WhatsApp via Cloud API oficial (coexistência DualHook).
// Substitui a Evolution API (desativada em 08/07/2026 após restrição do número).
// Crons usam SEMPRE template aprovado: mensagem livre fora da janela de 24h é
// aceita pela API mas falha de forma assíncrona (erro 131047 só no webhook),
// o que tornaria o cron silenciosamente inútil de novo.
//
// Todo envio bem-sucedido é gravado em wa_conversas/wa_mensagens (com o wamid),
// para que o inbox do CRM mostre a mensagem e o webhook consiga atualizar o
// status assíncrono (delivered/read/FAILED). Sem isso, falha da Meta é invisível.

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
  return r.ok ? (d.messages?.[0]?.id || true) : false
}

// Grava o envio no banco do CRM para o inbox e para o rastreio de status.
// Nunca derruba o envio: erro aqui é só logado.
async function registrarEnvio(to, wamid, corpo) {
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SECRET_KEY
  if (!SB_URL || !SB_KEY || !wamid || typeof wamid !== 'string') return
  const H = { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  const agora = new Date().toISOString()
  try {
    // Conversa: reaproveita por telefone ou cria vinculando o prospect (últimos 8 dígitos)
    const lk = await fetch(`${SB_URL}/rest/v1/wa_conversas?select=id&telefone=eq.${to}`, { headers: H })
    const found = lk.ok ? await lk.json() : []
    let convId = found[0]?.id
    if (convId) {
      await fetch(`${SB_URL}/rest/v1/wa_conversas?id=eq.${convId}`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ ultima_mensagem_em: agora, ultima_mensagem_preview: corpo.slice(0, 120) }),
      })
    } else {
      let prospectId = null
      const last8 = to.slice(-8)
      const pr = await fetch(`${SB_URL}/rest/v1/prospects?select=id&telefone=ilike.${encodeURIComponent('%' + last8 + '%')}&limit=1`, { headers: H })
      const ps = pr.ok ? await pr.json() : []
      prospectId = ps[0]?.id ?? null
      const ins = await fetch(`${SB_URL}/rest/v1/wa_conversas`, {
        method: 'POST', headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({
          telefone: to, prospect_id: prospectId, nao_lidas: 0,
          ultima_mensagem_em: agora, ultima_mensagem_preview: corpo.slice(0, 120),
        }),
      })
      const nova = ins.ok ? await ins.json() : []
      convId = nova[0]?.id
    }
    if (!convId) return
    await fetch(`${SB_URL}/rest/v1/wa_mensagens?on_conflict=wamid`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify({
        conversa_id: convId, wamid, direcao: 'saida',
        tipo: 'template', corpo, status: 'sent', origem: 'automacao',
      }),
    })
  } catch (e) { console.error('[whatsapp] registrarEnvio falhou:', e) }
}

// corpoPreview: texto legível gravado no inbox (mantenha em sincronia com o template na Meta).
export async function sendTemplate(telefone, nomeTemplate, parametros = [], corpoPreview = '') {
  const to = normalizarNumero(telefone)
  if (!TOKEN || !PHONE_ID || !to) return false
  const components = parametros.length
    ? [{ type: 'body', parameters: parametros.map(t => ({ type: 'text', text: String(t || '—') })) }]
    : undefined
  const wamid = await post({
    to,
    type: 'template',
    template: { name: nomeTemplate, language: { code: 'pt_BR' }, ...(components && { components }) },
  })
  if (wamid) await registrarEnvio(to, wamid, corpoPreview || `[template] ${nomeTemplate}`)
  return wamid
}

export async function sendText(telefone, texto) {
  const to = normalizarNumero(telefone)
  if (!TOKEN || !PHONE_ID || !to) return false
  const wamid = await post({ to, type: 'text', text: { body: texto } })
  if (wamid) await registrarEnvio(to, wamid, texto)
  return wamid
}

// ── Proteção anti-abuso dos endpoints públicos ──────────────────────────────
// /api/lead e /api/agendamento aceitam POST sem autenticação (são o funil).
// Se alguém forjar requisições em massa, cada uma dispararia um template PAGO
// do número oficial (custo + risco de bloqueio por spam). Este disjuntor
// suspende os envios quando o volume recente foge do normal; os registros
// continuam sendo gravados e os resgates retomam quando o volume normaliza.
export async function volumeAnormal(tabela, colunaData, minutos = 15, limite = 12) {
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SECRET_KEY
  if (!SB_URL || !SB_KEY) return false
  try {
    const desde = new Date(Date.now() - minutos * 60000).toISOString()
    const r = await fetch(
      `${SB_URL}/rest/v1/${tabela}?select=id&${colunaData}=gte.${encodeURIComponent(desde)}&limit=${limite + 1}`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    )
    const rows = r.ok ? await r.json() : []
    return rows.length > limite
  } catch (_) { return false }
}

export async function alertaTelegram(texto) {
  const bot = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.TELEGRAM_CHAT_ID
  if (!bot || !chat) return
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto }),
    })
  } catch (_) {}
}
