// Cron: lembrete de reunião ~2h antes.
// Chamado pelo Vercel Cron a cada 15 min. Protegido por CRON_SECRET
// (o Vercel envia automaticamente o header Authorization: Bearer ${CRON_SECRET}).
export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET
  const auth        = req.headers['authorization'] || ''
  const provided    = auth.replace(/^Bearer\s+/i, '') || req.query.secret
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const SB_URL             = process.env.SUPABASE_URL
  const SB_KEY             = process.env.SUPABASE_SECRET_KEY
  const CALENDLY_TOKEN     = process.env.CALENDLY_TOKEN
  const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL
  const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY
  const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'supabase nao configurado' })

  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey:         SB_KEY,
    Authorization:  `Bearer ${SB_KEY}`,
  }

  const markDone = (id) =>
    fetch(`${SB_URL}/rest/v1/agendamentos?id=eq.${id}`, {
      method:  'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body:    JSON.stringify({ lembrete_2h_enviado: true, lembrete_2h_em: new Date().toISOString() }),
    }).catch(() => {})

  // Janela: reuniões começando entre 1h45 e 2h15 a partir de agora, ainda sem lembrete.
  // Largura de 30 min > intervalo do cron (15 min), então nenhuma escapa; o flag evita duplicar.
  const now  = Date.now()
  const from = new Date(now + 105 * 60 * 1000).toISOString() // +1h45
  const to   = new Date(now + 135 * 60 * 1000).toISOString() // +2h15

  let due = []
  try {
    const q = `${SB_URL}/rest/v1/agendamentos`
      + `?select=*&lembrete_2h_enviado=eq.false`
      + `&reuniao_at=gte.${encodeURIComponent(from)}`
      + `&reuniao_at=lte.${encodeURIComponent(to)}`
    const r = await fetch(q, { headers: sbHeaders })
    due = r.ok ? await r.json() : []
  } catch (e) {
    return res.status(500).json({ error: 'query falhou', detail: String(e) })
  }

  let enviados = 0, cancelados = 0, falhas = 0

  for (const ag of due) {
    // Não lembra reunião cancelada no Calendly.
    if (CALENDLY_TOKEN && ag.calendly_event_uri) {
      try {
        const ev  = await fetch(ag.calendly_event_uri, { headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` } })
        const evj = ev.ok ? await ev.json() : null
        const status = evj?.resource?.status
        if (status && status !== 'active') {
          await markDone(ag.id)   // marca pra não reprocessar
          cancelados++
          continue
        }
      } catch (_) { /* se a checagem falhar, segue e envia mesmo assim */ }
    }

    const hora = new Date(ag.reuniao_at).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    })
    const pnome = ag.nome ? String(ag.nome).trim().split(/\s+/)[0] : ''

    // Quem já respondeu CONFIRMO (confirmado_at preenchido) recebe um lembrete leve.
    // Quem NÃO confirmou recebe um reforço pedindo confirmação ou aviso de ausência.
    const texto = ag.confirmado_at
      ? `⏰ *Lembrete: sua reunião é hoje*\n\n` +
        `Olá, ${pnome}! Passando para lembrar da sua reunião de diagnóstico com a AceleraGO hoje, às ${hora}.\n\n` +
        `Nos vemos em breve. Se precisar remarcar, avise por aqui.`
      : `⏰ *Sua reunião com a AceleraGO é hoje, às ${hora}*\n\n` +
        `Olá, ${pnome}! Ainda não recebemos a sua confirmação e o seu horário continua reservado.\n\n` +
        `Como a agenda é limitada, precisamos saber se podemos contar com você. Para confirmar, responda com a palavra *CONFIRMO*.\n\n` +
        `Se não puder comparecer, é só avisar por aqui que liberamos o horário.`

    let ok = false
    if (EVOLUTION_API_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE && ag.telefone) {
      const digits = String(ag.telefone).replace(/\D/g, '')
      // DDI 55 só quando já tem 12+ dígitos; senão é DDD 55 (RS) e precisa do prefixo
      const number = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
      try {
        const wa = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
          body:    JSON.stringify({ number, text: texto }),
        })
        ok = wa.ok || wa.status === 201
      } catch (_) { ok = false }
    }

    if (ok) { await markDone(ag.id); enviados++ }
    else    { falhas++ }
  }

  return res.status(200).json({ ok: true, encontrados: due.length, enviados, cancelados, falhas })
}
