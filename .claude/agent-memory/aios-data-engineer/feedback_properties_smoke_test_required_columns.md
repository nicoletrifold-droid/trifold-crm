---
name: properties_smoke_test_required_columns
description: Smoke tests de CHECK constraint em `properties` exigem address/city/state populados — NOT NULL é avaliado antes do CHECK
type: feedback
---

Quando rodar smoke tests SQL de CHECK constraints na tabela `properties`, o INSERT mínimo precisa fornecer `address`, `city`, `state` (todos NOT NULL) além de `org_id`, `name`, `slug`, `status`. Caso contrário, o Postgres falha no NOT NULL antes de avaliar o CHECK — e o smoke deixa de validar o que pretende validar.

**Why:** Story 31.2 (migration 043, `commercial_rules_shape_check`) — primeira rodada de smoke tests falhou com `ERROR 23502 null value in column "address"`, mascarando o erro 23514 esperado do CHECK. Segunda rodada com `'addr', 'city', 'ST'` adicionados validou corretamente.

**How to apply:**
- Para smokes negativos (`AC violates CHECK`), confirmar que o erro retornado é `23514` (check_violation) e referencia o nome da constraint — não `23502` (not_null_violation).
- Template mínimo de INSERT em `properties` para smoke tests:
  ```sql
  INSERT INTO properties (org_id, name, slug, status, address, city, state, commercial_rules)
  VALUES ('00000000-0000-0000-0000-000000000001', '__test__', '__test__', 'selling', 'addr', 'city', 'ST', <payload>);
  ```
- Org seed UUID: `00000000-0000-0000-0000-000000000001` (Trifold Engenharia).
- Sempre envolver em `BEGIN; ... ROLLBACK;` para garantir não-persistência mesmo se o smoke positivo passar.
- Validar pós-rollback com `SELECT count(*) FROM properties` para confirmar baseline preservado.
