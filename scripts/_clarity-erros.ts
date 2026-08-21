// Sem dotenv de propósito: este repo é estático, não tem node_modules.
// Rodar com: export $(grep CLARITY_API_TOKEN .env.local | xargs) && npx tsx scripts/_clarity-erros.ts
const TOKEN = process.env.CLARITY_API_TOKEN!
const BASE = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'

async function call(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const r = await fetch(`${BASE}?${qs}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  const txt = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`)
  return JSON.parse(txt)
}

// Só o que interessa para caçar erro: contagem de script error e as dimensões
// que dizem ONDE ele acontece (URL, navegador, dispositivo, SO).
const INTERESSA = /error|rage|dead|quickback/i

function show(titulo: string, data: any) {
  const linhas: string[] = []
  for (const m of (Array.isArray(data) ? data : [])) {
    if (!INTERESSA.test(m.metricName)) continue
    for (const info of (m.information || [])) {
      const { sessionsCount, sessionsWithMetricPercentage, pagesViews, subTotal, ...rest } = info
      const dims = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ')
      linhas.push(`  ${m.metricName} | ${dims || '(total)'} | sessões:${sessionsCount ?? '-'} %:${sessionsWithMetricPercentage ?? '-'} subTotal:${subTotal ?? '-'}`)
    }
  }
  console.log(`\n### ${titulo}`)
  console.log(linhas.length ? linhas.join('\n') : '  (nada)')
}

async function main() {
  const dias = process.env.DIAS || '3'
  if (!TOKEN) throw new Error('CLARITY_API_TOKEN ausente')
  show(`GERAL ${dias}d`, await call({ numOfDays: dias }))
  for (const dim of ['Browser', 'Device', 'OS', 'URL']) {
    show(`POR ${dim} ${dias}d`, await call({ numOfDays: dias, dimension1: dim }))
  }
}
main().catch(e => { console.error('ERRO:', e.message || e); process.exit(1) })
