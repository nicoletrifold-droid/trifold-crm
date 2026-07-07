# Story 75-148 — Imobiliária como cadastro (base única) no módulo Pastas

**Status:** Ready for Review
**Epic:** Pastas / IMOB
**Depende de:** 75-146 (auto-cadastro de pasta pela imobiliária), 75-92 (cadastro de imobiliárias)

## Contexto / demanda (diretor, 2026-07-07)
Hoje as Pastas guardam a imobiliária como **texto livre** (`pastas.imobiliaria`, `pasta_links.imobiliaria`),
desconectado do cadastro rico de `imobiliarias` (módulo IMOB). Isso impede relatório confiável por imobiliária
e permite grafias divergentes. Pedido: ao **Gerar link** e em **Nova pasta**, a imobiliária deixa de ser campo
livre e passa a ser **seleção da base** (cadastro de verdade). Requisito central: **perfis que só têm acesso ao
módulo Pastas (sem IMOB) precisam conseguir cadastrar/gerenciar imobiliária** — base única, um só banco.

## Acceptance Criteria
1. **AC1** — `pastas` e `pasta_links` referenciam `imobiliarias` via `imobiliaria_id` (FK). A coluna `imobiliaria`
   (texto) vira snapshot do nome (exibição/filtro); a verdade p/ relatório é o id.
2. **AC2** — Em **Nova pasta** (wizard) e **Gerar link**, a imobiliária é um **select da base** + botão
   **"+ Cadastrar nova imobiliária"** inline (formulário completo). Fim do texto livre.
3. **AC3** — **Gerar link**: imobiliária **obrigatória** (id). **Nova pasta**: **opcional** (cliente direto sem
   imobiliária continua válido) — só troca texto-livre por seleção.
4. **AC4** — Perfil **gestor de Pastas sem acesso ao IMOB** consegue **listar/criar/editar** imobiliária:
   guard compartilhado `imobiliariasGuard` (canAccess("imob") **OU** isPastaManager) na API de imobiliárias
   (GET/POST/PATCH) + nova aba **Imobiliárias** dentro de Pastas (`/dashboard/pastas/imobiliarias`), reusando a
   mesma tela do IMOB.
5. **AC5** — Fluxo público `/pasta/nova/[token]` inalterado do ponto de vista do usuário: imobiliária **travada**
   do link (agora via `imobiliaria_id`), mostrada no banner.
6. **AC6** — Backfill best-effort do texto livre existente → `imobiliaria_id` (casa por nome, mesma org). O que
   não casar fica sem vínculo (não quebra). Sem regressão nos fluxos que já funcionam.

## Mudanças
- **Migration 163** — `imobiliaria_id uuid → imobiliarias(id)` em `pastas` e `pasta_links` + índices + backfill.
- **lib/imob/guard.ts** — novo `imobiliariasGuard` (IMOB **ou** gestor de Pastas).
- **api/imob/imobiliarias/route.ts** — novo **GET** (listar, campos mínimos) + POST usa o guard compartilhado.
  `[id]/route.ts` (PATCH) idem.
- **imobiliaria-form-modal.tsx** (novo) — modal de cadastro completo EXTRAÍDO do ImobiliariasManager (reuso).
- **imobiliarias-manager.tsx** — passa a usar o modal extraído.
- **imobiliaria-select.tsx** (novo, components/pastas) — select da base (GET) + "+ nova" inline.
- **pasta-wizard.tsx** — interno usa ImobiliariaSelect (id + nome snapshot); público mantém travado no banner.
- **pastas-manager.tsx** — Gerar link usa ImobiliariaSelect (obrigatório) + link "Imobiliárias" no header.
- **dashboard/pastas/imobiliarias/page.tsx** (novo) — aba de gestão gateada por isPastaManager, reusa o manager.
- **APIs** `pastas` (id opcional), `pasta-links` (id obrigatório), `pasta/nova/[token]` (id do link).

## Dev Notes
- Sem lookup de nome no servidor: as tabelas `imobiliarias` têm RLS sem policy (só admin lê). O select envia
  `imobiliaria_id` + `imobiliaria` (nome); a **FK garante a existência** do id. Snapshot de nome pode ficar
  levemente defasado se a imobiliária for renomeada — aceitável (relatório usa o id). Prod é single-org.
- Coluna `imobiliaria` texto mantida (pasta_links é NOT NULL) → seguimos gravando o nome snapshot.

## QA Results
**Gate: PASS** (Quinn, 2026-07-07) — `docs/qa/gates/75.148-imobiliaria-cadastro-pastas.yml`.
tsc 0, eslint 0 nos arquivos da story, **vitest 837/837** (+3 novos: guard compartilhado / GET). Migration 163
a aplicar em prod antes do deploy.
