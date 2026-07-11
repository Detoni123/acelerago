// Cron: resgate automático de leads do funil /diagnostico.
// Roda a cada minuto (Vercel Cron, protegido por CRON_SECRET), 24h por dia:
// resposta imediata sinaliza estrutura por trás (decisão de 11/07).
//
// Quatro resgates, todos sobre prospects gravados pelo /api/lead:
//  1a. COMPLETOU querendo investir e não agendou (+3 min) → oferece a agenda
//  1b. COMPLETOU mas "ainda não é o momento de investir" (+3 min) → acolhe e convida
//      pros 30 min sem custo (relacionamento pra parceria futura)
//  2. DESQUALIFICADA por faturamento (+3 min) → rede de segurança: o /api/lead já envia na hora;
//     este caminho só pega quem ficou sem marcador (falha no envio imediato)
//  3. ABANDONO de formulário (+10 min) → convite pra tirar dúvida / retomar
//
// Idempotência: após enviar, anexa um marcador [auto:resgate-*] nas observações do prospect.
// Janela máxima de 72h: leads mais antigas não recebem nada (resgate antigo é manual).
//
// Os textos abaixo são o PREVIEW gravado no inbox do CRM. O que a lead recebe é o
// template aprovado na Meta — mantenha os dois em sincronia ao editar.
import { alertaTelegram, sendTemplate, volumeAnormal } from './_whatsapp.js'
import { enviarResgateDesqualificada } from './_resgate-desqualificada.js'

const CALENDLY = 'https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go'

export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET
  const auth        = req.headers['authorization'] || ''
  const provided    = auth.replace(/^Bearer\s+/i, '') || req.query.secret
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SECRET_KEY
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'supabase nao configurado' })

  const sbHeaders = {
    'Content-Type': 'application/json',
    apikey:         SB_KEY,
    Authorization:  `Bearer ${SB_KEY}`,
  }

  // Disjuntor anti-abuso: volume anormal de leads = possível ataque ao /api/lead.
  // Suspende TODOS os envios desta rodada (nada é marcado, então nada se perde:
  // o cron retoma de onde parou quando o volume normalizar).
  if (await volumeAnormal('prospects', 'created_at')) {
    await alertaTelegram('🚨 Volume anormal de leads nos últimos 15 min — resgates suspensos nesta rodada (possível abuso do /api/lead). Verificar prospects recentes no CRM.')
    return res.status(200).json({ ok: true, skipped: 'volume anormal de prospects' })
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

  const marcar = (p, marcador) =>
    fetch(`${SB_URL}/rest/v1/prospects?id=eq.${p.id}`, {
      method:  'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body:    JSON.stringify({ observacoes: `${p.observacoes}\n[auto:${marcador}] ${new Date().toISOString()}` }),
    }).catch(() => {})

  // Kanban do CRM acompanha o funil sozinho (decisão de 11/07):
  // primeiro toque do robô → "contato"; lead com reunião marcada → "reuniao".
  // Filtro por etapa atual evita regredir card que o Ronaldo já avançou.
  const moverParaContato = (p) =>
    fetch(`${SB_URL}/rest/v1/prospects?id=eq.${p.id}&etapa=eq.prospeccao`, {
      method:  'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body:    JSON.stringify({ etapa: 'contato' }),
    }).catch(() => {})

  const moverParaReuniao = (p) =>
    fetch(`${SB_URL}/rest/v1/prospects?id=eq.${p.id}&etapa=in.(prospeccao,contato)`, {
      method:  'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body:    JSON.stringify({ etapa: 'reuniao' }),
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

  const pnomeDe = (nome) => nome ? String(nome).trim().split(/\s+/)[0] : ''

  let qualificadas = 0, aindaNao = 0, desqualificadas = 0, abandonos = 0, falhas = 0

  for (const p of prospects) {
    const o = p.observacoes || ''
    if (/\[auto:/.test(o)) continue                       // já resgatada
    if (!p.telefone) continue
    const idadeMin = (now - new Date(p.created_at).getTime()) / 60000
    const pnome = pnomeDe(p.nome)

    // 1. Completou o formulário e não agendou — espera 3 min
    if (/Investimento:/i.test(o) && !/Status:/i.test(o)) {
      if (idadeMin < 3) continue
      if (await temAgendamento(p.telefone)) { await marcar(p, 'resgate-desnecessario'); await moverParaReuniao(p); continue }

      if (/Investimento: Sim/i.test(o)) {
        // Quer investir: oferece a agenda direto
        const preview =
          `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
          `Vi que você concluiu o diagnóstico e ficou faltando só escolher o horário da sua conversa com o Ronaldo, nosso estrategista. ` +
          `A agenda desta semana está aqui: ${CALENDLY}\n\n` +
          `Se preferir, me fala por aqui o melhor dia e horário que eu reservo para você.`
        if (await sendTemplate(p.telefone, 'resgate_qualificada_v2', [pnome], preview)) { await marcar(p, 'resgate-qualificada'); await moverParaContato(p); qualificadas++ }
        else falhas++
      } else {
        // "Ainda não é o momento de investir": acolhe a pessoa (não o negócio), sem pressão.
        // A oferta é concreta: sessão de diagnóstico completo do posicionamento dela no
        // digital, com apontamentos e soluções — e a parceria fica pro futuro dela.
        const preview =
          `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
          `Vi que você concluiu o diagnóstico e sinalizou que ainda não é o momento de investir. ` +
          `Tudo bem, esse tempo é seu e a gente respeita.\n\n` +
          `Mesmo assim, quero te deixar um convite: uma sessão de diagnóstico completo com o Ronaldo, nosso estrategista, sem custo nenhum. ` +
          `Em 30 minutos ele analisa o seu posicionamento e o seu momento atual no digital, te aponta o que pode melhorar e as soluções pra cada ponto. ` +
          `Você sai com clareza do caminho, e quando o seu momento chegar, quem sabe não nasce uma parceria?\n\n` +
          `Se topar, a agenda está aqui: ${CALENDLY}`
        // Fallback: enquanto a Meta não aprova o resgate_ainda_nao_v3, vai o convite de agenda padrão
        const ok = await sendTemplate(p.telefone, 'resgate_ainda_nao_v3', [pnome], preview)
          || await sendTemplate(p.telefone, 'resgate_qualificada_v2', [pnome], preview)
        if (ok) { await marcar(p, 'resgate-ainda-nao'); await moverParaContato(p); aindaNao++ }
        else falhas++
      }
      continue
    }

    // 2. Desqualificada — rede de segurança do envio imediato do /api/lead (espera 3 min)
    if (/Status: Desqualificado/i.test(o)) {
      if (idadeMin < 3) continue
      if (await enviarResgateDesqualificada(p.telefone, pnome)) { await marcar(p, 'resgate-desqualificada'); await moverParaContato(p); desqualificadas++ }
      else falhas++
      continue
    }

    // 3. Abandonou o formulário — espera 10 min (a pessoa pode só ter trocado de aba)
    if (/ABANDONOU/i.test(o)) {
      if (idadeMin < 10) continue
      const preview =
        `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
        `Vi que você começou o nosso diagnóstico e não chegou a concluir. ` +
        `Se travou em alguma pergunta ou ficou com dúvida, me fala por aqui que eu te ajudo direto, sem precisar refazer nada.`
      if (await sendTemplate(p.telefone, 'resgate_abandono_v2', [pnome], preview)) { await marcar(p, 'resgate-abandono'); await moverParaContato(p); abandonos++ }
      else falhas++
    }
  }

  return res.status(200).json({
    ok: true, analisados: prospects.length,
    enviados: { qualificadas, aindaNao, desqualificadas, abandonos }, falhas,
  })
}
