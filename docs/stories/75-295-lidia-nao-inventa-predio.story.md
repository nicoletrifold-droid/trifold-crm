# Story 75-295 — Lídia NÃO inventa o prédio (guardrail de fachada real)

**Story ID:** 75-295
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix (SDC YOLO) — defeito achado pelo Marcos no smoke da 75-294

---

## O defeito (smoke de 11/08, print do Marcos)

Primeiro pedido pago real do Vind: as 3 artes saíram com **uma torre genérica inventada pela
IA** — não é o Vind. A justificativa da própria Lídia confessou a causa: *"Não usei os arquivos
de render do kit como referência de arte porque o pedido exige estética de fotografia real, sem
cara de render"*. O fragmento do chip **"Foto real"** (75-294) instruía *"sem cara de render"* e
o modelo interpretou como licença para largar a referência. Prédio inventado num anúncio do
empreendimento = **propaganda enganosa** — a classe mais grave de defeito deste fluxo, acima do
jurídico da fachada já mapeado ([[project-lidia-arte-legibilidade]]).

## O fix — 4 camadas (nenhuma sozinha segura)

- [x] **AC1 — regra inegociável no prompt da Lídia** (`marketing-post-request.ts`): cena que
      mostra prédio/torre/fachada/obra ⇒ `arquivos_kit` DEVE incluir a foto/render de fachada
      do Kit; "fotografia real" muda o TRATAMENTO, não a permissão de largar a referência; Kit
      sem fachada ⇒ cena SEM o prédio (lifestyle/amenidade/detalhe/entorno) + justificativa.
- [x] **AC2 — rede no SERVIDOR** (não confiar só no modelo): `garantirFachadaNaCena()` +
      `referenciasDeFachada()` em `brands.ts` (puras) — descrição da cena com prédio + Kit com
      fachada disponível + nenhuma referência incluída ⇒ fachadas do Kit FORÇADAS na frente
      (teto de bytes corta o excedente, padrão 75-250). Aplicada a TODAS as telas na rota
      `/pedir`. Prioridade: arquivo com "fachada" no nome/label > `tipo='foto'`; fonte nunca.
- [x] **AC3 — chip "Foto real" reescrito**: de "estética de fotografia real, sem cara de
      render" para "tratamento de fotografia realista (luz e textura naturais), **partindo das
      fotos e renders reais do Kit**".
- [x] **AC4 — prompt do MOTOR imperativo** quando a referência de fachada foi efetivamente
      baixada (`temReferenciaFachada` em `buildArtePrompt`): "o EDIFÍCIO é EXATAMENTE o das
      imagens de referência — PROIBIDO criar outro prédio". A regra branda existente continua
      para os demais casos.
- [x] **AC5 — testes**: 10 novos (rede pura: prioridade/idempotência/cena sem prédio/Kit sem
      fachada · prompt com e sem flag · rota: rede atua SEM o chip). Suíte, type-check e lint
      verdes.

## Teste de regressão manual (Marcos)

Repetir o MESMO pedido do smoke (anúncio pago do Vind, chips Pôr do sol + Foto real): as 3
artes devem sair com o prédio dos renders do Kit — ou, se a cena mudar, SEM prédio nenhum.

## File List

- `packages/ai/src/flows/marketing-post-request.ts` (regra FACHADA E PREDIO no header)
- `packages/web/src/lib/marketing/direcao.ts` (fragmento do chip foto_real)
- `packages/web/src/lib/marketing/brands.ts` (+ `brands.test.ts`) — rede pura
- `packages/web/src/lib/marketing/arte-gen.ts` (+ `arte-gen.test.ts`) — flag imperativa
- `packages/web/src/lib/marketing/arte-service.ts` (calcula `temReferenciaFachada`)
- `packages/web/src/app/api/marketing-posts/pedir/route.ts` (+ `route.pago.test.ts`)

## QA Results (@qa)

**Gate: CONCERNS** — as 4 camadas verificadas no código com teste; o que o gate NÃO prova é o
comportamento do MODELO com o prompt novo (só o teste de regressão manual do Marcos prova).
Risco residual documentado: a heurística da rede é textual (regex de prédio/fachada em
português) — cena descrita sem nenhuma dessas palavras escapa da rede, mas não do prompt (AC1).

## Change Log

- 2026-08-11 — @dev+@qa (YOLO, fluxo mínimo de bug fix): 4 camadas + 10 testes; gate CONCERNS
  (validação final = regenerar o pedido do Vind). Defeito reportado pelo Marcos com print.
