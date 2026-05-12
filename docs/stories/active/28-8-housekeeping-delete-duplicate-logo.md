# Story 28.8 — Housekeeping: deletar `logo-Trifold-laranja.webp` duplicado da raiz

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["file_deletion_safety", "reference_audit", "build_smoke_test"]

## Story
**As a** desenvolvedor do monorepo Trifold CRM,
**I want** que a raiz do projeto não contenha arquivos de imagem órfãos,
**so that** o repo fique limpo, sem risco de confusão sobre qual logo é o canonical, e sem arquivos tracked desnecessariamente no histórico git.

## Contexto

**Epic 28 — Next.js Config Quick Wins** | Prioridade: P3 (housekeeping, última story do epic)

O arquivo `logo-Trifold-laranja.webp` está na raiz do monorepo (`/logo-Trifold-laranja.webp`) em vez de dentro de `packages/web/public/`. Ele é **tracked** no git mas não é referenciado por nenhum código de produção. O logo canonical utilizado pela aplicação é `packages/web/public/logo-trifold.webp`, referenciado em duas linhas de `packages/web/src/components/layout/sidebar-nav.tsx` (linhas 45 e 101) com o path público `/logo-trifold.webp`.

**Spike de validação (River, 2026-05-12) — resultados:**
- `logo-Trifold-laranja.webp` existe na raiz: **SIM** (2.644 bytes, mtime 2026-03-31)
- Status no git: **TRACKED** — `git ls-files logo-Trifold-laranja.webp` retorna o arquivo
- Referências em `*.ts`, `*.tsx`, `*.json`, `*.md` (exceto docs/audits): **ZERO matches em código**
- Matches em docs/audits: apenas 4 ocorrências documentando o problema em `PERFORMANCE-PLAN.md` e `performance-bundle-audit.md` — esperado, não são referências de código
- `packages/web/public/logo-trifold.webp` existe: **SIM** (mesmo tamanho 2.644 bytes)
- Uso canonical em `sidebar-nav.tsx`: confirmado nas linhas 45 e 101

Como o arquivo está tracked, o comando correto é `git rm` (não `rm`) para remover do working tree e do índice git simultaneamente.

## Acceptance Criteria

1. O arquivo `/Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp` não existe mais no working tree. Validar via `ls /Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp` → deve retornar "No such file or directory".

2. O arquivo `packages/web/public/logo-trifold.webp` permanece intacto (não removido, não modificado). Validar via `ls -la /Users/ogabrielhr/trifold-crm/packages/web/public/logo-trifold.webp` → deve listar o arquivo normalmente.

3. `sidebar-nav.tsx` continua referenciando `/logo-trifold.webp` sem alteração. Validar via `grep "logo-trifold" packages/web/src/components/layout/sidebar-nav.tsx` → deve retornar as duas linhas originais (45 e 101).

4. `grep -rn "logo-Trifold-laranja" /Users/ogabrielhr/trifold-crm --include="*.ts" --include="*.tsx" --include="*.json"` retorna **zero matches** (nenhuma referência restante em código — apenas docs é aceitável e não é escopo desta validação).

5. `pnpm --filter @trifold/web build` completa com exit code 0 sem novos erros ou warnings relacionados a imagens ou assets ausentes.

## Estimativa
**Complexidade:** XS (5 min)
**Story Points:** 1
**Prioridade:** P3 — housekeeping, última story do Epic 28

## Fora do Escopo (OUT)

- Outros arquivos órfãos na raiz (ex: `"docs/Briefing ação de marketing Supermuffato.docx"` — limpeza separada)
- Renomear ou mover o canonical `public/logo-trifold.webp`
- Qualquer alteração em `sidebar-nav.tsx` ou outros componentes
- Purgar o arquivo do histórico git (`git filter-branch` / BFG) — o commit de remoção é suficiente; limpeza de histórico é escopo separado se necessário

## Riscos

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Usar `rm` em vez de `git rm` — arquivo sai do disco mas permanece staged/tracked | Baixa | Dev Notes explicita o comando exato: `git rm logo-Trifold-laranja.webp` |
| Confundir o arquivo canonical com o duplicado e deletar o errado | Baixa | AC 2 e AC 3 verificam explicitamente que o canonical e sidebar-nav estão intactos |
| Build quebrar por referência oculta ao arquivo deletado | Baixa | Spike confirmou zero referências em *.ts/*.tsx/*.json; AC 5 (build check) captura qualquer regressão |

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml`.
> Validação de qualidade via revisão manual pelo quality gate.

## Tasks / Subtasks

### Task 1 — Spike: confirmar pré-condições (1 min)
- [x] 1.1 Confirmar que `logo-Trifold-laranja.webp` ainda existe: `ls -la /Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp` → 2.644 bytes, mtime Mar 31 15:12
- [x] 1.2 Confirmar que está tracked: `git ls-files logo-Trifold-laranja.webp` → arquivo listado
- [x] 1.3 Confirmar zero referências em código: `grep -rn "logo-Trifold-laranja" /Users/ogabrielhr/trifold-crm --include="*.ts" --include="*.tsx" --include="*.json"` → ZERO MATCHES

### Task 2 — Deletar o arquivo via `git rm` (1 min)
- [x] 2.1 Executar: `git rm logo-Trifold-laranja.webp` → output `rm 'logo-Trifold-laranja.webp'`
- [x] 2.2 Confirmar que o arquivo não existe mais no disco: `ls logo-Trifold-laranja.webp` → "No such file or directory"
- [x] 2.3 Confirmar que a deleção está staged: `git status --short logo-Trifold-laranja.webp` → `D  logo-Trifold-laranja.webp`

### Task 3 — Validar canonical e build (2 min)
- [x] 3.1 Confirmar canonical intacto: `ls -la packages/web/public/logo-trifold.webp` → 2.644 bytes, presente
- [x] 3.2 Confirmar sidebar-nav inalterado: `grep "logo-trifold" packages/web/src/components/layout/sidebar-nav.tsx` → linhas 45 e 101 com `/logo-trifold.webp` (originais)
- [x] 3.3 Rodar build: `pnpm --filter @trifold/web build` → EXIT_CODE=0, zero erros/warnings de imagem/asset

### Task 4 — Documentar (1 min)
- [x] 4.1 Atualizar File List nesta story com a deleção
- [x] 4.2 Atualizar Change Log

## Dev Notes

### Comando exato de deleção

O arquivo está **tracked** no git (confirmado pelo spike). Usar `git rm`, não `rm`:

```bash
git -C /Users/ogabrielhr/trifold-crm rm logo-Trifold-laranja.webp
```

Isso remove o arquivo do disco e do índice git em um só passo. O arquivo ficará staged como `deleted:` pronto para commit.

Se por algum motivo o arquivo não estiver mais tracked no momento da execução (ex: outro commit o removeu antes), `rm` simples funciona:

```bash
rm /Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp
```

### Arquivos relevantes

| Path | Papel |
|------|-------|
| `/Users/ogabrielhr/trifold-crm/logo-Trifold-laranja.webp` | Arquivo a DELETAR (tracked, duplicado, sem refs em código) |
| `packages/web/public/logo-trifold.webp` | Canonical — NÃO tocar |
| `packages/web/src/components/layout/sidebar-nav.tsx` | Consumer do canonical (linhas 45 e 101) — NÃO tocar |

### Spike realizado por @sm antes de criar a story (2026-05-12)

- Arquivo na raiz: existe, 2.644 bytes, `mtime` 2026-03-31
- Git status: TRACKED (`git ls-files` retorna o arquivo)
- Referências em código (`*.ts`, `*.tsx`, `*.json`): zero matches
- Matches em docs/audits: 4 ocorrências — apenas documentando o problema, não são imports/referências funcionais
- Canonical `public/logo-trifold.webp`: existe, mesmo tamanho
- Uso em `sidebar-nav.tsx`: linhas 45 e 101 com `/logo-trifold.webp`

### Testing

Não há suite de testes automatizados aplicável a deleção de arquivo. Validação via:

1. `ls` — confirma deleção física
2. `git status` — confirma staged como deleted
3. `grep` — confirma zero referências residuais em código
4. `pnpm --filter @trifold/web build` — gate definitivo de regressão

## File List

| Arquivo | Ação | Notas |
|---------|------|-------|
| `logo-Trifold-laranja.webp` | DELETED | Logo duplicado na raiz — tracked, zero refs em código |

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-12 | 1.0 | Story criada — Epic 28.8, housekeeping: deleção de logo duplicado da raiz. Spike pre-story confirmou: arquivo tracked, zero referências em código, canonical intacto em public/. | River (@sm) |
| 2026-05-12 | 1.1 | Implementação completa: arquivo deletado via `git rm logo-Trifold-laranja.webp` (staged como `D`), build `pnpm --filter @trifold/web build` PASS (exit code 0, zero erros/warnings de imagem/asset), canonical `public/logo-trifold.webp` e `sidebar-nav.tsx` intactos. Todos os 5 ACs validados. Aguardando @qa gate. | Dex (@dev) |
| 2026-05-12 | 1.2 | QA Gate PASS — 5 ACs validados, deleção staged (`D`), canonical intacto, zero refs em código, build exit 0. Status Ready → Done. | Quinn (@qa) |

## QA Results

**Verdict:** PASS
**Reviewer:** Quinn (@qa) | 2026-05-12
**Gate file:** `docs/qa/gates/28-8-qa-gate.md`

Todos os 5 ACs verificados:
- AC1: `logo-Trifold-laranja.webp` ausente do working tree
- AC2: Canonical `packages/web/public/logo-trifold.webp` intacto
- AC3: `sidebar-nav.tsx` linhas 45 e 101 referenciam `/logo-trifold.webp` (inalterado)
- AC4: Zero refs em `*.ts`/`*.tsx`/`*.json`
- AC5: `pnpm --filter @trifold/web build` exit 0, sem warnings de asset

Status: Done. Pronto para `@devops *push`.
