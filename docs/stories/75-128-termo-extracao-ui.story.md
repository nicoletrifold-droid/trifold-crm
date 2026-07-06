# Story 75-128 — Termo de Intenção: extração por visão + revisão + anexo (Etapas 2/3)

## Metadata
- **Status:** Done (merge junto do recurso) · **Epic:** Pastas / Termo auto-preenchido · **Branch:** feat/termo-autopreenchido · **Complexidade:** L (8 pontos)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Completa o recurso iniciado na Etapa 1 ([[75-127]] motor `fillTermo`). Etapa 2 = extrair dados dos documentos da pasta com a visão do Claude; Etapa 3 = botão + tela de revisão editável + gerar o Termo e anexar na pasta (pronto p/ assinatura). Ver [[project-termo-autopreenchido]].

## Escopo
**IN:**
1. **Extração (`lib/pastas/termo/extract.ts`):** baixa RG/CNH, CPF, comprovante de endereço (e `contrato_social` PJ) do bucket privado, monta blocos image/document base64 e chama o Claude (`claude-sonnet-4-6`) com **tool-use** (`registrar_dados`) → `{ titular{nome,cpf,rg}, conjuge, endereco{...}, razao_social, cnpj }`. Ignora slugs irrelevantes e formatos não suportados (heic). Best-effort (try/catch).
2. **Merge (`lib/pastas/termo/build.ts`):** `buildTermoData(pasta, extraidos)` — nome/endereço dos docs + profissão/celular/e-mail do `form_data`/pasta + corretor/imobiliária/fluxo/PIX das colunas. PF→nome do titular; PJ→razão social.
3. **APIs:** `POST /api/pastas/[id]/termo/extrair` (visão→TermoData+signer, não persiste) e `POST /api/pastas/[id]/termo/gerar` (fillTermo→upload bucket→linha `pasta_documentos` slug `termo_intencao`, substitui se já existir). Ambas Node runtime, gate `isPastaManager`.
4. **UI (`pasta-detail.tsx`):** botão "Gerar Termo de Intenção" → chama extrair → **modal de revisão editável** (nome, profissão, celular, e-mail, endereço, cônjuge, corretor, imobiliária, fluxo, PIX, data) → "Gerar e anexar" → `router.refresh()`. O Termo aparece na lista e usa o "Enviar p/ assinatura" existente.

**OUT:** pré-preencher automaticamente o signatário da Clicksign (o `extrair` já devolve `signer`, mas o wire no modal de assinatura fica p/ follow-up); outros empreendimentos.

## Acceptance Criteria
1. **Given** uma pasta com documentos, **when** clico "Gerar Termo de Intenção", **then** a visão lê os docs e abre a revisão com nome/endereço preenchidos + dados da pasta.
2. **Given** a extração falha (visão indisponível/erro), **then** a revisão abre mesmo assim com os dados da pasta (fallback), sem quebrar.
3. **Given** eu confirmo na revisão, **then** o Termo preenchido é gerado e **anexado na pasta** (slug `termo_intencao`), aparecendo na lista com "Enviar p/ assinatura".
4. **Given** eu gero de novo, **then** substitui o Termo anterior (não duplica; remove o arquivo velho).
5. Gate gestor nas 2 rotas; sem PII vazando. tsc/lint/testes limpos.

## Dev Agent Record (@dev — 2026-07-06)
- `extract.ts` (visão + tool-use), `build.ts` (merge), rotas `termo/extrair` e `termo/gerar` (Node runtime, maxDuration 60), UI no `pasta-detail.tsx` (botão + `TermoReviewModal` editável).
- Reusa: `createAnthropicClient()`/@trifold/ai, padrão de blocos image+document do pipeline, download do bucket (rota de assinatura), upload+linha (rota de upload interno).
- **Checks:** tsc 0 · eslint 0 · vitest 757/757. Motor (Etapa 1) verificado visualmente.
- **Não testável localmente:** `ANTHROPIC_API_KEY` só na Vercel → a extração real é validada no 1º uso em prod (desenho é seguro: fallback + revisão obrigatória antes de gerar). Fill 100% verificado.
- **Files:** `lib/pastas/termo/{extract.ts, build.ts}`; `app/api/pastas/[id]/termo/{extrair,gerar}/route.ts`; `app/dashboard/pastas/[id]/_components/pasta-detail.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS (com validação real pendente em prod).** AC1/AC3/AC4 cobertos pelo código (extrair→revisão→gerar→anexa→substitui); AC2 = try/catch na rota + fallback no build; AC5 = gate `isPastaManager` nas 2 rotas, RLS org-scoped. Sem regressão (757/757). Fill verificado visualmente. Extração por visão: validar no 1º uso real (key só em prod) — risco mitigado por revisão obrigatória.

## Change Log
- 2026-07-06 — @qa — PASS (validação da visão no 1º uso real).
- 2026-07-06 — @dev — Etapas 2/3 implementadas.
- 2026-07-06 — @po — GO (10/10).
- 2026-07-06 — @sm — Story criada.
