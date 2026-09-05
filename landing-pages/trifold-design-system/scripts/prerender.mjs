// Story 90-1 — pré-renderização ADITIVA das 5 páginas institucionais.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE ADITIVO, E NÃO "SERIALIZAR O DOM E PUBLICAR NO LUGAR DO TEMPLATE"
// ────────────────────────────────────────────────────────────────────────────
// O runtime "dc" (`support.js`, `boot()` na linha 150) faz MOUNT, não hydrate:
//
//     const dc = doc.querySelector("x-dc");        // support.js:163
//     const hostEl = doc.createElement("div");     // support.js:164
//     hostEl.id = "dc-root";                       // support.js:165
//     dc.replaceWith(hostEl);                      // support.js:166
//     ReactDOM.createRoot(hostEl).render(...)      // support.js:194-195
//
// Ou seja: ele EXIGE encontrar um `<x-dc>` no documento e o destrói ao montar.
// Se publicássemos o DOM serializado no lugar do `.dc.html` (a rota "in-place"),
// o HTML publicado não teria mais `<x-dc>`; no carregamento seguinte
// `querySelector("x-dc")` devolveria `null`, `parseDcDocument` (support.js:25)
// retornaria `null`, e NADA montaria — morre o carrossel, o menu mobile, o
// acordeão e, principalmente, o formulário de contato (`handleContactSubmit` →
// `POST /api/contact`). Trocaríamos um problema de SEO por uma queda de
// conversão de leads.
//
// Por isso o desenho é ADITIVO: o HTML de saída mantém o `<x-dc>` ÍNTEGRO e
// ganha um IRMÃO novo, `<div id="dc-prerender">`, com o DOM já renderizado. Um
// `<script>` inline curto remove esse irmão assim que o mount real terminar.
// Efeito colateral bom e de graça: se o mount falhar (vendor local do React
// indisponível, SRI não bater), o bloco pré-renderizado NUNCA é removido — o
// usuário e o crawler continuam vendo conteúdo real (AC4).
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE O OBSERVER OLHA `document.body`, E NÃO `#dc-root`
// ────────────────────────────────────────────────────────────────────────────
// `#dc-root` NÃO existe no HTML servido — é criado dentro do próprio `boot()`
// (linhas 164-166, acima). `document.getElementById('dc-root')` devolve `null`
// até o mount rodar, e `observer.observe(null)` lança `TypeError`. O alvo tem de
// ser um ancestral estável já presente no primeiro paint: `document.body`. A
// condição de remoção continua sendo "quando `#dc-root` ganhar filhos" — só que
// consultada por `getElementById` a cada mutação, não por observação direta.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE `<form>`/`<button>`/`<input>` SÃO REMOVIDOS FISICAMENTE (AC7)
// ────────────────────────────────────────────────────────────────────────────
// `<form onSubmit="{{ handleContactSubmit }}">` (`Home.dc.html:211`) está dentro
// do `<x-dc>`, então o snapshot contém uma CÓPIA dele. `onSubmit` é prop React,
// não atributo HTML: a cópia estática não carrega handler nenhum. E o bloco fica
// visível desde o primeiro paint, por desenho, até o mount terminar.
//
// Se um visitante preencher e enviar NESSA JANELA, o navegador faz submit NATIVO
// de um `<form>` sem `action` → `GET` para a própria URL → nome, telefone,
// e-mail e mensagem vazam para a query string, para o histórico do navegador e
// para os logs de acesso. E o lead se perde (nunca chega em `/api/contact`).
//
// A alternativa `inert` + `pointer-events:none` foi cogitada e DESCARTADA pelo
// usuário: `inert` é no-op em navegadores anteriores a Chrome 102 / Safari 15.5 /
// Firefox 112 — mesmo sendo minoria de tráfego, deixaria resíduo de risco de PII
// em vez de eliminá-lo. Remoção física é a única rota aceita.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { PAGES, SITE_ROOT, SNAPSHOT_VIEWPORT, startStaticServer, DC_MOUNTED } from './dc-site.mjs';

const MOUNT_TIMEOUT_MS = 30_000;
// Abaixo dos 6500ms do carrossel da Home: o snapshot sai sempre no slide 0.
const SETTLE_AFTER_MOUNT_MS = 1200;

/**
 * Elementos removidos INTEIROS (com a subárvore) do snapshot — AC7.
 *
 * `<a href>` NÃO entra nesta lista, e isso é deliberado: âncoras são o grafo de
 * links interno, que é metade do valor de SEO desta story, e não têm como vazar
 * dado nenhum do usuário (não carregam input). O risco que a AC7 descreve é
 * especificamente o submit nativo de formulário. Ver Dev Agent Record.
 *
 * `<script>` entra porque um script duplicado dentro do snapshot re-executaria a
 * lógica da página, e porque um `</script>` literal no meio do bloco quebraria a
 * serialização.
 */
export const REMOVED_TAGS = ['form', 'button', 'input', 'textarea', 'select', 'iframe', 'object', 'embed', 'dialog', 'script'];

/**
 * Atributos apagados de TODO elemento sobrevivente.
 *
 * Os primeiros são defesa em profundidade contra interatividade residual
 * (`tabindex` tornaria um `<div>` focável por teclado). `data-dc-tpl` é a
 * anotação de ponte do editor do canvas, sem função no HTML público — sai por
 * ser peso morto num documento servido a crawler.
 */
export const STRIPPED_ATTRS = ['tabindex', 'contenteditable', 'draggable', 'autofocus', 'accesskey', 'data-dc-tpl'];

/** `#dc-prerender` não pode responder a clique nem a foco — nem por acidente. */
export const PRERENDER_ID = 'dc-prerender';

/**
 * O script inline que remove o bloco quando o mount real termina (AC1/AC6a).
 * Mantido minúsculo e sem dependências: roda durante o parse, antes do
 * `support.js` (que é `defer`).
 */
const OBSERVER_SCRIPT = `<script>(function(){var p=document.getElementById('${PRERENDER_ID}');if(!p)return;function mounted(){var r=document.getElementById('dc-root');return !!(r&&r.childNodes.length);}function drop(){if(p&&p.parentNode){p.parentNode.removeChild(p);}p=null;}
/* Checagem síncrona: cobre a corrida em que o mount terminou antes de o observer existir. */
if(mounted()){drop();return;}
/* Sem MutationObserver (navegador muito antigo) o bloco simplesmente permanece:
   degradação graciosa, o mesmo comportamento da falha de mount (AC4). */
if(!window.MutationObserver)return;
var o=new MutationObserver(function(){if(mounted()){o.disconnect();drop();}});
o.observe(document.body,{childList:true,subtree:true});})();</script>`;

/**
 * O `<style>` estático que esconde o template cru.
 *
 * ATENÇÃO: só pode ser emitido JUNTO com o `#dc-prerender`. Sozinho, ele também
 * esconderia os `<h1>` estáticos que Empreendimentos/B2B/Blog já servem sem JS —
 * regredindo o achado O1, já corrigido em rodada anterior deste epic.
 */
const HEAD_STYLE = `<style id="dc-prerender-hide-template">x-dc{display:none!important}</style>`;

const XDC_CLOSE = '</x-dc>';

/**
 * Sentinelas de comentário em volta do bloco.
 *
 * Existem para o gate pré-deploy conseguir recortar EXATAMENTE o que é conteúdo
 * pré-renderizado — a regra do AC8/AC6a é "checar só dentro de `#dc-prerender`",
 * e um grep no documento inteiro sempre acha `{{ }}` (o `<x-dc>` é o template
 * cru, ele SEMPRE tem `{{ }}`, e isso é correto). Também tornam o bloco óbvio
 * em `view-source` para quem for auditar a página em produção.
 */
export const BLOCK_START = '<!--dc-prerender:start-->';
export const BLOCK_END = '<!--dc-prerender:end-->';
export const BLOCK_OPEN_TAG = `<div id="${PRERENDER_ID}">`;

/**
 * Recorta o conteúdo de `#dc-prerender` (sem o `<script>` observador).
 * Devolve `null` quando a página está em fallback do AC5 — que é um estado
 * legítimo, não um erro.
 */
export function extractPrerenderBlock(html) {
  const start = html.indexOf(BLOCK_START);
  const end = html.indexOf(BLOCK_END);
  if (start === -1 || end === -1) return null;
  const region = html.slice(start, end);
  const openAt = region.indexOf(BLOCK_OPEN_TAG);
  const scriptAt = region.indexOf('<script>', openAt);
  if (openAt === -1 || scriptAt === -1) return null;
  const inner = region.slice(openAt + BLOCK_OPEN_TAG.length, scriptAt);
  return inner.replace(/<\/div>\s*$/, '');
}

/** Recorta o `<x-dc>…</x-dc>` — usado para provar que o template ficou intacto. */
export function extractXdc(html) {
  const open = /<x-dc(?:\s[^>]*)?>/.exec(html);
  const close = html.lastIndexOf(XDC_CLOSE);
  if (!open || close === -1 || close < open.index) return null;
  return html.slice(open.index, close + XDC_CLOSE.length);
}

/**
 * Serializa `#dc-root` já renderizado, removendo fisicamente tudo que é
 * interativo. Roda DENTRO da página (contexto do browser).
 */
function serializeSanitized({ removedTags, strippedAttrs }) {
  const root = document.getElementById('dc-root');
  if (!root) throw new Error('#dc-root ausente — o mount não aconteceu');

  const clone = root.cloneNode(true);
  const removed = {};
  for (const tag of removedTags) {
    const found = clone.querySelectorAll(tag);
    if (found.length) removed[tag] = found.length;
    for (const el of found) el.remove();
  }

  let attrsStripped = 0;
  for (const el of clone.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      // `on*` cobre onclick/onsubmit/onfocus/... de uma vez.
      if (name.startsWith('on') || strippedAttrs.includes(name)) {
        el.removeAttribute(attr.name);
        attrsStripped += 1;
      }
    }
  }

  return {
    html: clone.innerHTML,
    stats: {
      removed,
      attrsStripped,
      elements: clone.querySelectorAll('*').length,
      textLength: (clone.textContent || '').replace(/\s+/g, ' ').trim().length,
      h1: clone.querySelectorAll('h1').length,
      headings: clone.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      links: clone.querySelectorAll('a[href]').length,
    },
  };
}

/**
 * Monta o HTML de saída: `<style>` no head + bloco irmão ANTES do `<x-dc>`, com
 * o `<x-dc>` em si intocado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O BLOCO VEM ANTES DO `<x-dc>`, E NÃO DEPOIS (achado de medição, AC6b)
 * ────────────────────────────────────────────────────────────────────────────
 * A AC1 pede um elemento IRMÃO do `<x-dc>` — não diz de que lado. A primeira
 * implementação colocou o bloco DEPOIS de `</x-dc>`, o que parece natural e é
 * funcionalmente idêntico. Medindo CLS com `PerformanceObserver`, era 12x pior:
 *
 *   CLS total (soma das 5 páginas × 2 viewports, pior de 3 execuções)
 *     bloco DEPOIS de `</x-dc>`  →  3.5251   (chegava a 1.0045 numa página só)
 *     bloco ANTES  do `<x-dc>`   →  0.2862   (nenhuma página acima de 0.06)
 *
 * O mecanismo: `boot()` troca o `<x-dc>` por `#dc-root` e o React o preenche com
 * a página inteira. Com o bloco DEPOIS, o `#dc-prerender` — que está visível na
 * viewport — é empurrado para baixo pela altura inteira do documento. Isso só
 * viraria CLS se algo forçasse um layout síncrono nessa janela, e algo força: o
 * `componentDidMount` de cada página lê `window.innerWidth` (`Home.dc.html:260`
 * e equivalentes nas outras 4). Resultado: um shift de ~1.0 de um elemento que
 * ocupa a viewport toda.
 *
 * Com o bloco ANTES, ele fica em y=0 e NUNCA é empurrado: o que cresce é o
 * `#dc-root`, abaixo dele. Sobra só o shift de subir o conteúdo real quando o
 * bloco sai — e esse conteúdo, em geral, ainda não tinha sido pintado.
 *
 * `position:absolute` no bloco também resolveria (0.3291 medido), mas tira o
 * bloco do fluxo — no cenário de falha de mount da AC4 o usuário ficaria com uma
 * página de altura zero. Ficar no fluxo, mas antes, resolve sem esse custo.
 */
export function injectPrerender(sourceHtml, snapshotHtml) {
  const closeHead = sourceHtml.indexOf('</head>');
  const xdcOpen = /<x-dc(?:\s[^>]*)?>/.exec(sourceHtml);
  const closeXdc = sourceHtml.lastIndexOf(XDC_CLOSE);
  if (closeHead === -1) throw new Error('HTML-fonte sem `</head>`');
  if (!xdcOpen) throw new Error('HTML-fonte sem `<x-dc>` — o template do runtime dc sumiu?');
  if (closeXdc === -1) throw new Error('HTML-fonte sem `</x-dc>` — o template do runtime dc sumiu?');
  if (closeHead > xdcOpen.index) throw new Error('`</head>` depois de `<x-dc>` — HTML-fonte inesperado');

  // `parseDcText` (support.js:38) recorta o template entre o PRIMEIRO `<x-dc>`
  // (regex `exec`) e o ÚLTIMO `</x-dc>` (`lastIndexOf`). Como o bloco é inserido
  // ANTES do `<x-dc>`, um `<x-dc` dentro do snapshot passaria a ser o primeiro
  // e o runtime readotaria um template errado no `fetch(location.href)` que o
  // `boot()` faz. As duas guardas abaixo são o que impede isso.
  if (/<x-dc[\s/>]/i.test(snapshotHtml)) throw new Error('snapshot contém `<x-dc` — viraria o primeiro match do parseDcText');
  if (snapshotHtml.includes(XDC_CLOSE)) throw new Error('snapshot contém `</x-dc>` — quebraria o parseDcText');
  if (/id\s*=\s*["']?dc-root/.test(snapshotHtml)) throw new Error('snapshot contém `id="dc-root"` — colidiria com o host do mount');
  if (snapshotHtml.includes(`id="${PRERENDER_ID}"`)) throw new Error(`snapshot contém \`id="${PRERENDER_ID}"\` aninhado`);

  const block = `${BLOCK_START}\n${BLOCK_OPEN_TAG}${snapshotHtml}</div>\n${OBSERVER_SCRIPT}\n${BLOCK_END}\n`;

  return (
    sourceHtml.slice(0, closeHead) +
    HEAD_STYLE +
    '\n' +
    sourceHtml.slice(closeHead, xdcOpen.index) +
    block +
    sourceHtml.slice(xdcOpen.index)
  );
}

/** Tira o snapshot de UMA página. Lança se algo der errado (o chamador decide o fallback). */
export async function snapshotPage(browser, origin, pageDef) {
  const ctx = await browser.newContext({ viewport: SNAPSHOT_VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    await page.goto(origin + pageDef.route, { waitUntil: 'load', timeout: MOUNT_TIMEOUT_MS });
    await page.waitForFunction(DC_MOUNTED, null, { timeout: MOUNT_TIMEOUT_MS });
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page
      .waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(SETTLE_AFTER_MOUNT_MS);

    const result = await page.evaluate(serializeSanitized, { removedTags: REMOVED_TAGS, strippedAttrs: STRIPPED_ATTRS });
    if (!result.html || result.stats.textLength < 200) {
      throw new Error(`snapshot vazio ou curto demais (${result.stats.textLength} chars de texto)`);
    }
    return result;
  } finally {
    await ctx.close();
  }
}

/**
 * Pré-renderiza as páginas de `srcRoot` escrevendo em `outRoot`.
 *
 * NUNCA falha o processo inteiro por causa de uma página (AC5): quem chama
 * recebe o resultado por página e aplica o fallback.
 */
export async function prerenderAll({ srcRoot = SITE_ROOT, outRoot, pages = PAGES, onlyIds = null } = {}) {
  const server = await startStaticServer(srcRoot);
  const browser = await chromium.launch();
  const results = [];
  try {
    // Seam de teste do AC5 (build-time apenas, nunca chega em runtime de página):
    // `DC_PRERENDER_FAIL_IDS=blog node scripts/build-dist.mjs` força a falha do
    // prerender daquela(s) página(s) para provar que o fallback funciona e que o
    // deploy das outras 4 segue. A story exige esse teste; sem um gatilho
    // determinístico ele só poderia ser feito quebrando o repo à mão.
    const failIds = (process.env.DC_PRERENDER_FAIL_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);

    for (const pageDef of pages) {
      if (onlyIds && !onlyIds.includes(pageDef.id)) continue;
      const srcPath = path.join(srcRoot, pageDef.file);
      const outPath = path.join(outRoot, pageDef.file);
      try {
        if (failIds.includes(pageDef.id)) throw new Error(`falha injetada via DC_PRERENDER_FAIL_IDS (${pageDef.id})`);
        const sourceHtml = await fsp.readFile(srcPath, 'utf8');
        const { html, stats } = await snapshotPage(browser, server.origin, pageDef);
        await fsp.writeFile(outPath, injectPrerender(sourceHtml, html), 'utf8');
        results.push({ ...pageDef, ok: true, stats });
      } catch (err) {
        results.push({ ...pageDef, ok: false, error: String(err.message || err) });
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SITE_ROOT, 'dist');
  await fsp.mkdir(outRoot, { recursive: true });
  const results = await prerenderAll({ outRoot });
  for (const r of results) {
    if (r.ok) console.log(`  ✓ ${r.route.padEnd(17)} ${r.stats.textLength} chars, ${r.stats.headings} headings, ${r.stats.links} links, removidos: ${JSON.stringify(r.stats.removed)}`);
    else console.error(`  ✖ ${r.route.padEnd(17)} ${r.error}`);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}
