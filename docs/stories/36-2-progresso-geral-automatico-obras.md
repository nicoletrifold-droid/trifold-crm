# Story 36-2: Progresso Geral Automático de Obras

## Status
Draft

## Complexity
M (Medium) — migration com função PL/pgSQL + trigger + seed de recalculo + remoção de input manual no modal + bloqueio no PATCH handler

## Executor Assignment
```yaml
executor: "@data-engineer"
quality_gate: "@dev"
quality_gate_tools: ["npm run typecheck", "npm run lint"]
```

## Story

**As a** administrador que gerencia obras,
**I want** que o progresso geral da obra seja calculado automaticamente com base nas fases e suas durações planejadas,
**so that** o percentual exibido reflita a realidade de execução sem que eu precise atualizá-lo manualmente.

## Acceptance Criteria

1. Existe uma migration `051_obra_progress_auto.sql` que cria a função `recalculate_obra_progress(p_obra_id uuid) RETURNS void` em PostgreSQL. A função calcula o progresso ponderado por duração e faz `UPDATE obras SET progress_pct = <resultado>` para a obra indicada.

2. A fórmula da função é:
   - Para cada fase da obra: `peso_i = MAX(expected_end_date_i - expected_start_date_i, 1)` em dias, SE ambas as datas planejadas existirem; SENÃO `peso_i = 1`.
   - `progresso_geral = ROUND( SUM(progress_pct_i * peso_i) / SUM(peso_i) )`, clamped entre 0 e 100 como integer.
   - Se a obra não tem fases (ou todas têm `progress_pct = 0` e sem datas), o resultado é `0`.

3. A migration cria o trigger `trigger_obra_fases_progress` na tabela `obra_fases`, disparado `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`, que chama `recalculate_obra_progress` passando `NEW.obra_id` (ou `OLD.obra_id` em DELETE). O trigger garante que qualquer criação, edição ou exclusão de fase recalcula automaticamente o progresso da obra pai.

4. A migration executa `recalculate_obra_progress(id)` para todas as obras existentes (seed de recálculo) após criar a função e o trigger. Isso garante que obras já cadastradas tenham o `progress_pct` atualizado com base nas fases existentes.

5. O campo `progress_pct` é **removido** do formulário de edição de obra (`obra-edit-modal.tsx`): o input `type="number"` de "Progresso (%)" é excluído do JSX, o estado `progressPct` / `setProgressPct` é removido do componente, e o campo `progress_pct` é removido do body do PATCH enviado pelo modal. A interface não exibe mais esse campo como editável — o valor continua sendo exibido na page como read-only (barra de progresso no `page.tsx`, que não muda).

6. O handler PATCH em `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` para de aceitar `progress_pct` no body: o bloco `if (typeof body.progress_pct === "number" ...)` que popula `updates.progress_pct` é removido. A lógica de `notifyClientes` ao atualizar progresso também é removida (já que o progresso não é mais atualizado via PATCH — é calculado via trigger). O campo `progress_pct` deve ser excluído do `SELECT` de retorno do PATCH (ou mantido para o front, conforme análise) — mantê-lo no `SELECT` de retorno é opcional mas não prejudica.

7. Após a aplicação da migration e da mudança no modal, ao editar o progresso de qualquer fase via `obra_fases` (PUT/PATCH em `/api/admin/obras/[obra_id]/fases/[fase_id]`), o `progress_pct` da obra pai é recalculado automaticamente pelo trigger. Não há nenhum código de aplicação (TypeScript) responsável por disparar esse recálculo — tudo ocorre via banco.

## Scope

### IN
- Migration `051_obra_progress_auto.sql`: função PL/pgSQL + trigger + seed de recálculo de todas as obras
- Remoção do input "Progresso (%)" em `obra-edit-modal.tsx`
- Remoção do campo `progress_pct` do PATCH handler em `route.ts`
- Remoção da notificação `notifyClientes` atrelada à atualização manual de `progress_pct`

### OUT
- Qualquer mudança na barra de progresso exibida na `page.tsx` (já funciona, lê `obra.progress_pct` do banco)
- Mudança no API route de fases (`/fases/[fase_id]/route.ts`) — o trigger cuida do recálculo, nenhum código TS precisa ser adicionado lá
- Exposição de endpoint para recalcular progresso manualmente
- Exibição do peso de cada fase na UI

## Dependencies

- Story 36-1 (Done) — migration 050 aplicada; padrão de migrations deste projeto confirmado
- Tabela `obra_fases` deve ter colunas `progress_pct`, `expected_start_date`, `expected_end_date` (confirmado pelo schema descrito na análise técnica e pelo `SELECT` em `page.tsx`)
- Tabela `obras` deve ter coluna `progress_pct integer` (confirmado: migration 020, `DEFAULT 0`)

## Dev Notes

### Schema relevante (confirmado nas migrations)

```sql
-- obras (migration 020)
-- progress_pct integer NOT NULL DEFAULT 0

-- obra_fases (migration 020)
-- progress_pct integer (0-100)
-- expected_start_date date
-- expected_end_date date
-- start_date date
-- end_date date
-- status varchar
-- obra_id uuid REFERENCES obras(id)
```

### Migration 051 — SQL completo esperado

```sql
-- 051_obra_progress_auto.sql

-- 1. Função de recálculo
CREATE OR REPLACE FUNCTION recalculate_obra_progress(p_obra_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_progress integer;
BEGIN
  SELECT
    GREATEST(0, LEAST(100,
      CASE
        WHEN SUM(
          CASE
            WHEN expected_start_date IS NOT NULL AND expected_end_date IS NOT NULL
            THEN GREATEST(expected_end_date - expected_start_date, 1)
            ELSE 1
          END
        ) = 0 THEN 0
        ELSE ROUND(
          SUM(
            progress_pct * (
              CASE
                WHEN expected_start_date IS NOT NULL AND expected_end_date IS NOT NULL
                THEN GREATEST(expected_end_date - expected_start_date, 1)
                ELSE 1
              END
            )
          )::numeric /
          SUM(
            CASE
              WHEN expected_start_date IS NOT NULL AND expected_end_date IS NOT NULL
              THEN GREATEST(expected_end_date - expected_start_date, 1)
              ELSE 1
            END
          )
        )
      END
    ))
  INTO v_progress
  FROM obra_fases
  WHERE obra_id = p_obra_id;

  UPDATE obras
  SET progress_pct = COALESCE(v_progress, 0)
  WHERE id = p_obra_id;
END;
$$;

-- 2. Trigger function (chama recalculate_obra_progress)
CREATE OR REPLACE FUNCTION trigger_recalculate_obra_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_obra_progress(OLD.obra_id);
  ELSE
    PERFORM recalculate_obra_progress(NEW.obra_id);
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Trigger na tabela obra_fases
DROP TRIGGER IF EXISTS trigger_obra_fases_progress ON obra_fases;
CREATE TRIGGER trigger_obra_fases_progress
  AFTER INSERT OR UPDATE OR DELETE ON obra_fases
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recalculate_obra_progress();

-- 4. Seed: recalcular todas as obras existentes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM obras LOOP
    PERFORM recalculate_obra_progress(r.id);
  END LOOP;
END;
$$;
```

**Nota:** `RETURNS TRIGGER` com `FOR EACH ROW` + `AFTER` deve retornar `NULL` (o trigger function retorna `NULL` pois a tabela `obras` não está na cadeia do trigger). Usar `PERFORM` ao invés de `SELECT ... INTO` dentro do trigger function.

### Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/migrations/051_obra_progress_auto.sql` | Criar (função + trigger + seed) |
| `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-edit-modal.tsx` | Remover input "Progresso (%)" + estado `progressPct` + `progress_pct` do body |
| `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` | Remover bloco `if (typeof body.progress_pct === "number" ...)` + remover `notifyClientes` ao atualizar progresso |

### Detalhes do modal (obra-edit-modal.tsx)

Atualmente o modal tem:
- `const [progressPct, setProgressPct] = useState(obra.progress_pct)` → remover
- Input `<div>` com label "Progresso (%)" e `type="number"` → remover o bloco `<div>` inteiro
- `progress_pct: progressPct` no body do PATCH → remover apenas esse campo do objeto

A interface `Obra` no componente pode manter `progress_pct` (ainda usado na `page.tsx` como read-only), mas não há obrigatoriedade.

### Detalhes do PATCH handler (route.ts)

Trecho atual a REMOVER:
```typescript
// REMOVER este bloco inteiro:
if (
  typeof body.progress_pct === "number" &&
  body.progress_pct >= 0 &&
  body.progress_pct <= 100
) {
  updates.progress_pct = body.progress_pct
}
```

Trecho atual a REMOVER (notificação):
```typescript
// REMOVER este bloco inteiro:
// Fire-and-forget: notificar progresso somente quando progress_pct foi atualizado
if ("progress_pct" in updates && obra) {
  notifyClientes(obra_id, "progresso", obra.name).catch(() => {})
}
```

O import de `notifyClientes` pode ser mantido se for usado por outro código no arquivo; caso contrário pode ser removido. Verificar se há outros usos antes de remover o import.

### Padrão de auth nos routes existentes

O route usa `requireAuth()` de `@web/lib/api-auth` (não service_role). RLS do Supabase é aplicado automaticamente. A função PL/pgSQL deve rodar com permissões de `SECURITY INVOKER` (default) — como é chamada pelo trigger (que roda com permissões de `SECURITY DEFINER` implícitas no contexto do trigger), não há problema. Alternativamente, definir `SECURITY DEFINER` na função de recálculo garante que ela sempre possa atualizar `obras`, independente de políticas RLS.

**Recomendação:** Definir `recalculate_obra_progress` como `SECURITY DEFINER` para garantir que o UPDATE em `obras` sempre funcione, mesmo com RLS ativo. Adicionar `SET search_path = public` por segurança.

```sql
CREATE OR REPLACE FUNCTION recalculate_obra_progress(p_obra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$ ... $$;
```

### O que NÃO muda

- `page.tsx`: já lê `obra.progress_pct` do banco e exibe a barra de progresso — nenhuma mudança necessária
- `/api/admin/obras/[obra_id]/fases/[fase_id]/route.ts`: o trigger cuida do recálculo automaticamente após qualquer UPDATE em `obra_fases` — nenhum código TS adicional necessário
- Coluna `progress_pct` na tabela `obras`: não é removida do schema — apenas deixa de ser editável manualmente

## Tasks

- [ ] 1. Criar `supabase/migrations/051_obra_progress_auto.sql` com a função `recalculate_obra_progress`, a trigger function `trigger_recalculate_obra_progress`, o trigger `trigger_obra_fases_progress` e o seed de recálculo para todas as obras existentes (AC: 1, 2, 3, 4)
- [ ] 2. Remover o input "Progresso (%)" de `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-edit-modal.tsx`: excluir estado `progressPct`/`setProgressPct`, excluir o bloco `<div>` do label + input, remover `progress_pct` do body do PATCH (AC: 5)
- [ ] 3. Em `packages/web/src/app/api/admin/obras/[obra_id]/route.ts`: remover o bloco `if (typeof body.progress_pct === "number" ...)` do handler PATCH e remover o bloco de `notifyClientes` atrelado ao `progress_pct` (AC: 6)
- [ ] 4. Verificar se o import `notifyClientes` tem outros usos no `route.ts`; se não tiver, remover o import também (AC: 6)
- [ ] 5. Executar `npm run typecheck` e `npm run lint` e corrigir todos os erros

## Testing

### Abordagem
Testes manuais via Supabase + UI. Não há testes automatizados novos (lógica de cálculo reside no banco de dados).

### Cenários de teste

1. **Trigger básico**: Editar o `progress_pct` de uma fase existente → confirmar que `obras.progress_pct` é atualizado automaticamente no banco (via Supabase Studio ou query direta).

2. **Ponderação por duração**: Fase A: `progress_pct=100`, `expected_start_date=2026-01-01`, `expected_end_date=2026-03-01` (59 dias). Fase B: `progress_pct=0`, sem datas (peso=1). Resultado esperado: `ROUND(100*59 + 0*1) / (59+1) = ROUND(5900/60) = ROUND(98.33) = 98`. Verificar no banco após UPDATE da fase A.

3. **Sem datas planejadas**: Obra com 2 fases, ambas sem `expected_start_date`/`expected_end_date`, `progress_pct` = 50 e 100. Resultado esperado: `ROUND((50*1 + 100*1) / 2) = 75`.

4. **Obra sem fases**: Confirmar que `progress_pct` = 0 após seed (não causa erro na função).

5. **DELETE de fase**: Excluir uma fase e confirmar que o progresso é recalculado corretamente.

6. **UI**: Abrir modal de editar obra e confirmar que o campo "Progresso (%)" não aparece mais.

7. **PATCH handler**: Fazer um PATCH em `/api/admin/obras/[obra_id]` com `{ "progress_pct": 99 }` e confirmar que o campo é ignorado (o `progress_pct` retornado deve ser o calculado pelo trigger, não 99).

### Verificação de tipos/lint
```bash
npm run typecheck
npm run lint
```

## 🤖 CodeRabbit Integration

> **Nota:** `coderabbit_integration` não encontrado explicitamente no `core-config.yaml`. Seção preenchida manualmente com base no padrão do projeto.

### Story Type Analysis

**Primary Type**: Database
**Secondary Type(s)**: API (remoção de campo no PATCH handler)
**Complexity**: Medium — função PL/pgSQL nova, trigger, seed + 2 arquivos TS com remoção de código

### Specialized Agent Assignment

**Primary Agents**:
- @data-engineer (migration SQL, função PL/pgSQL, trigger)
- @dev (modificações TS no modal e route)

**Supporting Agents**:
- @devops (aplicar migration via `supabase db push` ou equivalente)

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): Executar `npm run typecheck` e `npm run lint` antes de marcar story como completa
- [ ] Pre-PR (@devops): Executar `npm run typecheck` + revisar migration SQL antes de criar PR

### Self-Healing Configuration

**Expected Self-Healing**:
- Primary Agent: @data-engineer (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL

**Predicted Behavior**:
- CRITICAL issues: auto_fix (até 2 iterações)
- HIGH issues: document_only (registrado em Dev Notes)

### CodeRabbit Focus Areas

**Primary Focus**:
- Migration safety: função com `SECURITY DEFINER` + `SET search_path = public` para evitar search_path injection
- Trigger: `AFTER` com `RETURNS NULL` (não `NEW`) — padrão correto para triggers em tabelas diferentes
- `COALESCE(v_progress, 0)` garante que obras sem fases recebem 0, não NULL

**Secondary Focus**:
- Remoção limpa no modal: sem referências órfãs ao estado `progressPct`
- Route PATCH: confirmar que `notifyClientes` só é removido se sem outros usos no arquivo
- Typecheck: interface `Obra` no modal pode precisar ajuste se `progress_pct` for removido do objeto enviado

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-20 | @sm River | Story criada — progresso geral automático via trigger PL/pgSQL |
