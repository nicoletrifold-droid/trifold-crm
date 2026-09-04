// Story 90-1 — gate pré-deploy sobre o `dist/` montado (passo 3 do deploy.sh).
//
// POR QUE O GREP TEM DE SER ESCOPADO. A regra ingênua "grep por `{{` ou
// `<sc-for` no que vai subir" reprova TODAS as páginas, sempre: o `<x-dc>` é o
// template cru e ele SEMPRE tem `{{ }}` e `<sc-for>` — isso é correto, é a fonte
// que o runtime dc precisa para montar. O que não pode existir é template cru
// FORA do `<x-dc>`, no lugar onde o `#dc-prerender` deveria ter conteúdo real.
// Daí o recorte por sentinela (`extractPrerenderBlock`).
//
// Este gate também é onde a AC7 vira verificação de verdade, e não promessa do
// script de build: se um `<form>`/`<input>`/`<button>` sobreviver no HTML
// serializado, o deploy ABORTA. É o último ponto antes de o HTML ir para
// produção, então é aqui que a proteção de PII tem de ser inegociável.
//
// Uma página em FALLBACK do AC5 (sem `#dc-prerender`) é estado LEGÍTIMO e passa
// no gate — ela é o `.dc.html`-fonte de sempre, que sempre teve `{{ }}`.
//
// USO
//   node scripts/check-dist.mjs [dist] [--src <dir-fonte>]

import fsp from 'node:fs/promises';
import path from 'node:path';
import { PAGES, SITE_ROOT } from './dc-site.mjs';
import { extractPrerenderBlock, extractXdc, REMOVED_TAGS, PRERENDER_ID, BLOCK_START, BLOCK_END } from './prerender.mjs';

const HEAD_STYLE_MARK = 'id="dc-prerender-hide-template"';
const OBSERVER_MARK = "getElementById('dc-root')";

/** Tags cuja presença dentro de `#dc-prerender` é violação de AC7. */
const FORBIDDEN_IN_BLOCK = REMOVED_TAGS.filter((t) => t !== 'script');

/**
 * Inspeciona UM documento já servido/montado. Compartilhado entre o gate
 * pré-deploy (sobre o `dist/`) e a verificação pós-deploy (sobre a URL de
 * produção) — os dois têm de aplicar exatamente o mesmo critério, senão o gate
 * aprova uma coisa e a verificação cobra outra.
 *
 * `srcHtml` é opcional: só existe no gate pré-deploy, onde dá para comparar o
 * `<x-dc>` byte a byte com o arquivo-fonte.
 */
export function inspectDocument({ html, label, srcHtml = null }) {
  const problems = [];
  const notes = [];
  const block = extractPrerenderBlock(html);
  const hasHeadStyle = html.includes(HEAD_STYLE_MARK);

  if (block === null) {
    // Fallback do AC5. Legítimo — mas com duas ressalvas.
    //
    // (1) O `<style>x-dc{display:none}` NÃO pode ter ficado sozinho: sozinho ele
    //     esconderia também os `<h1>` estáticos que Empreendimentos/B2B/Blog
    //     servem sem JS (regressão do achado O1).
    if (hasHeadStyle) problems.push(`${label}: em fallback (sem #${PRERENDER_ID}) mas COM o <style>x-dc{display:none}> — esconderia o conteúdo estático sem repor nada`);

    // (2) Achado QA-2 do gate da Story 90-1: "fallback" é detectado pela ausência
    //     das sentinelas de comentário. Um documento que tenha um
    //     `id="dc-prerender"` SEM as sentinelas cairia aqui e seria aprovado como
    //     se fosse fallback — quando na verdade é um bloco que o gate não
    //     consegue inspecionar, provavelmente sem observer para removê-lo
    //     (duplicação permanente) e sem o `<style>` par. Isso não é fallback, é
    //     saída corrompida, e tem de reprovar.
    if (new RegExp(`id\\s*=\\s*["']?${PRERENDER_ID}`).test(html)) {
      problems.push(`${label}: tem \`id="${PRERENDER_ID}"\` mas NÃO tem as sentinelas ${BLOCK_START}/${BLOCK_END} — bloco não inspecionável pelo gate (sem observer = duplicação permanente). Não é fallback do AC5.`);
      return { problems, notes, fallback: false };
    }

    notes.push(`${label}: em fallback do AC5 (sem pré-renderização) — serve o .dc.html-fonte original`);
    return { problems, notes, fallback: true };
  }

  if (!hasHeadStyle) problems.push(`${label}: tem #${PRERENDER_ID} mas falta o <style>x-dc{display:none}> no <head> — o template cru ficaria visível junto do snapshot`);
  if (!html.includes(OBSERVER_MARK)) problems.push(`${label}: falta o <script> observador — o #${PRERENDER_ID} nunca seria removido (duplicação permanente, AC6a)`);

  // AC1 — template cru resolvido DENTRO do bloco.
  if (block.includes('{{')) problems.push(`${label}: interpolação \`{{\` não resolvida dentro de #${PRERENDER_ID}`);
  const scTags = block.match(/<sc-[a-z-]+/g);
  if (scTags) problems.push(`${label}: tags de template não expandidas dentro de #${PRERENDER_ID}: ${[...new Set(scTags)].join(', ')}`);
  if (/<dc-import\b/.test(block)) problems.push(`${label}: <dc-import> não resolvido dentro de #${PRERENDER_ID}`);

  // AC7 — nada interativo sobreviveu.
  for (const tag of FORBIDDEN_IN_BLOCK) {
    const found = block.match(new RegExp(`<${tag}[\\s/>]`, 'gi'));
    if (found) problems.push(`${label}: <${tag}> presente dentro de #${PRERENDER_ID} (${found.length}x) — VIOLAÇÃO DA AC7 (risco de vazamento de PII)`);
  }
  const onAttrs = block.match(/\son[a-z]+\s*=/gi);
  if (onAttrs) problems.push(`${label}: atributo de evento inline dentro de #${PRERENDER_ID}: ${[...new Set(onAttrs.map((x) => x.trim()))].join(', ')}`);

  // AC1 — `<x-dc>` intacto, byte a byte igual ao fonte.
  if (srcHtml === null) notes.push(`${label}: sem fonte local para comparar o <x-dc> (checagem de integridade pulada)`);
  else if (extractXdc(html) !== extractXdc(srcHtml)) problems.push(`${label}: o <x-dc> servido DIFERE do fonte — o mount do runtime dc depende dele intacto`);

  const textLen = block.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
  if (textLen < 200) problems.push(`${label}: #${PRERENDER_ID} tem só ${textLen} chars de texto — snapshot suspeito de estar vazio`);
  else notes.push(`${label}: ok — ${textLen} chars de texto no #${PRERENDER_ID}`);

  return { problems, notes, fallback: false };
}

export async function checkDist({ distRoot, srcRoot = SITE_ROOT } = {}) {
  const problems = [];
  const notes = [];

  for (const pageDef of PAGES) {
    const label = `${pageDef.route} (${pageDef.file})`;
    let html;
    try {
      html = await fsp.readFile(path.join(distRoot, pageDef.file), 'utf8');
    } catch {
      problems.push(`${label}: ausente do dist/`);
      continue;
    }
    const srcHtml = await fsp.readFile(path.join(srcRoot, pageDef.file), 'utf8').catch(() => null);
    const r = inspectDocument({ html, label, srcHtml });
    problems.push(...r.problems);
    notes.push(...r.notes);
  }

  return { problems, notes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf('--src');
  const srcRoot = srcIdx === -1 ? SITE_ROOT : path.resolve(args[srcIdx + 1]);
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== srcIdx + 1);
  const distRoot = path.resolve(positional[0] ?? path.join(SITE_ROOT, 'dist'));

  const { problems, notes } = await checkDist({ distRoot, srcRoot });
  for (const n of notes) console.log(`  · ${n}`);
  if (problems.length) {
    console.error('\n✖ GATE PRÉ-DEPLOY REPROVOU — nada foi publicado:');
    for (const p of problems) console.error(`  ✖ ${p}`);
    process.exit(1);
  }
  console.log('✓ gate pré-deploy aprovado');
}
