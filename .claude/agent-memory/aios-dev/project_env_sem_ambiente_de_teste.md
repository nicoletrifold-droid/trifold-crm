---
name: env-sem-ambiente-de-teste
description: Neste working copy não existe env de teste — packages/web/.env.local aponta para PRODUÇÃO, ao contrário do que o CLAUDE.md descreve
metadata:
  type: project
---

Medido em 04/09/2026: `packages/web/` contém só `.env.development.example` e **`.env.local`**,
e esse `.env.local` aponta para `dsopqkqjkmhytudaaolv` (**produção**, com service role). Não
existem `packages/web/.env.development`, `.env.producao.local`, `.env.teste` nem `.env.producao`.

**Why:** o CLAUDE.md descreve o mundo pós-Story 900-3b ("o default do repositório é TESTE",
`.env.local` renomeado). Nesta cópia de trabalho isso não é verdade — quem seguir o CLAUDE.md
e assumir que `pnpm dev` fala com o banco de teste vai mexer em produção sem perceber.

**How to apply:** antes de validar story contra "dado real", conferir com
`ls -a packages/web | grep env` e `grep -o 'https://[a-z]*\.supabase\.co'` qual é o alvo. Se o
alvo for produção: **somente leitura** (`GET`), nunca `POST/PATCH/DELETE`, nunca migration — e
dizer no relatório que a medição foi em produção. Reconferir a cada sessão: isso muda por
máquina e por checkout. Relacionado: [[prova-de-filtro-e-de-layout]].
