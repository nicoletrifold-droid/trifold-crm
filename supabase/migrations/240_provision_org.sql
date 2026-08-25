-- 240_provision_org.sql
-- Story 900-21 (Epic 900, Onda 2) — provisiona uma organização nova em UMA transação.
--
-- O QUE ISTO RESOLVE
-- ------------------
-- Hoje, criar uma empresa cliente exigiria SQL manual: inserir a org, criar os roles, semear
-- as permissões, criar os stages do Kanban e as configs. Um passo esquecido produz uma org
-- silenciosamente quebrada — sem stage default, o lead nasce invisível no Pipeline.
--
-- IDEMPOTENTE POR SLUG. Reexecutar retoma o que falta em vez de duplicar ou explodir. Isso
-- importa porque o provisionamento tem efeitos externos (convite do admin por e-mail) que
-- podem falhar DEPOIS do banco — e aí a operação precisa poder ser repetida com segurança.
--
-- ⚠️ COMO ESTA FUNÇÃO PRECISA SER CHAMADA
-- ---------------------------------------
-- Com **service-role** (sem `auth.uid()`). Não é preferência de estilo: `assert_org_scope()`,
-- usada pelas funções de seed existentes, levanta `org mismatch` (42501) quando o chamador é
-- um usuário logado cuja org difere do `p_org_id` — que é exatamente a situação de quem
-- provisiona uma empresa nova. Um platform admin logado NUNCA pertence à org que está criando.
--
-- Por isso a autorização ("quem pode provisionar?") vive na ROTA, não aqui. Quando a Onda 6
-- trouxer `platform_admins`, a checagem passa a ser feita lá e esta função continua igual.
--
-- O QUE ELA NÃO FAZ (deliberado)
-- ------------------------------
--   • Não cria plano nem assinatura — `plans` só existe a partir da Onda 3 (900-26/27a).
--     Provisionar org sem plano é o comportamento correto desta onda.
--   • Não cria o usuário admin. Convite por e-mail é efeito externo, tem que acontecer FORA
--     da transação: se falhasse aqui, derrubaria a criação inteira da org. A rota convida
--     depois e o painel mostra "convite pendente" quando isso falha.

CREATE OR REPLACE FUNCTION public.provision_org(
  p_name  text,
  p_slug  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id  uuid;
  v_role_id uuid;
  v_module  text;
  -- Módulos que todo role recebe na criação. `role_permissions.can_access` decide o resto;
  -- a matriz fina de capabilities é configurada depois, pelo painel.
  v_modules text[] := ARRAY[
    'dashboard','pipeline','leads','imoveis','conversas','agenda','alertas','atividades',
    'corretores','chamados','configuracoes','campanhas','analytics','roleta','bolsao',
    'mensagens','materiais','treinamento','obras','lancamentos','brindes','chat','imob',
    'fluxo','pastas','sistema'
  ];
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'nome da organização é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'slug é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'slug inválido: use minúsculas, números e hífen (ex.: acme-imoveis)'
      USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. Organização — a idempotência mora aqui
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_org_id FROM organizations WHERE slug = btrim(p_slug);

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, slug)
    VALUES (btrim(p_name), btrim(p_slug))
    RETURNING id INTO v_org_id;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2. Roles do sistema
  --
  -- Replicados aqui em vez de chamar `seed_system_roles()`: aquela função invoca
  -- `assert_org_scope(p_org_id)`, que rejeita quem não pertence à org — e quem provisiona
  -- nunca pertence. Duplicar a lista é o preço de não acoplar o provisionamento a uma guarda
  -- desenhada para outro caso de uso.
  -- ---------------------------------------------------------------------------
  INSERT INTO roles (org_id, name, label, color, is_system) VALUES
    (v_org_id, 'admin',      'Administrador', 'purple', true),
    (v_org_id, 'supervisor', 'Supervisor',    'blue',   true),
    (v_org_id, 'broker',     'Corretor',      'green',  true),
    (v_org_id, 'obras',      'Obras',         'orange', true)
  ON CONFLICT (org_id, name) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 3. Permissões — admin recebe tudo; os demais nascem sem acesso e são liberados no painel
  -- ---------------------------------------------------------------------------
  FOR v_role_id, v_module IN
    SELECT r.id, m
    FROM roles r
    CROSS JOIN unnest(v_modules) AS m
    WHERE r.org_id = v_org_id
  LOOP
    INSERT INTO role_permissions (org_id, role_id, module, can_access)
    VALUES (
      v_org_id,
      v_role_id,
      v_module,
      (SELECT name FROM roles WHERE id = v_role_id) = 'admin'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 4. Stages do Kanban
  --
  -- `novo` é `is_default = true`. Sem stage default, `getDefaultStageId()` cai no fallback e
  -- o lead nasce invisível no Pipeline e nos filtros — o pior tipo de falha, porque é
  -- silenciosa e só aparece quando alguém pergunta "cadê o lead que entrou?".
  -- ---------------------------------------------------------------------------
  INSERT INTO kanban_stages (org_id, name, slug, type, position, color, is_default, is_active) VALUES
    (v_org_id, 'Novo',            'novo',            'novo',      0,  '#64748B', true,  true),
    (v_org_id, 'Em Qualificação', 'em-qualificacao', 'novo',      1,  '#0EA5E9', false, true),
    (v_org_id, 'Qualificado',     'qualificado',     'agendado',  2,  '#8B5CF6', false, true),
    (v_org_id, 'Visita Agendada', 'visita-agendada', 'agendado',  3,  '#6366F1', false, true),
    (v_org_id, 'No-Show',         'no-show',         'no_show',   4,  '#F43F5E', false, true),
    (v_org_id, 'Visitou',         'visitou',         'visitou',   5,  '#14B8A6', false, true),
    (v_org_id, 'Proposta',        'proposta',        'proposta',  6,  '#F59E0B', false, true),
    (v_org_id, 'Negociando',      'negociando',      'proposta',  7,  '#EAB308', false, true),
    (v_org_id, 'Fechou',          'fechou',          'fechado',   8,  '#22C55E', false, true),
    (v_org_id, 'Represamento',    'represamento',    'represamento', 9, '#94A3B8', false, true),
    (v_org_id, 'Perdido',         'perdido',         'perdido',   10, '#EF4444', false, true)
  ON CONFLICT (org_id, slug) DO NOTHING;

  RETURN v_org_id;
END;
$function$;

-- Só o backend com service-role provisiona. A autorização de "quem pode" fica na rota.
REVOKE ALL ON FUNCTION public.provision_org(text, text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- ROLLBACK (NFR-8)
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.provision_org(text, text);
