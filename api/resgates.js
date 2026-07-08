// Cron: resgate automático de leads do funil /diagnostico que pararam no meio.
// Roda a cada 15 min (Vercel Cron, protegido por CRON_SECRET), horário comercial apenas.
//
// Três resgates, todos sobre prospects gravados pelo /api/lead:
//  1. QUALIFICADA sem agendamento (Investimento: Sim, +1h, sem reunião marcada) → oferece a agenda
//  2. DESQUALIFICADA que não chamou (+30min) → mensagem-semente do Gabriel (alinhada à tela s8)
//  3. ABANDONO de formulário (+1h) → convite pra tirar dúvida / retomar
//
// Idempotência: após enviar, anexa um marcador [auto:resgate-*] nas observações do prospect.
// Janela máxima de 72h: leads mais antigas não recebem nada (resgate antigo é manual).
export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET
  const auth        = req.headers['authorization'] || ''
  const provided    = auth.replace(/^Bearer\s+/i, '') || req.query.secret
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const SB_URL             = process.env.SUPABASE_URL
  const SB_KEY             = process.env.SUPABASE_SECRET_KEY
  const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL
  const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY
  const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'supabase nao configurado' })
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    return res.status(200).json({ ok: true, skipped: 'evolution nao configurado' })
  }

  // Horário comercial em São Paulo (8h às 20h). Fora disso o cron passa em branco;
  // a janela de 72h garante que a lead é pega na próxima rodada útil.
  const hourSP = Number(new Date().toLocaleString('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
  }))
  if (hourSP < 8 || hourSP >= 20) {
    return res.status(200).json({ ok: true, skipped: 'fora do horario comercial' })
  }

  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey:         SB_KEY,
    Authorization:  `Bearer ${SB_KEY}`,
  }

  const now      = Date.now()
  const windowLo = new Date(now - 72 * 3600 * 1000).toISOString() // máx. 72h atrás

  // Prospects do funil dentro da janela (o marcador de origem vem do /api/lead)
  let prospects = []
  try {
    const q = `${SB_URL}/rest/v1/prospects`
      + `?select=id,nome,telefone,observacoes,created_at`
      + `&observacoes=ilike.${encodeURIComponent('*Formulário /diagnostico*')}`
      + `&created_at=gte.${encodeURIComponent(windowLo)}`
    const r = await fetch(q, { headers: sbHeaders })
    prospects = r.ok ? await r.json() : []
  } catch (e) {
    return res.status(500).json({ error: 'query falhou', detail: String(e) })
  }

  const sendWA = async (telefone, texto) => {
    const digits = String(telefone).replace(/\D/g, '')
    if (digits.length < 10) return false
    const number = digits.startsWith('55') ? digits : `55${digits}`
    try {
      const wa = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body:    JSON.stringify({ number, text: texto }),
      })
      return wa.ok || wa.status === 201
    } catch (_) { return false }
  }

  const marcar = (p, marcador) =>
    fetch(`${SB_URL}/rest/v1/prospects?id=eq.${p.id}`, {
      method:  'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body:    JSON.stringify({ observacoes: `${p.observacoes}\n[auto:${marcador}] ${new Date().toISOString()}` }),
    }).catch(() => {})

  // Já tem reunião marcada? (compara pelos 8 últimos dígitos do telefone)
  const temAgendamento = async (telefone) => {
    const last8 = String(telefone).replace(/\D/g, '').slice(-8)
    if (last8.length < 8) return false
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/agendamentos?select=id&telefone=ilike.${encodeURIComponent('%' + last8)}`,
        { headers: sbHeaders },
      )
      const rows = r.ok ? await r.json() : []
      return rows.length > 0
    } catch (_) { return false }
  }

  const CALENDLY = 'https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go'
  const pnomeDe  = (nome) => nome ? String(nome).trim().split(/\s+/)[0] : ''

  let qualificadas = 0, desqualificadas = 0, abandonos = 0, falhas = 0

  for (const p of prospects) {
    const o = p.observacoes || ''
    if (/\[auto:/.test(o)) continue                       // já resgatada
    if (!p.telefone) continue
    const idadeMin = (now - new Date(p.created_at).getTime()) / 60000
    const pnome = pnomeDe(p.nome)

    // 1. Qualificada (aceitou investir) que não agendou — espera 60 min
    if (/Investimento: Sim/i.test(o) && !/Status:/i.test(o)) {
      if (idadeMin < 60) continue
      if (await temAgendamento(p.telefone)) { await marcar(p, 'resgate-desnecessario'); continue }
      const texto =
        `Oi, ${pnome}! Aqui é o Ronaldo, da AceleraGO.\n\n` +
        `Vi que você concluiu o diagnóstico e ficou faltando só escolher o horário da sua reunião. ` +
        `A agenda desta semana está aqui: ${CALENDLY}\n\n` +
        `Se preferir, me fala por aqui o melhor dia e horário que eu encaixo pra você.`
      if (await sendWA(p.telefone, texto)) { await marcar(p, 'resgate-qualificada'); qualificadas++ }
      else falhas++
      continue
    }

    // 2. Desqualificada que não chamou — espera 30 min
    if (/Status: Desqualificado/i.test(o)) {
      if (idadeMin < 30) continue
      const texto =
        `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO ☺️\n\n` +
        `Vi que você preencheu o nosso diagnóstico. Cada médica vive um momento diferente, e o seu importa pra gente.\n\n` +
        `Me conta um pouco do seu momento e do seu consultório? Assim conseguimos te dar um direcionamento honesto do que faz sentido agora, sem compromisso.`
      if (await sendWA(p.telefone, texto)) { await marcar(p, 'resgate-desqualificada'); desqualificadas++ }
      else falhas++
      continue
    }

    // 3. Abandonou o formulário — espera 60 min
    if (/ABANDONOU/i.test(o)) {
      if (idadeMin < 60) continue
      const texto =
        `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO ☺️\n\n` +
        `Vi que você começou o nosso diagnóstico e não chegou a concluir. Ficou alguma dúvida?\n\n` +
        `Se preferir, me conta por aqui mesmo o seu momento que a gente te direciona. E se quiser retomar, é rapidinho: acelerago.com.br/diagnostico`
      if (await sendWA(p.telefone, texto)) { await marcar(p, 'resgate-abandono'); abandonos++ }
      else falhas++
    }
  }

  return res.status(200).json({
    ok: true, analisados: prospects.length,
    enviados: { qualificadas, desqualificadas, abandonos }, falhas,
  })
}
