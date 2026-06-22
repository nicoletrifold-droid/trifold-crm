---
name: creative-performance-fn-signature
description: creative_performance() não aceita CREATE OR REPLACE entre migrations que mudam colunas OUT; precisa DROP FUNCTION antes
metadata:
  type: project
---

A função prod `public.creative_performance(INTEGER)` teve seu tipo de retorno alterado entre a migration 100 e a 101 (a 101 adicionou colunas OUT `crm_leads_total/agendado/visitou/proposta/fechado`).

Fato: aplicar a 101 com `CREATE OR REPLACE` falhou com Postgres `42P13: cannot change return type of existing function`. Foi necessário `DROP FUNCTION IF EXISTS public.creative_performance(INTEGER);` antes do CREATE. O arquivo de migration 101 foi corrigido para incluir esse DROP idempotente.

**Why:** Postgres não permite alterar o row type definido por parâmetros OUT via CREATE OR REPLACE. Qualquer função RETURNS TABLE que ganhe/perca colunas entre migrations precisa de DROP explícito.

**How to apply:** Ao aplicar futuras migrations que redefinem a signature de `creative_performance` (ou qualquer função RETURNS TABLE), incluir `DROP FUNCTION IF EXISTS ...(assinatura)` antes do CREATE OR REPLACE. Relacionado a [[supabase-grant-all-default]] (a função também faz REVOKE/GRANT explícito após recriar).
