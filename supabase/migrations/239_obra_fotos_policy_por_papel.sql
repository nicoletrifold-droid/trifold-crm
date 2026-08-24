-- 239_obra_fotos_policy_por_papel.sql
-- Story 900-12a — a policy de `obra-fotos` passa a distinguir staff de cliente.
--
-- O QUE A 900-11 DEIXOU EM ABERTO
-- ------------------------------
-- `org_read_obra_fotos` exige apenas que a obra pertença à org do chamador:
--
--     EXISTS (select 1 from obras b
--             where b.id::text = (storage.foldername(name))[2]
--               and b.org_id = public.user_org_id())
--
-- Isso fecha o vazamento ENTRE EMPRESAS, mas não separa clientes DENTRO da mesma empresa: um
-- cliente autenticado que descubra o path de uma obra alheia lê a foto.
--
-- Hoje isso é inócuo, porque o bucket é PÚBLICO e todo mundo lê tudo de qualquer jeito. Mas a
-- Story 900-12a torna o bucket privado — e a partir daí é ESTA policy que o Storage consulta
-- para decidir se assina a URL. Sem o refinamento, o flip entregaria "fotos protegidas" com o
-- furo cross-obra conhecido e em aberto.
--
-- POR QUE ESTE PREDICADO, E NÃO OUTRO
-- -----------------------------------
-- Ele espelha, de propósito, a policy que JÁ governa a tabela `obras`:
--
--     obras_manage_admin   [ALL]     org_id = user_org_id() AND has_capability('obras.editar')
--     obras_select_cliente [SELECT]  id IN (SELECT cliente_obra_ids())
--
-- Duas fontes de verdade divergentes para "quais obras este usuário vê" seria pior que o furo
-- que estamos fechando — a foto ficaria visível para quem não pode ver a obra, ou o contrário.
--
-- Verificado antes de escrever (produção, 2026-08-23):
--   • 82 usuários role='cliente'; 79 com vínculo em `cliente_obras`
--   • os 3 sem vínculo JÁ não enxergam obra alguma hoje (obras_select_cliente devolve vazio),
--     então esta migration não retira acesso de ninguém que hoje tenha.

DROP POLICY IF EXISTS org_read_obra_fotos ON storage.objects;

CREATE POLICY org_read_obra_fotos ON storage.objects FOR SELECT
  USING (
    bucket_id = 'obra-fotos'
    AND EXISTS (
      SELECT 1
      FROM public.obras b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.org_id = public.user_org_id()
        AND (
          -- staff: qualquer obra da própria organização
          public.user_role() <> 'cliente'
          -- cliente: apenas as obras vinculadas a ele, mesma fonte de `obras_select_cliente`
          OR b.id IN (SELECT public.cliente_obra_ids())
        )
    )
  );

-- =============================================================================
-- ROLLBACK (NFR-8) — volta ao predicado da migration 238.
-- =============================================================================
-- DROP POLICY IF EXISTS org_read_obra_fotos ON storage.objects;
-- CREATE POLICY org_read_obra_fotos ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'obra-fotos'
--     AND EXISTS (
--       SELECT 1 FROM public.obras b
--       WHERE b.id::text = (storage.foldername(name))[2]
--         AND b.org_id = public.user_org_id()
--     )
--   );
