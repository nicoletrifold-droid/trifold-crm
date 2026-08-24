---
name: artefato-gerado-vs-template-qa
description: Quando o cabeçalho de um arquivo .generated vive num template dentro do gerador e regerar exige credencial que não temos, o @qa prova equivalência por sha256 + determinismo + estabilidade à reordenação
metadata:
  type: project
---

No Trifold há artefatos gerados cujo **template vive dentro do próprio gerador**
(`scripts/generate-schema-snapshot.ts` → `renderOrgScopedTablesModule()` →
`packages/web/src/lib/supabase/org-scoped-tables.generated.ts`). Regerar de verdade exige
`SUPABASE_MANAGEMENT_PAT`, que a máquina de review não tem — então template e arquivo commitado são
editados **em par, à mão**, e podem divergir sem ninguém perceber.

**Why:** se divergirem, o arquivo commitado deixa de ser o que o gerador produz e a próxima
regeneração legítima vira um **diff fantasma** — alguém abre um PR de codegen com mudanças que não
pediu e assume que o gerador está quebrado. Aconteceu como risco real na Story `900-14b`, quando o
corte de escopo obrigou a reescrever o cabeçalho nos dois lugares.

**How to apply — a prova que o @qa refaz de forma independente:**
- Importar a função de render direto do gerador e alimentá-la com o artefato-fonte **já commitado**.
  Cuidado com guard de `argv`: `generate-schema-snapshot.ts` só roda `main()` se
  `process.argv[1]?.includes("generate-schema-snapshot")` — nomear o script de prova de outra forma.
- Comparar **sha256 e bytes**, não só tamanho.
- Conferir **determinismo** (render 2x → mesmos bytes) e **estabilidade à reordenação da entrada**
  (embaralhar `schema.tables` → mesmos bytes). O segundo é o que garante que a ordem em que o
  Postgres devolve tabelas não gere diff espúrio; depende de o gerador ordenar
  (`[...new Set(...)].sort()`).
- Rodar a prova de um script **fora do repo** (scratchpad) — não adicionar artefato numa story de
  hotfix.
- Baseline medido na 900-14b: 3321 bytes, sha256 `b2a45532432e08bc5e20f716877f05843186fcbae42668d7d3268c44523f57f6`,
  92 de 120 tabelas com `org_id` (snapshot `capturedAt 2026-08-23T12:39:14.292Z`).

**Escritor único importa para classificar risco.** Antes de chamar "falta check de sincronia" de
severidade alta, verificar quem escreve o artefato-fonte: `generate-schema-snapshot.ts` é o **único**
escritor de `docs/audits/schema-snapshot.json` (`gate-tenancy.ts` só lê). Sem caminho automatizado
que atualize um sem o outro, a divergência exige edição manual — risco LOW, não MEDIUM.

Ver [[vercelignore-trap-qa]].
