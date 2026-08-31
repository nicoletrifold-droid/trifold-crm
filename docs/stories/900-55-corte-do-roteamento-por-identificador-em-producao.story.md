# Story 900-55 — O corte para roteamento por identificador em produção, ANTES de a 2ª empresa existir

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Onda 3 do epic ("corte do dual-run"), adiantada. A `900-24`
  (`webhook-org.ts:36`) deixou escrito que o corte para `"identifier"` é *"decisão da Onda 3,
  depois de 7 dias observando `system_events`"*. Os 7 dias venceram e **ninguém escreveu a story
  do corte** — este arquivo é ela.
- **Story:** 900-55. Numeração medida em 2026-08-31 contra `origin/main` + `git branch -r`:
  stories `900-52/53/54` existem em `docs/stories/` (todas `Draft`), a única branch remota da
  faixa é `origin/story/900-51-painel-self-service-integracoes` (já mergeada, PR #532). Nenhuma
  usa `900-55`.
- **Status:** Ready for Review.
- **Priority:** **P0 — bloqueia TODA e QUALQUER segunda empresa em produção**, por qualquer
  caminho: painel, RPC, ou o `UPDATE` manual com service-role que o documento do @architect
  nomeia como atalho consciente. Não existe rota de onboarding que não passe por aqui.
- **Complexity:** M — o código de aplicação já existe inteiro (`900-24`). O que esta story faz é
  (a) fechar UM ramo de diagnóstico que hoje mente, (b) preparar o dado que falta para o corte não
  quebrar outro receptor, (c) executar o corte com medição antes/depois.
- **Depends on:**
  - **`900-24`** (mergeada, PR #528) — `decidirModoRoteamento`, os 3 resolvers, os contadores.
    Esta story consome; não reescreve.
  - **`900-51`** (mergeada, PR #532; migration `248` **aplicada em produção** — medido 2026-08-31
    via Management API: ledger `trifold_migrations_aplicadas` com `total=271`,
    `ultimo=248_painel_integracoes_self_service.sql`). Necessária porque o `page_id` da AC2 é
    gravado por `org_integration_write_secret_as_org`, que nasce na `248`.
  - **Não depende** de `900-52/53/54` (Vault do WhatsApp) em nada. É o inverso: **elas dependem
    desta**, porque um segundo `whatsapp_config` ativo sem o corte derruba o WhatsApp das duas
    empresas antes de qualquer discussão sobre onde o token mora.

### Executor Assignment
- **Executor (código):** @dev (Dex) — AC3 e AC4.
- **Executor (dado + flip de env):** @devops (Gage) — AC2 (gravação do `page_id`) e AC5/AC6.
- **Quality Gate:** @qa (Quinn), com @architect (Aria) em `security_review` do ramo de AC3.
- **Quality Gate Tools:** `[code_review, security_review]`.

> **CodeRabbit Integration:** sem seção dedicada — mesma convenção do epic 900; o gatilho real é
> o App do GitHub no PR.

---

## User Story
**Como** dono do produto,
**eu quero** que o roteamento de webhook de produção passe a decidir pelo identificador do payload
**antes** de existir uma segunda empresa ativa, e que o instante em que isso der errado fique
**registrado e consultável** em vez de silencioso,
**para que** cadastrar o WhatsApp da primeira empresa cliente não derrube, no mesmo minuto, o
WhatsApp da Trifold — que é o canal por onde a operação inteira dela acontece.

---

## Context

### O estado armado, medido em produção hoje (não inferido)

Medição de 2026-08-31 via Management API (`dsopqkqjkmhytudaaolv`), somente agregados e metadados:

| receptor | `via` | `divergiu` | n | primeiro | último |
|---|---|---|---|---|---|
| `whatsapp` | `legacy` | `false` | **93** | 2026-08-30 18:00:57Z | 2026-08-31 12:35:45Z |
| `meta_ads` | `legacy` | `null` | **3** | 2026-08-30 19:46:12Z | 2026-08-31 01:42:29Z |

**O que essa tabela prova, e o que ela NÃO prova:**

1. **O modo vivo em produção é `both`.** Não é dedução: em modo `legacy` puro o
   `route.ts` cai no ramo `else if (legado)` e **não chama `logOrgResolved` nenhuma vez** — não
   haveria linha. Em `identifier` o `via` seria `identifier` e `divergiu` seria `null` **com** a
   org resolvida. `via='legacy'` **com** `divergiu` não-nulo só existe no ramo `both`.
2. **Para `whatsapp`, o caminho novo já concorda 93 vezes em 93** (`divergiu=false`). O corte é
   seguro para este receptor pelo critério que a própria `900-24` propôs.
3. **Para `meta_ads`, o caminho novo NÃO resolveu nenhuma das 3 vezes.** `divergiu=null` significa,
   pelo contrato de `logOrgResolved` (`webhook-org.ts`), que `novo.status !== "resolvida"` —
   ou seja, `resolveOrgByMetaPage` não achou linha em `org_integrations` com aquele `page_id`.
   Confirmado pelo agregado: **6 linhas em `org_integrations`, 0 com `secret_ref`, 0 linhas em
   `platform_audit_log`** — o painel nunca foi usado em produção, e o `page_id` da Trifold nunca
   foi gravado.

### A consequência que faz esta story existir

`WEBHOOK_ORG_ROUTING` é **uma variável para os 4 receptores**. Ela não tem granularidade por
canal. Isso cria uma tesoura:

| | Hoje (`both`) | Depois do corte (`identifier`) |
|---|---|---|
| `whatsapp`, 1 empresa | funciona | funciona (93/93 concordam) |
| `whatsapp`, 2 empresas ativas | **DERRUBA AS DUAS** — ver abaixo | funciona |
| `meta_ads`, 1 empresa | funciona (legado decide) | **PARA DE FUNCIONAR** — 0/3 resolvem |
| `landing_page`, `telegram`, 2 empresas | `resolveSoleOrg` → `"ambigua"` | `"ambigua"` igual |

**O ramo que derruba as duas empresas**, literal, em `app/api/webhook/whatsapp/route.ts:457-472`:
`legacyResolveActiveConfig` faz `.eq("status","active").maybeSingle()` sem filtro de telefone. Com
**duas** linhas ativas o PostgREST devolve `PGRST116`/406, o `error` é descartado na
desestruturação, `legado` vem `null` — e no modo `both` o `else` **não cai para o resolver novo**:
`config` fica `null`, o handler loga e devolve `200 {status:"ok"}`. **Mensagem de cliente,
descartada, com resposta de sucesso, para as duas empresas ao mesmo tempo.** É o mesmo defeito que
a `900-24` consertou no *resolver* e deixou de pé no *árbitro*.

Os índices `whatsapp_config_phone_ativo` e `whatsapp_config_org_ativo` (migration `246`) **não
protegem contra isto**: são únicos por telefone e por org, não globais. Duas orgs com uma linha
ativa cada é exatamente o estado que eles permitem — e devem permitir.

### O diagnóstico que MENTE nesse exato instante — o achado mais barato desta story

No ramo acima (`legado` nulo, `novo` resolvido), a linha
`route.ts:470` faz:

```ts
motivoNaoResolvida = novo.status === "nao_resolvida" ? novo.motivo : "nenhuma_correspondencia"
```

Quando o legado falha por ambiguidade **e o resolver novo acerta**, `novo.status === "resolvida"`,
então o motivo logado é **`"nenhuma_correspondencia"`** — "não achei config para este telefone".
A verdade é o oposto exato: *achei, e o árbitro é que estava quebrado.* Quem for depurar a queda
vai atrás de uma linha de `whatsapp_config` faltando, que está lá. Este ramo é, hoje, o único
sinal que a produção emitiria no minuto do incidente, e ele aponta para o lugar errado.

O mesmo padrão existe em `lib/meta/process-lead.ts` no bloco `both` do `meta_ads`.

### O que esta story NÃO faz
- Não conserta `landing_page` nem `telegram`. Os dois continuam sem identificador de tenant no
  payload e continuam devolvendo `"ambigua"` com 2 orgs — decisão travada do plano aprovado, e o
  corte não muda nada para eles. Nomeado aqui para não ser reportado como regressão desta story.
- Não toca `whatsapp_config.access_token` nem o Vault. Isso é `900-52`.
- Não remove o caminho legado do código. Remover é uma story posterior, depois desta janela.

---

## Scope

### IN
1. Ramo de diagnóstico honesto nos dois árbitros `both` (`whatsapp`, `meta_ads`): quando o legado
   falha e o novo resolve, o motivo logado passa a nomear isso.
2. Gravação do `page_id` da Trifold em `org_integrations` (provider `meta_ads`) em produção, pelo
   caminho auditado da `900-51` — **duas chamadas: escrita + promoção a `connected`** (ver AC2) —
   pré-requisito para o corte não quebrar a entrada de leads.
3. Janela de observação em `both` até `meta_ads` também acusar `divergiu=false`.
4. Flip de `WEBHOOK_ORG_ROUTING=identifier` **nos dois projetos Vercel** que servem produção.
5. Medição antes/depois e gatilho de rollback nomeado.

### OUT
- Tudo em "O que esta story NÃO faz".
- Qualquer mudança nos resolvers (`resolveOrgByWhatsAppPhone`, `resolveOrgByMetaPage`,
  `resolveSoleOrg`) — eles estão certos; o problema é o árbitro e o dado.

---

## Acceptance Criteria

### AC1 — O motivo logado deixa de mentir no minuto do incidente
- Em `app/api/webhook/whatsapp/route.ts` e `lib/meta/process-lead.ts`, no ramo `both` em que
  `legado` é nulo **e** `novo.status === "resolvida"`, o motivo registrado por `logOrgUnresolved`
  passa a ser um valor próprio — **`"legado_ambiguo_novo_resolveu"`** — acrescentado ao tipo
  `MotivoNaoResolvida` em `lib/tenancy/webhook-org.ts`.
- O nível do evento nesse ramo é **`error`**, não `info`/`warn`: é o estado em que mensagem de
  cliente está sendo descartada com `200`.
- **Carrasco (obrigatório, não opcional):** teste que monta 2 linhas `whatsapp_config` ativas em
  orgs distintas, dispara o handler em modo `both`, e exige o motivo novo. **Provar que o teste
  reprova sob a mutação** "voltar o ternário para `"nenhuma_correspondencia"`" — se ele passar
  verde com a mutação aplicada, ele está medindo outra coisa.
- Este AC vale por si só e pode mergear sozinho, antes de qualquer flip. É a rede que torna o
  resto desta story observável se algo correr fora de ordem.

### AC2 — O `page_id` da Trifold gravado ANTES do corte, pelo caminho auditado — em **DUAS** chamadas
- Gravar `org_integrations.config->>'page_id'` da org da Trifold com o valor da Página Trifold,
  via `org_integration_write_secret_as_platform` (a RPC da `248`), **nunca** por
  `UPDATE` direto — o ponto é a linha em `platform_audit_log`.
- **Gravar o `page_id` NÃO basta, e esta é a correção que a rodada 1 devia ter trazido.** A
  `900-51` (AC10) acrescentou `.eq("status","connected")` a `resolveOrgByMetaPage`
  (`lib/tenancy/webhook-org.ts:251`), e `_org_integration_write_secret` faz **só**
  `SET config, secret_ref, updated_at` — **nunca promove `status`** (é o R4 dela, deliberado; o
  `'connected'` que aparece na definição da função está em **comentário**, e um `ILIKE` sobre a
  definição inteira dá falso positivo). A linha da Trifold está `disconnected`. Portanto são
  **duas** chamadas, nesta ordem:
  1. `org_integration_write_secret_as_platform(p_org_id, p_provider => 'meta_ads', p_secret, p_config, p_actor_user_id)`
  2. `org_integration_mark_connected_as_platform(p_org_id, p_provider => 'meta_ads', p_actor_user_id)`
  **Sem a segunda, a AC3 nunca fecha para `meta_ads` e o corte quebra a entrada de leads pagos** —
  exatamente o que esta story existe para evitar. `mark_connected` recusa promover sem segredo não
  vazio gravado (`P0015`), então não há atalho que dispense a primeira.
- **A conferência não é contar linhas — é nomear as duas ações.** `platform_audit_log` tem
  **0 linhas** em produção hoje; depois desta AC tem **≥ 2**, e a régua é que existam as **duas
  ações distintas**: `org_integration.secret_write` **e** `org_integration.marked_connected`.
  Contar "≥ 1" (ou até "≥ 2") fica **verde exatamente sob o defeito que esta AC corrige** — duas
  escritas de segredo somam 2 linhas e deixam o `status` `disconnected`. Fechar por:
  `org_integrations` da `meta_ads` com `status='connected'`, `secret_ref` não nulo e
  `config->>'page_id'` com os 15 dígitos.
- **PARE se a trilha trouxer `org_integration.page_id_reassigned_cross_org` no lugar de
  `secret_write`:** significa que outra org já gravou esse `page_id` (a RPC lê a própria
  `platform_audit_log` antes de escrever). Com a trilha em 0 linhas hoje isso não deve acontecer —
  se acontecer, o pressuposto de "uma empresa só" caiu e a story inteira precisa ser reavaliada.
- **O guard `P0018` da `248` exige `page_id` numérico** (`^[0-9]+$`). O `page_id` da Trifold é
  numérico e passa — mas confirmar isso na hora, não presumir.
- **Segredo real entrando no Vault, com procedência.** `_org_integration_write_secret` exige um
  segredo não vazio (`P0017`) — não há caminho para gravar só o `config`. **Qual token vai no
  campo já está decidido**: autorização direta do dono do produto em 2026-08-31 (ver Dev Notes e
  runbook §2, *Autorização para gravar o token — procedência*). O @devops executa a decisão; não a
  toma.

### AC3 — O corte só acontece quando os DOIS receptores concordam
Re-executar, no dia do corte, exatamente esta consulta contra produção (agregado, sem conteúdo):

```sql
SELECT metadata->>'receptor' AS receptor,
       metadata->>'via'      AS via,
       metadata->>'divergiu' AS divergiu,
       count(*) AS n, min(created_at), max(created_at)
  FROM system_events
 WHERE event_type = 'WEBHOOK_ORG_RESOLVED'
 GROUP BY 1,2,3 ORDER BY n DESC;
```

**A JANELA é parte do critério — sem ela o critério do `meta_ads` é insatisfazível.** A consulta
acima **não tem recorte de tempo**, e as 3 linhas de `meta_ads` com `divergiu=null` são
**permanentes**: elas existem porque, antes da AC2, `resolveOrgByMetaPage` estruturalmente não
tinha o que resolver. Somadas a qualquer evento novo, "`divergiu='false'` em 100%" **nunca** é
verdade para esse receptor, e o operador só teria duas saídas — não cortar nunca, ou cortar
ignorando a régua, que é o mesmo que não ter régua. Portanto:
- **A janela vale SÓ para `meta_ads`.** Acrescentar `AND created_at > '<timestamp UTC da chamada
  mark_connected da AC2>'` **ao recorte desse receptor**, e **colar no Dev Agent Record as duas
  versões** (com e sem janela). A exclusão dos eventos anteriores fica **explícita e auditável**,
  nunca silenciosa.
- O marco é a **`mark_connected`** (não a escrita do segredo): é a partir dela que a linha fica
  `connected` e o resolver passa a poder casar. Antes disso, `divergiu=null` não é sinal de
  desacordo — é ausência estrutural de resolução.
- **`whatsapp` continua avaliado sobre o histórico INTEIRO, sem janela** — é o critério mais
  estrito e já está satisfeito (115/115). Aplicar a janela aqui zeraria o contador e atrasaria o
  corte em ~um dia sem medir nada de novo.

**Critério de corte, numérico e conjunto:**
- `whatsapp` (**sem janela**): `divergiu='false'` em **100%** dos eventos, com **n ≥ 100** (medido 2026-08-31T15:19Z:
  **115/115 — este critério já está BATIDO**; o 93/93 do draft era o baseline do dia da escrita).
- `meta_ads` (**dentro da janela acima**): `divergiu='false'` em **100%**, com **n ≥ 3**. O limiar
  é baixo **de propósito e a razão está medida**: o volume real do receptor é 3 eventos em ~30h.
  Exigir 100 aqui atrasaria o corte em semanas por um número inventado. **`divergiu=null` não
  conta como concordância** — é ausência de resolução, que é justamente o estado de hoje, e é por
  isso que os eventos anteriores à `mark_connected` são recortados em vez de "tolerados".
- Qualquer linha com `divergiu='true'` em qualquer receptor ⇒ **não cortar**; investigar e voltar
  a esta AC. **Isto vale sobre a consulta SEM janela também** — uma divergência anterior à AC2 é
  informação, não ruído a ser recortado.

### AC4 — A ausência de dado para `landing_page`/`telegram` é comunicada, não descoberta
- Antes do flip, registrar por escrito (nesta story, na seção Dev Agent Record) que os dois
  receptores **continuam sem identificador de tenant** e que, com a 2ª org ativa, ambos passam a
  `"ambigua"` **independentemente do modo** — não é efeito deste corte.
- Confirmar por medição qual é o volume desses dois receptores em produção nos últimos 7 dias
  (mesma consulta de AC3, filtrando `receptor`), para o dono do produto saber o tamanho do que
  fica em aberto.
- **Quem perde os leads é a TRIFOLD, e o gatilho é o ONBOARDING — não o flip.** O volume medido é
  baixo mas **não é zero** (5 em 7 dias), e `resolveSoleOrg` devolve `"ambigua"` **sem distinguir
  de quem é o lead**: com a 2ª org ativa, os ~5 leads/semana que se perdem são da operação da
  própria Trifold. O que abre o buraco é a **segunda org ativa** — isto é, o onboarding —, não a
  troca da variável. Portanto fechar `landing_page` é **story própria e co-requisito do primeiro
  onboarding**, com a mesma disciplina de ordem que a AC7 impõe ao corte; **não** um item genérico
  da "Onda 3" sem data. Embarcar o primeiro cliente sem ela é embarcar um buraco conhecido na
  operação da Trifold. **Registrada em `docs/backlog.md`** (`[STORY] landing_page perde os leads da
  Trifold…`, endereçada ao `@sm`) — um co-requisito sem casa é um co-requisito que ninguém cumpre.
- **Registrar que o corte torna essa perda MAIS observável — é ganho, não risco.** Em `both` e em
  `legacy` a perda é **silenciosa**: `logOrgUnresolved` é deliberadamente **não** chamado
  (`webhooks/landing-page/route.ts`, comentário no local), existindo só `console.error` +
  `processing_error` em `webhook_logs`. No modo `identifier` o receptor **chama**
  `logOrgUnresolved` e o evento passa a existir em `system_events` — com a ressalva da AC7
  (consultável, não entregue).
- **Efeito colateral do item acima, nomeado para não ser lido como regressão:** nesse mesmo ramo
  novo a resposta ao proxy `api/lead.js` passa de **500** (`{ok:false}`) para **200**
  (`{ok:true}`), então a retentativa do proxy deixa de acontecer. **Não muda o desfecho** — a
  ambiguidade é determinística e a retentativa também falharia — mas muda o que o formulário
  devolve e o que o log do proxy registra.

### AC5 — O flip acontece nos DOIS projetos Vercel, e isso é verificado, não presumido
- **Existem dois projetos Vercel construindo este repositório e os dois falam com o banco de
  produção** (medido pelo @architect em 2026-08-31, e antes disso pela duplicação de cron
  observada por 15 dias): `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj` (`trifold-s-projects`,
  `crm.trifold.eng.br`) e `prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` (`freelans-projects-d9ab20e0`,
  `trifold-crm.vercel.app`). **Setar a variável em um só deixa o outro em `both`** — e qual dos
  dois atende o webhook da Meta depende da URL configurada no App, não do que se supõe aqui.
- `WEBHOOK_ORG_ROUTING=identifier` nos **dois**, via `scripts/vercel-env-set.sh` (REST API).
  **Nunca** `echo x | vercel env add` — grava valor vazio em silêncio (2 incidentes registrados:
  Story 75-40 e 75-66). Um valor vazio aqui cai em `both` pelo fail-safe de
  `decidirModoRoteamento` — ou seja, **falha exatamente como um esquecimento, sem barulho.**
- Conferir com `vercel env pull` para fora do repositório (`vercel env ls` confirma que a
  variável **existe**, não que ela tem **valor**).
- Redeploy nos dois. Mudança de env só vale após redeploy.
- **Prova pós-flip:** a mesma consulta de AC3 passa a devolver `via='identifier'` e
  `divergiu=null` para `whatsapp` e `meta_ads`. Enquanto aparecer `via='legacy'`, **um dos dois
  projetos não pegou o flip** — e a consulta é o único jeito de descobrir isso sem ler a env.

### AC6 — Rollback nomeado, com prazo
| Gatilho | Ação | Prazo | Quem decide |
|---|---|---|---|
| Qualquer `WEBHOOK_ORG_UNRESOLVED` com motivo `"nenhuma_correspondencia"` para `whatsapp` depois do flip | `WEBHOOK_ORG_ROUTING` volta a `both` nos dois projetos + redeploy | ≤ 15 min | @devops executa; on-call decide |
| Queda a zero de mensagens inbound em janela de 4h em horário comercial (Seg-Sex 8h-18h, Sáb 8h-12h) | idem | imediato | on-call |
| `meta_ads` para de criar lead (0 leads de `source` Meta em 24h contra a mediana do período) | idem | ≤ 1h | on-call |

- **O rollback é reversão de variável + redeploy** — não exige PR nem migration. É isso que torna
  o corte seguro de tentar. **Mas não é instantâneo:** o redeploy custa minutos, nos dois projetos.
  Nomeado aqui para o prazo de 15 min ser medido a partir da detecção, não da decisão.

### AC7 — A ordem inversa fica impossível de acontecer por descuido
- Enquanto `WEBHOOK_ORG_ROUTING` não estiver `identifier` nos dois projetos, **nenhuma segunda
  linha de `whatsapp_config` pode ir para `status='active'` em produção.**
- Como isto é uma ordem entre um estado da Vercel e um estado do banco, **não existe constraint
  que a imponha** — o banco não enxerga a variável. O que esta AC exige é o substituto honesto,
  em três peças, todas conferíveis:
  1. o AC1 (motivo que não mente, nível `error`);
  2. uma linha explícita no runbook de onboarding dizendo que este corte é o **passo 1**, antes de
     qualquer gravação de credencial de cliente;
  3. **o runbook §1.2 — "o que o operador tem de FAZER para ver"** — contendo (i) a **consulta SQL
     literal** sobre `WEBHOOK_ORG_UNRESOLVED`, (ii) a **linha de base de 0 linhas** (o evento nunca
     existiu em produção, então qualquer linha é novidade) e (iii) **quando rodar**: imediatamente
     após ativar a 2ª `whatsapp_config` e uma vez por dia enquanto a janela estiver aberta. **As
     conferências são passos do onboarding, não sugestões.** Sem a peça 3 esta AC promete uma
     vigilância que ninguém exerce.
- **Não fingir que isto é uma trava, nem que é um alarme.** É uma sequência documentada com um
  **registro consultável** atrás — `WEBHOOK_ORG_UNRESOLVED` / `legado_ambiguo_novo_resolveu` em
  `system_events`, mais `console.error` no log de runtime da Vercel. **Ninguém é notificado**, e
  são quatro elos, não três: o único leitor de `level='error'`
  (`cron/nicole-health/route.ts`) filtra por `classificarErroIA` e **descarta** esta mensagem;
  nenhum consumidor seleciona este `event_type`; o painel `/dashboard/sistema` **não o exibe**,
  porque `api/system-events` filtra `.eq("org_id", user.orgId)` e `logOrgUnresolved` grava com
  `org_id = null` — a org é justamente o que não foi resolvido, e `= <uuid>` nunca casa `NULL`; e
  `WEBHOOK_ORG_UNRESOLVED` **nunca existiu em produção**, então não há histórico que desminta isso.
  A detecção depende **inteiramente** de alguém executar a conferência do **runbook §1.2**.
  Chamar de garantia — ou de alarme — seria o mesmo erro que a story está consertando na AC1.
- **Ligar a entrega fica FORA desta story, de propósito e por escrito.** O canal existe
  (`lib/alerts/admin-whatsapp.ts`, Story 87-19) e o conserto mora onde o evento **nasce**. Abrir
  esse caminho aqui — predicado de seleção, canal, carrasco, controle negativo — é escopo novo
  dentro de um corte P0 com janela aberta, e é assim que um corte atrasa e um alerta nasce sem
  carrasco. Fica registrado como **disponível, barato e pendente**, não como coberto.

---

## Tasks / Subtasks

- [x] **Task 0 — Remedir antes de tudo** (AC3)
  - [x] 0.1 Rodar a consulta de AC3 e colar a tabela atualizada no Dev Agent Record.
  - [x] 0.2 Confirmar contagem de orgs ativas e de linhas `whatsapp_config` ativas em produção.

- [x] **Task 1 — Motivo honesto nos dois árbitros** (AC1) — mergeável sozinho
  - [x] 1.1 `MotivoNaoResolvida` ganha `"legado_ambiguo_novo_resolveu"`.
  - [x] 1.2 `app/api/webhook/whatsapp/route.ts` — ramo `both`, `legado` nulo e `novo` resolvido.
  - [x] 1.3 `lib/meta/process-lead.ts` — mesmo ramo.
  - [x] 1.4 Teste com 2 linhas ativas + **mutação** provando que o teste reprova.

- [ ] **Task 2 — `page_id` da Trifold em produção** (AC2)
  - [x] 2.1 Decidir com o dono do produto qual token vai no campo de segredo (pergunta aberta) — **RESPONDIDA** em 2026-08-31: autorização direta do dono do produto, por pergunta explícita com três alternativas. Ver *Rodada 2 · QA-900-55-2* no Dev Agent Record e runbook §2.
  - [ ] 2.2 **Duas chamadas, nesta ordem:** `org_integration_write_secret_as_platform` (grava
        `page_id` + token) **e depois** `org_integration_mark_connected_as_platform` (promove
        `status`). A primeira **nunca** promove `status`; sem a segunda a linha fica
        `disconnected` e `resolveOrgByMetaPage` (que exige `status='connected'` desde a `900-51`)
        continua não resolvendo.
  - [ ] 2.2b Confirmar em `platform_audit_log` as **duas ações distintas** —
        `org_integration.secret_write` **e** `org_integration.marked_connected` — e a linha de
        `org_integrations` com `status='connected'`, `secret_ref` não nulo e `page_id` de 15
        dígitos. Contar linhas não discrimina: duas escritas de segredo somam 2 e deixam o status
        `disconnected`.
  - [ ] 2.3 Registrar o **timestamp UTC da `mark_connected`** — é o início da janela da AC3 — e
        confirmar que `resolveOrgByMetaPage` passa a resolver (`divergiu='false'` dentro da janela).

- [ ] **Task 3 — Janela de observação** (AC3, AC4)
  - [ ] 3.1 Acompanhar a consulta de AC3 até os dois critérios baterem.
  - [x] 3.2 Medir volume de `landing_page`/`telegram` e registrar.

- [ ] **Task 4 — O corte** (AC5)
  - [ ] 4.1 `scripts/vercel-env-set.sh` nos **dois** projetos + redeploy nos dois.
  - [ ] 4.2 Conferir por `vercel env pull` (fora do repo) que o valor não é vazio.
  - [ ] 4.3 Confirmar pela consulta de AC3 que `via='identifier'` nos dois receptores.

- [x] **Task 5 — Runbook** (AC6, AC7)
  - [x] 5.1 Registrar a tabela de rollback e a ordem obrigatória do onboarding.

---

## Dev Notes

### Pergunta ao dono do produto — **RESPONDIDA em 2026-08-31** (histórico preservado abaixo)
`_org_integration_write_secret` recusa segredo vazio (`P0017`), então gravar o `page_id` da
Trifold exige gravar **também um token da Página** junto. Hoje o token que o código usa para
buscar o dado do lead é `process.env.META_PAGE_ACCESS_TOKEN` (global) e **nada lê o token do
Vault** (a régua `nao-consumo.test.ts` proíbe, de propósito).

> **Pergunta:** o token da Página da Trifold deve ser gravado no Vault agora — sabendo que
> **nada vai lê-lo** até a Onda 7 e que ele fica duplicado com a env var —, ou o corte deve
> esperar uma variante da RPC que aceite gravar só `config`?

Registrada como pergunta porque as duas respostas têm custo real e a escolha é de produto.

> **RESPONDIDA em 2026-08-31 — autorização direta do dono do produto.** A pergunta foi feita
> explicitamente, com **três** alternativas e o custo de cada uma nomeado: (1) gravar o token real
> da Página junto do `page_id`, pelo caminho auditado; (2) entender antes o que será lido na Onda 7
> e só então gravar, adiando o corte; (3) não gravar e deixar o `meta_ads` **fora** do corte.
> **Resposta: "Confirmo, pode gravar"** — alternativa 1. O que isso autoriza, sem eufemismo: um
> token real de Página da Meta entra no Vault de produção pela primeira vez e, por decisão
> deliberada da régua `nao-consumo.test.ts`, **nada vai lê-lo até a Onda 7**. Procedência completa
> no runbook §2, seção *"Autorização para gravar o token — procedência"*.
>
> ⚠️ **Correção de procedência, registrada e não apagada — os dois estados precisam ficar
> distinguíveis.** Antes desta resposta o runbook afirmava *"decisão do dono do produto (registrada
> 2026-08-31)"*, e **a atribuição estava errada**: a decisão tinha sido tomada pelo **coordenador**,
> sozinho, e repassada como detalhe técnico. O @qa mediu que a única ocorrência da frase em todo o
> `docs/` era a própria linha que agia sobre ela — decisão cuja única procedência é o documento que
> a executa é **alegação**, não decisão — e bloqueou a Task 2 (QA-900-55-2). Estava certo. A
> autorização acima é **posterior** a esse bloqueio e é a real. Apagar o estado anterior tornaria
> os dois indistinguíveis, que é exatamente o defeito que a AC1 conserta um nível abaixo.

A frase original desta seção — *"Sem resposta, a Task 2 não roda"* — **deixou de valer**. A Task 2
segue bloqueada **apenas** pela correção da AC2 (as duas chamadas: `write_secret_as_platform` +
`mark_connected_as_platform`), agora incorporada à AC2 e à Task 2.2.

### Testing
- Camada A (unitária, sem banco): os dois ramos de AC1, com a mutação nomeada.
- Camada B (integração, `trifold-crm-dev`, harness `vitest.tenancy.config.ts` que chegou com a
  `900-25`/PR #531): duas orgs com `whatsapp_config` ativo, modo `both`, provar o descarte
  silencioso de hoje e o motivo novo depois da correção.
- **A medição de produção (AC3, AC5) não é teste automatizado** e não deve ser fingida como tal —
  é consulta manual, colada no Dev Agent Record com data e hora.

### Por que esta story vem antes da `900-52`
`900-52/53/54` movem o token de UMA linha que já funciona, de uma coluna para o Vault. Nenhuma das
três desbloqueia uma segunda empresa — as três põem "escrita self-service do tile whatsapp" no
OUT. Esta story não move nenhum segredo e é, sozinha, a diferença entre "a segunda empresa
funciona" e "as duas param". A ordem certa é: **900-55 → caminho de escrita do WhatsApp → o resto.**

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 0.5 | **Pós-gate PASS — QA-900-55-8 (LOW) atendida. Zero código, zero AC tocada.** Com a janela da rodada 2 o `meta_ads` vira a restrição que manda na data do corte (o `whatsapp` está batido sem janela) e, ao volume real de ≈ 0,1 evento/h, encher `n ≥ 3` custa ~30h — se chegarem 2, o operador cai na mesma pressão que produziu a régua de contar linhas da AC2. Acrescentada a **§3.2 do runbook**: com `n = 0..2` na janela o critério NÃO está satisfeito; **esperar, nunca baixar o limiar, nunca reabrir a janela para trás** (recuar a âncora traz de volta os `divergiu=null` estruturais, que não contam como concordância em posição nenhuma); se as ~30h passarem sem 3 eventos, investigar a queda de volume em vez de afrouxar a régua. **Escrito no runbook e não na AC3 por escolha declarada** — a frase é o critério existente dito por extenso mais a ação do operador, AC é autoridade do `@po`, e §3 é a superfície que o `@devops` lê no dia do corte; o texto está pronto para ser promovido a AC sem reescrita se o `@po` julgar assim. Discrepância `115/115` (runbook, minha remedição) × `120/120` (gate, remedição do `@qa`) registrada e **não** corrigida — número de produção vem com o dono da medição, e a Task 3.1 remede na hora. | @dev (Dex) |
| 2026-08-31 | 0.4 | **Ajustes de AC/Dev Notes/User Story — autoridade do @po, sobre as prescrições DE→PARA do @dev (rodada 2) e o gate CONCERNS.** Os quatro pedidos foram auditados no código vivo antes de aplicar, não herdados: (AC7) `api/system-events/route.ts:69` `.eq("org_id", user.orgId)` × `webhook-org.ts:465` `org_id: null` — o painel realmente não vê; AC7 reescrita para "registro consultável, ninguém é notificado", com os **quatro** elos e um novo marcador exigindo que o runbook §1.2 traga SQL literal + baseline de 0 linhas + quando rodar, como **passo do onboarding** (sem isso a AC promete vigilância que ninguém exerce), mais "ligar a entrega fica fora, por escrito". (AC4) reenquadrada: a perda é da **Trifold**, o gatilho é o **onboarding**, o corte torna a perda **mais observável** (ganho) e o efeito colateral 500→200 no proxy entra nomeado — verificado em `webhooks/landing-page/route.ts` (`{ok:true}` no ramo `identifier` × `{ok:false}`→500 em `both`/`legacy`). (AC2 + Task 2.2) **duas chamadas** — `_org_integration_write_secret` faz só `SET config, secret_ref, updated_at` (migration `248`:R4, o `'connected'` é comentário) e `resolveOrgByMetaPage:251` exige `status='connected'`; a conferência passou de "`platform_audit_log` ≥ 1" para **as duas ações nomeadas** (`secret_write` + `marked_connected`), porque contar linhas fica **verde exatamente sob o defeito** que a correção existe para impedir. (Dev Notes) pergunta preservada + resposta **"Confirmo, pode gravar"** anexada, com a correção de procedência (era decisão do **coordenador**, não do dono do produto) registrada inline para os dois estados ficarem distinguíveis. **Achado próprio, fora dos quatro pedidos: a AC3 era insatisfazível para `meta_ads`** — a consulta não tem recorte de tempo e as 3 linhas `divergiu=null` são permanentes, logo "100%" nunca fecha; acrescentada a **janela** ancorada no timestamp da `mark_connected`, **só para `meta_ads`** (aplicá-la ao `whatsapp` zeraria um contador já batido e atrasaria o corte em ~um dia sem medir nada novo), com as duas versões da consulta coladas para a exclusão ser auditável, e a régua de `divergiu='true'` mantida **sem** janela nos dois receptores. Runbook §3.1 alinhado. User Story: "audível" → "registrado e consultável". Nenhum arquivo em `packages/` tocado; nenhuma régua executada (árvore compartilhada com outro agente). | @po (Pax) |
| 2026-08-31 | 0.1 | Draft inicial. Nasce da revalidação das `900-52/53/54` pelo @po: as três não desbloqueiam empresa nova, e o que desbloqueia — o corte do dual-run — não tinha story. Estado de produção medido ao vivo via Management API (96 eventos `WEBHOOK_ORG_RESOLVED`, modo `both` provado pelo par `via`/`divergiu`; `meta_ads` 0/3 resolvendo; `platform_audit_log` vazio; ledger em 271/`248`). Ramo de diagnóstico que mente (`"nenhuma_correspondencia"` no caso ambíguo) medido no código, não suposto. | @po (Pax) |
| 2026-08-31 | 0.3 | **Fechamento das três concerns do gate CONCERNS.** QA-900-55-2 (procedência): a atribuição anterior estava ERRADA — a decisão era do coordenador, não do dono do produto; agora existe autorização direta do dono do produto, por pergunta explícita com três alternativas, resposta "Confirmo, pode gravar"; erro registrado, não apagado; Task 2.1 marcada. QA-900-55-1: escolhida a saída (b) — runbook §1 reescrito (registro consultável, não alarme) com §1.2 dizendo o que o operador precisa fazer para ver; reconferi os elos do @qa e achei um quarto, pior: o painel `/dashboard/sistema` também não vê, porque filtra `org_id = user.orgId` e o evento nasce com `org_id` nulo (22 de 35 eventos `error` de 30d são invisíveis por isso). QA-900-55-6: AC4 reenquadrada — a perda de `landing_page` é da TRIFOLD e começa no onboarding, logo co-requisito do primeiro onboarding; e em `both`/`legacy` a perda é silenciosa, então o corte a torna MAIS observável (ganho, não risco). Textos exatos de AC4 e AC7 prescritos para o @po (não edito AC). Correções factuais incorporadas: causa dos timeouts era agentes concorrentes na mesma árvore, não `turbo lint` (o @qa não reproduziu em 10 rodadas); justificativa do nível derivado corrigida no texto e no comentário do código, decisão mantida; ressalva do modo `legacy` vale só para `meta_ads`, não para `whatsapp` (`.maybeSingle()` só erra com 2+); terceiro árbitro (`telegram`) registrado como inalcançável na direção mentirosa; M3/M3r REMEDIDOS por mim — 3 e 8, não 2 e 6. Produção remedida 15:19Z: `whatsapp` 115/115, o `n >= 100` da AC3 está batido. | @dev (Dex) |
| 2026-08-31 | 0.2 | Task 0/1/5 implementadas pelo @dev. AC1 fechada nos dois árbitros com motivo `legado_ambiguo_novo_resolveu` e nível `error` derivado do motivo; 6 mutações provadas (inclusive as 2 do sentido inverso e a do próprio fake, que devolvia `linhas[0]` e tornava a AC1 insatisfazível). +14 testes; suíte 296/296, `lint`/`type-check` limpos. Produção remedida: `whatsapp` 96/96 `divergiu=false`, `meta_ads` 3/3 `divergiu=null`, `platform_audit_log` ainda vazio. **Duas correções à story**, medidas: (a) a AC2 exige TAMBÉM `mark_connected` — a `900-51` passou a filtrar `status='connected'` em `resolveOrgByMetaPage` e a RPC de escrita nunca promove status; (b) o `page_id` da linha `meta_ads` já existe como chave com valor NULO, não ausente. Tasks 2/3.1/4 seguem com o @devops. | @dev (Dex) |

---

## Dev Agent Record

**Agent Model Used:** claude-opus-5[1m] (Dex / @dev)
**Branch:** `story/900-55-corte-roteamento-identificador`, criada de `origin/main` em `a7cbfc35`.
**Modo:** YOLO. **Escopo executado:** Task 0, Task 1 e Task 5 (código + medição + runbook).
Task 2, 3 e 4 são do @devops por designação da própria story e dependem de escrita em produção /
flip de env — nenhuma delas foi executada aqui.

---

### Task 0 — Remedição em produção (AC3), 2026-08-31

Somente `SELECT` agregado, via Management API (`dsopqkqjkmhytudaaolv`), com `User-Agent`.
Nenhum identificador de conversa, telefone, nome ou timestamp por conversa foi lido ou colado.

**0.1 — consulta literal da AC3:**

| receptor | `via` | `divergiu` | n | primeiro | último |
|---|---|---|---|---|---|
| `whatsapp` | `legacy` | `false` | **96** | 2026-08-30 18:00:57Z | 2026-08-31 13:25:33Z |
| `meta_ads` | `legacy` | `null` | **3** | 2026-08-30 19:46:12Z | 2026-08-31 01:42:29Z |

Confere com o que o @po mediu (93 → 96 no `whatsapp`; `meta_ads` inalterado). **Modo `both`
confirmado** pelo par `via='legacy'` + `divergiu` não-nulo. `whatsapp` ainda não bate o `n ≥ 100`
da AC3; `meta_ads` continua em `divergiu=null` (ausência de resolução, não concordância).

**0.2 — contagens de estado:**

| medida | valor |
|---|---|
| `organizations` ativas / total | 1 / 1 |
| `whatsapp_config` com `status='active'` / total | 1 / 1 |
| `org_integrations` total / com `secret_ref` | 6 / **0** |
| `platform_audit_log` | **0** linhas |
| `system_events` com `WEBHOOK_ORG_UNRESOLVED` (7d) | **0** linhas |

**Achado que refina — e corrige — a AC2:** a linha `meta_ads` de `org_integrations` **já tem a
chave `page_id`**, com **valor nulo** (`config ? 'page_id'` verdadeiro,
`length(coalesce(config->>'page_id','')) = 0`). Ou seja, não é "chave ausente": é placeholder de
seed. Isso não muda o caminho de gravação (a RPC faz `SET config = p_config`, substituindo o
objeto inteiro), mas muda o diagnóstico de quem for conferir.

**Formato do `page_id` confirmado por medição, não presumido (guard `P0018`):** dos 113
`webhook_logs` de `source='meta_ads'` nos últimos 30 dias, `payload->'entry'->0->>'id'` é
numérico em **113/113**, com **1 valor distinto** e **15 dígitos**. Passa em `^[0-9]+$`.

---

### Task 1 — Motivo honesto nos dois árbitros (AC1) — **feito**

**1.1** `MotivoNaoResolvida` ganhou `"legado_ambiguo_novo_resolveu"` em
`lib/tenancy/webhook-org.ts`.

**Nível `error`, e por que ele é DERIVADO do motivo:** `logOrgUnresolved` passou a computar
`level` por `nivelDoMotivo(params.motivo)` — `error` só para o motivo novo, `warn` para os outros
três.

> ⚠️ **Justificativa corrigida (QA-900-55-1).** O que eu escrevi aqui na rodada 1 — *"deixaria um
> `error` órfão que manteria uma das duas asserções verde"* — **é falso**, e o @qa está certo: o
> `toMatchObject` do carrasco é **único** e cobre `level` e `motivo` juntos, então a mutação do
> ternário (M1/M5) o derruba de qualquer jeito. A decisão continua certa; o argumento não era.
> **Os dois motivos reais:** (a) a severidade é propriedade do **estado**, não do relator — quem lê
> o runbook §6 decide o rollback pelo MOTIVO, e colar o nível a ele impede que os dois divirjam;
> (b) põe o mapa `motivo → nível` num ponto **único e nomeado**, o que é o que torna M3/M3r
> expressáveis como mutação de um ponto só. Com `level` por parâmetro, o controle negativo "os
> outros 3 motivos continuam `warn`" viraria asserção sobre call sites e os 4 testes de mapa não
> existiriam. **Preço nomeado:** nenhum call site futuro emite este motivo em outro nível sem mexer
> no mapa — correto hoje, registrado para quando houver dois. O comentário de
> `nivelDoMotivo` em `webhook-org.ts` foi corrigido junto (a linha errada estava lá também).

**1.2 / 1.3** Os dois árbitros (`app/api/webhook/whatsapp/route.ts` e `lib/meta/process-lead.ts`)
trocaram o ternário mentiroso por um ramo explícito `else if (novo.status === "resolvida")`.
`quantidadeEncontrada = 1` porque é quantas o caminho NOVO achou — quantas o legado viu é
justamente o que o `.maybeSingle()`/`.single()` jogou fora, e não há número honesto por ele.

**O comportamento não muda.** Em `both` o legado continua sendo quem decide e a mensagem continua
sendo descartada com 200 — invariante da 900-24, que tem carrasco próprio na mesma suíte. O que
muda é o que o sistema **diz** no minuto do incidente.

**1.4 — o instrumento tinha de ser consertado primeiro.** O fake local de
`webhook/whatsapp/__tests__/route.test.ts` devolvia `linhas[0] ?? null` com `error: null` no
`maybeSingle()`. Sob ele, `legacyResolveActiveConfig` **nunca** devolveria `null` com 2 linhas
ativas, o ramo `else` nunca seria alcançado, e o teste da AC1 seria **insatisfazível** — vermelho
por causa do instrumento, ou verde medindo outra coisa. Os dois terminais singulares passaram a
usar `resultadoSingular` / `resultadoMaybeSingle` do fake fiel da 900-24
(`lib/tenancy/__fixtures__/fake-supabase-postgrest.ts`) — REUSO, não uma terceira implementação.

---

### Carrasco: 6 mutações, cada uma com `tsc --noEmit` rc=0 ANTES de contar o vermelho

| # | mutação | `tsc` | resultado |
|---|---|---|---|
| M1 | `route.ts`: motivo novo volta a `"nenhuma_correspondencia"` (a mutação que a AC1 nomeia) | rc=0 | 🔴 1 teste |
| M2 | `route.ts`: emite o motivo novo SEMPRE que o legado for nulo | rc=0 | 🔴 2 testes |
| M3 | `webhook-org.ts`: `nivelDoMotivo` devolve sempre `"warn"` | rc=0 | 🔴 **3 testes / 3 arquivos** ⚠️ corrigido |
| M3r | `webhook-org.ts`: `nivelDoMotivo` devolve sempre `"error"` (sentido inverso) | rc=0 | 🔴 **8 testes / 3 arquivos** ⚠️ corrigido |
| M4 | o fake volta a mentir: `maybeSingle()` devolve `linhas[0]` | — | 🔴 2 testes |
| M5 | `process-lead.ts`: motivo novo volta a `"nenhuma_correspondencia"` | rc=0 | 🔴 1 teste |
| M6 | `process-lead.ts`: emite o motivo novo SEMPRE que o legado for nulo | rc=0 | 🔴 4 testes |

M2/M6 e M3r existem porque **um sentido só é colinear**: sem eles, "emitir sempre o motivo novo"
e "subir tudo para `error`" passariam verdes, e o motivo novo viraria ruído — a forma mais barata
de tornar inútil justamente o sinal que esta story existe para criar.

M4 é o carrasco do **instrumento**: prova que o fake fiel é carga, não decoração.

**14 testes novos.** Suíte inteira: **296/296 arquivos, 3900 passed + 6 expected fail, rc=0**
(baseline na mesma árvore sem as mudanças: 296/296, 3886 passed — +14, nenhuma regressão).
`turbo lint --force`: 0 erros (30 warnings pré-existentes, nenhum nos arquivos tocados —
`eslint` direto nos 6 arquivos sai rc=0). `turbo type-check --force`: 8/8 successful.

> **Nota de execução honesta — a CAUSA que eu registrei estava ERRADA, corrigida abaixo.**
> Duas rodadas intermediárias da suíte completa acusaram falhas em `formulario/[token]`,
> `cron/enrich-leads`, `admin-client-allowlist` e 2 testes antigos de `webhook/whatsapp`.
> **Todas eram `Test timed out`**; os mesmos arquivos passam isolados (3 repetições) e a rodada
> final saiu limpa. Isso continua valendo — o que não vale é a causa.
>
> ⚠️ **Correção (QA-900-55-7 / nota do gate).** Eu atribuí ao `turbo lint --force` concorrente.
> **Não se sustenta:** o @qa rodou a suíte inteira **10 vezes** nesta árvore, incluindo **uma
> deliberadamente concorrente com `turbo lint --force`**, e mediu `grep -c "Test timed out"` = **0
> nas dez** — inclusive no cenário que eu culpei. **A causa real é outra sessão de agente
> escrevendo NESTA mesma árvore de trabalho:** entre dois comandos dele, o arquivo
> `packages/web/src/lib/tenancy/__po_probe_42a.test.ts` (sonda do @po para a 900-42a) apareceu e
> sumiu — e é um `*.test.ts` **dentro do `include` do vitest**, que muda a contagem de arquivos e
> sai vermelho se estiver presente numa rodada. Rodei agentes em paralelo na mesma árvore; a culpa
> é minha. **Registrar causa errada é pior que não registrar** — é assim que o próximo timeout é
> dispensado com um dar de ombros. A contramedida é rodar a régua com a **árvore quieta**, não
> parar de rodar o lint.

---

### Task 3.2 / AC4 — o que fica em aberto, medido e dito ANTES do flip

`landing_page` e `telegram` **continuam sem identificador de tenant no payload**. Os dois usam
`resolveSoleOrg`, que devolve `"ambigua"` com 2 orgs ativas **em qualquer modo** — `both` ou
`identifier`. **Não é efeito deste corte** e não deve ser reportado como regressão dele.

Volume medido em produção nos 7 dias até 2026-08-31:

| receptor | volume | leitura |
|---|---|---|
| `landing_page` | 5 linhas em `webhook_logs`, última em 2026-08-26 | baixo, mas **não zero** |
| `telegram` | 0 conversas criadas | canal de staging/teste |

Nenhum dos dois tem evento `WEBHOOK_ORG_RESOLVED`, porque o dual-run só passou a existir em
2026-08-30 18:00Z e não houve tráfego desses receptores depois disso.

**Recomendação — CORRIGIDA (QA-900-55-6), ver Rodada 2.** Fechar `landing_page` continua sendo
story própria, mas é **co-requisito do primeiro onboarding**, não item genérico da "Onda 3": o
gatilho é a **segunda org ativa**, que é exatamente o que esta story destrava. E quem perde os
~5 leads/semana é a **Trifold**, não só a empresa nova — `resolveSoleOrg` devolve `"ambigua"` sem
distinguir de quem é o lead.

---

### Task 5 — Runbook (AC6, AC7) — **feito**

`docs/runbooks/900-55-corte-do-roteamento-por-identificador.md`. Contém a ordem obrigatória do
onboarding (o corte é o **passo 1**), os dois projetos Vercel com id e domínio, a consulta de
corte, a tabela de rollback e a seção "o que este runbook NÃO cobre".

A AC7 está atendida **como ela mesma se define**: uma sequência documentada, explicitamente
**não** chamada de trava. O banco não enxerga a variável da Vercel; nenhuma constraint pode impor
essa ordem.

> ⚠️ **Corrigido na Rodada 2 (QA-900-55-1):** eu escrevi aqui *"com um alarme atrás"*. **Não é um
> alarme** — é um **registro consultável**, e ninguém é notificado. O runbook §1.1/§1.2 diz isso
> com todas as letras e prescreve a conferência manual. O texto da AC7 é do @po e segue prescrito
> na Rodada 2, não aplicado.

---

### O que eu NÃO fiz, e por quê

- **Task 2 (gravar `page_id` + token em produção)** — executor é o @devops; exige escrita em
  produção com credencial de plataforma. Deixei o procedimento exato na seção 2 do runbook.
- **Task 3.1 (janela de observação)** e **Task 4 (o flip + redeploy)** — @devops, depois do gate.
- **Nenhum commit, nenhum push, nenhum PR.**

---

### Correções que a story precisa — medidas, não supostas

**1. AC2 e Task 2.3 estão INCOMPLETAS: gravar o `page_id` não faz o `meta_ads` resolver.**
A `900-51` (AC10) acrescentou `.eq("status","connected")` a `resolveOrgByMetaPage`
(`lib/tenancy/webhook-org.ts`), e `_org_integration_write_secret` **nunca promove `status`** —
é o R4 dela, deliberado. A linha da Trifold está `disconnected`. Portanto a AC2 precisa de **duas**
chamadas: `org_integration_write_secret_as_platform` **e depois**
`org_integration_mark_connected_as_platform`. Sem a segunda, a AC3 nunca fecha para `meta_ads` e
o corte quebra a entrada de leads pagos — exatamente o que a story existe para evitar.
Isto reforça a decisão de gravar o token real: `mark_connected` recusa promover sem segredo não
vazio (`P0015`), então não há atalho.
O cabeçalho de `resolveOrgByMetaPage` **já** deixou esse gate escrito na 900-51 (*"não aplicar
enquanto essa linha não estiver `connected`"*); a 900-55 não o incorporou.

**2. AC1 não cobre o modo `legacy` — deliberado. Mas o MOTIVO que eu dei estava errado.**
Com `WEBHOOK_ORG_ROUTING=legacy` e 2 configs ativas, o resolver novo **nem é computado**, então
o motivo continua `"nenhuma_correspondencia"` e continua mentindo.

> ⚠️ **Correção (QA-900-55-3).** Eu escrevi *"não há verdade barata disponível nesse modo"*. Isso
> é **falso para o `whatsapp`**: `legacyResolveActiveConfig` usa **`.maybeSingle()`**, que — pela
> medição que o próprio projeto fez contra `@supabase/postgrest-js@2.101.1` e congelou em
> `fake-supabase-postgrest.ts` — **só erra com 2+ linhas** (com 0 devolve `{data:null,
> error:null}`). Logo `error?.code === "PGRST116"` **é** um discriminante exato e barato de
> ambiguidade nesse receptor, disponível em `legacy` **e** em `both`, sem computar o resolver novo.
> A alegação vale só para `meta_ads`, cujo `legacyResolveActiveOrgId` usa `.single()` — que
> confunde 0 com 2+.
>
> **A decisão de não cobrir continua de pé, por outro motivo:** produção roda `both` (medido), o
> corte vai para `identifier`, e o rollback da AC6 volta para **`both`**, nunca para `legacy`. O
> modo é inalcançável no plano operacional inteiro — cobrir seria construir carrasco para um
> caminho que ninguém pisa. Nomeado aqui para não ser descoberto por um leitor futuro como buraco
> silencioso.

**3. `quantidadeEncontrada` no motivo novo vale `1`, não `2`.** É a contagem do caminho que
RESOLVEU. Quantas linhas ativas o legado viu é precisamente o dado que o terminal singular jogou
fora. Está afirmado em teste para não virar número mágico.

---

---

## Rodada 2 — fechamento das três concerns do gate (2026-08-31, pós-CONCERNS)

Escopo desta rodada: **procedência, enquadramento e correção de registro.** Nenhuma mudança de
comportamento. A única alteração em arquivo de código é **comentário** (`webhook-org.ts`), com
`tsc --noEmit` rc=0 medido depois. Task 2, Task 3.1 e Task 4 continuam **não executadas** — escrita
em produção e flip são do @devops, depois do gate reaberto.

### QA-900-55-2 — procedência da decisão do token. **FECHADA.**

O @qa bloqueou a Task 2 porque o runbook §2 afirmava *"Decisão do dono do produto (registrada
2026-08-31)"* e a única ocorrência da frase em todo o `docs/` era a própria linha que agia sobre
ela — uma decisão cuja única procedência é o documento que a executa é alegação, não decisão. E
aquilo autoriza um **token real de Página da Meta a entrar no Vault de produção pela primeira
vez**. **Ele estava certo, e o erro foi meu:** a decisão tinha sido do **coordenador**, sozinho, e
foi repassada como se fosse do dono do produto.

**Estado agora:** existe **autorização direta do dono do produto, obtida por pergunta explícita com
alternativas, em 2026-08-31**. A pergunta apresentou três caminhos — (1) gravar o token real,
(2) entender antes e adiar o corte, (3) não gravar e deixar o `meta_ads` fora do corte — e a
resposta foi **"Confirmo, pode gravar"**.

Registrado no runbook §2, em seção própria (*"Autorização para gravar o token — procedência"*),
**com a atribuição anterior errada preservada e marcada como corrigida** — apagá-la tornaria os
dois estados indistinguíveis, que é o defeito que a AC1 conserta um nível abaixo, e o gate seguinte
precisa poder auditar como o consentimento chegou. **Task 2.1 marcada.**

> A Task 2 continua bloqueada pela outra pendência, que é do @po e não minha: **a AC2 e a Task 2.2
> precisam das DUAS chamadas** (`write_secret_as_platform` **+** `mark_connected_as_platform`) —
> ver *Correções que a story precisa*, item 1, confirmado pelo @qa no objeto vivo. O runbook §2.1
> já traz a ordem certa; o risco é o @devops seguir o checklist da story.

### QA-900-55-1 — o nível `error` não tem quem o entregue. **Escolhi (b): reescrever.**

**Justificativa da escolha.** Ligar a entrega é caminho novo — predicado de seleção, canal,
carrasco próprio, controle negativo — no meio de uma P0 cuja janela de corte já está aberta
(`whatsapp` bateu o `n ≥ 100`). Escopo novo dentro de um corte é exatamente como um corte
atrasa e como um alerta nasce sem carrasco. O que a AC7 exige é **honestidade**, não entrega: ela
mesma diz *"não fingir que isto é uma trava"*. A mesma disciplina tem de valer para a palavra
"alarme". **(a) fica registrado como disponível e barato** — o canal existe
(`lib/alerts/admin-whatsapp.ts`, Story 87-19) e o conserto mora onde o evento **nasce**.

**Reconferi os três elos do @qa, e achei um quarto que ele não nomeou — o pior deles:**

| elo | medido |
|---|---|
| leitor de `level='error'` | `api/cron/nicole-health/route.ts` é o único; `classificarErroIA(message)` + `if (!tipo) continue`; nenhuma das 8 assinaturas de `lib/alerts/erro-ia.ts` casa com `"whatsapp: org não resolvida (legado_ambiguo_novo_resolveu)"` |
| leitor por `event_type` | nenhum seleciona `WEBHOOK_ORG_UNRESOLVED` |
| **painel `/dashboard/sistema` (NOVO)** | **também não vê.** `api/system-events` filtra `.eq("org_id", user.orgId)` e `get_system_events_summary` (lido em produção por `pg_get_functiondef`) termina em `WHERE org_id = p_org_id`. `logOrgUnresolved` grava com **`org_id = null`** — não há org a atribuir, é justamente o que falhou. `= <uuid>` **nunca casa `NULL`** |
| histórico | `WEBHOOK_ORG_UNRESOLVED` **nunca existiu** em produção (medido sem recorte de janela: 0 linhas de sempre) |

O quarto elo importa porque o gate ainda concedia ao `error` *"o filtro `?level=error` de
`/api/system-events`, que exige um humano ir olhar"*. **Nem isso.** O humano que for olhar não vê.
Medida de apoio, produção, 30 dias: **22 dos 35 eventos `level='error'` têm `org_id` nulo** e são
invisíveis no painel pelo mesmo motivo. Sobra `console.error` no runtime da Vercel e consulta
direta ao banco.

**O que fiz:**
1. **Runbook §1 reescrito.** O item 2 deixou de ser *"o alarme atrás dela"* e virou *"um registro
   consultável"*. Nova **§1.1** tabela dos elos + a correção registrada em vez de apagada. Nova
   **§1.2 — "o que o operador tem de FAZER para ver"**, com a consulta SQL literal, o baseline
   (`0 linhas`, para que qualquer linha seja novidade), a busca no log da Vercel **nos dois
   projetos**, e **quando rodar**: imediatamente após ativar a 2ª `whatsapp_config` e uma vez por
   dia na janela. Sem isso o runbook promete vigilância que ninguém exerce.
2. **Runbook §6** ganhou a nota de que a detecção dos dois gatilhos de `WEBHOOK_ORG_UNRESOLVED`
   vem da conferência manual de §1.2 — um prazo "≤ 15 min a partir da detecção" com detecção
   manual é, na prática, o intervalo entre as conferências.
3. **`webhook-org.ts`:** o bloco de doc do motivo dizia que ele torna o corte *"audível"*. Trocado
   por **"consultável"**, com os quatro elos nomeados no próprio arquivo onde o leitor futuro cai.

**O texto da AC7 é do @po — segue prescrito, não aplicado** (não edito Acceptance Criteria; mesma
disciplina que o @qa usou para a AC2). Substituição exata, terceiro marcador da AC7:

- **DE:** *"**Não fingir que isto é uma trava.** É uma sequência documentada com um alarme atrás.
  Chamar de garantia seria o mesmo erro que a story está consertando na AC1."*
- **PARA:** *"**Não fingir que isto é uma trava, nem que é um alarme.** É uma sequência
  documentada com um **registro consultável** atrás — `WEBHOOK_ORG_UNRESOLVED` /
  `legado_ambiguo_novo_resolveu` em `system_events`, mais `console.error` no log da Vercel.
  **Ninguém é notificado:** o único leitor de `level='error'` filtra por `classificarErroIA` e
  descarta esta mensagem, nenhum consumidor seleciona este `event_type`, e o painel
  `/dashboard/sistema` não o exibe porque filtra `org_id = user.orgId` enquanto o evento nasce com
  `org_id = null`. A detecção depende de alguém executar a conferência do **runbook §1.2**.
  Chamar de garantia — ou de alarme — seria o mesmo erro que a story está consertando na AC1."*

### Mais duas prescrições ao @po, para a story não contradizer o runbook

Não edito Dev Notes nem User Story (só Dev Agent Record, checkboxes, File List, Change Log). As
duas afirmações abaixo ficaram **falsas** depois desta rodada e são a mesma contradição que o
QA-900-55-2 flagrou, agora invertida — o runbook tem a decisão, e a story ainda a chama de aberta:

1. **Dev Notes → "Pergunta aberta ao dono do produto".** A frase *"**Sem resposta, a Task 2 não
   roda**"* deixou de valer: a resposta existe (runbook §2, *Autorização para gravar o token —
   procedência*). Sugestão de edição mínima, **preservando a pergunta como histórico**: manter o
   bloco e acrescentar ao final — *"**RESPONDIDA em 2026-08-31:** autorização direta do dono do
   produto, por pergunta explícita com três alternativas (gravar / entender antes / não gravar e
   deixar o `meta_ads` fora do corte); resposta: **'Confirmo, pode gravar'**. Procedência e a
   correção da atribuição anterior — que era do coordenador, não do dono do produto — estão no
   runbook §2. A Task 2 segue bloqueada apenas pela correção da AC2 (duas chamadas)."*
2. **User Story, terceira linha** — *"seja **audível** em vez de silencioso"*. Menor, mas é a mesma
   palavra: sugerir *"seja **registrado e consultável** em vez de silencioso"*. Fica a critério do
   @po; não muda escopo nem carrasco.

### QA-900-55-6 — a AC4 estava enquadrada errada. **Reenquadrada.**

As duas correções do @qa procedem, e eu as reconferi no código:

1. **A perda de `landing_page` cai sobre a TRIFOLD.** `resolveSoleOrg` lê
   `organizations WHERE is_active LIMIT 2` e devolve `"ambigua"` com 2 orgs — **sem distinguir de
   quem é o lead**. O caminho legado (`webhooks/landing-page/route.ts`, `.single()` sobre
   `whatsapp_config` ativo) também devolve `null` com 2 linhas. Os ~5 leads/semana perdidos são da
   operação da própria Trifold.
2. **O gatilho é o ONBOARDING, não o flip** — a segunda org ativa é o que abre o buraco, e é
   exatamente o que esta story destrava. Logo: **co-requisito do primeiro onboarding**, com a mesma
   disciplina de ordem que a AC7 impõe ao corte; não item genérico de "Onda 3" sem data.
3. **E o corte torna a perda MAIS observável — ponto a favor, entregue de graça.** Em `both`/
   `legacy` a perda é **silenciosa**: `logOrgUnresolved` é deliberadamente **não** chamado
   (comentário no local: *"seria logar 'não resolvido pelo identificador' para um caminho que nem
   consultou o identificador"*); há só `console.error` + `processing_error`. No modo `identifier`
   o receptor **chama** `logOrgUnresolved`. Isso estava listado como risco e é benefício.

**Efeito colateral que eu nomeio e o gate não citou:** nesse mesmo ramo novo a resposta ao proxy
`api/lead.js` passa de **500** (`{ok:false}`) para **200**, então a retentativa do proxy deixa de
acontecer. **Não muda o desfecho** — a ambiguidade é determinística e a retentativa também
falharia — mas muda o que o formulário devolve e o que o log do proxy registra. Fica dito para não
ser lido como regressão do corte.

**Runbook §4 ganhou a subseção 4.1** com os três pontos e o efeito colateral; a minha própria
"Recomendação" na seção Task 3.2 acima foi corrigida no mesmo sentido.

**O texto da AC4 é do @po — prescrito, não aplicado.** Substituição exata do último marcador:

- **DE:** *"**Se o volume for material, isso vira story própria da Onda 3 — não um item desta.**"*
- **PARA:** *"O volume medido é baixo mas **não é zero** (5 em 7 dias), e **quem perde os leads é a
  Trifold**: `resolveSoleOrg` devolve `"ambigua"` sem distinguir de quem é o lead. O gatilho é a
  **segunda org ativa** — isto é, o **onboarding**, não o flip. Portanto fechar `landing_page` é
  story própria e **co-requisito do primeiro onboarding**, não item genérico da Onda 3. Registrar
  também que, em `both`/`legacy`, essa perda é **silenciosa** (`logOrgUnresolved` não é chamado) e
  que o corte a torna **mais observável** — é um ganho do corte, não um risco dele."*

### Registros que o gate pediu e não bloqueiam

**QA-900-55-5 — a classe tem TRÊS árbitros, e o terceiro é inalcançável.**
`app/api/telegram/webhook/route.ts` carrega o ternário idêntico
(`novo.status === "nao_resolvida" ? novo.motivo : "nenhuma_correspondencia"`), no mesmo formato
`both` com legado nulo. Reconferido por mim no código: `legacyResolveFirstOrg` é
`organizations.select("id").limit(1).single()` **sem filtro de `is_active`** — só devolve `null`
com **0** organizações; e com 0 organizações `resolveSoleOrg` (que filtra `is_active`) devolve
`nenhuma_correspondencia`, **nunca** `resolvida`. Logo o ramo mentiroso é **inalcançável** ali, e é
por isso que nenhuma mutação o acendeu. Nada está errado hoje. **A prova pertence à story:** quem
der o próximo `grep "nenhuma_correspondencia"` encontra uma base aparentemente inconsistente e
nenhuma explicação. `landing_page` não entra na classe — o árbitro legado dele não tem `else` e
não chama `logOrgUnresolved`.

**QA-900-55-7 — números de M3/M3r corrigidos, e eu os REMEDI em vez de copiar.**
Reapliquei as duas mutações nesta árvore, com `npx tsc --noEmit -p packages/web/tsconfig.json`
rc=0 **antes** de contar o vermelho, e a suíte **inteira** (296 arquivos), `Test timed out` = 0 nas
duas:

| # | mutação | `tsc` | vermelho medido por mim | eu havia declarado |
|---|---|---|---|---|
| M3 | `nivelDoMotivo` sempre `warn` | rc=0 | **3 testes / 3 arquivos** | 2 (2 arq.) ❌ |
| M3r | `nivelDoMotivo` sempre `error` | rc=0 | **8 testes / 3 arquivos** | 6 ❌ |

Forma da mutação: `? "warn" : "warn"` e `? "error" : "error"` — mantém o parâmetro em uso, então é
mutação de **comportamento** e não um vermelho de compilador disfarçado de carrasco.

Conjuntos de morte, por nome, **disjuntos** — que é o que prova a discriminação de direção, não a
contagem:

- **M3 {3}:** `2 empresas ativas + telefone conhecido ⇒ motivo … em error`;
  `page_id conhecido ⇒ motivo … em error`; `motivo … sobe o evento para error`.
- **M3r {8}:** `nenhuma_correspondencia continua em warn`; `ambigua continua em warn`;
  `erro_consulta continua em warn`; `page_id SEM linha correspondente ⇒ nenhuma_correspondencia em
  warn`; `resolver novo ambigua ⇒ o motivo dele é repassado`; `2 empresas + telefone DESCONHECIDO
  ⇒ volta a nenhuma_correspondencia em warn`; `NENHUMA config ativa ⇒ nenhuma_correspondencia em
  warn`; e **`é AGUARDADO (logEventOnce), nunca fire-and-forget`**.

O último é **PRÉ-EXISTENTE** (Story 87-6) e assere `level` de carona — **colinear, inofensivo, e
nomeado aqui para não ser lido como regressão na próxima rodada**, como o @qa pediu.

**QA-900-55-4 e QA-900-55-8 — aceitos como registrados.** (4) Em `both` com 2 empresas e telefone
desconhecido o motivo ainda é `nenhuma_correspondencia` @ `warn`, e o teste consagra isso: é
correto **sobre o caminho novo** e mudo sobre a emergência sistêmica; o `PGRST116` de QA-900-55-3
cobriria em uma linha. (8) O fake do `meta_ads` **planta** a ambiguidade
(`{data:null, error:{code:"PGRST116"}}` injetado) em vez de produzi-la com 2 linhas num terminal
fiel, como o do `whatsapp` faz — logo **não existe análogo do M4 daquele lado**. As duas ficam como
dívida barata **medida**, com o custo dito: fechar (8) é trocar a injeção por 2 linhas na fila do
fake fiel, ~10 linhas de teste, e daria um M4 do lado `meta_ads`.

### Réguas da rodada 2

| régua | resultado |
|---|---|
| `npx tsc --noEmit -p packages/web/tsconfig.json` (após a edição de comentário) | **rc=0** |
| `pnpm test` (296 arquivos) | **296 passed / 3900 passed + 6 xfail / rc=0**, `Test timed out` = 0 |
| `pnpm turbo lint --force` | **rc=0 — 8 successful, 0 errors, 30 warnings**, nenhum nos arquivos da story (mesmo número que o gate mediu; são pré-existentes e alheios) |
| `pnpm turbo type-check --force` | **rc=0 — 8 successful, 8 total** |
| produção, remedida por mim 2026-08-31T15:19Z (Management API, só `SELECT` agregado) | `whatsapp` **115/115 `divergiu=false` — o `n ≥ 100` da AC3 está BATIDO**; `meta_ads` 3/3 `divergiu=null`; `WEBHOOK_ORG_UNRESOLVED` **0 de sempre** |

**Árvore quieta:** as três rodadas da suíte (baseline, M3, M3r) foram sequenciais, sem `lint` em
paralelo e sem outro agente escrevendo — a contramedida da correção de causa acima.

## Rodada 3 — QA-900-55-8, pós-gate PASS (2026-08-31)

O gate da rodada 2 saiu **PASS** e deixou uma concern `LOW` que não bloqueia nada: **a AC3
justifica por que `n ≥ 3`, mas não diz o que fazer com `n = 2`.** Com a janela da rodada 2, o
`whatsapp` sai da frente (batido **sem** janela) e o `meta_ads` vira a restrição que manda na data
do corte; ao volume real do receptor (≈ 0,1 evento/h) a janela leva **~30h** para encher. Se
chegarem 2, o operador cai na mesma pressão que já produziu régua ruim nesta story — a contagem de
linhas da AC2, que ficava **verde exatamente sob o defeito** que ela existia para pegar.

**Escrevi no RUNBOOK (§3.2 nova), não na AC — e a escolha é deliberada.** Três razões:

1. **A frase não é critério novo, é o critério existente dito por extenso.** `n ≥ 3` já implica que
   `n ∈ {0,1,2}` não satisfaz; a janela já está ancorada na `mark_connected`. O que faltava era a
   **ação** — esperar, não baixar o limiar, não recuar a âncora —, e ação de operador em janela de
   corte é matéria de runbook.
2. **AC é autoridade do `@po`, não minha.** A mesma linha que respeitei na rodada 2, quando
   prescrevi os textos de AC4/AC7 em vez de editá-los.
3. **§3 do runbook é a superfície que o `@devops` de fato lê no dia do corte.** A tabela de
   critério já mora lá; a régua e a instrução de uso ficam no mesmo lugar em vez de uma remissão.

**Se o `@po` julgar que isto é AC**, o texto está pronto para ser promovido sem reescrita — está em
`§3.2` sob o título `O que fazer com n = 0, 1 ou 2`, e a AC3 pode apontar para ele ou absorvê-lo.
**Não movi por conta própria.**

**Zero mudança de comportamento e zero código:** um único arquivo `.md` editado, nenhum arquivo de
`packages/` tocado nesta rodada. Nenhuma AC, nenhuma seção `Acceptance Criteria`, nenhum número de
medição alterado.

> **Discrepância registrada, não corrigida:** o runbook §3 diz `whatsapp` **115/115** (minha
> remedição de 15:19Z) e o gate da rodada 2 diz **120/120** (remedição posterior do `@qa`). Os dois
> satisfazem `n ≥ 100` e o veredito não muda. **Não atualizei o número porque não foi eu que o
> mediu** — número de produção em documento operacional tem de vir com o dono da medição. Quem
> executar a Task 3.1 remede na hora, que é o que a AC3 manda de qualquer forma.

### File List

| arquivo | mudança |
|---|---|
| `packages/web/src/lib/tenancy/webhook-org.ts` | motivo `legado_ambiguo_novo_resolveu` + `nivelDoMotivo` (nível derivado do motivo). **Rodada 2:** só comentário — justificativa falsa do nível derivado corrigida, e os 4 elos de QA-900-55-1 nomeados no arquivo ("consultável", não "audível"). `tsc` rc=0 |
| `packages/web/src/app/api/webhook/whatsapp/route.ts` | ramo `both`: `else if (novo.status === "resolvida")` no lugar do ternário mentiroso |
| `packages/web/src/lib/meta/process-lead.ts` | mesmo ramo, receptor `meta_ads` |
| `packages/web/src/lib/tenancy/webhook-org.test.ts` | +5 testes (nível `error` no motivo novo; `warn` nos 3 outros; `processing_error`) |
| `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` | terminais singulares passam a usar o fake fiel da 900-24; +6 testes (carrasco da AC1 + o corte com 2 empresas) |
| `packages/web/src/lib/meta/process-lead.test.ts` | +3 testes (mesmo ramo no árbitro do `meta_ads`) |
| `docs/runbooks/900-55-corte-do-roteamento-por-identificador.md` | **novo** — ordem do onboarding, passo do `page_id`, corte, rollback. **Rodada 2:** §1 reescrita + §1.1/§1.2 (registro consultável, não alarme; o que o operador faz para ver), §2 com a procedência da autorização, §4.1 (a perda é da Trifold, começa no onboarding, e o corte a torna mais observável), §6 com a origem da detecção, números remedidos. **Pós-gate (rodada 3):** §3.2 nova — o que fazer com `n = 0..2` na janela do `meta_ads` (QA-900-55-8). **Nenhuma AC tocada** |


## QA Results

### Gate: **CONCERNS** — @qa (Quinn), 2026-08-31, árvore não commitada sobre `a7cbfc35`
**Arquivo:** `docs/qa/gates/900.55-corte-do-roteamento-por-identificador-em-producao.yml`

**A AC1 está fechada e provada. O que segura o gate não é o código — é o que o @devops vai ler a
seguir.** As Tasks 2/3.1/4 não estão liberadas.

#### Réguas, medidas por mim (não herdadas do Dev Agent Record)
| régua | resultado |
|---|---|
| `pnpm test` | **296 arquivos / 3900 passed / 6 xfail / rc=0** |
| baseline (mesma árvore, 6 arquivos em `git stash`) | **296 / 3886 / 6** ⇒ **+14, xfail inalterado** |
| `turbo lint --force` | 0 erros, 30 warnings — **nenhum** nos 6 arquivos tocados |
| `turbo type-check --force` | 8/8 |
| `pnpm --filter @trifold/web build` | rc=0 |

#### As 6 mutações — reproduzidas, `tsc --noEmit` rc=0 medido ANTES de cada vermelho
| # | `tsc` | vermelho **medido** | declarado |
|---|---|---|---|
| M1 | rc=0 | 1 teste | 1 ✅ |
| M2 | rc=0 | 2 testes | 2 ✅ |
| M3 | rc=0 | **3 testes / 3 arquivos** | 2 (2 arq.) ⚠️ |
| M3r | rc=0 | **8 testes / 3 arquivos** | 6 ⚠️ |
| M4 | rc=0 | 2 testes | 2 ✅ |
| M5 | rc=0 | 1 teste | 1 ✅ |
| M6 | rc=0 | 4 testes | 4 ✅ |

**O que prova de verdade não é a contagem — é a DISJUNÇÃO dos conjuntos de morte nos três pares de
sentido oposto** (M1×M2, M3×M3r, M5×M6): nenhum teste morto por um dos lados morre pelo outro. O
teste discrimina a direção, não apenas reage.

**O instrumento é carga, confirmado.** `resultadoMaybeSingle` devolve `PGRST116`/406/`data:null`
com 2+ linhas — o mecanismo exato do defeito. Sob o fake antigo (M4) a AC1 volta a ser
**insatisfazível**. A ordem em que o @dev fez (instrumento primeiro) é a certa.

#### As duas correções à story — auditadas no OBJETO VIVO, ambas CORRETAS
- **(1) A AC2 precisa de DUAS chamadas.** `pg_get_functiondef` da função viva em produção:
  `_org_integration_write_secret` faz só `SET config, secret_ref, updated_at` — **nunca `status`**
  (o `'connected'` que aparece na definição está em COMENTÁRIO; um `ILIKE` sobre a definição
  inteira dá falso positivo, e o meu deu). `_org_integration_mark_connected` carrega o `P0015`.
  `resolveOrgByMetaPage:221` tem `.eq("status","connected")`, e o gate já estava escrito no
  cabeçalho desde a 900-51. **A story não o incorporou — o @po precisa corrigir AC2 e Task 2.2.**
- **(2) `page_id` presente com valor nulo.** Medido: `config ? 'page_id'` = true,
  `length(coalesce(config->>'page_id','')) = 0`, `status='disconnected'`. Placeholder de seed.

#### Concerns (detalhe completo no arquivo do gate)
- **QA-900-55-1 · MEDIUM — o nível `error` não tem quem o entregue.** Único leitor de
  `level='error'` é `cron/nicole-health/route.ts:186`, que filtra por `classificarErroIA(message)`
  e **descarta** esta mensagem (`if (!tipo) continue`); nenhuma das 8 assinaturas de
  `lib/alerts/erro-ia.ts` casa. Ninguém seleciona `WEBHOOK_ORG_UNRESOLVED` por `event_type`. Sem
  supressão por dedup (o índice único é parcial em `dedupe_key IS NOT NULL`, nunca passado aqui).
  O `error` compra `console.error` no log da Vercel e o filtro manual `?level=error`. **É evento
  ESCRITO, não alerta ENTREGUE** — e o runbook §1 o chama de "alarme", com a AC7 apoiada nisso.
  **Corrigir:** ligar a entrega (canal já existe: `lib/alerts/admin-whatsapp.ts`) **ou** reescrever
  §1/AC7 para dizer o que existe. A própria AC7 diz "não fingir que isto é uma trava".
- **QA-900-55-2 · MEDIUM — BLOQUEIA A TASK 2.** O runbook §2 afirma *"Decisão do dono do produto
  (registrada 2026-08-31): gravar o token real da Página… Não criar a variante"*, enquanto a story
  mantém a pergunta ABERTA e a **Task 2.1 desmarcada**. `grep -rn "token real da Página" docs/`
  devolve **1 ocorrência: a própria linha do runbook**. Isso autoriza um token real da Meta a
  entrar no Vault de produção pela primeira vez. **Ou citar a procedência, ou reverter para
  "pergunta aberta".**
- **QA-900-55-6 · MEDIUM — a AC4 não basta como está.** A perda de `landing_page` cai sobre a
  **Trifold** (`resolveSoleOrg` devolve `ambigua` com 2 orgs, para todos), e começa no onboarding,
  não no flip. Duas correções: (a) em `both`/`legacy` a perda é **silenciosa** —
  `logOrgUnresolved` não é chamado (`landing-page/route.ts:266-269`) — e o corte a torna MAIS
  observável, ponto a favor que a story entrega de graça; (b) a story de `landing_page` precisa ser
  **co-requisito do primeiro onboarding**, não da "Onda 3" genérica.

#### Observações (não bloqueiam)
- **QA-900-55-3** — a ressalva do modo `legacy` é ampla demais para o `whatsapp`:
  `legacyResolveActiveConfig` usa `.maybeSingle()`, que **só erra com 2+ linhas**, então
  `error?.code === "PGRST116"` É uma verdade barata e exata ali. Vale para `meta_ads`
  (`.single()`, que confunde 0 com 2+), não para `whatsapp`. **Concordo em não cobrir** (produção
  roda `both`, o corte vai a `identifier`, e o rollback volta a `both`, nunca a `legacy`) —
  discordo do motivo escrito.
- **QA-900-55-4** — em `both`, 2 empresas + telefone desconhecido ainda loga
  `nenhuma_correspondencia` @ `warn`, e o teste consagra isso. O `PGRST116` de cima cobriria.
- **QA-900-55-5** — a classe tem **3** árbitros: `telegram/webhook/route.ts:388-389` carrega o
  ternário idêntico. **Provei que é inalcançável na direção mentirosa** (`legacyResolveFirstOrg` é
  `organizations.limit(1).single()` sem filtro de `is_active`: só devolve `null` com 0 orgs, e com
  0 orgs `resolveSoleOrg` nunca devolve `resolvida`). Nada errado hoje — mas a prova pertence à
  story.
- **QA-900-55-7** — M3/M3r subdeclarados (medidos 3 e 8, declarados 2 e 6). Direção segura.
- **QA-900-55-8** — o fake do `meta_ads` planta a ambiguidade em vez de produzi-la; não há análogo
  do M4 daquele lado.
- **QA-900-55-9** — a árvore carrega trabalho não commitado de outras 3 frentes. Commit seletivo.

#### A nota honesta sobre os timeouts — verificada, e a causa declarada está errada
Rodei a suíte **10 vezes**: 1 sozinha, 1 baseline, **1 deliberadamente concorrente com
`turbo lint --force`**, 7 de mutação. `grep -c "Test timed out"` = **0 nas dez**; a concorrente saiu
296/3900/rc=0 com o lint fazendo 8 successful em 36,6s ao lado. **Não reproduzi a falha nem no
cenário culpado.** Mas achei um candidato melhor: **há outra sessão de agente escrevendo NESTA
árvore** — entre dois comandos meus, `packages/web/src/lib/tenancy/__po_probe_42a.test.ts` (sonda
do @po para a 900-42a, um `*.test.ts` **dentro do `include` do vitest**, que assere um vermelho)
apareceu e depois sumiu; eu não o criei nem o apaguei. Um arquivo de teste que nasce e morre no
meio da rodada explica timeout e contagem instável melhor que `turbo lint`. **Não é defeito desta
story** — mas registrar a causa errada é como o próximo timeout é dispensado.

#### Trifold não muda de comportamento — provado por 4 caminhos
(1) com 1 org o ramo acrescentado é **inalcançável**; (2) o `else` reescrito é provavelmente
equivalente por narrowing (o tipo tem 2 variantes; os dois lados do ternário antigo colapsam);
(3) `nivelDoMotivo` devolve `warn` para os 3 motivos antigos — o mesmo literal de antes;
(4) 3886 → 3900 com **zero** teste pré-existente virando vermelho, mais o teste explícito
*"com UMA empresa ativa nada muda"*.

#### Segurança
Limpo. Nenhuma superfície nova: `filtrarIdentificador` (allowlist) inalterado,
`quantidadeEncontrada = 1` é literal, `nivelDoMotivo` não é exportada, nenhuma migration/GRANT/
segredo tocado. Toda medição de produção foi `SELECT` agregado via Management API com
`User-Agent` — sem service-role, sem script na árvore, sem conteúdo de conversa. **O corte NÃO foi
executado.** CodeRabbit não rodou (config aponta para WSL; host é `darwin`) — declarado, não
omitido.

#### Decisão
- **Merge da AC1: LIBERADO.**
- **Task 2: BLOQUEADA** até QA-900-55-2 fechar.
- **Task 4 (o flip): BLOQUEADA** até a Task 2 fechar, a AC3 bater para `meta_ads`, e
  QA-900-55-1/-6 terem resposta.
- Produção remedida 2026-08-31T14:52Z: `whatsapp` **115/115 `divergiu=false` — já cruzou o
  `n ≥ 100` da AC3**; `meta_ads` 3/3 `divergiu=null`; `platform_audit_log` 0;
  `WEBHOOK_ORG_UNRESOLVED` 7d = 0.

— Quinn, guardião da qualidade 🛡️

---

### Rodada 2 — @qa (Quinn), 2026-08-31 · Gate: **CONCERNS → PASS**

**Gate atualizado (não emiti gate novo):** `docs/qa/gates/900.55-corte-do-roteamento-por-identificador-em-producao.yml`, seção `delta_rodada_2` no fim do arquivo.

**Escopo:** só o que mudou. Não refiz as 6 mutações nem o baseline por stash — estão medidas na rodada 1 e nada as invalidou. Produção **só leitura**, agregados e metadados, via Management API com `User-Agent`. **Sem service-role. Sem arquivo temporário na árvore. Não executei o corte.**

#### Comportamento não mudou — verificado, não presumido
Extraí do `git diff` dos 3 arquivos de produção **só as linhas não-comentário**: são **exatamente** as da rodada 1 (`legado_ambiguo_novo_resolveu`, `nivelDoMotivo`, `level: nivel`, os dois `else if (novo.status === "resolvida")`). **Zero lógica nova.** Corroboração numérica: a suíte hoje dá **3918 + 6 xfail**, e a 900-42a (que revisei em paralelo) contribui **+18** verificados por arquivo — 3918 − 18 = **3900**, idêntico ao que medi na rodada 1. **A rodada 2 não acrescentou nem removeu um teste.** `type-check` rc=0, `lint --force` rc=0.

#### As três concerns
- **QA-900-55-2 — FECHADA.** Runbook §2 tem seção própria de procedência: pergunta com **três** alternativas nomeando o custo de cada uma, resposta **"Confirmo, pode gravar"**, 2026-08-31. **Os dois estados ficaram distinguíveis:** a atribuição errada anterior está preservada num bloco marcado *"registrada, não apagada"*, dizendo que a decisão fora do **coordenador**, e a autorização nova é **posterior ao bloqueio** e datada. Um auditor futuro reconstrói como o consentimento chegou — que é o que eu não conseguia fazer na rodada 1. **Task 2 DESBLOQUEADA.**
- **QA-900-55-1 — FECHADA pela saída (b), e o quarto elo do @dev CONFIRMADO.** Ele derruba a concessão que **o meu próprio gate** fazia (*"sobra o filtro `?level=error`, basta um humano ir olhar"*). **Nem isso:** `api/system-events/route.ts:69` faz `.eq("org_id", user.orgId)`, `webhook-org.ts:465` grava `org_id: null`, e `= <uuid>` nunca casa `NULL`. Li a RPC no **objeto vivo de produção**: `get_system_events_summary` traz `WHERE org_id = p_org_id` **duas vezes** em linhas não-comentário. Remedi a medida de apoio: **35 eventos `error` em 30 dias, 22 com `org_id` nulo** — exatamente 22/35. Não é peculiaridade deste evento: **63% dos `error` já são invisíveis no painel.** E o baseline de zero **não é vacuidade**: `WEBHOOK_ORG_UNRESOLVED` = 0 de sempre, mas o irmão `WEBHOOK_ORG_RESOLVED` = **123 linhas**, a última há minutos — o instrumento escreve.
- **QA-900-55-6 — FECHADA.** AC4 reenquadrada com as três correções + o efeito colateral 500→200 que eu não citei. **Entrada própria no backlog**, P1 **com gatilho, não com data**.

#### O achado novo do @po — **PROCEDE, medido agora em produção**
`WEBHOOK_ORG_RESOLVED` sem recorte de tempo: `meta_ads` **3 linhas, `divergiu=null` em 3/3** (0 `false`, 0 `true`); `whatsapp` **120/120 `false`** (0 `true`, 0 `null`). As 3 linhas `null` são **permanentes** ⇒ sem janela, "100% `false`" para `meta_ads` sai 0/3 hoje e no máximo n/(n+3) depois — **nunca 100%**. A AC era insatisfazível.

**A janela NÃO vira absolvição — três razões, todas medidas:**
1. Ela exclui **só linhas `null`**, e a AC define `null` como não-evidência **nos dois sentidos**. Não há um `false` nem um `true` de `meta_ads` para recortar.
2. O veto de `divergiu='true'` é avaliado **sem janela**, sobre o histórico inteiro. Hoje: **0 `true` em 123 linhas, desde sempre.**
3. **A prova que fecha:** simulei a janela ancorada em `now()` — `created_at > now()` devolve **0 linhas nos dois receptores**. **A janela não concede: ela ZERA o contador e exige prova nova.** E o erro de âncora é **monotonicamente seguro** — ancorar tarde encolhe a janela (mais difícil bater `n ≥ 3`); ancorar cedo readmite os `null` (o 100% falha). **Não existe âncora que torne o critério mais fácil que a verdade.**

**A autocorreção dele confere numericamente:** `whatsapp` está em **120/120** (era 115 às 15:19Z), ~5,5 eventos/h. Com janela o contador vai a 0 e rebater `n ≥ 100` leva **~18h** — "~um dia" é o número certo, e o critério sem janela é o **mais estrito**. A primeira versão era erro real, corrigido antes de custar o dia.

#### A régua que ele derrubou — **CONCORDO, e a defeituosa era a MINHA**
Li os **objetos vivos em produção**, por linha, com `l !~ '^\s*--'` (nunca `ILIKE` no blob):
- `_org_integration_write_secret`: `UPDATE org_integrations SET config = p_config, secret_ref = v_secret_ref, updated_at = now()` — **`status` não aparece no `SET`**. Registra `org_integration.secret_write`.
- `_org_integration_mark_connected`: `UPDATE org_integrations SET status = 'connected', ...`, registra `org_integration.marked_connected`, e **RAISE** sem `secret_ref`.

Duas chamadas de `write_secret` ⇒ **2 linhas na trilha** e `status` ainda `disconnected` ⇒ `resolveOrgByMetaPage` (que exige `connected`) não resolve ⇒ a AC3 nunca fecha. **`platform_audit_log >= 2` sai VERDE exatamente sob o defeito.** As **duas ações nomeadas** são disjuntas por construção — nenhuma repetição de uma cobre a ausência da outra.

**A terceira perna, que quase ninguém pega, e eles pegaram:** `config->>'page_id'` (**valor**), não `config ? 'page_id'` (**chave**). Medido agora: a linha `meta_ads` **já tem a chave**, com valor JSON `null` (`jsonb_typeof(config->'page_id')='null'`, `length(coalesce(config->>'page_id','')) = 0`, e `page_id` é a única chave). Uma régua com `?` estaria **VERDE hoje, antes de qualquer escrita.** O runbook §2 já registra exatamente isso.

#### Baselines de produção remedidos por mim
`platform_audit_log` **0** · `WEBHOOK_ORG_UNRESOLVED` **0 de sempre** · `WEBHOOK_ORG_RESOLVED` **123** (0 `true`) · orgs ativas **1** · `whatsapp_config` ativas **1** · `org_integrations` 6 linhas, **0 com `secret_ref`**, todas `disconnected` · `system_events level='error'` 30d **35**, com `org_id` nulo **22**.

#### Observação nova (LOW, não bloqueia)
**QA-900-55-8 — com a janela, o `n ≥ 3` do `meta_ads` vira a restrição que manda na data do corte.** A janela começa em 0; o `whatsapp` já está batido sem janela, então o `meta_ads` amarra. Ao volume real (**3 eventos em ~30h ≈ 0,1/h**), encher a janela custa **~30h de tráfego** após a `mark_connected`. Se chegarem **2**, o operador cai na mesma pressão que produziu a régua de contar linhas. A AC justifica *por que 3* com medição, mas **não diz o que fazer com 2**.
**Sugestão (uma frase, na AC3 ou no runbook §3):** *"com `n = 0..2` dentro da janela o critério **não** está satisfeito — esperar, nunca baixar o limiar nem reabrir a janela para trás. Se o receptor não produzir 3 eventos, investigar por que o volume caiu."*

#### Decisão
**PASS.** Task 2 **desbloqueada**. Ordem liberada: **Task 2** (as duas chamadas, conferindo as duas ações nomeadas + `status='connected'` + `secret_ref` + `page_id` de 15 dígitos) → registrar o **timestamp UTC da `mark_connected`** (âncora da janela) → **Task 3.1** → **Task 4**.

