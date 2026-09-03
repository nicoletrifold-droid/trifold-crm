// Story 90-1 — montagem do `dist/` (build-output separado, AC0 + AC5).
//
// POR QUE UM BUILD-OUTPUT SEPARADO, E NÃO PRERENDER IN-PLACE. Sobrescrever os
// `.dc.html` versionados destruiria o `<x-dc>`, e sem `<x-dc>` o `boot()` do
// `support.js` não tem o que montar — o site vira uma página morta (ver o
// cabeçalho de `prerender.mjs`). Os `.dc.html` continuam sendo a ÚNICA fonte
// editável/auditável; o `dist/` é sempre regenerado a partir deles e nunca
// editado à mão. Por isso `dist/` está no `.gitignore`.
//
// POR QUE A MONTAGEM NÃO É UM `cp -r` TRIVIAL. O deploy só funciona com
// `support.js`, `api/`, `vercel.json`, `.vercelignore` E os ~77 MB de
// `assets/`+`uploads/` que NÃO estão no git. É uma etapa de assembly com
// verificação, e a lista do que entra é uma ALLOWLIST explícita — não uma
// denylist. Motivo concreto: esta story criou `scripts/`, `dist/` e
// `.seo-metrics/` (que guarda screenshots de baseline) dentro da pasta do site.
// Com denylist, um deploy futuro publicaria tudo isso por omissão.
//
// AC5 — FALHA DE UMA PÁGINA NÃO DERRUBA O DEPLOY. Se o prerender de UMA página
// falhar, essa página fica com o `.dc.html`-fonte original (comportamento de
// hoje: client-render puro, sem o ganho de SEO), o erro é logado alto, e as
// outras 4 seguem com o snapshot. O deploy continua.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { PAGES, SITE_ROOT, assertRoutesMatchVercelJson } from './dc-site.mjs';
import { prerenderAll } from './prerender.mjs';

/** Tudo que compõe um deploy funcional do site. Nada fora desta lista sobe. */
const ASSEMBLY = {
  globs: [/\.dc\.html$/],
  files: ['support.js', 'vercel.json', '.vercelignore', '.thumbnail'],
  dirs: ['api', 'assets', 'uploads', 'preview', 'brand_imgs'],
  /** Sem estes o snapshot sai com imagem quebrada e o site vai ao ar sem mídia. */
  requiredDirs: ['assets', 'uploads'],
  /**
   * Vínculo com o projeto Vercel (achado QA-1 do gate da Story 90-1).
   *
   * O deploy roda de DENTRO do `dist/`, e a CLI da Vercel resolve o projeto pelo
   * `.vercel/project.json` do diretório em que roda. Como `assemble()` apaga e
   * recria o `dist/` a cada build, um `vercel link` feito à mão ali não sobrevive
   * ao build seguinte — e sem o vínculo o `vercel deploy` **cria um projeto novo
   * do zero** com o nome da pasta, em vez de publicar em
   * `trifold-s-projects/trifold-design-system`. Copiar o vínculo é o que fecha isso.
   *
   * `--cwd dist` NÃO resolve: medido na CLI 54.6.1, a flag move também a busca do
   * vínculo, dando o mesmo "Your codebase isn't linked to a project on Vercel".
   *
   * `.vercel/cache/` fica de fora de propósito (cache de build, irrelevante e
   * pesado). O `.vercel` inteiro está no `.vercelignore`, então o vínculo é usado
   * para resolver o projeto mas nunca é publicado.
   */
  linkFiles: ['project.json', 'README.txt'],
  requiredLinkFile: 'project.json',
};

/**
 * O `dist/` precisa herdar o vínculo do projeto Vercel. Falha ALTO se o vínculo
 * não existir na pasta-fonte: publicar sem vínculo não é uma degradação, é
 * publicar no lugar errado.
 */
async function copyProjectLink(srcRoot, outRoot) {
  const from = path.join(srcRoot, '.vercel');
  const to = path.join(outRoot, '.vercel');
  const required = path.join(from, ASSEMBLY.requiredLinkFile);
  try {
    await fsp.access(required);
  } catch {
    throw new Error(
      `.vercel/${ASSEMBLY.requiredLinkFile} não existe na pasta-fonte.\n` +
        `  Sem ele o 'vercel deploy' de dentro do dist/ CRIA UM PROJETO NOVO em vez de\n` +
        `  publicar em trifold-s-projects/trifold-design-system. Rode:\n` +
        `    vercel link --yes --scope trifold-s-projects --project trifold-design-system`
    );
  }
  await fsp.mkdir(to, { recursive: true });
  const copied = [];
  for (const name of ASSEMBLY.linkFiles) {
    try {
      await fsp.copyFile(path.join(from, name), path.join(to, name));
      copied.push(name);
    } catch {
      /* README.txt é opcional */
    }
  }
  return copied;
}

export async function assertMediaPresent(root = SITE_ROOT) {
  const missing = [];
  for (const dir of ASSEMBLY.requiredDirs) {
    const abs = path.join(root, dir);
    let count = 0;
    try {
      count = (await fsp.readdir(abs)).length;
    } catch {
      /* fica 0 */
    }
    if (count === 0) missing.push(dir);
  }
  if (missing.length) {
    throw new Error(
      `Mídia ausente: ${missing.join(', ')}.\n` +
        `  Estes ~77 MB não estão no git (ver .gitignore). Baixe-os do deployment de\n` +
        `  produção atual antes de montar o dist/ — sem eles o snapshot sai com imagem\n` +
        `  quebrada e o site vai ao ar sem mídia. Ver README.md.`
    );
  }
}

async function assemble(srcRoot, outRoot) {
  // GUARDA DESTRUTIVA. A linha abaixo é um `rm -rf` no `outRoot`, e o `outRoot`
  // vem de `process.argv[2]`. Um `node scripts/build-dist.mjs .` (ou `..`)
  // apagaria a pasta-fonte inteira — incluindo os ~77 MB de `assets/` e
  // `uploads/`, que NÃO estão no git e só se recuperam baixando do deployment
  // de produção. O `deploy.sh` nunca passa argumento, mas o script é chamável
  // à mão; um erro de digitação não pode custar a pasta-fonte.
  const src = path.resolve(srcRoot);
  const out = path.resolve(outRoot);
  const outAsPrefix = out.endsWith(path.sep) ? out : out + path.sep; // cobre '/' e 'C:\\'
  const ehFonteOuAncestral = out === src || src.startsWith(outAsPrefix);
  // `dist/` é filho legítimo de srcRoot, então não dá para barrar descendentes em
  // bloco — mas os diretórios do assembly são justamente os que não estão no git.
  const ehDiretorioDoAssembly =
    path.dirname(out) === src && ASSEMBLY.dirs.includes(path.basename(out));
  if (ehFonteOuAncestral || ehDiretorioDoAssembly) {
    throw new Error(
      `outRoot inválido: '${out}'.\n` +
        `  ${ehDiretorioDoAssembly ? 'É um diretório do assembly (não versionado).' : `É a pasta-fonte ou contém ela ('${src}').`}\n` +
        `  O build apaga o outRoot antes de montar — isso destruiria fontes e/ou a\n` +
        `  mídia que não está no git. Use um diretório separado (o padrão é 'dist/').`
    );
  }

  await fsp.rm(outRoot, { recursive: true, force: true });
  await fsp.mkdir(outRoot, { recursive: true });

  const copied = [];
  for (const name of await fsp.readdir(srcRoot)) {
    if (!ASSEMBLY.files.includes(name) && !ASSEMBLY.globs.some((re) => re.test(name))) continue;
    await fsp.copyFile(path.join(srcRoot, name), path.join(outRoot, name));
    copied.push(name);
  }
  for (const dir of ASSEMBLY.dirs) {
    const from = path.join(srcRoot, dir);
    try {
      await fsp.access(from);
    } catch {
      continue;
    }
    await fsp.cp(from, path.join(outRoot, dir), { recursive: true });
    copied.push(dir + '/');
  }
  const link = await copyProjectLink(srcRoot, outRoot);
  copied.push(`.vercel/{${link.join(',')}}`);
  return copied;
}

export async function buildDist({ srcRoot = SITE_ROOT, outRoot = path.join(SITE_ROOT, 'dist') } = {}) {
  await assertRoutesMatchVercelJson(srcRoot);
  await assertMediaPresent(srcRoot);

  console.log('→ [1/2] montando dist/ (allowlist explícita)');
  const copied = await assemble(srcRoot, outRoot);
  console.log(`  ✓ ${copied.length} entradas copiadas: ${copied.join(' ')}`);

  console.log(`→ [2/2] pré-renderizando ${PAGES.length} páginas (viewport mobile 390px)`);
  const results = await prerenderAll({ srcRoot, outRoot });

  const failed = [];
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.route.padEnd(17)} ${r.stats.textLength} chars de texto, ${r.stats.headings} headings (${r.stats.h1} h1), ${r.stats.links} links, removidos ${JSON.stringify(r.stats.removed)}`);
    } else {
      // AC5: alto e explícito, mas NÃO aborta.
      console.error(`  ⚠ FALLBACK ${r.route} — prerender falhou: ${r.error}`);
      console.error(`    → ${r.file} fica com o .dc.html-fonte original (client-render puro, sem o ganho de SEO desta story).`);
      failed.push(r);
    }
  }
  // O `assemble()` já copiou o fonte original de todas as páginas; uma página que
  // falhou simplesmente não foi sobrescrita. O fallback do AC5 é, por construção,
  // "não escrever" — não há passo de restauração que possa esquecer de rodar.

  const report = { builtAt: new Date().toISOString(), srcRoot, outRoot, copied, pages: results };
  const reportDir = path.join(srcRoot, '.seo-metrics');
  await fsp.mkdir(reportDir, { recursive: true });
  await fsp.writeFile(path.join(reportDir, 'build-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  if (failed.length === PAGES.length) {
    throw new Error('nenhuma página pré-renderizou — isso não é fallback, é o mecanismo quebrado');
  }
  console.log(`→ dist/ pronto: ${results.length - failed.length}/${results.length} páginas pré-renderizadas${failed.length ? `, ${failed.length} em fallback` : ''}`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SITE_ROOT, 'dist');
  try {
    await buildDist({ outRoot });
  } catch (err) {
    // As falhas daqui são pré-condições acionáveis (mídia ausente, vínculo
    // Vercel ausente), não bugs — a mensagem importa mais que o stack.
    console.error(`\n✖ ${err.message}`);
    process.exit(1);
  }
}
