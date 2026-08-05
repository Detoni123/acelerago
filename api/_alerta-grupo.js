// Alerta de lead no grupo do WhatsApp via Evolution API (instância detoni-alertas,
// número de atendimento da Detoni). Complementa/substitui o Telegram.
//
// Env vars (Vercel do aceleraGO-site):
//   EVOLUTION_API_URL      ex: http://95.216.152.185:8080
//   EVOLUTION_ALERTAS_KEY  token da instância detoni-alertas
//   ALERTA_GRUPO_JID       JID do grupo, ex: 120363xxxxxxxxxx@g.us

const INSTANCIA = 'detoni-alertas'

// Converte a mensagem HTML do Telegram para o formato de texto do WhatsApp:
// <b>→*negrito*, <i>→_itálico_, <a href="url">rótulo</a>→"rótulo: url",
// e desfaz as entidades escapadas (&amp; &lt; &gt;).
export function htmlParaWhatsApp(html) {
  return html
    .replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2\n$1')
    .replace(/<\/?b>/g, '*')
    .replace(/<\/?i>/g, '_')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export async function enviarAlertaGrupo(texto) {
  const base = process.env.EVOLUTION_API_URL
  const key  = process.env.EVOLUTION_ALERTAS_KEY
  const jid  = process.env.ALERTA_GRUPO_JID
  if (!base || !key || !jid) {
    console.error('[alerta-grupo] EVOLUTION_API_URL/EVOLUTION_ALERTAS_KEY/ALERTA_GRUPO_JID ausentes — alerta não enviado')
    return false
  }

  try {
    const res = await fetch(`${base}/message/sendText/${INSTANCIA}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: jid, text: texto }),
    })
    if (!res.ok) {
      console.error(`[alerta-grupo] Evolution falhou: HTTP ${res.status} — ${await res.text()}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[alerta-grupo] Evolution erro:', e)
    return false
  }
}
