# Sessão 25-26/06/2026 — Funil /diagnóstico AceleraGO
## Status: PRODUÇÃO ✅

---

## O que foi construído

### Arquivos criados/modificados
| Arquivo | Descrição |
|---|---|
| `diagnostico.html` | Funil multi-etapas de qualificação de leads |
| `api/lead.js` | Serverless: Telegram + Resend + Supabase + Meta CAPI (Lead) |
| `api/agendamento.js` | Serverless: Telegram + Meta CAPI (Schedule) + Calendly API |
| `package.json` | `{ "type": "module" }` — suporte ESM nas funções Vercel |
| `index.html` | Meta-tag de verificação de domínio adicionada no `<head>` |

### URL em produção
https://acelerago.com.br/diagnostico

---

## Fluxo completo do formulário

| Etapa | Conteúdo |
|---|---|
| 0 | Capa: "Mais pacientes qualificadas na sua clínica, sem depender de indicação" |
| 1 | Nome completo |
| 2 | WhatsApp |
| 3 | Instagram (@) |
| 4 | Site da clínica (opcional) |
| 5 | Faturamento (A–E) → "Até R$ 30.000" = desqualificado |
| 6 | Investimento — "Nossa gestão se inicia em R$ 1.500/mês" |
| 7 | Calendly inline embed (nome pré-preenchido) |
| 8 | Tela desqualificado — botão WhatsApp direto |

---

## Lógica de disparo por tipo de lead

| Tipo | Telegram | Meta CAPI | CRM Supabase | Email Resend |
|---|---|---|---|---|
| `abandono` | ⚠️ sim | não | não | não |
| `desqualificado` | 🟡 sim | não | sim (prospeccao + nota) | não |
| `completo` | NÃO (espera Calendly) | Lead (servidor) | sim (prospeccao) | sim |
| agendamento | 🟢/🔴 sim (com data/hora) | Schedule (servidor) | não | não |

### Mensagem Telegram após agendamento inclui:
- Nome, WhatsApp, Instagram, site, faturamento, investimento
- Data e hora da reunião (buscada na API do Calendly)
- Link direto "Abordar no WhatsApp"
- 🟢 = aceitou investimento | 🔴 = não aceitou mas agendou mesmo assim

---

## Meta Pixel + CAPI — Setup Completo

### Pixel ID: `3236771719838015`
### Domínio verificado: `acelerago.com.br` ✅

| Evento | Canal | Deduplicação |
|---|---|---|
| PageView | Navegador | — |
| Lead | Servidor (CAPI only) | — |
| Schedule/Programar | Navegador + Servidor | ✅ via `event_id` único |

### Como funciona a deduplicação do Programar:
1. Calendly confirma agendamento
2. Browser gera `eventId = 'sched_' + Date.now() + random`
3. Browser dispara `fbq('track', 'Schedule', {}, { eventID: eventId })`
4. Browser chama `/api/agendamento` com o mesmo `eventId`
5. Servidor envia CAPI com `event_id: eventId`
6. Meta deduplica automaticamente → conta como 1 conversão

### Conversão personalizada criada no Meta:
- Nome: **Reunião agendada**
- Evento: Programar (Schedule)
- URL: acelerago.com.br/diagnostico
- Status: ✅ ativa

### Campanha configurada com:
- Evento de conversão: **Programar** ✅
- Local: Site
- Conjunto de dados: Pixel — Acelera GO

---

## Variáveis de ambiente no Vercel (projeto `acelera-go-site`)

| Variável | Valor | Ambiente |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `8795337334:AAHJdmh38lU70FRejj7y43D5jXP32bhsSlc` | Preview + Production |
| `TELEGRAM_CHAT_ID` | `1981945816` | Preview + Production |
| `SUPABASE_URL` | `https://ozxjjvtrlmeiveioblci.supabase.co` | Preview + Production |
| `SUPABASE_SECRET_KEY` | (encrypted) | Preview + Production |
| `RESEND_API_KEY` | `re_EjvcNAqQ_Ak4KUCsAKjTAd23WqeUZmGkX` | Production |
| `META_ACCESS_TOKEN` | (encrypted — copiado do CRM) | Production |
| `CALENDLY_TOKEN` | (encrypted — PAT com :read escopos) | Production |

> ⚠️ `META_TEST_EVENT_CODE` foi **removido** após validação. Recriar com `printf "TEST15365" | vercel env add META_TEST_EVENT_CODE production` se precisar testar novamente.

---

## Integrações

### Telegram
- Bot: `8795337334:AAHJdmh38lU70FRejj7y43D5jXP32bhsSlc`
- Chat ID: `1981945816`

### Supabase CRM (tabela `prospects`)
- URL: `https://ozxjjvtrlmeiveioblci.supabase.co`
- Campos inseridos: nome, telefone, especialidade, cidade, origem_lead, etapa, observacoes

### Calendly
- Link: https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go
- Token PAT com escopos: `availability:read`, `event_types:read`, `locations:read`, `scheduled_events:read`, `routing_forms:read`
- Usado para buscar `start_time` do evento após confirmação

### Email (Resend)
- From: `noreply@acelerago.com.br`
- To: `detoniads@gmail.com`
- Dispara apenas para leads `completo`

### Meta Pixel + CAPI
- Pixel ID: `3236771719838015`
- Token: `META_ACCESS_TOKEN` (mesmo do CRM)
- Endpoint CAPI: `https://graph.facebook.com/v21.0/3236771719838015/events`

---

## Estética da página

- Header navy `#0d1928` com logo `acelerafundotransp.png` clicável
- Fundo cream `#f8f7f5`
- Cards brancos com sombra por etapa
- Barra de progresso teal `#00b5a9` (fixed top)
- Botões laranja `#f47530`
- Bullets com ícones **Phosphor Icons** em quadrado teal (34×34px)
- Ícones: `ph-chart-line-up`, `ph-magnifying-glass`, `ph-google-logo`, `ph-seal-check`

---

## Commits desta sessão (ordem cronológica)
```
eef4cad  feat: funil de diagnóstico com captura de leads
7ceef4c  style: redesign /diagnostico com identidade visual do site
5ac9f3f  feat: tela de desqualificação para faturamento até R$ 30k
e6e172d  feat: reformula lógica de captura de leads no /diagnostico
91ab9c3  fix: desqualificado entra no CRM como prospeccao com nota na observacao
db01d30  feat: embed Calendly inline na tela final do /diagnostico
8f82925  fix: remove visibilitychange, exige step>=3 para abandono, valida tipo no API
a11aaf4  copy: atualiza headlines, bullets e qualificação financeira no /diagnostico
31c5744  copy: simplifica subline removendo parêntese explicativo
f1cba87  copy: troca mídia por anúncios na subline
d6306d9  style: substitui emojis por Phosphor Icons nos bullets da capa
80d52e3  fix: remove prefill incorreto do WhatsApp no embed do Calendly
8b45dba  copy: remove parêntese explicativo da etapa 6
9e61507  fix: corrige logo do header para acelerafundotransp.png
8e6338c  feat: adiciona meta-tag de verificação de domínio do Meta
2da4c6b  feat: instala Meta Pixel e dispara conversão Schedule no agendamento do Calendly
cee0a7d  feat: adiciona Meta CAPI para evento Lead server-side no /diagnostico
053c41b  fix: inclui test_event_code no CAPI para aparecer no painel de teste do Meta
4c0f96e  feat: notificação Telegram com data/hora do agendamento via API do Calendly
586a13d  feat: consolida notificação Telegram em uma única mensagem após agendamento
b231efb  fix: troca crypto.subtle por crypto nativo do Node.js no CAPI
edfd53b  feat: adiciona Schedule via CAPI no servidor para rastreamento iOS
23c9086  fix: adiciona package.json com type module para suporte ESM nas funções Vercel
e0b1ab1  fix: adiciona event_id para deduplicação do Programar entre Pixel e CAPI
```

---

## ✅ O que está 100% funcionando

- [x] Funil 8 etapas com qualificação de leads
- [x] Lógica de abandono / desqualificado / completo
- [x] Telegram com mensagem única após agendamento (nome, WhatsApp, Instagram, site, faturamento, investimento, data/hora)
- [x] Email via Resend para leads completos
- [x] CRM Supabase para leads completos e desqualificados
- [x] Meta Pixel (PageView, Lead, Schedule)
- [x] Meta CAPI server-side (Lead via /api/lead, Schedule via /api/agendamento)
- [x] Deduplicação via event_id no Schedule
- [x] Domínio acelerago.com.br verificado no Meta
- [x] Conversão personalizada "Reunião agendada" criada no Meta
- [x] Campanha configurada com evento Programar como meta de conversão

---

## 🔜 Pendências para próxima sessão

### 1. Conectar CRM ao Meta (Offline Conversions) — PRIORITÁRIO
**O que é:** enviar evento offline ao Meta quando um lead vira cliente no Supabase CRM. Isso fecha o loop de atribuição — Meta saberá quais anúncios geraram clientes reais, não só agendamentos.

**O que precisar fazer:**
1. No Meta → Gerenciador de Eventos → "Configurar no Gerenciador de Eventos" (botão que apareceu na campanha)
2. Criar um dataset offline no Meta
3. No projeto `acelerago-crm`: adicionar chamada CAPI quando prospect muda de etapa para "cliente"
4. Campos a enviar: telefone hasheado, nome hasheado, email hasheado (se tiver)

**Infraestrutura já disponível:**
- `META_ACCESS_TOKEN` no Vercel do CRM
- Supabase webhook ou trigger na tabela `prospects`
- Pixel ID: `3236771719838015`

### 2. Capturar UTMs da URL
**O que é:** capturar `?utm_source=google&utm_campaign=...` da URL e enviar junto com o lead para o Telegram/CRM, sabendo de qual anúncio veio cada lead.

**Como implementar:**
```javascript
// No diagnostico.html, no início do script:
const utmParams = {}
new URLSearchParams(window.location.search).forEach((v, k) => {
  if (k.startsWith('utm_')) utmParams[k] = v
})
// Incluir utmParams no payload do /api/lead e /api/agendamento
```

### 3. Medição Agregada de Eventos (AEM)
Ainda não configurada. Necessária para liberar o Schedule como meta oficial de campanha no Meta (atualmente só disponível via conversão personalizada).

---

## Para retomar na próxima sessão
Diga: **"diagnostico acelerago sessao 25 junho"**
