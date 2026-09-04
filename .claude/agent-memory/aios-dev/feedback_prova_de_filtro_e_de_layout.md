---
name: prova-de-filtro-e-de-layout
description: Como produzir contraprova falsificável para filtro de API (count no content-range) e para layout de relatório impresso (probe byte-idêntica + render A4 headless)
metadata:
  type: feedback
---

Filtro de API só está provado quando o **total muda** com o filtro e **volta** sem ele; layout
de impressão só está provado quando a folha é **medida**, não olhada.

**Why:** filtro pode ser decorativo e passar por verde — no PostgREST, `.eq("embed.col", v)`
**sem `!inner`** faz left join e devolve TODOS os registros, sem erro (medido: 200 com filtro,
200 sem). Um "funcionou" baseado em "a tela mostrou algo" não distingue os dois casos. E "não
quebrou o A4" sem número é opinião.

**How to apply:**
- Contagem sem baixar o payload: `curl -sI` no PostgREST com `-H "Prefer: count=exact"` e ler
  `content-range: 0-9/10`. Duas chamadas (com e sem o parâmetro) + uma de controle (o mesmo
  `.eq` **sem** `!inner`) fecham a semântica. Só `GET`, e o org precisa entrar explícito no
  filtro porque service role bypassa RLS.
- Para provar que **o código** manda aquela string (e não só que o banco a honra), teste com
  stub do builder do supabase: capture o argumento de `.select()` e a lista de `.eq()`. Mutar o
  select para `!inner` sempre / nunca / sem o `.eq` tem que produzir 3 vermelhos distintos.
- Função privada em arquivo `"use client"`: gerar cópia **byte-idêntica** ao lado
  (`sed 's/^function X(/export function X(/'`), importar por `tsx`, medir, e **apagar a cópia**.
  Provar por `diff` que a única diferença são os 7 bytes de `export ` — [[corte-de-escopo-exige-reescrever-comentarios]].
- Layout A4: `playwright` já está no repo. `emulateMedia({media:"print"})` + viewport com a
  largura **imprimível** (210mm − margens do `@page`, não os 794px da folha inteira) e medir
  `scrollWidth > clientWidth` por célula (texto cortado) e `getBoundingClientRect().right`
  contra o limite do body (coluna fora da folha). `page.pdf({format:"A4"})` dá o artefato
  visual, e a ferramenta Read abre PDF por página.
- Sempre medir também o **antes** (`git show main:arquivo`) quando a story fala de aperto de
  largura: a soma das reduções tem que fechar com a largura da coluna nova.
