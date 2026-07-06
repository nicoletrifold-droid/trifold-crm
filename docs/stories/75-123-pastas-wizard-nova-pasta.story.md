# Story 75-123 — Módulo "Pastas": novo "Nova Pasta" em wizard progressivo (corretor + comprador + documentos)

## Metadata
- **Status:** InReview · **Epic:** Pastas · **Branch:** feat/75-123-pastas-wizard · **Complexidade:** M (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 melhora a criação de pasta e captura a origem (corretor/imobiliária).

## Contexto
Hoje o "Nova pasta" é um modal único (nome, empreendimento, tipo PF/PJ, casado) — `dashboard/pastas/_components/pastas-manager.tsx` (`CreateModal`). O diretor pediu para transformar a criação num **wizard progressivo** (telas separadas, stepper), capturando também **quem indicou** (corretor/imobiliária), a marcação **PIX**, e os contatos do interessado. Ver [[project-pastas-documentos]]. Segue a decisão original do módulo: **não amarra ao CRM** (corretor/imobiliária são texto livre).

## Decisões (diretor, 2026-07-06)
1. **Wizard de 3 telas (stepper)** com barra de progresso e Voltar/Avançar — não formulão único.
2. **Tela 1 — Corretor/origem:** nome do corretor, telefone, e-mail, imobiliária, empreendimento, seleção **PIX / SEM PIX**.
3. **Tela 2 — Comprador:** PF × PJ, casado(a)? (igual hoje → puxa docs do cônjuge), telefone + e-mail do interessado.
4. **Tela 3 — Documentos:** mostra o checklist e permite ao gestor **anexar na hora** E exibe o **link** pra mandar ao interessado (os dois).
5. **PIX = adiciona 1 documento** ao checklist: rótulo **"Comprovante de pagamento (PIX)"**, titular = interessado, obrigatório, só quando marcado "PIX".
6. **Corretor e imobiliária = texto livre** (não seleciona do CRM/IMOB).

## Escopo
**IN:**
1. **Migration 158:** novas colunas em `pastas` — `corretor_nome text`, `corretor_telefone text`, `corretor_email text`, `imobiliaria text`, `interessado_telefone text`, `interessado_email text`, `tem_pix boolean not null default false` (todas nullable exceto `tem_pix`). Sem quebrar pastas existentes.
2. **`lib/pastas/checklist.ts`:** `buildDocSlots(tipo, casado, temPix)` — quando `temPix`, injeta o slot `comprovante_pix` (label "Comprovante de pagamento (PIX)", titular `interessado`, required) ao final. Atualizar `checklist.test.ts` (novos casos com/sem PIX em PF e PJ).
3. **`POST /api/pastas`:** aceita e persiste os campos novos; passa `tem_pix` para `buildDocSlots`. Continua exigindo `nome`. Campos de origem opcionais (não bloqueiam). Sanitiza strings (trim, limite de tamanho).
4. **UI wizard** (reescreve `CreateModal` em `pastas-manager.tsx`): stepper 3 telas (●━○━○ "Etapa N/3"), estado por tela, validação por etapa antes de avançar, botões Voltar/Avançar/Concluir. Tela 3 reaproveita: anexar interno (`POST /api/pastas/[id]/documentos/[docId]/upload`, já existe) + copiar link (já existe). Como o upload interno exige a pasta já criada, a pasta é criada ao entrar na Tela 3 (após "Avançar" da Tela 2); a lista dá `router.refresh()` ao concluir.

**OUT:** vincular corretor/imobiliária a entidades do CRM (decisão 6 = texto livre); perfil revisor "Deferido" (segue [[project-pastas-documentos]] Fase 2); notificações; exibir os novos campos na tela de detalhe `/dashboard/pastas/[id]` além do que já mostra (pode ser follow-up se pedirem).

## Acceptance Criteria
1. **Given** admin/supervisor/gerente-comercial/imob, **when** clica "Nova pasta", **then** abre a **Tela 1/3 (Corretor)** com nome/telefone/e-mail do corretor, imobiliária, empreendimento e seleção PIX/SEM PIX; **o "Avançar" exige o nome do corretor preenchido** (demais campos da Tela 1 opcionais). PIX/SEM PIX default = SEM PIX.
2. **Given** a Tela 2/3 (Comprador), **then** escolhe PF × PJ, marca casado(a) (só PF), informa telefone + e-mail do interessado, e pode **Voltar** sem perder o que preencheu na Tela 1.
3. **Given** "PIX" marcado na Tela 1, **when** a pasta é criada, **then** o checklist inclui **"Comprovante de pagamento (PIX)"** (titular interessado); **given** "SEM PIX", **then** esse doc **não** aparece.
4. **Given** a Tela 3/3 (Documentos), **then** o gestor vê o checklist correto (PF/PJ + cônjuge + PIX), consegue **anexar** um documento ali mesmo E vê/copia o **link** público pra mandar ao interessado.
5. **Given** a pasta criada, **then** os campos de origem (corretor nome/tel/email, imobiliária, tel/email interessado, tem_pix) ficam persistidos em `pastas`. Pastas antigas seguem funcionando (colunas nullable / default false).
6. tsc/lint/testes limpos; migration validada em transação.

## Tasks (@dev)
- [x] Migration 158 (colunas novas em `pastas`) — validar em BEGIN/ROLLBACK.
- [x] `checklist.ts`: assinatura `buildDocSlots(tipo, casado, temPix)` + slot `comprovante_pix`; ajustar todos os callers (`api/pastas/route.ts` e qualquer outro). Atualizar `checklist.test.ts`.
- [x] `POST /api/pastas`: aceitar/persistir campos novos + `tem_pix` no `buildDocSlots`.
- [x] Reescrever `CreateModal` como wizard stepper 3 telas (Voltar/Avançar/Concluir, barra de progresso, validação por etapa; reusa upload interno + copiar link).
- [x] `tsc` / `eslint` / `vitest`.

## Dev Agent Record (@dev — 2026-07-06)
- **Decisão de criação da pasta (risco "criação parcial"):** a pasta é criada ao **avançar da Tela 2** (não na Tela 3, nem no "Concluir"). Motivo: o anexo inline na Tela 3 precisa de documentos reais (ids) contra os quais fazer upload. O `POST /api/pastas` passou a **retornar os docs semeados** (`id, slug, label, titular, situacao`) — sem endpoint novo. Se o gestor abandonar na Tela 3, sobra pasta (deletável — Story 75-105). Aceito pelo diretor ("tanto faz").
- **Migration 158** (`corretor_nome/telefone/email`, `imobiliaria`, `interessado_telefone/email`, `tem_pix bool default false`). Validada em `BEGIN…ROLLBACK` no projeto prod (7 colunas criam; rollback confirmado — 0 remanescentes). **Aplicar no @devops.**
- **`checklist.ts`:** `buildDocSlots(tipo, casado, temPix=false)` — 3º arg opcional (compatível com callers antigos); injeta `comprovante_pix` ("Comprovante de pagamento (PIX)", titular interessado) ao final quando `temPix`.
- **`POST /api/pastas`:** aceita/sanitiza (trim + ≤200 chars) os campos de origem/contato + `tem_pix`; passa `temPix` ao `buildDocSlots`; retorna docs semeados.
- **UI wizard** (`pastas-manager.tsx` `CreateModal`): stepper 3 telas com barra de progresso (Etapa N/3), validação por etapa (Tela 1 exige nome do corretor; Tela 2 exige nome do comprador), Voltar preserva estado, PIX/SEM PIX como toggle (default SEM PIX), Tela 3 = "pasta criada" + copiar link + anexar inline por doc (reusa `POST /api/pastas/[id]/documentos/[docId]/upload`), "Concluir" → `router.refresh()`.
- **Callers de `buildDocSlots`:** só `api/pastas/route.ts` (ajustado) + o teste. Grep confirmou.
- **Checks:** `tsc` 0 · `eslint` 0 · `vitest` 7/7 (checklist).
- **Files:** `supabase/migrations/158_pastas_wizard_campos.sql`; `packages/web/src/lib/pastas/checklist.ts` (+`checklist.test.ts`); `packages/web/src/app/api/pastas/route.ts`; `packages/web/src/app/dashboard/pastas/_components/pastas-manager.tsx`.

## Riscos
- **Callers de `buildDocSlots`:** a mudança de assinatura pode quebrar chamadas existentes → grep e ajustar todas (regra [[feedback-nao-quebrar-o-que-funciona]]).
- **Criação parcial:** criar a pasta ao entrar na Tela 3 pode deixar pasta "vazia" se o gestor abandonar — aceitável (dá pra deletar; delete já existe na Story 75-105). Alternativa: criar só no "Concluir". **Decisão do diretor (2026-07-06): tanto faz — @dev escolhe a mais simples/robusta e documenta.**
- **Obrigatoriedade Tela 1:** só **nome do corretor** trava o "Avançar" (confirmado diretor 2026-07-06); nome do interessado segue obrigatório na Tela 2 (como hoje).
- Migration: colunas nullable + `tem_pix default false` não impactam pastas existentes.

## QA Results (@qa — 2026-07-06)
- **PASS** (com observações menores, não bloqueantes).
- **AC1:** Tela 1 mostra corretor (nome/tel/email), imobiliária, empreendimento e PIX/SEM PIX; "Avançar" exige nome do corretor. ✓
- **AC2:** Tela 2 = PF×PJ, casado (só PF), nome/tel/email do comprador; "Voltar" preserva o estado da Tela 1 (state não é resetado). ✓
- **AC3:** PIX → `comprovante_pix` semeado (titular interessado); SEM PIX → não aparece. Coberto por teste unitário (7/7). ✓
- **AC4:** Tela 3 lista o checklist agrupado por titular, anexa inline (reusa `POST /api/pastas/[id]/documentos/[docId]/upload`) e copia o link. Página pública/detalhe leem docs da tabela → o doc PIX aparece p/ interessado e gestor sem recomputo. ✓
- **AC5:** campos persistidos em `pastas`; colunas nullable + `tem_pix default false` → pastas antigas seguem válidas (verificado no ROLLBACK). ✓
- **AC6:** tsc 0 · eslint 0 · vitest 753/753 · migration validada em transação. ✓
- **Segurança:** único caller de `buildDocSlots` é o seeding (server); inputs de origem sanitizados; rotas gated. Sem PII vazando entre pastas (upload valida `doc.pasta_id`).
- **Observações (follow-up, não bloqueiam):** (1) tel/email do comprador capturados na criação ficam em colunas, mas a página pública ainda pede celular/e-mail no form (redundância aceitável); (2) detalhe `/dashboard/pastas/[id]` ainda não exibe os novos campos de origem/PIX (era OUT de escopo) — bom candidato a follow-up; (3) `.insert().select().order("ordem")` pode não garantir ordem no retorno do PostgREST, mas a Tela 3 agrupa por titular → sem impacto visual.
- **Deploy:** migration 158 **ainda não aplicada em prod** (dev-DB pausado) → @devops aplica no push.

## Change Log
- 2026-07-06 — @qa — **QA GATE: PASS**. 6 ACs verificados, 753/753, sem regressão. Observações de follow-up documentadas. Pronto p/ @devops.
- 2026-07-06 — @dev — Implementado (migration 158 + checklist PIX + POST + wizard 3 telas). tsc/eslint 0, vitest 7/7, migration validada em ROLLBACK. Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready. Locadas as decisões do diretor: Tela 1 exige só nome do corretor; criação da pasta = @dev escolhe (tanto faz).
- 2026-07-06 — @sm — Story criada (Draft).
