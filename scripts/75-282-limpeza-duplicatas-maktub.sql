-- 75-282 — Limpeza das duplicatas de cliente criadas pelo sync Sienge (MAKTUB HOLDING)
--
-- ⚠️  NÃO É MIGRATION. É correção de DADO de produção, pontual, para rodar UMA vez, com
--     aprovação explícita do Marcos. Rode primeiro o bloco de conferência, depois o DELETE
--     dentro de `begin; ... rollback;` e só então com `commit`.
--
-- CONTEXTO — como as duplicatas nasceram (ver docs/stories/75-282-...):
--   O sync comparava `clientes.cpf` literalmente contra o CPF sanitizado do Sienge. Para o
--   MAKTUB (CPF gravado como `865.001.559-04`) o casamento falhava; o fallback por e-mail
--   também, porque `anicolau0713@gmail.com` está em mais de uma linha desde 15/07 (cadastro
--   do "Alexandre G. Nicolau"). Resultado: um INSERT novo a cada sync.
--
-- ESTADO MEDIDO EM PRODUÇÃO (07/08/2026) — 5 linhas com sienge_customer_id = 1437:
--   81280f9a…  27/05  CPF 865.001.559-04   2 vínculos, 1 brinde   ← CANÔNICA, preservar
--   1cd0cfba…  17/07  cpf null             0 refs                 ← apagar
--   29258b22…  22/07  cpf null             0 refs                 ← apagar
--   f1bb7b71…  22/07  cpf null             0 refs                 ← apagar
--   c7299bfb…  07/08  cpf null             1 vínculo (Vind, unidade NULA, VIND-804 já
--                                            presente na canônica)  ← apagar (CASCADE leva o
--                                            vínculo duplicado)
--
-- O código da 75-282 já impede novas duplicatas: o casamento passa a começar por
-- `sienge_customer_id` (que pega a linha mais antiga) e e-mail ambíguo NÃO cria cliente.
-- Ou seja: esta limpeza é definitiva, não vai se repetir no próximo sync.

-- ─────────────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — Conferência. Rode isolado e confira que as 4 linhas a apagar continuam sem
-- referência ALÉM do vínculo esperado. Se qualquer contagem divergir do comentário acima,
-- PARE: o estado mudou desde 07/08 e o script precisa ser refeito.
-- ─────────────────────────────────────────────────────────────────────────────────────
select
  c.id,
  c.created_at::date                                                        as criada_em,
  c.cpf,
  (select count(*) from clientes_obras_vinculos v where v.cliente_id = c.id) as vinculos,
  (select count(*) from brindes_destinatarios b where b.cliente_id = c.id)   as brindes,
  (select count(*) from conversations cv where cv.relationship_cliente_id = c.id) as conversas,
  (select count(*) from obra_documentos d
     join clientes_obras_vinculos v2 on v2.id = d.cliente_obra_id
    where v2.cliente_id = c.id)                                             as documentos
from clientes c
where c.sienge_customer_id = 1437
order by c.created_at;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Limpeza. Roda com `rollback` primeiro; troque por `commit` após conferir.
-- Idempotente: a 2ª execução não encontra nada para apagar.
-- ─────────────────────────────────────────────────────────────────────────────────────
begin;

-- Apaga toda linha MAKTUB (sienge 1437) que NÃO é a mais antiga. A canônica é escolhida por
-- `created_at`, a mesma regra que o código agora usa para casar — não por UUID hardcoded.
with canonica as (
  select id
  from clientes
  where sienge_customer_id = 1437
  order by created_at
  limit 1
)
delete from clientes
where sienge_customer_id = 1437
  and id not in (select id from canonica);

-- Prova: deve sobrar exatamente 1 linha, a de 27/05, com os 2 vínculos originais.
select
  (select count(*) from clientes where sienge_customer_id = 1437)            as linhas_maktub,
  (select count(*) from clientes_obras_vinculos v
     join clientes c on c.id = v.cliente_id
    where c.sienge_customer_id = 1437)                                       as vinculos_restantes,
  (select string_agg(distinct v.numero_unidade, ', ') from clientes_obras_vinculos v
     join clientes c on c.id = v.cliente_id
    where c.sienge_customer_id = 1437)                                       as unidades;

rollback;  -- ← trocar por `commit;` somente após conferir a saída acima
