// Story 90-1 — comparação baseline × depois (AC2) e tabela de CLS (AC6b).
//
// O diff de screenshot é feito DENTRO do Chromium que o Playwright já sobe:
// as duas PNGs são decodificadas em `<canvas>` e comparadas pixel a pixel. É
// deliberado não trazer `pixelmatch`/`pngjs`/`sharp` para o projeto — este é um
// site estático sem bundler e sem `package.json` de dependências (ver README), e
// a story não aprova dependência nova.
//
// USO
//   node scripts/compare-metrics.mjs .seo-metrics/baseline .seo-metrics/after

import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

/** Tolerância por canal: abaixo disso é ruído de antialiasing/compressão. */
const CHANNEL_TOLERANCE = 12;

async function diffPngs(page, aPath, bPath) {
  const [a, b] = await Promise.all([fsp.readFile(aPath), fsp.readFile(bPath)]);
  return page.evaluate(
    async ([aB64, bB64, tol]) => {
      const load = async (b64) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return createImageBitmap(new Blob([bin], { type: 'image/png' }));
      };
      const [ia, ib] = await Promise.all([load(aB64), load(bB64)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const draw = (img) => {
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext('2d');
        g.clearRect(0, 0, w, h);
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, w, h).data;
      };
      const da = draw(ia);
      const db = draw(ib);
      let differing = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (
          Math.abs(da[i] - db[i]) > tol ||
          Math.abs(da[i + 1] - db[i + 1]) > tol ||
          Math.abs(da[i + 2] - db[i + 2]) > tol ||
          Math.abs(da[i + 3] - db[i + 3]) > tol
        ) {
          differing += 1;
        }
      }
      return {
        differing,
        totalPixels: w * h,
        pct: Number(((differing / (w * h)) * 100).toFixed(3)),
        sizeA: `${ia.width}x${ia.height}`,
        sizeB: `${ib.width}x${ib.height}`,
        sameSize: ia.width === ib.width && ia.height === ib.height,
      };
    },
    [a.toString('base64'), b.toString('base64'), CHANNEL_TOLERANCE]
  );
}

const baseDir = path.resolve(process.argv[2] ?? '.seo-metrics/baseline');
const afterDir = path.resolve(process.argv[3] ?? '.seo-metrics/after');
const base = JSON.parse(await fsp.readFile(path.join(baseDir, 'report.json'), 'utf8'));
const after = JSON.parse(await fsp.readFile(path.join(afterDir, 'report.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];
try {
  for (const b of base.pages) {
    const a = after.pages.find((x) => x.id === b.id && x.viewport === b.viewport);
    if (!a) continue;
    const diff = await diffPngs(page, path.join(baseDir, b.screenshot), path.join(afterDir, a.screenshot));
    rows.push({
      route: b.route,
      viewport: b.viewport,
      pixelDiffPct: diff.pct,
      sameSize: diff.sameSize,
      sizes: `${diff.sizeA} → ${diff.sizeB}`,
      errBefore: b.console.errors,
      errAfter: a.console.errors,
      warnBefore: b.console.warnings,
      warnAfter: a.console.warnings,
      httpBefore: b.console.httpErrors ?? 0,
      httpAfter: a.console.httpErrors ?? 0,
      clsBefore: b.cls.total,
      clsAfter: a.cls.total,
      clsAfterSwap: a.cls.afterSwap,
      swapAt: a.timing.swapTime === null ? null : Number(a.timing.swapTime.toFixed(0)),
    });
  }
} finally {
  await browser.close();
}

console.log('\n── AC2 · diff de screenshot + console (baseline × depois) ─────────────────');
console.log('  rota              vp        px-diff   dimensões            err     warn    http4xx');
for (const r of rows) {
  console.log(
    `  ${r.route.padEnd(18)}${r.viewport.padEnd(10)}${(r.pixelDiffPct + '%').padEnd(10)}${r.sizes.padEnd(21)}${(r.errBefore + '→' + r.errAfter).padEnd(8)}${(r.warnBefore + '→' + r.warnAfter).padEnd(8)}${r.httpBefore}→${r.httpAfter}`
  );
}

console.log('\n── AC6b · CLS medido (PerformanceObserver layout-shift) ───────────────────');
console.log('  rota              vp        CLS antes   CLS depois  CLS após a troca   troca em');
for (const r of rows) {
  console.log(
    `  ${r.route.padEnd(18)}${r.viewport.padEnd(10)}${String(r.clsBefore).padEnd(12)}${String(r.clsAfter).padEnd(12)}${String(r.clsAfterSwap ?? 'n/a').padEnd(19)}${r.swapAt === null ? 'n/a' : r.swapAt + 'ms'}`
  );
}

const regressions = rows.filter((r) => r.errAfter > r.errBefore || r.warnAfter > r.warnBefore || r.httpAfter > r.httpBefore);
console.log('');
if (regressions.length) {
  console.error('✖ AC2: regressão de console detectada:');
  for (const r of regressions) console.error(`  ✖ ${r.route} @${r.viewport}: err ${r.errBefore}→${r.errAfter}, warn ${r.warnBefore}→${r.warnAfter}, http4xx ${r.httpBefore}→${r.httpAfter}`);
  process.exit(1);
}
console.log('✓ AC2: nenhum erro/warning/4xx novo introduzido em nenhuma das 10 combinações');
await fsp.writeFile(path.join(afterDir, 'comparison.json'), JSON.stringify({ comparedAt: new Date().toISOString(), rows }, null, 2) + '\n', 'utf8');
