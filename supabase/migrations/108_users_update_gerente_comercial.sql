-- 108_users_update_gerente_comercial
-- Permite que gerente-comercial salve edições de corretor que ficam na tabela
-- `users` (telefone/WhatsApp e ativar/desativar) — antes a policy de UPDATE era
-- admin-only (004/062), enquanto a API e o RLS de `brokers` (074) já liberavam
-- gerente-comercial. Falha silenciosa: UPDATE bloqueado por RLS afeta 0 linhas
-- sem erro, e a tela exibia "Salvo com sucesso!".
--
-- Menor privilégio: gerente-comercial só pode dar UPDATE em usuários que são
-- corretores (existe linha em brokers com user_id = users.id). Admin permanece
-- com UPDATE irrestrito na própria org. Isolamento por org mantido.

DROP POLICY IF EXISTS users_update_admin ON public.users;

CREATE POLICY users_update_admin ON public.users
  FOR UPDATE
  USING (
    org_id = public.user_org_id()
    AND (
      public.user_role() = 'admin'
      OR (
        public.user_role() = 'gerente-comercial'
        AND EXISTS (
          SELECT 1 FROM public.brokers b
          WHERE b.user_id = public.users.id
        )
      )
    )
  );
