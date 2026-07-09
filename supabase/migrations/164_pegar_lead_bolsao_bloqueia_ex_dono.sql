-- 164_pegar_lead_bolsao_bloqueia_ex_dono.sql
-- Story 75-149 (Epic 64) — o corretor que deixou o lead cair no bolsão (último dono)
-- NÃO pode puxá-lo de volta. Bloqueio permanente enquanto o lead estiver no bolsão.
--
-- Base: migration 128 (versão viva da função). Único acréscimo = guard 'ex_dono'.
-- O ex-dono é identificado pela activity `bolsao_in` mais recente do lead
-- (metadata.from_broker_id), gravada pelo cron bolsao-rebalance quando o lead cai
-- no bolsão. from_broker_id e p_broker_user_id são ambos user_id → comparação direta.
--
-- Retorna um status text:
--   'ok'            → lead atribuído ao corretor; ciclo de 15 min reinicia (nova distribuição).
--   'gone'          → lead já não está no bolsão (outro pegou / foi atendido) — corrida.
--   'sem_corretor'  → p_broker_user_id não é um corretor disponível na org do lead.
--   'ex_dono'       → quem tenta puxar é o último dono que deixou o lead cair no bolsão.
--   'teto'          → corretor já atingiu max_leads.
--   'empreendimento'→ corretor não está habilitado no empreendimento do lead.

CREATE OR REPLACE FUNCTION public.pegar_lead_bolsao(
  p_lead_id uuid,
  p_broker_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id       uuid;
  v_property_id  uuid;
  v_broker_id    uuid;
  v_max_leads    integer;
  v_lock_key     bigint;
  v_ex_dono      uuid;
BEGIN
  -- Serializa puxadas concorrentes DO MESMO lead (dois corretores no mesmo card).
  v_lock_key := ('x' || substr(md5(p_lead_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Lead precisa estar no bolsão (sem dono, marcado) e ativo.
  SELECT org_id, property_interest_id
    INTO v_org_id, v_property_id
    FROM leads
   WHERE id = p_lead_id
     AND is_active = true
     AND bolsao_em IS NOT NULL
     AND assigned_broker_id IS NULL;
  IF NOT FOUND THEN
    RETURN 'gone';
  END IF;

  -- Corretor disponível na org do lead.
  SELECT b.id, COALESCE(b.max_leads, 50)
    INTO v_broker_id, v_max_leads
    FROM brokers b
   WHERE b.user_id = p_broker_user_id
     AND b.org_id = v_org_id
     AND b.is_available = true;
  IF NOT FOUND THEN
    RETURN 'sem_corretor';
  END IF;

  -- Ex-dono (Story 75-149): quem deixou este lead cair no bolsão (último `bolsao_in`)
  -- não pode puxá-lo de volta. Só o ÚLTIMO dono é bloqueado; se não há `bolsao_in`
  -- (dado legado / outro caminho), v_ex_dono fica null e o guard não dispara.
  SELECT (a.metadata->>'from_broker_id')::uuid
    INTO v_ex_dono
    FROM activities a
   WHERE a.lead_id = p_lead_id
     AND a.type = 'bolsao_in'
   ORDER BY a.created_at DESC
   LIMIT 1;
  IF v_ex_dono IS NOT NULL AND v_ex_dono = p_broker_user_id THEN
    RETURN 'ex_dono';
  END IF;

  -- Teto: leads ativos já atribuídos ao corretor < max_leads.
  IF (SELECT COUNT(*) FROM leads l
        WHERE l.assigned_broker_id = p_broker_user_id
          AND l.is_active = true
          AND l.org_id = v_org_id) >= v_max_leads THEN
    RETURN 'teto';
  END IF;

  -- Empreendimento: se o lead tem property_interest_id, o corretor precisa estar habilitado.
  IF v_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM broker_assignments ba
     WHERE ba.broker_id = v_broker_id
       AND ba.property_id = v_property_id
  ) THEN
    RETURN 'empreendimento';
  END IF;

  -- Atribuição atômica (guard final contra corrida).
  UPDATE leads
     SET assigned_broker_id = p_broker_user_id,
         bolsao_em = NULL
   WHERE id = p_lead_id
     AND bolsao_em IS NOT NULL
     AND assigned_broker_id IS NULL;
  IF NOT FOUND THEN
    RETURN 'gone';
  END IF;

  -- Reinicia o ciclo de 15 min (o cron bolsao-rebalance lê a última distribuição).
  INSERT INTO lead_distribution_log (org_id, lead_id, broker_id, status)
  VALUES (v_org_id, p_lead_id, v_broker_id, 'distributed');

  INSERT INTO activities (org_id, lead_id, user_id, type, description, metadata)
  VALUES (v_org_id, p_lead_id, p_broker_user_id, 'bolsao_pull',
          'Lead puxado do bolsão', jsonb_build_object('broker_user_id', p_broker_user_id));

  RETURN 'ok';
END;
$function$;
