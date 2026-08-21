# Story 75-365 — Origem do lead mostrava "120246224161970741" em vez da campanha

**Status:** InReview — implementada · testes/lint/type-check verdes · sem migration
**Tipo:** Fix de exibição — resolver IDs do Meta para nomes (drawer + card do pipeline)
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## De onde veio

Reportado pelo Marcos em 21/08 com print: o lead **ANTONIO CAMPI** (formulário de qualificação,
Épico 89) mostra na seção "Origem do Lead" do drawer o valor **`120246224161970741`** — e o card
no board mostra outro número parecido. "Sei que veio do formulário, mas não está mostrando isto."

## Diagnóstico (conferido em prod)

O dado está CERTO no banco: `source='form_qualificacao'`, `metadata.form_nome='Investimento
Maringá — Agosto'`. O número vem dos UTMs: a URL do anúncio pago usa os macros do Meta
(`utm_campaign={{campaign.id}}`, `utm_content={{ad.id}}`), então o lead carrega
`utm_campaign='120246224161970741'` (ID da campanha) e `utm_content='120246224161940741'`
(ID do anúncio). E:

- o drawer renderiza `utm_campaign ?? utm_source ?? rótulo do source` — o ID cru vence;
- o card, quando o Épico 50 não resolve criativo (ele só olha `metadata.ad_id`, que lead de
  formulário não tem), cai no `SourceBadge label={utm_content}` — ID cru de novo.

**Os nomes já existem no CRM**: o sync do Agente Meta Ads (75-262) guarda
`meta_campaigns`/`meta_ads`. Os dois IDs do print resolvem:
campanha = "[LEADS. VIND. INVESTIDORES.CAPITAIS] [18.08.26]", anúncio =
"PLANTA+MGA_VIND_INVISTA EM MGA+PREÇO + ENTREGA". 3 leads afetados até agora, 3 resolvíveis.

Decisão de desenho: resolver na **exibição**, não na captura — a captura pode chegar antes de o
sync conhecer o anúncio; na exibição, assim que o sync roda o nome aparece sozinho, sem backfill.

## ACs

**AC1 — Card do board: lead de formulário ganha o MESMO CreativeChip dos leads de CTWA.**
`fetch-creatives` (Épico 50, REUSO/ADAPT) passa a extrair o ad_id também de `utm_content`
numérico quando `metadata.ad_id` não existe. Miniatura + nome do anúncio + campanha, resolvidos
na MESMA query batched de sempre (contrato de performance do 50-2 intacto: 1 query por página).

**AC2 — Card fallback: nunca número cru.** Quando o criativo não resolve (sync ainda não viu o
anúncio), o `SourceBadge` não recebe `utm_content` numérico como label (mostra só "Formulário"),
e o chip verde de `utm_campaign` (CTWA) também some quando o valor é ID numérico.

**AC3 — Drawer "Origem": nome da campanha, nunca ID.** `GET /api/leads/[id]` resolve
`utm_campaign`/`utm_content` numéricos em `meta_campaigns`/`meta_ads` e devolve
`utm_campaign_nome`/`utm_content_nome`. A linha "Origem" mostra: nome da campanha resolvido →
`utm_campaign` não-numérico → rótulo do source ("Formulário"). ID numérico sem resolução NUNCA
aparece (nem via `utm_source='fb'`, que também não é origem legível).

**AC4 — Best-effort.** Falha na resolução (tabela vazia, erro de query) degrada para o rótulo do
source. Nada quebra, nada some além do número.

**AC5 — Sem migration, sem env.** Só leitura das tabelas do sync existente.

## Fora de escopo

- Traduzir na captura / backfill dos UTMs gravados (a exibição resolve os 3 casos existentes).
- Analytics: `utm_campaign` lá só casa LP por nome (`ilike`) — ID numérico cai em "other", não
  quebra tela. Se um dia quisermos atribuição por campanha paga no analytics, é story própria.
- Filtro "Campanha" do pipeline (é outro conceito — campanhas do CRM, não do Meta).

## Dev Agent Record

**Branch:** `75-365-origem-lead-nome` (worktree `~/tmp_claude/wt-75-365`)

| arquivo | o quê |
|---|---|
| `packages/web/src/lib/leads/meta-utm.ts` | novo — `ehIdMeta()` + `resolverNomesUtm()` (batch, best-effort) |
| `packages/web/src/lib/leads/meta-utm.test.ts` | novo |
| `packages/web/src/lib/pipeline/fetch-creatives.ts` | ad_id também sai de `utm_content` numérico (fallback do `metadata.ad_id`) |
| `packages/web/src/app/api/leads/[id]/route.ts` | GET devolve `utm_campaign_nome`/`utm_content_nome` |
| `packages/web/src/components/leads/lead-detail-drawer.tsx` | linha "Origem" usa nome resolvido; ID cru nunca renderiza |
| `packages/web/src/components/pipeline/lead-card.tsx` | fallback do badge/chip esconde valores numéricos |

**Como conferir depois do deploy:** abrir o Antonio Campi no pipeline — card com miniatura do
anúncio "PLANTA+MGA_VIND…", drawer com Origem = "[LEADS. VIND. INVESTIDORES.CAPITAIS] [18.08.26]".

## QA Results

**Verdict: PASS**

1. Code review ✓ — REUSO honrado: `fetch-creatives` (50-2) adaptado, `SOURCE_LABELS` canônico
   substitui o mapa inline duplicado do drawer (que nem tinha `form_qualificacao`).
2. Testes ✓ — 6 novos em `meta-utm.test.ts` (IDs reais do caso Antonio; fake supabase com
   travas explícitas de tabela/filtro — o gotcha do fakeDb que ignora `.eq()`); suíte 2897 ✓.
3. ACs ✓ — card via CreativeChip, fallback sem número, drawer com nome, best-effort, sem migration.
4. Regressões ✓ — contrato de performance do 50-2 intacto (1 query batched); leads CTWA/Meta
   Lead Forms seguem pelo `metadata.ad_id` (precedência preservada).
5. Performance ✓ — GET do lead ganha 2 `maybeSingle` em paralelo, só quando o UTM é numérico.
6. Segurança ✓ — consultas escopadas por `org_id` (testado).
7. Docs ✓ — story com verificação pós-deploy (abrir o Antonio Campi).

## Change Log

- 21/08 @sm: draft a partir do print do Marcos + diagnóstico em prod.
- 21/08 @po: GO (10/10).
- 21/08 @dev: implementada + testes; vitest 2897 ✓ · type-check 13/13 ✓ · lint ✓.
- 21/08 @qa: PASS.
