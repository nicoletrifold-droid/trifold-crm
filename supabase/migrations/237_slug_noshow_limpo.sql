-- Story 75-362 — a etapa No-Show fica com o slug que sempre foi dela: `no-show`.
--
-- A mig 236 criou a etapa No-Show (…0011) com o slug provisório `no-show-real`,
-- porque na época o slug `no-show` era sinônimo de ATENDIMENTO na lista do funil
-- (`funnel-tiers.ts`, herança da 75-323) — e o `pick()` varre as etapas na ordem
-- de POSIÇÃO do board, então dar `no-show` à etapa nova faria o andar de
-- Atendimento poder casar com a coluna errada dependendo só da ordem das colunas.
--
-- ⚠️ ORDEM DE DEPLOY: este arquivo só roda DEPOIS do merge da 75-362, que remove
-- o sinônimo do código. Com o código antigo no ar, o rename abaixo dependeria de
-- Atendimento (pos 4) continuar vindo antes de No-Show (pos 7) — funcionaria por
-- sorte de posição, que é exatamente a classe de bug que a 236 evitou.
--
-- Guardas de idempotência/segurança: cada UPDATE exige o estado que espera
-- encontrar. Rodar duas vezes = no-op; rodar contra um banco diferente = no-op.

update public.kanban_stages
   set slug = 'no-show',
       updated_at = now()
 where id = '00000000-0000-0000-0001-000000000011'
   and slug = 'no-show-real'
   -- nunca criar slug duplicado dentro da org (há UNIQUE (org_id, slug), mas o
   -- guard evita o erro e deixa o no-op explícito)
   and not exists (
     select 1 from public.kanban_stages k2
      where k2.org_id = kanban_stages.org_id and k2.slug = 'no-show'
   );

-- Verificação — o retorno do POST é o último statement.
select id, name, slug, type::text, position
  from public.kanban_stages
 where id in ('00000000-0000-0000-0001-000000000009', '00000000-0000-0000-0001-000000000011')
 order by position;
