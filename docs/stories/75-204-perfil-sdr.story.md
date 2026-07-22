# Story 75-204 — Perfil SDR: paridade de dados com o gerente-comercial

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (roles/permissões)
- **Branch:** feat/75-204-perfil-sdr
- **Tipo:** Feature — Marcos (2026-07-22): criou o perfil `sdr` (Thielly, SDR
  humana) e ligou os módulos na matriz (dashboard, pipeline, leads, imoveis,
  conversas, agenda, alertas, analytics, materiais, chamados). Pediu: dentro
  DESSES módulos, mesma lógica do gerente-comercial (vê leads de toda a equipe,
  transfere corretor, dashboard/pipeline iguais).

## Context
Acesso é gateado por NOME de role hardcoded (~30 pontos) + RLS por nome — mesmo
padrão do clone gerente-relacionamento→obras (mig 111). Varredura exaustiva
mapeou todas as ocorrências de `gerente-comercial`; `sdr` foi adicionado SÓ nas
pertinentes aos módulos do perfil.

## Escopo aplicado (sdr = gerente-comercial)
- **RLS (mig 189, prod+dev):** `is_admin_or_supervisor()` += 'sdr' — visão de
  equipe em leads/conversas etc. (mesma observação que vale p/ gerente: a função
  destrava DADOS além dos módulos; navegação segue pela matriz).
- **Infra:** union `AppUser.role` += "sdr" (auth.ts); `COMMERCIAL_ROLE_RANK.sdr
  = 2` (mesmo nível do gerente; hierarquia cumulativa 75-90).
- **Leads:** editar (`[id]/route`), bulk, **transferir corretor** (`assign` +
  botão TransferBrokerSection do drawer), reativar perdido (gestor E destino
  válido), notas, enviar msg/arquivo/start-whatsapp, análise IA
  (behavior-analysis, resume-ai), feedback de visita (2 endpoints), telas
  /dashboard/leads (dropdown corretores, canReactivate, new).
- **Pipeline:** dropdown de corretores inclui sdr.
- **Dashboard:** blocos "Leads da Equipe"/"Funil da Equipe" (RPCs
  p_broker_id=null) — igual gerente.
- **Agenda:** `canMutateAppointment` HOUSE (editar/cancelar/completar como o
  gerente; IMOB continua só perfil imob).
- **Conversas:** CAN_SEND_ROLES (dashboard/conversas, dashboard/leads,
  broker/leads).
- **Analytics:** leads-by-period.

## FORA do escopo (módulos desligados na matriz — deliberado)
Roleta, bolsão (`canPullBolsaoDashboard` segue só gerente), gestão de
corretores/usuários (apis brokers/users, policies 074/108), configurações
(GERENTE_ALLOWED), pastas, Nicole/treinamento/knowledge, atividades, chat
interno (STAFF_ROLES de /api/admin/mensagens), e **listas de destinatários de
alerta** (notify-stalled-lead FALLBACK_ROLES, digest do bolsão) — a Thielly não
passa a receber alertas de gestor sem decisão explícita.

## Acceptance Criteria
- [x] AC1: mig 189 aplicada em PROD e DEV (função verificada com 'sdr').
- [x] AC2: ~25 checagens TS atualizadas (lista acima); +2 testes (governança
  house/imob p/ sdr; hierarquia rank 2 + bolsão negado).
- [x] AC3: type-check/lint/suíte verdes (1146/1146). Nenhum comportamento muda
  p/ os demais perfis (listas só ganharam um valor).

## File List
- `docs/stories/75-204-perfil-sdr.story.md` (this file)
- `supabase/migrations/189_is_admin_or_supervisor_sdr.sql`
- `packages/web/src/lib/auth.ts` · `lib/roles-hierarchy.ts` (+test) ·
  `lib/appointments/governance.ts` (+test)
- `packages/web/src/app/dashboard/page.tsx` · `dashboard/leads/*` ·
  `dashboard/pipeline/page.tsx` · `dashboard/conversas/[id]/page.tsx` ·
  `broker/leads/[id]/page.tsx` · `components/leads/lead-detail-drawer.tsx`
- `packages/web/src/app/api/leads/**` (12 rotas) ·
  `api/appointments/[id]/feedback/route.ts` ·
  `api/analytics/leads-by-period/route.ts`

## Change Log
- @sm/@po 2026-07-22: escopo = paridade com gerente-comercial LIMITADA aos
  módulos da matriz do perfil; varredura exaustiva antes de editar. GO.
- @dev (Dex) / @qa (Quinn) 2026-07-22: PASS — suíte 1146/1146; leftovers
  conferidos por grep (nenhuma ocorrência pertinente sem 'sdr').
- @devops (Gage) 2026-07-22: mig 189 em PROD+DEV; PR + squash-merge + deploy.
