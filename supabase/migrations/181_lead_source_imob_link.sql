-- =============================================================================
-- 181_lead_source_imob_link.sql — Story 75-190
-- =============================================================================
-- O link público de agendamento da imobiliária (Epic 81, /api/agendar/[token])
-- cria o lead com source='imob_link', mas o valor nunca foi adicionado ao enum
-- lead_source → INSERT falhava (22P02) e o parceiro via "Não foi possível
-- registrar o cliente" no formulário.
--
-- Aplicada no PROD via Management API em 2026-07-21 (Story 75-190).
-- =============================================================================

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'imob_link';
