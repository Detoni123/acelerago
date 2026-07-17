// Resgate da lead desqualificada por faturamento (assina Gabriel).
// Usado em dois pontos: envio IMEDIATO no /api/lead (assim que o formulário
// desqualifica) e rede de segurança no cron /api/resgates.
//
// Template preferido: resgate_desqualificada_v3 (copy nova, aprovada em 17/07).
// Se a Meta não aceitar o v3, cai no v2 e depois no v1, para a lead nunca ficar
// sem resposta. NÃO menciona desqualificação/faturamento como argumento.
import { sendTemplate } from './_whatsapp.js'

export const TEXTO_DESQUALIFICADA =
  'Oi, {nome}! Aqui é o Gabriel, da AceleraGO 😊\n\n' +
  'Analisei suas respostas no diagnóstico e, pelo momento atual do seu consultório, ' +
  'não seria responsável indicar um investimento maior em anúncios agora.\n\n' +
  'Antes disso, existem alguns ajustes de base que podem fortalecer sua operação e preparar o próximo nível de crescimento.\n\n' +
  'Posso te enviar os primeiros passos por aqui?'

export async function enviarResgateDesqualificada(telefone, pnome) {
  const preview = TEXTO_DESQUALIFICADA.replace('{nome}', pnome || 'Doutora')
  const ok = await sendTemplate(telefone, 'resgate_desqualificada_v3', [pnome], preview)
  if (ok) return ok
  // v3 indisponível: cai no v2 (copy anterior) para a lead não ficar sem resposta
  const previewV2 =
    `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
    'Analisei as suas respostas do diagnóstico. Pelo estágio atual do seu consultório, ' +
    'investir pesado em anúncio agora não é o que a gente indicaria, e te dizer isso com honestidade também faz parte.\n\n' +
    'Existe um caminho mais enxuto pra você chegar na sua próxima faixa de faturamento. ' +
    'Quer que eu te envie por aqui os primeiros passos que fariam diferença no seu caso?'
  const ok2 = await sendTemplate(telefone, 'resgate_desqualificada_v2', [pnome], previewV2)
  if (ok2) return ok2
  const previewV1 =
    `Oi, ${pnome}! Aqui é o Gabriel, da AceleraGO 😊\n\n` +
    'Vi que você preencheu o nosso diagnóstico. Cada médica vive um momento diferente, e o seu importa para a gente.\n\n' +
    'Me conta um pouco do seu momento e do seu consultório? Assim conseguimos te dar um direcionamento honesto do que faz sentido agora, sem compromisso.'
  return sendTemplate(telefone, 'resgate_desqualificada', [pnome], previewV1)
}
