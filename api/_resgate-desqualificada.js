// Resgate da lead desqualificada por faturamento (assina Gabriel).
// Usado em dois pontos: envio IMEDIATO no /api/lead (assim que o formulário
// desqualifica) e rede de segurança no cron /api/resgates.
//
// Template preferido: resgate_desqualificada_v2 (copy nova, aprovada pelo Ronaldo
// em 11/07). Enquanto a Meta não aprovar o v2, cai no v1 antigo para a lead não
// ficar sem resposta. Quando o v2 estiver APPROVED, o fallback vira inofensivo.
import { sendTemplate } from './_whatsapp.js'

export const TEXTO_DESQUALIFICADA =
  'Oi, {nome}! Aqui é o Gabriel, da AceleraGO 😊\n\n' +
  'Analisei as suas respostas do diagnóstico. Pelo estágio atual do seu consultório, ' +
  'investir pesado em anúncio agora não é o que a gente indicaria, e te dizer isso com honestidade também faz parte.\n\n' +
  'Existe um caminho mais enxuto pra você chegar na sua próxima faixa de faturamento. ' +
  'Quer que eu te envie por aqui os primeiros passos que fariam diferença no seu caso?'

export async function enviarResgateDesqualificada(telefone, pnome) {
  const preview = TEXTO_DESQUALIFICADA.replace('{nome}', pnome || 'Doutora')
  const ok = await sendTemplate(telefone, 'resgate_desqualificada_v2', [pnome], preview)
  if (ok) return ok
  // v2 ainda não aprovado (ou rejeitado): usa a copy antiga em vez de não enviar nada
  const previewV1 =
    `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
    'Vi que você preencheu o nosso diagnóstico. Cada médica vive um momento diferente, e o seu importa para a gente.\n\n' +
    'Me conta um pouco do seu momento e do seu consultório? Assim conseguimos te dar um direcionamento honesto do que faz sentido agora, sem compromisso.'
  return sendTemplate(telefone, 'resgate_desqualificada', [pnome], previewV1)
}
