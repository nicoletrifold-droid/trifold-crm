# Parecer @po — Story 900-24 (Roteamento de webhook por identificador, com dual-run)

- **Validador:** @po (Pax) · **Data:** 2026-08-29
- **Story:** `docs/stories/900-24-roteamento-de-webhook-por-identificador.story.md` (Draft, 980 linhas, 10 AC / 10 Tasks)
- **Plano:** ONDA 2, Passo 4 · **Fatias anteriores:** `900-21b` (PR #526, aberto), `900-23` (local, sem PR)

## Veredicto: **NO-GO** — 5 correções obrigatórias (score 6,5/10)

O draft é o mais forte das quatro fatias: o defeito agudo está medido no arquivo e na linha, a
regra `.limit(2)` + comprimento está escrita como código, o `ARCH-001` é enfrentado e não
empurrado, e o `both` foi desenhado com a semântica certa ("o legado sempre decide"). O que
reprova é o mesmo padrão das três fatias anteriores: **régua sem carrasco**. Quatro das réguas
desta story, quando rodadas, ou não rodam, ou nascem verdes, ou medem o caminho errado. Todas as
afirmações abaixo foram **executadas**, não inferidas.

---

## 0. O achado central da mission: **PROCEDE — e é pior do que o enunciado**

`packages/web/src/lib/tenancy/admin-invite.test.ts:113`:
```ts
maybeSingle: async () => {
  const linhas = selecionadas()
  return { data: linhas[0] ?? null, error: null }
},
```

**Comportamento real, lido no pacote instalado** (`@supabase/postgrest-js@2.101.1`,
`dist/index.cjs:129-140`) e confirmado contra o PostgREST do `trifold-crm-dev` (HTTP **406**,
`PGRST116`, `"The result contains 6 rows"`):
```
data.length > 1  ⇒  { data: null, error: {code:"PGRST116", …}, status: 406 }
```

Rodei a reprodução (vitest, código legado literal de `webhook/whatsapp/route.ts:394-398` contra os
dois fakes, 5 testes, 5 passaram):

| fake | 2 configs `active` | o bug agudo reproduz? |
|---|---|---|
| **molde** (`admin-invite.test.ts`) | legado **processa `org-A`** | **não** |
| **fiel** (postgrest-js 2.101.1) | legado descarta em silêncio | sim |

A asserção que a story precisaria escrever para a AC3/AC9 — `expect(r.processou).toBe(false)` —
é, sob o molde, **insatisfazível**: fica vermelha por causa do instrumento, não do código. O @sm
está certo.

**Três agravantes que a AC10 ainda não cobre:**

1. **A mentira é dupla.** O molde erra `data` (devolve `linhas[0]`) **e** erra `error` (devolve
   `null` onde o real devolve `PGRST116`/406). A regra 3 da AC10 só corrige `data`. Qualquer
   correção futura que **leia o `error`** — que é a causa raiz nomeada no Context ("o `error` é
   descartado pela desestruturação") — continuaria intestável.
2. **`.single()` é igualmente cego, e nos dois sentidos.** O molde (`:108`) devolve
   `{data: null, error: null}` com **zero** linhas; o real devolve `PGRST116` (`"contains 0
   rows"`). E `.single()` é o terminal em **2 dos 4 pontos de defeito** desta story
   (`lib/meta/process-lead.ts:681` e `webhooks/landing-page/route.ts:490`). A regra 3 nomeia só
   `.maybeSingle()`.
3. **O molde já se propagou uma vez.** Varredura em `packages/web/src` + `scripts`:
   `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.test.ts:80` carrega a
   linha **verbatim**. Ali é **latente**, não vivo — a query coberta (`route.ts:35`) filtra por
   `.eq("id", orgId)` (PK), e 2 linhas é impossível. Mas é a cópia nº 2. A 900-24 seria a nº 3, e
   a primeira em que a cegueira pousa exatamente em cima do defeito.
   (`platform/orgs/route.test.ts:69-70` usa stub de valor fixo — classe diferente, mais fraca, mas
   não alega filtrar. Os demais testes de `lib/tenancy/` não expõem `single`/`maybeSingle`.)

---

## Correções obrigatórias

### B1 — AC5: o argumento de "inalcançável" foi medido no resolver que produção **não consulta** 🔴

A story justifica o 5xx→200 assim: *"com exatamente 1 org ativa, `resolveSoleOrg` **sempre
resolve** — o branch 'não resolveu' é estruturalmente inalcançável"*.

Mas produção roda **`both`** (Task 9.2). E no esqueleto do próprio Dev Notes, em `both`,
`resolvido` só é preenchido `if (legado)`. Quem decide em produção é
**`legacyResolveOrgId`** = a query atual, `whatsapp_config` com `status='active'` — **não**
`resolveSoleOrg`. E `whatsapp_config.status` é **estado operacional, não estrutura**: não tem
`CHECK` de domínio (é o `REL-001` que esta mesma story deixa aberto), e já houve incidente de
credencial de WhatsApp invalidada em produção (10/08/2026).

Consequência medida no código: com `status` fora de `'active'`, hoje o handler devolve **500** e
o proxy `api/lead.js` trata como erro; depois desta story devolve **200 + log**, e o lead do
formulário pago some em silêncio. É literalmente o incidente que o comentário de
`webhooks/landing-page/route.ts:109-118` diz ter sido corrigido ("*leads eram perdidos
silenciosamente… só retornamos 200 se o lead foi realmente processado — e um 5xx claro se
falhar*"). Os outros dois `ok:false` (`:317` criação do lead, `:380` catch) continuam 5xx, então
a mudança é mesmo estreita — mas é estreita **no ponto errado**.

**Segundo problema no mesmo AC, não nomeado:** a AC5 não muda só o branch "zero orgs" — muda o
**predicado**. Legado pergunta `whatsapp_config.status='active'`; `resolveSoleOrg` pergunta
`organizations.is_active=true`. São populações diferentes (medido no `trifold-crm-dev`: 1 org
`is_active=true` **e** `whatsapp_config` `status='inactive'` — as duas respostas já divergem lá
hoje). Em produção elas coincidem por acidente de configuração, não por construção.

**Correção:** escolher uma das duas e escrever na AC:
- (i) a regra "não resolveu ⇒ 200 + log" vale **só no modo `identifier`**; em `legacy`/`both`, o
  legado `null` continua devolvendo 5xx (preserva byte a byte o contrato de hoje, que é a
  restrição do dono do produto); **ou**
- (ii) manter o 200 uniforme, mas então (a) obter aprovação explícita do dono do produto para
  perder o sinal de re-tentativa do proxy, e (b) provar por teste que o log substitui o alarme.

E, nas duas: **nomear a troca de predicado** e acrescentar à AC9 a consulta que hoje falta —
`SELECT (SELECT org_id FROM whatsapp_config WHERE status='active') = (SELECT id FROM
organizations WHERE is_active)` — porque é ela, não a contagem de orgs, que sustenta o "byte a
byte idêntico".

### B2 — AC9/AC10: a promessa central da story não tem carrasco nenhum 🔴

A AC9 diz, corretamente, que a prova não é "os dois caminhos concordam" e sim **"o caminho novo
nunca decide"**. Essa é *a* frase da story — é a restrição do dono do produto (a Trifold não muda)
traduzida em invariante de código.

Ela não é testada. Li as 7 mutações e os 5 testes de propriedade da AC10: **nenhum** fica vermelho
se, no branch `both`, alguém trocar
```ts
resolvido = { orgId: legado.orgId, via: "legacy" }   //  →  novo.orgId
```
O log de divergência continua disparando, `decidirModoRoteamento` continua devolvendo `"both"`,
os 3 resolvers continuam corretos. Verde do começo ao fim. A única defesa contra a story inverter
o comportamento da Trifold é a leitura do diff.

**Correção:** mutação **#8** na tabela, e o teste que a reprova — **por receptor**, não genérico:
plantar legado ⇒ `org-A` e identifier ⇒ `org-B` (divergência forçada), rodar em `both`, e afirmar
as **duas** coisas: (1) o `orgId` que chega ao processamento é `org-A`, e (2)
`logOrgResolved` foi chamado com `via:"legacy"` e `divergiu:true`. A asserção (1) é a que importa;
a (2) sozinha é a fábrica, não o objeto.

### B3 — AC7: as 5 células de vivacidade não rodam 🔴

`UPDATE … WHERE provider = 'whatsapp' LIMIT 1` é sintaxe do MySQL. Rodado contra
`trifold-crm-dev`:
```
ERROR: 42601: syntax error at or near "LIMIT"
LINE 3:   WHERE provider = 'whatsapp' LIMIT 1;
```
As 5 células devolvem **42601**, nunca `23514` nem "sucesso". A régua não mede — ela quebra antes
de medir, e quebra igual nos casos que deviam falhar e nos que deviam passar.

**Correção:** `WHERE id = (SELECT id FROM org_integrations WHERE provider='whatsapp' LIMIT 1)`.
O `BEGIN … ROLLBACK` está certo e deve continuar (a tabela tem trigger `set_updated_at`).

### B4 — AC7: o predicado não fecha a classe que a story afirma fechar 🔴

Rodei o predicado proposto contra 16 casos no Postgres do `trifold-crm-dev` (expressão pura,
read-only). **Os 4 casos do gate saem exatamente como a story promete** — 1 ✅ bloqueia,
2 ✅ passa a bloquear, 3 ✅ passa a bloquear, 4 ✅ continua liberado por desenho. Até aqui, ganho
real.

Mas:

| grafia | `phone[_]?number[_]?id` (AC7) |
|---|---|
| `PHONE_NUMBER_ID` | bloqueia |
| `phonenumberid` | bloqueia |
| **`Phone-Number-Id`** | **passa** |
| `phone.number.id` | passa |
| `phone number id` | passa |
| `phone__number__id` | passa |

O Dev Notes diz, com todas as letras: *"nenhuma story futura precisa voltar aqui para adicionar
`PHONE_NUMBER_ID` ou **`Phone-Number-Id`** à lista, porque não há lista."* Medido: `Phone-Number-Id`
**passa**. E o `COMMENT ON CONSTRAINT` afirma "*ignora separador*" — ignora **um** separador, o
`_`. O `docs/backlog.md` lista `phone-number-id` entre as "grafias plausíveis" da opção (b) que
ele mesmo rejeita; a story fecha um superconjunto dos 2 exemplos do gate, mas **não** a classe.

Candidato medido, que fecha as 6 e não introduz falso positivo novo na minha amostra:
```sql
config::text !~* 'phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id'
```

**Falsos positivos — respondendo à pergunta da mission:** um `config` legítimo de **outro
provider** **não** é afetado. O `CHECK` é guardado por `provider <> 'whatsapp'` (medido: a mesma
chave em `provider='meta_ads'` passa). O risco de FP existe só **dentro de `whatsapp`**, e é real
porque o predicado roda sobre o **texto serializado inteiro** — casa **valores**, não só chaves.
Medidos como bloqueados: `{"observacao":"o phone_number_id fica em whatsapp_config"}`,
`{"webhook_url":"https://…/phone_number_id/123"}`, `{"label":"Telefone (phoneNumberId antigo)"}`.
Consequência baixa (o seed da 900-21b grava `{}` e não há escritor de aplicação até a `900-47`),
mas é uma **troca aceita**, não uma ausência de custo.

**Correção:** (a) trocar o padrão pelo candidato acima, **nos dois lugares** — o `CHECK` e a
query de pré-condição da Task 7.1; (b) reescrever o `COMMENT` para dizer o que o predicado faz
de verdade (casa a estrutura em qualquer separador não-alfanumérico de até 2 caracteres, em
qualquer nesting, **sobre chaves e valores**); (c) acrescentar às células de vivacidade os casos
`Phone-Number-Id` e um falso positivo nomeado, para a decisão ficar auditável.

### B5 — AC10: a regra 3 do fake está incompleta e a mutação #5 não reprova 🔴

Ver a seção 0 para o diagnóstico. Na AC10, isto vira:

1. **Regra 3 completa:** com 2+ linhas, o fake devolve `{ data: null, error: { code: "PGRST116",
   details: "Results contain N rows, …" }, status: 406 }` — **`data` e `error`**.
2. **Regra 3 cobre `.single()` também**, e nos dois sentidos: 0 linhas ⇒ `PGRST116` ("contains 0
   rows"), 2+ linhas ⇒ `PGRST116`. Não é preciosismo: `.single()` é o terminal de
   `process-lead.ts:681` e `landing-page:490`, dois dos quatro pontos que esta story conserta.
3. **Testes dedicados do fake** (não asserções de canto): um por comportamento
   (`maybeSingle`/2+, `single`/0, `single`/2+), afirmando `data` **e** `error.code`.
4. **Mutação #5 não reprova como está.** Rodei: com um mock que resolve no mesmo tick — que é o
   padrão do molde —, remover o `await` de `logOrgUnresolved` deixa o teste **verde**. Para a
   mutação ter carrasco, o mock precisa resolver num tick posterior (`await new
   Promise(r => setTimeout(r, 0))` dentro do fake) e a asserção precisa rodar **no retorno da
   rota**, não depois.
5. **Recomendação de forma:** extrair esse fake para
   `packages/web/src/lib/tenancy/__fixtures__/` (o diretório já existe) em vez de criar a terceira
   cópia divergente. É a única maneira de a correção não precisar ser reaplicada em `admin-invite`
   e em `resend-admin-invite` na mão.

---

## Correções recomendadas (não bloqueiam)

- **C1 — assimetria de `status` entre os resolvers.** `resolveOrgByWhatsAppPhone` filtra
  `status='active'` e a AC justifica ("*org desconectada… poderia sequestrar o roteamento*").
  `resolveOrgByMetaPage` **não** filtra `org_integrations.status`, e a mesma frase se aplicaria
  literalmente. Julgo que **omitir está certo** (o seed da `900-21b` nasce `disconnected` e não há
  UI para promover a `connected` até a `900-47` — exigir `connected` faria o modo `identifier`
  nunca resolver Meta Ads), mas a assimetria precisa estar **nomeada na AC4**, senão o gate a lê
  como esquecimento.
- **C2 — `WhatsAppConfigLinha.access_token: string` mente.** A coluna é nullable (medido), e o
  seed da `900-21b` cria linhas sem token. `string | null` + guarda explícita.
- **C3 — `DROP CONSTRAINT` sem `IF EXISTS`.** A `247` depende de a `246` ter sido aplicada. PR
  #526 **reconfirmado ABERTO** hoje (`state: OPEN`, `mergeStateStatus: CLEAN`,
  `mergeable: MERGEABLE`) — a dependência de deploy da Metadata está correta.
- **C4 — a justificativa da Task 9.1 é falsa hoje.** Ela diz "*com duas orgs o legado está
  quebrado por construção*". Medido no `trifold-crm-dev`: **1 org** (`Org de Teste — Epic 900`), e
  `whatsapp_config` com `status='inactive'` e `phone_number_id` NULL. As duas orgs só chegam na
  fatia seguinte (Passo 6). Pôr `identifier` lá agora faz **todo** webhook de WhatsApp cair em
  `WEBHOOK_ORG_UNRESOLVED` — não é regressão (o legado também não resolve lá), mas a razão escrita
  não é a razão real. Reescrever.
- **C5 — a query 2 da AC9 é fail-open.** `count(*) … divergiu = true` = 0 é também o resultado de
  "o contador não escreveu nada". E `logOrgResolved` usa `logEvent`, que é fire-and-forget e tem
  **perda medida em produção** documentada no próprio `lib/logger.ts:46-54` (Story 87-6).
  Correção barata: tornar a query 4 (`> 0` linhas) **pré-condição declarada** da query 2 — zero
  divergência só significa alguma coisa se o contador estiver vivo.
- **C6 — `Complexity: G` na story vs. `Est: M` no epic §855.** Reconciliar ou nomear a subida.
- **C7 — erro factual no Context.** "`.single()` … **lançaria** em vez de retornar `null`" é
  falso: o supabase-js devolve `{data:null, error:PGRST116}` e só lança com `.throwOnError()`.
  Não muda nenhuma AC, mas é a classe de afirmação sobre API de terceiro que precisa ser rodada.

---

## Julgamentos pedidos pela mission

**AUTO-DECISÃO 1 — `webhook_logs.source: 'other'` para o Telegram: ACEITA.** Premissas conferidas
no banco: o `CHECK` é `{meta_ads, whatsapp, google_forms, landing_page, imoveis_sync, other}` —
não tem `'telegram'`, tem `'other'`; `org_id` é nullable; e o arquivo do Telegram de fato nunca
escreve em `webhook_logs` hoje. Migration só para um rótulo seria desproporcional, e o canal é
staging. **Condição:** a AC10 tem que afirmar que `metadata.receptor === "telegram"` está presente
— `'other'` não pode ser o único discriminador. A story já diz isso em prosa; falta virar asserção.

**AUTO-DECISÃO 2 — `landing-page` 5xx → 200: REJEITADA como está.** É B1. A mudança é real, o
argumento de inalcançabilidade foi medido no resolver errado, e o caminho alcançável em produção
é exatamente o que o comentário do arquivo diz existir para não perder lead pago em silêncio.

**Dependência de `900-23`: a story está certa, com uma ressalva.** Medido nos commits `ce07e09b` e
`e3a6f1fc`: nenhum toca `app/api/webhook*`, `app/api/telegram` ou `lib/meta`. Sem import cruzado,
sem migration na branch da `900-23`, `246` continua sendo o teto em **todas** as refs após
`git fetch --prune` — `247` está livre. Implementação em paralelo é segura. **A ressalva:** os
dois lados editam `docs/audits/admin-client-allowlist.json` (a `900-23` já mexeu; a Task 2.2 da
`900-24` vai mexer). É conflito **textual**, não semântico — o PR da `900-24` precisa nascer
rebasado no da `900-23`, ou resolver o JSON na mão. A decisão da AC2 de **não** hardcodear o total
e afirmar `PERMITIDOS.has(...)` já protege contra o modo pior desse conflito; mantê-la.
Para o @devops: a ordem `#525 → #526 → crons` **não muda**; a `900-24` entra depois da `900-23`
por causa do JSON e depois da `246` por causa da migration.

**A restrição central ("a Trifold não muda, e não perde dado") — a story diz onde cada perna é
provada?** Parcialmente, e é o que sustenta o NO-GO. O banco de teste não tem a org da Trifold
(confirmado: só `Org de Teste — Epic 900`), então nenhuma perna pode ser provada lá por
observação — precisa ser provada por **invariante**.
- **"Não muda de comportamento":** a story aponta a AC9, que é **observação 24h depois do
  deploy** — detecção, não prova. A prova pré-deploy seria "o novo nunca decide em `both`", e ela
  não tem teste (B2). **Endereço declarado, carrasco ausente.**
- **"Não perde dado":** nenhuma AC afirma "nenhum lead/mensagem deixa de ser processado em modo
  `both`", e a AC5, como escrita, **introduz** um caminho de perda (B1). **Endereço ausente.**

Com B1 e B2 corrigidos, as duas pernas passam a ter endereço executável e o GO fica direto.

---

## O que está certo e deve ser preservado na revisão

- A regra `.limit(2)` + comprimento, com `"ambigua"` **nomeado, contado (`quantidadeEncontrada`) e
  logado** — separado de `nenhuma_correspondencia`. É a correção certa, e o estado `ambigua` é
  audível em vez de colapsado em "não achei".
- A semântica de `both` ("computa os dois, **usa o legado**, loga divergência") e o default
  `"both"` para env ausente/inválida — seguro nos dois eixos, e a justificativa está escrita.
- `logOrgUnresolved` **awaited** via `logEventOnce` por ser a última escrita antes do `return`
  (Story 87-6), contra `logOrgResolved` fire-and-forget por volume. A distinção está certa e
  justificada linha a linha.
- A disciplina de PII: `identificador` carrega só o identificador **da própria org** emissora,
  nunca dado do lead — e a AC10 pede teste de **shape**, não de presença.
- A remedição de migration contra todas as refs, com o comando colado. Reconferida hoje: bate.
- `REL-001` mantido fora **com o critério nomeado** (não tem `Dona:` no backlog; `ARCH-001` tem).
  Escopo defendido por regra, não por conveniência.
- Ter reconhecido, sozinho, que o molde de teste indicado reproduz o defeito — e ter escrito a
  regra 3 da AC10. A regra está incompleta (B5), mas o achado é dele.

---

## Encaminhamento

`@sm` revisa **B1–B5** (as C1–C7 podem entrar no mesmo passe) e devolve para `*validate-story-draft`.
Nenhuma delas exige repensar o desenho — B3 e B4 são SQL, B5 é o fake, B2 é uma mutação e um teste
por receptor, e B1 é uma decisão de produto de uma linha. O desenho da story está de pé.

— Pax


---
---

# Revalidação — rodada 2 (2026-08-29)

## Veredicto: **GO** (9/10) — segue para `@dev`, com **1 condição** e **1 observação**

O @sm aplicou os 5 bloqueantes e os 7 recomendados sem reabrir o desenho. **Revalidei rodando**, não
lendo: 7 células SQL executadas contra o `trifold-crm-dev`, 18 casos de regex avaliados no Postgres,
20 testes vitest (fake novo + esqueleto dual-run dos 4 receptores + mutação #8 + mutação #5).
Tudo o que ele alega, procede.

### 1. B1 — a condicional por modo: **CONFIRMADA**

Fiei o esqueleto do Dev Notes com a exceção nomeada da AC5 e rodei os 3 modos × 4 receptores:

| cenário | medido |
|---|---|
| `landing-page`, `legacy`, legado `null` | **500** — igual a hoje |
| `landing-page`, `both`, legado `null` | **500** — igual a hoje |
| `landing-page`, `legacy`/`both`, legado ok | 200, processa o org do **legado** |
| `landing-page`, `identifier`, não resolveu | **200 + log** — a única mudança |
| os outros 3 receptores, não resolvido, nos **3** modos | 200 (já é o comportamento de hoje) |

Não existe caminho, em `legacy`/`both`, por onde um lead do formulário pago deixe de ser
processado e a resposta vire 200. A perna "não perde dado" da restrição do dono do produto passou
de **ausente** para **fechada por construção**. A escolha da opção (i) foi a certa: preserva o
contrato hoje vigente sem depender de aprovação síncrona, e empurra a troca de predicado
(`whatsapp_config.status` → `organizations.is_active`) para o cutover da Onda 3, onde ela é uma
decisão consciente e não um efeito colateral. A AC5 ainda nomeia explicitamente que
`logOrgUnresolved` **não** é chamado no branch legado de `legacy`/`both` — correto, e é o que
mantém o "byte a byte" literal.

### 2. B2 — a mutação #8 acende nos 4 receptores: **SIM, nos 4**

Apliquei a mutação (`resolvido = { orgId: novo.orgId, via: "identifier" }` no branch `both`) e
medi as duas asserções que a AC10 especifica, receptor a receptor:

| receptor | sem mutação | com mutação #8 | asserção (1) reprova? |
|---|---|---|---|
| `whatsapp` | processa `org-A` | processa `org-B` | **sim** |
| `meta_ads` | processa `org-A` | processa `org-B` | **sim** |
| `landing_page` | processa `org-A` | processa `org-B` | **sim** |
| `telegram` | processa `org-A` | processa `org-B` | **sim** |

E medi também o que a story afirma sobre a asserção (2): sob a mutação, `logOrgResolved` continua
sendo chamado com `via:"legacy"` e `divergiu:true` — ou seja, **a asserção (2) permanece VERDE**.
A story está certa ao escrever que "*a asserção (1) é a que importa, a (2) sozinha é a fábrica, não
o objeto*". Se o @dev implementar só a (2), o carrasco não existe. **Isso é vinculante na
implementação, não opcional.**

"O caminho novo nunca decide em `both`" deixou de ser afirmação e virou invariante com carrasco
pré-deploy. Era o furo central da rodada 1.

### 3. B3 + B4 — migration `247`: **as 7 células rodam, e o regex fecha a classe**

**B3 — 7 células executadas literalmente** contra o `trifold-crm-dev` (cada uma em sua própria
transação: `BEGIN` → `DROP/ADD CONSTRAINT` novo → `UPDATE` → `ROLLBACK`; conferido depois que o
`CHECK` voltou à definição da `246`):

| # | célula | esperado | **medido** |
|---|---|---|---|
| 1 | `phoneNumberId` | `23514` | **`23514`** |
| 2 | nested `phone_number_id` | `23514` | **`23514`** |
| 3 | **nova** `Phone-Number-Id` | `23514` | **`23514`** |
| 4 | controle `phone_number_id` | `23514` | **`23514`** |
| 5 | controle `meta_ads` passa | sucesso | **sucesso** |
| 6 | controle `phone_number` | sucesso | **sucesso** |
| 7 | **nova** FP `observacao` | `23514` | **`23514`** |

7/7. A v1 dava `42601` nas 7 — a subquery por `id` resolveu.

**B4 — 18 casos avaliados no Postgres.** Os 4 do gate saem certos; as 4 grafias que escapavam
(`Phone-Number-Id`, `phone.number.id`, `phone number id`, `phone__number__id`) **passaram todas a
ser bloqueadas**; os 3 falsos positivos que medi na rodada 1 continuam bloqueados — **e é
exatamente isso que o `COMMENT` agora declara**. Nenhum config legítimo da minha amostra foi
atingido: `{}` (seed), `waba_id`+`display_name`, `page_id`, `dataset_id`, `number_id` isolado —
todos passam.

**O `COMMENT` é honesto.** Diz o que o predicado faz (estrutura, até 2 não-alfanuméricos, qualquer
nesting, **chaves E valores**), nomeia o guard `provider <> 'whatsapp'` que protege os demais
providers, **declara o falso positivo como troca aceita com o custo medido** ("risco baixo hoje
porque não há escritor de aplicação até a `900-47`") e mantém os dois limites fora do escopo
(`phone_number` sem `id`, ofuscação deliberada). É a diferença entre "fecha a classe" como slogan e
como afirmação auditável — e agora tem célula de vivacidade para o FP, que é o que torna a troca
revisável em vez de descoberta por acidente.

### 4. B5 — o fake novo reproduz o bug: **SIM, e cobre `.single()`**

Implementei `resultadoSingular()` literalmente como a AC10 escreve e rodei o código legado literal
contra ele:

| medição | resultado |
|---|---|
| 2 configs `active` ⇒ `maybeSingle` legado (`webhook/whatsapp:394-398`) | **descarta** — não processa `org-A` |
| `maybeSingle`/2+ | `data: null`, `error.code: "PGRST116"`, `status: 406` |
| `single`/2+ (terminal de `process-lead:681`) | `data: null`, `PGRST116`, `details` contém `"2 rows"` |
| `single`/0 (terminal de `landing-page:490`) | `data: null`, `PGRST116`, `details` contém `"0 rows"` |
| mutação #5 com mock de tick diferido | **vermelha** (com mock síncrono seria verde) |

O bug agudo passou de **insatisfazível** a **reproduzível**. A regra 3 cobre os dois métodos e
`data` **e** `error.code`. A ressalva que o @sm escreveu — que o fake não modela a diferença de 0
linhas entre `.maybeSingle()` e `.single()` no client real, porque nenhum dos 3 resolvers usa esses
terminais — está **correta e é honesta**: o fake existe para reproduzir o legado, e o escopo está
declarado no próprio código em vez de descoberto depois.

### 5. O fake em `__fixtures__/` é órfão? **Não.**

Task 10.1 cria `packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` e **Task 10.2
importa dele** (`"webhook-org.test.ts com o fake importado de __fixtures__/"`), com Task 10.3
testando o próprio fake. O diretório já existe (hoje só com `orgs-page-pre-900-22b.txt`). Cadeia
fechada: criado, importado, testado.

### 6. A propagação do molde ruim: **nomeada, mas não tratada** → é a condição do GO

A story documenta o achado muito bem no Context (a tabela dos dois fakes, "o molde mente duas
vezes", "já se propagou"), e diz **"Tratado na AC10 (regra 3 do fake, reescrita)"**. Mas isso trata
o fake **novo**. As duas cópias já mergeadas continuam vivas, sem AC, sem Task e sem dona:

- `packages/web/src/lib/tenancy/admin-invite.test.ts:108,113` — o molde original;
- `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.test.ts:80` — a cópia nº 2.

As duas são **latentes** hoje (a segunda filtra por PK; a primeira sustenta suas asserções em
`order`+`limit`), então **não bloqueio**: corrigir teste já mergeado de outra story (`900-22b`) é
escopo que não é desta fatia. Mas deixar o molde ruim **não registrado** é precisamente o mecanismo
que produz a cópia nº 4 — e esta story estabeleceu, ela mesma, o critério de que dívida sem
`Dona:` no `docs/backlog.md` é dívida órfã (foi assim que ela justificou incluir `ARCH-001` e
excluir `REL-001`). O mesmo critério tem que valer aqui.

**CONDIÇÃO DE GO (@dev, dentro desta story, ~1 parágrafo):** abrir item em `docs/backlog.md` —
sugiro `[TEST-004] 🟡 O molde de fake do Supabase mente em .maybeSingle()/.single()` — com
**`Dona:` explícita**, as duas localizações acima, a medição (postgrest-js 2.101.1
`dist/index.cjs:129-140`, `PGRST116`/406), a razão de serem latentes hoje, e o encaminhamento
(migrar as duas para `__fixtures__/fake-supabase-postgrest.ts`). Não é código; é o registro que
impede a terceira cópia.

### 7. As 7 recomendadas: **aplicadas, conferidas uma a uma**

C1 (assimetria de `status` nomeada na AC4, decisão de omitir mantida — correta: exigir `connected`
faria o modo `identifier` nunca resolver Meta Ads antes da `900-47`) · C2 (`access_token:
string | null` + guarda) · C3 (`DROP CONSTRAINT IF EXISTS`, com a dependência de ordem nomeada no
comentário) · C4 (Task 9.1 com a razão real — 1 org no `trifold-crm-dev`, `WEBHOOK_ORG_UNRESOLVED`
esperado lá, não regressão) · C5 (query 3 é pré-condição declarada da 4 — a "zero divergência"
deixou de ser fail-open) · C6 (`Complexity: G` vs. `Est: M` do epic, divergência nomeada) ·
C7 (o "`.single()` lançaria" virou "devolve `{data:null, error}`, só lança com `.throwOnError()`").

### Observação (não bloqueia, para o `@qa` no gate)

A AC9 continua com **6 consultas pós-deploy**, e a ordem importa (3 antes de 4). O Dev Agent Record
tem que trazer o **resultado real colado**, não "conferido" — foi a exigência D2 do gate da
`900-21b` e vale igual aqui. Em especial a query 2 (equivalência de predicado): é ela, não a
contagem de orgs, que sustenta o "byte a byte" em produção.

---

## Numeração e ordem de merge — reconferidas hoje

- `git fetch --prune origin` → teto de migration em **todas** as refs (locais + remotas): **`246`**.
  **`247` livre.** A branch da `900-23` não introduz migration.
- `#525` **OPEN/CLEAN** · `#526` **OPEN/CLEAN** (reconfirmados agora).

**Ordem obrigatória para o `@devops`:**

```
#525 (900-3c)  →  #526 (900-21b, migration 246)  →  900-23 (crons)  →  900-24 (esta, migration 247)
```

Dois motivos, distintos, para a `900-24` ser a última:

1. **Schema:** a `247` faz `ALTER TABLE org_integrations` — a tabela nasce na `246` (`#526`).
   O `IF EXISTS` da C3 evita quebrar num `DROP`, mas **não** dispensa a ordem.
2. **Conflito textual em `docs/audits/admin-client-allowlist.json`** — a `900-23` já editou o
   arquivo (commits `ce07e09b`, `e3a6f1fc`); a Task 2.2 da `900-24` acrescenta
   `src/lib/tenancy/webhook-org.ts` à seção `legitimos`. É conflito de **texto**, não de semântica:
   o PR da `900-24` deve nascer rebasado no da `900-23`. A decisão da AC2 de **não** hardcodear o
   total e afirmar `PERMITIDOS.has("src/lib/tenancy/webhook-org.ts") === true` protege contra o
   modo pior desse conflito (uma contagem que fica errada em silêncio) — **manter**.

Fora isso, as duas stories são independentes: nenhum arquivo de aplicação em comum, nenhum import
cruzado. Implementação em paralelo continua segura.

---

## Encaminhamento

**GO.** Segue para `@dev` (`*develop`), com a condição do item 6 (entrada de backlog com `Dona:`
para o molde de fake) e o alerta vinculante do item 2 (a asserção (1) da mutação #8 é obrigatória
nos 4 receptores; a (2) sozinha não é carrasco). Quality gate com `@architect` (Aria), tools
`[code_review, migration_review, security_review]`, como a Metadata já define.

— Pax
