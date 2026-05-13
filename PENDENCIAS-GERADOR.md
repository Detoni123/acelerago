# Pendências — Gerador de Carrossel
**Arquivo:** `gerador-carrossel.html`
**Atualizado:** 2026-05-13

---

## ✅ TUDO IMPLEMENTADO

### Feature 1 — Controle do gradiente escuro da capa
- Edit 1: Canvas gradientStrength (commit `02f7713`)
- Edit 2: React preview gradientStrength ✅
- Edit 3: Slider "Gradiente" nos controles da capa ✅

### Feature 2 — Preview sticky enquanto edita controles
- Edit 4: `position:'sticky'` no wrapperStyle do SlideCard ✅

### Feature 3 — Controle de posição/zoom da imagem nos cards de conteúdo
- Edit 5: imgBlock com backgroundImage + zoom/offset ✅
- Edit 6: Canvas drawImg com zoom e offset ✅
- Edit 7: Sliders Zoom + Img↕ + Texto↕ para conteúdo ✅

### Feature 4 — Texto↕ (textOffsetY) nos cards de conteúdo
- Edit 8: Canvas textOffsetY no startYByVAlign ✅
- Edit 9: React preview textOffsetY nos 3 layouts (lateral, texto, inline) ✅

### Feature 5 — Cor separada para Título e Texto
- Edit 10: Grid 4 colunas com campo "Título" ✅
- Edit 10b: React preview titulo usa `titleColor||textColor` ✅
- Edit 10c: Canvas drawTitle usa `slide.titleColor || stc` ✅

### Feature 6 — Texto multicolor inline com sintaxe `{palavra}`
- Edit 11: Helpers `stripColors` e `renderColored` antes do SlideCard ✅
- Edit 11b: React preview usa `renderColored` em headline e titulo ✅
- Edit 11c: Canvas usa `stripColors` em wrapText (headline, titulo, texto) ✅
