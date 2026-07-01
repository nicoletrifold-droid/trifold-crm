-- 135_leads_segmento.sql
-- Story 75-98 (Epic "mundo IMOB") — segmento do lead: separa o mundo IMOB do principal.
--
-- 'principal' = tudo que já roda hoje (corretores/gerente comercial, roleta, campanhas).
-- 'imob'      = leads do mundo IMOB (criados MANUALMENTE pelos perfis imob/consultoria;
--               nunca entram por roleta/campanha e não aparecem no mundo principal).
--
-- Todo lead existente vira 'principal' (default). Adicionar o filtro segmento='principal'
-- nas queries do mundo principal é NO-OP no dado atual (ninguém é 'imob' ainda) e passa a
-- isolar quando os leads IMOB existirem (Fase 2).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS segmento text NOT NULL DEFAULT 'principal';

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_segmento_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_segmento_check CHECK (segmento IN ('principal', 'imob'));

-- Ajuda os filtros por segmento (a maioria das queries já filtra por org).
CREATE INDEX IF NOT EXISTS idx_leads_org_segmento ON leads(org_id, segmento);
