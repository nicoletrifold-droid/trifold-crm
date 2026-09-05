// Story 90-1 — captura de métricas comparáveis (screenshots, console, CLS).
//
// POR QUE ISTO EXISTE. A AC2 da 90-1 exige provar que a pré-renderização NÃO
// regride a experiência de quem tem JS, "de forma objetiva, não a olho". Provar
// isso exige duas capturas feitas pelo MESMO caminho de código: uma ANTES da
// mudança (a árvore-fonte servida como está hoje) e uma DEPOIS (o `dist/`
// montado). Por isso este script recebe `--root` — ele é a baseline E o "depois",
// nunca dois scripts que podem divergir.
//
// CLS (AC6b) é medido com `PerformanceObserver({type:'layout-shift'})`, não com
// um Lighthouse de load completo: o risco específico desta story é o salto no
// instante em que o `#dc-prerender` (snapshot congelado num viewport) é trocado
// pelo React real, que recalcula o layout a partir de `window.innerWidth`. Por
// isso registramos também `clsAfterSwap` — a fatia do CLS que acontece a partir
// da troca, que é a única atribuível a esta story.
//
// USO
//   node scripts/capture-metrics.mjs --root . --out .seo-metrics/baseline
//   node scripts/capture-metrics.mjs --root dist --out .seo-metrics/after

import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { PAGES, SITE_ROOT, VIEWPORTS, startStaticServer, DC_MOUNTED } from './dc-site.mjs';

const MOUNT_TIMEOUT_MS = 30_000;
// Fica confortavelmente abaixo dos 6500ms do `setInterval` do carrossel da Home,
// para o screenshot cair sempre no slide 0 e o diff da AC2 não acusar diferença
// que é só timing.
const SETTLE_AFTER_MOUNT_MS = 1200;

function parseArgs(argv) {
  const out = { root: SITE_ROOT, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.replace(/^--/, '');
    if (k && k in out) out[k] = argv[i + 1];
  }
  if (!out.out) throw new Error('faltou --out <dir>');
  return { root: path.resolve(out.root), out: path.resolve(out.out) };
}

/** Instalado antes de qualquer script da página (document_start). */
function instrument() {
  window.__dcMetrics = { cls: [], mountTime: null, swapTime: null, sawPrerender: false };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__dcMetrics.cls.push({ t: e.startTime, v: e.value });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* navegador sem layout-shift: fica sem número, e o relatório mostra null */
  }
  const check = () => {
    const m = window.__dcMetrics;
    if (m.mountTime === null) {
      const r = document.getElementById('dc-root');
      if (r && r.childNodes.length > 0) m.mountTime = performance.now();
    }
    if (document.getElementById('dc-prerender')) m.sawPrerender = true;
    else if (m.sawPrerender && m.swapTime === null) m.swapTime = performance.now();
  };
  const mo = new MutationObserver(check);
  // Em `document_start` nem o `documentElement` existe ainda — `observe(null)`
  // lança `TypeError` (a mesma armadilha que a 2ª validação @po pegou na redação
  // da story, aqui do lado do instrumento). Espera o nó aparecer.
  const install = () => {
    if (!document.documentElement) {
      setTimeout(install, 0);
      return;
    }
    mo.observe(document.documentElement, { childList: true, subtree: true });
    check();
  };
  install();
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page
    .waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(SETTLE_AFTER_MOUNT_MS);
}

export async function capture({ root, out }) {
  await fsp.mkdir(out, { recursive: true });
  const server = await startStaticServer(root);
  const browser = await chromium.launch();
  const report = { root, capturedAt: new Date().toISOString(), pages: [] };

  try {
    for (const pageDef of PAGES) {
      for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
        const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
        await ctx.addInitScript(instrument);
        const page = await ctx.newPage();

        const console_ = [];
        page.on('console', (m) => console_.push({ type: m.type(), text: m.text() }));
        page.on('pageerror', (e) => console_.push({ type: 'pageerror', text: String(e.message || e) }));
        page.on('requestfailed', (r) => console_.push({ type: 'requestfailed', text: `${r.url()} :: ${r.failure()?.errorText}` }));
        page.on('response', (r) => {
          if (r.status() >= 400) console_.push({ type: 'httperror', text: `${r.status()} ${r.url()}` });
        });

        const entry = { id: pageDef.id, route: pageDef.route, viewport: vpName };
        try {
          await page.goto(server.origin + pageDef.route, { waitUntil: 'load', timeout: MOUNT_TIMEOUT_MS });
          await page.waitForFunction(DC_MOUNTED, null, { timeout: MOUNT_TIMEOUT_MS });
          await settle(page);

          const shot = path.join(out, `${pageDef.id}.${vpName}.png`);
          await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' });
          entry.screenshot = path.relative(out, shot);

          const m = await page.evaluate(() => window.__dcMetrics);
          const total = m.cls.reduce((a, c) => a + c.v, 0);
          const afterSwap = m.swapTime === null ? null : m.cls.filter((c) => c.t >= m.swapTime).reduce((a, c) => a + c.v, 0);
          entry.cls = { total: Number(total.toFixed(5)), afterSwap: afterSwap === null ? null : Number(afterSwap.toFixed(5)), shiftCount: m.cls.length };
          entry.timing = { mountTime: m.mountTime, swapTime: m.swapTime };
          entry.headings = await page.evaluate(() => {
            const inPrerender = document.querySelectorAll('#dc-prerender h1').length;
            return { documentH1: document.querySelectorAll('h1').length, prerenderH1: inPrerender };
          });
        } catch (err) {
          entry.error = String(err.message || err);
        }

        entry.console = {
          errors: console_.filter((c) => c.type === 'error' || c.type === 'pageerror').length,
          warnings: console_.filter((c) => c.type === 'warning').length,
          requestFailed: console_.filter((c) => c.type === 'requestfailed').length,
          httpErrors: console_.filter((c) => c.type === 'httperror').length,
          messages: console_,
        };
        report.pages.push(entry);
        await ctx.close();
        process.stdout.write(`  ✓ ${pageDef.route} @${vpName}${entry.error ? ' (ERRO: ' + entry.error + ')' : ''}\n`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  await fsp.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  console.log(`→ capturando métricas de ${args.root}`);
  const r = await capture(args);
  const bad = r.pages.filter((p) => p.error);
  console.log(`→ relatório em ${path.join(args.out, 'report.json')}`);
  if (bad.length) {
    console.error(`✖ ${bad.length} captura(s) falharam`);
    process.exit(1);
  }
}
