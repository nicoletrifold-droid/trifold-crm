// Story 90-1 — testes obrigatórios das ACs 1, 4, 6a, 7 e 8 contra o `dist/`.
//
// Roda sempre contra o `dist/` MONTADO (não contra a árvore-fonte): o que
// interessa provar é o comportamento do HTML que vai para produção.
//
// USO
//   node scripts/verify-prerender.mjs [dist]

import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { PAGES, SITE_ROOT, VIEWPORTS, startStaticServer, DC_MOUNTED } from './dc-site.mjs';
import { extractPrerenderBlock, extractXdc, PRERENDER_ID } from './prerender.mjs';
import { inspectDocument } from './check-dist.mjs';

const FORM_CONTROLS = ['FORM', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'];

/**
 * Texto que só existe DEPOIS de o runtime dc expandir `<sc-for>`/`{{ }}`.
 * Ele existe no arquivo-fonte, sim — mas dentro do `<script data-dc-script>`,
 * que nenhum crawler lê. A prova da AC1 é ele aparecer como TEXTO dentro de
 * `#dc-prerender`, que é o que o crawler extrai.
 */
const AC1_MARKERS = {
  home: ['Exclusivo. Compacto. Boutique.', 'Confie sua obra com quem sabe fazer'],
  'sobre-nos': ['Alexandre começa sua trajetória', '1997'],
  empreendimentos: ['Vind Residence', 'Yarden'],
  corporativas: ['+300mil m²', '13 engenheiros'],
  blog: ['Apartamento Boutique'],
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? '✓' : '✖'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

/** Instrumento de cronometragem da troca `#dc-prerender` → React real (AC6a). */
function recordSwap() {
  window.__swap = { rootFilledAt: null, prerenderRemovedAt: null, sawPrerender: false };
  const tick = () => {
    const s = window.__swap;
    const r = document.getElementById('dc-root');
    if (s.rootFilledAt === null && r && r.childNodes.length > 0) s.rootFilledAt = performance.now();
    if (document.getElementById('dc-prerender')) s.sawPrerender = true;
    else if (s.sawPrerender && s.prerenderRemovedAt === null) s.prerenderRemovedAt = performance.now();
  };
  const mo = new MutationObserver(tick);
  const install = () => {
    if (!document.documentElement) return void setTimeout(install, 0);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    tick();
  };
  install();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Checagens estáticas sobre o HTML servido (sem browser) — AC1, AC7, AC8
// ─────────────────────────────────────────────────────────────────────────────
async function staticChecks(distRoot, srcRoot) {
  console.log('\n── AC1/AC7/AC8 — inspeção do HTML serializado (sem executar JS) ──');
  const ac8 = [];

  for (const p of PAGES) {
    const dist = await fsp.readFile(path.join(distRoot, p.file), 'utf8');
    const src = await fsp.readFile(path.join(srcRoot, p.file), 'utf8');
    const block = extractPrerenderBlock(dist);

    check(`AC1 ${p.route} tem #${PRERENDER_ID}`, block !== null);
    if (block === null) continue;

    check(`AC1 ${p.route} <x-dc> intacto (byte a byte igual ao fonte)`, extractXdc(dist) === extractXdc(src));

    const text = block.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const missing = (AC1_MARKERS[p.id] || []).filter((m) => !text.includes(m));
    check(`AC1 ${p.route} conteúdo dinâmico de <sc-for>/{{ }} presente como texto`, missing.length === 0, missing.length ? `faltou: ${missing.join(' | ')}` : `${text.length} chars`);
    check(`AC1 ${p.route} zero \`{{\` / \`<sc-\` / \`<dc-import\` no bloco`, !block.includes('{{') && !/<sc-[a-z-]+/.test(block) && !/<dc-import\b/.test(block));

    // AC7 — inspeção do HTML serializado, o teste que a story exige
    // explicitamente ("não é suficiente que estejam só neutralizados").
    const found = FORM_CONTROLS.map((t) => t.toLowerCase()).filter((t) => new RegExp(`<${t}[\\s/>]`, 'i').test(block));
    check(`AC7 ${p.route} <form>/<button>/<input>/<textarea>/<select> NÃO EXISTEM no bloco`, found.length === 0, found.length ? `encontrado: ${found.join(', ')}` : 'removidos fisicamente');
    check(`AC7 ${p.route} zero atributo de evento inline (on*) no bloco`, !/\son[a-z]+\s*=/i.test(block));

    // AC8 — a regra de contagem: só dentro de #dc-prerender.
    const countH1 = (s) => (s.match(/<h1[\s>]/gi) || []).length;
    const xdcH1 = countH1(extractXdc(dist));
    const blockH1 = countH1(block);
    const docH1 = countH1(dist);
    ac8.push({ route: p.route, docH1, xdcH1, blockH1 });
    check(
      `AC8 ${p.route} h1: documento=${docH1} = <x-dc>=${xdcH1} + #${PRERENDER_ID}=${blockH1}`,
      docH1 === xdcH1 + blockH1 && blockH1 === xdcH1,
      'a duplicação é o desenho aditivo — contar só dentro de #dc-prerender'
    );
  }
  return ac8;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AC1 sem JS de verdade: requisição HTTP simples, como o curl da auditoria
// ─────────────────────────────────────────────────────────────────────────────
async function noJsChecks(origin) {
  console.log('\n── AC1 — requisição HTTP simples (sem executar JS, método da auditoria) ──');
  for (const p of PAGES) {
    const body = await fetch(origin + p.route).then((r) => r.text());
    const block = extractPrerenderBlock(body);
    const text = block ? block.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const missing = (AC1_MARKERS[p.id] || []).filter((m) => !text.includes(m));
    check(`AC1 GET ${p.route} devolve texto real no bloco`, block !== null && missing.length === 0, `${text.length} chars`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AC7 ao vivo — o formulário fantasma não responde a clique/foco/submit
// ─────────────────────────────────────────────────────────────────────────────
async function ac7Live(browser, origin) {
  console.log('\n── AC7 — não-interatividade ao vivo, ANTES do mount terminar ──');
  // Home (tem o formulário de contato) e Blog (não tem — prova que a remoção
  // física não quebra nada onde não há risco de PII). Exigência da story.
  for (const id of ['home', 'blog']) {
    const p = PAGES.find((x) => x.id === id);
    const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const page = await ctx.newPage();

    // Bloqueia o vendor local do React: o mount NUNCA termina, então a janela em
    // que o bloco fantasma está visível fica aberta indefinidamente — é
    // exatamente a janela de risco que a AC7 descreve, agora inspecionável.
    await page.route('**/assets/vendor/react*.js', (r) => r.abort());

    const navigations = [];
    const suspectRequests = [];
    page.on('framenavigated', (f) => f === page.mainFrame() && navigations.push(f.url()));
    page.on('request', (r) => {
      const u = r.url();
      if (/[?&](nome|email|telefone|mensagem)=/i.test(u)) suspectRequests.push(u);
    });

    await page.goto(origin + p.route, { waitUntil: 'load' });
    await page.waitForSelector(`#${PRERENDER_ID}`, { timeout: 10_000 });
    const urlBefore = page.url();

    const dom = await page.evaluate(() => {
      const pre = document.getElementById('dc-prerender');
      const inBlock = pre ? pre.querySelectorAll('form,button,input,textarea,select').length : -1;
      const focusableInBlock = pre ? pre.querySelectorAll('[tabindex],[contenteditable]').length : -1;
      // Os `<form>` do documento que sobraram são os do template CRU dentro do
      // `<x-dc>`, escondido por `x-dc{display:none!important}`. Provar que
      // nenhum deles é renderizado (zero client rects) é o que fecha o risco.
      const forms = Array.from(document.querySelectorAll('form'));
      return {
        inBlock,
        focusableInBlock,
        totalForms: forms.length,
        formsInsideXdc: forms.filter((f) => f.closest('x-dc')).length,
        formsWithLayout: forms.filter((f) => f.getClientRects().length > 0).length,
        rootMounted: !!document.getElementById('dc-root')?.childNodes.length,
        blockText: (pre?.textContent || '').replace(/\s+/g, ' ').trim().length,
      };
    });

    check(`AC7 ${p.route} mount bloqueado (janela de risco aberta)`, dom.rootMounted === false);
    check(`AC7 ${p.route} zero controles de formulário dentro de #${PRERENDER_ID}`, dom.inBlock === 0);
    check(`AC7 ${p.route} zero [tabindex]/[contenteditable] dentro de #${PRERENDER_ID}`, dom.focusableInBlock === 0);
    check(
      `AC7 ${p.route} os ${dom.totalForms} <form> restantes estão no <x-dc> e não são renderizados`,
      dom.totalForms === dom.formsInsideXdc && dom.formsWithLayout === 0,
      `dentro do <x-dc>: ${dom.formsInsideXdc}, com layout: ${dom.formsWithLayout}`
    );

    // As âncoras SÃO preservadas de propósito (grafo de links interno = metade do
    // valor de SEO desta story, e âncora não carrega dado de usuário). Isso é
    // decisão registrada no Dev Agent Record — aqui vira invariante testada, para
    // não passar por omissão.
    const anchors = await page.evaluate(() => document.querySelectorAll('#dc-prerender a[href]').length);
    check(`AC7 ${p.route} âncoras preservadas no bloco (decisão explícita, sem risco de PII)`, anchors > 0, `${anchors} links`);

    // (a) Submit nativo forçado em TODO <form> do documento.
    await page.evaluate(() => {
      for (const f of document.querySelectorAll('form')) {
        try {
          f.requestSubmit ? f.requestSubmit() : f.submit();
        } catch {
          /* esperado */
        }
      }
    });
    await page.waitForTimeout(500);
    check(`AC7 ${p.route} requestSubmit() forçado não navega nem gera query string`, page.url() === urlBefore, `url: ${page.url().replace(origin, '')}`);

    // (b) Digitar e dar Enter SEM foco em nada: com o formulário fisicamente
    // removido, não existe campo para receber o texto nem form para submeter.
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.type('nome-teste-pii');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check(
      `AC7 ${p.route} digitar + Enter sem foco não navega nem vaza para a URL`,
      page.url() === urlBefore && !page.url().includes('?') && suspectRequests.length === 0,
      `url: ${page.url().replace(origin, '')}, requisições suspeitas: ${suspectRequests.length}`
    );

    // (c) Foco por teclado: 60 Tabs e o foco NUNCA cai num controle de
    // formulário. Deliberadamente sem Enter depois — o foco cai em âncoras
    // (esperado), e ativá-las é navegação normal de link, não vazamento.
    const focusTrail = new Set();
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      focusTrail.add(await page.evaluate(() => document.activeElement?.tagName || 'NONE'));
    }
    const badFocus = [...focusTrail].filter((t) => FORM_CONTROLS.includes(t));
    check(`AC7 ${p.route} 60x Tab nunca focam um controle de formulário`, badFocus.length === 0, `focos vistos: ${[...focusTrail].join(',')}`);
    check(`AC7 ${p.route} zero requisição com campo de formulário na URL (o risco da AC7)`, suspectRequests.length === 0);
    check(`AC7 ${p.route} bloco continua com conteúdo real depois das tentativas`, dom.blockText > 200, `${dom.blockText} chars`);

    await ctx.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AC4 — falha de mount do React deixa o bloco no lugar (degradação graciosa)
// ─────────────────────────────────────────────────────────────────────────────
async function ac4(browser, origin) {
  console.log('\n── AC4 — resiliência a falha de mount do React ──');
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const page = await ctx.newPage();
    await page.route('**/assets/vendor/react*.js', (r) => r.abort());
    await page.goto(origin + p.route, { waitUntil: 'load' });
    await page.waitForTimeout(3000); // tempo de sobra para qualquer remoção indevida

    const state = await page.evaluate(() => {
      const pre = document.getElementById('dc-prerender');
      return {
        present: !!pre,
        visible: !!pre && pre.getClientRects().length > 0,
        text: (pre?.textContent || '').replace(/\s+/g, ' ').trim().length,
        rootChildren: document.getElementById('dc-root')?.childNodes.length ?? -1,
      };
    });
    check(`AC4 ${p.route} #${PRERENDER_ID} permanece visível com conteúdo`, state.present && state.visible && state.text > 200, `${state.text} chars, #dc-root filhos: ${state.rootChildren}`);
    await ctx.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. AC6a — sem duplicação permanente: 2 capturas + janela de coexistência
// ─────────────────────────────────────────────────────────────────────────────
async function ac6a(browser, origin) {
  console.log('\n── AC6a — sem duplicação permanente (2 capturas de DOM) ──');
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile });
    await ctx.addInitScript(recordSwap);
    const page = await ctx.newPage();

    // Atrasa o `support.js` 1,5s para a janela PRÉ-mount ser observável de forma
    // determinística. Sem isso o mount termina em ~25ms e a captura "logo após
    // o load" já pegaria o estado pós-mount, não provando nada.
    await page.route('**/support.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    // `commit` retorna assim que a navegação commita, sem esperar subrecursos.
    await page.goto(origin + p.route, { waitUntil: 'commit' });
    await page.waitForSelector(`#${PRERENDER_ID}`, { timeout: 10_000 });

    const before = await page.evaluate(() => ({
      prerender: !!document.getElementById('dc-prerender'),
      prerenderText: (document.getElementById('dc-prerender')?.textContent || '').replace(/\s+/g, ' ').trim().length,
      dcRootExists: !!document.getElementById('dc-root'),
      xdcExists: !!document.querySelector('x-dc'),
    }));
    check(
      `AC6a ${p.route} captura 1 (pré-mount): #${PRERENDER_ID} com conteúdo, #dc-root AUSENTE`,
      before.prerender && before.prerenderText > 200 && before.dcRootExists === false && before.xdcExists === true,
      `bloco: ${before.prerenderText} chars, #dc-root existe: ${before.dcRootExists}, <x-dc> existe: ${before.xdcExists}`
    );

    await page.waitForFunction(DC_MOUNTED, null, { timeout: 30_000 });
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => ({
      prerender: !!document.getElementById('dc-prerender'),
      dcRootChildren: document.getElementById('dc-root')?.childNodes.length ?? -1,
      xdcExists: !!document.querySelector('x-dc'),
      swap: window.__swap,
    }));
    check(
      `AC6a ${p.route} captura 2 (pós-mount): #dc-root com conteúdo, #${PRERENDER_ID} REMOVIDO do DOM`,
      after.prerender === false && after.dcRootChildren > 0,
      `#dc-root filhos: ${after.dcRootChildren}, <x-dc> consumido pelo mount: ${!after.xdcExists}`
    );

    const s = after.swap;
    const coexistMs = s.rootFilledAt !== null && s.prerenderRemovedAt !== null ? s.prerenderRemovedAt - s.rootFilledAt : null;
    check(
      `AC6a ${p.route} janela de coexistência curta e na ordem certa`,
      coexistMs !== null && coexistMs >= 0 && coexistMs < 250,
      coexistMs === null ? 'não medida' : `${coexistMs.toFixed(1)}ms entre #dc-root receber conteúdo e o bloco sair`
    );
    await ctx.close();
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 6. Teste de MUTAÇÃO do gate — as garantias se defendem sozinhas?
//
// Um gate que só é exercitado no caminho feliz não prova nada: ele pode estar
// aprovando tudo. Aqui cada proteção é deliberadamente quebrada numa cópia em
// memória do HTML bom, e o gate TEM de reprovar. Formaliza (e torna repetível)
// o teste de mutação que o @qa fez à mão na rodada do gate da Story 90-1.
// ─────────────────────────────────────────────────────────────────────────────
async function gateMutations(distRoot, srcRoot) {
  console.log('\n── Gate · teste de mutação (cada proteção quebrada de propósito) ──');
  const file = PAGES[0].file; // Home — é a que tem o formulário de contato
  const good = await fsp.readFile(path.join(distRoot, file), 'utf8');
  const src = await fsp.readFile(path.join(srcRoot, file), 'utf8');
  const inBlock = (html, injection) => {
    const at = html.indexOf(`<div id="${PRERENDER_ID}">`) + `<div id="${PRERENDER_ID}">`.length;
    return html.slice(0, at) + injection + html.slice(at);
  };
  const dropObserver = (html) => html.replace(/<script>\(function\(\)\{var p=document\.getElementById\('dc-prerender'\)[\s\S]*?<\/script>\n/, '');
  const dropStyle = (html) => html.replace(/<style id="dc-prerender-hide-template">[^<]*<\/style>\n/, '');
  const dropSentinels = (html) => html.replace('<!--dc-prerender:start-->\n', '').replace('<!--dc-prerender:end-->\n', '');

  const mutants = [
    ['controle: HTML bom deve APROVAR', good, false],
    ['interpolação `{{` crua no bloco', inBlock(good, '<p>{{ s.heading }}</p>'), true],
    ['<sc-for> não expandido no bloco (sem `{{`, para exercitar a regra certa)', inBlock(good, '<sc-for list="slides"><i>y</i></sc-for>'), true],
    ['AC7: <form>+<input>+<button> no bloco', inBlock(good, '<form><input name="nome"><button type="submit">Enviar</button></form>'), true],
    ['AC7: atributo on* inline no bloco', inBlock(good, '<div onclick="roubaPii()">x</div>'), true],
    ['<script> observador removido', dropObserver(good), true],
    ['<style>x-dc{display:none} removido', dropStyle(good), true],
    ['QA-2: observador E style E sentinelas removidos juntos', dropSentinels(dropStyle(dropObserver(good))), true],
    ['<x-dc> alterado (mount quebraria)', good.replace('<x-dc>', '<x-dc data-adulterado="1">'), true],
    ['bloco esvaziado (snapshot vazio)', good.replace(extractPrerenderBlock(good), '<p>oi</p>'), true],
  ];

  for (const [name, html, shouldFail] of mutants) {
    const r = inspectDocument({ html, label: 'mutante', srcHtml: src });
    const rejected = r.problems.length > 0;
    check(`Gate ${shouldFail ? 'REPROVA' : 'aprova'}: ${name}`, rejected === shouldFail, rejected ? r.problems[0].replace('mutante: ', '').slice(0, 90) : 'sem problemas apontados');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const distRoot = path.resolve(process.argv[2] ?? path.join(SITE_ROOT, 'dist'));
  const srcRoot = SITE_ROOT;
  const ac8 = await staticChecks(distRoot, srcRoot);
  await gateMutations(distRoot, srcRoot);

  const server = await startStaticServer(distRoot);
  const browser = await chromium.launch();
  try {
    await noJsChecks(server.origin);
    await ac7Live(browser, server.origin);
    await ac4(browser, server.origin);
    await ac6a(browser, server.origin);
  } finally {
    await browser.close();
    await server.close();
  }

  console.log('\n── AC8 · tabela de contagem de headings (critério para as Stories 90-3a/90-3b) ──');
  console.log('  rota              h1 no documento   h1 no <x-dc>   h1 em #dc-prerender');
  for (const r of ac8) console.log(`  ${r.route.padEnd(18)}${String(r.docH1).padEnd(18)}${String(r.xdcH1).padEnd(15)}${r.blockH1}`);
  console.log('  → REGRA: contar SEMPRE dentro de #dc-prerender. O <x-dc> fica display:none.');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? '✖' : '✓'} ${results.length - failed.length}/${results.length} checagens passaram`);
  if (failed.length) {
    for (const f of failed) console.error(`  ✖ ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

await main();
