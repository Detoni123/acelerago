import crypto from 'crypto'

import { sendTemplate, volumeAnormal } from './_whatsapp.js'
import { enviarAlertaGrupo, htmlParaWhatsApp } from './_alerta-grupo.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { inicio, eventId, origem, nome, telefone, email, instagram, site, faturamento, investimento, especialidade,
          fbc, fbp, userAgent,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body
  const utmLabel = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ') || null
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID

  // ── Marca a reunião de verdade (agenda própria, ex-Calendly) ──────────────
  // O CRM confere a agenda do Google no instante do pedido, cria a sala do Zoom,
  // põe o evento na agenda do Ronaldo (aparece no iPhone na hora), grava em
  // `agendamentos` — que é o que faz o lembrete de 2h existir — e manda o email
  // de confirmação com a cara da AceleraGO.
  //
  // A falha continua aparecendo no alerta, nunca some num catch vazio: sem a
  // reunião marcada, o alerta diria que alguém agendou quando ninguém agendou.
  const CRM = process.env.CRM_URL || 'https://crm.acelerago.com.br'
  const AGENDA_SECRET = process.env.AGENDA_SECRET

  let dataHora = null
  let linkZoom = null
  let emailEnviado = false
  let falhaAgenda = null

  if (!AGENDA_SECRET) falhaAgenda = 'AGENDA_SECRET ausente no ambiente'
  else if (!inicio)   falhaAgenda = 'a tela não enviou o horário escolhido'

  if (AGENDA_SECRET && inicio) {
    try {
      const resp = await fetch(`${CRM}/api/agenda/marcar`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-agenda-secret': AGENDA_SECRET },
        body: JSON.stringify({
          inicio, frente: 'acelerago', nome, telefone, email,
          observacoes: [
            especialidade ? `Especialidade: ${especialidade}` : null,
            instagram     ? `Instagram: @${instagram}` : null,
            site          ? `Site: ${site}` : null,
            faturamento   ? `Faturamento: ${faturamento}` : null,
            investimento  ? `Já investiu: ${investimento}` : null,
            utmLabel      ? `Origem: ${utmLabel}` : null,
          ].filter(Boolean).join('\n'),
        }),
      })
      const json = await resp.json()
      // Corrida: alguém pegou o horário entre a tela carregar e o clique. A tela
      // trata 409 recarregando a lista; sair cedo evita alertar reunião fantasma.
      if (resp.status === 409) return res.status(409).json({ ok: false, error: 'horario_ocupado' })
      if (!resp.ok || !json.ok) {
        falhaAgenda = `CRM respondeu HTTP ${resp.status}: ${json?.error ?? ''}`
      } else {
        dataHora     = json.quando
        linkZoom     = json.linkZoom ?? null
        emailEnviado = Boolean(json.emailEnviado)
        if (json.zoomFalhou) console.error('[agendamento] reunião marcada SEM sala do Zoom')
      }
    } catch (e) {
      falhaAgenda = `erro ao falar com o CRM: ${e?.message ?? e}`
    }
  }

  if (falhaAgenda) console.error(`[agendamento] reunião NÃO marcada — ${falhaAgenda}`)

  // Página avulsa (/agendar): o Ronaldo mandou o link direto, não houve clique
  // em anúncio. Contar CompleteRegistration aqui inflaria a conversão da campanha
  // com um agendamento que a mídia não trouxe.
  const linkDireto = origem === 'link-direto'

  // Meta CAPI — evento CompleteRegistration via servidor (garante rastreamento no iOS)
  const META_TOKEN = process.env.META_ACCESS_TOKEN
  if (META_TOKEN && !linkDireto) {
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
    const pnome  = nome ? nome.trim().replace(/^(dr|dra|doutor|doutora)\.?\s+/i, '').split(/\s+/)[0] : 'Doutora'
    const quando = dataHora || 'em breve'
    // Previews gravados no inbox do CRM — manter em sincronia com os templates na Meta.
    // v6 = copy final aprovada pelo Ronaldo em 11/07 (valor da sessão, sem citar o
    // Ronaldo; o "te enviarei por aqui também" é honrado pelo lembrete 2h com o Zoom).
    const previewV6 =
      `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
      `Sua sessão de diagnóstico está confirmada para ${quando}, e ela será preparada especialmente pra você.\n\n` +
      `Reserve esses 30 minutos com atenção: o nosso estrategista vai te mostrar, ponto por ponto, o que está te impedindo de atrair mais pacientes e o que fazer em cada frente. ` +
      `É o tipo de clareza que economiza meses de tentativa e erro.\n\n` +
      `O convite com o link da chamada chegará no seu e-mail e eu te enviarei por aqui também para facilitar. ` +
      `Posso confirmar a sua presença? Aperte no botão abaixo para confirmar.`
    const previewV3 =
      `Oi, ${pnome}! Sua reunião de diagnóstico com o Ronaldo, da AceleraGO, está confirmada para ${quando}.\n\n` +
      `O link da chamada chega no seu e-mail. Podemos contar com você?`
    const ok = await sendTemplate(telefone, 'confirmacao_reuniao_v6', [pnome, quando], previewV6)
      || await sendTemplate(telefone, 'confirmacao_reuniao_v3', [pnome, quando], previewV3)
      || await sendTemplate(telefone, 'confirmacao_reuniao_v2', [pnome, quando], previewV3)
    if (!ok) console.error('[agendamento] WhatsApp follow-up falhou (Cloud API)')
  }

  // ── Kanban acompanha o funil ────────────────────────────────────────────
  // A linha em `agendamentos` (e com ela o lembrete de 2h) já foi gravada pelo
  // CRM em /api/agenda/marcar — não repetir aqui, senão vira reunião duplicada.
  // O que falta é mover o card do prospect, que continua sendo por telefone.
  const SB_URL = process.env.SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SECRET_KEY
  if (SB_URL && SB_KEY && telefone && dataHora) {
    const telDigits = telefone.replace(/\D/g, '')
    const telE164   = telDigits.startsWith('55') && telDigits.length >= 12 ? telDigits : `55${telDigits}`
    try {
      // Lead agendou → card vai pra "reuniao"
      // (match pelos últimos 8 dígitos; não regride card já em proposta/fechado).
      //
      // O ilike de 8 dígitos SEGUIDOS nunca casava: o cadastro guarda o telefone
      // formatado, "(11) 94469-0933", e o hífen no meio parte a sequência. O
      // ilike agora só estreita candidatos pelos 4 últimos dígitos; a igualdade
      // real é decidida em JS, sobre os dígitos limpos. Mesma correção aplicada
      // no detoni-funil, que tem este arquivo duplicado.
      const last8 = telDigits.slice(-8)
      const sbHeaders = {
        'Content-Type': 'application/json',
        apikey:         SB_KEY,
        Authorization:  `Bearer ${SB_KEY}`,
      }
      if (last8.length === 8) {
        try {
          const busca = await fetch(
            `${SB_URL}/rest/v1/prospects?select=id,telefone&telefone=ilike.${encodeURIComponent('%' + telDigits.slice(-4) + '%')}&etapa=in.(prospeccao,contato)&limit=25`,
            { headers: sbHeaders },
          )
          const candidatos = busca.ok ? await busca.json() : []
          const alvos = candidatos.filter(
            p => String(p.telefone ?? '').replace(/\D/g, '').slice(-8) === last8,
          )
          for (const p of alvos) {
            await fetch(`${SB_URL}/rest/v1/prospects?id=eq.${p.id}`, {
              method:  'PATCH',
              headers: { ...sbHeaders, Prefer: 'return=minimal' },
              body:    JSON.stringify({ etapa: 'reuniao' }),
            }).catch(() => {})
          }
          if (!alvos.length) {
            // No funil o prospect já nasceu no /api/lead; aqui não passou por
            // lá, então sem isto a pessoa teria reunião marcada e nenhum card
            // no Kanban — exatamente o buraco que obrigava a lançar na mão.
            if (linkDireto) {
              const criado = await fetch(`${SB_URL}/rest/v1/prospects`, {
                method:  'POST',
                headers: { ...sbHeaders, Prefer: 'return=minimal' },
                body: JSON.stringify({
                  nome:        nome || null,
                  telefone:    telefone || telE164,
                  etapa:       'reuniao',
                  // `source` tem CHECK fixo no banco (google|meta|whatsapp|
                  // indicacao|manual|outro). O rótulo exato vive em
                  // origem_lead, que é por onde se filtra este caso.
                  source:      'manual',
                  frente:      'acelerago',
                  origem_lead: 'Link de agendamento enviado direto',
                  observacoes: [
                    'Agendou pela página /agendar (link enviado direto).',
                    email ? `E-mail: ${email}` : null,
                  ].filter(Boolean).join('\n'),
                }),
              })
              if (!criado.ok) console.error(`[agendamento] criar prospect falhou: HTTP ${criado.status} — ${await criado.text()}`)
            } else {
              console.error(`[agendamento] Kanban: nenhum prospect casou com ${telE164}`)
            }
          }
        } catch (e) { console.error('[agendamento] Kanban erro:', e) }
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
    linha('📸 <b>Instagram:</b>',   instagram ? `<a href="https://instagram.com/${instagram}">@${instagram}</a>` : null),
    linha('🌐 <b>Site:</b>',        site || 'Não informado'),
    linha('💰 <b>Faturamento:</b>', faturamento),
    linha('✅ <b>Investimento:</b>', investimento),
    linha('📊 <b>Origem:</b>',      linkDireto ? 'Link de agendamento enviado direto' : utmLabel),
    linha('🗓 <b>Reunião:</b>',     dataHora),
    linha('🎥 <b>Zoom:</b>', linkZoom),
    dataHora && !emailEnviado && email
      ? '⚠️ O email de confirmação NÃO saiu — mandar o link no WhatsApp.'
      : null,
    falhaAgenda
      ? `⚠️ <b>REUNIÃO NÃO MARCADA</b> — ${falhaAgenda}.\nNada foi para a agenda e o lembrete de 2h não vai disparar. Falar com a lead AGORA.`
      : null,
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

  // Grupo do WhatsApp — mesmo alerta do Telegram (agendamento é o evento que mais
  // importa do funil; ficar só no Telegram foi esquecimento da migração de 04/08).
  await enviarAlertaGrupo(htmlParaWhatsApp(msg))

  // A tela precisa da resposta real: se a reunião não foi marcada, ela mostra o
  // caminho do WhatsApp em vez de um "está confirmado" que seria mentira.
  if (falhaAgenda) return res.status(502).json({ ok: false, error: falhaAgenda })

  return res.status(200).json({ ok: true, quando: dataHora, linkZoom, emailEnviado })
}
