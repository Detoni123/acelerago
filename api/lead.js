import crypto from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { nome, telefone, instagram, site, faturamento, investimento, tipo,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body
  const utmLabel = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ') || null

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

  const linha = (label, val) => val ? `${label} ${val}` : null

  let header, linhas

  if (tipo === 'abandono') {
    header = '⚠️ *Lead Abandonou — AceleraGO*\n_(não concluiu o formulário)_'
    linhas = [
      linha('👤 *Nome:*',       nome),
      linha('📱 *WhatsApp:*',   telefone),
      linha('📸 *Instagram:*',  instagram ? `@${instagram}` : null),
      linha('🌐 *Site:*',       site),
      linha('💰 *Faturamento:*',faturamento),
      linha('📊 *Origem:*',     utmLabel),
      '',
      whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
    ]
  } else if (tipo === 'desqualificado') {
    header = '🟡 *Lead Desqualificado — AceleraGO*\n_(faturamento até R$ 30.000)_'
    linhas = [
      linha('👤 *Nome:*',       nome),
      linha('📱 *WhatsApp:*',   telefone),
      linha('📸 *Instagram:*',  instagram ? `@${instagram}` : null),
      linha('🌐 *Site:*',       site),
      linha('💰 *Faturamento:*',faturamento),
      linha('📊 *Origem:*',     utmLabel),
      '',
      whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
    ]
  } else {
    // completo
    const qualificado = investimento && investimento.startsWith('Sim')
    header = qualificado
      ? '🟢 *Lead QUALIFICADO — AceleraGO*'
      : '🔴 *Lead Concluído — AceleraGO*\n_(não aceitou o investimento)_'
    linhas = [
      linha('👤 *Nome:*',        nome),
      linha('📱 *WhatsApp:*',    telefone),
      linha('📸 *Instagram:*',   instagram ? `@${instagram}` : null),
      linha('🌐 *Site:*',        site || 'Não informado'),
      linha('💰 *Faturamento:*', faturamento),
      linha('✅ *Investimento:*', investimento),
      linha('📊 *Origem:*',      utmLabel),
      '',
      whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
      `📅 [Ver agenda](https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go)`,
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
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
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
      completo:       `${investimento?.startsWith('Sim') ? '🟢' : '🔴'} Lead: ${nome}`,
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
                ['Instagram',   instagram ? `@${instagram}` : null],
                ['Site',        site],
                ['Faturamento', faturamento],
                ['Investimento',investimento],
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

      const observacoes = [
        instagram    ? `Instagram: @${instagram}` : null,
        site         ? `Site: ${site}` : null,
        faturamento  ? `Faturamento: ${faturamento}` : null,
        investimento ? `Investimento: ${investimento}` : null,
        statusNota,
        utmLabel ? `UTM: ${utmLabel}` : null,
        `Origem: Formulário /diagnostico`,
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
            body: JSON.stringify({ nome: nome || undefined, observacoes }),
          })
          if (!patch.ok) console.error(`[lead] CRM PATCH falhou (${tipo}): HTTP ${patch.status} — ${await patch.text()}`)
        } else {
          const insert = await fetch(`${SUPABASE_URL}/rest/v1/prospects`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              nome,
              telefone,
              especialidade: 'Médica / Saúde da Mulher',
              cidade:        'Não informado',
              origem_lead:   origemLead,
              etapa:         'prospeccao',
              observacoes,
            }),
          })
          if (!insert.ok) console.error(`[lead] CRM INSERT falhou (${tipo}): HTTP ${insert.status} — ${await insert.text()}`)
        }
      } catch (e) { console.error(`[lead] CRM erro (${tipo}):`, e) }
    }
  }

  // Meta CAPI — evento Lead via servidor (funciona em iOS sem depender de cookie)
  if (tipo === 'completo') {
    const META_TOKEN = process.env.META_ACCESS_TOKEN
    if (META_TOKEN) {
      const sha256 = (val) => crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex')

      const phoneDigits = telefone ? telefone.replace(/\D/g, '') : null
      const phoneE164   = phoneDigits ? (phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`) : null
      const nomeParts   = nome ? nome.trim().split(/\s+/) : []

      const userData = {}
      if (phoneE164)    userData.ph = [sha256(phoneE164)]
      if (nomeParts[0]) userData.fn = [sha256(nomeParts[0])]
      if (nomeParts.length > 1) userData.ln = [sha256(nomeParts[nomeParts.length - 1])]

      try {
        const meta = await fetch(`https://graph.facebook.com/v21.0/3236771719838015/events?access_token=${META_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              event_name:       'Lead',
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
        if (!meta.ok) console.error(`[lead] Meta CAPI falhou: HTTP ${meta.status} — ${await meta.text()}`)
      } catch (e) { console.error('[lead] Meta CAPI erro:', e) }
    }
  }

  return res.status(200).json({ ok: true })
}
