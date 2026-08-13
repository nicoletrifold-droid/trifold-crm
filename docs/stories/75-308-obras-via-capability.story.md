# Story 75-308 — Perfis de Acesso 2.0 · F3-7: Obras via capabilities (o maior módulo)

**Story ID:** 75-308
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-7 — 39 gates de API + 6 superfícies de UI; pior caso de
  drift do inventário: `ALLOWED_ROLES` duplicada em 20+ arquivos com 5 valores diferentes)

## Story

Como **admin**, quero **as 18 ações de Obras decididas pela matriz**, matando as ~20 cópias
locais de `ALLOWED_ROLES` (o caso que motivou o épico). Clientes/Portal ficam para a F3-8.

**Zero mudança de comportamento** — espelho estrito, congelado em teste.

## 🔴 Capability NOVA: `obras.ver` (mig 227 — APLICADA em prod antes do merge)

Os GETs de Obras hoje exigem [A,S,OBR,GR] — o módulo `obras` ligado NÃO basta. **Achado de
prod:** `consultoria` tem o módulo Obras ON na matriz e é bloqueada pelas listas (mais um
"caso Silmara") — mas aqui a RLS TAMBÉM a bloqueia (`is_admin_or_supervisor` não a inclui),
então liberar exigiria F4. Espelho estrito: `obras.ver` [A,S,OBR,GR] preserva o bloqueio;
**a pergunta da consultoria fica anotada para a F4, com o Marcos.**
Validada em prod: obras.ver = A/S/OBR/GR (consultoria fora ✓).

## Mapeamento (resumo — 39 gates de API)

- **obras.ver** — GETs (lista, detalhe, fases, templates, documentos, signed-url,
  marcar-lido de mensagens)
- **criar · editar · apagar · reativar** — POST/PATCH/DELETE de obra ([A,S,OBR,GR] / [A] p/
  apagar+reativar, incl. as 2 condições INLINE de `deleted_at=null`)
- **fases_gerenciar · documentos_gerenciar · documentos_assinar · clientes_vincular** — CRUDs
- **fotos_enviar** (relabel "Gerenciar fotos") — POST/PATCH/DELETE via API [A,S,OBR,GR];
  **fotos_apagar** [A,S] = botões de exclusão DIRETA na tela (a divergência UI×API é
  PRÉ-EXISTENTE e foi preservada em duas camadas, documentada)
- **aprovar_uploads** — fila, decisão, badge do menu, coluna Pendências (isGestor do
  aprovacoes/[id] incluído)
- **mensagens_enviar** [A,S,OBR,GR,+broker] — chat da obra (GET/POST/upload)
- **distrato** [A] · **sienge_gerenciar** [A,S] (4 rotas + enterprises) ·
  **vincular_imovel** [A,S] (3 rotas admin/properties) · **receber_email_aprovacao** [A,S]
  (toggle em Configurações) · **sistema.manutencao** [A] (backfill)
- **solicitar_exclusao NÃO migra** — seed [OBR,GR] sem admin = FLUXO de quem envia
  (regra da 75-305); segue role-based, teste garante que não vira toggle.

## Acceptance Criteria

- [x] **AC1** — Zero `ALLOWED_ROLES`/`ADMIN_ONLY` em `api/admin/obras|properties|sienge`;
      39 gates via `requireCapability`/`can()`; UI (6 superfícies) via props server-resolved.
- [x] **AC2** — Espelho estrito congelado (3 testes cobrindo os 18 seeds).
- [x] **AC3** — 18 caps enforced (41 no total); `solicitar_exclusao` provadamente fora.
- [x] **AC4** — Mig 227 gerada, aplicada em prod ANTES do merge, validada.
- [x] **AC5** — Gates verdes + smoke 12/12 (API obras 200; coluna Pendências; 9 ações na
      matriz; solicitar_exclusao ausente).
- [x] **AC6** — Limites: fluxo de fila p/ OBR/GR intacto (role-based interno); RLS de obras
      (god-gate) — F4; consultoria — decisão F4; Clientes/Portal — F3-8.

## Change Log

- 2026-08-13 · @sm (River) · Draft (módulo dividido: Obras aqui, Clientes na F3-8).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — exigido: mapa por rota EXPLÍCITO na story;
  divergência fotos UI×API preservada nas duas camadas (não "corrigida" de fininho);
  consultoria = pergunta registrada, não decisão. → Ready.

## File List (resumo)

19 rotas de API (obras/properties/sienge) · `dashboard/obras/page.tsx` +
`[obra_id]/page.tsx` · `obra-detail-tabs.tsx` (props `canAprovarUploads`/`canApagarDireto`) ·
`obra-sienge-section.tsx` (prop `canManage`, userRole morto removido) · `dashboard/layout.tsx`
(badge) · `configuracoes/page.tsx` (toggle e-mail) · `lib/capabilities.ts` (+obras.ver, 18
enforced) · `mig 227` (gerada) · 2 testes de rota adaptados (mock decide pelo seed) ·
`capabilities.test.ts` (+3 espelhos).

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-308-obras-capability`.

- O batch mecânico usou substituição POR OCORRÊNCIA (arquivos com 2 handlers têm caps
  diferentes — GET≠POST); asserts de contagem de gates por arquivo antes de trocar.
- Gotcha operacional registrado: a 1ª tentativa de aplicar a 227 falhou SILENCIOSAMENTE
  (payload não criado por cwd errado; a resposta `[]` era de outra query) — detectado pela
  VERIFICAÇÃO pós-aplicação (count 170 ≠ 180). Reforça a regra: aplicar e SEMPRE verificar
  por query, nunca confiar só no `[]`.
- Smoke 12/12 · suíte **2341 passed** · tsc 0 · eslint base 24 (1 warning novo de prop morta
  ELIMINADO removendo a prop, não silenciando) · build 0.
- Não observado: perfil obras/GR em runtime (sem credencial ativa de teste; Ana Luiza é
  real). Coberto por espelho congelado + fluxo de fila intocado.

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 94**

O maior lote do épico, mecânica sob controle: asserts de contagem antes do batch, espelhos
congelados, e o incidente da migration pego pela própria disciplina de verificação (é o
comportamento que queremos — a falha silenciosa da Management API é conhecida da casa).
Observação p/ F4: a pergunta da consultoria (módulo ON × ALLOWED × RLS) está bem posta —
decidir lá, com o Marcos. Sem concerns bloqueantes.
