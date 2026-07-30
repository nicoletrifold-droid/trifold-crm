# Story 75-237 — Calor do Lead: o corretor manda (IA não desfaz) + selinho na lista

**Status:** InReview
**Tipo:** Bug + Feature (pequena)
**Epic:** Leads / gestão comercial
**Complexidade:** M

## Contexto
Marcos (30/07), olhando um lead marcado "Frio" pelo sistema:
*"o corretor sempre pode escolher a temperatura, ele é superior ao sistema"* e,
esclarecendo: *"não há problema o sistema definir; o que falo é que o corretor
pode mudar — entrou frio pelo sistema, o corretor pode evoluir"*.

**Bug confirmado:** `interest_level` era recalculado a partir do
`qualification_score` em DOIS lugares, sem olhar se um humano já havia escolhido:
- `packages/ai/src/chat/pipeline.ts` — a CADA mensagem processada pela Nicole;
- `packages/ai/src/flows/haiku-enrichment.ts` — a cada rodada do cron
  `enrich-leads`.

Ou seja: corretor evoluía o lead para Quente e a próxima mensagem do cliente (ou
o cron) devolvia para Frio, calado. Medição em prod antes do fix: **78 leads**
com temperatura divergente da régua do score — todos eram escolha humana viva,
esperando a próxima sobrescrita.

Também entrou o pedido da conversa anterior: o filtro de Calor (75-236) subiu,
mas a lista não mostrava a temperatura — dava para filtrar "Quente" sem ver o
calor de cada lead.

## Entrega

### 1. A escolha do humano manda
- `leads.interest_level_manual boolean NOT NULL DEFAULT false` (mig 201).
- Escrita humana carimba a flag: **toda** tela (form do corretor, drawer do
  gestor, modal de histórico rápido) passa por `PATCH /api/leads/[id]`, e o
  cadastro manual por `POST /api/leads` — os dois pontos setam a flag. A Nicole e
  o cron escrevem direto no banco, então não há como confundir origem.
- IA respeita: helper `stripManualInterestLevel(patch, lead)` (irmão do
  `stripAlreadyFilledPerfil` da 75-183) aplicado no pipeline da Nicole **e** no
  cron. `qualification_score`/`ai_summary` seguem dinâmicos — o guard é só do calor.
- **Reversível:** humano limpar para "Não definido" zera a flag e a IA reassume.
- Backfill da 201: marca como manual quem divergia da régua do score (só um
  humano pode ter causado essa divergência). Quem coincidia fica `false` — a IA
  segue livre até alguém tocar. Resultado em prod: **78 manuais** (divergência residual = 0).

### 2. Selinho de Calor na lista
- Coluna **Calor** na tabela de Leads, antes de Score: 🔥 Quente (vermelho),
  Morno (âmbar), Frio (azul), `-` quando não definido. Rótulos vêm de
  `lib/leads/calor.ts` (mesma fonte do filtro da 75-236).

## Arquivos
- `supabase/migrations/201_leads_interest_level_manual.sql`
- `packages/ai/src/flows/haiku-enrichment.ts` (+ `.test.ts`), `flows/index.ts`
- `packages/ai/src/chat/pipeline.ts`
- `packages/web/src/app/api/leads/route.ts`, `api/leads/[id]/route.ts`
- `packages/web/src/app/api/cron/enrich-leads/route.ts`
- `packages/web/src/components/leads/leads-bulk-table.tsx`
- `packages/web/src/app/dashboard/leads/page.tsx`

## QA Results
Quinn: **CONCERNS** (1 medium + 2 low) — **os 3 corrigidos neste ciclo**:
1. *(medium, o mais importante)* o carimbo disparava em **todo save** do form, não
   só quando o calor mudava: os forms reenviam `interest_level` com o valor
   pré-carregado, então corrigir um dígito do telefone marcava o lead como
   "manual" e **congelava a IA num valor que ela mesma calculou** — o oposto do
   pedido ("entrou frio, pode evoluir"). Agora a rota compara com o valor atual e
   só carimba quando muda (uma leitura só, reaproveitada da regra de
   transferência de corretor). Ficou coerente com o modal de histórico rápido,
   que já comparava no client.
2. *(low)* fail-safe: se o SELECT do lead falhar (timeout), `currentLead` vinha
   como `{}` e a IA voltava a sobrescrever. Agora leitura desconhecida
   (`null`/`undefined`) conta como manual — falha transitória não desfaz a
   escolha do corretor. +2 testes.
3. *(low)* o `colSpan` do "Nenhum lead encontrado" não acompanhou a coluna nova
   (9/10 → 10/11) — visível ao filtrar um calor sem resultado.

Verificado por ele: **completude do guard** (varreu repo + `pg_proc` + triggers de
`leads` no banco de prod: nenhuma função/trigger toca calor; nenhuma outra rota,
webhook ou cron escreve o campo); as **3 telas** passam por
`PATCH /api/leads/[id]` (nenhuma escreve direto no banco); **nenhuma automação**
chama esse PATCH (o carimbo "humano" não é falsificável); caminho reverso
("Não definido" → flag volta a false) OK; backfill correto e conservador
(divergência residual com `manual=false` = **0**; os 78 têm perfil coerente com
escolha humana); alinhamento `<thead>`×`<tbody>` conferido em todos os ramos.

Janela de corrida conhecida e aceita: a flag é lida no início do turno da Nicole
e o UPDATE sai no fim — escolha feita nesse intervalo de segundos pode ser
perdida. Mesmo formato do guard da 75-183.

## Validação
- Suíte 1285/1285 (5 testes novos do guard) · `tsc --noEmit` limpo nos dois
  pacotes · eslint sem novos avisos · `next build` OK.
- Mig 201 aplicada em prod (dsopqkqjkmhytudaaolv) e dev (xnxvygyfyyyzwhiuoehz);
  distribuição da flag conferida nos dois.
