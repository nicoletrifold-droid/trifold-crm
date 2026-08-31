# Runbook — o corte para `WEBHOOK_ORG_ROUTING=identifier` e a ordem obrigatória do onboarding

**Escopo:** Story 900-55 (Epic 900, Onda 3, adiantada). **Executor:** @devops (Gage).
**Pré-requisito de código:** AC1 desta story mergeada (motivo `legado_ambiguo_novo_resolveu`).
**Ambiente:** produção (`dsopqkqjkmhytudaaolv`) + os **dois** projetos Vercel que a servem.

---

## 0. Contexto em 8 linhas

Produção roda hoje em modo `both`, e em `both` **quem decide o roteamento é o caminho legado**.
O legado do WhatsApp busca `whatsapp_config` com `.eq("status","active").maybeSingle()` — **sem
filtro de telefone**. No minuto em que existir uma **segunda** linha `whatsapp_config` ativa, o
PostgREST devolve `PGRST116`/406, o `error` morre na desestruturação, `legado` vem `null`, e o
ramo `else` do modo `both` **não cai** para o resolver novo: a mensagem é descartada com
`200 {status:"ok"}` — **das duas empresas ao mesmo tempo**.

Os índices únicos da migration `246` **não protegem**: são por telefone e por org, não globais.
Duas orgs com uma linha ativa cada é exatamente o estado que eles permitem, e devem permitir.

O conserto (`resolveOrgByWhatsAppPhone`, Story 900-24) **já está mergeado e não está ligado**.
Este runbook liga.

---

## 1. A ordem obrigatória — AC7

> **Este corte é o PASSO 1 do onboarding de qualquer empresa nova.** Nenhuma credencial de
> cliente — nenhuma linha `whatsapp_config`, por painel, RPC ou `UPDATE` com service-role — pode
> ir para `status='active'` em produção antes de `WEBHOOK_ORG_ROUTING=identifier` estar valendo
> nos **dois** projetos Vercel e **provado pela consulta da seção 5**.

**Isto não é uma trava, e chamar de trava seria repetir o erro que a AC1 conserta.** O banco não
enxerga a variável da Vercel; nenhuma constraint pode impor uma ordem entre um estado da Vercel e
um estado do Postgres. O que existe é:

1. esta sequência escrita, e
2. um **registro consultável** atrás dela — `WEBHOOK_ORG_UNRESOLVED` com motivo
   `legado_ambiguo_novo_resolveu`, nível `error`, gravado **exatamente** no minuto em que a ordem
   for invertida.

### 1.1 Este registro NÃO é um alarme entregue — e ninguém é notificado

> **Versão anterior deste runbook chamava o item 2 de "o alarme atrás dela". Estava errado, e a
> correção é a concern QA-900-55-1 do gate.** Fica registrada em vez de apagada, porque a diferença
> entre "escrito" e "entregue" é exatamente a classe de defeito que a AC1 conserta um nível abaixo.

Medido em 2026-08-31, no código e contra o banco de produção. **Três elos, e nenhum entrega:**

| elo | o que existe | por que não entrega |
|---|---|---|
| leitor de `level='error'` | `api/cron/nicole-health/route.ts` é o **único** no repositório | classifica a `message` por `classificarErroIA()` e faz `if (!tipo) continue`. Nenhuma das **8** assinaturas de `lib/alerts/erro-ia.ts` (`credit balance is too low`, `purchase credits`, `insufficient_quota`, `authentication_error`, `invalid x-api-key`, `permission_error`, `rate_limit_error`, `overloaded_error`) casa com `"whatsapp: org não resolvida (legado_ambiguo_novo_resolveu)"` ⇒ `null` ⇒ descartado antes de qualquer decisão de canal |
| leitor por `event_type` | nenhum | ninguém seleciona `WEBHOOK_ORG_UNRESOLVED` |
| painel `/dashboard/sistema` | existe, tem filtro de nível, exige `sistema.auditoria_ver` | **também não vê.** `api/system-events` filtra `.eq("org_id", user.orgId)` e `get_system_events_summary` (o card de saúde) tem `WHERE org_id = p_org_id`. `logOrgUnresolved` grava com **`org_id = null`** — não há org a atribuir, é justamente o que falhou —, e `= <uuid>` nunca casa `NULL` |

O último elo é o que mais engana: **abrir o painel e filtrar por `error` não mostra este evento.**
Não é opinião — em produção, nos últimos 30 dias, **22 dos 35 eventos `level='error'` têm
`org_id` nulo** e são invisíveis no painel pelo mesmo motivo.

**O que o `error` compra, então, na prática:**
- `console.error` (em vez de `console.warn`) no log de runtime da Vercel — `lib/logger.ts`; e
- a linha em `system_events`, alcançável por consulta direta.

Não há log drain configurado, não há e-mail, não há WhatsApp de admin neste caminho.

### 1.2 O que o operador tem de FAZER para ver — porque não vem até ele

Sem isto, esta seção promete uma vigilância que ninguém exerce. **Estas conferências são passos do
onboarding**, não sugestões: rodar (a) **imediatamente depois** de ativar a segunda linha
`whatsapp_config`, e (b) uma vez por dia durante a janela de observação da seção 3.

**(a) Consulta ao banco** — agregado, sem conteúdo de conversa:

```sql
SELECT metadata->>'motivo'   AS motivo,
       metadata->>'receptor' AS receptor,
       level, count(*) AS n, min(created_at), max(created_at)
  FROM system_events
 WHERE event_type = 'WEBHOOK_ORG_UNRESOLVED'
   AND created_at > now() - interval '24 hours'
 GROUP BY 1,2,3 ORDER BY n DESC;
```

Baseline para comparar: em 2026-08-31 esta consulta devolve **0 linhas**, e
`WEBHOOK_ORG_UNRESOLVED` **nunca existiu** em produção (medido sem recorte de janela). Portanto
**qualquer linha aqui é novidade**, e `motivo = 'legado_ambiguo_novo_resolveu'` significa que a
ordem desta seção foi quebrada.

**(b) Log de runtime da Vercel, nos DOIS projetos da seção 5** — buscar por
`WEBHOOK_ORG_UNRESOLVED` ou `legado_ambiguo_novo_resolveu`. É o único canal que não depende de
ninguém lembrar de rodar SQL, e mesmo ele depende de alguém abrir o log.

Se (a) ou (b) acusar, a ordem foi quebrada: existe uma segunda `whatsapp_config` ativa e o corte
não está valendo. Ação: seção 6.

**Se um dia isto tiver de virar alerta de verdade**, o canal já existe
(`lib/alerts/admin-whatsapp.ts`, Story 87-19) e o conserto mora onde o evento **nasce**, não onde
ele é lido. Ficou **fora** do escopo desta story de propósito: ligar entrega é caminho novo com
carrasco próprio, e esta é uma P0 no meio de uma janela de corte.

---

## 2. Passo 1 — o `page_id` da Trifold, ANTES do corte (AC2)

**Por que vem antes:** `WEBHOOK_ORG_ROUTING` é **uma** variável para os 4 receptores, sem
granularidade por canal. Remedido em 2026-08-31T15:19Z: `whatsapp` concorda `divergiu=false` em
**115/115** (o `n ≥ 100` da seção 3 **já está batido**), mas `meta_ads` tem `divergiu=null` em
3/3 — o resolver novo **nunca resolveu**. Cortar antes de
consertar isso troca um defeito latente por uma queda imediata na entrada de leads pagos.

**Estado medido em produção (2026-08-31, agregados):** `org_integrations` tem 6 linhas, **0** com
`secret_ref`; a linha `meta_ads` está `status='disconnected'` e tem a **chave** `page_id` presente
com **valor nulo** (`length(coalesce(config->>'page_id','')) = 0`); `platform_audit_log` tem
**0** linhas — o painel da `900-51` nunca foi usado em produção.

### Autorização para gravar o token — procedência

**Autorização direta do dono do produto, obtida por pergunta explícita com alternativas, em
2026-08-31.** A pergunta apresentou **três** caminhos e nomeou o custo de cada um:

1. **gravar** o token real da Página junto do `page_id`, pelo caminho auditado normal;
2. **entender antes** — investigar o que exatamente será lido na Onda 7 e só então gravar,
   adiando o corte;
3. **não gravar** e deixar o `meta_ads` **fora** do corte.

Resposta do dono do produto: **"Confirmo, pode gravar"** — alternativa 1.

O que isso autoriza, dito sem eufemismo: **um token real de Página da Meta entra no Vault de
produção pela primeira vez**, e — por decisão deliberada da régua `nao-consumo.test.ts` — **nada
vai lê-lo até a Onda 7**. As razões técnicas que sustentam a escolha:
`_org_integration_write_secret` recusa segredo vazio (`P0017`) **de propósito**, e criar uma
variante da RPC que dispense o segredo reabriria a porta que a defesa anti-impersonação fechou.
O token da Página existe e será lido na Onda 7 — não é preenchimento, é dado correto adiantado.
**Não criar a variante.**

> **Correção de procedência (QA-900-55-2 do gate) — registrada, não apagada.** A versão anterior
> desta seção dizia *"Decisão do dono do produto (registrada 2026-08-31)"* e **a atribuição estava
> errada**: naquele momento a decisão tinha sido tomada pelo **coordenador**, sozinho, e repassada
> como detalhe técnico. O @qa mediu que a única ocorrência da frase em todo o `docs/` era a própria
> linha que agia sobre ela — uma decisão cuja única procedência é o documento que a executa é
> alegação, não decisão — e bloqueou a Task 2 por isso. Estava certo. A autorização acima é
> posterior a esse bloqueio e é a real. **O erro fica registrado porque o gate seguinte precisa
> poder auditar como o consentimento chegou**, e apagá-lo tornaria os dois estados
> indistinguíveis — que é exatamente o defeito que a AC1 conserta um nível abaixo.

### 2.1 São DUAS chamadas, não uma — a correção que esta story acrescenta

A `900-51` (AC10) passou a exigir `status='connected'` em `resolveOrgByMetaPage`:

```
.eq("provider","meta_ads").eq("config->>page_id", pageId).eq("status","connected").limit(2)
```

`_org_integration_write_secret` grava `config` + `secret_ref` e **nunca promove `status`** (é o
R4 dela, deliberado). Portanto **escrever o `page_id` sozinho NÃO faz o `meta_ads` resolver** — a
linha continuaria `disconnected` e a AC3 nunca fecharia. A promoção é uma segunda chamada, e ela
recusa promover sem um segredo não vazio gravado (`P0015`), o que é mais uma razão para o token
real ir junto na primeira.

```
1) org_integration_write_secret_as_platform(
     p_org_id       => <org da Trifold>,
     p_provider     => 'meta_ads',
     p_secret       => <token da Página Trifold>,
     p_config       => jsonb_build_object('page_id', <page_id>),
     p_actor_user_id=> <usuário responsável>
   )
2) org_integration_mark_connected_as_platform(
     p_org_id => <org da Trifold>, p_provider => 'meta_ads', p_actor_user_id => <usuário>
   )
```

**Nunca por `UPDATE` direto** — o ponto inteiro é a linha em `platform_audit_log`.

### 2.2 Conferências do passo 1

- **`page_id` numérico (guard `P0018`, `^[0-9]+$`):** confirmado por medição, não presumido — os
  113 `webhook_logs` de `source='meta_ads'` dos últimos 30 dias trazem `payload->'entry'->0->>'id'`
  numérico em 113/113, com **1 valor distinto** e 15 dígitos. É esse valor que tem de ser gravado:
  é literalmente o que o resolver vai comparar.
- **`platform_audit_log` passa de 0 para ≥ 2 linhas** (uma por chamada: `secret_write` e
  `marked_connected`). Se a primeira chamada devolver sucesso e a trilha continuar vazia, algo
  errado — a RPC audita ao fim do corpo.
- **`org_integrations` da `meta_ads`:** `status='connected'`, `secret_ref` não nulo,
  `config->>'page_id'` com 15 dígitos.

---

## 3. Passo 2 — janela de observação (AC3)

Consulta de corte (agregado, sem conteúdo de conversa):

```sql
SELECT metadata->>'receptor' AS receptor,
       metadata->>'via'      AS via,
       metadata->>'divergiu' AS divergiu,
       count(*) AS n, min(created_at), max(created_at)
  FROM system_events
 WHERE event_type = 'WEBHOOK_ORG_RESOLVED'
 GROUP BY 1,2,3 ORDER BY n DESC;
```

**Critério conjunto:**

| receptor | exigência | onde estava em 2026-08-31T15:19Z |
|---|---|---|
| `whatsapp` | `divergiu='false'` em 100%, `n ≥ 100` | **115/115 `false` — critério BATIDO** (remedido 2026-08-31T15:19Z) |
| `meta_ads` | `divergiu='false'` em 100%, `n ≥ 3` | 3/3 com `divergiu=null` — **não conta** |
| qualquer | nenhuma linha com `divergiu='true'` | nenhuma |

`divergiu=null` é **ausência de resolução**, nunca concordância — é o estado de hoje do
`meta_ads`, e é o que o passo 1 existe para mudar. O limiar `n ≥ 3` do `meta_ads` é baixo por
medição, não por comodidade: o volume real do receptor é 3 eventos em ~30h.

Qualquer `divergiu='true'` ⇒ **não cortar**; investigar.

### 3.1 A JANELA — correção do @po, sem ela o critério do `meta_ads` é insatisfazível

> A consulta acima **não tem recorte de tempo**, e as 3 linhas de `meta_ads` com `divergiu=null`
> são **permanentes** (existem porque, antes do passo 1, `resolveOrgByMetaPage` não tinha o que
> resolver). Somadas a qualquer evento novo, *"`divergiu='false'` em 100%"* **nunca** fica verdade
> para esse receptor. As duas saídas seriam: não cortar nunca, ou cortar ignorando a régua — que é
> o mesmo que não ter régua. A tabela acima está avaliada **dentro da janela abaixo**.

- **A janela vale SÓ para o `meta_ads`.** Acrescentar ao recorte desse receptor:
  `AND created_at > '<timestamp UTC da chamada mark_connected do passo 1>'`.
- **Colar as DUAS versões** (com e sem janela) no Dev Agent Record, para que a exclusão dos
  eventos anteriores seja **explícita e auditável**, nunca silenciosa.
- O marco é a `mark_connected`, **não** a escrita do segredo: é a partir dela que a linha fica
  `connected` e o resolver passa a poder casar. Antes dela, `divergiu=null` não é desacordo — é
  ausência estrutural de resolução.
- **`whatsapp` continua sem janela**, avaliado sobre o histórico inteiro: é o critério mais estrito
  e já está satisfeito (115/115). Aplicar a janela ali zeraria o contador e atrasaria o corte em
  ~um dia sem medir nada novo.
- **A exigência "nenhuma linha com `divergiu='true'`" vale sobre a consulta SEM janela, para os
  dois receptores** — uma divergência anterior ao passo 1 é informação, não ruído a ser recortado.

### 3.2 O que fazer com `n = 0`, `1` ou `2` — a pergunta que o critério não respondia (QA-900-55-8)

> Com a janela da 3.1, o `whatsapp` deixa de ser a restrição (está batido **sem** janela) e o
> **`meta_ads` passa a mandar na data do corte**. Ao volume real do receptor — 3 eventos em ~30h,
> **≈ 0,1 evento/h** — encher a janela até `n ≥ 3` custa **~30h de tráfego contadas a partir da
> `mark_connected`**, e a janela **começa em 0 linhas**.

**Com `n = 0`, `1` ou `2` dentro da janela, o critério NÃO está satisfeito.** Não é "quase
satisfeito": `n ≥ 3` é o piso, e um `n` menor é ausência de prova, do mesmo modo que `divergiu=null`
é ausência de resolução — nunca concordância.

**Ação: esperar.** Duas coisas que **não** são ação, e que são exatamente a tentação que este
parágrafo existe para tirar da mesa, porque é a mesma pressão que já produziu régua ruim nesta
story (contar linhas em vez de nomear as duas ações, §2.2):

- **Nunca baixar o limiar.** O `3` está justificado por medição do volume (§3), não por
  comodidade. Trocá-lo dentro de uma janela P0 aberta é fabricar o verde, não obtê-lo.
- **Nunca reabrir a janela para trás.** A âncora é o timestamp UTC da `mark_connected` e só ele.
  Recuar a âncora traz de volta os eventos `divergiu=null` **estruturais** — os que existem porque
  o resolver não tinha o que resolver antes do passo 1 — e eles **não contam como concordância**
  em posição nenhuma da janela. Não existe âncora que torne o critério mais fácil que a verdade.

**Se as ~30h passarem sem 3 eventos**, o caminho é **investigar por que o volume do `meta_ads`
caiu** — a mesma consulta de §3, mais `webhook_logs` de `source='meta_ads'` no período —, não
afrouxar a régua. Volume abaixo do esperado é sinal, e é o tipo de sinal que o corte não deve
atravessar por cima.

---

## 4. Passo 3 — o que continua em aberto, dito antes e não depois (AC4)

`landing_page` e `telegram` **não têm identificador de tenant no payload** (decisão travada do
plano aprovado — UTM colide entre tenants e não serve de chave de roteamento). Os dois usam
`resolveSoleOrg`, que devolve `"ambigua"` com 2 orgs ativas **em qualquer modo**.

**Isso não é efeito deste corte** e não deve ser reportado como regressão dele: com a segunda
empresa ativa, os dois quebram igual, com `identifier` ou com `both`.

**Volume medido em produção nos 7 dias até 2026-08-31:**

| receptor | volume | observação |
|---|---|---|
| `landing_page` | 5 linhas em `webhook_logs`, a última em 2026-08-26 | 0 eventos `WEBHOOK_ORG_RESOLVED` — o dual-run só passou a existir em 2026-08-30 18:00Z |
| `telegram` | 0 conversas criadas | canal de staging/teste |

### 4.1 Sobre QUEM cai, e QUANDO — correção de enquadramento (QA-900-55-6)

> A versão anterior desta seção dizia que o corte *"não muda nada para eles"*. **Muda — para
> melhor.** E dizia que fechar `landing_page` era *"story própria da Onda 3"*, o que colocava o
> conserto depois do momento em que o buraco abre. As duas correções estão abaixo.

**(1) Quem perde é a TRIFOLD, não só a empresa nova.** `resolveSoleOrg` lê
`organizations WHERE is_active LIMIT 2` e devolve `"ambigua"` assim que houver duas — **sem
distinguir de quem é o lead**. O caminho legado (`webhooks/landing-page/route.ts`,
`whatsapp_config .eq(status,'active').single()`) também devolve `null` com duas linhas ativas.
Ou seja, os ~5 leads/semana que se perdem são leads **da operação da própria Trifold**.

**(2) O gatilho é o ONBOARDING, não o flip.** A segunda org ativa é o que abre o buraco, e a
segunda org é exatamente o que esta story destrava. Portanto a story de `landing_page` é
**co-requisito do primeiro onboarding** — mesma disciplina de ordem que a seção 1 impõe ao próprio
corte —, e **não** um item genérico de "Onda 3" sem data. Embarcar o primeiro cliente sem ela é
embarcar um buraco conhecido na operação da Trifold.

**(3) O corte torna a perda MAIS observável — ponto a favor, entregue de graça.** Em `both` e em
`legacy` a perda é **SILENCIOSA**: `logOrgUnresolved` é deliberadamente **não** chamado
(`landing-page/route.ts`, comentário no local: *"seria logar 'não resolvido pelo identificador'
para um caminho que nem consultou o identificador"*); só existe um `console.error` e o
`processing_error: "Nenhuma org ativa encontrada"` em `webhook_logs`. Depois do corte, no modo
`identifier`, o receptor **chama** `logOrgUnresolved` — o evento passa a existir em
`system_events`, com a ressalva da seção 1.1 (consultável, não entregue).

**Efeito colateral do (3), nomeado para não virar surpresa:** nesse mesmo ramo novo a resposta ao
proxy `api/lead.js` passa de **500** (`{ok:false}`) para **200**. A retentativa do proxy deixa de
acontecer — o que **não muda o desfecho** (a ambiguidade é determinística: a retentativa também
falharia), mas muda o que o formulário devolve e o que o log do proxy registra.

**Leitura:** o volume é baixo, mas **não é zero**, e o dono do lead perdido é a Trifold. Fechar
`landing_page` continua sendo story própria — mas **atrelada ao primeiro onboarding**, não à Onda 3
em geral.

---

## 5. Passo 4 — o corte (AC5)

**Existem DOIS projetos Vercel construindo este repositório, e os dois falam com o banco de
produção.** Setar a variável em um só deixa o outro em `both` — e qual dos dois atende o webhook
da Meta depende da URL configurada no App, não do que se supõe aqui.

| projeto | id | domínio |
|---|---|---|
| `trifold-s-projects` | `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj` | `crm.trifold.eng.br` |
| `freelans-projects-d9ab20e0` | `prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` | `trifold-crm.vercel.app` |

1. `WEBHOOK_ORG_ROUTING=identifier` nos **dois**, via `scripts/vercel-env-set.sh` (REST API).
   **Nunca** `echo x` canalizado para `vercel env add`: grava **valor vazio em silêncio** (dois
   incidentes registrados — Stories 75-40 e 75-66). Valor vazio aqui cai em `both` pelo fail-safe
   de `decidirModoRoteamento()` — ou seja, **falha exatamente como um esquecimento, sem barulho.**
2. Conferir com `vercel env pull` para **fora** do repositório. `vercel env ls` confirma que a
   variável **existe**, não que ela tem **valor**.
3. **Redeploy nos dois.** Mudança de env só vale após redeploy.
4. **Prova pós-flip:** a consulta da seção 3 passa a devolver `via='identifier'` e `divergiu=null`
   para `whatsapp` e `meta_ads`. Enquanto aparecer `via='legacy'`, **um dos dois projetos não
   pegou o flip** — e essa consulta é o único jeito de descobrir isso sem ler a env.

---

## 6. Rollback (AC6)

| Gatilho | Ação | Prazo | Quem decide |
|---|---|---|---|
| Qualquer `WEBHOOK_ORG_UNRESOLVED` com motivo `nenhuma_correspondencia` para `whatsapp` depois do flip | `WEBHOOK_ORG_ROUTING` volta a `both` nos dois projetos + redeploy | ≤ 15 min | @devops executa; on-call decide |
| Queda a zero de mensagens inbound em janela de 4h em horário comercial (Seg-Sex 8h-18h, Sáb 8h-12h) | idem | imediato | on-call |
| `meta_ads` para de criar lead (0 leads de origem Meta em 24h contra a mediana do período) | idem | ≤ 1h | on-call |
| `WEBHOOK_ORG_UNRESOLVED` com motivo `legado_ambiguo_novo_resolveu` **antes** do flip | a ordem da seção 1 foi quebrada: existe 2ª `whatsapp_config` ativa sem o corte. Desativar a linha nova **ou** antecipar o flip | imediato | on-call |

O rollback é **reversão de variável + redeploy** — não exige PR nem migration. É isso que torna o
corte seguro de tentar. **Mas não é instantâneo:** o redeploy custa minutos, nos dois projetos. O
prazo de 15 min conta a partir da **detecção**, não da decisão.

> ⚠️ **De onde vem a detecção dos dois gatilhos de `WEBHOOK_ORG_UNRESOLVED` (linhas 1 e 4):
> de alguém rodando a conferência da seção 1.2.** Não há notificação — ver 1.1. Um prazo de
> "≤ 15 min a partir da detecção" com detecção manual é, na prática, o intervalo entre as
> conferências. **Enquanto a janela do corte estiver aberta, rodar a consulta de 1.2 pelo menos
> uma vez por dia** (e imediatamente após ativar qualquer `whatsapp_config`) é o que dá sentido ao
> prazo. Os gatilhos 2 e 3 (queda de inbound, `meta_ads` sem lead) são observáveis por caminhos
> que já existem e não dependem desta conferência.

---

## 7. O que este runbook NÃO cobre

- Não move `whatsapp_config.access_token` para o Vault — isso é `900-52/53/54`.
- Não remove o caminho legado do código. Remover é story posterior, depois desta janela.
- Não conserta `landing_page`/`telegram` (seção 4).
