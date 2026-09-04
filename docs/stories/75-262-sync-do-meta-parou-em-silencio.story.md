# Story 75-262 — O sync do Meta parou em silêncio (nível de anúncio e posicionamento)

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Bug de pipeline de dados — descoberto ao tentar usar os dados para decidir arte

---

## Story

**Como** quem decide criativo e formato com base em desempenho,
**Quero** que o sync do Meta traga o nível de **anúncio** e o de **posicionamento**,
**Para que** a decisão sobre arte pare de ser palpite — hoje os dois níveis que responderiam
"qual criativo funciona" e "story ou feed?" estão vazios ou congelados.

---

## Context — como isso apareceu

O Marcos pediu uma leitura do desempenho do Meta para alimentar o Briefing do Kit de Marcas.
Ao levantar a base, a cobertura por nível não era uniforme:

| nível | período | investimento | leads | estado |
|---|---|---|---|---|
| campanha | 17/05 → **02/08** | R$ 13.036,74 | 351 | ✅ atual |
| conjunto | 17/05 → **02/08** | R$ 13.036,74 | 351 | ✅ atual |
| **anúncio** | 17/05 → **07/06** | R$ 3.690,16 | 95 | 🔴 **congelado há 8 semanas** |
| **posicionamento** | — | — | — | 🔴 **0 registros, sempre** |

São exatamente os dois níveis que decidem arte. O de campanha diz quanto gastamos; o de
**anúncio** diria qual criativo converte, e o de **posicionamento** diria se story rende mais que
feed — para uma ferramenta que gera peça POR FORMATO (a Lídia), é a informação central.

---

## Defeito A — CHECK constraint recusa valor real da API (PROVADO)

`meta_sync_log`, últimas execuções de `insights`:

```
ad insights upsert: new row for relation "meta_insights_daily"
violates check constraint "meta_insights_daily_conversion_rate_ranking_check"
```

A constraint, lida do banco:

```sql
CHECK ((conversion_rate_ranking = ANY (ARRAY['ABOVE_AVERAGE','AVERAGE','BELOW_AVERAGE'])))
```

**A Graph API não devolve só esses três.** Ela devolve `ABOVE_AVERAGE`, `AVERAGE`,
`BELOW_AVERAGE_10`, `BELOW_AVERAGE_20`, `BELOW_AVERAGE_35` e `UNKNOWN`. No instante em que um
anúncio ganhou um `BELOW_AVERAGE_20` (ou `UNKNOWN`), o upsert passou a estourar.

**A linha do tempo fecha:** primeira falha de constraint em **09/06**; último dado de anúncio em
**07/06** (gravado em 08/06). O sync de 09/06, que buscava o dia 08/06, foi o primeiro a morrer.

**As três colunas de ranking têm a mesma constraint** (`quality_ranking`,
`engagement_rate_ranking`, `conversion_rate_ranking`) — e por isso **as três estão 100% NULL** no
banco: só sobreviveram as linhas em que a API não devolveu ranking nenhum. O recurso nunca
funcionou.

---

## Defeito B — o erro é parcial e o log não mostra isso (PROVADO, e é a causa de ninguém ter visto)

Em `meta-sync-insights/route.ts` a ordem é: **campanha → conjunto → anúncio**, cada um com seu
`upsert`, dentro do mesmo `try`.

Consequência: os upserts de campanha e conjunto **já commitaram** quando o de anúncio estoura. O
run é marcado `status='error'`, mas **dois terços do dado entraram**. Do lado de fora parece que o
sync está funcionando — os gráficos de campanha atualizam todo dia — enquanto um nível inteiro
congela.

**Oito semanas.** 82 execuções com `status='error'` e ninguém notou, porque o sintoma visível
(dashboard de campanha) continuou correto.

> É a mesma classe do incidente da migration 209/210 de hoje: **falha silenciosa em que o sinal
> visível continua verde.** O log dizia "error" desde 09/06 — faltava alguém olhar o log.

---

## Defeito C — o sync de posicionamento nunca funcionou (PROVADO)

Roda **semanalmente, aos domingos**, 2× por execução. Histórico completo:

```
15/06 2x error · 22/06 2x error · 29/06 1x error · 06/07 2x error
13/07 2x error · 20/07 2x error · 27/07 2x error · 03/08 2x error
```

**8 domingos, 15 execuções, 0 registros, 0 sucessos.** Erro registrado sempre:
`"OAuth token invalid"`.

**O que NÃO fecha, e por isso vira investigação e não correção direta:**

- `parseMetaError` só classifica como `MetaOAuthException` quando `code === 190` — que é de fato
  token morto. A classificação está **correta** e tem comentário explicando o incidente de
  06/07/2026 em que rate-limit era confundido com token morto.
- Mas o `insights` usa **o mesmo token, da mesma coluna** (`meta_ad_accounts.access_token`, com
  `.eq("status","active")` idêntico) e **funciona** — ele chega até o upsert, ou seja a chamada à
  API teve sucesso. Hoje mesmo: placement falhou às 06:00, insights chamou a API às 09:01.
- Existem **duas** contas de anúncio cadastradas (`act_324928230003186` e
  `act_10042267189149069`), as duas com `status='active'` e `updated_at` congelado em
  **06/07 06:00** — a data do incidente citado no comentário do código.

Hipótese mais provável: **uma das duas contas tem token morto**, e o placement estoura nela antes
de processar a outra, enquanto o insights morre antes por outro motivo (o defeito A) e nunca
chega a expor o mesmo problema. **Não afirmo sem sonda** — é a primeira tarefa desta story.

---

## Defeito D — corrigir para frente não recupera o passado

Os três níveis usam `date_preset: "yesterday"`. Consertar a constraint faz o sync voltar a
funcionar **de amanhã em diante** e deixa **8 semanas de buraco** (08/06 → hoje) no nível de
anúncio.

A Graph API aceita `time_range` histórico. Sem um backfill explícito, a primeira análise de
criativo depois da correção ainda vai ter a mesma limitação que motivou esta story.

---

## Scope

### IN

- Constraint dos 3 rankings aceita o enum real da API, `UNKNOWN` incluído — ou é removida, com a
  normalização feita no código. Decisão do @data-engineer.
- **Isolar o erro por nível:** falha em um nível não pode impedir os outros, e o log tem de dizer
  **qual** nível falhou e quantas linhas cada um gravou.
- Sonda do token das 2 contas contra a Graph API, e correção do que ela revelar.
- **Backfill** do nível de anúncio de 08/06 até hoje, via `time_range`.
- Alerta que dispare quando um nível ficar sem dado novo por mais de 48h — o buraco atual duraria
  8 semanas de novo sem isso.

### OUT

- Extrair o texto da copy do `creative` jsonb para análise (é o 3º dado que falta para decidir
  arte, mas é story própria).
- Mudar a frequência do placement (semanal está bom, se funcionar).
- Reprocessar `meta_ads_intelligence` — depende deste dado, entra depois.

---

## Acceptance Criteria

- [ ] **AC1 — a constraint aceita o que a API manda:** inserir `BELOW_AVERAGE_10`,
      `BELOW_AVERAGE_20`, `BELOW_AVERAGE_35` e `UNKNOWN` nas 3 colunas não estoura. Teste com os
      valores literais, não com um genérico.
- [ ] **AC2 — nível de anúncio volta a entrar:** depois de 1 execução, `max(date)` de
      `level='ad'` é igual ao de `level='campaign'`.
- [ ] **AC3 — falha isolada por nível:** um erro forçado no nível de anúncio **não** impede
      campanha e conjunto de gravar, e o log registra por nível
      (`{campaign: 15, adset: 35, ad: 0, erro: "..."}`) em vez de um `records_synced` único.
- [ ] **AC4 — os rankings deixam de ser 100% NULL:** ao menos um anúncio com volume tem
      `quality_ranking` preenchido. Se a API devolver `UNKNOWN` para todos, isso é registrado como
      resposta legítima — mas não pode ser NULL por erro de gravação.
- [ ] **AC5 — placement traz linha:** ao menos 1 registro em `meta_insights_placement_daily`, com
      `publisher_platform` e `platform_position` preenchidos. **Se a sonda provar que é token de
      uma conta, a correção é do token** — e a AC vira "o sync roda sem erro e registra
      `skipped_no_token` de forma explícita para a conta afetada".
- [ ] **AC6 — buraco fechado:** `level='ad'` tem dado contínuo de 17/05 até hoje, sem lacuna entre
      08/06 e a data da correção.
- [ ] **AC7 — não repete em silêncio:** alerta quando qualquer nível ficar >48h sem dado novo.
      Verificável forçando o estado.

---

## Dev Notes

- Confirmar o enum atual na doc da Graph API v21.0 antes de fixar a lista na constraint — o valor
  `UNKNOWN` aparece quando o anúncio não tem impressões suficientes (o limiar costuma ser 500), o
  que é o caso comum nesta conta, de volume baixo.
- Uma constraint com lista fechada de valor de API externa é a armadilha que causou isto. Se a
  decisão for manter a constraint, ela precisa de um comentário dizendo que o enum é de terceiro e
  pode crescer sem aviso. A alternativa — sem constraint, normalizando no código — falha aberta,
  que para dado de observabilidade é o comportamento certo.
- O backfill vai consumir chamadas de API; `rate-limiter` de `packages/shared/src/meta` já existe e
  deve ser usado.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada. Defeitos A, B, C e D diagnosticados a partir de `meta_sync_log` e da definição real das constraints — não por leitura de código. A linha do tempo (1ª falha 09/06 × último dado 07/06) confirma a causa do A. O C fica como investigação, não correção: a classificação de erro está correta e o mesmo token funciona no insights, então falta uma sonda. | @sm (River) |
