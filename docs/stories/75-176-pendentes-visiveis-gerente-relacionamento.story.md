# Story 75-176 — Uploads pendentes visíveis para a gerente-relacionamento (Samara)

## Metadata
- **Status:** Done
- **Epic:** — (falha de UX achada pelo Marcos, 2026-07-17)
- **Branch:** fix/75-176-pendentes-gerente-relacionamento

## Context
A Samara (role `gerente-relacionamento`) sobe fotos/documentos que entram em FILA DE
APROVAÇÃO (supervisor aprova depois). Enquanto pendente, o item NÃO aparecia na lista de
Fotos/Documentos para ela — então ela não sabia o que já tinha enviado, corria risco de
esquecer ou DUPLICAR (subir a mesma foto de novo).

A feature de "mostrar meus uploads pendentes inline, com selo Aguardando aprovação" JÁ
EXISTIA (para o role `obras`) — badge amarelo, item esmaecido, motivo se rejeitado. O bug era
só o gate: `const isObras = userRole === "obras"` NÃO incluía `gerente-relacionamento`.
O servidor já buscava os pendentes dela (page.tsx: else-branch `.eq("enviado_por", user.id)`,
status pendente/rejeitado) — o dado chegava, só não era renderizado.

## Correção
- `isObras` → `mostraPendentes = userRole === "obras" || userRole === "gerente-relacionamento"`
  (os dois roles que caem na fila de aprovação no upload — mesmos ALLOWED_ROLES que NÃO
  publicam direto). Rename + expansão; todos os usos no arquivo atualizados.

## Acceptance Criteria
- [x] AC1: Samara (gerente-relacionamento) vê os PRÓPRIOS uploads pendentes inline nas abas
  Fotos e Documentos, com selo "Aguardando aprovação" (amarelo) e, se rejeitado, o motivo.
- [x] AC2: Contadores das abas somam os pendentes dela (ex.: "Documentos (56 + N)").
- [x] AC3: Admin/supervisor inalterados — publicam direto e revisam pela aba "Aprovações"
  (que segue `isAdminOrSupervisor`, sem mudança).
- [x] AC4: Cobre fotos E documentos (ambos passam por `mostraPendentes`).
- [x] AC5: type-check/lint/suíte verdes (1066/1066).

## Out of Scope
- Notificar a Samara quando o upload dela for aprovado/rejeitado (já existe cópia por e-mail
  ao enviador — `notificarResultadoUpload`).

## File List
- `docs/stories/75-176-pendentes-visiveis-gerente-relacionamento.story.md` (this file)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx`

## Change Log
- @dev (Dex): gate `isObras` → `mostraPendentes` (inclui gerente-relacionamento). Dado já vinha
  do servidor; era só render. Rename global no arquivo.
- @qa (Quinn): PASS — nenhum `isObras` restante; aba Aprovações segue admin/supervisor; fotos+docs cobertos.
- @devops (Gage): CI verde, squash-merge PR #236, deploy prod automático. Status InReview → Done.
