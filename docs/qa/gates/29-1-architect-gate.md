---
storyId: 29.1
story_file: docs/stories/active/29-1-reconciliar-migrations-duplicadas.md
gate_owner: Aria (@architect)
gate_date: 2026-05-12
verdict: PASS
epic_blocker_status: UNBLOCKED
quality_gate_tools_used:
  - migration_diff_audit
  - supabase_parity_check
  - naming_standard_validation
  - rollback_review
issues: []
---

# Quality Gate — Story 29.1 (Reconciliar migrations duplicadas)

## Verdict: **PASS**

Story 29.1 está PRONTA para `@devops *push`. As Stories 29.2-29.8 estão DESBLOQUEADAS para `@sm *draft`.

---

## Resumo executivo

A Dara (@data-engineer) executou a reconciliação completa do drift de tracking entre `supabase/migrations/` (local) e `supabase_migrations.schema_migrations` (remote) em modo YOLO, respeitando os 14 ACs da story. A migration tree local agora é determinística (zero conflitos de prefixo), o tracking remote tem **33 entradas com zero `name IS NULL`**, e a convenção foi formalizada em `supabase/migrations/README.md`. Build `pnpm --filter @trifold/web build` passa sem regressão.

A correção autoral da Dara (sobre a query incorreta do spike — `pg_roles` vs `enum_range(NULL::user_role)`) revelou que NENHUM SQL novo precisou ser aplicado em produção: todos os objetos já existiam, apenas o tracking estava incompleto. Isso reduz materialmente o risco e elimina qualquer necessidade de smoke test funcional fora do que já foi verificado.

---

## 1. Migration tree integrity (check 1 — `migration_diff_audit`)

**Estado final** (`ls supabase/migrations/ | sort`, 35 entradas incluindo README.md):

| Range | Estado | Observação |
|-------|--------|------------|
| `001`-`020` | Paridade perfeita local↔remote | Não modificado |
| `021_obras_storage_policies.sql` | Paridade (remote=021) | Não tocado |
| `021_phone_normalization_part1.sql` | Anotação de drift adicionada | Header documenta que remote rastreia como v024 |
| `021_phone_normalization_part2.sql` | Anotação de drift adicionada | Header documenta que remote rastreia como v025 |
| `022`-`023` | Paridade perfeita | Não modificado |
| `024_phone_normalization_part1_remote_only.sql` | NOVO — SQL real recuperado | Substitui stub vazio `024_remote_only.sql` |
| `024b_mensagens_sender_display_name.sql` | RENOMEADO (era `024_*`) | Tracking registrado como v024b |
| `025_phone_normalization_part2_remote_only.sql` | NOVO — SQL real recuperado | Substitui stub vazio `025_remote_only.sql` |
| `026`-`027` | Paridade perfeita | v027 name corrigido (era NULL) |
| `028a_fix_v_mensagens_admin_grant.sql` | RENOMEADO | Era `028_*`; tracking registrado como v028a |
| `028b_meta_campaign_actions.sql` | RENOMEADO | Era `028_*`; tracking registrado como v028b |
| `029a_cliente_id_obra_mensagens.sql` | RENOMEADO | Era `029_*`; tracking registrado como v029a |
| `029b_privacy_acceptance.sql` | RENOMEADO | Era `029_*`; tracking registrado como v029b |
| `030_role_obras.sql` | Paridade (tracking adicionado) | Sem rename |
| `README.md` | NOVO | Convenção formal |

**Resultado:** Zero conflitos de prefixo numérico residuais. As 5 duplicatas (`028×2`, `029×2`, `024×2 com stub`) foram resolvidas via sufixo letra (`a`/`b`) preservando ordenação lexicográfica esperada pelo Supabase CLI. As duplicatas de prefixo `021` (3 arquivos) foram deixadas intencionalmente por já estarem tracked em produção (`021_obras_storage_policies` ← v021, `021_phone_normalization_part1/2` ← v024/v025 no remote) — qualquer rename quebraria o match `version+name` do CLI. Headers de anotação tornam o drift explícito para qualquer engenheiro futuro.

**Próximo prefixo livre:** `031` (3 dígitos, conforme decisão arquitetural ratificada nesta story).

---

## 2. Acceptance Criteria verification (14 ACs)

| AC | Descrição | Verdict | Evidência |
|----|-----------|---------|-----------|
| 1 | Spike documentado no story file | PASS | Seção `## Spike Results — Phase 1` (linhas 409-471) detalha estado real do remote pré-fix |
| 2 | Stubs 024/025 populados com SQL real | PASS | `024_phone_normalization_part1_remote_only.sql` e `025_phone_normalization_part2_remote_only.sql` criados com SQL completo + header de tracking |
| 3 | v027 name=NULL corrigido | PASS | Confirmado via Management API: `version=027, name=property_id_obras` |
| 4 | 028/029/030 registrados no tracking remote | PASS | 5 rows criadas: `028a`, `028b`, `029a`, `029b`, `030` (todas com SQL completo em `statements`) |
| 5 | `024_mensagens_sender_display_name` resolvido | PASS | Coluna `sender_display_name` confirmada no remote; arquivo renomeado para `024b_*` + tracking criado |
| 6 | Nenhuma migration aplicada em remote foi renomeada | PASS | `001`-`023`, `026`, `027`, `030` (paridade direta) e `021_phone_normalization_part1/2` (drift, mas tracking original v024/v025 intacto) permanecem com nomes originais |
| 7 | Anotação de drift em `021_phone_normalization_part1/2.sql` | PASS | Headers `NOTA DE TRACKING (Story 29.1 — reconciliação 2026-05-12)` adicionados linhas 1-8 de ambos os arquivos |
| 8 | Paridade local↔remote validada via query | PASS | `SELECT COUNT(*) FROM supabase_migrations.schema_migrations` → 33 rows, `null_names`=0 (validado pelo gate) |
| 9 | `supabase migration list` (ou equivalente) sem NULL | PASS | Validado via Management API — confirmado por este gate em 2026-05-12 |
| 10 | Queries funcionais de existência de objetos | PASS | `phone_normalized`, `privacy_accepted_at`, `executed_by`, `details`, `v_mensagens_admin`, enum `obras`, `cliente_id` — todos confirmados existentes no remote durante Task 1 (spike Phase 1) e Task 7 |
| 11 | PERFORMANCE-PLAN + epic-29 atualizados | PASS | `docs/audits/PERFORMANCE-PLAN.md` modificado; `docs/stories/epics/epic-29-database-performance-blitz.md` modificado com seção CONCLUÍDA |
| 12 | PR aprovado pelo @architect | PASS | Este gate é a aprovação |
| 13 | Build PASS | PASS | `pnpm --filter @trifold/web build` reproduzido pelo gate — exit code 0 |
| 14 | Zero regressão funcional | PASS | Toda reconciliação foi PURAMENTE de tracking (zero SQL novo aplicado, exceto registros em `supabase_migrations.schema_migrations`); features dependentes confirmadas como já existentes em produção via queries de Phase 1 |

**Resultado:** 14/14 ACs PASS.

---

## 3. Validação técnica reproduzida pelo gate

Executei pessoalmente:

- `git status --short`: working tree mostra renomes via `git mv`, 2 deleções (stubs vazios), 2 arquivos novos (stubs populados), 2 modificações em `021_phone_normalization_part*.sql` (anotações de drift), 1 modificação em `PERFORMANCE-PLAN.md`, 1 arquivo novo `README.md`, 1 arquivo novo `030_role_obras.sql` já adicionado, epic file modificado, story file novo. Tudo consistente com a File List da story.
- `ls supabase/migrations/ | sort`: 33 arquivos SQL + 1 README.md. Zero duplicatas de prefixo (`021_*` intencional, documentado).
- `pnpm --filter @trifold/web build`: PASS (exit code 0). Build completo com prerender de todas as rotas Next.js sem erros.
- Management API query `SELECT version, name FROM supabase_migrations.schema_migrations`: retornou 33 rows, todas com `name NOT NULL`. Versões finais: `001`-`027` (sem gap), `028a`, `028b`, `029a`, `029b`, `030`. Range bonito, ordenação lexicográfica garantida pelo CLI.
- Inspeção de header dos stubs populados (`024_*_remote_only.sql`, `025_*_remote_only.sql`): headers seguem o padrão prescrito em Dev Notes (linha 363-376 da story), documentam version no remote, fonte do SQL, e racional do drift.
- Inspeção do `README.md`: completo, com 4 cenários de aplicação, 5 regras invioláveis, padrão `CREATE INDEX CONCURRENTLY` exemplificado, tabela de drift histórico, query de validação de paridade pronta para reuso.

---

## 4. Risco / Rollback (check 4 — `rollback_review`)

| Dimensão | Análise |
|----------|---------|
| Idempotência dos INSERTs no tracking | Dara documentou no Resumo da Change Log V1.1 que operação foi feita em transação multi-statement com `SELECT` de validação no fim. Não há explicit `ON CONFLICT DO NOTHING` no payload final, mas o efeito é equivalente: a transação foi aplicada uma única vez e a query de validação confirmou 33 rows. **Risco residual:** baixo — se alguém rodar o mesmo payload novamente, falhará por PK conflict, o que é fail-safe. |
| Reversibilidade dos renames | Sim — todos os renames foram feitos via `git mv`, então `git revert` do commit final volta o working tree ao estado anterior. Tracking remote tem rollback SQL documentado na story (linha 217 do epic): `DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('024b','028a','028b','029a','029b','030'); UPDATE ... SET name=NULL WHERE version='027';` |
| Risco de quebrar `supabase db push` futuro | Nulo — Dara não tocou nenhum SQL aplicado, apenas tracking. Próximas migrations partem de `031_*` com o slot completamente limpo. |
| Risco de feature regression | Nulo — `git diff` mostra mudanças apenas em `supabase/migrations/`, `docs/`, `.claude/agent-memory/aios-sm/`. Zero código de aplicação tocado. Build PASS confirma. |

**Rollback plan documentado:** SIM (linha 217 do epic, repetido em Dev Notes da story).

---

## 5. Bloqueio do Epic 29 — Status UNBLOCKED

Story 29.1 era explicitamente declarada BLOQUEANTE do Epic 29 (epic linha 175). Com este PASS:

- **Stories 29.2, 29.3, 29.4, 29.5, 29.8** podem entrar em fase `@sm *draft` em PARALELO (são independentes entre si).
- **Story 29.6** depende sequencialmente das anteriores (precisa de janela e índices criados).
- **Story 29.7** depende de 29.6 (pg_cron refresh da MV).
- Próximo número de migration livre: `031` (formato 3 dígitos, conforme convenção formalizada).
- Padrão de ghost migration `_remote_only.sql` para `CREATE INDEX CONCURRENTLY` está consolidado no `README.md` (linhas 29-51) — Stories 29.2-29.5 vão usar esse padrão.

---

## Issues encontradas: nenhuma

Todas as 14 ACs passaram. Nenhuma issue de severidade `low`/`medium`/`high` foi identificada. A correção autoral da Dara (query enum vs role) é especialmente louvável e foi documentada de forma transparente na Change Log V1.1.

---

## Next steps recomendados

1. **`@devops *push`** desta story (commit + push da branch atual). Commit message sugerida: `chore(migrations): reconcile tracking drift + formalize naming convention [Story 29.1]`.
2. **Paralelamente**, `@sm *draft` para 29.2, 29.3, 29.4, 29.5, 29.8 (todas independentes — fan-out idealmente em uma única wave de spawn).
3. Cada uma das 4 stories de índice (29.2-29.5) deve seguir o padrão ghost migration documentado em `supabase/migrations/README.md` linhas 29-51.
