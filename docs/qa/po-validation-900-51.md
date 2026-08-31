# Parecer do `@po` — Story 900-51 (Painel Self-Service de Integrações por Empresa)

- **Story:** `docs/stories/900-51-painel-self-service-integracoes-por-org.story.md` (v0.2, AC1-AC9)
- **Autor do draft:** @sm (River) · **Validado por:** @po (Pax) · **Data:** 2026-08-30 · **Rodada 1**

## Veredicto: 🔴 **NO-GO** — 5 correções obrigatórias, 4 recomendadas, 4 menores

**Score: 7.0/10.** O desenho de produto está certo e as duas correções que o `@sm` fez às minhas
afirmações **procedem** (conferi as duas). O que reprova é uniforme e é uma frase só: **as quatro
propriedades que a story anuncia — trilha append-only, "nunca grava sem testar", "`google` fora do
escopo de escrita" e "salvo com sucesso" — são todas enforced na camada errada.** As três primeiras
vivem na rota Next; a superfície que o cliente realmente alcança é a RPC, que está
`GRANT EXECUTE ... TO authenticated`. E a quarta reporta sucesso escrevendo zero linhas.

Medi tudo contra o Postgres de `trifold-crm-dev` (transações com `ROLLBACK`, zero resíduo) e
contra o Vitest instalado.

---

## Respostas diretas às cinco perguntas do coordenador

### 1. `whatsapp_config` × `org_integrations` — ✅ **não há duas fontes de verdade**

É a parte mais sólida da story. Escrita de WhatsApp só em `whatsapp_config`; leitura do tile só de
`whatsapp_config.status`; o helper da AC1 **recusa** `p_provider = 'whatsapp'` com `RAISE`. E não
é só convenção: a migration `247` cria
`ALTER TABLE org_integrations ADD CONSTRAINT whatsapp_sem_identificador_proprio CHECK (...)`, que
torna a segunda gaveta **impossível no banco**, não só desaconselhada. A invariante é estrutural.

O mesmo raciocínio aplicado a `google` (`organizations.google_oauth_tokens`) e a `meta_ads`
(`meta_ad_accounts` × `org_integrations.meta_ads`) está correto e bem argumentado — a
disambiguação do tile ("Meta — Recebimento de Leads") é a decisão certa. **Mas o `google` não tem
o `CHECK` que o `whatsapp` tem, e é por aí que ele volta — ver R3.**

### 2. Os dois carrascos exigidos — **rodei os dois. Existem como AC, e nenhum dos dois cobre o caminho que importa.**

**(a) Badge "Conectado" bidirecional (AC5).** Está escrito, e nos dois sentidos (`secret_ref = NULL`
⇒ "Não conectado"; `secret_ref` real ⇒ "Conectado"). O que ele prova é que **o badge espelha
`secret_ref`**. O que ele **não** prova é o que o badge significa: `status='connected'` é escrito
pela RPC junto com o segredo, sem nenhuma prova de que a validação aconteceu — e a RPC é
alcançável sem passar pela rota que valida (R4). O carrasco está certo e é insuficiente.

**(b) Segredo com UUID plantado (AC1).** Bem redigido — o `@sm` entendeu exatamente por que
`grep "token"` passaria sem nunca ter havido segredo. **Mas o teste, como está, também passa se a
gravação não tiver acontecido**: se `_org_integration_write_secret` cair no no-op silencioso (R2),
o UUID **está** em `vault.decrypted_secrets` (o `create_secret` roda antes do `UPDATE`) e **não
está** em nenhuma resposta HTTP — as duas asserções (a) e (b) ficam **verdes** com
`org_integrations.secret_ref` ainda `NULL`. O carrasco precisa de uma terceira asserção:
`org_integrations.secret_ref` daquele `(org, provider)` **aponta para o segredo plantado**.

### 3. Validação síncrona antes de `connected` — ✅ **segura, e é a escolha certa**

O valor vem do POST, é testado em memória e vai direto ao Vault. **Não há round-trip de
decifragem** — o segredo nunca é lido de volta, que é a propriedade mais valiosa do desenho e o
que sustenta "o segredo nunca volta ao navegador". Aprovo sem ressalva de mérito.

Legibilidade para os dois públicos: o contrato de 5 códigos resolve bem, e o reuso é **real**, não
alegado — conferi `packages/web/src/app/api/meta-ads/account/test/route.ts:55-58`
(`MetaOAuthException` → `token_invalid`, `MetaPermissionError` → `permission_denied`). O bloco
"Detalhes técnicos" só para platform admin é a decisão certa — com a ressalva R9 (esconder no
render não é esconder).

Duas ressalvas de higiene para o Dev Notes, nenhuma bloqueante: o segredo viaja como **parâmetro
de RPC**, logo aparece em `pg_stat_activity.query` enquanto executa (e em log de statement, se
algum dia for ligado); e uma falha de rede entre `vault.create_secret` e o `UPDATE` deixa segredo
órfão — hoje mitigado por serem a mesma transação, o que vale dizer por escrito.

### 4. `expect.assertions(n)` — 🔴 **decorativo para exatamente o modo de falha que ele foi importado para consertar**

Medido, os dois lados:

```
# teste que RODA com contagem errada:
Error: expected number of assertions to be 2, but got 1
 Test Files  1 failed (1)                                    EXIT=1     ← funciona ✅

# suíte inteira PULADA, com expect.assertions(3) e expect(1).toBe(2) dentro:
 Test Files  1 skipped (1)
      Tests  2 skipped (2)                                   EXIT=0     ← inerte ❌
```

`expect.assertions` **nunca executa num teste pulado**. E o defeito da `900-25` era precisamente
"suíte inteira em skip, exit 0". A lição foi aplicada **pelo nome, não pelo mecanismo**. Ver R5 —
que inclui um agravante que a story não endereça: ela não diz sob qual config a Camada B roda, e
o aparato que resolve isso é entregue pela `900-25`, ainda não mergeada.

### 5. `platform_audit_log` append-only — 🔴 **nasce forjável. Medido.**

```
SELECT rolname, rolbypassrls FROM pg_roles;
 → service_role: true   |   authenticated: false   |   anon: false
```

`service_role` **bypassa RLS**. A AC2 diz *"Nenhuma policy de UPDATE/DELETE — nem para
service_role via aplicação nenhuma"* — ausência de policy não faz **nada** contra um role
`BYPASSRLS`, e o grant padrão do Supabase já dá UPDATE/DELETE a ele (medido numa tabela existente:
`has_table_privilege('service_role','system_events','DELETE') = true`). As rotas `/platform` desta
story usam `createAdminClient()`, que é `service_role`. Ver R1 — com o conserto medido.

---

## 🔴 Correções OBRIGATÓRIAS

### R1 — A trilha é reescrevível e apagável pela própria superfície que ela audita

Além do medido acima: `authenticated` **é** contido pela ausência de policy (RLS vale para ele), e
é por isso que a AC2 parece funcionar quando se lê só o lado do cliente. O buraco é inteiro do
lado `/platform`, que é justamente o ator que a trilha existe para responsabilizar.

**Conserto, medido em transação com `ROLLBACK`:**

```
antes:   sr_del=true   sr_upd=true
REVOKE UPDATE, DELETE ON platform_audit_log FROM service_role, authenticated, anon, PUBLIC;
depois:  sr_del=false  sr_upd=false  sr_ins=true      ← INSERT preservado
```

`REVOKE` **é** enforced para role `BYPASSRLS` — `bypassrls` pula RLS, não `GRANT`. O conserto é uma
linha e preserva exatamente o que precisa ser preservado.

**Exigir:** (a) o `REVOKE` explícito na `248`; (b) trigger `BEFORE UPDATE OR DELETE ON
platform_audit_log ... RAISE EXCEPTION` — o owner (`postgres`) ainda passa pelo `REVOKE`, e
append-only só é atributo de nascimento se o próprio dono tropeçar; (c) **AC de vivacidade nos dois
sentidos**, com `service_role`: `INSERT` **funciona**, `UPDATE` e `DELETE` **levantam erro
nomeado**. Sem esse teste, "append-only" é adjetivo, e o epic diz que é atributo de nascimento.

### R2 — O 14º instrumento cego: a rota reporta "salvo" tendo escrito zero linhas

Rodei o corpo do helper da AC1 em PL/pgSQL real, no cenário "não existe linha em
`org_integrations` para `(org_id, provider)`":

```
resultado: sem excecao | v_row_id=NULL | v_had=NULL | linhas_afetadas=0
```

Passo a passo do que acontece: `SELECT ... INTO` **não levanta** quando não casa (só `INTO STRICT`
levanta) ⇒ `v_row_id = NULL`; `vault.create_secret` **já rodou** e criou o segredo;
`UPDATE ... WHERE id = NULL` afeta **0 linhas, sem erro**; `platform_audit` grava uma linha de
**sucesso** com `had_existing_secret = NULL` (nem `true` nem `false`); a função retorna `void`, a
rota devolve 200.

**O painel então afirma duas coisas contraditórias na mesma sessão: "salvo com sucesso" e, no
tile, "Não conectado".** E o carrasco (b) fica verde (o UUID está no Vault e não está em resposta
nenhuma), e o carrasco (a) fica verde (o badge espelha corretamente um `secret_ref` que continua
`NULL`). **É isto que esta story não consegue observar de si mesma:** ela sabe ler o estado
guardado e sabe vigiar o que sai pela rede, e não tem como perguntar *"a escrita que reportou
sucesso escreveu alguma coisa?"*.

Hoje o cenário é latente (a `246` semeia as 6 linhas por org e faz backfill de todas as orgs
existentes — conferi as 6 linhas no dev). Latente não é ausente: basta um provider novo, uma org
restaurada de backup parcial, ou uma linha apagada à mão.

**Exigir:** `GET DIAGNOSTICS v_n = ROW_COUNT` (ou `UPDATE ... RETURNING id INTO STRICT v_row_id`)
com `RAISE EXCEPTION` em 0 linhas; `v_had_secret := COALESCE(v_had_secret, false)`; e **uma AC que
force o caminho** — chamar a RPC com um `(org_id, provider)` sem linha e exigir **erro**, nunca
sucesso. Mais a terceira asserção do carrasco (b): `org_integrations.secret_ref` aponta para o
segredo plantado.

### R3 — `google` volta pela porta dos fundos: a RPC exposta a `authenticated` não tem allowlist de provider

O Context gasta uma página inteira (e está certo) argumentando que `google` sai do escopo de
escrita: segunda gaveta = segunda fonte de verdade, e D14 proíbe impersonation. Mas o helper só
rejeita `whatsapp`:

```sql
IF p_provider = 'whatsapp' THEN RAISE EXCEPTION '...'; END IF;
```

E `org_integration_set_secret_as_org` é `GRANT EXECUTE ... TO authenticated` — PostgREST expõe a
função. Medi que a linha `google` **existe e está gravável** em `org_integrations` no
`trifold-crm-dev` (`provider=google, status=disconnected, secret_ref IS NULL`). Um `authenticated`
com `configuracoes.integracoes_gerenciar` chama a RPC direto com `p_provider='google'` e cria
exatamente a segunda gaveta que a story existe para não criar — com `status='connected'`, num
provider cujo mecanismo real é `organizations.google_oauth_tokens`.

Note a assimetria: `whatsapp` está protegido em **dois** lugares (o `RAISE` e o `CHECK` da `247`).
`google` não está em nenhum.

**Exigir:** `IF p_provider NOT IN ('meta_ads','meta_capi','sienge','telegram') THEN RAISE
EXCEPTION` dentro do **helper** (lista positiva, não negativa — a lista negativa envelhece a cada
provider novo), com teste dos dois sentidos: os 4 aceitos gravam, `google` e `whatsapp` são
recusados com erro nomeado.

### R4 — "nunca grava sem testar" é falso no caminho alcançável — e é isso que "Conectado" significa

A validação síncrona da AC5 mora **na rota Next**. A RPC `_as_org` está exposta a `authenticated`
e escreve `status = 'connected'` sem receber nenhuma prova de que a validação ocorreu. Logo o selo
"Conectado" garante **"alguém gravou um segredo"**, não "a credencial funciona" — e o caminho que
pula a validação é o mesmo que o cliente já tem permissão de chamar.

Isto não é teórico nem hostil: qualquer script de suporte, qualquer integração futura que chame a
RPC direto (o padrão que a própria story estabelece ao expor `_as_org` a `authenticated`) produz
um tile verde sem credencial testada.

**Exigir uma das duas, explicitamente decidida e escrita:**
- **(a) separar as operações** — a RPC de segredo grava sem tocar `status`; a rota, **depois** de
  validar, chama `org_integration_mark_connected_as_*`. A propriedade passa a ser estrutural: só
  quem validou marca `connected`; ou
- **(b) manter e declarar** — a story escreve, no Context e no texto do tile, o que "Conectado"
  garante, e o carrasco (a) ganha um **terceiro sentido**: chamar a RPC direto, sem passar pela
  rota, e afirmar o comportamento resultante.

Prefiro (a): é a mesma disciplina de "defesa em profundidade" que a própria AC5 usa como
justificativa para re-checar a capability dentro da RPC. Re-checar autorização no banco e deixar
a validação só no app é meio caminho.

### R5 — `expect.assertions(n)` não cobre o modo de falha da `900-25`, e a Camada B não tem casa

Medição no bloco de respostas acima. Dois agravantes que a story não endereça:

1. **A story não diz sob qual config/comando a Camada B roda.** Ela pede `BEGIN…ROLLBACK` contra
   `trifold-crm-dev` — que precisa de credencial. `pnpm test` (raiz, `vitest.config.ts`) **não
   carrega `.env` nenhum** (medido na validação da `900-25`: `TENANCY_TEST_SUPABASE_URL=undefined`,
   `SUPABASE_URL=undefined`).
2. **O aparato que resolve isso é entregue pela `900-25`** — `vitest.tenancy.config.ts`, o
   carregamento de `.env.teste` no topo do config, e o skip que distingue "arquivo ausente"
   (contribuidor externo ⇒ skip) de "loader quebrado" (⇒ falha). A `900-25` **não mergeou**.

**Exigir:** (a) a story nomear config e comando da Camada B, e declarar a dependência do aparato
da `900-25` (ou construir o seu — mas duplicar seria criar a segunda fonte de verdade do próprio
harness); (b) o guard N2 da `900-25` v0.3 replicado: env presente + vars ausentes ⇒ **falha**;
(c) a Task 10.3 ganhar mecanismo em vez de intenção — `expect.assertions` **fica** (ele pega o
caso "o teste rodou e afirmou menos do que devia"), mas a catraca contra o caso que a `900-25`
sofreu é a **contagem de testes executados**, colada no Dev Agent Record, com
`0 passed | N skipped` reprovando.

---

## 🟡 Correções RECOMENDADAS

### R6 — `vault.secrets.name` é UNIQUE: o nome `provider:org_id` cria um beco sem saída

Medido: `secrets_name_idx`, `indisunique = true`. O helper faz
`vault.create_secret(p_secret, p_provider || ':' || p_org_id::text)` **sempre que `secret_ref` é
NULL**. Se algum dia existir um segredo com esse nome enquanto a coluna está `NULL` — limpeza
manual, restore parcial, `secret_ref` zerado por engano — **toda escrita futura daquele
`(org, provider)` falha com um `23505` opaco, para sempre**, e o único conserto é intervenção no
Vault. Exigir recuperação: procurar por nome antes de criar (e adotar o id encontrado), ou incluir
um nonce no nome.

### R7 — A `248` acrescenta a 5ª FK bloqueante para `organizations`, e a 2ª para `users`

`org_id uuid REFERENCES organizations(id)` e `actor_user_id uuid NOT NULL REFERENCES users(id)`,
os dois **sem `ON DELETE`** ⇒ `NO ACTION`. Consequências, nesta ordem de importância:

1. **Apagar uma org passa a exigir apagar a trilha dela** — o oposto de append-only. E apagar um
   usuário que já agiu fica bloqueado.
2. Medi na rodada 2 da `900-25` que hoje são **4** FKs bloqueantes para `organizations`
   (`system_events`, `visit_feedback`, `agent_media_assets`, `financial_notification_log`). A
   `900-25` v0.3 passou a **derivar essa lista de `pg_constraint` em runtime**, então o teardown
   dela **se cura sozinho** quando a `248` entrar. Boa interação — mas só porque a v0.3 já
   corrigiu; se a `248` tivesse chegado antes, teria quebrado o teardown da `900-25`.

**Exigir:** decisão explícita e escrita. Sugiro `ON DELETE SET NULL` em `org_id` (a trilha
sobrevive à org, que é o ponto de uma trilha) e `actor_user_id` sem `NOT NULL`, com o nome do ator
congelado em `metadata` — mesma razão pela qual `actor_type` é coluna congelada e não JOIN, que a
story já argumenta bem.

### R8 — AC9 fecha a fronteira certa; a régua que sustenta a AC8 já existe e não é citada

Concordo com a fronteira escolhida ("`/dashboard` nunca usa `requirePlatformAdmin()`/
`platformQuery()`"), e a correção do `@sm` à minha afirmação **procede**: conferi que
`module-contract.test.ts` testa existência de exportação, não ausência de import. A story cria o
teste em vez de citar um fantasma — certo.

Duas adições:
- **A AC8 tem catraca e não a nomeia.** `scripts/admin-client-allowlist.test.ts` roda **ESLint por
  AST, em subprocesso, dentro do `pnpm test`**, e reprova `createAdminClient()` fora da allowlist
  (ela própria tem célula de vivacidade dos dois lados). A afirmação "a rota `/dashboard` não usa
  `createAdminClient()`" deixa de ser promessa e passa a ser régua — basta citar.
- **A varredura da AC9 precisa incluir `components/integrations/**`.** É o arquivo importado pelas
  **duas** superfícies; é o candidato natural a virar a ponte que a AC9 existe para impedir, e hoje
  está fora do escopo da varredura.

### R9 — Esconder no render não é esconder: `viewerRole` é prop de Client Component

O bloco "Detalhes técnicos" (erro **bruto** do provider) é renderizado condicionalmente por
`viewerRole`. Se o payload já chegou ao cliente, o `org_admin` lê no JSON/HTML — a condicional só
tira da tela. A story afirma que `viewerRole` "nunca controla autorização"; precisa afirmar o
mesmo sobre o **dado**: o campo técnico **não é serializado** na resposta quando o requisitante não
é platform admin — decisão de servidor, tomada onde a identidade é confiável.

---

## Menores (mesmo passe)

| # | Item |
|---|---|
| m1 | A story se contradiz na contagem de tiles: "4 tiles" (Context, decisão do componente) × "5, não 4" (AC4, corrigindo o próprio Context). Fixar um número e propagar |
| m2 | `_org_integration_write_secret` faz **dois** `SELECT` para ler `secret_ref` — o segundo é redundante (o primeiro já podia trazer a coluna) |
| m3 | O commit `1a524552` **existe** e a policy com `has_capability('configuracoes.integracoes_gerenciar')` está de fato no HEAD do PR #526 — conferi. A afirmação do `@sm` está certa; a capability existe em `lib/capabilities.ts:223`, `enforced: true`, seed `[admin]`. Nada a corrigir, registrado porque eu conferi no branch errado primeiro |
| m4 | Testing/Manual escolhe **Telegram** como provider real "mais barato". Telegram é `platform_shared` por decisão do ADR-005 (bot global da Trifold) — é justamente o caso ambíguo para validar per-org. Preferir `meta_capi` ou `sienge` |

---

## Checklist de validação (10 pontos)

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | |
| 2 | Descrição completa | ✅ | Context excelente; as duas autocorreções de medição são exemplares |
| 3 | ACs testáveis | ⚠️ 0.5 | os dois carrascos existem, e os dois ficam verdes no cenário do R2 |
| 4 | Escopo IN/OUT | ⚠️ 0.5 | OUT bem argumentado, mas `google` não é enforceable onde importa (R3) |
| 5 | Dependências mapeadas | ⚠️ 0.5 | falta a dependência do harness da `900-25` para a Camada B (R5) |
| 6 | Complexidade | ✅ | G, honesta — subiu com razão declarada |
| 7 | Valor de negócio | ✅ | pedido nomeado do dono do produto, com a decisão dele citada |
| 8 | Riscos documentados | ⚠️ 0.5 | segredo em trânsito e Vault bem tratados; RLS × `BYPASSRLS` não (R1) |
| 9 | Critérios de Done | ⚠️ 0.5 | `expect.assertions` decorativo (R5); sem prova de que a escrita escreveu (R2) |
| 10 | Alinhamento com epic | ✅ | antecipação de Onda 7 declarada; fatia mínima de `900-16` bem recortada |
| | **Total** | **7.0** | |

**Por que 7.0 não vira GO:** a régua que uso desde a `900-21b` é *"alguma AC nasce verde sob a
mutação que ela existe para pegar?"*. Aqui **três** nascem: o carrasco do segredo fica verde com
`secret_ref` NULL (R2); o carrasco do badge fica verde com credencial nunca validada (R4); e a
"append-only" fica verde porque o teste que a provaria não existe e o mecanismo não é o que a AC
diz ser (R1). Numa story cujo produto é **uma tela que afirma estado**, isso é o defeito, não um
detalhe do defeito.

---

## Caminho para o GO

1. **R1-R5** (obrigatórias) + **R6-R9** + m1-m4, em v0.3.
2. A `248` **não** deve ser aplicada antes da `900-25` v0.3 estar mergeada (R7) — ou, se for,
   avisar o `@qa` da `900-25` no mesmo dia.
3. Devolver para `@po` — rodada 2. Não é reescrita: 1 helper SQL endurecido, 1 `REVOKE` + trigger,
   1 allowlist de provider, 1 separação de `status`, e o endereçamento da Camada B.

---

## Change Log deste parecer

| Data | Rodada | Veredicto | Autor |
|---|---|---|---|
| 2026-08-30 | 1 | 🔴 NO-GO — 5 obrigatórias (R1-R5), 4 recomendadas (R6-R9), 4 menores | @po (Pax) |

---
---

# Rodada 2 — revalidação da v0.3 (2026-08-30)

## Veredicto: 🔴 **NO-GO** — 2 bloqueantes, 2 menores. Turno curto.

**As nove correções da rodada 1 estão feitas, e verifiquei sete delas executando contra o
Postgres do `trifold-crm-dev`** (transações com `ROLLBACK`, zero resíduo). O `@sm` acertou o
diagnóstico unificador e moveu tudo para dentro da `248`. R2, R3 e R4 fecharam de verdade — medi
cada exceção.

O que reprova são duas coisas, e as duas caem exatamente onde o coordenador pediu que eu olhasse:

1. **O `platform_audit_log` ainda pode ser apagado inteiro.** `REVOKE UPDATE, DELETE` não cobre
   `TRUNCATE`, e trigger `FOR EACH ROW` **não dispara** em `TRUNCATE`. Medi as duas coisas. O
   critério que você deu foi literal: *"se der para forjar por qualquer caminho, é NO-GO"* — e
   apagar tudo é pior que forjar uma linha.
2. **O 15º instrumento cego.** Perguntei o que a **RPC** não consegue observar de si mesma, e a
   resposta tem duas metades: ela observa que existe um `secret_ref`, **não** que existe um
   segredo; e não observa **nada** sobre `p_config` — que, para `meta_ads`, é a chave de
   roteamento de tenant que a Onda 2 inteira existe para proteger.

---

## O que fechou — medido, um por um

### R2 ✅ — refiz a medição exata. O 14º cego morreu.

Rodei o corpo novo do helper com a linha de `org_integrations` **apagada dentro da transação**:

```
ERROR:  P0012: nenhuma linha para org_id=00000000-…-0001, provider=meta_capi
CONTEXT:  PL/pgSQL function wr(uuid,text,text,jsonb) line 11 at RAISE
```

Antes era `sem excecao | v_row_id=NULL | linhas_afetadas=0` com `platform_audit` gravando sucesso
e a rota devolvendo 200. **Agora levanta — e levanta ANTES de `vault.create_secret`**, então nem
segredo órfão sobra. O `FOR UPDATE`, o `IF v_row_id IS NULL` e o `GET DIAGNOSTICS` são
redundantes de propósito e isso está certo: o `IF` pega a linha ausente, o `ROW_COUNT` pegaria uma
concorrência que o `FOR UPDATE` não tivesse segurado.

### R3 ✅ — allowlist positiva, os dois recusados via RPC direta

```
google   → ERROR: P0011: provider "google" fora da allowlist
whatsapp → ERROR: P0010: whatsapp nao escreve em org_integrations
```

Lista positiva (não negativa) foi a escolha certa e o `whatsapp` mantém o código próprio, o que
preserva a mensagem útil. A assimetria que eu apontei na rodada 1 (`whatsapp` protegido em dois
lugares, `google` em nenhum) está resolvida.

### R4 ✅ (o guard) — e o limite honesto está no lugar certo

```
mark_connected com secret_ref NULL  → ERROR: P0015: sem secret_ref
caminho feliz                        → promocao=connected | valor_apontado=UUID-PLANTADO-1234
```

A terceira asserção do carrasco é **provável** — confirmei que `org_integrations.secret_ref`
aponta para o segredo plantado (ver menor m6 sobre o cast que falta).

**Sobre o limite declarado ("garante 'não conectado sem segredo', não 'sem credencial testada'"):
está no lugar certo e escrito com honestidade rara.** Duas ressalvas, nenhuma bloqueante: (a) o
limite mora no Dev Notes, e quem lê **só a AC5** não o encontra — mova uma frase para dentro da
AC5, porque é lá que alguém decide se a régua basta; (b) a sugestão de tooltip *"testado pela
última vez em {data}"* é boa e não tem onde morar — `last_check_at` está no OUT da story. Ou entra
como coluna, ou o tooltip sai da recomendação para não virar promessa órfã.

### R1 ⚠️ parcialmente — a metade que ele fez, funciona

```
depois do REVOKE:  sr_insert=true   sr_update=false   sr_delete=false
```

Exatamente como eu tinha medido: `BYPASSRLS` pula RLS, não `GRANT`. O `INSERT` sobrevive. O
trigger incondicional como segunda camada é a decisão certa (o dono da tabela passaria pelo
`REVOKE`). **Ver N1 — falta o terceiro verbo.**

### R5 ✅ — a catraca deixou de ser decorativa

A story agora: (a) nomeia que a Camada B roda sob `vitest.tenancy.config.ts` da `900-25`, **nunca**
sob o `vitest.config.ts` da raiz, com a medição citada (`TENANCY_TEST_SUPABASE_URL=undefined`);
(b) replica o guard N2 (env presente + var ausente ⇒ falha, não skip); (c) rebaixa
`expect.assertions` a complemento e promove a **contagem de testes executados** a critério de
aceitação, com `0 passed | N skipped` reprovando explicitamente. E a Task 11.1 trata o galho
"`900-25` ainda não mergeada" **decidindo e registrando**, em vez de assumir. É a forma certa.

### R6-R9 + m1-m4 ✅

Nonce no nome do Vault (fecha o beco sem saída do `UNIQUE` que medi); `ON DELETE SET NULL` nas
duas FKs com `actor_label` congelado em `metadata` — a solução certa, porque preserva a trilha
**e** libera o `DELETE` de org, que é o que a `900-25` precisa; nota de sequenciamento da `248` ×
`900-25` v0.3 presente na Task 11.4; catraca AST citada em vez de reinventada, com
`components/integrations/**` acrescentado à varredura; `technicalDetail` decidido **por rota, no
servidor** (a formulação "omitido na serialização, não escondido no render" é exatamente o ponto);
5 tiles com `google` fora; `meta_capi`/`sienge` no lugar do Telegram no teste manual.

---

## 🔴 N1 — `TRUNCATE` atravessa o `REVOKE` **e** o trigger. A trilha não nasce append-only.

Medi os dois furos, separadamente.

**Furo 1 — o `REVOKE` da AC2 não tira `TRUNCATE`:**

```sql
GRANT ALL ON pal51 TO service_role, authenticated, anon;
REVOKE UPDATE, DELETE ON pal51 FROM service_role, authenticated, anon, PUBLIC;   -- ← o da AC2
```
```
sr_insert=true  sr_update=false  sr_delete=false  sr_truncate=TRUE  auth_truncate=TRUE
```

`GRANT ALL` do Supabase inclui `TRUNCATE`, e o `REVOKE` da AC2 lista só dois verbos.

**Furo 2 — trigger `FOR EACH ROW` não dispara em `TRUNCATE`:**

```sql
CREATE TRIGGER t_upd BEFORE UPDATE ON pal51b FOR EACH ROW EXECUTE FUNCTION imut();
CREATE TRIGGER t_del BEFORE DELETE ON pal51b FOR EACH ROW EXECUTE FUNCTION imut();
INSERT INTO pal51b (x) VALUES ('a'),('b');
TRUNCATE pal51b;
```
```
linhas_apos_truncate = 0     ← sem exceção nenhuma
```

Somando: **`TRUNCATE platform_audit_log` apaga a trilha inteira, disponível a `service_role` — que
é o cliente de toda rota `/platform` desta story.** O ator que a trilha existe para responsabilizar
é o único que consegue apagá-la, e nem precisa de uma linha por vez.

**O conserto, medido:**

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_log FROM service_role, authenticated, anon, PUBLIC;
CREATE TRIGGER platform_audit_log_sem_truncate BEFORE TRUNCATE ON platform_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_log_immutavel();
```
```
sr_ins=true  sr_trunc=false
TRUNCATE (como dono, com o trigger)  →  ERROR: P0020: append-only — TRUNCATE nao permitido
```

`FOR EACH STATEMENT` é obrigatório — é a única forma que dispara em `TRUNCATE`. E o `TG_OP` do
`RAISE` já imprime `TRUNCATE`, então a função de trigger não muda.

**Exigir também:** o carrasco da AC2 testa hoje `INSERT` ✓ / `UPDATE` ✗ / `DELETE` ✗ — **três
verbos, e o quarto é o que apaga tudo.** Acrescentar `TRUNCATE` ao carrasco, com `service_role`.
Enquanto o teste não cobrir o verbo, "append-only" continua sendo atributo de refino.

---

## 🔴 N2 — O 15º instrumento cego: a RPC valida a **referência**, não o **conteúdo** — e não valida `p_config` de jeito nenhum

Você pediu para perguntar o que a **RPC** não consegue observar de si mesma. São duas metades, e a
segunda é a séria.

### (a) `secret_ref IS NOT NULL` não é "tem segredo" — segredo vazio passa

```
wr(org, 'sienge', '', '{}')     →  ok
mc(org, 'sienge')               →  status_final = connected
length(decrypted_secret)        →  0
```

O guard estrutural do R4 pergunta *"existe uma referência?"*, e uma referência para uma string
vazia é uma referência. Via a RPC direta (que a story expõe a `authenticated` de propósito), um
org admin deixa o tile verde com `''`. E `right('', 4)` = `''`, então o "Revelar últimos 4"
mostra nada enquanto o badge diz "Conectado" — **o painel afirma um estado que a própria tela
desmente na linha de baixo.** É a mesma família do 14º cego, um nível abaixo.

**Exigir:** `IF p_secret IS NULL OR length(btrim(p_secret)) = 0 THEN RAISE` no helper (não na
rota), com código próprio, e o carrasco nos dois sentidos.

### (b) `p_config` entra sem nenhuma validação — e para `meta_ads` é a chave de roteamento de tenant

```
wr(org, 'meta_ads', 'tok', '{"page_id": "PAGINA-DE-OUTRA-EMPRESA-999"}')
→ page_id_gravado = PAGINA-DE-OUTRA-EMPRESA-999 | status = disconnected
```

O helper escreve `config = p_config` sem olhar. E `config->>'page_id'` do provider `meta_ads` é
**exatamente** o que decide qual empresa recebe um lead do Meta:

```ts
// packages/web/src/lib/tenancy/webhook-org.ts:136-141
.from("org_integrations").select("org_id")
.eq("provider", "meta_ads")
.eq("config->>page_id", pageId)
```

**E o resolver não filtra `status`** — a decisão está documentada ali mesmo
(`webhook-org.ts:119-127`), e é deliberada. Então o sequestro **nem precisa** do
`mark_connected`: uma única chamada direta a `org_integration_write_secret_as_org` com um
`page_id` arbitrário basta para uma empresa passar a receber os leads do Lead Ads de outra — com
`status` ainda `disconnected` e o tile mostrando **"Não conectado"**, de modo que ninguém olhando
o painel percebe.

A rota valida a posse da Página contra a Graph API (tabela "Como validar", `GET
graph.facebook.com/{page_id}?fields=name`). A RPC não. É o **mesmo defeito unificador** que o `@sm`
diagnosticou tão bem para as outras quatro propriedades — a validação de `page_id` continuou na
rota. Ele moveu quatro; esta é a quinta, e é a única com consequência cross-tenant.

**Exigir três coisas:**

1. **Validar a forma de `p_config` dentro do helper**, por provider: chaves permitidas por uma
   allowlist positiva (`meta_ads` → só `page_id`; `meta_capi` → só `dataset_id`; `sienge` → só
   `subdomain`; `telegram` → `{}`), rejeitando chave desconhecida. Fecha a escrita arbitrária de
   jsonb num campo que o roteamento lê.
2. **Reabrir a decisão do filtro de `status` em `resolveOrgByMetaPage`** — e a própria `900-24`
   pede isso por escrito: *"Quando a 900-47 entregar o painel, esta decisão volta à mesa com o
   contexto certo"* (`webhook-org.ts:127`). **Esta story é esse painel.** Com `mark_connected`
   existindo, o argumento que sustentava a omissão ("não existe UI para promover a `connected`")
   deixa de valer no mesmo commit. Filtrar `status='connected'` reduz a janela de sequestro a
   quem passou pela validação da rota.
3. **Nomear o risco residual por escrito**, se a decisão for não filtrar: a story precisa dizer
   que `page_id` é um identificador **reivindicável por ordem de chegada** e que a única barreira
   contra reivindicar o de terceiro é a validação da rota — que a RPC exposta contorna.

---

## 🟡 Menores

| # | Achado | Medição |
|---|---|---|
| m5 | O carrasco da AC2 cobre `INSERT`/`UPDATE`/`DELETE`. Falta `TRUNCATE` (N1) — o verbo que apaga tudo | ver N1 |
| m6 | `org_integrations.secret_ref` é **`text`**, não `uuid` (`246:68`, confirmado no catálogo do dev). A AC1 declara `v_secret_ref uuid` — funciona por cast implícito de PL/pgSQL, mas a **terceira asserção do carrasco** (`secret_ref` aponta para o segredo plantado) **erra** sem cast explícito: eu bati em `ERROR: 42883: operator does not exist: uuid = text` e só passou com `ds.id = oi.secret_ref::uuid`. Escrever o cast na AC1, senão o `@qa` perde tempo na asserção mais importante do R2. Registrar também que um `secret_ref` malformado produz `22P02` opaco, fora dos códigos `P00xx` nomeados |
| m7 | O limite honesto do R4 mora só no Dev Notes — mover uma frase para dentro da AC5, que é onde alguém decide se a régua basta. E o tooltip *"testado em {data}"* precisa de `last_check_at`, que está no OUT: ou entra, ou a recomendação sai |

---

## Checklist (10 pontos) — rodada 2

| # | Critério | v0.2 | v0.3 | Observação |
|---|---|---|---|---|
| 1 | Título claro | ✅ | ✅ | |
| 2 | Descrição completa | ✅ | ✅ | o defeito unificador nomeado no Change Log é exemplar |
| 3 | ACs testáveis | ⚠️ 0.5 | ⚠️ 0.5 | R2/R3/R4 medidos e fechados; o carrasco da AC2 não cobre `TRUNCATE` (N1) |
| 4 | Escopo IN/OUT | ⚠️ 0.5 | ✅ | `google` agora é enforceable onde importa |
| 5 | Dependências mapeadas | ⚠️ 0.5 | ✅ | harness da `900-25` + sequenciamento da `248` nomeados |
| 6 | Complexidade | ✅ | ✅ | |
| 7 | Valor de negócio | ✅ | ✅ | |
| 8 | Riscos documentados | ⚠️ 0.5 | ⚠️ 0.5 | `BYPASSRLS` tratado; `TRUNCATE` e `p_config` não (N1, N2) |
| 9 | Critérios de Done | ⚠️ 0.5 | ✅ | catraca de testes executados substituiu o `expect.assertions` decorativo |
| 10 | Alinhamento com epic | ✅ | ⚠️ 0.5 | a `900-24` pede por escrito que o filtro de `status` volte à mesa quando o painel existir; o painel é esta story e ela não volta (N2.2) |
| | **Total** | **7,0** | **8,5** | |

**Por que 8,5 ainda é NO-GO:** os dois achados não são acabamento. O N1 desmente literalmente o
adjetivo da AC2 ("append-only genuíno") por um verbo que ninguém testou, e o N2 abre uma escrita
não validada na chave de roteamento de tenant — no meio de um épico cujo critério de saída é
"WhatsApp/Meta/crons entregam para a org certa". Os dois consertos, porém, são pequenos: um verbo
no `REVOKE`, um trigger `FOR EACH STATEMENT`, dois `IF` no helper e uma decisão sobre o filtro de
`status`. Espero uma v0.4 rápida.

---

## Change Log deste parecer

| Data | Rodada | Veredicto | Autor |
|---|---|---|---|
| 2026-08-30 | 1 | 🔴 NO-GO — 5 obrigatórias (R1-R5), 4 recomendadas (R6-R9), 4 menores | @po (Pax) |
| 2026-08-30 | 2 | 🔴 **NO-GO** — R2/R3/R4/R5/R6-R9 fechados e medidos; 2 bloqueantes novos: **N1** `TRUNCATE` atravessa `REVOKE` e trigger `FOR EACH ROW` (trilha apagável inteira por `service_role`), **N2** o 15º cego — segredo vazio passa pelo guard, e `p_config` (chave de roteamento de `meta_ads`) entra sem validação nenhuma. Menores m5-m7 | @po (Pax) |

---
---

# Rodada 3 — revalidação da v0.4 (2026-08-30)

## Veredicto: 🟢 **GO condicional** — 3 condições, todas dentro da Task 12 (que já é gatilhada por modo)

**N1 e N2(a) estão fechados, medidos.** O que sobra não é instrumento cego — é **risco declarado
por escrito**, e a diferença importa: o `@sm` escreveu o limite em vez de escondê-lo, o que é o
oposto dos quatro achados anteriores. Minhas condições são sobre **quem** pode aceitar esse risco
e sobre **o que a AC10 não diz**, não sobre uma régua que mente.

---

## O que fechou — medido

### N1 ✅ — os quatro verbos, com os três triggers juntos

```
REVOKE UPDATE, DELETE, TRUNCATE ...  +  t_upd/t_del (FOR EACH ROW)  +  t_trunc (FOR EACH STATEMENT)
→ inseriu=1 | sr_ins=true | sr_upd=false | sr_del=false | sr_trunc=false

TRUNCATE (como dono, com os 3 triggers no lugar):
→ ERROR: P0020: platform_audit_log é append-only — TRUNCATE não é permitido
```

Refiz exatamente o cenário da rodada 2 — o que tinha apagado 2 linhas sem exceção. **Agora
levanta**, e o `INSERT` continua funcionando. A trilha nasce append-only. O carrasco da AC2
cobrindo os 4 verbos está escrito.

### N2(a) ✅ — segredo vazio, e também só-espaços

```
wr(..., '')     → ERROR: P0017: segredo vazio não é uma credencial
wr(..., '   ')  → ERROR: P0017    ← o btrim pega o caso que eu não tinha testado
```

O guard está no helper (não na rota), que é o ponto todo. E `btrim` cobre a variante
whitespace-only, que eu não tinha medido e que teria passado com um `= ''` puro.

### Menores ✅

Cast `::uuid` explícito na 3ª asserção do carrasco (`:396-397`, com o `42883` citado como razão);
limite honesto do R4 **dentro da AC5** (`"Não garante 'a credencial foi testada com sucesso'"`),
que era o pedido — está onde alguém decide se a régua basta; `Depends on` reconhecendo que a story
passa a tocar `webhook-org.ts`, da `900-24`.

---

## Respostas às suas quatro perguntas

### 1. O TRUNCATE fecha mesmo? — **Sim.** Medido acima, nos dois eixos (privilégio e trigger).

### 2. O `page_id` numérico basta como forma? — **Não. Barra o meu exemplo, não a classe.**

```
wr(meta_ads, config={"page_id":"PAGINA-DE-OUTRA-EMPRESA-999"})  → P0018  ✅
wr(meta_ads, config={"page_id":"132027046650861"})              → gravou
mc(meta_ads)                                                     → connected
→ page_id_gravado=132027046650861 | status=connected
```

`132027046650861` é a **Página real da Trifold** (`.claude/CLAUDE.md:414`). Todo `page_id` da Meta
é numérico — logo o conjunto de valores que um atacante usaria de verdade passa **inteiro** pelo
guard. O único conjunto barrado é o de strings malformadas, que ninguém usaria. Você chamou certo:
o mecanismo cobre o exemplo, não a classe.

**Isso não é desonestidade da story** — a AC1 diz literalmente *"NÃO prova posse"*. Mas a frase
seguinte, *"reduz a superfície"*, é a que precisa ser corrigida: medida, a redução de superfície
**de segurança** é zero. O valor do `P0018` é **higiene de dado** (impede lixo na chave de
roteamento), e é bom por isso. Escrever "higiene de formato, zero redução de superfície de
sequestro" é mais útil para quem for decidir depois.

### 3. A AC10 é a solução certa ou empurra o problema? — **É certa na direção e insuficiente no alcance, e cria uma consequência nova que a story não nomeia.**

**Alcance.** A AC10 diz que fecha "a classe mais simples do ataque (config escrito e nunca
promovido)" e "obriga qualquer ataque a passar pelas DUAS RPCs, cada uma com sua própria linha de
auditoria". Medi o caminho completo: `write_secret_as_org` + `mark_connected_as_org` — **as duas
são `GRANT EXECUTE ... TO authenticated`** (AC1, "pontos de entrada públicos … 8 funções
públicas") — produzem `status='connected'` com um `page_id` que nunca pertenceu ao chamador. Com
o filtro da AC10 ativo, o resolver roteia. **Passar pelas duas RPCs custa uma chamada HTTP a
mais.** Isso não é uma barreira, é um recibo: a AC10 não reduz a *capacidade*, só garante que o
ataque deixe duas linhas de auditoria em vez de uma. Vale ter — mas a prosa promete mais do que o
mecanismo entrega, terceira vez com a mesma lente.

**Custo, que era a sua pergunta.** Acoplar `status` ao roteamento tem um preço real que a story não
lista: a partir da Task 12, **uma credencial que expira e vira `error` para de rotear leads**.
Antes, `page_id` roteava independentemente da saúde do token — o `page_id` não precisa de token
para casar. Depois, um token vencido deixa de ser "sync quebrado" e passa a ser **lead perdido**,
com `WEBHOOK_ORG_UNRESOLVED` no lugar do lead. Num épico cujo critério de saída é "entregar para a
org certa", trocar "entrega com credencial velha" por "não entrega" é uma decisão de produto, não
um detalhe de implementação. **Precisa estar escrita na AC10**, com a mitigação óbvia (o
`mark_error` da AC5 só é chamado no fluxo de re-teste do painel, não por um cron — então o risco
é menor do que parece, mas precisa ser dito).

**Consequência nova, não nomeada — medida:**

```
CREATE UNIQUE INDEX org_integrations_meta_page_ativo ON org_integrations ((config->>'page_id'))
  WHERE provider = 'meta_ads' AND config->>'page_id' IS NOT NULL;      ← SEM condição de status

squatter grava page_id=132027046650861 com status='disconnected';
dono legítimo tenta gravar o mesmo:
→ ERROR: 23505: duplicate key value violates unique constraint "org_integrations_meta_page_ativo"
```

O índice **não filtra `status`**. Então a AC10 converte o sequestro na sub-classe que ela fecha em
**negação de configuração**: o ocupante não recebe os leads (bom), e o dono legítimo **nunca
consegue configurar a própria Página** (ruim), recebendo um `23505` opaco no painel — e não dá
para dizer a ele quem ocupou, porque isso é cross-tenant. Hoje ninguém percebe porque nada rota;
depois da Task 12, é um bug de suporte sem diagnóstico possível pela tela.

### 4. O 16º cego — **é o alcance da AC10**, e ele está *declarado*, não escondido

A lente "o mecanismo cobre menos que a prosa" aponta, desta vez, para a própria correção: o
`P0018` cobre o exemplo e não a classe; a AC10 cobre a metade não-promovida e não a promovida; e
as duas frases que resumem isso ("reduz a superfície", "obriga a passar pelas duas RPCs") leem
como mitigação quando medidas dão ~zero e "um POST a mais". **A diferença em relação aos achados
13-15: aqui está tudo escrito.** Por isso é condição, não bloqueio.

---

## Condições do GO

### C1 — 🔴 O risco cross-tenant precisa ser **fechado** ou **escalado ao dono do produto** — não aceito dentro da story

Aceitar risco de isolamento entre empresas não é decisão do `@sm`, e não é minha. Duas saídas, e
prefiro a primeira:

**(a) Fechar, e é barato e no idioma da própria story:** `config.page_id` de `meta_ads` só é
gravável pelo ponto de entrada `_as_platform`.

```sql
IF p_provider = 'meta_ads' AND p_config ? 'page_id' AND p_actor_type <> 'platform_admin' THEN
  RAISE EXCEPTION 'page_id é chave de roteamento entre empresas — só a Trifold configura'
    USING ERRCODE = 'P0019';
END IF;
```

A justificativa é a que a story já usa duas vezes: `page_id` **não é uma credencial**, é um
**identificador de roteamento com efeito cross-tenant** — exatamente a categoria de
`whatsapp_config.phone_number_id`, que a story já tratou como caso especial, e exatamente o que a
D3 do epic reserva para a Trifold. **E não custa o objetivo de produto:** o dono do produto pediu
*"ele troca uma chave vencida sem te acionar"* — o **token** de Página continua trocável pelo
cliente; só o identificador de roteamento fica com a Trifold. `meta_capi.dataset_id`,
`sienge.subdomain` e `telegram` seguem 100% self-service, e nenhum deles roteia dado de terceiro.

**(b) Escalar:** se o dono do produto quiser mesmo o `page_id` self-service, a story registra a
decisão **com as palavras dele**, como fez com "os dois lugares" — e aí a AC10 vira aceitação
consciente, não um limite herdado.

### C2 — 🟠 A verificação de modo da AC10 não é executável e não cobre os três modos

Medido em `webhook-org.ts:185-201`: os modos são **`legacy | both | identifier`**, e **sem a env
var setada o default é `both`** (`decidirModoRoteamento` nunca lança). A AC10 hoje trata `both` e
`identifier`. Faltam três coisas:

1. **O comando.** "Confirmar o modo em produção" sem comando é a mesma classe de verificação
   inexecutável que já apareceu nesta onda. Nomear a leitura pela REST API da Vercel (o
   `.claude/CLAUDE.md` já documenta o padrão e o `scripts/vercel-env-set.sh`), **e** dizer que
   *ausência da variável é uma resposta válida e significa `both`* — senão alguém lê "sem saída"
   como "checagem falhou".
2. **`legacy` não é mencionado.** Nesse modo o identificador nem é computado; a Task 12 é inócua e
   pode ser aplicada. Uma linha resolve.
3. **A regra de decisão em `identifier`, não só a medição.** A AC manda "medir o `status` da
   Trifold". Eu medi: **toda linha `meta_ads` está `disconnected`** (dev: 1 linha, 100%
   `disconnected`; produção é igual por construção — a `246` faz backfill com
   `status='disconnected'` e nada nunca promoveu). Então a resposta da medição já se conhece, e a
   AC precisa dizer o que fazer com ela: **em `identifier`, NÃO aplicar a Task 12 enquanto a linha
   da Trifold não estiver `connected`** — aplicar antes faria `resolveOrgByMetaPage` deixar de
   resolver **qualquer** org, que é apagar o roteamento inteiro, não endurecê-lo.

### C3 — 🟠 Nomear os dois efeitos que a AC10 introduz

(i) credencial em `error` deixa de rotear ⇒ lead perdido em vez de sync quebrado; (ii) o índice
`org_integrations_meta_page_ativo` **não filtra `status`**, então um `page_id` ocupado por outra
org — mesmo `disconnected` — impede o dono legítimo de configurar, com `23505` opaco no painel
(medido). Se a C1(a) for adotada, (ii) some para o self-service e permanece só entre platform
admins, o que é aceitável e resolvido por conversa.

---

## Checklist (10 pontos) — rodada 3

| # | Critério | v0.3 | v0.4 | Observação |
|---|---|---|---|---|
| 1-2 | Título / descrição | ✅ | ✅ | |
| 3 | ACs testáveis | ⚠️ 0.5 | ✅ | os 4 verbos da AC2 e os guards `P0017`/`P0018` medidos |
| 4 | Escopo IN/OUT | ✅ | ✅ | |
| 5 | Dependências | ✅ | ✅ | `webhook-org.ts`/`900-24` reconhecida no `Depends on` |
| 6 | Complexidade | ✅ | ⚠️ 0.5 | AC10 + Task 12 acrescentam um arquivo de outra story; reconferir |
| 7 | Valor de negócio | ✅ | ✅ | |
| 8 | Riscos documentados | ⚠️ 0.5 | ⚠️ 0.5 | o residual está **escrito** (mérito), mas "reduz a superfície" mede zero, e o custo/DoS da AC10 não está |
| 9 | Critérios de Done | ✅ | ✅ | |
| 10 | Alinhamento com epic | ⚠️ 0.5 | ⚠️ 0.5 | a AC10 responde ao chamado da `900-24` ✅; falta a regra de decisão por modo (C2) |
| | **Total** | **8,5** | **9,0** | |

**Por que 9,0 vira GO onde 8,5 não virava:** o critério nunca foi a nota. Na rodada 2 havia um
mecanismo que **desmentia o próprio adjetivo** (`TRUNCATE` contra "append-only genuíno") e um
buraco cross-tenant **não sabido**. Agora não há régua mentindo: o `TRUNCATE` fecha, medido, e o
residual está declarado em duas ACs. O que resta é **uma decisão de produto que precisa de dono**
(C1) e **uma AC de operação que precisa dizer o que fazer** (C2) — nenhuma das duas é um
instrumento cego. E há folga real: em produção o modo é `both` por default, onde o legado decide o
roteamento — **nada rota por `page_id` hoje**, então a exposição é zero enquanto as condições são
aplicadas.

---

## Encaminhamento

- **A story fica aprovada e esperando o merge dos PRs**, como a `900-25`.
- **C1 antes da Task 1** (é uma linha na migration, ou uma conversa com o dono do produto).
- **C2 e C3 antes da Task 12** — que já é gatilhada por modo, então não atrasa nada.
- No dia da implementação: reconfirmar os PRs e o modo de `WEBHOOK_ORG_ROUTING`.

---

## Change Log deste parecer

| Data | Rodada | Veredicto | Autor |
|---|---|---|---|
| 2026-08-30 | 1 | 🔴 NO-GO — R1-R5 obrigatórias, R6-R9, m1-m4 | @po (Pax) |
| 2026-08-30 | 2 | 🔴 NO-GO — N1 (`TRUNCATE` atravessa `REVOKE` e trigger por linha), N2 (15º cego: segredo vazio + `p_config` sem validação) | @po (Pax) |
| 2026-08-30 | 3 | 🟢 **GO condicional** — N1 e N2(a) fechados e medidos; C1 (fechar ou escalar o `page_id` self-service), C2 (regra de decisão por modo, com comando), C3 (custo e DoS da AC10 nomeados) | @po (Pax) |
