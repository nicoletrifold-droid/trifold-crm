# Story 75-238 — Briefing Mestre no Kit de Marcas + Lídia lê o Kit no Gerar sugestões

**Status:** Done
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
O marketing respondeu o Briefing Mestre (doc de 27/07; respostas entregues pelo
Marcos em 30/07 — `~/Downloads/Briefing Mestre - Agente de Marketing Trifold.docx`).
Até aqui o "Gerar sugestões" da Lídia só via performance Meta + lista de
empreendimentos — o prompt não conhecia a empresa, o tom, as proibições nem os
argumentos de venda.

## Entrega
1. **Campo `briefing` por marca** (mig 202) + textarea "Briefing (conhecimento
   da Lídia)" no modal do Kit — o marketing atualiza números (% vendido, fase da
   obra) sem dev.
2. **Gerar sugestões lê o Kit**: a rota carrega `marketing_brands`
   (voz_da_marca, diretrizes, briefing) e o flow injeta um bloco "KIT DE MARCAS"
   no prompt, com regra de precedência explícita: **diretriz vence briefing**
   (ex.: argumento "entrega em menos de 1 ano" × proibição de cravar prazo →
   reformular sem violar). Sem marcas cadastradas o prompt fica como era
   (campo opcional).
3. **Carga do conteúdo em prod** (org Trifold):
   - **Trifold (institucional)** — criada com cores oficiais (#000/#F27A5E/
     #2E2E2E/#FFF), fonte Space Grotesk, voz, diretrizes (nunca % de
     valorização/retorno garantido; nunca prazo ≠ contratual; base cristã
     sugerida com sutileza no B2C) e briefing (narrativa 1997, portfólio B2B,
     PMGT/BIM/auditoria/pé-direito 2,70/laje protendida/Lightwall, público,
     3 depoimentos, temas, cadência, referências). Solum (pré-lançamento, sem
     property no CRM ainda) entrou como seção do briefing institucional.
   - **Vind Residence** — voz/diretrizes/briefing (entrega abr/2027 como
     argumento nº 1 SEMPRE contratual; 🚫 não falar do entorno; Airbnb; 48
     unidades; concorrência como contexto interno).
   - **Yarden** — criada (property já existia) com voz (decisão conjugal,
     slogan), diretrizes e briefing (90% vendido, 10/20/70, Gleba Itororó,
     lazer wellness).

## Decisões de produto registradas
- Tensões do briefing resolvidas por diretriz: prazo só o contratual;
  valorização só como potencial/fato, nunca garantia.
- Concorrentes: contexto interno do briefing, com instrução de não citar
  nomes em post.
- Cadência (2 reels + 1 estático + story diário) NÃO cabe no modelo atual de
  posts (canal apenas instagram/facebook, sem formato) — registrado como
  evolução futura, fora desta story.
- Solum: quando o empreendimento for cadastrado no CRM (lançamento ago/set),
  criar a marca própria e mover a seção do briefing institucional para ela.

## Arquivos
- `supabase/migrations/202_marketing_brands_briefing.sql`
- `packages/web/src/lib/marketing/brands.ts`
- `packages/web/src/app/dashboard/campaigns/agente/marcas-section.tsx`
- `packages/web/src/app/api/marketing-posts/generate/route.ts`
- `packages/ai/src/flows/marketing-suggestions.ts` (+ `.test.ts`), `flows/index.ts`

## QA Results
Quinn: **CONCERNS** (3 medium + 5 low) — **todos resolvidos neste ciclo**:
1. *(medium)* Kit sem escopo por marca: a Lídia podia aplicar a diretriz do Vind
   ("não falar do entorno") ao Yarden — cujo argumento nº 1 é justamente o
   entorno — ou cruzar números entre empreendimentos → regra "ESCOPO POR MARCA"
   no prompt (cada bloco vale só para a própria marca).
2. *(medium)* marca de empreendimento INATIVO entrava no Kit com `id=` fora da
   lista válida → sugestão viraria post "institucional" com copy de produto
   arquivado → rota filtra marcas por properties ativas.
3. *(medium, DADO em prod, corrigido na hora)* regra "não citar concorrentes"
   só existia na diretriz do Yarden; Vind tinha só nota no briefing e a Trifold
   nada — com 7 perfis de referência listados sem marcação → diretriz adicionada
   a Trifold e Vind; referências marcadas como "uso interno — NUNCA citar em post".
4. *(low)* Kit vazio gerava sem guardrail e sem rastro → `console.warn`.
   (Decisão mantida: erro na query do Kit = 500 — gerar copy sem as diretrizes
   de valorização/prazo é risco jurídico.)
5. *(low)* sem teto de tamanho nos textos da marca → máx. 20.000 chars no
   validate (briefing gigante estourava o timeout com erro genérico).
6. *(low)* spy do teste com cast que desligava o type-check → tipado com
   `Anthropic.MessageCreateParams`; mocks devolvem post válido e o retorno é
   assertado.
7. *(low)* nada travava o `briefing` no `BRAND_SELECT` (refactor futuro podia
   apagar o conteúdo em prod, calado) → 3 testes novos em brands.test.ts.
8. *(low)* carga de conteúdo não versionada → `scripts/load-briefing-marcas-202607.sql`
   (com histórico dos complementos). Dev ficou sem carga de propósito
   (properties de lá têm outros ids).

Verificado por ele: PATCH parcial preserva o briefing (autosave de fontes da
75-234 não toca no campo); round-trip create/edit OK; consistência das 3 marcas
em prod; posição do bloco no prompt; +~7k chars = folga tranquila no contexto e
no maxDuration 90s. Nota pré-existente registrada: FK `property_id ON DELETE SET
NULL` pode deixar marca de empreendimento sem property e travar o PATCH
(validateBrandConsistency) — vem da 75-229.

## Validação
- Suíte 1291/1291 (6 testes novos) · tsc limpo nos 2 pacotes · build OK
  (rodados antes e depois das correções do QA).
- ✅ LIVE: PR #314 squash-merged (`f8dd2a04`), deploy de produção concluído.
- Mig 202 aplicada em prod e dev; conteúdo carregado em prod (Trifold 3103
  chars de briefing, Vind 1765, Yarden 1660).
