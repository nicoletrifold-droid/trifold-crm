# Story 75-104 — Módulo "Pastas": upload de documentos por link público (Fase 1)

## Metadata
- **Status:** Done (QA PASS) — pronto p/ @devops · **Epic:** Pastas · **Branch:** feat/75-104-pastas · **Complexidade:** L (8 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 substitui envio de documentos por e-mail no pré-lançamento.

## Contexto
No pré-lançamento, interessados enviam documentos por e-mail (não escala). Criar o módulo **Pastas**: o gestor cria uma pasta e gera um **link público**; o interessado abre (sem login) e faz **upload** dos documentos, vendo **o que já entregou e o que falta**. Ver [[project-pastas-documentos]].

## Decisões (diretor)
1. Upload pelo **interessado via LINK público** (sem login). **NÃO** amarra ao CRM/lead.
2. Checklist **sempre a completa** (contrato de compra e venda): PF (RG/CNH, CPF, estado civil, endereço + infos profissão/e-mail/celular; **cônjuge se casado**) · PJ (contrato social + representante legal com os mesmos docs/infos).
3. **Quem valida ("Deferido") = perfil novo, futuro** — NÃO gatear o revisor agora; por ora admin/supervisor gerenciam. (Só lembrar.)

## Escopo (Fase 1)
**IN:**
1. **Migrations:** `pastas` (nome, tipo pf/pj, casado, empreendimento, token único, status, form_data jsonb, created_by, org_id) + `pasta_documentos` (slug, label, titular interessado/conjuge/representante, required, situacao pendente/entregue/deferido/recusado, storage_path, filename, uploaded_at). Bucket privado `pastas`. RLS org-scoped (público passa por admin client). Módulo `pastas` na matriz p/ admin/supervisor.
2. **Checklist config** `lib/pastas/checklist.ts` — `buildDocSlots(tipo, casado)` + `buildInfoFields(tipo, casado)` (testado).
3. **Gestão (dashboard, admin/supervisor):** `/dashboard/pastas` listar + criar (nome/tipo/casado/empreendimento → gera token, semeia docs, mostra link p/ copiar); `/dashboard/pastas/[id]` ver docs (pendente/entregue), baixar (signed URL), marcar situação (deferido/recusado — provisório até o perfil revisor).
4. **Público** `/pasta/[token]` (sem auth, admin client): layout 2 colunas **Pendente × Entregue** + **Anexar** por documento + form de infos. `POST /api/pasta/[token]/upload` (multipart → storage + situacao=entregue) e `PATCH /api/pasta/[token]` (form_data). Valida token.
5. **Nav:** item "Pastas" gated por `permissions["pastas"]`.

**OUT:** perfil revisor dedicado + workflow formal de aprovação (decisão 3 — futuro); notificações de "faltou X"/"recusado" (Fase 2); vínculo com lead/CRM (por decisão); assinatura do termo (fora).

## Acceptance Criteria
1. **Given** admin/supervisor, **when** cria uma pasta (tipo/casado), **then** recebe um **link** e a pasta já vem com os documentos certos semeados (PF/PJ + cônjuge se casado).
2. **Given** o link público (sem login), **then** o interessado vê **Pendente × Entregue**, anexa cada documento (vai pro bucket privado; situação vira "entregue") e preenche as infos.
3. **Given** token inválido, **then** 404/página de erro; **given** upload sem doc válido daquela pasta, **then** rejeitado.
4. **Given** o gestor na pasta, **then** baixa os arquivos (signed URL) e vê o que falta.
5. Bucket é **privado**; público nunca lê storage direto (só via API com token). tsc/lint/testes limpos.

## Dev Agent Record (@dev — 2026-07-01)
- [x] **Migrations 139** (`pastas` + `pasta_documentos` + bucket privado `pastas` + RLS org-scoped) e **140** (módulo `pastas` p/ admin/supervisor). Testadas em BEGIN/ROLLBACK (pasta criada, permissão nos 2 perfis, bucket ok). Aplicar no @devops.
- [x] `lib/pastas/checklist.ts` — `buildDocSlots`/`buildInfoFields` (PF/PJ + cônjuge) + `checklist.test.ts` (6 casos).
- [x] **APIs dashboard:** `POST /api/pastas` (cria + gera token + semeia docs), `GET /api/pastas/[id]/documentos/[docId]/signed-url` (download privado), `PATCH .../[docId]` (situacao — provisório admin/supervisor).
- [x] **APIs públicas (token, admin client):** `POST /api/pasta/[token]/upload` (multipart → bucket privado, valida doc∈pasta, 25MB, ext pdf/imagem, situacao=entregue), `PATCH /api/pasta/[token]` (form_data merge, só strings).
- [x] **Páginas:** pública `/pasta/[token]` (server carrega por token; client = 2 colunas Pendente×Entregue + Anexar + barra de progresso + form de infos); dashboard `/dashboard/pastas` (lista + modal criar + copiar link via `window.location.origin`) e `/dashboard/pastas/[id]` (docs por titular, baixar, deferir/recusar, infos).
- [x] **Nav:** item "Pastas" (`FolderClosed`) gated por `permissions["pastas"]`.
- **Checks:** `tsc` 0 · `eslint` 0 · `vitest` 6/6. Migrations validadas em transação.
- **Files:** migrations 139/140; `lib/pastas/checklist.ts`(+test); `api/pastas/route.ts`, `api/pastas/[id]/documentos/[docId]/route.ts` + `/signed-url/route.ts`, `api/pasta/[token]/route.ts` + `/upload/route.ts`; `pasta/[token]/page.tsx` + `_components/pasta-public.tsx`; `dashboard/pastas/page.tsx` + `_components/pastas-manager.tsx`; `dashboard/pastas/[id]/page.tsx` + `_components/pasta-detail.tsx`; `dashboard/layout.tsx`.

## QA Results (@qa — 2026-07-01)
- **PASS.**
- **AC1:** criar pasta (admin/supervisor) → token + docs semeados por tipo/casado (checklist unitado 6/6).
- **AC2:** link público sem login → Pendente×Entregue, Anexar sobe pro bucket privado (situacao=entregue), form de infos salva.
- **AC3:** token inválido → página "Link inválido"; upload valida `doc.pasta_id === pasta(token)` (rejeita doc de outra pasta) + extensão + 25MB.
- **AC4:** gestor baixa via signed URL (1h) e vê situação; deferir/recusar provisório.
- **AC5:** bucket **privado** (`public=false`); público nunca acessa storage direto — só via API com token (service role). RLS org-scoped no dashboard.
- **Segurança:** rotas dashboard gated admin/supervisor (403); rotas públicas só expõem o que o token permite; form_data aceita só strings (≤500 chars). Sem PII vazando entre pastas.
- **Nota:** revisor dedicado ("Deferido") é PERFIL FUTURO (decisão 3) — hoje admin/supervisor marcam; documentado. RLS org-scoped não é 100% testável via MCP (roda como postgres) → conferir no teste pós-deploy que a lista aparece p/ o gestor.

## Change Log
- 2026-07-01 — @dev/@qa — módulo Pastas Fase 1 implementado (link público + upload + checklist PF/PJ/cônjuge + gestão). Migrations validadas. Done.
- 2026-07-01 — @po — GO (9/10).
- 2026-07-01 — @sm — Story criada.
