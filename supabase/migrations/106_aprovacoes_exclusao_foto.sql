-- Story 75-14 — pedido de EXCLUSÃO de foto pelo perfil "obras" entra na fila de
-- aprovação (obra_upload_aprovacoes), aprovado pelo supervisor. Libera o novo
-- tipo 'exclusao_foto' no CHECK da coluna `tipo`.
ALTER TABLE public.obra_upload_aprovacoes
  DROP CONSTRAINT IF EXISTS obra_upload_aprovacoes_tipo_check;

ALTER TABLE public.obra_upload_aprovacoes
  ADD CONSTRAINT obra_upload_aprovacoes_tipo_check
  CHECK (tipo IN ('foto', 'documento', 'exclusao_foto'));
