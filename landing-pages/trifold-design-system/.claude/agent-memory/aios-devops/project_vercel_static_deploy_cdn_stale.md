---
name: vercel-static-deploy-cdn-stale
description: Após deploy do trifold-design-system, arquivos removidos podem responder 200 (cache de edge) por alguns segundos — revalidar antes de concluir falha
metadata:
  type: project
---

Ao validar deploys estáticos do projeto Vercel `trifold-design-system` (deploy direto da pasta, sem git), um asset **removido** pode responder **200 com o conteúdo antigo** logo após o `vercel deploy --prod`, dependendo do PoP de edge que atender o curl. Repetir a checagem alguns segundos depois retorna o 404 correto. Curl esporádico também pode retornar `000` (conexão abortada) — não é falha do deploy.

**Why:** o alias de produção propaga por PoP; o edge que respondeu primeiro ainda servia o objeto do deploy anterior. Em 2026-08-17 isso gerou um falso negativo na validação da conversão PNG→WebP (`hero-b2b.png` apareceu 200/6.1MB e depois 404).

**How to apply:** na validação pós-deploy, rodar a bateria de curl **duas vezes** (ou repetir só as URLs divergentes) antes de reportar falha. Cache-busting via query string NÃO ajuda a diagnosticar (é o mesmo path no edge) — o que resolve é repetir. A URL `*-<hash>-trifold-s-projects.vercel.app` retorna 302 por deployment protection; validar sempre pelo alias `https://trifold-design-system.vercel.app`. Ver [[vercel-landing-pages-projects]] para o método de deploy.

**Asset trocado no mesmo path (nome de arquivo idêntico):** `%{http_code}` e `%{size_download}` não bastam — o edge pode servir a versão antiga com 200. A prova definitiva é comparar o **SHA256 do conteúdo servido com o do arquivo local**: `curl -s "$URL" | shasum -a 256` vs `shasum -a 256 <arquivo>`. Se baterem, o objeto novo está no edge; nenhuma segunda passada é necessária. Usado com sucesso em 2026-08-19 na troca de `assets/path-construir.webp`.
