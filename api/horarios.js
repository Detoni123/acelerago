// Proxy dos horários livres. O navegador pergunta aqui, e este servidor pergunta
// ao CRM guardando o segredo — que nunca pode ir para o navegador.
//
// Sem cache de propósito: o ponto da agenda própria é ler o Google no instante
// do pedido, para que um horário bloqueado no celular suma da lista na hora.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const CRM = process.env.CRM_URL || 'https://crm.acelerago.com.br'
  const SECRET = process.env.AGENDA_SECRET
  if (!SECRET) {
    console.error('[horarios] AGENDA_SECRET ausente no ambiente')
    return res.status(503).json({ ok: false, error: 'agenda indisponível' })
  }

  const frente = req.query.frente === 'detoni' ? 'detoni' : 'acelerago'

  try {
    const r = await fetch(`${CRM}/api/agenda/horarios?frente=${frente}`, {
      headers: { 'x-agenda-secret': SECRET },
    })
    const j = await r.json()
    if (!r.ok) console.error(`[horarios] CRM HTTP ${r.status}:`, JSON.stringify(j))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(r.ok ? 200 : 502).json(j)
  } catch (e) {
    console.error('[horarios] erro:', e?.message ?? e)
    return res.status(502).json({ ok: false, error: 'agenda indisponível' })
  }
}
