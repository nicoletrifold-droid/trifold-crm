# Story 900-62 — Editar Dados da Empresa (Identidade, Contato e Dados Fiscais)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Frente 2 ("Console"), Fase 1 — completa a entrega 1.2 de
  `docs/ux/console-plataforma.md` §6/§3.3: o card "Identidade" do Resumo já nasceu desenhado
  com um botão `[ Editar ]` (wireframe §3.3), e a Story `900-57` explicitamente **não** o
  implementou — ver a citação abaixo.
- **Story:** 900-62 — próximo número livre desta leva (`900-56`…`900-61` já existem; nenhuma
  colisão, verificado 2026-09-01 contra `docs/stories/` e `git fetch --prune`).
- **Status:** Ready for Review
- **Priority:** P0 — é a queixa direta do dono do produto que originou esta leva de stories
  ("não tem nada pronto nessa página, não consigo... editar informações"), e é a única das
  quatro (junto de `900-60`, `900-61` e o épico de cobrança) ainda sem story.
- **Complexity:** M.
- **Depends on:**
  - **`900-57`** (a casca da empresa + o card "Identidade" do Resumo, `Ready for Review`) —
    **dependência dura**: esta story acrescenta o botão `[Editar]` DENTRO do card que a
    `900-57` cria. Se `900-57` ainda não estiver mergeada em `main` quando esta for
    implementada, `orgs/[id]/page.tsx` não existe e o `@dev` precisa confirmar isso primeiro.
  - **NÃO depende de `900-58`, `900-59`, `900-60` ou `900-61`** — nenhuma delas é tocada.
  - **NÃO depende de `900-63`** (logo — story irmã nova, ver "Por que o logo saiu desta
    story" abaixo). As duas podem ser implementadas em qualquer ordem.
- **Por que esta story NÃO colide com a `900-60` (Ativar/Desativar), mesmo as duas sendo
  mutações sobre `organizations` no mesmo diretório de rotas — RECONFIRMADO contra o código
  de fato mergeado, não só contra o texto da story irmã:**
  A `900-60` está implementada (commits `22ec76b2`/`750b08ec`, branch
  `story/900-60-pausar-retomar-empresa`) e o arquivo real é
  `packages/web/src/app/api/platform/orgs/[id]/route.ts`, `PATCH` com corpo
  `{ isActive: boolean, reason: string }`, escrevendo só `organizations.is_active` via a RPC
  `organization_set_active_as_platform`. Esta story cria um arquivo **distinto**,
  `PATCH /api/platform/orgs/[id]/dados/route.ts` (escreve `name`/`slug`/contato/fiscal, nunca
  `is_active`). Nenhum dos dois arquivos se sobrepõe — as duas stories podem ser
  implementadas em qualquer ordem, por agentes diferentes, sem conflito de merge. Isso é
  decisão desta story, não coincidência: a alternativa (um único `PATCH` com corpo
  discriminado) acoplaria duas stories independentes ao mesmo arquivo e à mesma janela de
  implementação.

### Executor Assignment
- **Executor (migration + funções SQL):** @data-engineer (Dara).
- **Executor (rota + UI):** @dev (Dex).
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review, migration_review]`.
- **Por que não `@architect`/`security_review` (diferente da `900-60`):** a `900-60` precisou
  de revisão de segurança porque `is_active` tem efeito medido sobre **outra** empresa (via
  `resolveSoleOrg()`). Esta story foi auditada com a mesma disciplina (§ "O que cada campo
  quebra") e **não encontrou** efeito equivalente para nenhum dos oito campos — ver AC8. Se
  um `@dev` encontrar um efeito cross-tenant durante a implementação que este levantamento
  não viu, a regra do projeto é a mesma da `900-60`: parar e escalar para `@architect`, não
  seguir.

---

## User Story
**Como** operador da Trifold,
**eu quero** editar o nome, o identificador (slug), o contato responsável e os dados fiscais
de uma empresa já cadastrada, com validação real, trilha de auditoria e proteção contra dois
operadores sobrescrevendo a edição um do outro,
**para que** eu saiba com quem falar quando a integração de uma empresa quebra, e para que eu
não precise mais pedir um `UPDATE` manual no banco para corrigir esses dados.

---

## ⚠️ O escopo cresceu por decisão explícita do dono do produto — v0.2

A v0.1 desta story tinha escopo reduzido a `name`/`slug`, com uma seção inteira justificando
por que "dados de contato" e "dados fiscais" ficavam de fora (nenhuma coluna existia). O dono
do produto foi consultado com quatro opções e **marcou três**: contato do cliente, dados
fiscais/cobrança, e logo da empresa. Não marcou "nome e slug bastam" — então o escopo textual
cresce. **Continua não sendo invenção do `@sm`**: cada campo abaixo tem procedência direta na
resposta do dono do produto, não em suposição.

**Contato do cliente — ENTRA.** Responsável, e-mail, telefone da empresa. Uso declarado: saber
com quem falar quando a integração quebra. Continua sem coluna dedicada — ver "Forma de
armazenamento" abaixo para onde vai.

**Dados fiscais/cobrança — ENTRAM, e não esperam a fundação de cobrança.**
CNPJ, razão social, endereço. Havia um argumento real para nascerem junto da cobrança
(Pagar.me): são exatamente os campos que um gateway de pagamento vai exigir. A decisão foi
**não esperar**, pela mesma razão que o próprio epic já usa em outro lugar — citação direta,
`epic-900-saas-multi-tenant.md:542`: *"o artefato nasce onde é primeiro usado, e é refinado
depois."* Aqui, "primeiro usado" é agora: o operador precisa cadastrar CNPJ/razão
social/endereço **na implantação de uma empresa nova**, meses antes de qualquer cobrança
existir (o epic marca a fundação de billing na Onda 6, `900-43`, ainda sem story). Esperar
teria um custo real (operador continua fazendo `UPDATE` manual) e nenhum ganho técnico: a
validação de CNPJ com dígito verificador **já existe no repositório**
(`packages/web/src/lib/validation/contato.ts`, `isValidCnpj`/`normalizeCpfCnpj`, Story
75-282) — não há arquitetura de cobrança nenhuma sendo antecipada, só uma coluna/chave JSON e
um formulário. Quando `900-43` (ou o que vier a substituí-la) precisar desses dados para gerar
uma fatura de verdade, ela **lê** o que já existe — dependência aditiva, não bloqueante, o
mesmo padrão já usado para `org_billing_periods` entre `900-26`/`900-33`/`900-37`/`900-41`
(citado no próprio epic, linha 567).

**Logo da empresa — ENTRA na intenção do produto, mas SAI desta story.** Ver seção dedicada
abaixo ("Por que o logo saiu desta story").

**Status fica de fora — já tem dona, sem mudança da v0.1.** `organizations.is_active` é o
campo da `900-60` (implementada). Editá-lo aqui duplicaria uma mutação já especificada em
outra story, com outro texto de confirmação, outra trilha e outra revisão de segurança.

---

## Por que o logo saiu desta story (não é adiamento — é separação por forma técnica)

O dono do produto marcou logo como uma das três opções. A story continua contando essa
intenção — mas movida para uma story irmã nova, **`900-63`** (a ser rascunhada nesta mesma
sessão), pelas razões medidas abaixo, não por preferência estética:

1. **Forma técnica diferente.** `name`/`slug`/contato/fiscal são todos texto validado por
   regex/checksum, escritos numa única transação SQL. Logo é upload de arquivo — precisa de
   bucket do Supabase Storage, política de acesso, limite de tamanho e tipo MIME, e uma rota
   que recebe `multipart/form-data`, não JSON. É uma superfície de infraestrutura própria,
   com seu próprio quality gate (ver `900-63`).
2. **Medido: a coluna `logo_url` tem ZERO consumidores no código da aplicação hoje.**
   `git grep -n "logo_url" packages/web/src supabase/migrations` devolve **uma única
   ocorrência**: a definição da coluna em `001_base_schema.sql:62`. Nenhuma tela de login,
   header, sidebar, e-mail ou export lê `organizations.logo_url` para trocar a marca exibida.
   Isso significa que implementar SÓ o upload (o que `900-63` faz) não muda o que o cliente vê
   em lugar nenhum — a story `900-63` precisa declarar isso explicitamente na UI (mesmo
   princípio da AC8 desta story: não afirmar o que não está medido). Acoplar essa descoberta
   a esta story (que já está com oito campos de texto) faria o escopo dela carregar uma
   descoberta que pertence à story do logo.
3. **Bundle-lo aqui dobraria o raio do quality gate** desta story (que hoje é
   `[code_review, migration_review]`) para incluir revisão de política de Storage — sem
   ganho: as duas stories não têm dependência de dado entre si (nenhum campo de texto lê ou
   escreve `logo_url`, e vice-versa).

**Ordem recomendada:** `900-62` primeiro — zero decisão de arquitetura nova, estende um
padrão já 100% desenhado (RPC núcleo + wrapper `_as_platform`, mesmo trâmite de `900-51`).
`900-63` depois — bucket novo, política nova, superfície de upload nova, e o achado sobre
`logo_url` sem consumidor precisa da atenção própria de uma story, não de uma nota dentro de
outra.

---

## Forma de armazenamento — critério medido, não decidido a priori

**A pergunta:** colunas dedicadas em `organizations` ou chaves dentro de `organizations.settings`
(jsonb, já existente)?

**O critério, extraído do precedente real do repositório (não inventado agora):**

| Sinal medido | O que já existe assim | Vira |
|---|---|---|
| Lido/filtrado por `.eq()`/`.ilike()`/`WHERE` em alguma consulta | `slug` — filtrado em `console-lista-empresas.ts:116` (busca), tem `UNIQUE` (migration `001`) | **Coluna** |
| Participa de máquina de estado escrita por MAIS DE UMA função/rota, presença/ausência é o próprio sinal de estado | `admin_invite_email` — escrito por `provision_org`+rota de criação, lido e limpo por `resend-admin-invite` e por `ensureAdminInvited`; migration `244` documenta o ciclo de vida presente/`NULL` | **Coluna** |
| Escrito e lido por UMA feature só, exibido como valor simples, sem filtro nem `WHERE`, sem constraint | `organizations.settings.materiais_url` (`155_materiais_module_seed.sql`), `organizations.settings.relatorio_diario_destinatarios` (`lib/reports/recipients.ts`) — os dois são só lidos e mostrados, nunca filtrados por SQL | **Chave em `settings` (jsonb)** |

**Aplicando aos oito campos:**
- `name`, `slug` — já são colunas (migration `001`), continuam sendo — `slug` tem `UNIQUE` e é
  filtrado na busca da lista. Sem mudança.
- **Contato (`responsavel_nome`, `responsavel_email`, `responsavel_telefone`) e Fiscal
  (`cnpj`, `razao_social`, `endereco`) — nenhum dos seis é hoje filtrado por `WHERE`, nenhum
  participa de máquina de estado entre múltiplas funções, nenhum tem candidato a `UNIQUE`
  pedido por ninguém.** Pelo critério medido, os seis vão para `organizations.settings`
  (jsonb já existente), sob duas chaves novas: `settings.contato` e `settings.fiscal`. **Sem
  migration de coluna nova** para nenhum dos seis — só a migration da RPC (AC5).
- **Nota honesta sobre o futuro:** se uma story de cobrança precisar filtrar/buscar por CNPJ
  (ex.: detectar duas empresas com o mesmo CNPJ), promover a chave para coluna dedicada é uma
  migration pequena e comum — não decidida aqui, porque nenhuma necessidade desse tipo está
  medida hoje. Decidir agora seria inventar um requisito (Artigo IV).
- **Validação não depende de onde o dado mora.** Guardar em `settings` (jsonb) não dispensa
  validação — a validação é da rota/RPC, não da coluna. Ver seção seguinte.
- **A escrita em `settings` preserva as chaves das outras features, e a forma foi MEDIDA — não
  é `jsonb_set`.** `materiais_url` e `relatorio_diario_destinatarios` são chaves de OUTRAS
  features dentro do mesmo `settings` (medido: as duas existem, com consumidores reais —
  `dashboard/layout.tsx:270` e `broker/layout.tsx:70` decidem se o item de menu "Materiais"
  aparece; `lib/reports/recipients.ts` decide quem recebe o relatório diário). Um
  `UPDATE ... SET settings = '{"contato": ..., "fiscal": ...}'` bruto apagaria as duas — mas o
  `jsonb_set` encadeado que a v0.2 prescrevia **também**, e de duas formas piores porque são
  silenciosas. As duas medidas estão na AC5. A forma correta, medida, é
  `settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('contato', ..., 'fiscal', ...)`.

---

## O que cada campo quebra se mudar — levantamento medido (AC8 normativo)

| Campo | Onde é lido/usado hoje (medido via `git grep`) | O que muda se editar |
|---|---|---|
| **`name`** | Exibido em: lista de empresas (`orgs/page.tsx`), casca da empresa (`orgs/[id]/layout.tsx`), Resumo (`orgs/[id]/page.tsx`), tela `dashboard/configuracoes/empresa` (do lado do cliente). **Não encontrada nenhuma cópia congelada do nome fora da tabela `organizations`** — é sempre lido ao vivo via join/select. E-mails automáticos (`renderHeader`, `email-layout/*`) usam `orgName` **hardcoded como `"Trifold"`**, não derivado de `organizations.name` — legado de single-tenant, não afetado por esta edição. | **Nada quebra tecnicamente.** Só muda o que aparece na tela, em todo lugar, imediatamente. |
| **`slug`** | UNIQUE em `organizations.slug` (migration `001`, `varchar(255) NOT NULL UNIQUE`). Lido em: busca da lista (`console-lista-empresas.ts:116`, `org.slug.toLowerCase().includes(...)`), exibição (lista, casca, Resumo), validação de formato em `provision_org` (migration `240`, regex `^[a-z0-9]+(-[a-z0-9]+)*$`). **Varredura completa de `.slug` em `packages/web/src` (84 ocorrências) não encontrou nenhuma rota `[slug]`, resolução de tenant por subdomínio, nem uso em roteamento de webhook.** O roteamento de leads usa `org_id`/identificadores de canal (`webhook-org.ts`), nunca `organizations.slug`. | **Nada quebra tecnicamente.** É identificador de exibição e de busca, não de roteamento. |
| **`settings.contato.*`** (nome, e-mail, telefone do responsável) | **Não existe hoje** — não há leitor a quebrar. Passa a ser LIDO pelo próprio card "Identidade" do Resumo (AC15) e, eventualmente, um alerta operacional ("integração da empresa X caiu, avisar Y"), também fora de escopo. | Nada lê hoje — nada quebra. É dado novo, puramente aditivo. |
| **`settings.fiscal.*`** (CNPJ, razão social, endereço) | **Não existe hoje** — mesma situação. Não é lido por `900-43` porque `900-43` ainda não existe como story/código. | Nada lê hoje — nada quebra. Dado novo, puramente aditivo, preparado para ser lido (não escrito) por uma story de billing futura. |

Este levantamento é o que fundamenta a AC8 (o texto que aparece na UI) — a régua é "o que está
medido", não "o que parece intuitivamente seguro".

---

## Validação — o que valida de verdade, e o que só armazena (AC2 normativo)

| Campo | Obrigatório? | Validação real (rejeita `400` se falhar) | Normalização ao gravar | Função reaproveitada |
|---|---|---|---|---|
| `name` | Sim | `trim()` não-vazio; ≤ 255 (teto real da coluna `varchar(255)`) | `trim()` | — (já existia na v0.1) |
| `slug` | Sim | `trim()` não-vazio; casa `^[a-z0-9]+(-[a-z0-9]+)*$` (regex de `provision_org`, migration `240`); único no banco (checado pela RPC) | `trim()` | — (já existia na v0.1) |
| `responsavel_nome` | **Não** — contato nunca foi coletado antes; exigir aqui bloquearia salvar uma edição só de nome/slug | `trim()`; ≤ 255 (mesma família de teto do `name`, não um número novo) | `trim()` | — |
| `responsavel_email` | **Não** | Se preenchido: formato via `isValidEmail`/`emailError` (`@web/lib/validation/contato.ts`) → `400 CONTATO_EMAIL_INVALIDO` | `normalizeEmail()` (trim + minúsculas) — mesma convenção de `pastas/route.ts` | `isValidEmail`, `normalizeEmail` (Story 80-1, **reaproveitadas, não reescritas**) |
| `responsavel_telefone` | **Não** | Se preenchido: formato via `isValidPhoneBR`/`phoneError` → `400 CONTATO_TELEFONE_INVALIDO` | `formatPhoneBR()` (máscara `(44) 99999-9999`) — mesma convenção de `pastas/route.ts` | `isValidPhoneBR`, `formatPhoneBR` (Story 80-1, **reaproveitadas**) |
| `fiscal_cnpj` | **Não** | Se preenchido: **dígito verificador real** via `isValidCnpj` → `400 FISCAL_CNPJ_INVALIDO`. **Não é decorativo** — é o mesmo algoritmo de checksum que corrigiu um bug real de duplicidade de cliente na Story 75-282. | `normalizeCpfCnpj()` (só dígitos) — a MESMA lição da 75-282: gravar mascarado gerou 19 registros que não casavam com a busca | `isValidCnpj`, `normalizeCpfCnpj` (Story 75-282, **reaproveitadas, JÁ EXISTEM — achado desta sessão, não presumido**) |
| `fiscal_razao_social` | **Não** | `trim()`; ≤ 255 | `trim()` | — |
| `fiscal_endereco` | **Não** | `trim()`; ≤ 500 (**cap de engenharia, não regra de negócio** — não existe precedente de endereço estruturado (CEP/logradouro/UF) em nenhuma migration do repositório; um único campo de texto livre é o que está medido como suficiente, sem inventar um schema de endereço que ninguém pediu) | `trim()` | — |

**Por que nenhum dos seis campos novos é obrigatório:** tornar contato/fiscal obrigatórios
bloquearia o caso de uso mais comum no dia 1 desta feature — corrigir um `name`/`slug`
digitado errado numa empresa que ainda não tem esses dados cadastrados. Acoplar
obrigatoriedade entre os campos (ex.: "se `cnpj` vier, `razao_social` é obrigatória") também
não foi implementado — é uma regra de negócio que ninguém pediu (Artigo IV); cada campo é
validado e gravado independentemente dos outros cinco.

**Todos os oito campos passam pela MESMA validação na rota, antes de qualquer chamada ao
banco** — não precisam de round-trip para rejeitar um corpo obviamente inválido (mesmo
desenho da v0.1, agora estendido).

---

## Acceptance Criteria

**AC1 — Rota nova `PATCH /api/platform/orgs/[id]/dados/route.ts`, arquivo distinto do da
`900-60`.**
Corpo:
```json
{
  "name": "string",
  "slug": "string",
  "contatoNome": "string | omitido",
  "contatoEmail": "string | omitido",
  "contatoTelefone": "string | omitido",
  "fiscalCnpj": "string | omitido",
  "fiscalRazaoSocial": "string | omitido",
  "fiscalEndereco": "string | omitido",
  "expectedUpdatedAt": "string",
  "reason": "string | omitido"
}
```
Autorização via `getPlatformAdmin()` (`@web/lib/tenancy/platform-guard`) — `403` se não for
platform admin. Org **sempre** do parâmetro de rota `[id]`, nunca do corpo (mesma disciplina
de `resend-admin-invite/route.ts`).

**AC2 — Validação de entrada, sem inventar regra nova.**
Ver a tabela "Validação" acima — normativa. `name`/`slug` inalterados da v0.1. Os seis campos
novos: opcionais individualmente; se preenchidos, validados com as funções já existentes em
`@web/lib/validation/contato.ts` (email, telefone, CPF/CNPJ) — **reaproveitadas, nenhuma
reescrita de algoritmo**.

**AC3 — Concorrência: dois operadores editando a mesma empresa.**
`expectedUpdatedAt` é obrigatório no corpo (`400 EXPECTED_UPDATED_AT_REQUIRED` se ausente) — o
valor de `organizations.updated_at` que a UI tinha carregado quando abriu o diálogo de edição.
O servidor só aplica o `UPDATE` se o `updated_at` atual no banco for **exatamente** esse valor
(o trigger `set_updated_at` em `organizations` já existe desde a migration `001` — reaproveitado,
não recriado, e dispara para QUALQUER coluna alterada, inclusive `settings`). Se divergir →
`409 CONFLITO_DE_CONCORRENCIA`, **nenhum `UPDATE`, nenhuma linha de trilha**, e o corpo da
resposta devolve `name`/`slug`/`settings`/`updated_at` ATUAIS do banco, para a UI poder mostrar
"isto foi alterado por outra pessoa enquanto você editava" com o valor real.

**AC4 — Sem mudança real, sem escrita.**
Se os OITO campos enviados (após `trim()`/normalização) forem idênticos aos valores atuais da
empresa (incluindo as seis chaves de `settings.contato`/`settings.fiscal`) → `200`, **sem
`UPDATE`, sem chamada a `platform_audit()`**. Evita ruído na trilha para um "Salvar" que não
mudou nada. Esta checagem acontece dentro da função SQL (AC5), não na rota — é a mesma
transação que já tem a linha travada.

**AC5 — Efeito: duas funções SQL novas, seguindo o padrão da `900-51` (migration `248`)
— núcleo privado + wrapper `_as_platform`. Renomeadas de `_org_identity_*` (v0.1) para
`_org_details_*` — o escopo não é mais só identidade.**

Migration nova (**número a confirmar no dia da implementação** — ver nota de numeração
abaixo; o candidato medido hoje, 2026-09-01, é `252`, não `251`):

1. **`_org_details_update(p_org_id uuid, p_name text, p_slug text, p_contato_nome text,
   p_contato_email text, p_contato_telefone text, p_fiscal_cnpj text, p_fiscal_razao_social
   text, p_fiscal_endereco text, p_expected_updated_at timestamptz)`** `RETURNS
   TABLE(id uuid, name varchar, slug varchar, settings jsonb, updated_at timestamptz, conflito
   boolean, slug_em_uso boolean)`, `SECURITY DEFINER`:
   - `SELECT ... FOR UPDATE` na linha da empresa primeiro (trava a linha e desambigua 404 de
     409 — se não achar, devolve zero linhas e a rota decide `404`).
   - **`p_expected_updated_at IS NULL` → `RAISE EXCEPTION` (`SQLSTATE 'P0024'`), nunca "sem
     conflito".** **[CORREÇÃO PO.]** Medido: `now() <> NULL::timestamptz` avalia para `NULL`,
     e um `IF <NULL> THEN` **não entra no ramo** — escrito com `<>`, um `expectedUpdatedAt`
     nulo faria a trava otimista passar batido e o `UPDATE` acontecer sem proteção nenhuma.
     Trava que falha aberta é pior que trava ausente, porque a AC3 afirma que ela existe. A
     comparação usa **`IS DISTINCT FROM`**, e o `NULL` é barrado explicitamente antes dela.
   - Se `updated_at` da linha travada **`IS DISTINCT FROM`** `p_expected_updated_at` → devolve
     1 linha com `conflito = true` e os valores ATUAIS (`name`, `slug`, `settings` inteiro),
     sem `UPDATE`.
   - Se `name`/`slug` (após `btrim`) E as seis chaves de `settings.contato`/`settings.fiscal`
     já forem os atuais → devolve 1 linha com `conflito = false, slug_em_uso = false` e os
     mesmos valores, sem `UPDATE` (AC4). **A comparação das seis chaves é
     `coalesce(settings->'contato'->>'nome', '') IS NOT DISTINCT FROM coalesce(p_contato_nome, '')`
     (e análogas)** — **[CORREÇÃO PO]**: chave ausente devolve `NULL`, e `NULL = ''` é `NULL`;
     sem o `coalesce` o no-op nunca seria detectado no dia 1 (nenhuma org tem as chaves), e
     todo "Salvar" sem mudança gravaria linha de trilha — o ruído que a AC4 existe para evitar.
   - Senão, tenta o `UPDATE ... RETURNING`, escrevendo `name`, `slug` como antes, e `settings`
     pelo **merge raso de dois objetos completos**, exatamente nesta forma:
     ```sql
     settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
       'contato', jsonb_build_object('nome', p_contato_nome, 'email', p_contato_email,
                                     'telefone', p_contato_telefone),
       'fiscal',  jsonb_build_object('cnpj', p_fiscal_cnpj, 'razao_social', p_fiscal_razao_social,
                                     'endereco', p_fiscal_endereco)
     )
     ```
     **[CORREÇÃO PO — a v0.2 prescrevia `jsonb_set` encadeado, e a forma está MEDIDA como
     defeituosa em duas frentes, as duas silenciosas.]** Medido em 2026-09-01 (Management API,
     leitura, `User-Agent` identificado):
     1. **`jsonb_set` é STRICT.** `jsonb_set('{"materiais_url":"x",...}'::jsonb, '{contato,nome}',
        to_jsonb(NULL::text), true)` devolve **SQL `NULL`** — a coluna `settings` inteira vira
        `NULL` e as quatro chaves que existem hoje em produção (`city`, `state`,
        `materiais_url`, `relatorio_diario_destinatarios`) somem de uma vez. E o caminho para
        chegar em `NULL` é o **caminho normal da própria story**: a AC2/Task 2.2 manda gravar o
        CNPJ com `normalizeCpfCnpj()`, que **retorna `null` para entrada vazia** (medido em
        `lib/validation/contato.ts`) — ou seja, "salvar com o campo CNPJ em branco" seria o
        gesto que apaga a configuração de outras features. `coalesce(settings, '{}'::jsonb)`
        também é obrigatório porque a coluna é **nullable** (`settings jsonb DEFAULT '{}'`,
        `001_base_schema.sql:62` — sem `NOT NULL`).
     2. **`jsonb_set` com `create_missing = true` NÃO cria o objeto-pai.** Medido:
        `jsonb_set('{"materiais_url":"x"}'::jsonb, '{contato,nome}', to_jsonb(''::text), true)`
        devolve `{"materiais_url":"x"}` — **a escrita é descartada em silêncio**. Como
        `settings.contato` e `settings.fiscal` são chaves NOVAS, elas não existem em nenhuma org
        (medido: zero orgs têm qualquer uma das duas). Logo, na v0.2 as seis escritas cairiam no
        vazio em **100% dos casos**, a rota devolveria `200`, a UI faria `router.refresh()` e os
        campos voltariam em branco — com `platform_audit_log.metadata.depois` afirmando uma
        mudança que não aconteceu.
     Medido para a forma nova: o `||` preserva `city`/`materiais_url`/
     `relatorio_diario_destinatarios` intactos, cria `contato`/`fiscal` do zero, e
     `jsonb_build_object` **não é strict** (valor `NULL` vira JSON `null`, não anula o objeto).
   - **`metadata.depois` da trilha é lido do `RETURNING` do `UPDATE`, nunca dos parâmetros de
     entrada.** Se a escrita não pegar, a trilha tem que mostrar que não pegou.
   - Se estourar `unique_violation` (a `UNIQUE` de `organizations.slug`, migration `001`) →
     **captura a exceção dentro da função** e devolve 1 linha com `slug_em_uso = true`, sem
     propagar o erro cru.
2. **`org_details_update_as_platform(p_org_id uuid, p_actor_user_id uuid, p_name text, p_slug
   text, p_contato_nome text, p_contato_email text, p_contato_telefone text, p_fiscal_cnpj
   text, p_fiscal_razao_social text, p_fiscal_endereco text, p_expected_updated_at timestamptz,
   p_reason text DEFAULT NULL)`** — mesma assinatura de retorno, `SECURITY DEFINER`,
   `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role` (idêntico ao
   padrão de `org_integration_write_secret_as_platform`, migration `248`, linhas 502-588):
   - Lê o estado ANTES do `UPDATE`.
   - Chama `_org_details_update(...)`.
   - **Só chama `platform_audit(...)` se o resultado não tiver `conflito` nem `slug_em_uso` E
     algum dos OITO campos de fato mudou** — reaproveita `platform_audit()` já existente
     (migration `248`), não cria mecanismo de auditoria novo.
   - `action = 'organization.updated'`, `target_table = 'organizations'`, `target_id =
     p_org_id`, `p_actor_type = 'platform_admin'` sempre (só alcançável por quem passou
     `getPlatformAdmin()` na rota).
   - `metadata = { campos_alterados: [...], antes: {...}, depois: {...}, reason: p_reason }`,
     onde **`antes` e `depois` contêm SOMENTE as chaves listadas em `campos_alterados`** —
     **[CORREÇÃO PO, ver "Veredito do @po sobre a decisão de LGPD" abaixo]**. Texto claro, sem
     mascarar contato nem fiscal (mascarar destruiria o propósito operacional declarado pelo
     dono do produto: "saber com quem falar"), mas **sem** copiar o bloco inteiro de contato
     para uma linha permanente toda vez que alguém corrige uma letra do `name`. O `reason`, se
     enviado, entra tal como veio.
     **Carrasco:** editar SÓ o `name` e afirmar que a linha de trilha resultante **não contém
     nenhuma das seis chaves** de contato/fiscal.
   - Sem RPC `_as_org`: esta edição é só de plataforma nesta story. Um self-service de
     "editar o nome da minha empresa" pelo próprio cliente é feature distinta, fora de escopo.

**Por que não é `db.from("organizations").update(...)` direto pela rota:**
`packages/web/src/lib/tenancy/platform-query-scan.ts` proíbe **qualquer** `.from(<literal>)`
cru dentro de `app/platform/**` e `app/api/platform/**`, e a checagem não distingue leitura de
escrita nem isenta `createAdminClient()` — só exclui `Buffer`/`Array` como receiver. Uma
implementação com `.from("organizations").update(...)` acenderia a régua. O caminho já
sancionado pelo resto do painel para escrita é **RPC via `.rpc(...)`**
(`app/api/platform/orgs/route.ts` já faz isso para `provision_org`; `app/api/platform/orgs/[id]/
route.ts`, da `900-60`, já implementada, faz o mesmo para `organization_set_active_as_platform`)
— que o detector não enxerga, por desenho (ele varre `.from(` e `.select(`, não `.rpc(`).

**AC6 — Registro no allowlist do admin-client.**
Esta rota usa `createAdminClient()` (para chamar a RPC via `service_role`) e **precisa entrar
em `docs/audits/admin-client-allowlist.json`, seção `plataforma`** — mesmo padrão das rotas
irmãs já registradas ali (`resend-admin-invite`, `integracoes`, e a `900-60` já mergeada).
`scripts/admin-client-allowlist.test.ts` reprova a suíte se a rota nova não estiver lá; não é
opcional.

**AC7 — UI: o botão `[ Editar ]` que o desenho já previu, agora com três seções.**
O card `Cartao titulo="Identidade"` em `packages/web/src/app/platform/orgs/[id]/page.tsx`
ganha um botão `[ Editar ]` (client component novo,
`packages/web/src/app/platform/orgs/_components/editar-dados-empresa.tsx`, mesmo diretório e
mesmo padrão de import relativo de `<ReenviarConvite />`). Abre um diálogo com três seções:
1. **Identidade** — Campo "Nome" (texto, valor inicial = `org.name`); campo "Identificador"
   (texto monoespaçado, valor inicial = `org.slug`, dica de formato: "minúsculas, números e
   hífen — ex.: acme-imoveis").
2. **Contato** — Campo "Responsável" (texto), "E-mail" (texto), "Telefone" (texto com máscara
   progressiva `(44) 99999-9999`, reaproveitando `maskPhoneBR` do lado do cliente) — os três
   com valor inicial = `org.settings?.contato?.{nome,email,telefone} ?? ""`.
3. **Dados fiscais** — Campo "CNPJ" (texto com máscara `00.000.000/0000-00`, reaproveitando
   `maskCnpj`), "Razão social" (texto), "Endereço" (textarea) — os três com valor inicial =
   `org.settings?.fiscal?.{cnpj,razao_social,endereco} ?? ""`.
4. Campo "Motivo (opcional)".
5. Botão "Salvar", desabilitado se: nenhum dos oito campos mudou em relação ao valor inicial,
   OU nome vazio, OU slug fora do formato, OU e-mail/telefone/CNPJ preenchidos mas em formato
   inválido (validação no cliente espelha a da rota — feedback antes do round-trip, a rota
   valida de novo por trás, é a fonte da verdade).
6. O diálogo carrega e envia `expectedUpdatedAt` = o `updated_at` da empresa já buscado pela
   página (sem uma segunda leitura) — **o que exige a AC13; hoje a página não busca esse campo.**

**AC8 — A UI declara o que está medido, não o que parece intuitivo (ver seção acima).**
Abaixo dos campos de Identidade, texto fixo e curto (inalterado da v0.1):
> "O identificador não é usado para acessar o sistema nem para rotear mensagens — é só o nome
> técnico exibido no console. Precisa ser único entre as empresas."

Abaixo dos campos de Dados fiscais, texto fixo novo:
> "Esses dados ainda não alimentam nenhuma fatura automaticamente — servem para ter o cadastro
> pronto antes de a cobrança existir."

Nada de aviso de risco cross-tenant em nenhuma das três seções — porque, diferente da `900-60`,
o levantamento medido (seção acima) não encontrou nenhum efeito cross-tenant para nenhum dos
oito campos. Se um `@dev` encontrar um efeito real durante a implementação, a AC muda antes do
texto ir ao ar — não se infla o aviso "por segurança" sem medição, e não se omite se houver
achado novo.

**AC9 — Erro do servidor não fecha o diálogo, preserva o que o operador digitou.**
Qualquer falha (`400`/`403`/`404`/`409`/`500`) mostra o motivo dentro do próprio diálogo, sem
fechá-lo e sem descartar os valores já digitados. Mensagens por código:
- `CONTATO_EMAIL_INVALIDO` → "E-mail do responsável inválido."
- `CONTATO_TELEFONE_INVALIDO` → "Telefone do responsável inválido — use DDD + número."
- `FISCAL_CNPJ_INVALIDO` → "CNPJ inválido — confira os dígitos."
- `CONFLITO_DE_CONCORRENCIA` → "Os dados foram alterados por outra pessoa enquanto você
  editava. Recarregue a página para ver a versão atual antes de tentar de novo." — sem tentar
  mesclar ou sobrescrever silenciosamente.
- `SLUG_EM_USO` → "Esse identificador já está em uso por outra empresa."

**AC10 — Sucesso: UI atualiza sem recarregar a página inteira.**
`200` → fecha o diálogo, `router.refresh()` (mesmo padrão de `<ReenviarConvite />` e de
`integrations-panel.tsx:130`).

**AC11 — Nenhum campo novo é escrito em log nenhum além de `settings` e `platform_audit_log`.**
A rota e a RPC não fazem `console.log`/`console.error` do corpo bruto da requisição nem dos
valores de contato/fiscal em nenhum outro lugar (nem no corpo de erro `500` genérico, que já
segue o padrão do projeto de nunca ecoar o payload recebido). Esta AC existe para não abrir um
segundo lugar não-auditado onde dado pessoal (contato) apareça — a régua é code review manual
(quality gate desta story), não um teste automatizado.

**AC15 — O contato e o fiscal aparecem no card, não só dentro do diálogo de edição.
[AC NOVA — CORREÇÃO PO.]**

A User Story justifica o escopo de contato com *"para que eu saiba com quem falar quando a
integração de uma empresa quebra"*. Como a v0.2 estava escrita, os seis campos só são visíveis
**abrindo o diálogo de edição** — o operador que está diagnosticando uma integração quebrada
precisaria clicar em "Editar" para descobrir para quem ligar, o que é exatamente o gesto que
uma tela de diagnóstico não deve exigir. A story entregaria a escrita e não a leitura.

Custo real, agora que a AC13 já traz `settings` na projeção: as linhas de exibição dentro do
`Cartao titulo="Identidade"` que já existe. **Nenhum card novo, nenhuma consulta nova.**
Responsável / e-mail / telefone e CNPJ / razão social / endereço aparecem como `<dt>/<dd>`, com
`—` quando vazios; o CNPJ é exibido com `maskCpfCnpj` (guardado só com dígitos — a lição da
Story 75-282 é gravar cru e mascarar na exibição, não o contrário).

**AC12 — Fora de escopo, declarado — não implícito.**
- `is_active`/status: não aparece no diálogo desta story. Pertence à `900-60` (implementada).
- **Logo (`logo_url`):** não aparece no diálogo desta story. Pertence à `900-63` (nova, ver
  seção dedicada acima).
- Nenhum self-service de edição pelo próprio cliente (`/dashboard/configuracoes/empresa`)
  nesta story — só o painel de plataforma.
- Nenhuma UNIQUE ou verificação de duplicidade de CNPJ entre empresas nesta story.
- Nenhum acoplamento entre a existência de CNPJ e a existência de razão social/endereço.
- Nenhuma consulta a serviço externo (ex.: Receita Federal) para validar razão social contra
  o CNPJ informado — a validação é só o dígito verificador.

**AC13 — A projeção da página precisa carregar `updated_at` e `settings`, e uma régua estática
tem que prender isso. [AC NOVA — CORREÇÃO PO.]**

Medido em `packages/web/src/app/platform/orgs/[id]/page.tsx:84`, a projeção de hoje é:

```
platformQuery("organizations", "id, name, slug, is_active, created_at, admin_invite_email")
```

**`updated_at` não está lá, e `settings` também não.** Sem os dois, a AC7 desta story é
inexequível e falha das duas maneiras piores:
- `org.updated_at` é `undefined` → `expectedUpdatedAt` sai omitido do corpo → `400`
  (funcionalidade morta), ou — se alguém "consertar" mandando `null` — a trava otimista da AC3
  passa batido (ver a medição do `<>` com `NULL` na AC5). Uma feature morta é ruim; uma trava
  que mente é pior.
- `org.settings` é `undefined` → os seis campos de Contato/Fiscal abrem **sempre vazios**,
  inclusive numa empresa que já tem os dados. Combinado com a AC7.5 (o botão "Salvar" libera
  quando algo muda), o operador que abre o diálogo para corrigir o `name` e salva **apaga o
  contato e o fiscal que já estavam lá** — perda de dado silenciosa, com `200` na tela.

Portanto: a projeção passa a ser
`"id, name, slug, is_active, created_at, admin_invite_email, updated_at, settings"`.
Medido que isso **não** exige mudança em `PLATFORM_READABLE_TABLES`: `platformQuery()` filtra
tabela, recusa `"*"` e recusa `(` — não tem lista de colunas, e a string nova não tem `(`.

**Régua:** um teste de âncora em `platform-query-scan.test.ts` (ou vizinho), no mesmo molde do
que já existe em `platform-query-scan.test.ts:126` para a consulta de admin: falha se a
projeção de `orgs/[id]/page.tsx` deixar de conter `updated_at` **ou** `settings`. Sem ela, um
refactor devolve a trava-que-mente sem ninguém notar. **Fail-closed explícito**: o teste
verifica `indexOf(ancora) >= 0` antes de recortar, como o precedente já faz.

**Custo declarado, não escondido:** puxar `settings` inteiro leva ao console de plataforma
TODAS as chaves de configuração do tenant (medido em produção: `city`, `state`,
`materiais_url`, `relatorio_diario_destinatarios`). É alargamento real da superfície de leitura
da Trifold sobre o dado do cliente — aceito aqui porque `organizations` já está em
`PLATFORM_READABLE_TABLES` e a alternativa (projeção `settings->contato`) não foi medida nesta
sessão. O que a AC **proíbe** é renderizar qualquer chave de `settings` fora de `contato` e
`fiscal` na UI desta story.

**AC14 — A segunda porta de escrita: `PATCH /api/organization` já existe e escreve os mesmos
campos, sem validação, sem trava e sem trilha. [AC NOVA — CORREÇÃO PO.]**

Medido em `packages/web/src/app/api/organization/route.ts` (rota existente, não criada por esta
story): um usuário do **tenant** com a capability `configuracoes.empresa_editar` pode fazer
`PATCH /api/organization` com `{ name, settings }` e a rota executa
`updates.settings = { ...currentSettings, ...body.settings }` — **spread de objeto inteiro, com
chaves arbitrárias vindas do corpo**. Consequências medidas, todas contra o que esta story
promete:
- um admin do tenant pode escrever `settings.fiscal.cnpj` com qualquer string, **sem passar por
  `isValidCnpj`** — a validação da AC2 vale só para a porta da plataforma;
- essa escrita **não grava linha em `platform_audit_log`** — a "trilha de auditoria" da User
  Story tem um buraco do tamanho da outra rota;
- essa escrita **não usa `expectedUpdatedAt`** e é read-modify-write: se o platform admin gravar
  `contato` entre o `select` e o `update` da outra rota, o valor é revertido em silêncio. A
  trava da AC3 não protege contra um escritor que não participa do protocolo (mesmo mecanismo em
  `dashboard/configuracoes/empresa/page.tsx:134`, `.../materiais/page.tsx:71` e
  `.../relatorio-diario/page.tsx:120`, os três com spread do objeto inteiro).

**O que esta story faz a respeito (mínimo, não é reescrita da rota do tenant):**
`PATCH /api/organization` passa a **recusar** as chaves `contato` e `fiscal` em `body.settings`
→ `400 CHAVE_RESERVADA_DA_PLATAFORMA`. É uma denylist de duas chaves, não uma allowlist geral
(fazer allowlist mudaria o comportamento de `city`/`state`/`materiais_url`, fora do escopo
desta story). **Teste obrigatório:** (a) `PATCH` com `settings: { contato: {...} }` → `400` e
nenhuma escrita; (b) `PATCH` com `settings: { city: "Maringá" }` → continua `200` — o controle
positivo que prova que a recusa não quebrou o caminho que já funcionava.

---

## LGPD — o que é dado pessoal aqui, e onde ele fica

**`responsavel_nome`/`responsavel_email`/`responsavel_telefone` são dado pessoal** (LGPD Art.
5º, I — pessoa natural identificada). Onde aparecem:
- `organizations.settings.contato` — editável, sobrescrito a cada edição (valor corrente).
- `platform_audit_log.metadata.antes`/`.depois` — **permanentemente**, porque a trilha é
  **append-only por trigger** (o mesmo padrão endurecido pela `900-51`: `REVOKE UPDATE,
  DELETE` + trigger que barra `UPDATE`/`DELETE`/`TRUNCATE`). O que entra numa linha de trilha
  não sai por `DELETE` nem por retificação — só um novo registro com o valor corrigido, e o
  valor errado anterior continua na história.

**Decisão consciente: NÃO mascarar contato na trilha.** Diferente do access_token do WhatsApp
(`900-51`/`900-52`, que é secreto e é mascarado em qualquer metadata), nome/e-mail/telefone do
responsável **precisam** aparecer em texto claro na trilha — é literalmente o dado que o
operador quer poder consultar meses depois ("quem era o contato quando isso mudou"). Mascarar
destruiria o propósito que o próprio dono do produto declarou.

**`fiscal_cnpj`/`fiscal_razao_social`/`fiscal_endereco` NÃO são dado pessoal na maioria dos
casos** — identificam a pessoa jurídica (a empresa), não uma pessoa natural (LGPD Art. 5º, I
exige "pessoa natural"). Exceção não tratada aqui: CNPJ de MEI (microempreendedor individual)
pode revelar o CPF do titular embutido no próprio número — não há verificação de MEI nesta
story (seria inventar um requisito não pedido); se isso vier a importar, é uma decisão de
produto futura, não uma omissão silenciosa desta story.

**O que NÃO pode ser registrado:** nenhum campo desta story grava em nenhum log/observabilidade
fora de `organizations.settings` e `platform_audit_log` — ver AC11.

### Veredito do @po sobre a decisão de LGPD — ACEITA, com uma correção de minimização

**Aceito não mascarar.** O raciocínio do `@sm` está certo e é o certo para este produto:
mascarar o contato na trilha destruiria o propósito operacional que o próprio dono do produto
declarou. Mascarar credencial (`900-51`/`900-52`) e mascarar contato são coisas diferentes —
credencial não tem uso legítimo de leitura posterior; contato tem, e é o uso inteiro.

**Confirmo que é irreversível de verdade** — não é retórica. Medido em
`248_painel_integracoes_self_service.sql`: o trigger `platform_audit_log_immutavel()` permite
**um** `UPDATE` estreito, e só ele — anular `actor_user_id`/`org_id`. A coluna `metadata` é
comparada com `IS NOT DISTINCT FROM`, ou seja, **é imutável por construção**. Um pedido de
eliminação/retificação (LGPD Art. 18, III/VI) sobre nome/e-mail/telefone gravados ali **não tem
como ser atendido** pelo mecanismo que existe hoje. Isso não muda o veredito, mas precisa estar
escrito com essa clareza — não como "o que entra não sai", que soa a estilo.

**A correção, e é obrigatória: `metadata.antes`/`.depois` carregam SÓ os campos que estão em
`campos_alterados`, nunca os oito.** Como está redigida, a AC5 grava uma cópia permanente do
bloco inteiro de contato **a cada edição**, inclusive quando o operador só corrigiu uma letra do
`name` — cópias permanentes de dado pessoal que ninguém pediu e que ninguém consegue apagar
depois. O propósito declarado ("quem era o contato quando isso mudou") é atendido pelos campos
que mudaram; o valor corrente vive em `organizations.settings`, que é editável. **Isto não é
mascarar** (o valor continua em texto claro quando muda) — é não multiplicar o irreversível
por edições que não têm nada a ver com ele. É a correção de menor custo e maior efeito
disponível, e é a única razão pela qual dá para dizer GO nesta decisão sem hesitar.

---

## Tasks / Subtasks

- [x] **Task 1 (AC5, AC6) — Migration**
  - [x] 1.1 Reconfirmar o número livre da migration contra `origin/main`, **todas as branches
    remotas** (`git fetch --prune` + `git ls-tree` em cada `refs/remotes/origin/*`) **e** a
    tabela `trifold_migrations_aplicadas` em produção (via Management API, leitura, com PAT —
    nunca `SUPABASE_SERVICE_ROLE_KEY`) — não herdar o `252` deste draft às cegas (ver nota de
    numeração abaixo; esta é a SEGUNDA colisão desta leva de migrations, depois de `250`→`251`).
  - [x] 1.2 Criar `_org_details_update(...)` — núcleo privado, `SECURITY DEFINER`,
    `SELECT ... FOR UPDATE`, a recusa de `p_expected_updated_at IS NULL` (`P0024`), os três
    desvios (conflito via `IS DISTINCT FROM` / no-op com `coalesce` / slug em uso), o
    **merge raso `coalesce(settings,'{}'::jsonb) || jsonb_build_object(...)`** para as duas
    chaves de `settings` (**nunca `jsonb_set` — ver AC5**), e o `UPDATE`
  - [x] 1.3 Criar `org_details_update_as_platform(...)` — wrapper, chama `platform_audit()`
    condicionalmente, `REVOKE`/`GRANT` conforme o padrão da migration `248`
  - [x] 1.4 **Carrasco do `settings` — três cenários, não um. [REESCRITO — CORREÇÃO PO.]**
    O carrasco da v0.2 ("editar só `name`/`slug` e ver se `materiais_url` sobrevive") **passa
    verde sob os dois defeitos medidos na AC5**: editar só `name`/`slug` não escreve chave
    nenhuma de `settings`, então ele mede o nada. Os três que de fato discriminam, todos em
    ambiente de teste (`trifold-crm-dev`), cada um dentro de **`BEGIN; ... ROLLBACK;`** (o
    trigger `set_updated_at` bomba `updated_at` a cada `UPDATE` e contamina a evidência do
    cenário seguinte):
    - **(a) Anti-`NULL`:** org com as quatro chaves que existem em produção hoje (`city`,
      `state`, `materiais_url`, `relatorio_diario_destinatarios`); chamar a RPC com
      `p_fiscal_cnpj = NULL`. **Asserção: `settings IS NOT NULL` e as quatro chaves continuam
      lá.** Sob o `jsonb_set` da v0.2 esta asserção fica VERMELHA (`settings` vira `NULL`).
    - **(b) Anti-escrita-fantasma:** org **sem** `settings.contato`; chamar a RPC com
      `p_contato_nome = 'Ana'`. **Asserção: `settings->'contato'->>'nome' = 'Ana'` lido de volta
      do banco.** Sob o `jsonb_set` da v0.2 esta asserção fica VERMELHA (a escrita é descartada
      e a leitura devolve `NULL`), mesmo com a RPC devolvendo sucesso.
    - **(c) Anti-regressão dos vizinhos:** o mesmo cenário (b), com a asserção adicional de que
      `materiais_url` e `relatorio_diario_destinatarios` **não mudaram** — é o controle que
      prova que o `||` é merge raso e não substituição.
    - **(d) Coluna nula:** org com `settings IS NULL` (a coluna é nullable — `settings jsonb
      DEFAULT '{}'`, sem `NOT NULL`); a RPC precisa gravar `contato`/`fiscal` sem levantar.
      É o que o `coalesce(settings, '{}'::jsonb)` da AC5 existe para cobrir.
  - [x] 1.4b **Carrasco da trava otimista:** chamar a RPC com `p_expected_updated_at = NULL`.
    **Asserção: levanta `P0024` e a linha NÃO muda.** Sob a redação da v0.2 (`<>`) o `UPDATE`
    acontecia sem proteção — verde por fora, trava desligada por dentro (AC3/AC5).
  - [x] 1.5 Aplicar em ambiente de teste (`trifold-crm-dev`), nunca produção diretamente
- [x] **Task 2 (AC1, AC2, AC3) — Rota**
  - [x] 2.1 Criar `PATCH` em `api/platform/orgs/[id]/dados/route.ts` (arquivo novo, distinto
    do da `900-60`)
  - [x] 2.2 Validações dos OITO campos antes de chamar a RPC — reaproveitar
    `isValidEmail`/`emailError`, `isValidPhoneBR`/`phoneError`, **`isValidCnpj`**,
    `normalizeEmail`, `formatPhoneBR`, `normalizeCpfCnpj` de `@web/lib/validation/contato.ts`
    — **importar, não reescrever**.
    **[CORREÇÃO PO]** `cnpjCnpjError` **não existe** no arquivo (medido: as exportações são
    `emailError`, `phoneError`, `cpfCnpjError`). E `cpfCnpjError` **não serve** para este campo:
    ele aceita 11 dígitos como CPF válido, então um CPF digitado no campo "CNPJ" passaria. O
    campo é CNPJ, a régua é `isValidCnpj` (14 dígitos + os dois dígitos verificadores) — com
    mensagem própria, `FISCAL_CNPJ_INVALIDO`.
  - [x] 2.2b **Antes de chamar a RPC, converter `null` em `''`** para os seis campos
    normalizados. `normalizeCpfCnpj('')` devolve **`null`** (medido) — e passar `null` adiante
    é o gatilho do defeito descrito na AC5.
  - [x] 2.3 Chamar `org_details_update_as_platform` via `createAdminClient().rpc(...)` —
    **nunca `.from("organizations")`** (ver justificativa da AC5)
  - [x] 2.4 Mapear `conflito`/`slug_em_uso`/0-linhas para `409`/`409`/`404` respectivamente
  - [x] 2.5 Registrar a rota em `docs/audits/admin-client-allowlist.json` (seção `plataforma`)
- [x] **Task 3 (AC7, AC8) — UI**
  - [x] 3.1 Componente `editar-dados-empresa.tsx` (diálogo client component, três seções)
  - [x] 3.2 Botão `[ Editar ]` no card "Identidade" de `orgs/[id]/page.tsx`
  - [x] 3.3 Máscaras client-side (`maskPhoneBR`, `maskCnpj`, já existentes em `contato.ts`,
    isomórficas — reaproveitar, não duplicar)
- [x] **Task 4 (AC9, AC10, AC11) — Tratamento de erro e sucesso na UI**
  - [x] 4.1 Mensagens de erro por caso, sem fechar o diálogo
  - [x] 4.2 `router.refresh()` no sucesso
  - [x] 4.3 Conferir que nenhum `console.log`/`console.error` novo ecoa o corpo da requisição
    (AC11) — checagem manual no code review, não automatizada
- [x] **Task 5 — Verificação da trilha**
  - [x] 5.1 Confirmar manualmente (via `900-59`, se já mergeada, ou SQL direto no ambiente de
    teste) que uma edição bem-sucedida grava 1 linha em `platform_audit_log` com
    `actor_type='platform_admin'`, `action='organization.updated'`, `metadata.antes`/`depois`
    corretos, em texto claro, **contendo somente as chaves de `campos_alterados`** (AC5, LGPD)
  - [x] 5.1b Carrasco da minimização: editar SÓ o `name` e afirmar que a linha resultante
    **não contém nenhuma** das seis chaves de contato/fiscal
  - [x] 5.2 Confirmar que uma tentativa "sem mudança" (AC4) **não** grava linha nenhuma
- [x] **Task 6 — Testes**
  - [x] 6.1 Teste de rota: `name` vazio → `400`, RPC nunca chamada
  - [x] 6.2 Teste de rota: `slug` fora do formato → `400`, RPC nunca chamada
  - [x] 6.3 Teste de rota: `contatoEmail` inválido → `400 CONTATO_EMAIL_INVALIDO`, RPC nunca
    chamada
  - [x] 6.4 Teste de rota: `contatoTelefone` inválido → `400 CONTATO_TELEFONE_INVALIDO`
  - [x] 6.5 Teste de rota: `fiscalCnpj` inválido (dígito verificador errado) →
    `400 FISCAL_CNPJ_INVALIDO`, RPC nunca chamada
  - [x] 6.6 Teste de rota: RPC devolve `conflito=true` → `409 CONFLITO_DE_CONCORRENCIA`, corpo
    com os valores atuais
  - [x] 6.7 Teste de rota: RPC devolve `slug_em_uso=true` → `409 SLUG_EM_USO`
  - [x] 6.8 Teste de rota: RPC devolve zero linhas → `404 ORG_NOT_FOUND`
  - [x] 6.9 Teste de rota: sem `platformAdmin` → `403`
  - [x] 6.10 Teste de rota: caminho de sucesso com os oito campos → `200`, RPC chamada com os
    parâmetros corretos (nome/slug crus + contato/fiscal normalizados: e-mail minúsculo,
    telefone mascarado, CNPJ só dígitos)
  - [x] 6.11 Teste de rota: todos os seis campos de contato/fiscal omitidos → `200`, RPC
    chamada com strings vazias, sem erro (confirma que nenhum é obrigatório)
  - [x] 6.12 `pnpm --filter web type-check` limpo
- [x] **Task 7 (AC13) — A projeção da página [TASK NOVA — CORREÇÃO PO]**
  - [x] 7.1 Acrescentar `updated_at, settings` à projeção de
    `platform/orgs/[id]/page.tsx:84` e propagar os dois até o diálogo
  - [x] 7.2 Teste de âncora que reprova se `updated_at` **ou** `settings` sumirem da projeção
    (molde de `platform-query-scan.test.ts:126`, com o `indexOf(...) >= 0` fail-closed)
  - [x] 7.3 Confirmar que nenhuma chave de `settings` fora de `contato`/`fiscal` é renderizada
- [x] **Task 8 (AC14) — Fechar a segunda porta [TASK NOVA — CORREÇÃO PO]**
  - [x] 8.1 `PATCH /api/organization` recusa `contato`/`fiscal` em `body.settings` →
    `400 CHAVE_RESERVADA_DA_PLATAFORMA`
  - [x] 8.2 Teste: `settings: { contato: {...} }` → `400`, nenhuma escrita
  - [x] 8.3 **Controle positivo:** `settings: { city: "Maringá" }` → `200` (a recusa não pode
    quebrar o caminho que já funcionava — `city`/`state` são gravados hoje por
    `dashboard/configuracoes/empresa/page.tsx:134`)

---

## Dev Notes

### Nota de numeração de migration — o achado desta sessão, e por que ele importa

O texto que originou a v0.1 desta story citava "produção está em 271; 249 reservada pela
`900-52`, 250+ reservadas pelo épico 91". **Isso já estava desatualizado na v0.1** ("271" era
contagem de linhas de `trifold_migrations_aplicadas`, não o maior número de arquivo; `249` e
`250` já estavam ocupadas por migrations não relacionadas — ver v0.1 para o levantamento
completo).

**Nesta sessão (v0.2, 2026-09-01), houve uma SEGUNDA colisão, medida diretamente:**
- `251` — reservado pela v0.1 como "candidato" — **JÁ FOI CONSUMIDO**, pela própria `900-60`
  (arquivo `251_pausar_retomar_empresa.sql`, commit local `750b08ec`, mensagem "renumera a
  migration de 250 para 251 — 250 já está ocupado na main"). **Este commit ainda não está em
  nenhuma branch remota** (`git branch -r --contains 750b08ec` devolve vazio) — está na
  branch local `story/900-60-pausar-retomar-empresa`, presumivelmente em vias de ser
  empurrado. Por isso a varredura por `refs/remotes/origin/*` sozinha **não o encontra** — é
  preciso somar `git log --all -- supabase/migrations/` (todas as refs, inclusive locais) à
  varredura remota, não só uma das duas.
- **`252` RECONFIRMADO pelo @po em 2026-09-01**, contra tudo, não só contra o remoto:
  `git fetch --prune`; varredura de `git ls-tree` sobre **todas** as `refs/heads` **e**
  `refs/remotes` (maior número encontrado: `251_pausar_retomar_empresa.sql`);
  `git log --all --oneline --name-only -- 'supabase/migrations/25*'` (mostra os três commits:
  `b7a1b64b` → `250_kanban_stages_default_unico.sql`, `22ec76b2` → `250_pausar_retomar_...`,
  `750b08ec` → renomeia para `251`); `git status --short supabase/migrations/` e
  `git stash list` (nada pendente); e as quatro branches da pilha conferidas uma a uma
  (`story/900-56-57-console-plataforma`, `story/900-58-lista-empresas-busca-filtros`,
  `story/900-56-porta-de-entrada-do-console`, `story/900-60-pausar-retomar-empresa` — as três
  primeiras param em `249`, a quarta tem `251`). **Produção:** `max_num = 250` em
  `trifold_migrations_aplicadas` (Management API, leitura, `User-Agent` identificado, sem
  chave de serviço) — o `251` ainda não foi aplicado porque o commit ainda não foi empurrado.
  **`252` está livre.** Reconfirmar no dia da implementação (Task 1.1) — é
  a mesma disciplina já usada em `900-25`/`900-51`/`900-52`, e esta é a **segunda vez** nesta
  mesma leva de stories que um número "reservado" por um draft anterior já tinha sido
  consumido quando a implementação de fato começou. O padrão que se repete: **nunca confiar
  no número de um draft — sempre remedir no dia, contra local + remoto + produção.**

### Como a checagem foi feita (para o próximo agente repetir, não confiar no número)
```bash
git fetch --prune
# Remoto — pega o que já foi empurrado:
git for-each-ref --format='%(refname)' refs/remotes/origin | while read ref; do
  git ls-tree -r --name-only "$ref" -- supabase/migrations/
done | grep -oE '[0-9]{3}_[a-z_0-9]+\.sql' | sort -u

# Local — pega commits ainda não empurrados em QUALQUER branch local (o que faltou na v0.1
# e causou a colisão 251):
git log --all --oneline -- 'supabase/migrations/25*'
git status --short supabase/migrations/

# Produção, leitura, via Management API + PAT (nunca SUPABASE_SERVICE_ROLE_KEY):
curl -s -X POST "https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "User-Agent: <identifique o agente/story aqui>" \
  -d '{"query": "select max(substring(arquivo from '"'"'^[0-9]+'"'"')::int) from trifold_migrations_aplicadas;"}'
```

### Arquivos existentes relevantes (lidos nesta sessão)
- `packages/web/src/app/platform/orgs/[id]/page.tsx` — o card "Identidade" onde o botão
  `[Editar]` entra.
- `packages/web/src/app/platform/orgs/_components/reenviar-convite.tsx` — o molde de client
  component mais próximo: `"use client"`, `fetch` com `useState` de resultado,
  `router.refresh()` no sucesso, erro mostrado inline sem navegar.
- `packages/web/src/app/api/platform/orgs/[id]/route.ts` — **lido nesta sessão, código real,
  não a story**: é a rota da `900-60`, `PATCH` com corpo `{ isActive, reason }`, escreve só
  `is_active` via `organization_set_active_as_platform`. Confirma que esta story pode criar
  `.../dados/route.ts` sem colisão.
- `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.ts` — molde de rota:
  `getPlatformAdmin()` primeiro, org sempre do parâmetro.
- `packages/web/src/app/api/platform/orgs/route.ts` — `POST` que cria org via
  `db.rpc("provision_org", ...)`; é o precedente de "escrita de plataforma vai por RPC, não
  por `.from().update()`" que a AC5 desta story segue.
- `packages/web/src/lib/validation/contato.ts` — **achado central desta sessão**: já tem
  `isValidEmail`, `normalizeEmail`, `isValidPhoneBR`, `formatPhoneBR`, `maskPhoneBR`,
  `isValidCnpj` (dígito verificador completo), `normalizeCpfCnpj`, `maskCnpj`,
  `isValidCpfCnpj`. Nada disso precisa ser escrito nesta story — só importado.
- `packages/web/src/app/api/pastas/route.ts` — precedente de uso real dessas funções: valida
  com `isValidEmail`/`isValidPhoneBR`, grava com `normalizeEmail`/`formatPhoneBR`. Esta story
  segue a MESMA convenção de gravação.
- `supabase/migrations/155_materiais_module_seed.sql`,
  `packages/web/src/lib/reports/recipients.ts` — precedente de chaves em
  `organizations.settings` (jsonb) para dado só-exibição, sem filtro SQL — o critério de
  "Forma de armazenamento" usado nesta story.
- `supabase/migrations/244_org_admin_invite_email.sql` — contraexemplo medido: por que
  `admin_invite_email` é COLUNA (máquina de estado entre funções) e não candidato ao mesmo
  tratamento dos campos novos desta story.
- `supabase/migrations/248_painel_integracoes_self_service.sql` — o padrão núcleo
  privado + wrapper `_as_platform`/`_as_org`, `platform_audit()`, `REVOKE`/`GRANT`.
- `supabase/migrations/240_provision_org.sql:60` — a regex de validação de slug, reaproveitada
  tal como está.
- `supabase/migrations/001_base_schema.sql:58-67` — `organizations`, com `slug varchar(255)
  UNIQUE`, `settings jsonb`, `logo_url text`, e o trigger `set_updated_at` (linha 288), todos
  reaproveitados sem alteração de schema (exceto a escrita nas chaves de `settings`).
- `packages/web/src/lib/tenancy/platform-query-scan.ts` — o motivo de a escrita ir por RPC.
- `scripts/admin-client-allowlist.test.ts` + `docs/audits/admin-client-allowlist.json` — a
  régua que cobra o registro da AC6.

### Sobre o campo `reason`
**[AUTO-DECISÃO, herdada da v0.1]** Opcional aqui, diferente da `900-60` (onde é obrigatório).
A `900-60` exige `reason` porque o efeito real de pausar uma empresa (crons + contagem de orgs
ativas para roteamento de OUTRA empresa) **não é derivável olhando só o `before`/`after`** — o
`reason` é a única pista de "por quê" que sobrevive. Aqui o `metadata.antes`/`depois` já é
autoexplicativo para os oito campos: "o e-mail de contato mudou de X para Y" não precisa de
motivo para ser entendido meses depois. Tornar `reason` obrigatório aqui seria fricção sem
ganho de auditabilidade correspondente.

---

## Testing

- **Framework:** Vitest para a rota (mock de `createAdminClient`/`getPlatformAdmin`, mesmo
  padrão de `resend-admin-invite/route.test.ts`, já existente no repositório).
- **Migration/SQL:** testada em ambiente de teste (`trifold-crm-dev`), nunca produção
  diretamente — chamando a RPC via `psql`/Management API com os cenários (sucesso, conflito,
  slug em uso, no-op, merge de `settings` preservando `materiais_url`) e conferindo
  `platform_audit_log` depois de cada um.
- **Gate de tipos:** `pnpm --filter web type-check` limpo.
- **CI:** `scripts/admin-client-allowlist.test.ts` precisa continuar verde após a rota nova
  entrar no JSON (AC6).

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml`. Revisão manual
> via Quality Gate desta story (@dev).

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-01 | 0.1 | Draft inicial. Fecha a lacuna medida pela `900-57` ("Sem botão Editar... nem nesta story nem em nenhuma anterior"). Escopo reduzido a `name`/`slug` — status pertence à `900-60` (não duplicado aqui) e "dados de contato" não tem coluna no banco (Artigo IV, não inventado). Rota nova e distinta da `900-60` (`.../dados/route.ts`), para as duas poderem ser implementadas em qualquer ordem sem colisão de merge. Escrita via RPC (núcleo privado + wrapper `_as_platform`, padrão da `900-51`/migration `248`), não via `.from().update()`, para não acender `platform-query-scan.ts`. Concorrência via `updated_at` como trava otimista (trigger já existente desde a migration `001`). Numeração de migration `249`/`250` (citada no pedido original) medida como JÁ CONSUMIDA por migrations não relacionadas — corrigido para `251`, a reconfirmar no dia. | @sm (River) |
| 2026-09-01 | 0.2 | **Escopo expandido por decisão do dono do produto**: contato (responsável/e-mail/telefone) e dados fiscais (CNPJ/razão social/endereço) ENTRAM — armazenados em `organizations.settings` (jsonb, chaves `contato`/`fiscal`), não em colunas novas, por critério medido contra o precedente do repositório (dado só-exibição/sem filtro SQL → jsonb; dado filtrado ou de máquina-de-estado → coluna). Decisão de NÃO esperar a fundação de cobrança para os campos fiscais, citando o próprio princípio do epic ("o artefato nasce onde é primeiro usado, e é refinado depois", linha 542). RPC renomeada de `_org_identity_*` para `_org_details_*` (escopo maior que "identidade"). Validação real reaproveitada de `@web/lib/validation/contato.ts` — achado desta sessão: `isValidCnpj`/`normalizeCpfCnpj` (com dígito verificador, Story 75-282) e `isValidEmail`/`isValidPhoneBR` **já existem no repositório**, nada foi escrito do zero. Merge em `settings` via `jsonb_set` encadeado por chave, nunca substituição do objeto inteiro (protege `materiais_url`/`relatorio_diario_destinatarios`, chaves de outras features no mesmo `settings`). **Logo saiu do escopo desta story** — vira story irmã `900-63` (forma técnica diferente: upload/Storage, não texto validado; achado crítico: `logo_url` tem ZERO consumidores no código hoje). Numeração de migration reconfirmada: `251` (candidato da v0.1) já foi consumido pela própria `900-60` (commit local `750b08ec`, ainda não empurrado — por isso invisível à varredura só-remota) — segunda colisão desta leva; candidato atual é `252`, a reconfirmar no dia. Seção de LGPD nova: contato é dado pessoal (registrado em texto claro na trilha, decisão consciente, não mascarado); CNPJ/razão social/endereço não são dado pessoal (pessoa jurídica), exceção MEI não tratada. Rota e RPC renomeadas nas Tasks/AC; título da story atualizado. | @sm (River) |
| 2026-09-01 | 0.3 | **Validação @po (Pax) — GO 9/10, correções aplicadas dentro da autoridade do PO (AC/escopo).** (1) **AC5 reescrita:** o `jsonb_set` encadeado da v0.2 está MEDIDO como defeituoso em duas frentes silenciosas — `jsonb_set` é STRICT (um `NULL` anula a coluna `settings` inteira, e `normalizeCpfCnpj('')` devolve `null`, então salvar com o CNPJ em branco apagaria `city`/`state`/`materiais_url`/`relatorio_diario_destinatarios`, as 4 chaves que existem em produção hoje) e `create_missing=true` NÃO cria o objeto-pai (como `contato`/`fiscal` são chaves novas, as 6 escritas cairiam no vazio em 100% dos casos, com `200` na tela). Forma nova medida: `coalesce(settings,'{}'::jsonb) \|\| jsonb_build_object(...)`. (2) **AC3/AC5 — trava otimista:** `updated_at <> NULL` avalia para `NULL` e o `IF` não entra no ramo; a trava falhava ABERTA. Passa a ser `IS DISTINCT FROM` + `RAISE P0024` para `p_expected_updated_at IS NULL`. (3) **AC4:** comparação do no-op com `coalesce(...,'')` — chave ausente devolvia `NULL` e o no-op nunca seria detectado. (4) **AC13 NOVA:** a projeção de `orgs/[id]/page.tsx:84` não tem `updated_at` nem `settings` — sem eles a AC7 é inexequível e o operador que edita só o `name` APAGA o contato/fiscal já gravados; régua de âncora obrigatória. (5) **AC14 NOVA:** `PATCH /api/organization` já existe e deixa um admin do tenant escrever `settings` com chaves arbitrárias, sem validação, sem trava e sem trilha — denylist de `contato`/`fiscal` com controle positivo em `city`. (6) **AC15 NOVA:** contato/fiscal exibidos no card, não só dentro do diálogo — sem isso a story entrega a escrita e não a leitura que a própria User Story usa como justificativa. (7) **LGPD: decisão de não mascarar ACEITA**, com correção obrigatória de minimização — `metadata.antes`/`.depois` carregam só as chaves de `campos_alterados` (medido: a coluna `metadata` é imutável por `IS NOT DISTINCT FROM` no trigger da `248`, logo cada cópia é permanente e ineliminável). (8) **Task 1.4 reescrita:** o carrasco da v0.2 passava verde sob os dois defeitos (media o nada); 4 cenários novos + carrasco da trava, em `BEGIN/ROLLBACK`. (9) `cnpjCnpjError` não existe e `cpfCnpjError` aceita CPF de 11 dígitos no campo CNPJ — corrigido para `isValidCnpj`. (10) **Migration `252` RECONFIRMADA** contra `refs/heads` + `refs/remotes` + `git log --all` + as 4 branches da pilha + `git stash` + produção (`max_num=250`). Status Draft → Ready. | @po (Pax) |
| 2026-09-01 | 1.0 | **Implementada (@dev).** Migration `252` (número remedido no dia contra `refs/heads` + `refs/remotes` + `git log --all` + árvore de trabalho, maior = `251`; e contra produção pela Management API, `max_num = 250`). Núcleo `_org_details_update` + wrapper `org_details_update_as_platform`, com merge raso `coalesce(settings,'{}') \|\| jsonb_build_object(...)`, `IS DISTINCT FROM` + `RAISE P0024` para a trava, e trilha só com as chaves de `campos_alterados`. Os 4 cenários da Task 1.4, o 1.4b e a minimização de LGPD foram medidos VERMELHO contra a forma da v0.2 redefinida dentro da mesma transação, e VERDE contra a forma nova — em `BEGIN/ROLLBACK`, no `trifold-crm-dev`. Rota `PATCH /api/platform/orgs/[id]/dados` (arquivo distinto do da `900-60`), diálogo de três seções, projeção da AC13 com régua de âncora, AC15 no card, denylist da AC14 com controle positivo em `city`, registro na allowlist (243 → 244). 12 mutações medidas com `tsc` rc=0. Dois achados de régua herdada durante a implementação (a guarda de embedding da `900-42a` e o delimitador de `console-fail-closed.test.ts` da `900-57`), os dois consertados MOVENDO o código, sem tocar nas réguas. Validado na tela com login pelo formulário no banco de teste, incluindo um conflito real de dois operadores. Status Ready → Ready for Review. | @dev (Dex) |

## Dev Agent Record

**Agente:** @dev (Dex) · **Modelo:** Claude Opus 4.5 · **Data:** 2026-09-01
**Branch:** `story/900-62-editar-dados-da-empresa`, a partir de
`story/900-60-pausar-retomar-empresa` (`31f6ebcc`). A pilha é
`#547 → #549 → #554 → #555 → esta`.

### Task 1.1 — a numeração, remedida no dia (não herdada do draft)

`252` reconfirmado livre, contra as três fontes, em 2026-09-01:

- `git fetch --prune`, depois varredura de `git ls-tree` sobre **todas** as `refs/heads` **e**
  `refs/remotes/origin`, somada a `git log --all --name-only` e ao diretório de trabalho: maior
  número encontrado = **`251`** (`251_pausar_retomar_empresa.sql`, da `900-60`).
- Produção, leitura pela Management API com `User-Agent` identificado, sem chave de serviço:
  `select max(substring(arquivo from '^[0-9]+')::int) from trifold_migrations_aplicadas`
  → **`250`**.

**`252` estava livre e é o número usado.**

### Os defeitos que o @po mediu — reproduzidos contra `trifold-crm-dev`, vermelho e verde

Cada cenário rodou dentro de `BEGIN; … ROLLBACK;` (o trigger `set_updated_at` bomba o
`updated_at` a cada `UPDATE` e contaminaria o cenário seguinte). O "vermelho" é a **forma
defeituosa redefinida dentro da mesma transação** — não uma previsão.

| Carrasco | Forma correta (`\|\|` + `coalesce`) | Forma da v0.2 |
|---|---|---|
| **(a) anti-`NULL`** — org com as 4 chaves de produção, `p_fiscal_cnpj = NULL` | `settings` viva; `city`/`state`/`materiais_url`/`relatorio_diario_destinatarios` **intactas** | **`settings` = `NULL`** e as 4 chaves somem de uma vez |
| **(b) anti-escrita-fantasma** — org sem `settings.contato`, `p_contato_nome='Ana'`, **nenhum parâmetro nulo** | `settings->'contato'->>'nome'` lê `"Ana Souza"` de volta do banco | lê **`null`** — a escrita foi descartada em silêncio, com a RPC devolvendo sucesso |
| **(c) anti-regressão dos vizinhos** — mesmo (b) | `materiais_url` e `relatorio_diario_destinatarios` inalterados | idem (o `\|\|` é merge raso, provado pelo controle) |
| **(d) coluna nula** — `settings IS NULL` | grava `contato`/`fiscal` sem levantar | mutante **sem** o `coalesce` do lado esquerdo: `settings` = `NULL` |
| **1.4b — trava otimista** — `p_expected_updated_at = NULL` | `ERROR: P0024`, linha **intacta** (`name` continua `Empresa A — Teste`) | mutante v0.2 (`<>`, sem o `RAISE`): o `UPDATE` **acontece** — `name` virou `NOME SEQUESTRADO` |
| **5.1b — minimização LGPD** — editar SÓ o `name` numa org que já tem contato/fiscal | 1 linha de trilha, `campos_alterados = ["name"]`, `antes`/`depois` só com `name`, **zero** valores de contato/fiscal | mutante que grava os 8 sempre: **2** linhas (o no-op da AC4 também grava) e os 6 valores copiados para a linha permanente |
| **5.2 — no-op (AC4)** | "Salvar" idêntico logo em seguida: **0** linhas de trilha novas | — |
| **conflito / slug em uso / org inexistente** | `conflito=true` com valores atuais · `slug_em_uso=true` · **zero linhas** · e **0** linhas de trilha nos três, com `name`/`slug` intactos | — |

Isto responde ao achado (3) do parecer: o carrasco da v0.2 ("editar só nome/slug e ver se
`materiais_url` sobrevive") passa verde sob os dois defeitos, porque esse caminho não escreve
chave nenhuma de jsonb — ele media o nada. Os quatro cenários acima escrevem.

### Mutações medidas no TypeScript — todas com `tsc --noEmit` rc=0 antes de contar o vermelho

| # | Mutação | Vermelho |
|---|---|---|
| M1 | `isValidCnpj` → `isValidCpfCnpj` (a escolha intuitiva que o @po vetou) | 2 (o `it` do CPF válido no campo CNPJ, no módulo e na rota) — os outros 60 seguem verdes |
| M2 | `podeSalvar` ignora `houveMudanca` | 3 |
| M3 | falha **FECHA** o diálogo (o defeito do gate QA-900-60-1) | 1 |
| M4 | rota deixa de exigir `expectedUpdatedAt` | 3 |
| M5 | rota manda o corpo CRU à RPC (sem normalizar) | 1 |
| M6 | zero linhas da RPC vira `200` em vez de `404` | 1 |
| M7 | **AC14** — denylist recusa `settings` INTEIRO | 1, e é **só o controle positivo do `city`** — os 5 `it` da recusa continuam verdes. É exatamente o que aquele controle existe para pegar |
| M8 | **AC14** — a denylist some | 5, e o controle positivo continua verde |
| M9 | remove o `?? ""` de `normalizeCpfCnpj` (Task 2.2b) | **não compila** (`TS2322: 'string \| null' is not assignable to 'string'`) — aqui o carrasco é o sistema de tipos, não a suíte |
| M10 | projeção sem `updated_at` (AC13) | 2 · `tsc` rc=0 |
| M11 | projeção sem `settings` (AC13) | 2 · `tsc` rc=0 |
| M12 | entrada da rota removida de `admin-client-allowlist.json` (AC6) | 3, **incluindo a catraca do ESLint por AST** (`expected [ …(2) ] to deeply equal []`) |

Mutantes restaurados por **cópia** (`cp` de snapshot), com o restauro conferido por
`shasum -a 256 -c` — nunca `git checkout --`.

### Dois achados durante a implementação, os dois de régua herdada

1. **A guarda de embedding da `900-42a` acendeu para este arquivo.**
   `detectEmbeddedTableReads` captura tudo até o primeiro `)` depois de `platformQuery(` e acusa
   se achar um `(` no meio. O comentário da AC13 que eu tinha escrito **entre os argumentos**
   citava uma função com parênteses e acendeu a régua. **Conserto: mover o texto para fora da
   população varrida** (o comentário subiu para antes da chamada). A guarda não foi tocada — a
   AC8 da `900-42a` proíbe afrouxá-la, e afrouxar seria trocar um comentário por PII de lead.

2. **`console-fail-closed.test.ts` (Story 900-57) delimita o card "Identidade" ancorando na
   abertura da tag verbatim.** Minha primeira versão punha o botão numa prop `acao` do `<Cartao>`,
   o que quebrava a tag em várias linhas: **4 testes daquele arquivo ficaram vermelhos**, e o
   modo de falha é o pior — o recorte fica VAZIO, e recorte vazio não reprova, só some.
   **Conserto: o botão entra como FILHO do card** (o mesmo lugar de `<ReenviarConvite />` no card
   ao lado) e a assinatura do `<Cartao>` volta à forma da `900-57`. Zero linhas da régua irmã
   mudaram. E o comentário que explica isso **não repete a string da âncora** — o delimitador é
   um `indexOf`, e a primeira versão do comentário, que a reproduzia, foi casada ANTES do código
   de verdade (`<Cartao` contado 3 vezes em vez de 1).

### O que foi visto na tela (contas do banco de teste, login pelo formulário)

`pnpm dev` no projeto **`xnxvygyfyyyzwhiuoehz` (TESTE)**, confirmado pelo banner de boot. Login
como `plataforma@example.com` pelo formulário — nenhuma sessão forjada. `/platform/orgs/{ORG}`:

- **AC15** — antes da edição, o card "Identidade" já mostrava `CONTATO RESPONSÁVEL` e
  `DADOS FISCAIS` com `—` nos seis campos. O botão `Editar` aparece no fim do card.
- **AC7.5** — "Salvar" nasce **desabilitado** e continua desabilitado com um CNPJ de dígito
  verificador errado, com a frase da AC9 na tela ("CNPJ inválido — confira os dígitos.").
- **Máscaras** — digitando `44999998888` o campo virou `(44) 99999-8888`; digitando os 14 dígitos,
  `11.222.333/0001-81`.
- **AC10** — no `200` o diálogo fechou e o `router.refresh()` repintou o card **sem recarregar a
  página**. E-mail digitado `ANA@Example.COM` apareceu como `ana@example.com`; o CNPJ apareceu
  mascarado no card e está gravado **só com dígitos** no banco (`"11222333000181"`).
- **AC9 · `SLUG_EM_USO`** — pondo o slug da Empresa B, o diálogo **ficou aberto**, mostrou "Esse
  identificador já está em uso por outra empresa." e **o slug digitado sobreviveu no campo**. O
  `slug` no banco não mudou.
- **AC3/AC9 · conflito real de dois operadores** — duas abas, as duas com o diálogo aberto. A
  segunda salvou primeiro; a primeira levou `409`, ficou **aberta**, mostrou a frase da AC9 e
  preservou o que tinha digitado. No banco: ficou o valor de **quem ganhou a corrida**, e a
  escrita da aba atrasada **não aconteceu**.
- **Trilha** — as duas edições bem-sucedidas gravaram 1 linha cada
  (`actor_type='platform_admin'`, `action='organization.updated'`, `actor_label` preenchido). As
  tentativas de slug-em-uso e de conflito gravaram **zero**. Total: 2 linhas para 4 tentativas.
- **Zero erros de console** em todas as passagens.

**Defeito de UI encontrado e corrigido na tela, não no papel:** com as três seções, o diálogo
passava de 1080px de altura — o título ficava acima do topo da viewport e os botões abaixo do
rodapé. Corrigido com `max-h-[90vh]` + cabeçalho/rodapé fixos e o miolo rolável.

### Réguas

| Sinal | Baseline | Depois |
|---|---|---|
| `pnpm test` (local, nesta árvore) | 308 arquivos · 4200 passed · 6 expected-fail | **311 · 4274 · 6** |
| `pnpm --filter web type-check` | rc=0 | **rc=0** |
| `pnpm lint --force` | 30 warnings, 0 errors | **30 warnings, 0 errors** — nenhum nos arquivos novos |
| `pnpm build` | verde | **verde**, com `ƒ /api/platform/orgs/[id]/dados` no manifesto |

**Qual baseline foi usado, e por quê:** o **local**, medido nesta árvore antes de qualquer
alteração minha. O CI da base (`#555`, run `33556435171`) reporta 308 / 4.186 / 6; a diferença de
**+14** contra o meu baseline local é composta pelos **+9 testes de outra frente** presentes nesta
árvore (`webhook/whatsapp`, `meta/process-lead`, `tenancy/webhook-org` — arquivos modificados que
não são meus) mais a **folga de 5** que o @devops já havia reportado e que ninguém fechou.
**Não inventei conta para fechá-la** — ela continua aberta e sem dono.

O delta desta story é **+3 arquivos e +74 testes**: 34 (`console-dados-empresa.test.ts`) +
28 (`dados/route.test.ts`) + 9 (`organization/route.test.ts`) + 3 (o bloco da AC13 dentro de
`platform-query-scan.test.ts`, que é arquivo existente).

### O que NÃO consegui provar

1. **A migration `252` não está registrada no ledger do banco de teste.** A função **está**
   aplicada e foi exercitada de ponta a ponta em `trifold-crm-dev` — mas por escrita direta pela
   Management API, não por `pnpm db:apply`. O motivo: `db:apply` aplicaria **as 5 pendentes**
   (`246`, `247`, `249`, `251`, `252`), e quatro delas são de outras stories. Pelo mesmo motivo
   revertei `docs/audits/migrations-aplicadas.json`, que `pnpm db:status` reescreveu como efeito
   colateral carregando o estado dessas cinco. Consequência: `db:status` mostra `252` como
   `PENDENTE` num banco onde a função existe. `CREATE OR REPLACE` é idempotente, então reaplicar
   pelo caminho sancionado é inofensivo.
2. **A AC15 (as linhas de contato/fiscal no card) não tem carrasco automatizado.** É JSX em
   `.tsx`, e o `vitest.config.ts` coleta `*.test.ts` e não `.tsx`. O que existe é a régua da AC13
   (a projeção) mais a fronteira de `lerContatoEFiscal()` (que tem `it` provando que nenhuma
   chave fora de `contato`/`fiscal` sai dela) — nenhuma das duas prova que as linhas estão
   **renderizadas**. A prova aqui é a tela, acima.
3. **A AC11 não tem carrasco para o resto da cadeia.** A régua de forma que escrevi cobre
   `dados/route.ts` (nenhum `console.*` em linha de código). Ela **não** cobre a RPC nem
   middleware/observabilidade de terceiros.
4. **A denylist da AC14 é da ROTA, não da tabela.** Os três server actions do cliente
   (`dashboard/configuracoes/empresa/page.tsx:134`, `.../materiais/page.tsx:71`,
   `.../relatorio-diario/page.tsx:120`) continuam fazendo spread do objeto inteiro direto em
   `organizations`. Eles **não conseguem** gravar `contato`/`fiscal` hoje porque nenhum formulário
   deles tem esses campos — mas isso é uma propriedade dos formulários, não uma garantia. Fechar
   por `CHECK`/trigger no banco é story própria; registrado como comentário no arquivo, não
   silenciado.
5. **Produção não foi tocada** — só a leitura do `max(num)` de `trifold_migrations_aplicadas`,
   pela Management API com `User-Agent` identificado e PAT. Nenhuma chave de serviço, nenhuma
   escrita, nenhum DDL.

### File List

**Novos**
- `supabase/migrations/252_editar_dados_da_empresa.sql`
- `packages/web/src/lib/tenancy/console-dados-empresa.ts`
- `packages/web/src/lib/tenancy/console-dados-empresa.test.ts`
- `packages/web/src/app/api/platform/orgs/[id]/dados/route.ts`
- `packages/web/src/app/api/platform/orgs/[id]/dados/route.test.ts`
- `packages/web/src/app/platform/orgs/_components/editar-dados-empresa.tsx`
- `packages/web/src/app/api/organization/route.test.ts`

**Modificados**
- `packages/web/src/app/platform/orgs/[id]/page.tsx` — projeção da AC13, linhas da AC15, botão da AC7
- `packages/web/src/app/api/organization/route.ts` — denylist da AC14
- `packages/web/src/lib/tenancy/platform-query-scan.test.ts` — bloco de âncora da AC13
- `docs/audits/admin-client-allowlist.json` — a rota nova na seção `plataforma` (AC6)
- `scripts/admin-client-allowlist.test.ts` — `TOTAL_ESPERADO` 243 → 244
- `docs/stories/900-62-editar-dados-da-empresa.story.md` — este registro

### Decisões autônomas

- `[AUTO-DECISION]` O botão "Editar" fica no **fim do card**, e não no cabeçalho como no wireframe
  §3.3 → **filho do `<Cartao>`** (razão: o cabeçalho exigiria quebrar a tag em várias linhas, e
  isso esvazia o recorte de `console-fail-closed.test.ts` da `900-57`; `<ReenviarConvite />` já é
  o precedente de botão dentro do corpo do card).
- `[AUTO-DECISION]` O módulo de decisão **não** importa `decidirDesfecho()` da `900-60` → função
  própria em `console-dados-empresa.ts` (razão: a story declara, em três lugares, que **não
  depende** da `900-60`; importar do arquivo dela criaria a dependência que o texto nega).
- `[AUTO-DECISION]` A rota **não** faz leitura prévia de `organizations` (a `900-60` faz, para
  distinguir `503` de `404`) → a RPC já devolve zero linhas para org inexistente, e a AC5 manda a
  rota decidir o `404` a partir disso. Uma viagem a menos, e nada perdido.
- `[AUTO-DECISION]` `docs/audits/migrations-aplicadas.json` foi **revertido** → ver "O que NÃO
  consegui provar", item 1.

## QA Results
_(Preenchido pelo @qa.)_
