import crypto from 'crypto'

import { enviarResgateDesqualificada } from './_resgate-desqualificada.js'
import { volumeAnormal } from './_whatsapp.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { nome, telefone, instagram, site, faturamento, ja_investiu, especialidade, objetivo, desafio, tipo, eventId,
          fbc, fbp, userAgent,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body
  const utmLabel = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ') || null

  // Sinais extras de correspondência (sobem o match quality do CAPI)
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip'] || undefined
  const clientUa = userAgent || req.headers['user-agent'] || undefined

  // Helper Meta CAPI — dispara um evento server-side (funciona em iOS sem cookie).
  // eventId permite deduplicar com o pixel do navegador.
  async function fireMetaEvent(eventName, evId) {
    const META_TOKEN = process.env.META_ACCESS_TOKEN
    if (!META_TOKEN) return
    const sha256 = (val) => crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex')
    const phoneDigits = telefone ? telefone.replace(/\D/g, '') : null
    const phoneE164   = phoneDigits ? (phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`) : null
    const nomeParts   = nome ? nome.trim().split(/\s+/) : []
    const userData = {}
    if (phoneE164)    userData.ph = [sha256(phoneE164)]
    if (nomeParts[0]) userData.fn = [sha256(nomeParts[0])]
    if (nomeParts.length > 1) userData.ln = [sha256(nomeParts[nomeParts.length - 1])]
    // Sinais não-hasheados (melhoram o match): cookies Meta + IP + user-agent
    if (fbc)          userData.fbc = fbc
    if (fbp)          userData.fbp = fbp
    if (clientIp)     userData.client_ip_address = clientIp
    if (clientUa)     userData.client_user_agent = clientUa
    try {
      const meta = await fetch(`https://graph.facebook.com/v21.0/3236771719838015/events?access_token=${META_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{
            event_name:       eventName,
            ...(evId && { event_id: evId }),
            event_time:       Math.floor(Date.now() / 1000),
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
      if (!meta.ok) console.error(`[lead] Meta CAPI ${eventName} falhou: HTTP ${meta.status} — ${await meta.text()}`)
    } catch (e) { console.error(`[lead] Meta CAPI ${eventName} erro:`, e) }
  }

  // Evento de otimização (etapa 2 — deu o WhatsApp). InitiateCheckout porque o
  // objetivo Vendas não aceita 'Lead'. Só CAPI aqui (o navegador dispara o pixel);
  // NÃO notifica nem grava no CRM (é só o sinal de otimização, alto volume).
  if (tipo === 'contato') {
    await fireMetaEvent('InitiateCheckout', eventId)
    return res.status(200).json({ ok: true })
  }

  // Origem real derivada do utm_source (antes ficava fixo em 'Google' — atribuição errada)
  const origemLead = (() => {
    const s = (utm_source || '').toLowerCase()
    const m = (utm_medium || '').toLowerCase()
    if (/bio/.test(s) || /bio/.test(m))     return 'Bio IG'
    if (/meta|facebook|fb\b/.test(s))       return 'Meta Ads'
    if (/instagram|insta|^ig$/.test(s))     return m === 'social' ? 'Meta Ads' : 'Instagram'
    if (/google|gads|youtube|yt/.test(s))   return 'Google Ads'
    if (utm_source) return utm_source.charAt(0).toUpperCase() + utm_source.slice(1)
    return 'Diagnóstico'
  })()

  // tipo: 'completo' | 'desqualificado' | 'abandono'
  if (!['completo', 'desqualificado', 'abandono'].includes(tipo)) {
    return res.status(200).json({ ok: true }) // ignora requisições inválidas ou de versões antigas em cache
  }

  // Guard contra leads vazios — sem nome nem telefone não há o que abordar nem salvar.
  // Evita registros-lixo no CRM e notificações inúteis.
  if (!nome && !telefone) {
    return res.status(200).json({ ok: true, skipped: 'no data' })
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID

  const whatsappLink = telefone
    ? `https://wa.me/55${telefone.replace(/\D/g, '')}`
    : null

  // Telegram usa HTML (não Markdown legado): valores dinâmicos como o utm_medium
  // "paid_social" têm '_' que abre uma entidade itálico nunca fechada e faz o
  // Telegram DESCARTAR a mensagem inteira (todo lead vindo da Meta sumia). Em HTML
  // só é preciso escapar < > &; '_' e '*' viram texto literal.
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linha = (label, val) => val ? `${label} ${esc(val)}` : null

  // Rastreio detalhado: origem, campanha, conjunto e anúncio em linhas separadas
  const trackingLinhas = [
    linha('📊 <b>Origem:</b>',   [utm_source, utm_medium].filter(Boolean).join(' / ') || null),
    linha('📣 <b>Campanha:</b>', utm_campaign),
    linha('🎯 <b>Conjunto:</b>', utm_term),
    linha('🖼 <b>Anúncio:</b>',  utm_content),
  ]

  // Respostas do funil — vão em todos os alertas (objetivo, desafio, histórico)
  const funilLinhas = [
    linha('🎯 <b>Objetivo:</b>', objetivo),
    linha('🧩 <b>Desafio:</b>', desafio),
    linha('📊 <b>Já investiu antes:</b>', ja_investiu),
  ]

  let header, linhas

  if (tipo === 'abandono') {
    header = '⚠️ <b>Lead Abandonou — AceleraGO</b>\n<i>(não concluiu o formulário)</i>'
    linhas = [
      linha('👤 <b>Nome:</b>',       nome),
      linha('📱 <b>WhatsApp:</b>',   telefone),
      linha('📸 <b>Instagram:</b>',  instagram ? `<a href="https://instagram.com/${instagram}">@${instagram}</a>` : null),
      linha('🌐 <b>Site:</b>',       site),
      linha('💰 <b>Faturamento:</b>',faturamento),
      ...funilLinhas,
      ...trackingLinhas,
      '',
      whatsappLink ? `💬 <a href="${whatsappLink}">Abordar no WhatsApp</a>` : null,
    ]
  } else if (tipo === 'desqualificado') {
    header = '🟡 <b>Lead Desqualificado — AceleraGO</b>\n<i>(faturamento até R$ 15.000)</i>'
    linhas = [
      linha('👤 <b>Nome:</b>',       nome),
      linha('📱 <b>WhatsApp:</b>',   telefone),
      linha('📸 <b>Instagram:</b>',  instagram ? `<a href="https://instagram.com/${instagram}">@${instagram}</a>` : null),
      linha('🌐 <b>Site:</b>',       site),
      linha('💰 <b>Faturamento:</b>',faturamento),
      ...funilLinhas,
      ...trackingLinhas,
      '',
      whatsappLink ? `💬 <a href="${whatsappLink}">Abordar no WhatsApp</a>` : null,
    ]
  } else {
    // completo
    const qualificado = true // sem gate de preço no form: quem completa já passou pelo faturamento
    header = qualificado
      ? '🟢 <b>Lead QUALIFICADO — AceleraGO</b>\n<i>(terminou o formulário — confirme se agendou)</i>'
      : '🔴 <b>Lead Concluído — AceleraGO</b>\n<i>(não aceitou o investimento)</i>'
    linhas = [
      linha('👤 <b>Nome:</b>',        nome),
      linha('📱 <b>WhatsApp:</b>',    telefone),
      linha('📸 <b>Instagram:</b>',   instagram ? `<a href="https://instagram.com/${instagram}">@${instagram}</a>` : null),
      linha('💰 <b>Faturamento:</b>', faturamento),
      ...funilLinhas,
      ...trackingLinhas,
      '',
      whatsappLink ? `💬 <a href="${whatsappLink}">Abordar no WhatsApp</a>` : null,
      `📅 <a href="https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go">Ver agenda</a>`,
    ]
  }

  const msg = [header, '', ...linhas].filter(l => l !== null).join('\n')

  // Telegram para TODOS os tipos — inclusive 'completo'. Antes o completo só
  // notificava via agendamento do Calendly, então quem terminava o formulário e
  // não agendava se perdia. Quem agendar recebe a 2ª mensagem (com data/hora).
  {
    try {
      const tg = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' }),
      })
      if (!tg.ok) console.error(`[lead] Telegram falhou (${tipo}): HTTP ${tg.status} — ${await tg.text()}`)
    } catch (e) { console.error(`[lead] Telegram erro (${tipo}):`, e) }
  }

  // Email via Resend (adicione RESEND_API_KEY nas env vars do Vercel para ativar)
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (RESEND_API_KEY) {
    const subjects = {
      abandono:       `⚠️ Abandonou: ${nome || 'sem nome'}`,
      desqualificado: `🟡 Desqualificado: ${nome}`,
      completo:       `🟢 Lead: ${nome}`,
    }
    const rows = (pairs) => pairs.filter(([,v]) => v)
      .map(([l,v]) => `<tr><td style="padding:5px 16px 5px 0;font-weight:600">${l}</td><td>${v}</td></tr>`)
      .join('')

    try {
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'AceleraGO <noreply@mail.acelerago.com.br>',
          to: ['detoniads@gmail.com'],
          subject: subjects[tipo] || subjects.completo,
          html: `<h2 style="font-family:sans-serif">${subjects[tipo] || subjects.completo}</h2>
            <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">
              ${rows([
                ['Nome',        nome],
                ['WhatsApp',    telefone],
                ['Instagram',   instagram ? `<a href="https://instagram.com/${instagram}">@${instagram}</a>` : null],
                ['Site',        site],
                ['Faturamento', faturamento],
                ['Já investiu antes', ja_investiu],
              ])}
            </table>`,
        }),
      })
      if (!mail.ok) console.error(`[lead] Email falhou (${tipo}): HTTP ${mail.status} — ${await mail.text()}`)
    } catch (e) { console.error(`[lead] Email erro (${tipo}):`, e) }
  }

  // CRM — salva completo, desqualificado E abandono (com telefone), para que todo
  // lead que avançou no formulário fique resgatável mesmo se não concluir.
  // Dedup por telefone: se o lead voltar e avançar, atualiza o registro em vez de duplicar.
  if ((tipo === 'completo' || tipo === 'desqualificado' || tipo === 'abandono') && telefone) {
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

    if (SUPABASE_URL && SUPABASE_KEY) {
      const statusNota =
        tipo === 'desqualificado' ? 'Status: Desqualificado (faturamento abaixo do mínimo)'
        : tipo === 'abandono'     ? 'Status: ABANDONOU o formulário (dados parciais — abordar)'
        : null

      // Resgate IMEDIATO da desqualificada: a mensagem do Gabriel chega enquanto ela
      // ainda está na tela final do diagnóstico (decisão de 11/07: resposta na hora
      // sinaliza estrutura por trás). O marcador entra nas observações já no insert,
      // então o cron /api/resgates não duplica; se o envio falhar, fica sem marcador
      // e o cron reenvia em ~3 min como rede de segurança.
      let marcadorResgate = null
      let resgateEnviadoAgora = false
      if (tipo === 'desqualificado') {
        // Se ela refez o formulário e já foi resgatada antes, não envia de novo
        // (o PATCH de dedup abaixo sobrescreve as observações, então o marcador
        // antigo precisa ser checado e re-anexado aqui).
        let marcadorAntigo = null
        try {
          const chk = await fetch(
            `${SUPABASE_URL}/rest/v1/prospects?select=observacoes&telefone=eq.${encodeURIComponent(telefone)}`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
          )
          const rows = chk.ok ? await chk.json() : []
          marcadorAntigo = (rows[0]?.observacoes || '').match(/\[auto:resgate-desqualificada\][^\n]*/)?.[0] ?? null
        } catch (_) {}

        if (marcadorAntigo) {
          marcadorResgate = marcadorAntigo
        } else if (await volumeAnormal('prospects', 'created_at')) {
          // Disjuntor anti-abuso: sem envio agora; o cron retoma quando o volume normalizar
          console.error('[lead] volume anormal de prospects — envio imediato suspenso')
        } else {
          const pnome = nome ? String(nome).trim().split(/\s+/)[0] : ''
          const ok = await enviarResgateDesqualificada(telefone, pnome).catch(() => false)
          if (ok) {
            marcadorResgate = `[auto:resgate-desqualificada] ${new Date().toISOString()}`
            resgateEnviadoAgora = true
          }
        }
      }

      const observacoes = [
        especialidade ? `Especialidade: ${especialidade}` : null,
        objetivo     ? `Objetivo: ${objetivo}` : null,
        desafio      ? `Desafio: ${desafio}` : null,
        instagram    ? `Instagram: @${instagram}` : null,
        site         ? `Site: ${site}` : null,
        faturamento  ? `Faturamento: ${faturamento}` : null,
        ja_investiu ? `Já investiu antes: ${ja_investiu}` : null,
        statusNota,
        utmLabel ? `UTM: ${utmLabel}` : null,
        utm_term    ? `Conjunto: ${utm_term}` : null,
        utm_content ? `Anúncio: ${utm_content}` : null,
        `Origem: Formulário /diagnostico`,
        marcadorResgate,
      ].filter(Boolean).join('\n')

      const sbHeaders = {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }

      try {
        // Dedup por telefone — procura prospect já existente com este número
        const lookup = await fetch(
          `${SUPABASE_URL}/rest/v1/prospects?select=id&telefone=eq.${encodeURIComponent(telefone)}`,
          { headers: sbHeaders },
        )
        const existing = lookup.ok ? await lookup.json() : []

        if (existing.length > 0) {
          // Já existe — atualiza nome/observações (não duplica). Como 'completo'/'desqualificado'
          // só ocorrem depois do abandono na mesma sessão, isto enriquece o registro parcial.
          const patch = await fetch(`${SUPABASE_URL}/rest/v1/prospects?id=eq.${existing[0].id}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            // fbc/fbp/utm só entram quando chegam (não sobrescrevem valor já salvo com null)
            body: JSON.stringify({
              nome: nome || undefined, observacoes,
              ...(especialidade && { especialidade }),
              ...(fbc && { fbc }), ...(fbp && { fbp }),
              ...(utm_source   && { utm_source }),
              ...(utm_medium   && { utm_medium }),
              ...(utm_campaign && { utm_campaign }),
              ...(utm_content  && { utm_content }),
              ...(utm_term     && { utm_term }),
            }),
          })
          if (!patch.ok) console.error(`[lead] CRM PATCH falhou (${tipo}): HTTP ${patch.status} — ${await patch.text()}`)
        } else {
          const insert = await fetch(`${SUPABASE_URL}/rest/v1/prospects`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              nome,
              telefone,
              especialidade: especialidade || 'Médica / Saúde da Mulher',
              cidade:        'Não informado',
              origem_lead:   origemLead,
              etapa:         'prospeccao',
              observacoes,
              // Cookies Meta p/ conversão offline depois (reunião/fechado no CRM)
              ...(fbc && { fbc }),
              ...(fbp && { fbp }),
              // Rastreio de origem detalhado (campanha/conjunto/anúncio)
              ...(utm_source   && { utm_source }),
              ...(utm_medium   && { utm_medium }),
              ...(utm_campaign && { utm_campaign }),
              ...(utm_content  && { utm_content }),
              ...(utm_term     && { utm_term }),
            }),
          })
          if (!insert.ok) console.error(`[lead] CRM INSERT falhou (${tipo}): HTTP ${insert.status} — ${await insert.text()}`)
        }
      } catch (e) { console.error(`[lead] CRM erro (${tipo}):`, e) }

      // Robô acabou de fazer o primeiro toque → card sai de "prospecção" pra "contato"
      if (resgateEnviadoAgora) {
        await fetch(`${SUPABASE_URL}/rest/v1/prospects?telefone=eq.${encodeURIComponent(telefone)}&etapa=eq.prospeccao`, {
          method:  'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body:    JSON.stringify({ etapa: 'contato' }),
        }).catch(() => {})
      }
    }
  }

  // Meta CAPI — completou o formulário (qualificação). AddPaymentInfo (Vendas-nativo),
  // mais profundo que o InitiateCheckout da etapa 2; mede qualidade e serve para
  // otimizar mais fundo quando o volume escalar.
  if (tipo === 'completo') {
    await fireMetaEvent('AddPaymentInfo', eventId)
  }

  return res.status(200).json({ ok: true })
}
