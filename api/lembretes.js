// Cron: lembrete de reunião ~2h antes.
// Chamado pelo Vercel Cron a cada 15 min. Protegido por CRON_SECRET
// (o Vercel envia automaticamente o header Authorization: Bearer ${CRON_SECRET}).
import { sendTemplate } from './_whatsapp.js'

export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET
  const auth        = req.headers['authorization'] || ''
  const provided    = auth.replace(/^Bearer\s+/i, '') || req.query.secret
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const SB_URL         = process.env.SUPABASE_URL
  const SB_KEY         = process.env.SUPABASE_SECRET_KEY
  // trim(): o token já foi salvo na Vercel com \n no final e quebrou a auth em silêncio (11/07)
  const CALENDLY_TOKEN = (process.env.CALENDLY_TOKEN || '').trim()
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
    // Consulta o Calendly: pula reunião cancelada e aproveita pra pegar o link da chamada
    // (location.join_url — Zoom/Meet), que vai direto no corpo do lembrete.
    let linkReuniao = null
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
        linkReuniao = evj?.resource?.location?.join_url ?? null
      } catch (_) { /* se a checagem falhar, segue e envia mesmo assim */ }
    }

    const hora = new Date(ag.reuniao_at).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    })
    const pnome = ag.nome ? String(ag.nome).trim().split(/\s+/)[0] : ''

    // Previews gravados no inbox do CRM — manter em sincronia com os templates na Meta.
    // v5 (copy aprovada 11/07, persona Gabriel, sem citar o Ronaldo) e v4 levam o link
    // do Zoom no corpo; v3/v2 apontam pro convite do e-mail.
    const nomeParam = pnome || 'Doutora'
    const previewV5 =
      `Oi, ${nomeParam}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
      `Passando para lembrar da sua sessão de diagnóstico hoje às ${hora}.\n\n` +
      `O link da chamada é este: ${linkReuniao}\n\nPodemos contar com você?`
    const previewV4 =
      `Oi, ${nomeParam}! Passando para lembrar da sua reunião de diagnóstico com o Ronaldo, da AceleraGO, hoje às ${hora}.\n\n` +
      `O link da chamada é este: ${linkReuniao}\n\nPodemos contar com você?`
    const previewSemLink =
      `Oi, ${nomeParam}! Passando para lembrar da sua reunião de diagnóstico com o Ronaldo, da AceleraGO, hoje às ${hora}.\n\n` +
      `O link da chamada é o do convite que chegou no seu e-mail. Podemos contar com você?`

    // Todos só com o botão "Confirmo" (sem "Preciso remarcar" — decisão de 11/07).
    // Cadeia de fallback enquanto a Meta não aprova os novos.
    let ok = false
    if (ag.telefone) {
      if (linkReuniao) {
        ok = await sendTemplate(ag.telefone, 'lembrete_reuniao_v5', [nomeParam, hora, linkReuniao], previewV5)
          || await sendTemplate(ag.telefone, 'lembrete_reuniao_v4', [nomeParam, hora, linkReuniao], previewV4)
      }
      if (!ok) {
        ok = await sendTemplate(ag.telefone, 'lembrete_reuniao_v3', [nomeParam, hora], previewSemLink)
          || await sendTemplate(ag.telefone, 'lembrete_reuniao_v2', [nomeParam, hora], previewSemLink)
      }
    }

    if (ok) { await markDone(ag.id); enviados++ }
    else    { falhas++ }
  }

  return res.status(200).json({ ok: true, encontrados: due.length, enviados, cancelados, falhas })
}
