// Story 90-1 — verificação PÓS-deploy (passo 5 do deploy.sh).
//
// Reusa `inspectDocument()` do gate pré-deploy de propósito: se a verificação
// pós-deploy aplicasse um critério próprio, o gate aprovaria uma coisa e a
// produção cobraria outra. A diferença é só a origem do HTML (URL em vez de
// arquivo) e o fato de não haver `<x-dc>`-fonte para comparar byte a byte.
//
// A regra que interessa (e que a story enuncia): o HTML de produção NÃO pode ter
// `{{ }}` cru FORA do `<x-dc>`. Dentro do `<x-dc>` sempre vai ter — é o
// template-fonte, e isso é correto.
//
// USO
//   node scripts/check-live.mjs https://trifold.eng.br

import fsp from 'node:fs/promises';
import path from 'node:path';
import { PAGES, SITE_ROOT } from './dc-site.mjs';
import { inspectDocument } from './check-dist.mjs';

const origin = (process.argv[2] || 'https://trifold.eng.br').replace(/\/+$/, '');
const problems = [];

/**
 * O que o build ACABOU de produzir. Sem isto a verificação pós-deploy tem um
 * buraco: se o deploy publicasse a pasta-fonte por engano (nenhuma página
 * pré-renderizada), toda página cairia em "fallback do AC5" — que é estado
 * legítimo — e a verificação aprovaria um deploy que não entregou nada.
 * Comparando com o relatório do build, "fallback" só é aceito onde o build
 * REALMENTE registrou fallback.
 */
const reportPath = path.join(SITE_ROOT, '.seo-metrics', 'build-report.json');
let expected = null;
try {
  const report = JSON.parse(await fsp.readFile(reportPath, 'utf8'));
  expected = new Map(report.pages.map((p) => [p.id, p.ok]));
  console.log(`  · comparando com o build de ${report.builtAt}`);
} catch {
  console.log('  ⚠ sem .seo-metrics/build-report.json — não é possível exigir quais páginas deveriam vir pré-renderizadas');
}

for (const p of PAGES) {
  const url = origin + p.route;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'trifold-deploy-check/90-1' } });
  } catch (err) {
    problems.push(`${url}: requisição falhou — ${err.message}`);
    continue;
  }
  if (!res.ok) {
    problems.push(`${url}: HTTP ${res.status}`);
    continue;
  }
  const html = await res.text();
  const r = inspectDocument({ html, label: url });
  for (const n of r.notes) console.log(`  · ${n}`);
  problems.push(...r.problems);

  if (r.fallback) {
    const shouldBePrerendered = expected?.get(p.id);
    if (shouldBePrerendered === true) {
      problems.push(`${url}: o build pré-renderizou esta página, mas produção está servindo o fonte SEM #dc-prerender — o deploy não publicou o dist/`);
    } else if (shouldBePrerendered === false) {
      console.log(`  ⚠ ${url}: em fallback do AC5, como o build registrou — página sem o ganho de SEO desta story`);
    } else {
      console.log(`  ⚠ ${url}: sem #dc-prerender e sem relatório de build para conferir`);
    }
  }
}

if (problems.length) {
  console.error('\n✖ VERIFICAÇÃO PÓS-DEPLOY REPROVOU:');
  for (const p of problems) console.error(`  ✖ ${p}`);
  process.exit(1);
}
console.log('✓ verificação pós-deploy aprovada');
