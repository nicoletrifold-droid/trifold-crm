# Story 900-51 — Painel Self-Service de Integrações por Empresa (antecipação de Onda 7)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** antecipação explícita de conteúdo da Onda 7 (`§1165-1198`: `900-47`/`900-48`/`900-49`),
  por pedido direto do dono do produto (2026-08-29/30). Ver v0.1/v0.2 para o texto completo do
  pedido — inalterado.
- **Story:** 900-51 — sem colisão de número (ver "Numeração", inalterada desde v0.1).
- **Status:** **Ready for Review** — implementada pelo `@dev` em 2026-08-30 (ver Dev Agent Record: 3 divergências declaradas, 1 achado de colisão R1×R7 corrigido, 4 coisas que não consegui provar). Antes disso: 🟢 **GO condicional do `@po`** em 2026-08-30 (rodada 3, 9,0/10 —
  `docs/qa/po-validation-900-51.md`). **N1 e N2(a) fechados e verificados executando:** com
  `REVOKE UPDATE, DELETE, TRUNCATE` + os três triggers, `sr_ins=true` / `sr_upd=false` /
  `sr_del=false` / `sr_trunc=false`, e o `TRUNCATE` que apagava 2 linhas sem exceção agora levanta
  `P0020` até para o dono; `write_secret(..., '')` **e** `(..., '   ')` levantam `P0017`.
  **3 condições antes de implementar:**
  **C1 (antes da Task 1)** — o `page_id` self-service é risco cross-tenant e precisa ser fechado ou
  **escalado ao dono do produto**, não aceito dentro da story: medi que o guard `^[0-9]+$` barra o
  meu exemplo e **não a classe** (`132027046650861`, a Página real da Trifold, grava e promove a
  `connected`), e que `write_secret_as_org` + `mark_connected_as_org` — as duas com
  `GRANT EXECUTE TO authenticated` — completam o sequestro mesmo com o filtro da AC10. Fecho
  sugerido, no idioma da própria story: `page_id` de `meta_ads` só gravável por `_as_platform`
  (`p_actor_type <> 'platform_admin'` ⇒ `P0019`) — não custa o objetivo de produto, porque o
  **token** continua trocável pelo cliente.
  **Resolução de C1 (dono do produto, 2026-08-30 — não é decisão do `@sm` nem do `@po`):** o fecho
  `P0019` sugerido acima foi **recusado**. Decisão tomada, nas palavras que o `@po` levou:
  *"o cliente também grava o `page_id`, com auditoria"* — risco cross-tenant **aceito
  conscientemente**, não escondido. A contrapartida negociada: como a prevenção foi recusada, a
  detecção vira obrigatória (`AC11`, nova nesta revisão — alerta em escrita por `org_admin` +
  alerta em `page_id` que muda de org, os dois usando o `actor_type` já congelado). Ver Context
  (seção "C1") para o registro completo.
  **C2 (antes da Task 12)** — a verificação de modo da AC10 precisa de comando executável, dos
  **três** modos (`legacy` está fora hoje) e da **regra de decisão**, não só da medição: medido em
  `webhook-org.ts:185-201` que sem env var o default é `both`, e medido que **toda linha `meta_ads`
  está `disconnected`** — logo, em `identifier`, aplicar a Task 12 faria `resolveOrgByMetaPage`
  deixar de resolver qualquer org.
  **C3 (antes da Task 12)** — nomear os dois efeitos que a AC10 introduz: credencial em `error`
  passa a **perder lead** em vez de só quebrar sync; e o índice `org_integrations_meta_page_ativo`
  **não filtra `status`**, então um `page_id` ocupado por outra org (mesmo `disconnected`) impede o
  dono legítimo de configurar, com `23505` opaco no painel (medido).
  Exposição hoje: **zero** — em produção o modo é `both` por default, onde o legado decide o
  roteamento e nada rota por `page_id`.
- **Priority:** P1.
- **Complexity:** G — subiu de novo entre v0.2 e v0.3: a v0.2 tinha a arquitetura certa (duas
  superfícies, componente compartilhado, RPC com dois pontos de entrada) mas **enforced as
  propriedades anunciadas na camada errada** (rota Next, não a RPC — que é a superfície
  realmente alcançável por `authenticated`). v0.3 move 4 propriedades para dentro do banco:
  allowlist de provider, separação escrita/promoção de status, `ROW_COUNT` na escrita,
  append-only genuíno contra `BYPASSRLS`.
- **Depends on:** as da v0.1/v0.2 (`900-21b` PR #526, `900-22b` PR #522 já mergeada, Vault
  confirmado) **mais uma nova, escopada à Camada B de teste:** **`900-25`** (não mergeada) —
  entrega `vitest.tenancy.config.ts`, o carregamento de `.env.teste` e o guard N2 (env presente +
  var ausente ⇒ falha, não skip). Esta story **reusa** esse aparato para os testes de integração
  contra `trifold-crm-dev`, em vez de duplicá-lo (duplicar criaria uma segunda fonte de verdade do
  próprio harness de teste). **Não é dependência de código de produção** — a migration `248`, as
  RPCs e as rotas não importam nada da `900-25`. É dependência só da Camada B.
  **Ordem de aplicação em `trifold-crm-dev`:** a `248` não deve ser aplicada **antes** de a
  `900-25` v0.3 estar mergeada (ela deriva a contagem de FKs bloqueantes de `pg_constraint` em
  runtime — a `248` acrescenta a 5ª FK para `organizations`, e só a v0.3 se cura sozinha disso).
  Se a ordem inverter por qualquer razão operacional, avisar o `@qa` da `900-25` no mesmo dia.
  **`900-24` (achado N2/AC10, nesta rodada):** esta story passa a modificar `webhook-org.ts`
  (`resolveOrgByMetaPage`), arquivo entregue pela `900-24` — não por acaso: a própria `900-24`
  registrou por escrito que a decisão do filtro de `status` "volta à mesa quando o painel
  existir". Sem acoplamento de código além desse arquivo (nenhum outro import cruzado); a ordem
  de merge continua a mesma já estabelecida (`900-24` antes desta story, que aqui é consumidora,
  não autora, de `webhook-org.ts`).

### Executor Assignment
- **Executor:** @dev (Dex).
- **Executor (migration):** @data-engineer (Dara) — migration `248`, agora com trigger de
  imutabilidade (incluindo `TRUNCATE`), `GET DIAGNOSTICS`, allowlist positiva de provider,
  guards de conteúdo (N2a/N2b) e separação escrita/promoção de status dentro do PL/pgSQL.
- **Quality Gate:** @architect (Aria).
- **Quality Gate Tools:** `[code_review, migration_review, security_review]`.

---

## Numeração — colisão medida (mesma disciplina da `900-25`)
Inalterado desde v0.1/v0.2 — `900-51`, migration `248` (teto remedido de novo em 2026-08-30,
inalterado: `244_ 246_ 247_`, `245` é lacuna pré-existente). **Ver a nota de ordem de aplicação em
Metadata acima** — a numeração da migration não mudou, mas a ORDEM em que ela entra em
`trifold-crm-dev` relativa à `900-25` agora importa (achado do `@po`, R7 do parecer).

---

## User Story
Inalterada desde v0.2 — dono do produto quer as duas superfícies (`/platform` resolve quando o
cliente trava; `/dashboard` deixa o cliente trocar uma chave vencida sozinho).

---

## Context

_(As seções "O pedido", schema de `org_integrations`, "As duas telas — decisão do dono do
produto", "Achado maior: `/dashboard/configuracoes/integracoes` já existe", "Duas telas, um
componente", "O cliente vê a trilha", "WABA própria por cliente" e a tabela "Como validar a
credencial" seguem como na v0.2 **em mérito** — reproduzidas/citadas onde a correção do `@po`
exige mudança de texto, e resumidas onde não muda nada.)_

### Correção de contagem que se propagava pela story (m1 do parecer)
A v0.2 dizia "4 tiles" em um lugar e "5, não 4" em outro, sem nunca resolver a contradição.
**Fixado: 5 tiles dentro do `<IntegrationsPanel />`** — `whatsapp` (grava em `whatsapp_config`),
`meta_ads` (rotulado "Meta — Recebimento de Leads" na UI, grava em `org_integrations`),
`meta_capi`, `sienge`, `telegram`. `google` **não é um 6º tile do painel novo** — continua
vivendo no card "Google Forms" já existente em `/dashboard/configuracoes/integracoes` (inalterado
por esta story) e, do lado `/platform`, aparece como uma linha somente-leitura **fora** do
componente compartilhado (ver AC4).

### A trilha nasce forjável — medido pelo `@po`, corrigido aqui (R1)
A v0.2 declarava `platform_audit_log` "append-only" só por ausência de policy de UPDATE/DELETE.
Medido pelo `@po` contra `trifold-crm-dev`: `service_role.rolbypassrls = true` — RLS não vale
nada contra um role que a **pula por definição**, e o grant padrão do Supabase já dá
UPDATE/DELETE a `service_role` numa tabela nova (confirmado numa tabela existente:
`has_table_privilege('service_role','system_events','DELETE') = true`). Como as rotas de
`/platform` desta story usam `createAdminClient()` (= `service_role`), a trilha estava
reescrevível e apagável exatamente pelo ator que ela existe para responsabilizar.

**Conserto, medido pelo `@po` em transação com `ROLLBACK`:** `REVOKE UPDATE, DELETE ON
platform_audit_log FROM service_role, authenticated, anon, PUBLIC` derruba `sr_upd`/`sr_del` para
`false` e preserva `sr_ins = true` — `BYPASSRLS` pula RLS, não pula `GRANT`. **Mais um trigger**
`BEFORE UPDATE OR DELETE ... RAISE EXCEPTION`, porque o dono da tabela (`postgres`) ainda passa
pelo `REVOKE`, e o epic é explícito que append-only é atributo de **nascimento**, não de refino —
esta é a migration em que ele nasce (AC2).

### O 14º instrumento cego — a rota reporta "salvo" tendo escrito zero linhas (R2)
O `@po` rodou o helper da v0.2 em PL/pgSQL real contra o cenário "não existe linha em
`org_integrations` para `(org_id, provider)`" (hoje latente — a `246` semeia as 6 linhas por org —
mas não ausente: basta um provider novo, uma linha apagada à mão, ou uma org restaurada de backup
parcial):

```
sem excecao | v_row_id=NULL | v_had=NULL | linhas_afetadas=0
```

`SELECT ... INTO` **não levanta** quando não casa (só `INTO STRICT` levanta) — `v_row_id` fica
`NULL`; `vault.create_secret` **já rodou** e criou o segredo (órfão); `UPDATE ... WHERE id = NULL`
afeta 0 linhas, sem erro; `platform_audit` grava uma linha de **sucesso**; a rota devolve `200`.
**O painel afirma "salvo com sucesso" e mostra "Não conectado" na mesma sessão.** E os dois
carrascos que a v0.2 já tinha (badge bidirecional, UUID plantado) ficam **verdes** nesse cenário —
o badge porque espelha corretamente um `secret_ref` que continua `NULL`; o UUID porque está no
Vault e não está em nenhuma resposta HTTP. **Nenhum dos dois consegue perguntar "a escrita que
reportou sucesso escreveu alguma coisa?"** — é essa pergunta que falta um instrumento novo (AC1).

**Conserto:** `SELECT ... FOR UPDATE` com checagem explícita de `v_row_id IS NULL` (levanta
imediatamente — fecha a maior parte do buraco sozinho) **mais** `GET DIAGNOSTICS ROW_COUNT` depois
do `UPDATE` (defesa em profundidade contra uma linha desaparecer entre o `SELECT` e o `UPDATE`) —
os dois, não só um. E uma terceira asserção no carrasco do UUID: `org_integrations.secret_ref`
daquele `(org, provider)` aponta para o segredo plantado (AC1).

### `google` pela porta dos fundos — a RPC exposta a `authenticated` não tinha allowlist de provider (R3)
O helper da v0.2 só recusava `p_provider = 'whatsapp'`. Como `org_integration_set_secret_as_org` é
`GRANT EXECUTE ... TO authenticated`, e a linha `google` **existe e é gravável** em
`org_integrations` (medido pelo `@po` em `trifold-crm-dev`: `provider=google, status=disconnected,
secret_ref IS NULL`), um `authenticated` com a capability certa podia chamar a RPC direto com
`p_provider='google'` e recriar exatamente a segunda gaveta que o Context inteiro argumenta contra.
**Assimetria que revela o furo:** `whatsapp` está protegido em **dois** lugares (o `RAISE` do
helper **e** o `CHECK` estrutural da `247`); `google`, em nenhum.

**Conserto:** allowlist **positiva** dentro do helper (`IF p_provider NOT IN ('meta_ads',
'meta_capi', 'sienge', 'telegram')`) — não negativa, que envelheceria a cada provider novo (AC1).

### "Nunca grava sem testar" era verdade só na rota — e é isso que "Conectado" significava (R4)
A validação síncrona (AC5) sempre morou na rota Next, nunca na RPC. Como `_as_org` está exposta a
`authenticated`, qualquer chamador que fale com a RPC direto (inclusive um script de suporte
futuro, ou uma integração que replique o padrão que a própria story estabelece) grava
`status='connected'` sem nunca ter passado pela chamada de teste. O selo "Conectado" garantia
apenas "alguém gravou um segredo", não "a credencial funciona" — e R2 mostra que às vezes nem
"alguém gravou" é verdade.

**Conserto escolhido — opção (a) do parecer, a que o `@po` recomendou:** separar as operações.
`_org_integration_write_secret` grava só `config`+`secret_ref`, **nunca** promove `status`.
`_org_integration_mark_connected` é uma segunda função, chamada pela rota **só depois** da chamada
de teste ter sucesso, com um guard estrutural: recusa marcar `connected` se `secret_ref IS NULL`.
**Limite reconhecido, por escrito, para não virar promessa maior do que o banco pode cumprir:**
isto garante estruturalmente "não marca connected sem um segredo gravado" — não garante "não marca
connected sem a credencial ter sido testada", porque o teste é uma chamada HTTP e só pode
acontecer em application code. Fechar esse segundo buraco por completo exigiria a RPC nunca ser
alcançável fora da rota, o que contradiz o próprio motivo de `_as_org` existir (a rota `/dashboard`
já não usa `createAdminClient()` — ver decisão da v0.2). A mitigação estrutural (não marca sem
segredo) é o que o banco pode garantir sozinho; o resto continua sendo responsabilidade da rota,
nomeada como tal (AC1, AC5).

### `expect.assertions(n)` era decorativo contra o modo de falha exato que motivou sua importação (R5)
Medido pelo `@po`, os dois lados:
```
# teste que RODA com contagem errada:               Test Files 1 failed  EXIT=1  ← funciona
# suíte inteira PULADA, expect.assertions(3) dentro:  Tests 2 skipped      EXIT=0  ← inerte
```
`expect.assertions` nunca executa dentro de um teste pulado — e "suíte inteira em skip, exit 0"
era exatamente o defeito da `900-25`. A lição tinha sido aplicada pelo **nome**, não pelo
**mecanismo**. Dois agravantes que a v0.2 não endereçava: a story nunca nomeava sob qual
config/comando a Camada B roda (`pnpm test`, raiz, não carrega `.env` nenhum — medido também na
validação da `900-25`); e o aparato que resolveria isso (`vitest.tenancy.config.ts`, carregamento
de `.env.teste`, guard N2) é da `900-25`, não mergeada.

**Conserto:** `expect.assertions` **fica** (cobre "rodou e afirmou de menos") — mas a régua contra
o modo de falha da `900-25` passa a ser **contagem de testes executados**, colada como evidência
no Dev Agent Record (`0 passed | N skipped` reprova), não uma asserção dentro do próprio teste que
pode ser pulado junto com ele. Config e comando nomeados (Dependencies acima; Testing abaixo).

### C1 — o dono do produto decidiu quem grava `page_id`, e aceitou o risco cross-tenant conscientemente (Rodada 3)
A pergunta que o achado N2b abriu (Rodada 2) — dado que só a chamada de teste na rota prova posse
de um `page_id`, e que a RPC `_as_org` está aberta a `authenticated`, **deveria o cliente
(`org_admin`) poder gravar `page_id` sozinho, ou só o platform admin?** — foi levada ao dono do
produto exatamente como o `@po` formulou a escolha: **"o cliente também grava o `page_id`, com
auditoria."** Decisão: **sim** — `org_admin` continua podendo gravar `page_id` via
`org_integration_set_secret_as_org`, com o risco cross-tenant **aceito conscientemente**, não
descoberto depois.

**O risco, nomeado sem suavizar (não é o `@sm` quem decide isto — é registro de uma decisão já
tomada):** uma chamada direta à RPC pode gravar o `page_id` de outra empresa e desviar os leads
dela para quem gravou. A auditoria (`platform_audit_log`) **registra** quem fez isso e quando —
**não impede**. Isto continua verdade depois do guard de formato N2b (que barra só o exemplo sem
forma de identificador do `@po`, não a classe — ver correção de prosa em AC1) e depois do filtro
de `status` em `resolveOrgByMetaPage` (AC10, que reduz UM caminho de ataque específico, não fecha
o risco).

**Porque a prevenção foi recusada, a contrapartida vira detecção — não desaparece.** Ver AC11.

### Contrato de erro — 6 códigos (achado: a tabela da v0.2 tinha se perdido na reescrita da v0.3, corrigido aqui)
A rota de validação síncrona (AC5) nunca devolve o texto bruto do provider para o `/dashboard` —
devolve um destes códigos estáveis, com mensagem fixa em pt-BR, igual para os dois públicos
(reuso real de `api/meta-ads/account/test/route.ts:55-58`, não invenção):

| Código | Situação | Mensagem em pt-BR |
|---|---|---|
| `token_invalid` | Credencial rejeitada pelo provider | "A credencial foi recusada. Confira se foi copiada sem espaços extras." |
| `permission_denied` | Credencial válida, sem a permissão necessária | "A credencial é válida, mas não tem a permissão necessária. Veja o guia do provider." |
| `not_found` | Identificador público não existe | "Não encontramos esse identificador. Confira se foi digitado certo." |
| `network_error` | Timeout/erro de rede ao contatar o provider | "Não conseguimos contatar o provider agora. Tente de novo em instantes." |
| `unknown` | Qualquer outra falha | "Falha inesperada ao testar a credencial." |
| `page_id_ja_configurado` (**6º código, novo — C3**) | `23505` de `org_integrations_meta_page_ativo` | "Este identificador já está associado a outra conta. Contate o suporte." |

O platform admin vê, adicionalmente, um bloco "Detalhes técnicos" (`technicalDetail`) com o erro
bruto — decisão tomada no SERVIDOR, por rota, nunca por prop de UI (R9/AC5).

### Recomendadas aplicadas (R6-R9)
- **R6 — `vault.secrets.name` é UNIQUE** (medido: `secrets_name_idx`, `indisunique = true`). O
  nome `provider:org_id` da v0.2 criava um beco sem saída: se um secret com esse nome já existisse
  enquanto `secret_ref` estivesse `NULL` (limpeza manual, restore parcial), toda escrita futura
  daquele `(org, provider)` falharia com `23505` opaco, para sempre. Conserto: nome com nonce
  (`gen_random_uuid()`) — nunca colide, elimina a classe inteira em vez de mitigar (AC1).
- **R7 — a `248` acrescenta a 5ª FK bloqueante para `organizations` e a 2ª para `users`, as duas
  sem `ON DELETE`.** Apagar uma org exigiria apagar a trilha dela (o oposto de append-only);
  apagar um usuário que já agiu ficaria bloqueado. Conserto: `org_id` e `actor_user_id` com
  `ON DELETE SET NULL`; identidade do ator congelada em `metadata` (mesmo raciocínio que já
  justificava `actor_type` como coluna própria, agora estendido ao rótulo do ator) — a trilha
  sobrevive à org e ao usuário que a originou (AC2). **Nota de sequência:** ver "Depends on" —
  não aplicar a `248` antes da `900-25` v0.3.
- **R8 — a AC8 já tinha uma catraca real e não a citava.** `scripts/admin-client-allowlist.test.ts`
  roda ESLint por AST (regra `aios/no-unscoped-admin-client`), em subprocesso, dentro do `pnpm
  test` — com vivacidade dos dois lados já embutida nele. "A rota `/dashboard` não usa
  `createAdminClient()`" deixa de ser promessa e vira régua existente, só citada (AC8). **E a
  varredura da AC9 precisa cobrir `components/integrations/**`** — é o arquivo importado pelas
  DUAS superfícies, o candidato natural a virar a ponte que a AC9 existe para impedir, e a v0.2
  tinha deixado de fora (AC9).
- **R9 — "esconder no render não é esconder".** O bloco "Detalhes técnicos" da v0.2 era
  condicional por `viewerRole` num Client Component — se o payload já chegou ao navegador, o dado
  bruto está no JSON/HTML independente do que a UI renderiza. Conserto: a decisão migra para o
  servidor — a rota `/api/configuracoes/integracoes` (client) **nunca serializa** o campo de erro
  bruto do provider na resposta; só a rota `/api/platform/orgs/[id]/integracoes` inclui esse
  campo. `viewerRole` continua controlando só rótulos/textos, nunca dado (AC5).

### Menores aplicados (m1-m4)
m1 (contagem de tiles) — ver acima. m2 (SELECT duplicado no helper) — o `SELECT ... INTO` de AC1
agora lê `id, secret_ref` numa única consulta (era dois `SELECT`s na v0.2). m3 — nenhuma correção
de mérito; o `@po` confirmou que a citação do `@sm` sobre `has_capability`/commit `1a524552`
estava certa. m4 (provider do teste manual) — trocado de Telegram (global por decisão do ADR-005,
não representa o caminho per-org) para `meta_capi` ou `sienge` (Testing/Manual).

---

## Scope

### IN (esta story entrega)
Herdado da v0.2, com estes acréscimos/correções desta rodada:
1. Migration `248` com: helper `_org_integration_write_secret` (allowlist positiva, `FOR UPDATE`,
   `GET DIAGNOSTICS`, nome de Vault com nonce, não promove `status`); helper novo
   `_org_integration_mark_connected` (guard estrutural: exige `secret_ref` não-nulo); trigger de
   imutabilidade em `platform_audit_log` + `REVOKE UPDATE, DELETE`; FKs com `ON DELETE SET NULL`.
2. Componente compartilhado com **5** tiles (não 6, `google` fora do painel).
3. Duas rotas de escrita chamando **duas** RPCs em sequência (escrever segredo → promover status),
   nunca uma só.
4. Resposta de erro **moldada por rota**, não por prop de UI — `/dashboard` nunca recebe o campo
   técnico bruto no payload.
5. Varredura da AC9 cobrindo também `components/integrations/**`.
6. Dependência nomeada e citada (Depends on) do harness de teste da `900-25` para a Camada B.

### OUT
Inalterado da v0.2 — ver ali para a tabela completa (`resolveIntegration()`, `google` escrevível,
unificação com `meta_ad_accounts`, `platform_admins` com níveis, migração de
`whatsapp_config.access_token`/`meta_ad_accounts.access_token` para Vault, `Resend`,
`last_error`/`last_check_at` persistentes, tela de Atividade completa para o cliente).

---

## Acceptance Criteria

### AC1 — Migration `248`: helpers privados endurecidos (R1 parcial, R2, R3, R4, R6, m2, N2a, N2b) + pontos de entrada públicos
```sql
-- ============================================================================
-- Helper privado 1 — escreve SÓ config+secret_ref. NUNCA promove status (R4).
-- ============================================================================
CREATE OR REPLACE FUNCTION _org_integration_write_secret(
  p_org_id uuid, p_provider text, p_secret text, p_config jsonb,
  p_actor_user_id uuid, p_actor_type text
) RETURNS void
SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_row_id uuid; v_secret_ref uuid; v_had_secret boolean;
  v_rows_affected int; v_secret_name text;
BEGIN
  -- R3 — allowlist POSITIVA (não negativa: uma lista negativa envelhece a cada provider novo).
  IF p_provider NOT IN ('meta_ads', 'meta_capi', 'sienge', 'telegram') THEN
    IF p_provider = 'whatsapp' THEN
      RAISE EXCEPTION 'whatsapp não escreve em org_integrations — ver whatsapp_config'
        USING ERRCODE = 'P0010';
    END IF;
    RAISE EXCEPTION 'org_integration_write: provider "%" fora da allowlist (meta_ads, meta_capi, sienge, telegram)', p_provider
      USING ERRCODE = 'P0011';
  END IF;

  -- N2(a) — segredo vazio não é uma credencial. Sem este guard, write_secret(..., '') seguido de
  -- mark_connected produz status='connected' com length(decrypted_secret)=0 — o guard de
  -- mark_connected só pergunta "existe secret_ref?", e referência para string vazia é referência.
  IF p_secret IS NULL OR btrim(p_secret) = '' THEN
    RAISE EXCEPTION 'org_integration_write: segredo vazio não é uma credencial'
      USING ERRCODE = 'P0017';
  END IF;

  -- N2(b) — validação de FORMATO do page_id (meta_ads). CORREÇÃO da prosa da v0.4 (achado do
  -- @po, Rodada 3): isto é HIGIENE DE DADO, não redução de superfície de ataque — medido: o
  -- page_id REAL da Trifold ("132027046650861", CLAUDE.md) passa por este guard tão facilmente
  -- quanto qualquer page_id de qualquer outra empresa, porque um page_id verdadeiro É numérico.
  -- Este guard barra o EXEMPLO que o @po usou na demonstração ("PAGINA-DE-OUTRA-EMPRESA-999", sem
  -- forma de identificador) — não barra a CLASSE do ataque (copiar um page_id real e válido de
  -- outra empresa). NÃO prova posse — só a chamada de teste na rota, contra a Graph API com o
  -- token do requisitante, prova isso, e a RPC não pode reproduzir isso sem reimplementar o
  -- cliente da Meta dentro do Postgres. A resposta real ao risco cross-tenant é a decisão C1
  -- (Context) — aceitar o risco e compensar com detecção, não este guard.
  IF p_provider = 'meta_ads' AND p_config ? 'page_id' AND p_config->>'page_id' IS NOT NULL THEN
    IF p_config->>'page_id' !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'org_integration_write: page_id precisa ser numérico (identificador de Página da Meta), recebido "%"', p_config->>'page_id'
        USING ERRCODE = 'P0018';
    END IF;
  END IF;

  -- R2/m2 — UMA consulta só (SELECT ... INTO não levanta quando não casa; a checagem explícita
  -- de v_row_id é o que fecha o 14º instrumento cego). FOR UPDATE trava contra escrita
  -- concorrente entre este SELECT e o UPDATE abaixo.
  SELECT id, secret_ref INTO v_row_id, v_secret_ref
    FROM org_integrations WHERE org_id = p_org_id AND provider = p_provider
    FOR UPDATE;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'org_integration_write: nenhuma linha para org_id=%, provider=% — não existe "sucesso" sobre uma linha que não existe', p_org_id, p_provider
      USING ERRCODE = 'P0012';
  END IF;

  v_had_secret := v_secret_ref IS NOT NULL;  -- nunca NULL: v_row_id já garantido acima

  IF v_secret_ref IS NULL THEN
    -- R6 — nonce no nome: vault.secrets.name é UNIQUE (medido). Sem nonce, um secret órfão de
    -- uma tentativa anterior com o mesmo nome vira 23505 permanente para este (org,provider).
    v_secret_name := p_provider || ':' || v_row_id::text || ':' || gen_random_uuid()::text;
    v_secret_ref := vault.create_secret(p_secret, v_secret_name);
  ELSE
    PERFORM vault.update_secret(v_secret_ref, p_secret);
  END IF;

  -- R4 — SÓ config+secret_ref. status fica como estava (nunca promovido aqui).
  UPDATE org_integrations SET config = p_config, secret_ref = v_secret_ref, updated_at = now()
    WHERE id = v_row_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected <> 1 THEN
    RAISE EXCEPTION 'org_integration_write: UPDATE afetou % linhas (esperava 1), org_id=%, provider=%', v_rows_affected, p_org_id, p_provider
      USING ERRCODE = 'P0013';
  END IF;

  PERFORM platform_audit(p_actor_user_id, p_actor_type, p_org_id,
    'org_integration.secret_write', 'org_integrations', v_row_id,
    jsonb_build_object('provider', p_provider, 'had_existing_secret', v_had_secret));
END;
$$;
REVOKE ALL ON FUNCTION _org_integration_write_secret FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Helper privado 2 — promove status. Guard estrutural: recusa sem secret_ref (R4).
-- ============================================================================
CREATE OR REPLACE FUNCTION _org_integration_mark_connected(
  p_org_id uuid, p_provider text, p_actor_user_id uuid, p_actor_type text
) RETURNS void SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_row_id uuid; v_secret_ref uuid; v_rows_affected int;
BEGIN
  SELECT id, secret_ref INTO v_row_id, v_secret_ref
    FROM org_integrations WHERE org_id = p_org_id AND provider = p_provider FOR UPDATE;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'org_integration_mark_connected: nenhuma linha para org_id=%, provider=%', p_org_id, p_provider
      USING ERRCODE = 'P0014';
  END IF;
  IF v_secret_ref IS NULL THEN
    RAISE EXCEPTION 'org_integration_mark_connected: sem secret_ref — não marca connected sem um segredo gravado'
      USING ERRCODE = 'P0015';
  END IF;

  UPDATE org_integrations SET status = 'connected', updated_at = now() WHERE id = v_row_id;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected <> 1 THEN
    RAISE EXCEPTION 'org_integration_mark_connected: UPDATE afetou % linhas (esperava 1)', v_rows_affected
      USING ERRCODE = 'P0016';
  END IF;

  PERFORM platform_audit(p_actor_user_id, p_actor_type, p_org_id,
    'org_integration.marked_connected', 'org_integrations', v_row_id,
    jsonb_build_object('provider', p_provider));
END;
$$;
REVOKE ALL ON FUNCTION _org_integration_mark_connected FROM PUBLIC, anon, authenticated;

-- Helper privado 3 (herdado da v0.2, inalterado em forma): _org_integration_reveal_last4 —
-- decifra via vault.decrypted_secrets, devolve right(secret,4), audita ANTES de devolver.

-- ============================================================================
-- Pontos de entrada públicos — pares _as_platform/_as_org para CADA operação:
-- write_secret, mark_connected, mark_error, reveal_last4 (8 funções públicas).
-- _as_platform: confia em p_actor_user_id (chamado só por service_role, já atrás de
--   requirePlatformAdmin() no Next.js — mesmo modelo de confiança de admin-invite.ts).
-- _as_org: resolve identidade por auth.uid(), reforça org_id=user_org_id() AND has_capability(
--   'configuracoes.integracoes_gerenciar') DENTRO da função — nunca confia em parâmetro do
--   client. GRANT EXECUTE ... TO authenticated.
-- ============================================================================
```
- `org_integration_mark_error_as_platform`/`_as_org` — inalteradas em forma da v0.2 (só
  `status='error'`, com `GET DIAGNOSTICS` também acrescentado por consistência com R2).
- **Carrasco (Camada B, `BEGIN…ROLLBACK` contra `trifold-crm-dev`) — 6 exigências, medidas pelo
  `@po` nas duas rodadas:**
  1. **UUID plantado, 3 asserções:** (a) o valor aparece em `vault.decrypted_secrets`; (b)
     **nunca** aparece em nenhuma resposta HTTP fora dos 4 últimos caracteres na rota de reveal;
     (c) **`org_integrations.secret_ref` (coluna `text`) aponta, com cast explícito `::uuid`
     (menor m5/m6 — sem o cast a comparação bate em `42883`, medido pelo `@po`), para o secret que
     contém o UUID** — fecha o cenário em que (a) e (b) ficam verdes com a linha nunca tendo sido
     tocada.
  2. **Caminho forçado de R2:** deletar a linha `(org_id, provider)` dentro da transação de teste
     e chamar `_org_integration_write_secret` — exigir **exceção** (`P0012`), nunca sucesso
     silencioso.
  3. **Guard estrutural de R4, nos dois sentidos:** `_org_integration_mark_connected` numa linha
     com `secret_ref IS NULL` — exigir exceção (`P0015`); a mesma linha depois de `write_secret` —
     exigir sucesso.
  4. **Allowlist de R3, nos dois sentidos:** os 4 providers aceitos gravam via a RPC direto (sem
     passar por rota nenhuma); `google` (`P0011`) e `whatsapp` (`P0010`) são recusados com erro
     nomeado, também via a RPC direto.
  5. **Segredo vazio (N2a):** `_org_integration_write_secret(..., '')` seguido de
     `_org_integration_mark_connected` — exigir que o PRIMEIRO passo já levante `P0017`; se por
     qualquer razão o guard for contornado, o carrasco também precisa provar que
     `length(decrypted_secret) = 0` nunca convive com `status = 'connected'` (célula de
     vivacidade, não só o caminho feliz).
  6. **`page_id` de formato inválido (N2b):** `_org_integration_write_secret` com
     `p_provider = 'meta_ads'` e `p_config = {"page_id": "PAGINA-DE-OUTRA-EMPRESA-999"}` (o valor
     exato que o `@po` usou) — exigir `P0018`; um `page_id` numérico válido (ex.: `"123456789"`)
     deve gravar normalmente — os dois sentidos, para provar que o guard discrimina forma, não
     recusa tudo.

### AC2 — `platform_audit_log`: append-only genuíno, os QUATRO verbos (R1, R7, N1)
```sql
CREATE TABLE platform_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,        -- R7: nullable, SET NULL
  actor_type     text NOT NULL CHECK (actor_type IN ('platform_admin','org_admin')),
  org_id         uuid REFERENCES organizations(id) ON DELETE SET NULL, -- R7
  action         text NOT NULL,
  target_table   text NOT NULL,
  target_id      uuid,
  metadata       jsonb NOT NULL DEFAULT '{}',  -- carrega actor_label (nome/e-mail congelado no
                                                 -- momento do ato) — sobrevive ao actor_user_id
                                                 -- virar NULL, mesmo raciocínio de actor_type
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- R1/N1 — REVOKE explícito, os TRÊS verbos que uma linha pode sofrer (não dois): BYPASSRLS pula
-- RLS, NÃO pula GRANT (medido pelo @po em transação: sr_upd/sr_del true→false, sr_ins preservado
-- true) — e GRANT ALL do Supabase inclui TRUNCATE, que a v0.3 tinha deixado de fora (medido:
-- sr_truncate continuava true depois do REVOKE de só UPDATE/DELETE).
REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_log FROM service_role, authenticated, anon, PUBLIC;

-- R1 — trigger como segunda camada: recusa incondicionalmente, para QUALQUER role, inclusive o
-- dono da tabela (que ainda passaria pelo REVOKE acima só enquanto ninguém regrant).
CREATE OR REPLACE FUNCTION platform_audit_log_immutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log é append-only — % não é permitido', TG_OP
    USING ERRCODE = 'P0020';
END; $$;
CREATE TRIGGER platform_audit_log_sem_update BEFORE UPDATE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION platform_audit_log_immutavel();
CREATE TRIGGER platform_audit_log_sem_delete BEFORE DELETE ON platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION platform_audit_log_immutavel();
-- N1 — TRUNCATE NÃO dispara trigger FOR EACH ROW (medido pelo @po: 2 linhas → TRUNCATE → 0
-- linhas, SEM exceção). O único evento válido para trigger de TRUNCATE no Postgres é
-- FOR EACH STATEMENT — e ele acende mesmo para o dono da tabela, igual aos dois acima.
CREATE TRIGGER platform_audit_log_sem_truncate BEFORE TRUNCATE ON platform_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_log_immutavel();

-- RLS SELECT: is_platform_admin() (tudo) OU
--   (org_id = user_org_id() AND has_capability('configuracoes.integracoes_gerenciar')) — trilha
--   resumida visível ao cliente (decisão da v0.2, mantida).
```
- `platform_audit(p_actor_user_id, p_actor_type, p_org_id, p_action, p_target_table, p_target_id,
  p_metadata)` resolve `v_actor_label := COALESCE((SELECT name FROM users WHERE id =
  p_actor_user_id), (SELECT email FROM users WHERE id = p_actor_user_id))` e grava fundido em
  `metadata` (`jsonb_build_object('actor_label', v_actor_label) || p_metadata`) — é o que
  sobrevive ao `ON DELETE SET NULL` de R7.
- **Carrasco (R1/N1, quatro verbos — não três):** em `BEGIN…ROLLBACK` contra `trifold-crm-dev`,
  com `service_role`: `INSERT` funciona (linha aparece); `UPDATE`, `DELETE` **e `TRUNCATE`** na
  mesma tabela levantam erro nomeado. A v0.3 só testava os três primeiros — é justamente o quarto
  (`TRUNCATE`) que apaga a trilha inteira de uma vez, e era o que sobrevivia ao conserto anterior.

### AC3 — `PLATFORM_READABLE_TABLES` ganha `org_integrations` (inalterada desde v0.1)

### AC4 — Componente compartilhado, **5** tiles (não 6) + `google` somente leitura fora do painel
- `components/integrations/integrations-panel.tsx`: 5 tiles — WhatsApp, "Meta — Recebimento de
  Leads", Meta CAPI, Sienge, Telegram. `google` não é um tile deste componente.
- `app/platform/orgs/[id]/integracoes/page.tsx`: `<IntegrationsPanel />` **mais** uma linha
  separada, somente leitura, para Google (lida de `organizations.google_oauth_tokens`, sem botão
  de ação, com o texto explicando D14/impersonation).
- `app/dashboard/configuracoes/integracoes/page.tsx`: estendida (não recriada) — cards existentes
  preservados; `<IntegrationsPanel />` numa seção nova; o card "Google Forms" já existente
  continua sendo o único lugar de ação para Google.

### AC5 — Escrita: valida → grava segredo → promove status, nunca um passo sem o outro; erro moldado por rota (R4, R9)
- Sequência obrigatória nas duas rotas: (1) chamada de teste com o valor do POST; (2) se sucesso,
  `..._write_secret_as_*`; (3) se (2) suceder, `..._mark_connected_as_*` — dois RPCs, dois eventos
  de auditoria, nunca um `UPDATE` só que faz as duas coisas.
- Falha na chamada de teste, integração nunca configurada: nada é persistido (nem write_secret nem
  mark_connected são chamados).
- Falha em integração já `connected`/`active`: `..._mark_error_as_*` (ou, para `whatsapp`, `UPDATE
  whatsapp_config SET status='error'`) — sem tocar `config`/`secret_ref`.
- **R9 — o corpo bruto do erro do provider é decidido no SERVIDOR, por rota, nunca por prop de
  UI:** `POST /api/configuracoes/integracoes` **nunca inclui** o campo de erro técnico no JSON de
  resposta — o código de 6 valores (tabela em Context, "Contrato de erro", corrigida/estendida
  nesta revisão) e a mensagem em pt-BR, só.
  `POST /api/platform/orgs/[id]/integracoes` inclui um campo adicional (`technicalDetail`) com o
  erro bruto do provider. `viewerRole` no componente compartilhado continua controlando só
  textos/rótulos — nunca decide se um dado chega ou não ao navegador; isso é decisão de qual rota
  responde, tomada onde a identidade do requisitante é confiável (o servidor).
- **Limite honesto do guard estrutural (movido do Dev Notes para dentro desta AC — pedido do
  `@po` na Rodada 2: "é aqui que alguém decide se a régua basta"):**
  `_org_integration_mark_connected` garante, 100% em SQL, "não marca `connected` sem um
  `secret_ref` gravado" (reforçado por N2a: também não marca `connected` sem um `secret_ref` que
  aponte para um segredo NÃO VAZIO). **Não** garante "a credencial foi testada com sucesso" — essa
  prova só existe em application code (a chamada HTTP de teste), e nenhuma RPC reproduz isso sem
  reimplementar clientes de 5 APIs externas dentro do Postgres. A régua basta para o que promete
  (impedir sucesso reportado sem nada gravado, R2; status promovido por uma chamada direta que
  nunca passou pela validação de rede, R4; e agora, N2a/N2b, referência vazia ou config sem forma
  válida) — não basta, e não tenta bastar, para provar posse real da credencial. O tile mostra
  essa fronteira em texto junto do badge (ex.: "testado pela última vez em {data}"), não só nesta
  nota — quem implementar sem esse texto está prometendo mais do que a régua garante.

### AC6 — Nenhum consumo de credencial de tenant é criado — reforçada para as DUAS superfícies (inalterada desde v0.2)

### AC7 — "Últimos 4 caracteres" + trilha visível ao cliente (inalterada em desenho desde v0.2)
Os dois pares `_as_platform`/`_as_org` de `reveal_last4` continuam auditando antes de devolver.
Carrasco de discriminação por `actor_type`/`actor_user_id` (v0.2) mantido.

### AC8 — `docs/audits/admin-client-allowlist.json` — catraca real citada (R8)
- Só a(s) rota(s) de `/platform` que usam `createAdminClient()` entram na allowlist. A rota
  `/dashboard` não usa `createAdminClient()` — **não é promessa, é régua**:
  `scripts/admin-client-allowlist.test.ts` roda ESLint por AST (regra
  `aios/no-unscoped-admin-client`) dentro do `pnpm test`, reprovando `createAdminClient()` fora da
  allowlist, com vivacidade nos dois sentidos já embutida nele. Citado explicitamente aqui — não
  precisa de teste novo, só de a story deixar de tratá-lo como se não existisse.

### AC9 — Fronteira `/dashboard` × `lib/tenancy/platform-*`, testada, cobrindo o componente compartilhado (R8)
- Varredura estática (mesma técnica de `platform-query-scan.ts`) sobre `app/dashboard/**`,
  `app/api/configuracoes/**` **e `components/integrations/**`** (acréscimo desta rodada — é o
  arquivo que as duas superfícies importam, o candidato natural a virar a ponte que esta AC existe
  para impedir).
- Zero ocorrências de import de `lib/tenancy/platform-guard` ou `lib/tenancy/platform-query`.

### AC10 — Decisão sobre o filtro de `status` no roteamento de webhook por `page_id` (N2b, C2, C3)
A `900-24` deixou registrado, por escrito, em `webhook-org.ts` (`resolveOrgByMetaPage`,
comentário nas linhas `:119-127`): o resolver **não filtra por `status`** ao casar
`config->>'page_id'` — decisão tomada porque, quando a `900-24` foi implementada, nada promovia
`status` de forma confiável (`mark_connected` não existia), com a nota explícita *"quando o
painel entregar isso, esta decisão volta à mesa."* **Esta story é esse painel.**

**Decisão:** `resolveOrgByMetaPage` passa a exigir `status = 'connected'` na linha que casa o
`page_id`. **Reduz a superfície de UM ataque específico (config escrito e nunca promovido — hoje
roteável; depois desta mudança, não), não fecha o risco cross-tenant por completo** — a
prevenção desse risco foi conscientemente recusada em C1 (Context); o que resta como mitigação
real é a detecção de AC11.

**Execução — Task desta story, não uma `900-24-bis`:** `webhook-org.ts` já existe (entregue pela
`900-24`) — a própria `900-24` nomeou este painel como o gatilho para revisitar a decisão, então a
mudança é uma Task aqui (Task 12), com um arquivo que não nasceu nesta story mas que esta story
está autorizada, por design explícito da `900-24`, a modificar.

**Verificação de modo — reescrita depois do achado C2 do `@po` (a v0.4 media e não decidia, e
ignorava o modo `legacy`):**

| `WEBHOOK_ORG_ROUTING` medido | O que o resolver decide de verdade | Aplicar o filtro agora? |
|---|---|---|
| `legacy` | Roteamento real nunca usa `resolveOrgByMetaPage` — o resolver nem é chamado no caminho que decide. | **Sim, sem pré-condição.** Zero risco ao roteamento real. |
| `both` (**default medido pelo `@po` quando a env var falta** — `webhook-org.ts:197-201`) | Dual-run: computa os dois caminhos, usa **sempre o legado** para decidir, só loga divergência. | **Sim, sem pré-condição.** Só muda o que é logado como divergência. |
| `identifier` (cutover completo) | O resultado de `resolveOrgByMetaPage` **é** a decisão real de roteamento. | **NÃO, a menos que a linha `org_integrations.meta_ads` da Trifold já esteja `status='connected'`.** Medido pelo `@po`: **toda** linha `meta_ads` está `disconnected` hoje (nenhuma foi promovida — `mark_connected` não existia antes desta story). Aplicar o filtro neste modo, sem essa pré-condição, faz o resolver **parar de resolver qualquer org**, inclusive a Trifold — zero lead roteado por `page_id`, para todo mundo. |

**Isto é uma DECISÃO, não uma medição:** a Task 12 não "confirma o modo e segue" — ela **bloqueia**
a aplicação em `identifier` até a linha da Trifold estar `connected` (via o próprio painel desta
story, com a credencial real da Trifold, passando pela validação síncrona de AC5). Reconfirmar o
modo e o `status` da Trifold **no dia da implementação** — os dois podem ter mudado desde a
medição do `@po`.

**Efeitos que esta decisão tem e a story precisa declarar, não só o benefício (C3, achados do
`@po` que a v0.4 não listava):**

1. **Troca "sync quebrado" por "lead perdido" quando uma credencial expira.** Hoje (sem o filtro),
   um `page_id` correto com um `access_token` vencido ainda resolve a org certa — o lead chega,
   só a etapa de enriquecimento (buscar o formulário completo via Graph API) falha. Depois do
   filtro, se o `status` daquela linha algum dia deixar de ser `'connected'` (hoje isso só
   acontece por ação explícita — `mark_error`/nova credencial que falha a validação — mas é um
   estado alcançável), o mesmo lead **não resolve organização nenhuma**: cai no caminho
   "não encontrou ⇒ 200 + log" (NFR-12 do epic), que é **perda**, não degradação. É um trade real,
   aceito conscientemente por esta decisão — não um efeito colateral escondido.
2. **`org_integrations_meta_page_ativo` (a UNIQUE de roteamento reverso, `900-21b`) não filtra por
   `status`.** Uma linha `disconnected` que já ocupa um `page_id` **continua bloqueando** qualquer
   outra org de gravar o mesmo valor — a constraint não sabe a diferença entre "alguém está usando
   isto de verdade" e "alguém gravou isto uma vez e nunca foi validado". Combinado com a decisão
   de C1 (cliente também grava `page_id`), isso converte o risco de "sequestro de lead" em
   **"negação de configuração"**: o dono legítimo de um `page_id` real tenta configurá-lo, bate em
   `23505` (violação de UNIQUE), e o painel mostra um erro de banco opaco, sem dizer que o motivo
   é "outra org já reivindicou este identificador". **Mitigação nesta story (AC5, novo código de
   erro):** a rota de escrita traduz `23505` nessa constraint específica para um 6º código,
   `page_id_ja_configurado`, com mensagem "Este identificador já está associado a outra conta.
   Contate o suporte." — não resolve a causa raiz (a corrida/o sequestro em si, que é o risco
   aceito em C1), mas impede que a vítima receba um erro de banco cru e não saiba o que fazer.

### AC11 — Detecção do risco aceito em C1 (compensação por auditoria, não por prevenção)
Como C1 recusou prevenir (o cliente grava `page_id` sozinho, sem prova de posse ao alcance do
banco), a contrapartida é **avisar**, não bloquear — dois alertas, os dois lidos a partir do que
já está sendo gravado (nenhum mecanismo novo de captura, só de leitura/reação sobre
`platform_audit_log`).

**Pré-requisito estrutural: `page_id` entra em `metadata` da auditoria.** `platform_audit()`,
chamada por `_org_integration_write_secret` para `provider = 'meta_ads'`, passa a incluir
`p_config->>'page_id'` em `metadata` (hoje só grava `provider`+`had_existing_secret`) — sem isso,
nenhum dos dois alertas abaixo tem o que ler.

1. **Alerta quando `page_id` é gravado por `org_admin`** — o caminho que o dono do produto
   escolheu abrir em C1. **Não bloqueia; avisa** um platform admin (mesmo canal que outros alertas
   operacionais do repositório já usam — reusar o mecanismo existente, não inventar um canal
   novo). Distingue de escrita por `platform_admin` usando `actor_type`, já congelado no momento
   do ato (v0.3) — é exatamente para isto que aquela coluna existe, e esta AC é a primeira a
   consumi-la além da trilha bruta.
   **Carrasco:** escrita com `actor_type='org_admin'` dispara o alerta; escrita com
   `actor_type='platform_admin'` **não** dispara — os dois sentidos, não só o caminho feliz.
2. **Alerta quando um `page_id` muda de org** — o sintoma exato do sequestro. Barato de detectar:
   antes de gravar, `_org_integration_write_secret` (só para `meta_ads`) consulta se esse
   `page_id` já apareceu em `platform_audit_log.metadata->>'page_id'` associado a um `org_id`
   **diferente** do que está gravando agora; se sim, a MESMA chamada de `platform_audit()` grava
   uma ação distinta (`org_integration.page_id_reassigned_cross_org`, com o `org_id` anterior em
   `metadata`), que é o gatilho do alerta — não é um mecanismo separado, é uma ramificação da
   escrita que já está acontecendo.
   **Carrasco:** org A grava `page_id='123'`; org A troca para `page_id='456'` (liberando `'123'`
   na UNIQUE); org B grava `page_id='123'` — a linha de auditoria da escrita de B carrega
   `org_integration.page_id_reassigned_cross_org` com o `org_id` de A em `metadata`. Controle
   negativo: org C grava um `page_id` **nunca usado antes** por ninguém — nenhuma linha de
   reatribuição é gravada.
- **Limite honesto, pelo mesmo motivo que AC5/AC10 já nomeiam o deles:** os dois alertas avisam
  DEPOIS do fato — não impedem a primeira leitura desviada, só encurtam a janela até alguém
  perceber. É detecção, não prevenção; é exatamente o que foi decidido em C1.

---

## Tasks / Subtasks

- [x] **Task 1 — Migration `248`, helpers endurecidos** (AC1)
  - [x] 1.1 `_org_integration_write_secret` (allowlist positiva, `FOR UPDATE`, `GET DIAGNOSTICS`,
        nome de Vault com nonce, sem promoção de status, guard N2a de segredo vazio, guard N2b de
        formato de `page_id`).
  - [x] 1.2 `_org_integration_mark_connected` (guard: recusa sem `secret_ref`).
  - [x] 1.3 `_org_integration_reveal_last4` (herdado, `GET DIAGNOSTICS` acrescentado por
        consistência).
  - [x] 1.4 8 funções públicas (`_as_platform`/`_as_org` × 4 operações).
  - [x] 1.5 Carrasco com as 6 exigências do `@po` (2 novas desta rodada): UUID plantado (3
        asserções, a 3ª com `::uuid` — m5/m6), caminho forçado de linha ausente (exige `P0012`),
        guard de `mark_connected` nos dois sentidos (`P0015`), allowlist nos dois sentidos direto
        pela RPC (`P0011`/`P0010`), segredo vazio recusado (`P0017`, N2a), `page_id` de formato
        inválido recusado e formato válido aceito (`P0018`, N2b).

- [x] **Task 2 — `platform_audit_log` genuinamente append-only, os quatro verbos** (AC2)
  - [x] 2.1 `REVOKE UPDATE, DELETE, TRUNCATE` (N1 — o `REVOKE` da v0.3 esquecia `TRUNCATE`) + as
        duas policies de SELECT.
  - [x] 2.2 Trigger de imutabilidade `FOR EACH ROW` (`BEFORE UPDATE OR DELETE`) **e** trigger `FOR
        EACH STATEMENT` (`BEFORE TRUNCATE` — obrigatório, `FOR EACH ROW` não dispara em
        `TRUNCATE`, medido pelo `@po`).
  - [x] 2.3 FKs com `ON DELETE SET NULL`; `platform_audit()` grava `actor_label` em `metadata`.
  - [x] 2.4 Carrasco com os QUATRO verbos: `service_role` insere (funciona), atualiza/apaga/trunca
        (os três levantam) — não só três.

- [x] **Task 3 — Leitura, nas duas superfícies** (AC3, AC4) — inalterada da v0.2, exceto:
  - [x] 3.5 (nova) tile Google somente leitura no `/platform`, fora do `<IntegrationsPanel />`.

- [x] **Task 4 — Componente compartilhado, 5 tiles** (AC4) — inalterada da v0.2, com a contagem
      corrigida para 5 em toda a UI e nos textos.

- [x] **Task 5 — Rota `/platform`: valida → grava → promove** (AC5, AC8, AC10/C3)
  - [x] 5.1 Sequência de 2 chamadas de RPC (não 1) após sucesso da validação.
  - [x] 5.2 Resposta de erro inclui `technicalDetail`.
  - [x] 5.3 Traduz `23505` de `org_integrations_meta_page_ativo` para o código
        `page_id_ja_configurado` (C3, 6º código de erro) — nunca deixa o erro de banco cru chegar
        à UI.

- [x] **Task 6 — Rota `/dashboard`: valida → grava → promove** (AC5, AC9, AC10/C3)
  - [x] 6.1 Sequência de 2 chamadas de RPC (não 1), client RLS-scoped.
  - [x] 6.2 Resposta de erro **nunca** inclui `technicalDetail` — omitido na serialização, não
        escondido no render.
  - [x] 6.3 Mesma tradução de `23505` → `page_id_ja_configurado` da Task 5.3.

- [x] **Task 7 — "Revelar últimos 4 dígitos" + trilha** (AC7) — inalterada da v0.2.

- [x] **Task 8 — Fronteira testada, com o componente compartilhado no escopo** (AC9)
  - [x] 8.1 Varredura cobrindo `app/dashboard/**`, `app/api/configuracoes/**`,
        `components/integrations/**`.

- [x] **Task 9 — Prova de não-regressão da Trifold** (AC6) — inalterada da v0.2.

- [x] **Task 10 — `docs/backlog.md`** — inalterada da v0.2 (nota append-only, item `900-16`).

- [x] **Task 12 — Filtro de `status` em `resolveOrgByMetaPage`, com gate de decisão** (AC10, N2b, C2, C3)
  - [x] 12.1 Medir `WEBHOOK_ORG_ROUTING` em produção (default sem env var, medido pelo `@po`:
        `"both"`, `webhook-org.ts:197-201`) e classificar nos TRÊS modos (`legacy`/`both`/
        `identifier`) — não só dois.
  - [x] 12.2 `legacy`/`both` ⇒ aplicar sem pré-condição (ver tabela de AC10).
        `identifier` ⇒ **BLOQUEAR** a aplicação até `SELECT status FROM org_integrations WHERE
        org_id = <org da Trifold> AND provider = 'meta_ads'` devolver `'connected'` — se não
        devolver, a Task fica parada (não é um aviso, é um gate) até alguém promover essa linha
        pelo próprio painel desta story.
  - [x] 12.3 `webhook-org.ts`: `resolveOrgByMetaPage` passa a exigir `status = 'connected'` na
        linha que casa `page_id`.
  - [x] 12.4 Teste (herdado do molde da `900-24`, mesma disciplina de fake fiel ao
        `postgrest-js`): linha com `page_id` certo e `status != 'connected'` não resolve; linha
        com `page_id` certo e `status = 'connected'` resolve.
  - [x] 12.5 Atualizar o comentário de `webhook-org.ts:119-127` para não deixar o texto antigo
        ("não filtra por status, decisão a revisitar quando o painel existir") sobrevivendo ao
        lado do código que já revisitou — mesma lição de `900-21b`/`900-23`/`900-24`: comentário
        superado por resultado precisa ser reescrito, não deixado como está.
  - [x] 12.6 Documentar no PR os dois efeitos de C3 (credencial expirada vira lead perdido, não só
        sync quebrado; `23505` opaco de `org_integrations_meta_page_ativo` — mitigado pela Task
        5.3/6.3, não eliminado).

- [x] **Task 13 — Detecção do risco aceito em C1** (AC11)
  - [x] 13.1 `platform_audit()` para `provider='meta_ads'` passa a incluir `page_id` em
        `metadata`.
  - [x] 13.2 Alerta em escrita por `org_admin` (reusar canal de alerta já existente no
        repositório — não criar um novo).
  - [x] 13.3 Checagem de reatribuição cross-org antes de gravar (consulta a
        `platform_audit_log.metadata->>'page_id'` por `org_id` diferente) + ação distinta de
        auditoria (`org_integration.page_id_reassigned_cross_org`) quando encontrada.
  - [x] 13.4 Carrasco dos dois alertas, nos dois sentidos cada (dispara quando deveria, não
        dispara quando não deveria) — mesma disciplina de vivacidade bidirecional do resto da
        story.

- [x] **Task 11 — Camada B: config, comando e dependência nomeados** (R5)
  - [x] 11.1 Confirmar `900-25` mergeada (ou, se não, replicar só o necessário de
        `vitest.tenancy.config.ts`/guard N2 — decisão a registrar no Dev Agent Record, nunca
        implícita).
  - [x] 11.2 Rodar a Camada B desta story sob esse config (`pnpm test:tenancy` ou equivalente
        nomeado no Dev Agent Record).
  - [x] 11.3 Colar no Dev Agent Record a contagem de testes EXECUTADOS (não a de asserções) —
        `0 passed | N skipped` reprova, mesmo com `expect.assertions` presente.
  - [x] 11.4 Confirmar, antes de aplicar a `248` em `trifold-crm-dev`, que a `900-25` v0.3 (FKs
        derivadas de `pg_constraint`) já está aplicada — ou avisar o `@qa` da `900-25` no mesmo
        dia se a ordem inverter.

---

## Dev Notes

_(Precedentes de `api/meta-ads/account/route.ts`, `lib/api-auth.ts`, schema de
`meta_ad_accounts`, `organizations.google_oauth_tokens`, e a nota sobre `actor_type` como coluna
congelada — todos herdados da v0.2 sem mudança de mérito.)_

### Limite honesto do guard estrutural — movido para dentro da AC5
Pedido do `@po` na Rodada 2: o limite do que `_org_integration_mark_connected` garante (e não
garante) precisa estar onde alguém decide se a régua basta, não só no Dev Notes. Ver AC5.

### Segredo em trânsito — duas ressalvas de higiene do `@po`, não bloqueantes
O segredo viaja como parâmetro de RPC — aparece em `pg_stat_activity.query` enquanto a chamada
executa, e apareceria em log de statement se algum dia for ligado (hoje não está). E uma falha de
rede entre `vault.create_secret` e o `UPDATE` deixaria um segredo órfão — mitigado hoje por serem
a mesma transação (rollback automático em qualquer `RAISE` depois do `create_secret`), o que vale
declarar por escrito em vez de deixar implícito.

### Testing Standards
Vitest para validadores e rotas (mock de rede). **Camada B roda sob `vitest.tenancy.config.ts`
(da `900-25`) ou equivalente nomeado** — nunca sob o `vitest.config.ts` da raiz, que não carrega
`.env` nenhum (medido: `TENANCY_TEST_SUPABASE_URL=undefined` sob `pnpm test`). Guard N2 da `900-25`
replicado: env presente + variável ausente ⇒ falha, nunca skip silencioso. Catraca de aceitação:
contagem de testes EXECUTADOS colada no Dev Agent Record, não `expect.assertions` sozinho.
Carrascos de N1 (quatro verbos em `platform_audit_log`, não três) e N2 (segredo vazio, `page_id`
de formato inválido, os dois sentidos) entram na mesma Camada B, mesmo config.

---

## Testing

### Abordagem
- **Camada A (unitária):** validadores por provider × 2 rotas; `_write_secret`/`_mark_connected`
  com mocks de `vault.*`; tradução de `actor_type`/`actor_label` no componente; **resposta de erro
  sem `technicalDetail` na rota `/dashboard`** (asserção de ausência de campo, não só de conteúdo).
- **Camada B (integração, `BEGIN…ROLLBACK` contra `trifold-crm-dev`, sob o config da `900-25`):**
  os 8+ RPCs de AC1, os 6 carrascos exigidos pelo `@po` (UUID com 3 asserções incluindo o cast
  `::uuid`, linha ausente força `P0012`, guard de `mark_connected` nos dois sentidos `P0015`,
  allowlist nos dois sentidos `P0011`/`P0010`, segredo vazio `P0017`, `page_id` de formato
  inválido/válido `P0018`), o carrasco de `platform_audit_log` append-only nos QUATRO verbos
  (AC2), a discriminação por `actor_type` (AC7), e (AC10) `resolveOrgByMetaPage` recusando uma
  linha `status != 'connected'` mesmo com `page_id` certo.
- **Manual:** um provider real ponta a ponta pelas duas superfícies — **`meta_capi` ou `sienge`,
  não Telegram** (m4: Telegram é `platform_shared`/global por decisão do ADR-005, não exercita o
  caminho per-org que esta story existe para provar).

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-30 | 0.7 | **Gate `CONCERNS` endereçado — as duas concerns bloqueantes fechadas.** **QA-900-51-1 (high):** a detecção da AC11 — a contrapartida inteira que o dono do produto recebeu por recusar a prevenção em C1 — **não tinha caminho alcançável**: `dispararAlertasDeAuditoria` tinha um único call site (`/platform`, onde toda escrita é `platform_admin`), e o handler real do `/dashboard` dava `200`, 2 RPCs e 0 alertas. O limite que a v0.6 declarava era mais estreito que o real. Conserto: `alertarAposEscritaDeIntegracao()` vira o ÚNICO ponto de disparo, chamado pelas DUAS rotas, com a janela filtrada por `metadata->>provider`; carrasco no CALL SITE — a mutação exata do `@qa` (`ehEscritaDePageIdPorCliente → false`) passou de *dois testes de rota verdes* para **1 failed**. **QA-900-51-2 (medium):** o tile `whatsapp` do `/platform` lia `org_integrations`, linha estruturalmente inescrevível; medido em produção, o canal estava `active` com credencial e o painel do dono do produto dizia "Não conectado", enquanto o `/dashboard` acertava. Conserto: montagem única `montarTilesDoPainel()` lendo `whatsapp_config` nas duas telas (só colunas não-secretas — `whatsapp_config` entrou em `PLATFORM_READABLE_TABLES`, terceira extensão declarada), com carrasco que reproduz o estado real de produção. O texto do cartão foi reescrito: mandava para um "fluxo de WhatsApp" que **não existe** (medido: 32 leituras, zero escritas em `packages/web/src`) — **o pedido do dono do produto fica cumprido para 4 dos 5 canais; o de produção, não**. **Achado da própria correção (M23):** a primeira régua de QA-900-51-2 era de EXISTÊNCIA (o `import` sobrevive à remoção do uso) e a mutação passava verde — trocada por régua de COBERTURA sobre a montagem extraída. **Pergunta sem dono, investigada:** `validarMetaAds` usa campos PÚBLICOS da Página e **não prova posse** — raciocinado, não medido; registrado em `docs/backlog.md` com experimento e probe recomendado, sem trocar a chamada de rede (não exercitável aqui). Adjacente, medido: `fetchLeadData` usa `META_PAGE_ACCESS_TOKEN` global, então a credencial `meta_ads` por org ainda não é consumida por ninguém. **23 mutações** no total, todas revertidas; `pnpm test` **3763 passed**, `pnpm test:tenancy` **28 passed | 0 skipped**, `type-check --force`/`lint --force` verdes. Banco de teste compartilhado conferido pela Management API: sem resíduo (tudo em `BEGIN…ROLLBACK`). | @dev (Dex) |
| 2026-08-30 | 0.6 | **Implementada — `Ready for Review`.** Migration `248` aplicada em `trifold-crm-dev` e registrada no ledger (NÃO em produção — runbook do `@devops`). Camada B: **28 passed | 0 skipped**; suíte completa **3730 passed**; `type-check`/`lint` verdes; `gate:tenancy` delta **+0**. Vermelho→verde por **12 mutações nomeadas**, todas revertidas (9 na Camada B contra a função no banco, 3 na Camada A). **Achado do `@dev`:** os consertos de R1 e R7 COLIDIAM — `ON DELETE SET NULL` é um UPDATE interno e o trigger `BEFORE UPDATE` incondicional o barrava com `P0020`, tornando a FK de R7 inerte e voltando a bloquear o `DELETE` de org (e quebraria o teardown da `900-25`, que exclui `SET NULL` da derivação). Conserto: exceção cirúrgica no trigger, com carrasco nos dois sentidos; residual registrado em `docs/backlog.md`. **Task 12:** modo medido como `both` (variável ausente em produção; leitura direta impossível — token dá `403` no projeto canônico), filtro aplicado sem pré-condição; medição extra: em produção a linha `meta_ads` da Trifold tem `page_id` NULO, logo o resolver já não casava nada. **3 divergências declaradas:** `whatsapp` ficou somente-leitura no painel (redução de escopo, precisa de decisão), `PLATFORM_READABLE_TABLES` ganhou `platform_audit_log` além de `org_integrations` (ampliação justificada), e `P0021` foi acrescentado (`P0019` fica deliberadamente não alocado). | @dev (Dex) |
| 2026-08-29 | 0.1 | Draft inicial — só `/platform`. | @sm (River) |
| 2026-08-30 | 0.2 | Dono do produto decide as duas superfícies (`/platform` + `/dashboard`). Componente compartilhado, RPC com dois pontos de entrada, `platform_audit_log` com `actor_type`, trilha visível ao cliente, contrato de erro de 5 códigos, `google` fora do escopo de escrita, AC9 (fronteira). | @sm (River) |
| 2026-08-30 | 0.3.1 | **Revalidação do `@po` — 🔴 NO-GO (rodada 2), 8,5/10.** `docs/qa/po-validation-900-51.md`, Rodada 2. **Fechados e medidos:** R2 (linha apagada na transação ⇒ `P0012`, levantado **antes** do `vault.create_secret`, sem segredo órfão); R3 (`google` ⇒ `P0011`, `whatsapp` ⇒ `P0010`, pela RPC direta); R4 (`P0015` sem `secret_ref`; caminho feliz promove e a 3ª asserção do carrasco é provável); R1 na metade (`sr_update`/`sr_delete` → `false`, `INSERT` preservado); R5 (catraca virou contagem de testes executados, `expect.assertions` corretamente rebaixado, galho da `900-25` não mergeada decidido na Task 11.1); R6-R9 e m1-m4. **2 bloqueantes:** **N1** `TRUNCATE` atravessa o `REVOKE` e o trigger `FOR EACH ROW` — a trilha é apagável inteira por `service_role`; conserto medido (`REVOKE ... TRUNCATE` + `BEFORE TRUNCATE ... FOR EACH STATEMENT`) e o carrasco da AC2 tem de cobrir os 4 verbos. **N2** o 15º cego: segredo **vazio** passa pelo guard estrutural (`connected` com `length=0`), e `p_config` entra sem validação — para `meta_ads` é a chave de roteamento de tenant, e o resolver não filtra `status`, então uma chamada direta à RPC sequestra os leads de outra empresa com o tile mostrando "Não conectado". | @po (Pax) |
| 2026-08-30 | 0.4.1 | **Revalidação do `@po` — 🟢 GO condicional (rodada 3), 9,0/10.** `docs/qa/po-validation-900-51.md`, Rodada 3. **N1 fechado nos dois eixos** (privilégio e trigger, os 4 verbos) e **N2(a) fechado** (`btrim` pega também o caso só-espaços, que eu não tinha medido). Menores aplicados: cast `::uuid` na 3ª asserção, limite honesto dentro da AC5, `Depends on` de `webhook-org.ts`. **3 condições:** **C1** o `page_id` self-service é risco cross-tenant declarado mas não fechado — o guard de formato barra o exemplo e não a classe (todo `page_id` da Meta é numérico), e as duas RPCs necessárias estão ambas expostas a `authenticated`; aceitar isso não é decisão do `@sm` nem minha. **C2** a verificação de modo da AC10 não é executável, ignora o modo `legacy` e mede sem decidir — em `identifier`, com todas as linhas `disconnected` (medido), aplicar a Task 12 apagaria o roteamento em vez de endurecê-lo. **C3** a AC10 troca 'sync quebrado' por 'lead perdido' e, via o índice sem filtro de `status`, converte sequestro em negação de configuração com `23505` opaco. **Mérito registrado:** ao contrário dos achados 13-15, este residual estava **escrito** na própria AC — por isso é condição, não bloqueio. | @po (Pax) |
| 2026-08-30 | 0.4 | **Correções da Rodada 2 aplicadas.** N1: `REVOKE UPDATE, DELETE, TRUNCATE` (3 verbos, não 2) + trigger `BEFORE TRUNCATE ... FOR EACH STATEMENT` (herda a AC2), carrasco cobrindo os 4 verbos. N2a: guard de segredo vazio (`P0017`) em `_org_integration_write_secret`. N2b: guard de formato de `page_id` para `meta_ads` (`P0018`, numérico) no mesmo helper; **AC10 nova** — decisão registrada e Task 12 para filtrar `status='connected'` em `resolveOrgByMetaPage` (`webhook-org.ts`), fechando a metade cross-tenant de N2b, com verificação obrigatória do modo de `WEBHOOK_ORG_ROUTING` antes de aplicar. Menores: 3ª asserção do carrasco do UUID com cast `::uuid` explícito (m5/m6, evita `42883`); limite honesto do guard de R4 movido do Dev Notes para dentro da AC5 (m7). | @sm (River) |
| 2026-08-30 | 0.3 | **NO-GO do `@po`, 7,0/10** (`docs/qa/po-validation-900-51.md`) — as 4 propriedades anunciadas (append-only, "nunca grava sem testar", `google` fora, "salvo com sucesso") estavam enforced na rota, não na RPC exposta a `authenticated`. Corrigido: R1 (`REVOKE`+trigger em `platform_audit_log`, contra `BYPASSRLS` medido), R2 (`FOR UPDATE`+`GET DIAGNOSTICS`, o 14º instrumento cego — escrita reportava sucesso com 0 linhas afetadas), R3 (allowlist positiva de provider dentro do helper — `google` era gravável pela RPC direto), R4 (`write_secret`/`mark_connected` separados, guard estrutural), R5 (dependência nomeada do harness de teste da `900-25`, `expect.assertions` mantido mas não mais tratado como catraca suficiente). Recomendadas R6-R9 e menores m1-m4 aplicados (nonce no nome do Vault, FKs `ON DELETE SET NULL`, catraca de allowlist citada, erro técnico movido para decisão de servidor). | @sm (River) |
| 2026-08-30 | 0.5 | **Correções da Rodada 3 (C1-C3) aplicadas — story permanece `Approved`.** C1: registrada a resolução do dono do produto (recusou o fecho `P0019` sugerido pelo `@po` — cliente continua gravando `page_id`, risco aceito conscientemente) + nova AC11 (detecção: alerta em escrita por `org_admin`, alerta em `page_id` que muda de org, os dois via `actor_type` congelado — compensação por auditoria, já que a prevenção foi recusada) + Task 13. C2: AC10/Task 12 reescritas como tabela de decisão dos TRÊS modos de `WEBHOOK_ORG_ROUTING` (não dois) com **gate bloqueante** em `identifier` (não aplicar até a linha `meta_ads` da Trifold estar `connected` — medido: hoje TODAS estão `disconnected`, aplicar sem o gate apagaria o roteamento inteiro). C3: os dois efeitos documentados na AC10 (credencial expirada vira lead perdido, não só sync quebrado — trade aceito, escrito; `org_integrations_meta_page_ativo` sem filtro de `status` converte sequestro em negação de configuração — mitigado com 6º código de erro `page_id_ja_configurado`, Tasks 5.3/6.3). Corrigida a prosa de N2b (o guard `P0018` é higiene de dado, não redução de superfície — medido: o `page_id` real da Trifold, `132027046650861`, passa tão fácil quanto qualquer outro). Achado à parte: a tabela de 5 códigos de erro da v0.2 tinha se perdido na reescrita da v0.3 (AC5 citava uma tabela que não existia mais no corpo do arquivo) — restaurada em Context, agora com 6 códigos. | @sm (River) |

---

## Dev Agent Record

### Agent Model Used
`claude-opus-5[1m]` — @dev (Dex), modo YOLO, 2026-08-30. Branch
`story/900-51-painel-self-service-integracoes`, criada de `origin/main` (`aa584dfb`).

### Debug Log References

#### Camada B — contagem de testes EXECUTADOS (Task 11.3; `0 passed | N skipped` reprova)

```
$ pnpm test:tenancy          # vitest.tenancy.config.ts, contra trifold-crm-dev (xnxvygyfyyyzwhiuoehz)
 Test Files  1 passed (1)
      Tests  28 passed (28)          ← zero skipped, exit 0
```

#### Suíte completa e gates

```
$ pnpm test          Test Files  294 passed (294)   Tests  3763 passed | 6 expected fail (3769)
$ pnpm type-check    Tasks: 8 successful, 8 total
$ pnpm lint          Tasks: 8 successful, 8 total
$ pnpm gate:tenancy  FAIL: 83  WARN: 1   catraca OK — delta +0 (baseline 83, de 2026-08-23)
```

#### Vermelho → verde: 23 mutações, cada uma nomeada, todas revertidas

**Camada B (mutação aplicada à FUNÇÃO no banco de teste, depois reaplicada a `248` limpa):**

| # | Mutação | Resultado |
|---|---|---|
| M1 | `GRANT TRUNCATE` de volta a `service_role` (o furo exato da Rodada 2) | **2 failed** \| 26 passed |
| M2 | `DROP TRIGGER platform_audit_log_sem_truncate` | **2 failed** \| 26 passed |
| M3 | guard `P0017` (segredo vazio) removido | **6 failed** \| 22 passed |
| M4 | `mark_connected` sem o guard de `secret_ref` (R4 revertido) | **1 failed** \| 27 passed |
| M5 | allowlist volta a ser NEGATIVA (`google` grava) | **6 failed** \| 22 passed |
| M6 | detecção cross-org da AC11 removida (`page_id` sai de `metadata`) | **4 failed** \| 24 passed |
| M7 | checagem `v_row_id IS NULL` removida (o 14º cego volta) | **5 failed** \| 23 passed |
| M8 | trigger volta a ser incondicional (colisão R1×R7) | **1 file failed**, 23 passed \| 5 skipped, exit≠0 |
| M9 | exceção do trigger frouxa ("qualquer UPDATE passa") | **3 failed** \| 25 passed |

Estado limpo: **28 passed (28)** em todas as reversões.

**Camada A:**

| # | Mutação | Resultado |
|---|---|---|
| M10 | `.eq("status","connected")` removido de `resolveOrgByMetaPage` | **2 failed** \| 46 passed |
| M11 | `platformQuery` importado dentro de `components/integrations/**` | **1 failed** \| 7 passed |
| M12 | a rota `/dashboard` passa a usar `createAdminClient()` | **1 failed** \| 15 passed (ESLint por AST acusou 2 linhas) |
| M13 | um cron passa a tocar `secret_ref` (AC6) | **2 failed** \| 1 passed |
| M14 | **argumento** do call site `/dashboard`: `incluirDetalheTecnico: false → true` | **1 failed** \| 3 passed — e `escrita.test.ts` seguiu **11 passed** |
| M15 | a rota `/platform` passa a aceitar `orgId` do CORPO | **1 failed** \| 7 passed |
| M16 | `technicalDetail` deixa de ser incluído em `/platform` | **1 failed** \| 7 passed |
| M17 | o disparo do alerta da AC11 removido da rota `/platform` | **1 failed** \| 7 passed |

**Rodada de gate (QA-900-51-1 e -2) — 6 mutações a mais:**

| # | Mutação | Resultado |
|---|---|---|
| M18 | `ehEscritaDePageIdPorCliente → return false` (a mutação exata do `@qa`) | `/dashboard` **1 failed** \| 7 passed — antes deixava os dois testes de rota verdes (12 passed) |
| M19 | disparo removido do call site `/dashboard` (o estado que o `@qa` mediu) | **2 failed** \| 6 passed — e `alertas-page-id.test.ts` seguiu **13 passed** |
| M20 | a montagem volta a ler a linha `whatsapp` de `org_integrations` | **3 failed** \| 12 passed |
| M21 | `derivarEstadoDoTileWhatsapp` ignora `phone_number_id` | **1 failed** \| 14 passed |
| M22 | `/platform` passa a selecionar a credencial de WhatsApp | **1 failed** \| 4 passed |
| M23 | *(descartada)* régua de existência: apagar o ramo do whatsapp no `/platform` | **PASSOU (5 passed)** — ver abaixo |

**M23 é o achado da própria correção, e por isso está na tabela.** A primeira versão do conserto de
QA-900-51-2 deixou a montagem inline nas duas páginas e apostou numa régua estática ("as duas
páginas mencionam a função de derivação"). Apagar o ramo `if (l.provider === "whatsapp")` do
`/platform` deixava a régua **verde**, porque o `import` sobrevive à remoção do uso — o defeito
original voltava inteiro sem nada acender. **Guarda de existência não é guarda de cobertura.**
Conserto: a montagem virou `montarTilesDoPainel()`, testada com o estado real de produção; não há
mais ramo por página para apagar, e a mesma mutação passou a reprovar (M20).

**Sobre M14, que é o motivo de os testes de rota existirem.** `escrita.test.ts` já provava que
`montarRespostaDeErro` omite `technicalDetail` com `incluirDetalheTecnico: false`. Isso **não**
prova a propriedade da AC5 — quem decide o valor do argumento é a ROTA. Medido: trocar `false` por
`true` no call site deixa **todo** o `escrita.test.ts` verde (11 passed) e vaza o erro bruto do
provider para o navegador do cliente. Mutar o helper não bastava; o **call site** e o **argumento**
precisavam de carrasco próprio, e agora têm.

#### Medições de pré-condição (Task 12.1/12.2, C2)

- **`WEBHOOK_ORG_ROUTING` em produção: AUSENTE ⇒ modo `both`.** Comando executado:
  `GET https://api.vercel.com/v9/projects/prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj/env` com o token da CLI
  local → **`403 forbidden`**. Isto é medição do meu ACESSO, não do valor, e está dito como tal.
  As três evidências que sustentam "ausente": (a) o projeto que o token ALCANÇA
  (`prj_KMm5f2ya…`, 59 vars) não tem a variável; (b) `grep` no repositório inteiro: nenhum
  `.json`/`.yaml`/`.env` a define — só código e documentação; (c) registro do `@devops`
  (`project_epic900_onda2_producao`): a gravação em produção **falhou por 403** e ficou pendente.
  `decidirModoRoteamento()` nunca lança e cai em `"both"` para variável ausente.
  **Decisão (tabela da AC10): `both` ⇒ aplicar sem pré-condição.**
- **Medição extra, não pedida, que reforça o gate** — produção, somente leitura, agregado:
  a linha `meta_ads` da org `trifold` está `status='disconnected'` **e com
  `config->>'page_id'` NULO**. Ou seja, `resolveOrgByMetaPage` já não casava nenhuma linha em
  produção nem *antes* do filtro. Em `identifier` o gate da AC10 continuaria bloqueante — não por
  causa do `status`, mas porque não há `page_id` gravado.
- **Task 11.4 — sequenciamento `248` × `900-25`: sem conflito, medido.** O teardown da `900-25`
  deriva as FKs bloqueantes de `pg_constraint` filtrando `confdeltype NOT IN ('c','n')`, ou seja,
  ele **exclui** `ON DELETE SET NULL`. Como as duas FKs da `248` são `SET NULL`, ela acrescenta
  **zero** FK bloqueante. Nada a avisar ao `@qa` da `900-25`.

#### `248` aplicada em `trifold-crm-dev` e registrada no ledger

```
sha256 = b113b85e8f086e5279949421770002709c9bfe249f5c0db5fba0aac4fca2dc3c
trifold_migrations_aplicadas ← ('248_painel_integracoes_self_service.sql', <sha>, 'apply')
```
**Não aplicada em produção** — é passo de runbook do `@devops`.

### Completion Notes List

#### 1. ACHADO — os consertos de R1 e R7 colidiam, e só a Camada B viu

Rodando os carrascos de AC7 pela primeira vez:

```
DELETE FROM users WHERE id = <ator que já agiu>;
→ ERROR: P0020: platform_audit_log é append-only — UPDATE não é permitido
  CONTEXT: SQL statement "UPDATE ONLY public.platform_audit_log SET actor_user_id = NULL …"
```

`ON DELETE SET NULL` é implementado pelo Postgres como um **UPDATE interno**; um trigger
`BEFORE UPDATE` incondicional o intercepta. Consequência: a FK que existia para a trilha
sobreviver à org e ao usuário (R7) ficava **inerte**, e apagar uma org voltava a ser bloqueado —
com erro opaco (`P0020`) em vez de `23503`. E o teardown da `900-25`, que exclui `SET NULL` da
derivação, **nunca saberia** que precisava tratar esta FK.

**Conserto:** exceção cirúrgica no trigger — passa apenas o UPDATE que NULIFICA
`actor_user_id`/`org_id` deixando `id`, `actor_type`, `action`, `target_*`, `metadata` e
`created_at` idênticos. Carrasco nos dois sentidos (`dono_altera_action`, `dono_altera_metadata`,
`dono_reaponta_ator` → todos `P0020`; `delete_da_org` → `ok`), e a mutação M9 prova que uma exceção
frouxa reprova. **Residual declarado** (registrado em `docs/backlog.md`): o DONO da tabela passa a
poder apagar a atribuição de uma linha. Para os demais roles continua impossível pelo `REVOKE`
(que vale contra `BYPASSRLS`), e a identidade sobrevive em `metadata->>'actor_label'`, congelada.

#### 2. Divergências entre story e código — três, todas para cima ou para baixo, nenhuma silenciosa

**(a) `whatsapp` ficou SOMENTE LEITURA no painel — escopo REDUZIDO.** A AC4 diz "`whatsapp`
(grava em `whatsapp_config`)". Não implementei essa escrita. Razões, na ordem em que pesaram:
o Scope IN da `248` lista **apenas** helpers de `org_integrations` e a AC1 fixa "8 funções
públicas" — não existe ponto de entrada auditado para escrever `whatsapp_config`, e `platform_audit`
está `REVOKE`ada de `authenticated`; uma escrita self-service **sem trilha** contradiria a AC2 e a
AC11, cujo ponto inteiro é que todo ato de configuração deixe rastro; `_org_integration_write_secret`
levanta `P0010` para `whatsapp` por desenho (carrasco 4 do `@po` **exige** isso); e o segredo iria
em claro para `whatsapp_config.access_token`, cuja migração para o Vault está no **OUT** da story.
O tile existe, mostra o estado real (lido de `whatsapp_config`) e explica por escrito onde a
configuração acontece. **É uma redução de escopo e precisa de decisão do `@po`/dono do produto.**

**(b) `PLATFORM_READABLE_TABLES` ganhou DUAS tabelas, não uma — escopo AMPLIADO.** A AC3 nomeia só
`org_integrations`. Acrescentei também `platform_audit_log`, porque a AC2/AC7/AC11 exigem que o
painel LEIA a trilha, e dentro de `app/api/platform/**` a alternativa seria um `.from()` cru, que
`platform-query-scan.ts` proíbe com razão. O teste literal de `platform-query.test.ts` foi
atualizado (com o motivo escrito), não afrouxado.

**(c) `P0021` existe e não está na story.** Os pontos de entrada `_as_org` recusam chamador sem
sessão, sem org ou sem a capability com um código próprio. A story enumera `P0010`–`P0020`;
`P0019` ficou **deliberadamente não alocado** (era o fecho recusado pelo dono do produto em C1) e
está comentado como tal na migration, para ninguém o reusar achando que a decisão foi outra.

#### 3. `_as_org` não aceita `p_org_id` — endurecimento sobre o texto da AC1

A AC1 diz que `_as_org` "reforça `org_id = user_org_id()`". Implementei mais forte: as quatro
funções `_as_org` **não têm parâmetro de org nem de ator**. A org vem de `user_org_id()`, o ator de
`auth.uid()`, e `actor_type` é a constante `'org_admin'` — é isso que torna o `actor_type` da AC11
confiável como discriminante de alerta, em vez de um campo que o chamador escolhe.

#### 4. O limite honesto da AC11, que a story não podia prever

Os dois alertas leem de `platform_audit_log` (captura do banco, impossível de pular) mas o
**disparo** é chamado pelas rotas. Uma chamada DIRETA à RPC — o caminho que motiva a AC11 — grava
a linha de auditoria e **não** dispara o Telegram no mesmo instante, porque nada em application
code rodou. A trilha fica; o aviso imediato, não. Fechar isso exigiria um gatilho de banco falando
com a rede, que este repositório não tem e que esta story não inventa.
`linhasQueMerecemAlerta()` é escrita para varrer uma JANELA de linhas — é o ponto de extensão para
um cron, se a Onda 7 quiser encurtar a janela. Está escrito no cabeçalho do módulo.

#### 4b. QA-900-51-1 — a detecção da AC11 não tinha caminho alcançável (CORRIGIDO)

O `@qa` mediu o que a nota 4 acima **não** viu: `dispararAlertasDeAuditoria` tinha **um único call
site**, a rota `/platform`, onde toda escrita é `platform_admin` por construção. A janela lida
nunca continha `org_admin` — logo o **Alerta 1 não tinha caminho alcançável nenhum**, e sondar o
handler real do `/dashboard` dava `200`, as 2 RPCs e **0 alertas**. O caminho NORMAL do cliente,
que é exatamente o que o dono do produto abriu ao recusar a prevenção em C1, não avisava.

**O limite que eu tinha escrito era mais estreito que o limite real** — declarei que só a "chamada
DIRETA à RPC" ficava sem aviso, quando o painel inteiro do cliente também ficava. E é a mesma
classe da minha própria mutação M14 (quem escolhe/chama é a rota; o teste do helper não vê): apliquei
a lição ao `technicalDetail` e não apliquei aqui.

**Conserto:** `alertarAposEscritaDeIntegracao()` é o ÚNICO ponto de disparo e as **duas** rotas o
chamam; a janela passou a filtrar por `metadata->>provider`. O carrasco vive nos testes de rota,
com mutação no call site (M18/M19) — a mutação do `@qa` agora reprova onde antes ficava verde.

#### 4c. QA-900-51-2 — o tile lia uma fonte que não decide o fato (CORRIGIDO)

Medido pelo `@qa` e reconferido por mim em produção, pela Management API, somente leitura:

```
whatsapp_config   → status='active', access_token PRESENTE, phone_number_id PRESENTE
org_integrations  → provider='whatsapp', status='disconnected'
```

O tile do `/platform` era montado só de `org_integrations` — uma linha **estruturalmente
inescrevível** (`CHECK` da `247` + `P0010`) que nasce `disconnected` e nunca é promovida. Resultado:
o canal que atende o cliente estava no ar e o painel do **dono do produto** dizia "Não conectado".
O `/dashboard` sobrescrevia e acertava. Mesmo componente, duas telas, discordando do mesmo fato.

A pergunta que faltou: *"a fonte que este tile lê é a fonte que decide este estado?"*

**Conserto:** montagem única (`montarTilesDoPainel`), lendo `whatsapp_config` nas duas superfícies
— e só `status`/`phone_number_id`/`updated_at`, **nunca a credencial**: puxá-la para o painel da
Trifold seria impersonation com outro nome (D14/AC6), e há régua nova que reprova a menção dela em
toda a árvore de `/platform`. `whatsapp_config` entrou em `PLATFORM_READABLE_TABLES` (terceira
extensão declarada; teste literal atualizado com o motivo).

**Agravante de comunicação, também corrigido:** o cartão mandava o usuário para "o fluxo de
WhatsApp", que **não existe** — medido: 32 call sites LEEM `whatsapp_config` em `packages/web/src`
e **zero** escrevem. O texto agora diz a verdade: configuração de WhatsApp hoje não tem caminho na
aplicação, e as stories `900-52`/`53`/`54` é que o abrem. **O pedido do dono do produto fica
cumprido para 4 dos 5 canais; o de produção, não.**

#### 4d. `validarMetaAds` não prova posse da Página — investigado e registrado

`GET /{page_id}?fields=id,name` pede **metadados públicos**: `id` e `name` são legíveis com
qualquer token válido da Meta, sem papel na Página. A validação prova "token válido" + "a Página
existe" — **não** "quem grava administra esta Página". Isso importa porque o parecer do `@po`
escreveu que *"a rota valida a posse da Página contra a Graph API"*, e a decisão C1 do dono do
produto foi tomada com essa frase no contexto: se nada prova posse, o único freio real é a
**detecção** da AC11, e o risco aceito é maior do que o registro sugere.

**RACIOCINADO a partir do contrato da Graph API, NÃO MEDIDO** — não há credencial real aqui.
**Não troquei o probe de propósito:** é chamada de rede que não consigo exercitar, e um probe
errado tornaria `meta_ads` inconfigurável em produção por um caminho sem teste. Registrado em
`docs/backlog.md` com o experimento (dois tokens, um admin e um não-admin, contra o mesmo
`page_id`) e o probe recomendado (`/{page_id}/leadgen_forms`, que exige `leads_retrieval` + papel
na Página, ou `fields=access_token`).

**Achado adjacente, medido:** `fetchLeadData` (`lib/meta/process-lead.ts:504`) usa
`process.env.META_PAGE_ACCESS_TOKEN` — env var **global**, não o token por org. A credencial
`meta_ads` que o painel grava **ainda não é consumida por ninguém**. Coerente com a AC6, e
significa que hoje uma credencial `meta_ads` no painel não muda comportamento nenhum.

#### 5. Task 11.1 — `900-25` NÃO estava mergeada; decisão registrada

Medido: `vitest.tenancy.config.ts` **ausente** em `origin/main` (PR #531 aberto). Repliquei
`vitest.tenancy.config.ts`, `tests/tenancy/support/ambiente.ts` e o script `test:tenancy`
**byte-idênticos** ao branch da `900-25` (provado por `shasum -a 256` contra
`git show story/900-25-…:<path>` — `b71b5afa…` e `c439642f…`). Cópia idêntica colapsa num merge
trivial ("both added, same content") em vez de criar uma segunda fonte de verdade do harness.
O único arquivo NOVO de suporte é `tests/tenancy/support/sql-transacional.ts`, que não existe na
`900-25` e cobre uma necessidade que ela não tem (`BEGIN…ROLLBACK` via Management API).

#### 6. O que NÃO consegui provar

- **`WEBHOOK_ORG_ROUTING` lido diretamente do projeto de produção.** O token desta máquina recebe
  `403` no projeto canônico (`team_XCf2jBxUmCXao0prWVy0VmOZ`). A conclusão "ausente ⇒ `both`" vem
  de três evidências indiretas, listadas acima, não de uma leitura. **Reconfirmar no dia do
  deploy, com token que alcance o projeto.**
- **Teste manual ponta a ponta** (`meta_capi` ou `sienge`, Testing/Manual). Exige credencial real
  de provider, que não tenho. As rotas foram exercitadas por Camada A (sequência, contrato de erro,
  ausência de `technicalDetail`) e as RPCs por Camada B contra o Postgres real — nenhuma das duas
  substitui a chamada de rede verdadeira.
- **`P0013`/`P0016` (`ROW_COUNT <> 1`) não têm carrasco.** São defesa em profundidade contra uma
  linha desaparecer entre o `SELECT … FOR UPDATE` e o `UPDATE`, e o `FOR UPDATE` torna esse
  cenário inalcançável de dentro de uma transação de teste. Dito aqui em vez de fingido coberto.
- **CodeRabbit não foi executado** — CLI 0.7.5 nesta máquina falhou em execuções anteriores
  (`WebSocket closed`) e o gatilho que vale é o App do GitHub, no PR. Não executado ≠ passou.

### File List

**Criados**
- `supabase/migrations/248_painel_integracoes_self_service.sql`
- `packages/web/src/lib/integrations/painel/providers.ts`
- `packages/web/src/lib/integrations/painel/erros.ts`
- `packages/web/src/lib/integrations/painel/validacao.ts`
- `packages/web/src/lib/integrations/painel/escrita.ts`
- `packages/web/src/lib/integrations/painel/alertas-page-id.ts`
- `packages/web/src/lib/integrations/painel/escrita.test.ts`
- `packages/web/src/lib/integrations/painel/providers.test.ts`
- `packages/web/src/lib/integrations/painel/alertas-page-id.test.ts`
- `packages/web/src/lib/integrations/painel/nao-consumo.test.ts`
- `packages/web/src/components/integrations/integrations-panel.tsx`
- `packages/web/src/app/platform/orgs/[id]/integracoes/page.tsx`
- `packages/web/src/app/api/platform/orgs/[id]/integracoes/route.ts`
- `packages/web/src/app/api/platform/orgs/[id]/integracoes/revelar/route.ts`
- `packages/web/src/app/api/configuracoes/integracoes/route.ts`
- `packages/web/src/app/api/configuracoes/integracoes/revelar/route.ts`
- `packages/web/src/lib/tenancy/dashboard-platform-boundary.test.ts`
- `packages/web/src/app/api/configuracoes/integracoes/route.test.ts`
- `packages/web/src/app/api/platform/orgs/[id]/integracoes/route.test.ts`
- `tests/tenancy/integracoes-painel.test.ts`
- `tests/tenancy/support/sql-transacional.ts`
- `tests/tenancy/support/ambiente.ts` *(réplica byte-idêntica da `900-25` — Task 11.1)*
- `vitest.tenancy.config.ts` *(réplica byte-idêntica da `900-25` — Task 11.1)*

**Modificados**
- `packages/web/src/lib/tenancy/platform-query.ts` — AC3 (+`org_integrations`, +`platform_audit_log`)
- `packages/web/src/lib/tenancy/platform-query.test.ts` — literal da lista atualizado, com o motivo
- `packages/web/src/lib/tenancy/webhook-org.ts` — AC10/Task 12.3 e 12.5 (filtro + comentário reescrito)
- `packages/web/src/lib/tenancy/webhook-org.test.ts` — Task 12.4 (o teste que travava a decisão antiga foi SUBSTITUÍDO)
- `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` — AC4 (estendida, cards preservados)
- `docs/audits/admin-client-allowlist.json` — AC8 (+2 em `plataforma`)
- `scripts/admin-client-allowlist.test.ts` — `TOTAL_ESPERADO` 240 → 242
- `docs/backlog.md` — Task 10 (nota no item `900-16` + item novo do residual do trigger)
- `package.json` — script `test:tenancy` (réplica da `900-25`)

---

## QA Results

### Gate: 🟡 **CONCERNS** — 2 concerns, as duas bloqueiam o merge · @qa (Quinn) · 2026-08-30
`docs/qa/gates/900.51-painel-self-service-integracoes-por-org.yml` · árvore não commitada, de
`origin/main` (`aa584dfb`).

**O defeito unificador está fechado, e fechado onde tinha de ser.** Não li a lista de
`GRANT`/`REVOKE` do arquivo — consultei `has_function_privilege` para as 14 funções da `248` no
`trifold-crm-dev`. Das 14, **exatamente 4** têm `EXECUTE` para `authenticated`: os quatro `_as_org`,
que não têm parâmetro de org nem de ator. Os 4 `_as_platform`, os 5 helpers privados e
`platform_audit()` dão `false` para `authenticated` e `false` para `anon`. Todas `SECURITY DEFINER`
com `search_path` pinado. É a superfície mais estreita possível para o que a story se propõe.

**O achado R1×R7 é real e a exceção é mesmo cirúrgica.** Medi contra a **função viva**
(`pg_get_functiondef`), não o arquivo, com 8 mutações de FORMA em `BEGIN…ROLLBACK`: reapontar
`org_id` para outra org → `P0020`; reapontar o ator → `P0020`; `metadata`, `created_at`,
`actor_type`, `action` → `P0020`; `DELETE` → `P0020`; **só** a nulificação das duas colunas de
atribuição passa. O predicado cobre as 9 colunas da tabela — não sobra coluna fora dele. Privilégios
vivos: `sr_ins=true` / `sr_upd=false` / `sr_del=false` / `sr_trunc=false`, 3 triggers, RLS ligada.

**A M14 está certa e os dois testes de rota fecham o argumento.** Confirmei com a mutação inversa,
que é a que discrimina — ver concern 1.

**Números que eu mesmo rodei:** `pnpm test` **293 files / 3742 passed** · `pnpm test:tenancy`
**28 passed / 0 skipped** · `gate:tenancy` delta **+0** sobre 83 · `turbo type-check --force` e
`turbo lint --force` verdes (0 erros; 30 warnings, **nenhum** em arquivo desta story).

---

#### 🔴 QA-900-51-1 (high, bloqueia merge) — o alerta 1 da AC11 não tem caminho de chamada alcançável

É a família da própria M14 (*"quem escolhe o valor é a rota, não o helper"*), aplicada ao
`technicalDetail` e **não** à AC11.

C1 registra uma troca explícita: o dono do produto recusou a prevenção (`P0019`) e, em
contrapartida, *"a detecção vira obrigatória (AC11)"*. O alerta 1 é a metade da contrapartida que
corresponde ao caminho aberto — *"alerta quando `page_id` é gravado por `org_admin`"*. Medido:

1. `dispararAlertasDeAuditoria` tem **1** call site em produção:
   `app/api/platform/orgs/[id]/integracoes/route.ts:117`. A rota do cliente
   (`app/api/configuracoes/integracoes/route.ts`) não a importa.
2. Sonda com o handler REAL do `/dashboard`, `org_admin` gravando `meta_ads` com
   `page_id: "132027046650861"`: `200` · RPCs `[write_secret_as_org, mark_connected_as_org]` ·
   **alertas = 0**. `platform_audit_log` nunca é lido nesse caminho.
3. Mesmo na `/platform` o alerta 1 é estruturalmente inalcançável: `alertarSeNecessario` lê as **2**
   últimas linhas da trilha *depois* da escrita, e a escrita acabou de inserir 2 linhas
   `platform_admin`. A janela nunca contém `org_admin`.
4. **Mutação inversa:** `ehEscritaDePageIdPorCliente → return false` deixa os **dois** testes de
   rota verdes (`12 passed`); só o teste do helper acende (`5 failed`).

O que funciona e precisa ficar dito: a **captura** é do banco e está íntegra — `page_id` entra em
`metadata` e `page_id_reassigned_cross_org` é decidido dentro da transação, para os dois
`actor_type`. O **alerta 2** funciona, com controle negativo. Nada é perdido; falta o aviso proativo
no caminho do cliente.

O limite declarado em `alertas-page-id.ts` (*"uma chamada DIRETA à RPC … não dispara o Telegram"*)
é mais estreito que o limite real: lido de boa-fé, ele afirma que as rotas do painel disparam. A
rota do painel que o `org_admin` usa não dispara.

---

#### 🟡 QA-900-51-2 (medium, bloqueia merge) — o tile de WhatsApp em `/platform` afirma um estado que nunca lê

O 18º cego desta onda, e ele é da tela, não da RPC.

`app/platform/orgs/[id]/integracoes/page.tsx` monta os tiles mapeando **só** `org_integrations`. O
tile `whatsapp` recebe `org_integrations.whatsapp.status` — uma linha estruturalmente inescrevível
(`CHECK whatsapp_sem_identificador_proprio` da `247` + `P0010` no helper), que nasce `disconnected`
e não tem caminho que a mude. Medido em produção (somente leitura, metadados):

```
org_integrations → whatsapp/disconnected, secret_ref NULL
whatsapp_config  → access_token PRESENTE, phone_number_id PRESENTE
```

Para a empresa cujo WhatsApp está **no ar**, o painel `/platform` exibe "Não conectado". A
superfície irmã acerta: o `/dashboard` sobrescreve o tile a partir de `waConfig?.access_token`. As
duas telas usam o **mesmo componente** e discordam sobre o mesmo fato — e a que erra é a do dono do
produto. Nenhum teste cobre a montagem dos tiles.

Por que é o 18º: a RPC ganhou instrumento para tudo que ela pode observar de si (`ROW_COUNT`,
`v_row_id IS NULL`, allowlist, `btrim`, `FOR UPDATE`). A tela não ganhou nenhum — ninguém perguntou
*"a fonte que este tile lê é a fonte que decide este estado?"*. Para 4 dos 5 tiles a resposta é sim
por construção; para o quinto é não, e é justamente o único cujo dado vive em outra tabela.

---

#### As três divergências — julgadas

**(a) `whatsapp` somente-leitura — redução real.** A justificativa técnica **procede** e é a decisão
certa: escrever `whatsapp_config` aqui seria escrita **sem trilha**, contradizendo AC2/AC11, e o
`P0010` + o `CHECK` da `247` fecham o caminho por desenho. As três fatias `900-52`/`53`/`54` (todas
`Draft`, a `900-54` explicitamente GATED) são o encaminhamento correto. A honestidade na story é
**suficiente** (Dev Agent Record 2a + Change Log v0.6), com a aspereza de a `AC4` seguir dizendo
"grava em `whatsapp_config`" — correto que siga, o `@dev` não edita AC; cabe ao `@po` corrigir ou
registrar o waiver.
**A comunicação ao usuário NÃO passa:** o cartão diz *"a configuração continua no fluxo de
WhatsApp"* e eu medi que esse fluxo **não existe** — zero `.update`/`.upsert`/`.insert` sobre
`from("whatsapp_config")` em todo `packages/web/src`. O texto manda o usuário para um lugar que não
há, e ainda cita o nome de um `CHECK` de banco para um leitor de painel.
**Consequência de produto, sem suavizar:** o pedido era *"ele cadastra a empresa nova e preenche as
chaves dela"*. Para o canal de **produção** isso continua não sendo possível pelo painel. Para os
outros 4, sim.

**(b) `PLATFORM_READABLE_TABLES` +`platform_audit_log` — aprovada.** Entrou com justificativa **por
tabela** no comentário de `platform-query.ts` (a de `platform_audit_log` dizendo em voz alta "NÃO
está escrito na AC3"), e o teste literal foi **atualizado com o motivo escrito**, não afrouxado nem
derivado da fonte que ele vigia. É exatamente o que a regra de crescimento pede. SEC-001 (embedding)
segue aberto com dono (`900-42a`) e a nova entrada não o agrava — `users` e `organizations` já
estavam na lista.

**(c) `P0021` acrescentado, `P0019` não alocado — aprovada.** `248:30-34` **registra a recusa**:
nomeia quem propôs, quem recusou, quando e por quê, e diz que o código fica vago *"para que ninguém
o reuse achando que a decisão foi outra"*. Não esconde nada.

---

#### As quatro renúncias — julgadas

- **`WEBHOOK_ORG_ROUTING` (403):** **aceita**, e a conclusão **não depende** da leitura que faltou.
  Medi em produção que a linha `meta_ads` tem `config->>'page_id'` **NULO** — `resolveOrgByMetaPage`
  casa por esse campo, então **nenhuma linha casa, em qualquer modo**, com ou sem o filtro. A
  medição extra do `@dev` é o que sustenta a decisão, não o default. Confirmei o default no código:
  `decidirModoRoteamento()` devolve `"both"` para qualquer valor que não seja exatamente
  `legacy`/`identifier` — inclusive ausente e inclusive erro de grafia; não lança.
- **Teste manual ponta a ponta:** **aceita** como impossibilidade, mas ela carrega uma pergunta sem
  dono. `validarMetaAds` testa com `GET /{page_id}?fields=id,name` — campos **públicos** do nó
  Página; não consulta `roles`, `tasks` nem `/me/accounts`. Se a Graph API responder isso a um token
  válido que **não** administra aquela Página, a "chamada de teste" não prova posse, e a frase da
  `248` (*"só a chamada de teste na rota … prova isso"*) fica maior que o mecanismo — quarta vez com
  a mesma lente. **Não afirmo que é assim: não medi, por falta de credencial.** É a pergunta que o
  teste manual precisa responder antes de `identifier`, e é ela que decide o tamanho real do risco
  aceito em C1.
- **`P0013`/`P0016` sem carrasco:** **aceita**, e a razão é boa — o `FOR UPDATE` torna o cenário
  inalcançável de dentro da transação, e foi dito em vez de fingido coberto. O caminho que importa
  (`P0012`) tem carrasco e tem mutação.
- **CodeRabbit não executado:** **aceita**; *"não executado ≠ passou"* está certo. Eu também não
  executei — o gatilho que vale é o App no PR.

---

#### Higiene da medição
Tudo em `BEGIN…ROLLBACK` ou leitura de catálogo. Banco de teste depois de mim: `platform_audit_log`
**0**, `org_integrations` **6**, `organizations` **1**, `vault.secrets` **0** — zero resíduo,
conferido. Produção: **somente leitura**, só agregados e metadados; nenhum acesso a `messages`,
`webhook_logs` ou conteúdo de conversa. Árvore de trabalho idêntica ao início; o único efeito
colateral foi `docs/audits/gate-tenancy-report.json`, regravado pelo `pnpm gate:tenancy` e
restaurado com `git checkout --`.

**Duas armadilhas do meu próprio instrumento, registradas no gate:** (1) `.select(…, { head: true })`
devolveu `error: null` para uma tabela **inexistente** e quase me fez registrar que a `248` estava em
produção — requisição `head` não discrimina "vazia" de "inexistente"; (2) no carrasco de cirurgia do
trigger, o banco de teste ter **1 org só** transformou minha mutação "reaponta para outra org" numa
nulificação, que o trigger permite por desenho — falso positivo pego pela chave de pré-condição do
setup.

**Confirmado:** a `248` **não** está em produção (`PGRST205` na tabela, `PGRST202` nas RPCs, ledger
em `247`). É runbook do `@devops`.

— Quinn, guardião da qualidade 🛡️
