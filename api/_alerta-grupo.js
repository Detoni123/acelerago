// Alerta interno de lead e agendamento dos funis.

// Converte a mensagem HTML do Telegram para o formato de texto do WhatsApp:
// <b>→*negrito*, <i>→_itálico_, <a href="url">rótulo</a>→"rótulo: url",
// e desfaz as entidades escapadas (&amp; &lt; &gt;).
export function htmlParaWhatsApp(html) {
  // ORDEM IMPORTA: desescapar ANTES de converter as tags. O lead.js passa cada
  // valor por esc(), então um link montado com dado do formulário (o Instagram)
  // chega como &lt;a href=...&gt; e NÃO casava com a regex da âncora — o HTML
  // aparecia cru na mensagem. Corrigido em 06/08/2026.
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2\n$1')
    .replace(/<\/?b>/g, '*')
    .replace(/<\/?i>/g, '_')
    .replace(/&amp;/g, '&')
}

// Desde 05/10/2026 o alerta vai pela API oficial (modelo `alerta_sistema`, número
// da AceleraGO) para o WhatsApp pessoal do Ronaldo. O grupo era postado pela
// Evolution (`detoni-alertas`), que caiu em 28/09 e levou os alertas junto, em
// silêncio; o número da Detoni foi para a API oficial e API oficial não posta em
// grupo. O nome da função ficou para não mexer nos chamadores.
// Remetente: número da Detoni (Helena); o da AceleraGO é a reserva.
// Env: WHATSAPP_CLOUD_TOKEN (usuário de sistema, enxerga os dois números) e,
// opcional, WHATSAPP_PHONE_NUMBER_ID (o da AceleraGO, para a reserva).
const PESSOAL = '5511933329408'
const DETONI = '109098998909044'

export async function enviarAlertaGrupo(texto) {
  for (const numero of [DETONI, process.env.WHATSAPP_PHONE_NUMBER_ID]) {
    if (numero && (await enviarModelo(numero, texto))) return true
  }
  return false
}

async function enviarModelo(numero, texto) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN
  if (!token) {
    console.error('[alerta] WHATSAPP_CLOUD_TOKEN ausente — alerta não enviado')
    return false
  }
  // Variável de modelo não aceita quebra de linha nem 4+ espaços seguidos.
  const plano = texto.replace(/[*_`]/g, '').replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').replace(/[.\s·]+$/, '').slice(0, 900)
  try {
    const res = await fetch(`https://graph.facebook.com/v23.0/${numero}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: PESSOAL, type: 'template',
        template: { name: 'alerta_sistema', language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: plano }] }] },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`[alerta] API oficial falhou (${numero}): HTTP ${res.status} — ${await res.text()}`)
      return false
    }
    return true
  } catch (e) {
    console.error('[alerta] API oficial erro:', e)
    return false
  }
}
