// Story 90-1 — infraestrutura compartilhada dos scripts de pré-renderização.
//
// POR QUE ISTO EXISTE. O site institucional (`trifold.eng.br`) é um export do
// Claude Design canvas: HTML cru com `<x-dc>` + `support.js`, renderizado 100%
// no cliente. Um crawler sem JS recebe `{{ s.heading }}` e `<sc-for …>` em vez de
// texto real. Para consertar isso sem poder tocar no runtime (`support.js` é
// GERADO fora deste repo — ver `dc-runtime/` inexistente), a 90-1 tira um
// snapshot com headless browser e o publica ao lado do template.
//
// Este módulo concentra as três peças que TODOS os scripts da 90-1 precisam:
//   1. a tabela de rotas, que espelha os `rewrites` do `vercel.json`;
//   2. um servidor estático local que reproduz esses rewrites, para o headless
//      browser carregar as páginas pelas MESMAS URLs limpas de produção
//      (importa: as páginas referenciam `assets/…` e `./support.js` de forma
//      RELATIVA — carregar por `file://` ou por `/Home.dc.html` muda a base e
//      produz um snapshot diferente do que vai para produção);
//   3. o predicado de "o runtime dc terminou de montar", usado tanto para tirar
//      o snapshot quanto para os testes de verificação.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * As 5 páginas institucionais do escopo da Story 90-1.
 *
 * `route` é a URL limpa pública (Story 90-6, já em produção); `file` é o arquivo
 * `.dc.html`-fonte que o `rewrite` do `vercel.json` serve naquela rota.
 * `Artigo.dc.html`, `Design System.dc.html` e `Logo.dc.html` estão FORA de escopo
 * (ver "Fora de escopo" na story) — `Logo.dc.html` continua sendo copiado para o
 * `dist/` porque é carregado em runtime por `<dc-import name="Logo">`.
 */
export const PAGES = [
  { id: 'home', route: '/', file: 'Home.dc.html' },
  { id: 'sobre-nos', route: '/sobre-nos', file: 'sobre-nos.dc.html' },
  { id: 'empreendimentos', route: '/empreendimentos', file: 'Empreendimentos.dc.html' },
  { id: 'corporativas', route: '/corporativas', file: 'B2B.dc.html' },
  { id: 'blog', route: '/blog', file: 'Blog.dc.html' },
];

export const ROUTE_MAP = Object.fromEntries(PAGES.map((p) => [p.route, p.file]));

/**
 * Confere que a tabela acima continua batendo com os `rewrites` do `vercel.json`.
 * Se alguém adicionar uma página nova no `vercel.json` e esquecer daqui, o
 * prerender silenciosamente pularia essa página — este check transforma isso em
 * erro alto em vez de regressão invisível de SEO.
 */
export async function assertRoutesMatchVercelJson(root = SITE_ROOT) {
  const cfg = JSON.parse(await fsp.readFile(path.join(root, 'vercel.json'), 'utf8'));
  const fromVercel = (cfg.rewrites || [])
    .filter((r) => typeof r.destination === 'string' && r.destination.endsWith('.dc.html'))
    .map((r) => [r.source, r.destination.replace(/^\//, '')]);

  const mismatches = [];
  for (const [source, dest] of fromVercel) {
    if (ROUTE_MAP[source] !== dest) mismatches.push(`vercel.json: ${source} -> ${dest} (dc-site.mjs: ${ROUTE_MAP[source] ?? 'ausente'})`);
  }
  for (const [route, file] of Object.entries(ROUTE_MAP)) {
    if (!fromVercel.some(([s, d]) => s === route && d === file)) mismatches.push(`dc-site.mjs: ${route} -> ${file} (sem rewrite equivalente no vercel.json)`);
  }
  if (mismatches.length) {
    throw new Error(`Tabela de rotas divergiu do vercel.json:\n  - ${mismatches.join('\n  - ')}`);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Servidor estático que reproduz os rewrites de URL limpa do `vercel.json`.
 * Deliberadamente burro: só GET/HEAD, sem cache, sem diretório-índice.
 */
export function createStaticServer(root) {
  const abs = path.resolve(root);
  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const mapped = ROUTE_MAP[pathname] ?? pathname.replace(/^\/+/, '');
    const target = path.resolve(abs, mapped);
    // Barreira de path traversal — o snapshot roda com a árvore real do site.
    if (target !== abs && !target.startsWith(abs + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(target, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
}

/** Sobe o servidor numa porta efêmera e devolve `{ origin, close() }`. */
export async function startStaticServer(root) {
  const server = createStaticServer(root);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * "O runtime dc terminou de montar" — `boot()` substitui o `<x-dc>` por um
 * `<div id="dc-root">` e só então o React renderiza dentro dele. Enquanto
 * `#dc-root` não tiver filhos, nada montou.
 *
 * Esta é a MESMA condição que o script inline injetado no HTML de saída usa para
 * remover o `#dc-prerender` (AC6a) — manter as duas em sincronia é o ponto.
 */
export const DC_MOUNTED = () => {
  const r = document.getElementById('dc-root');
  return !!(r && r.childNodes.length > 0);
};

export const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

/** Viewport usado para gerar o snapshot — mobile, porque o Googlebot é mobile-first. */
export const SNAPSHOT_VIEWPORT = VIEWPORTS.mobile;
