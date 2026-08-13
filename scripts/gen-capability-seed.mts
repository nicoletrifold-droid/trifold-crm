// Story 75-300 — gera a migration 225 (has_capability + seed espelho) a partir do
// REGISTRO ÚNICO em packages/web/src/lib/capabilities.ts. O SQL nunca é digitado à mão.
//
// Regenerar (da raiz do repo):
//   node --experimental-transform-types scripts/gen-capability-seed.mts 2>/dev/null > supabase/migrations/NNN_<nome>.sql
//   (saída é re-executável: ON CONFLICT DO NOTHING — capability nova = migration nova com a re-execução completa; ex.: 225 fundação, 226 tipologias)
//
// Saída determinística: sem timestamps, sem aleatoriedade — diff estável.

import {
  CAPABILITIES,
  KNOWN_ROLES,
} from "../packages/web/src/lib/capabilities.ts"

const lines: string[] = []

lines.push(`-- 225: Perfis de Acesso 2.0 — F1 fundação (Story 75-300)
--
-- ⚠️ ARQUIVO GERADO — não editar à mão. Fonte única: packages/web/src/lib/capabilities.ts
--    Regenerar: node --experimental-transform-types scripts/gen-capability-seed.mts 2>/dev/null > supabase/migrations/NNN_<nome>.sql
--
-- 1) has_capability(text): espelho SQL do can()/canAccess dotted do app, evoluindo a
--    has_module_access (mig 166) com a herança do módulo pai. NENHUMA policy passa a
--    usá-la nesta migration — ela nasce para as fases F4 (RLS por capability).
-- 2) Seed espelho: linhas EXPLÍCITAS (true/false) por (role conhecido × capability) em
--    role_permissions, fixando o comportamento de HOJE (inventário 13/08). Explícito nos
--    dois sentidos porque a herança do pai é permissiva (módulo ON = ação ON) e o espelho
--    precisa do comportamento atual, não do herdado (ex.: supervisor tem o módulo leads
--    ON mas NÃO pode leads.apagar).
--
-- Idempotente: CREATE OR REPLACE + ON CONFLICT (role_id, module) DO NOTHING.
-- Nenhuma policy alterada, nenhuma tabela nova, nenhum trigger.

-- ────────────────────────────────────────────────────────────────────────────
-- has_capability — ordem de resolução IDÊNTICA a resolveCapabilityDecision
-- (packages/web/src/lib/capabilities.ts) e ao canAccess dotted (permissions.ts):
--   1. exceção EXATA do usuário vence tudo (inclusive admin);
--   2. admin: fullMatrix + exceção do PAI mesclada (senão true);
--   3. linha explícita do perfil (chave exata);
--   4. exceção do usuário no módulo PAI;
--   5. linha do módulo PAI; ausente = nega (default-deny; vale p/ grupos virtuais).
-- Divergência documentada (igual à has_module_access desde a 166): role sem NENHUMA
-- linha em role_permissions cai no getHardcodedPermissions no app e em false aqui —
-- inócua em prod (todo role seedado tem linhas).
-- Capabilities têm exatamente 1 ponto (invariante testada) ⇒ herança de 1 nível basta.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_capability(p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN exc.can_access IS NOT NULL THEN exc.can_access
      WHEN u.role = 'admin' THEN COALESCE(excp.can_access, true)
      WHEN rp.can_access IS NOT NULL THEN rp.can_access
      WHEN excp.can_access IS NOT NULL THEN excp.can_access
      ELSE COALESCE(rpp.can_access, false)
    END
    FROM public.users u
    LEFT JOIN public.user_permission_exceptions exc
      ON exc.user_id = u.id AND exc.module = p_key
    LEFT JOIN public.roles r
      ON r.name = u.role AND r.org_id = u.org_id
    LEFT JOIN public.role_permissions rp
      ON rp.role_id = r.id AND rp.module = p_key
    LEFT JOIN public.user_permission_exceptions excp
      ON excp.user_id = u.id AND excp.module = split_part(p_key, '.', 1)
    LEFT JOIN public.role_permissions rpp
      ON rpp.role_id = r.id AND rpp.module = split_part(p_key, '.', 1)
    WHERE u.auth_id = auth.uid()
    LIMIT 1
  ), false)
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed espelho (${CAPABILITIES.length} capabilities × ${KNOWN_ROLES.length} roles conhecidos)
-- Roles fora da lista (ex.: cliente, customizados) NÃO recebem linhas — herdam
-- permissivo do módulo até a F2 (clonar de perfil) / F3 (gates via can()).
-- ────────────────────────────────────────────────────────────────────────────`)

const values: string[] = []
for (const cap of CAPABILITIES) {
  const granted = new Set<string>(cap.seed)
  for (const role of KNOWN_ROLES) {
    values.push(`    ('${cap.key}', '${role}', ${granted.has(role)})`)
  }
}

lines.push(`WITH caps(cap_key, role_name, granted) AS (
  VALUES
${values.join(",\n")}
)
INSERT INTO public.role_permissions (org_id, role_id, module, can_access)
SELECT r.org_id, r.id, c.cap_key, c.granted
FROM caps c
JOIN public.roles r ON r.name = c.role_name
ON CONFLICT (role_id, module) DO NOTHING;`)

process.stdout.write(lines.join("\n") + "\n")
