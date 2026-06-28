# Análise do Funil /diagnostico — Experiência + Conversão
**Data:** 28/06/2026 · Fonte: Microsoft Clarity (projeto `xd8vv4mdgc`, últimos 3 dias) + auditoria heurística do `diagnostico.html` + dados do CRM.

> ⚠️ Janela curta (3 dias) e volume baixo. Os números são direcionais, não estatísticos. Mas os padrões são fortes e consistentes.

---

## TL;DR — o maior vazamento está ANTES do funil

A intuição era "a copy/experiência do funil está derrubando conversão". Os dados mostram outra coisa: **o leak dominante é no topo** — qualidade de tráfego e bounce instantâneo no mobile. Antes de otimizar etapa 5 ou 6, há dinheiro sendo queimado na entrada.

Três fatos:
1. **~50% do tráfego é bot/inválido** vindo dos anúncios Meta.
2. **88% é mobile**, e o mobile real engaja **~1–2 segundos** antes de sair.
3. Quem realmente entra no funil até converte — o problema é quase ninguém *entrar de verdade*.

---

## 1. Qualidade de tráfego (Clarity, 3 dias)

| Device / OS | Sessões reais | Sessões bot | Leitura |
|---|---:|---:|---|
| Mobile iOS | 22 | 13 | real, mas engajamento baixíssimo |
| Mobile Android | 22 | 11 | real, engajamento ~0 |
| **Mobile "Linux"** | **0** | **21** | **100% bot** (data center / crawler) |
| PC MacOSX | 4 | 0 | provavelmente você testando (1 user) |
| PC Windows | 2 | 0 | real |
| Other / Windows | 0 | 4 | bot |

- **Total bot ≈ 50 sessões** contra ~50 reais. Metade do que o anúncio paga é lixo.
- "Mobile Linux" não existe pra usuário real — são bots puros, provavelmente **Audience Network** do Meta.
- pagesPerSession ≈ 1.0–1.3 → a esmagadora maioria vê **uma tela e sai**.

### Engajamento por device (tempo ativo)
| Device | Tempo total | Tempo **ativo** | Por sessão |
|---|---:|---:|---:|
| Mobile Android | 12s | 6s | ~0,3s ativo |
| Mobile iOS | 159s | 26s | ~1,2s ativo |
| PC MacOSX | 487s | 27s | (você testando) |

**Conclusão:** o tráfego pago mobile (o grosso) entra e abandona em 1–2 segundos, sem nem interagir com a capa. Isso é bounce de topo, não abandono de etapa.

---

## 2. Fricção dentro da página (Clarity)

- **Dead clicks em ~50% das sessões diretas** (`subTotal` 4–5). Metade de quem fica clica em algo que **não responde**. Forte suspeita: usuários tentando **voltar uma etapa** (não existe botão de voltar) ou tocando no **rótulo/área errada** dos cards de escolha.
- **Rage clicks: 0 · Excessive scroll: 0 · Error clicks: 0** → não há frustração explícita nem travamento generalizado.
- **Script error: 1** (isolado, 1 sessão) → não é quebra sistêmica. Ok.
- **Scroll depth: 67–100%** → quem fica, percorre a tela. O conteúdo é consumido; o problema é volume de entrada.

---

## 3. O que isso significa, em ordem de impacto

### 🔴 Prioridade 1 — Tráfego (fora do código, é sua praia)
O ROI sobe mais mexendo aqui do que em qualquer palavra do funil.
- **Desligar Audience Network** nas campanhas Meta "Leads - Forms | Gineco-Obstetra" (placements manuais → só Feed/Reels/Stories). É a origem clássica dos bots "Mobile Linux".
- Conferir **objetivo da campanha**: se está como "Leads/Formulário" otimizando para clique barato, atrai junk. Para o site, otimizar por **conversão (Lead via CAPI)** que já está instalado.
- Avaliar **exclusão de tráfego inválido** e revisar segmentação (público amplo demais = clique acidental).

### 🟠 Prioridade 2 — Velocidade e primeira dobra mobile
Como o real é 88% mobile e bounce em ~1s, o tempo de carregamento e o "primeiro segundo" decidem tudo.
- Auditar **peso de carregamento mobile**: Phosphor Icons (CDN), `widget.js` do Calendly, Clarity, Meta Pixel — adiar o que não é crítico (Calendly só carrega na etapa 7, conferir se não está no `<head>`).
- Garantir que a **capa renderize < 1s** com o gancho visível sem scroll.

### 🟡 Prioridade 3 — UX do funil (código)
- **Adicionar botão "← Voltar"** em cada etapa. Provável causa dos dead clicks e de abandono de quem erra um campo e não consegue corrigir.
- **Card de escolha:** garantir que o **card inteiro** seja clicável (não só o texto), com área de toque ≥ 44px. Reduz dead click no mobile.
- **Reordenar a fricção:** WhatsApp na etapa 2 é cedo — pedir o dado mais sensível logo no começo derruba. Testar mover WhatsApp para **depois** do faturamento (a pessoa já investiu cliques, compromisso maior).
- **Etapa final (Calendly):** é o gargalo do lead qualificado — ele já mandou `completo`, mas agendar exige outra decisão. Testar: reforço de prova/escassez antes do calendário ("Vagas limitadas para diagnóstico gratuito esta semana") e fallback "Prefere que o Ronaldo te chame no WhatsApp?" para quem não agenda.

### 🟢 Prioridade 4 — Copy (ajustes finos)
- **Inconsistência de números:** a capa diz "investem a partir de **R$ 2.000/mês em anúncios**" e a etapa 6 diz "gestão se inicia em **R$ 1.500/mês**". São coisas diferentes (verba de anúncio × honorário), mas o lead pode se confundir. Alinhar a narrativa ou explicar a diferença numa linha.
- **Etapa 6, opção "Não":** "Não estou disposta a investir no meu negócio" é julgador. Trocar por algo neutro como **"Ainda não é o momento de investir"** — reduz atrito psicológico sem perder a qualificação.
- **Capa, nota de exclusividade:** "Exclusivo para médicas que investem a partir de R$ 2.000/mês" qualifica, mas também pré-desqualifica antes do engajamento. Testar movê-la para **depois** da primeira microconversão (ex: aparecer na etapa de faturamento) em vez de na capa.
- **Headline:** boa. Para teste A/B, uma variante mais específica do nicho: foco na dor real da médica (agenda dependente de indicação, sazonalidade) validada pelo método.

---

## 4. Sobre os dados do CRM
- Os leads do diagnóstico **caem no mesmo Supabase** do CRM (`ozxjjvtrlmeiveioblci`). ✅
- Há **muito lixo de teste** acumulado (vários "RONALDO DETONI COSTA JUNIOR" com telefones `fasfasf`, `3213123`, etc.) — limpar para não sujar análise futura.
- Com o fix de hoje, **abandonos agora ficam salvos** com a nota "ABANDONOU — abordar", então a partir de agora dá pra medir **drop-off por etapa** pelos campos preenchidos. Em ~1 semana teremos dado próprio de funil, melhor que o Clarity para isso.

---

## 5. Plano sugerido (impacto × esforço)

| # | Ação | Impacto | Esforço | Dono |
|---|---|:---:|:---:|---|
| 1 | Desligar Audience Network + revisar objetivo das campanhas Meta | 🔴 Alto | Baixo | Você (tráfego) |
| 2 | Auditar/deferir carregamento mobile (capa < 1s) | 🟠 Alto | Médio | Código |
| 3 | Botão "Voltar" + card 100% clicável | 🟡 Médio | Baixo | Código |
| 4 | Fallback "te chamo no WhatsApp" na etapa Calendly | 🟡 Médio | Baixo | Código |
| 5 | Ajustes de copy (etapa 6, consistência de números) | 🟢 Médio | Baixo | Código |
| 6 | Limpar lixo de teste no CRM | — | Baixo | Eu |
| 7 | Reordenar WhatsApp para depois do faturamento (teste A/B) | 🟡 Médio | Médio | Código |

**Recomendação:** começar pela #1 (maior alavanca, é tráfego) e #2 (mobile), porque sem corrigir o topo, qualquer ganho de copy fica diluído. As mudanças de código (#3, #4, #5) eu implemento rápido quando você der o ok.
