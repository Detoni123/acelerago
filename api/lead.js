export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { nome, telefone, instagram, site, faturamento, investimento, tipo } = req.body
  // tipo: 'completo' | 'desqualificado' | 'abandono'
  if (!['completo', 'desqualificado', 'abandono'].includes(tipo)) {
    return res.status(200).json({ ok: true }) // ignora requisições inválidas ou de versões antigas em cache
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
      '',
      whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
      `📅 [Ver agenda](https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go)`,
    ]
  }

  const msg = [header, '', ...linhas].filter(l => l !== null).join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    })
  } catch (_) {}

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
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'AceleraGO <noreply@acelerago.com.br>',
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
    } catch (_) {}
  }

  // CRM — insere apenas leads completos e desqualificados (têm pelo menos nome + telefone + faturamento)
  if (tipo === 'completo' || tipo === 'desqualificado') {
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

    if (SUPABASE_URL && SUPABASE_KEY) {
      const observacoes = [
        instagram    ? `Instagram: @${instagram}` : null,
        site         ? `Site: ${site}` : null,
        faturamento  ? `Faturamento: ${faturamento}` : null,
        investimento ? `Investimento: ${investimento}` : null,
        tipo === 'desqualificado' ? 'Status: Desqualificado (faturamento abaixo do mínimo)' : null,
        `Origem: Formulário /diagnostico`,
      ].filter(Boolean).join('\n')

      try {
        await fetch(`${SUPABASE_URL}/rest/v1/prospects`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({
            nome,
            telefone,
            especialidade: 'Médica / Saúde da Mulher',
            cidade:        'Não informado',
            origem_lead:   'Google',
            etapa:         'prospeccao',
            observacoes,
          }),
        })
      } catch (_) {}
    }
  }

  return res.status(200).json({ ok: true })
}
