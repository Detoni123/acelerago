# Sessão 25/06/2026 — Funil /diagnostico AceleraGO

## O que foi criado

### Arquivos novos
- `diagnostico.html` — funil multi-etapas de qualificação de leads
- `api/lead.js` — função Vercel para Telegram + CRM + email

### URL em produção
https://acelerago.com.br/diagnostico

---

## Fluxo do formulário

| Etapa | Conteúdo |
|---|---|
| 0 | Capa: "Sua agenda cheia com pacientes que já estão buscando por você" |
| 1 | Nome completo |
| 2 | WhatsApp |
| 3 | Instagram (@) |
| 4 | Site da clínica (opcional) |
| 5 | Faturamento (A–E) — "Até R$ 30.000" → desqualificado |
| 6 | Investimento — "Nossa gestão se inicia em R$ 1.500/mês" |
| 7 | Calendly inline (embed com nome+WhatsApp pré-preenchidos) |
| 8 | Tela desqualificado — botão WhatsApp direto |

---

## Lógica de captura (api/lead.js)

| tipo | Emoji | Quando dispara |
|---|---|---|
| `abandono` | ⚠️ | Saiu da página sem concluir (pagehide), exige step >= 3 |
| `desqualificado` | 🟡 | Selecionou "Até R$ 30.000" no faturamento |
| `completo` | 🟢 / 🔴 | Preencheu tudo (🟢 aceitou investimento, 🔴 não aceitou) |

Toda notificação inclui: nome, WhatsApp, Instagram, site, faturamento, investimento + link "Abordar no WhatsApp" (wa.me/55...).

---

## Integrações

### Telegram
- Bot token: `8795337334:AAHJdmh38lU70FRejj7y43D5jXP32bhsSlc`
- Chat ID: `1981945816`
- Variáveis no Vercel (projeto aceleraGO-site): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### Supabase (CRM — tabela `prospects`)
- `completo` → etapa `prospeccao`
- `desqualificado` → etapa `prospeccao` + observação "Status: Desqualificado (faturamento abaixo do mínimo)"
- `abandono` → NÃO entra no CRM
- Variáveis no Vercel: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`

### Calendly (inline embed)
- Link: https://calendly.com/ronaldo-detonimarketingdigital/reuniao-diagnostico-acelera-go
- Carregado dinamicamente na etapa 7
- Nome e WhatsApp pré-preenchidos via `?name=...&a1=...`

### Email (Resend — ainda não ativo)
- Adicionar `RESEND_API_KEY` nas env vars do Vercel para ativar
- Envia para detoniads@gmail.com

---

## Estética
- Header navy `#0d1928` com logo clicável
- Fundo cream `#f8f7f5`
- Cards brancos com sombra por etapa
- Barra de progresso teal `#00b5a9`
- Botões laranja `#f47530`
- 100% alinhado com `styles.css` do site principal

---

## Commits desta sessão
```
8f82925  fix: remove visibilitychange, exige step>=3 para abandono, valida tipo no API
db01d30  feat: embed Calendly inline na tela final do /diagnostico
91ab9c3  fix: desqualificado entra no CRM como prospeccao com nota na observacao
e6e172d  feat: reformula lógica de captura de leads no /diagnostico
5ac9f3f  feat: tela de desqualificação para faturamento até R$ 30k
7ceef4c  style: redesign /diagnostico com identidade visual do site
eef4cad  feat: funil de diagnóstico com captura de leads
```

---

## Próximos passos sugeridos

1. Testar fluxo completo em produção (preencher tudo → checar Telegram + CRM)
2. Verificar se Calendly embed está carregando corretamente no mobile
3. Ativar email adicionando `RESEND_API_KEY` no Vercel
4. Capturar UTMs da URL (`?utm_source=google&utm_campaign=...`) e enviar junto com o lead para saber de qual anúncio veio

---

## Para retomar na próxima sessão
Diga: **"diagnostico acelerago sessao 25 junho"**
