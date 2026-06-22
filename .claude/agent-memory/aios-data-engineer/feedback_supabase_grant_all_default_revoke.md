---
name: supabase-grant-all-default-revoke
description: Supabase concede GRANT ALL por padrao a authenticated E anon no schema public; append-only/read-only exige REVOKE explicito (TRUNCATE bypassa RLS)
metadata:
  type: feedback
---

Em novos objetos do schema `public`, o Supabase concede por padrao `GRANT ALL` (SELECT, INSERT, UPDATE, DELETE, **TRUNCATE**, REFERENCES, TRIGGER) aos roles `authenticated` E `anon`. Confirmado em runtime no DEV `xnxvygyfyyyzwhiuoehz` (tabela `leads` e objetos da Epic 52).

**Why:** Um `GRANT SELECT` (ou `GRANT SELECT, INSERT`) numa migration NAO derruba esse baseline amplo. Pior: a RLS so bloqueia UPDATE/DELETE de LINHAS — **TRUNCATE NAO passa por RLS**, entao `authenticated`/`anon` poderiam truncar e apagar uma tabela inteira (ex.: trilha de auditoria append-only), mesmo com RLS habilitada e sem policy de UPDATE/DELETE. Append-only/read-only "por ausencia de grant" e uma falsa garantia no Supabase.

**How to apply:** Para qualquer tabela append-only ou view/funcao read-only, NAO confie na ausencia de GRANT — emita REVOKE explicito. Padrao (idempotente, REVOKE amplo PRIMEIRO depois GRANT restritivo):
- Tabela append-only: `REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON t FROM authenticated;` `REVOKE ALL ON t FROM anon;` `REVOKE ALL ON t FROM PUBLIC;` `GRANT SELECT, INSERT ON t TO authenticated;`
- Views read-only: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON v FROM authenticated;` `REVOKE ALL ON v FROM anon, PUBLIC;` `GRANT SELECT ON v TO authenticated;`
- Funcoes: `REVOKE ALL ON FUNCTION f(args) FROM PUBLIC, anon;` `GRANT EXECUTE ON FUNCTION f(args) TO authenticated;`

`service_role`/`postgres` permanecem privilegiados por design (bypassam RLS) — a mitigacao e o app usar SO o client `authenticated`, nunca service_role no caminho de usuario. Validar com `information_schema.role_table_grants`. Relacionado: [[feedback_role_source_user_role_not_jwt]], [[reference_supabase_management_api_tx]].
