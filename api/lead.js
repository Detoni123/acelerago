export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { nome, telefone, instagram, site, faturamento, investimento, parcial } = req.body

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID

  const qualificado = investimento && investimento.startsWith('Sim')

  const whatsappLink = telefone
    ? `https://wa.me/55${telefone.replace(/\D/g,'')}`
    : null

  let msg
  if (parcial) {
    msg = [
      '⚠️ *Lead Parcial — AceleraGO*',
      '_(preencheu o formulário mas não concluiu)_',
      '',
      `👤 *Nome:* ${nome}`,
      `📱 *WhatsApp:* ${telefone}`,
      instagram ? `📸 *Instagram:* @${instagram}` : null,
      '',
      whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
    ].filter(l => l !== null).join('\n')
  } else {
    msg = [
      qualificado ? '🟢 *Lead QUALIFICADO — AceleraGO*' : '🔴 *Novo Lead — AceleraGO*',
      '',
      `👤 *Nome:* ${nome}`,
      `📱 *WhatsApp:* ${telefone}`,
      `📸 *Instagram:* @${instagram}`,
      `🌐 *Site:* ${site || 'Não informado'}`,
      `💰 *Faturamento:* ${faturamento}`,
      `✅ *Investimento:* ${investimento}`,
      '',
      whatsappLink ? `💬 [Abordar no WhatsApp](${whatsappLink})` : null,
      `📅 [Ver agenda](https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go)`,
    ].filter(l => l !== null).join('\n')
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'Markdown',
      }),
    })
  } catch (_) {}

  // Email via Resend (adicione RESEND_API_KEY nas env vars do Vercel para ativar)
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'AceleraGO <noreply@acelerago.com.br>',
          to: ['detoniads@gmail.com'],
          subject: parcial ? `⚠️ Lead Parcial: ${nome}` : `${qualificado ? '🟢' : '🔴'} Novo Lead: ${nome}`,
          html: parcial ? `
            <h2 style="font-family:sans-serif">Lead Parcial — não concluiu o formulário</h2>
            <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">Nome</td><td>${nome}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">WhatsApp</td><td>${telefone}</td></tr>
              ${instagram ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600">Instagram</td><td>@${instagram}</td></tr>` : ''}
            </table>
          ` : `
            <h2 style="font-family:sans-serif">Novo Lead — Diagnóstico AceleraGO</h2>
            <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">Nome</td><td>${nome}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">WhatsApp</td><td>${telefone}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">Instagram</td><td>@${instagram}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">Site</td><td>${site || 'Não informado'}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">Faturamento</td><td>${faturamento}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;font-weight:600">Investimento</td><td>${investimento}</td></tr>
            </table>
          `,
        }),
      })
    } catch (_) {}
  }

  // CRM — insere na tabela prospects apenas quando o formulário for concluído
  if (!parcial) {
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

    if (SUPABASE_URL && SUPABASE_KEY) {
      const observacoes = [
        instagram ? `Instagram: @${instagram}` : null,
        site      ? `Site: ${site}` : null,
        faturamento ? `Faturamento: ${faturamento}` : null,
        investimento ? `Investimento: ${investimento}` : null,
        `Origem: Formulário /diagnostico`,
      ].filter(Boolean).join('\n')

      try {
        await fetch(`${SUPABASE_URL}/rest/v1/prospects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            nome,
            telefone,
            especialidade: 'Médica / Saúde da Mulher',
            cidade: 'Não informado',
            origem_lead: 'Google',
            etapa: 'prospeccao',
            observacoes,
          }),
        })
      } catch (_) {}
    }
  }

  return res.status(200).json({ ok: true })
}
