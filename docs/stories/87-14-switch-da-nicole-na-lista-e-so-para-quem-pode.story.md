# Story 87-14 — O switch da Nicole sai do fim do formulário e vai para a lista, habilitado só para quem pode alterá-lo

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Validada por:** @po (Pax) em 2026-08-15 — **GO** após 8 emendas. Parecer:
`docs/qa/po-validation-87-14.md`. **As emendas E1, E2 e E8 corrigiam ACs que eu executei e que eram
impossíveis de cumprir como escritas** — leia o parecer antes de implementar.
**Item do roadmap:** derivado do **`W1-8`** (a story `87-13`, mergeada em 11/08). ⏳ **@pm precisa
criar a entrada** — o @sm não edita o corpo do epic; a linha em `stories_planned` nasce no mesmo
commit desta story, conforme a regra da §10.
**Criada por:** @sm (River) em 2026-08-15
**Formato:** **Interface e permissão. Zero backend.** Nenhuma migration, nenhuma linha em
`packages/ai/`, nenhuma linha em `packages/web/src/app/api/`. O enforcement da `87-13` fica **byte a
byte** onde está — esta story só para de mentir sobre ele na tela.
**Executor:** @dev (React/Next) — sem @data-engineer, sem @devops além do push
**Esforço:** **S** (3 arquivos tocados — `properties/page.tsx`, `edit/page.tsx`,
`nicole-enabled.test.ts` — e 3 criados: a função pura, o componente e o teste dela)
**Risco:** **Baixo** — a régua do servidor não muda; o que muda é quem vê o controle e onde ele fica

> **CodeRabbit Integration**: Disabled
> *(`.aios-core/core-config.yaml` não tem a chave `coderabbit_integration` — conferido em 15/08.)*

> ### Os dois defeitos, em duas linhas
>
> **1. Descoberta.** O switch existe desde 11/08, em `properties/[id]/edit/page.tsx:437-455` —
> **depois de três textareas de JSON**, no fim de um formulário de 488 linhas. O Gabriel não o achou.
>
> **2. 🔴 Permissão.** A tela de edição **não checa papel nenhum** antes de renderizar o toggle. A
> rota exige `imoveis.ativar_nicole` (admin/supervisor). Quem é `obras` ou `gerente-relacionamento`
> **abre a tela, marca a caixa, salva e leva 403.** É um controle editável que não faz nada — a
> mesma doença que fez a `87-0` escrever o `config-surfaces.test.ts`, só que pelo eixo da permissão
> em vez do eixo do consumidor.

---

## Story

**Como** Gabriel, dono do que a Nicole pode dizer a um lead pago,
**Quero** ver e alternar o switch de cada empreendimento **na lista**, e que ele só apareça
acionável para quem de fato pode alterá-lo,
**Para que** a decisão de pôr um empreendimento na boca dela seja **encontrável** e **honesta** —
nem escondida no fim de um formulário, nem oferecida a quem o servidor vai recusar.

---

## Context

> **Todas as medições desta seção são minhas, contra o repositório em `24800872` e contra produção
> (`dsopqkqjkmhytudaaolv`, Management API, somente `SELECT`), em 15/08/2026.** Consulta ou
> `arquivo:linha` ao lado de cada número.

### 1. O que já está no ar, e que esta story NÃO refaz

A `87-13` foi mergeada e o campo está em produção. Medido agora:

```sql
select p.name, p.slug, p.is_active, p.nicole_enabled,
       (select count(*) from typologies t where t.property_id=p.id) tipologias,
       (select count(*) from agent_media_assets a where a.property_id=p.id and a.is_active) midias
from properties p order by p.created_at, p.name;
```

| nome | slug | `is_active` | `nicole_enabled` | tipologias | mídias |
|---|---|---|---|---|---|
| Vind Residence | `vind-residence` | `true` | **`true`** | 1 | 7 |
| Yarden | `yarden` | `true` | **`true`** | 2 | 5 |
| Japura | `japura` | `true` | **`false`** | 0 | 0 |
| Solum | `solun` | `true` | **`false`** | 0 | 0 |

O passo 4 do deploy da `87-13` rodou: os quatro estão com `is_active = true` de novo, e a separação
entre *"existe no CRM"* e *"a Nicole fala dele"* está feita no dado. **Nada de banco a fazer aqui.**

O filtro está em `packages/ai/src/chat/pipeline.ts` (`loadProperties`) e é o que decide o contexto
do turno. **Esta story não o toca.** O `config-surfaces.test.ts` já tem a entrada
`properties.nicole_enabled` (`packages/ai/src/config-surfaces.test.ts:269`) com prova comportamental
— **não se acrescenta superfície nova**, porque o campo é o mesmo; o que muda é quem o edita e por
onde.

### 2. A lista já mostra o estado — e só isso

`packages/web/src/app/dashboard/properties/page.tsx` (115 linhas, Server Component) traz
`nicole_enabled` no `select` (`:14`) e renderiza um `<span>` de leitura na coluna NICOLE
(`:64-76`): *"Nicole: ligada"* / *"Nicole: desligada"*. É badge, não controle. Para mudar, a única
porta é `Editar → rolar 455 linhas`.

A página já resolve permissão do jeito novo, no servidor:

```tsx
// properties/page.tsx:19-21
const canEdit = await canEditImoveis(user.id, user.orgId)
const canCreate = await canCreateImoveis(user.id, user.orgId)
```

E `permissions-imoveis.ts` **não é mais lista de papéis** — o refactor F3 (Story 75-306) o converteu
em capabilities:

```ts
// packages/web/src/lib/permissions-imoveis.ts
export async function canCreateImoveis(userId, orgId) { return can(userId, orgId, "imoveis.criar") }
```

⚠️ **Ler isto antes de copiar padrão antigo:** `IMOVEIS_CREATE_ROLES` e `IMOVEIS_EDIT_ROLES`
**não existem mais como arrays**. Medido em 15/08 (`grep -rn` em `packages/*/src`, fora de
`.next/`): **8 ocorrências, TODAS em comentário ou nome de teste** — **zero declaração, zero
`import`, zero uso como identificador**. (Os arquivos `.next/` ainda têm os nomes em source maps
antigos; não confundir build stale com código.) A decisão do @po na `87-13` sobreviveu, mas **com
outro nome**: virou a capability `imoveis.ativar_nicole`, própria, com o mesmo seed que
`imoveis.criar` (`[admin, supervisor]`).

```ts
// packages/web/src/lib/capabilities.ts:165
{ key: "imoveis.ativar_nicole", label: "Ativar Nicole no empreendimento",
  description: "Ligar a IA no empreendimento (desligar é livre).", seed: [A, S], enforced: true }
```

**Reaproveitar a permissão que já existe = usar `can(user, "imoveis.ativar_nicole")`.** Não é
inventar capability nova: ela já está no registro, já está `enforced`, já tem linha em
`role_permissions` para os 10 papéis e já é a régua da rota (`api/properties/[id]/route.ts:125`).

### 3. 🔴 O furo, medido — quem chega na tela e quem o servidor recusa

A tela de edição tem guard de servidor, e ele é o **errado para este campo**:

```tsx
// properties/[id]/edit/layout.tsx — o guard que existe
if (!(await canEditImoveis(user.id, user.orgId))) redirect(`/dashboard/properties/${id}`)
```

`imoveis.editar` ≠ `imoveis.ativar_nicole`. Medido em produção (`role_permissions` × `roles`, 15/08):

| papel | `imoveis` (módulo) | `imoveis.editar` | `imoveis.ativar_nicole` | usuários ativos |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | 5 |
| supervisor | ✅ | ✅ | ✅ | 4 |
| **obras** | ❌ | **✅** | **❌** | **2** |
| **gerente-relacionamento** | ❌ | **✅** | **❌** | **1** |
| broker | ✅ | ❌ | ❌ | 4 |
| gerente-comercial | ✅ | ❌ | ❌ | 1 |
| sdr | ✅ | ❌ | ❌ | 1 |
| imob | ✅ | ❌ | ❌ | 1 |
| consultoria | ✅ | ❌ | ❌ | 2 |
| social-media | ❌ | ❌ | ❌ | 1 |

**As 3 pessoas das duas linhas em negrito passam pelo guard, veem o toggle, e o servidor as
recusa.** Não é hipótese: `imoveis.editar = true` abre o `layout.tsx`, e o `PATCH` devolve 403 assim
que o valor muda (`route.ts:125`, `requireCapability(appUser, "imoveis.ativar_nicole")`).

> **A ressalva honesta, e ela reduz o tamanho do furo sem apagá-lo.** `obras` e
> `gerente-relacionamento` têm o **módulo** `imoveis` = `false`, então o item não aparece na barra
> lateral: a rota é alcançável **por URL**, não por navegação. E `/dashboard/properties/page.tsx`
> **não tem** `canAccess(user, "imoveis")` (medido: nenhuma das duas páginas de `properties/` tem
> guard de módulo — só as três sub-rotas `new/`, `edit/`, `units/` têm, e todas por
> `canEditImoveis`). Ou seja: o caminho existe, é discreto, e **não é o que esta story conserta**
> (ver Achado nº 2). O que ela conserta é o controle mentir para quem chega lá.

### 4. Por que o conserto é REMOVER o toggle da edição, e não protegê-lo lá

A saída óbvia seria desabilitar o toggle na tela de edição quando o usuário não pode. Ela custa mais
do que parece: `edit/page.tsx` é `"use client"` **na raiz da página** — não há camada de servidor
para resolver `can()` e passar como prop. As duas formas de contornar isso são caras ou sujas:

| alternativa | custo real | veredito |
|---|---|---|
| quebrar a página em Server Component + `_components/property-edit-form.tsx` | move ~470 linhas de formulário **sem nenhum teste cobrindo**, para ganhar um booleano | **recusada** — diff enorme, risco desproporcional |
| `GET /api/properties/[id]` passa a devolver `pode_ativar_nicole` | 6 linhas, testável por rota, **mas cria um segundo transporte** de permissão convivendo com `can()` no servidor | **recusada** — deriva de shape entre dois caminhos para o mesmo fato |
| **remover o toggle da edição e deixar UM controle, na lista** | apaga 19 linhas de JSX + 3 estados órfãos; a lista **já é Server Component** e já resolve capability | ✅ **escolhida** |

**A subtração fecha o furo por construção:** um controle que não é renderizado não pode mentir. E é
o instrumento que este epic prefere — a `87-13` fechou o vazamento da Nicole com um `.eq` a mais,
não com um `if` a mais.

### 5. Onde o controle passa a viver

Na lista, **na célula onde o badge já está**. É a superfície certa por três motivos medidos: (a) é
onde os quatro empreendimentos aparecem juntos, e o estado do switch só significa alguma coisa em
comparação; (b) já resolve capability no servidor; (c) é a tela que o Gabriel abriu quando foi
procurar o switch e não achou.

---

## Desenho

### 1. A função pura — a decisão sai do JSX

Arquivo novo, `packages/web/src/lib/nicole-switch.ts` (≈ 40 linhas, sem imports de servidor):

```ts
export interface EstadoSwitchNicole {
  ligado: boolean
  /** `false` ⇒ **não se renderiza `<input>` nenhum** — só o badge de leitura de hoje.
   *  (Decisão do Gabriel, 15/08: quem não pode continua VENDO o estado; some o CONTROLE,
   *  não a informação. Controle desabilitado foi explicitamente recusado.) */
  interativo: boolean
  /** Não-nulo EXATAMENTE quando `interativo === false`. Vai no `title` do badge de leitura
   *  e é a mensagem da rede de segurança em caso de 403. */
  motivo: string | null
  /** Pergunta da confirmação, nas DUAS direções (emenda E4 do @po).
   *  `"Ligar a Nicole no {nome}?"` | `"Desligar a Nicole no {nome}?"` */
  textoConfirmacao: string
  rotulo: string   // "Nicole: ligada" | "Nicole: desligada"  ← preserva o texto de hoje
}

export function estadoSwitchNicole(input: {
  nicoleEnabled: boolean
  podeAtivar: boolean
  nome: string
}): EstadoSwitchNicole
```

Regra única: `interativo === podeAtivar`. Quando falso,
`motivo = "Só admin e supervisor podem ligar ou desligar a Nicole num empreendimento."`
`textoConfirmacao` deriva da **direção do clique**: `nicoleEnabled === false` ⇒ *"Ligar a Nicole
no {nome}?"*; `true` ⇒ *"Desligar a Nicole no {nome}?"*. Não existe mais campo `precisaConfirmar`:
**toda** mudança confirma (ver §5).

**Por que uma função e não um `&&` no JSX:** o JSX desta casa não é testável (§ AC5), então tudo o
que for decisão sai dele e vira algo que um `.test.ts` alcança. O componente fica burro a ponto de a
conferência humana ser de uma linha.

### 2. O componente — um Client Component pequeno

`packages/web/src/app/dashboard/properties/_components/nicole-switch.tsx`:

- props: `{ propertyId, nome, nicoleEnabled, podeAtivar }`;
- chama `estadoSwitchNicole`. **Dois caminhos, decididos por `estado.interativo`:**
  - 🔴 **`interativo === false` ⇒ renderiza EXATAMENTE o `<span>` de hoje** (`page.tsx:66-74`:
    mesmas classes, mesmo texto `estado.rotulo`), acrescido de `title={estado.motivo}`. **Nenhum
    `<input>`, nenhum controle desabilitado, nenhum `onClick`.** Para os 8 papéis que não podem, a
    célula fica **byte a byte** o que já está em produção — a mudança é `+title`, nada mais;
  - `interativo === true` ⇒ `<input type="checkbox" role="switch">` com `estado.rotulo` ao lado
    (**o texto do badge não muda**);
- ao alternar: `PATCH /api/properties/{id}` com **exatamente** `{ nicole_enabled: <novo> }` — nada
  mais no body;
- `200` ⇒ `router.refresh()`;
- `422` ⇒ renderiza `json.faltando` (os rótulos que a rota já devolve, item a item) logo abaixo do
  switch, com um link **"Completar cadastro"** para `/dashboard/properties/{id}/edit`, e **não**
  altera o estado visual;
- `403` ⇒ mensagem do `motivo` (não deveria acontecer; é a rede de segurança);
- enquanto a requisição corre, `disabled` (evita duplo clique).

**Sem update otimista.** O estado visual só muda depois do `200`. Otimismo aqui produziria
exatamente a mentira que a story existe para tirar da tela.

### 3. A lista

`properties/page.tsx` — três linhas de mudança:

```tsx
import { can } from "@web/lib/permissions"
const podeAtivarNicole = await can(user.id, user.orgId, "imoveis.ativar_nicole")
// ...na célula NICOLE, o <span> vira:
<NicoleSwitch propertyId={p.id} nome={p.name}
              nicoleEnabled={p.nicole_enabled === true} podeAtivar={podeAtivarNicole} />
```

`can()` é resolvido **uma vez por request** (o `getUserPermissions` por trás dele é cacheado por
`userId`/`orgId`), não por linha.

### 4. A tela de edição — subtração

Em `properties/[id]/edit/page.tsx`, apagar:

- o bloco de JSX `:437-455` (o toggle e a legenda);
- os estados `nicoleEnabled`, `nicoleEnabledOriginal` e `faltando`, e tudo que os alimenta
  (`:115-116`, `:196-198`, o `setFaltando` do `handleSave`, a `<ul>` de `faltando`);
- o campo `nicole_enabled` da interface `PropertyData` (`:32`).

**Substituir por um ponteiro ESTÁTICO, não por nada e não por um espelho de leitura:** no lugar do
toggle fica o texto *"O switch da Nicole (quais empreendimentos ela pode citar) fica na lista de
empreendimentos."*, com link para `/dashboard/properties`. Sem isso, quem estiver editando o
cadastro perde a informação de que o switch existe, e a story trocaria um problema de descoberta por
outro.

> 🔴 **Por que estático, e não "ligada / desligada" em modo leitura.** Um espelho exigiria manter
> `nicole_enabled` na `interface PropertyData` e no `setState` do `fetch` — isto é, **a tela de
> edição continuaria carregando o campo**, e o próximo refactor que montar o body a partir do estado
> o reenviaria sem querer, ressuscitando o 403. O ponteiro estático é a única forma de o arquivo
> ficar com **zero ocorrência** do identificador, que é o que a AC5 mede. O estado real está a um
> clique, na lista, onde o controle vive.

> ✅ **@po (15/08), emenda E5 — ratifico o ponteiro estático, e ele NÃO ganha espelho de leitura.**
> A decisão do Gabriel (*"o badge continua para todos"*) é sobre **a lista**, que é onde o estado
> dos 4 empreendimentos só significa alguma coisa em comparação. Espelhar o estado na tela de
> edição custaria manter `nicole_enabled` na `interface PropertyData` e no `setState` do `fetch` —
> e a AC5 mede **zero** ocorrência do identificador justamente porque hoje ele aparece **15 vezes**
> nesse arquivo, **3 delas dentro do `handleSave`** (`:194-196`). Espelho e AC5 são incompatíveis.
> **Duas exigências sobre o ponteiro**, para ele não virar rodapé que ninguém lê: (a) fica **no
> mesmo lugar visual** do bloco removido (a caixa `mt-6` com borda), para quem rolar até ali achar
> a explicação onde o controle estava; (b) o link é um `<Link>` de verdade para
> `/dashboard/properties`, não texto solto.

> ⚠️ **A guarda "só envia quando muda" da `87-13` não está sendo revogada — ela está ficando sem
> objeto.** O formulário deixa de enviar `nicole_enabled` **em qualquer circunstância**, então o
> usuário de `obras` continua salvando o resto da tela sem 403 — pelo motivo mais forte (o campo não
> vai no body) em vez do motivo condicional. **A lógica da rota não muda uma vírgula**, e o teste que
> a protege (`"papel: reenviar o valor ATUAL não exige o papel elevado"`) continua verde e continua
> valendo para qualquer outro cliente da API.

### 5. 🔴 A confirmação — **MANTIDA, e nas DUAS direções** (arbitragem do @po, emenda E4)

O @sm propôs confirmar **só ao ligar**, com o argumento de que *"desligar é o lado seguro"*. Eu
mantenho a confirmação e **estendo a desligar**, porque o argumento não sobrevive à contagem nas 4
linhas de produção:

| direção | em quais das 4 linhas o clique é alcançável hoje | rede já existente |
|---|---|---|
| **ligar** | Japura e Solum (`tipologias = 0`) | 🟢 **o servidor já barra** com 422 (`route.ts:130-152`, mínimo `B1`) |
| **desligar** | Vind e Yarden (as 2 que a Nicole efetivamente usa) | 🔴 **nenhuma** — nem mínimos, nem `system_event` (Achado nº 3) |

Confirmar só ao ligar protege exatamente a direção **que já tem rede**, e deixa nua a que não tem.
Desligar o Vind por engano é a ação mais consequente que esta tela oferece: a Nicole para de citar o
carro-chefe para lead pago, **em silêncio** — ninguém é notificado e nada fica registrado. Isso é
régua saturada: o critério dispara onde não precisa e cala onde precisaria.

⚠️ **E é a mesma leitura errada que a AC3 existe para corrigir.** *"Desligar nunca é bloqueado"* é
uma decisão minha na `87-13` sobre os **mínimos de cadastro** — não é um juízo de que desligar seja
inconsequente. Reaproveitar essa frase como argumento de UX propaga o erro para outra camada.

**Forma:** inline, sem dependência nova. Qualquer clique troca a célula por `estado.textoConfirmacao`
com **[Confirmar]** e **[Cancelar]**; `Cancelar` devolve a célula ao estado anterior sem chamar a
rota. Não há mais campo `precisaConfirmar` — o que a função pura devolve é o **texto**, que é o que
tem conteúdo testável.

**Este bloco deixa de ser separável.** Ele é a única rede da direção sem rede.

---

## Acceptance Criteria

> `npx vitest run` da **RAIZ**, na **suíte inteira**, nunca `--reporter=basic`, nunca só no arquivo
> do módulo. *(Nota `P1` do gate da `87-8`, `C4` do gate da `87-7`.)*
>
> **E antes de declarar que um teste prova algo: remova o que ele diz provar e veja se cai.** Toda
> AC com 🔴 traz a mutação exigida; nenhuma vale sem ela — colar a saída bruta do reporter.

### AC1 — 🔴 A régua da permissão é comportamental, exercida pela ROTA, e cobre TODOS os papéis

Arquivo: `packages/web/src/app/api/properties/nicole-enabled.test.ts` (o da `87-13`; **acrescentar
casos, não reescrever os 14 existentes**).

Caso novo, **tabela derivada do registro** — nunca uma lista de nomes digitada à mão:

```ts
for (const papelSobTeste of KNOWN_ROLES) {
  fake = createFakeSupabase(seed())          // 🔴 E2: reset OBRIGATÓRIO a cada volta
  papel = papelSobTeste
  const autorizado = papelSobTeste === "admin" ||
    (CAPABILITY_SEED["imoveis.ativar_nicole"] as readonly string[]).includes(papelSobTeste)
  const { status } = await patch(VIND, { nicole_enabled: true })   // false -> true, transição REAL
  // autorizado  ⇒ status === 200  E  linha(VIND).nicole_enabled === true
  // !autorizado ⇒ status === 403  E  linha(VIND).nicole_enabled === false
}
```

- (i) os **10** papéis de `KNOWN_ROLES` são exercidos — assertar `KNOWN_ROLES.length === 10` no
  mesmo teste, para que um papel novo no registro **quebre o teste** em vez de passar despercebido;
- (ii) 🔴 **controle positivo COM DENTES, e não é o admin** (emenda E2 do @po — como estava, a AC
  ficava em zero de qualquer jeito):
  - **`status !== 403` não serve como asserção.** O gate só roda dentro do `if (muda)`
    (`route.ts:121`). Um PATCH que **não muda** o valor devolve **200 sem nunca consultar a
    capability** — o teste ficaria verde com o gate inteiro apagado. Assertar `status === 200`
    **e** `linha(VIND).nicole_enabled === true`: a metade "autorizado" só passa se a alteração
    **aconteceu**;
  - **o reset da fixture a cada volta não é higiene, é a AC.** `KNOWN_ROLES[0] === "admin"`: sem
    reset, a primeira volta deixa o Vind em `true` e **as 9 seguintes viram no-op** (`muda ===
    false`), que é precisamente o caso em que o gate não roda;
  - `supervisor` explicitamente exercido e verde (senão a metade "autorizado" passaria por bypass
    de admin e a AC não mediria nada);
- (iii) 🔴 **mutação:** trocar a capability do gate da rota por `imoveis.editar` ⇒ `obras` e
  `gerente-relacionamento` deixam de receber 403 ⇒ (i) cai. Colar o vermelho.

> **Esta é a AC que o briefing pede como "prova comportamental, não visual":** ela exercita a rota
> com papel não autorizado e afirma que a alteração **não acontece**. O que ela não prova é a
> aparência da tela — isso é a AC5 (função pura) e a AC8 (conferência humana), declaradas como tais.

### AC2 — 🔴 Controle negativo obrigatório: LIGAR quem passa os mínimos FUNCIONA

Provar só que "desligado bloqueia" mede metade.

- (i) `supervisor` liga o **Vind** (1 tipologia, passa o `B1`), transição real `false → true` ⇒
  **200**, e a linha fica `nicole_enabled = true`;
- (ii) `supervisor` liga o **Japura** (0 tipologias) ⇒ **422**, com `missing: ["tipologias"]` e
  `faltando` não vazio (é o array que o componente renderiza);
- (iii) 🔴 **mutação:** fazer `avaliarMinimosNicole` devolver sempre `missing: []` ⇒ (ii) cai;
  fazer devolver sempre `missing: ["tipologias"]` ⇒ (i) cai. **As duas direções**, colar as duas.

### AC3 — 🔴 Desligar nunca é bloqueado pelos MÍNIMOS — e continua exigindo o PAPEL

A decisão do @po na `87-13` é sobre os mínimos, não sobre permissão. A AC escreve a distinção para
ela parar de ser lida errado:

- (i) `supervisor` desliga o **Japura** com o cadastro vazio (`nicole_enabled = true` no fixture)
  ⇒ **200**, sem 422 — nada que este código faça impede alguém de calar a Nicole;
- (ii) `obras` tentando **desligar** ⇒ **403**. A válvula do §6 da `87-13` é *"os mínimos não
  bloqueiam o desligar"*, **não** *"qualquer um desliga"*;
- (iii) 🔴 **mutação (corrigida — emenda E3 do @po):** **remover o `if (desejado)`**, isto é, mover
  o bloco inteiro (`carregarCadastroNicole` **+** `avaliarMinimosNicole` **+** o `return` 422) para
  fora dele ⇒ (i) cai.
  > A mutação como o @sm escreveu era um tiro de festim: **mover só a chamada de
  > `carregarCadastroNicole`** deixa `avaliarMinimosNicole` e o `return` 422 dentro do `if
  > (desejado)`, o comportamento não muda em nenhum caso, e (i) continua **verde**. Conferido linha
  > a linha em `route.ts:131-152`. Mutação que não mata teste não prova nada.

### AC4 — 🔴 A decisão da tela é uma função pura, e ela é testada

Arquivo novo: `packages/web/src/lib/nicole-switch.test.ts`.

- (i) as **4** combinações de `{ nicoleEnabled, podeAtivar }`: `interativo === podeAtivar` nas
  quatro; `motivo` é não-nulo **exatamente** quando `interativo === false` (assertar os dois lados —
  um `expect(motivo).toBeTruthy()` sozinho passaria com `motivo` sempre preenchido);
- (ii) `rotulo` devolve **exatamente** `"Nicole: ligada"` / `"Nicole: desligada"` — os textos que já
  estão em produção em `page.tsx:73`. Um teste de string literal aqui é barato e impede que o
  refactor renomeie o badge sem querer. **Com a decisão do Gabriel, este rótulo virou o que os 8
  papéis sem permissão continuam lendo** — renomeá-lo mudaria a tela de 20 das 24 pessoas ativas;
- (iii) 🔴 **`textoConfirmacao` nas duas direções** (emenda E4): `nicoleEnabled === false` ⇒
  `"Ligar a Nicole no Yarden?"`; `nicoleEnabled === true` ⇒ `"Desligar a Nicole no Yarden?"`. Os
  dois casos assertados por igualdade de string, com o `nome` interpolado (senão um texto fixo
  passa);
- (iv) 🔴 **mutações — as DUAS, coladas:** (a) fixar `interativo: true` ⇒ 2 dos 4 casos de (i) caem;
  (b) fixar `textoConfirmacao` num literal só ⇒ 1 dos 2 casos de (iii) cai.

### AC5 — 🔴 O toggle NÃO existe mais na tela de edição (verificável por comando)

```bash
grep -n "nicole_enabled\|nicoleEnabled\|faltando" \
  "packages/web/src/app/dashboard/properties/[id]/edit/page.tsx" | wc -l
# hoje: 15   ·   esperado depois: 0
```

- (i) colar a saída **antes** (medida em 15/08: **15 linhas** — `:32`, `:46`, `:71`, `:74`, `:79`,
  `:115`, `:116`, `:194`, `:195`, `:196`, `:213`, `:218`, `:442`, `:460`, `:462`) e **depois** (0).
  **Zero é o número, não "quase zero"**: enquanto o identificador existir no arquivo, o campo ainda
  pode voltar ao body num refactor futuro;
- (ii) o ponteiro estático existe e aponta para `/dashboard/properties` — conferir com
  `grep -n "fica na lista de empreendimentos"` (uma ocorrência) e visualmente na AC8 passo 5;
- (iii) o `handleSave` **não monta** `nicole_enabled` em nenhum ramo — colar o `git diff` do bloco;
- (iv) 🔴 **mutação:** reintroduzir `body.nicole_enabled = nicoleEnabled` ⇒ (i) e (iii) caem.
- (v) 🔴 **A chave da capability na lista, por literal** (emenda E6 do @po):

  ```bash
  grep -c '"imoveis.ativar_nicole"' packages/web/src/app/dashboard/properties/page.tsx   # → 1
  ```

  > **Por que uma AC de `grep` para uma linha só.** Medido em 15/08: **29 das 103 capabilities do
  > registro têm `seed` exatamente `[A, S]`** — inclusive `imoveis.criar`, `imoveis.apagar`,
  > `imoveis.vender_unidade` e `imoveis.tipologias_editar`. Escrever
  > `can(user.id, user.orgId, "imoveis.criar")` no `page.tsx` **compila** (é `CapabilityKey`
  > válida), **acerta a tela hoje** (mesma resposta nos 10 papéis) e **nenhum teste deste
  > repositório detecta** — a AC1 exercita a rota, que não muda, e componente não é testável (AC8).
  > A divergência só apareceria no dia em que o Gabriel mexesse na matriz do painel para uma das
  > duas chaves, sem deploy e sem aviso. É colinearidade de fixture pelo eixo da capability: 28
  > escolhas erradas ficam verdes. O literal é a única régua barata que separa as 29.

### AC6 — 🔴 O backend não é tocado. Zero diff onde o enforcement mora

> 🔴 **CORRIGIDA pelo @po (emenda E1) — como estava, esta AC era IMPOSSÍVEL de cumprir e teria
> devolvido a story para mim por regra própria da (iii).** O arquivo de teste que a **T6 manda
> editar** — `packages/web/src/app/api/properties/nicole-enabled.test.ts` — mora **dentro** do
> terceiro pathspec proibido. Executei o comando do @sm contra o commit real que mexeu naquele
> arquivo (`ca26e5ed`, Story 75-306) e ele aparece na saída:
>
> ```
> $ git diff --stat ca26e5ed~1..ca26e5ed -- packages/ai/ supabase/migrations/ packages/web/src/app/api/
>  .../src/app/api/properties/nicole-enabled.test.ts   |   21 +-
>  ...
> ```
>
> AC6 e AC1/AC2/AC3/T6 eram mutuamente exclusivas. A régua certa separa **código** de **teste**:
> o que a story promete não tocar é o **enforcement**, não a prova dele.

```bash
# (a) NADA de código nas três pastas proibidas — a única exceção é o arquivo de teste da 87-13
git diff --name-only origin/main...HEAD -- packages/ai/ supabase/migrations/ packages/web/src/app/api/ \
  | grep -v '^packages/web/src/app/api/properties/nicole-enabled\.test\.ts$'
# esperado: nenhuma linha de saída

# (b) e o que mudou NAQUELE arquivo é aditivo — zero linha removida
git diff --numstat origin/main...HEAD -- packages/web/src/app/api/properties/nicole-enabled.test.ts
# esperado: "<N>  0  packages/..." — a segunda coluna (deleções) deve ser 0
```

- (i) colar as duas saídas: (a) **vazia**; (b) com a coluna de deleções em **0**. Se (b) não for 0
  (um `import` existente reescrito, por exemplo), colar o `git diff` completo do arquivo e provar
  que nenhuma das 14 linhas `it("...")` foi tocada — quem manda é a AC7-(ii);
- (ii) `packages/ai/src/config-surfaces.test.ts` **não ganha entrada nova** — a superfície
  `properties.nicole_enabled` (`:269`) já existe e é a mesma; acrescentar uma segunda seria registrar
  duas vezes o mesmo campo e diluir o inventário;
- (iii) 🔴 **mutação:** esta AC é a rede que impede a story de virar outra coisa no meio do caminho.
  Se ela ficar vermelha, **a story mudou de escopo e volta para o @po**, não se ajusta o critério.

### AC7 — 🔴 A suíte inteira verde, com os 14 casos da `87-13` intactos

- (i) `npx vitest run` da raiz: colar o sumário (arquivos, testes, falhas). **Baseline medido pelo
  @po em 15/08:** `nicole-enabled.test.ts` = **14 passed**, 203ms;
- (ii) `packages/web/src/app/api/properties/nicole-enabled.test.ts` — **os 14 casos originais
  continuam existindo e verdes**. Contagem **não basta** (renomear um `it` preserva o número):
  colar a lista de `grep -n 'it("' <arquivo>` e conferir que **os 14 títulos de hoje aparecem
  verbatim**, mais os novos;
- (iii) 🔴 **type-check — comando corrigido pelo @po (emenda E8). NÃO use `npx tsc --noEmit` da
  raiz:**

  ```bash
  cd packages/web && npx tsc --noEmit      # ✅ baseline medido em 15/08: 0 linhas de saída
  ```

  > **Executei o comando do @sm e ele já nasce vermelho: `npx tsc --noEmit` da RAIZ devolve
  > 14.292 linhas de erro em `24800872`** — 14.241 em `packages/` e 34 em `scripts/` (o `tsconfig`
  > da raiz não resolve os `node_modules` por pacote). *"`tsc --noEmit` limpo"* nunca seria
  > verdade, e a AC teria sido cumprida por interpretação em vez de por comando. O gate real deste
  > monorepo é o script `type-check` de `packages/web` (`package.json:10`), e esse **está limpo**.

- (iv) `npm run lint` — **baseline medido em 15/08: 0 errors, 23 warnings**, 8 tarefas turbo
  verdes. "Sem erro novo" mede contra estes números, não contra zero.

### AC8 — ⚠️ CONFERÊNCIA HUMANA (declarada NÃO automatizável, com a razão medida)

**Esta AC não vira teste, e a story diz isso na cara em vez de fingir cobertura.** As três medições
que sustentam a declaração, feitas em 15/08:

```bash
grep -rn "testing-library" package.json packages/*/package.json   # → nenhuma ocorrência
find packages -name "*.test.tsx" -not -path "*/node_modules/*" | wc -l   # → 0
# vitest.config.ts, bloco `include`: apenas "**/*.test.ts" — .tsx está FORA do glob
```

Ou seja: componente React neste repositório não é apenas *não testado* — arquivo `.test.tsx`
**nem seria coletado** pelo runner. Existe Playwright (`playwright.config.ts`, `tests/e2e/` com um
único `smoke.spec.ts`), mas ele exige app de pé e **sessão autenticada por papel**, que esta story
não monta e não vai montar de improviso.

> ✅ **@po (15/08) — reconferi as três medições e todas batem** (`grep -rn testing-library` em
> `package.json` + `packages/*/package.json`: exit 1, zero ocorrência; `find packages -name
> "*.test.tsx"`: 0; `vitest.config.ts` `include` = só `**/*.test.ts` nos três pacotes). **A
> declaração está aceita para ESTA story.**
>
> ⚠️ **E é a quarta story seguida com item de tela não verificável. Parei de aceitar caso a caso:**
> abri item próprio no `docs/backlog.md` — *"[QA] 🔴 Não existe harness de teste de componente
> React"* — porque a lacuna não é desta story, é do repositório, e declará-la de novo na 87-15
> seria transformar uma dívida em praxe. **Esta story não espera o item**; ela é a última que
> declara sem que exista dono.

**Roteiro, conferido por @qa + Gabriel, com print de cada passo:**

1. **admin** abre `/dashboard/properties` — a coluna NICOLE mostra um switch acionável nos quatro;
   Vind e Yarden ligados, Japura e Solum desligados (bate com o §1 do Context);
2. **admin** desliga o **Yarden** ⇒ a lista reflete "desligada" após o refresh; **religa** ⇒ volta;
3. **admin** tenta ligar o **Japura** ⇒ aparece *"Pelo menos uma tipologia cadastrada"* e o link
   **Completar cadastro**; o switch **não** muda de estado;
4. 🔴 um usuário **`obras`** (2 ativos) ou **`gerente-relacionamento`** (1 ativo) abre a mesma URL ⇒
   **não há switch nenhum na célula**: há o badge de leitura *"Nicole: ligada"* / *"Nicole:
   desligada"* — **idêntico ao que ele já vê hoje em produção** —, com o motivo no `title`. Nada
   clicável, nada desabilitado. *(Decisão do Gabriel, 15/08: some o controle, não a informação.)*
   Conferir lado a lado com um print de antes do deploy: **as classes e o texto do badge têm que
   ser os mesmos**;
5. o mesmo usuário abre `Editar` ⇒ **não há toggle**; há o ponteiro estático **no lugar visual do
   bloco removido**, com `<Link>` para a lista; salvar outro campo (ex.: `Conceito`) ⇒ **200**, sem
   403 (é a regressão que mais importa);
6. 🔴 **confirmação nas duas direções** (emenda E4): ligar o Japura pede *"Ligar a Nicole no
   Japura?"*; desligar o Yarden pede *"Desligar a Nicole no Yarden?"*; **[Cancelar]** devolve a
   célula ao estado anterior **sem chamar a rota** (conferir na aba Network que nenhum `PATCH`
   saiu).

> **@dev: não marcar esta AC como cumprida com base em leitura de código.** Ela é a única aqui que
> depende de alguém olhar, e é exatamente por isso que ela está numerada em vez de implícita.

---

## Tarefas

- [x] **T1** — criar `packages/web/src/lib/nicole-switch.ts` (função pura) — @dev
- [x] **T2** — criar `packages/web/src/lib/nicole-switch.test.ts` (AC4) — @dev
- [x] **T3** — criar `properties/_components/nicole-switch.tsx` (Client Component) — @dev
- [x] **T4** — `properties/page.tsx`: `can(..., "imoveis.ativar_nicole")` — **a chave literal, não
      outra do mesmo seed (AC5-(v))** — + trocar o `<span>` pelo componente — @dev
- [x] **T5** — `properties/[id]/edit/page.tsx`: remover toggle, estados órfãos, o campo da
      `interface PropertyData` e a `<ul>` de `faltando`; pôr o ponteiro estático com link (AC5) — @dev
- [x] **T6** — acrescentar os casos de AC1/AC2/AC3 em `nicole-enabled.test.ts`, **sem alterar os 14
      existentes** — @dev
- [x] **T7** — rodar suíte + **`cd packages/web && npx tsc --noEmit`** (NÃO o da raiz — AC7-(iii))
      + lint; colar as saídas (AC7) — @dev
- [x] **T8** — colar as DUAS saídas da AC6 (`--name-only` com a exclusão + `--numstat` do arquivo
      de teste) — @dev
- [ ] **T9** — executar o roteiro da AC8 com @qa + Gabriel e anexar prints — @qa

---

## Dev Notes

### Mapa de código (medido em `24800872`, 15/08)

| arquivo | linhas | o que é | esta story |
|---|---|---|---|
| `packages/web/src/app/dashboard/properties/page.tsx` | 115 | lista, **Server Component**; badge em `:64-76`; `select` com `nicole_enabled` em `:14` | **edita** |
| `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` | 488 | formulário, `"use client"` na raiz; toggle em `:437-455` | **subtrai** |
| `packages/web/src/app/dashboard/properties/[id]/edit/layout.tsx` | 20 | guard por `canEditImoveis` (≠ da capability deste campo) | **não toca** |
| `packages/web/src/app/api/properties/[id]/route.ts` | 200 | `PATCH`; gate em `:125`; mínimos em `:130-152` | **não toca** |
| `packages/web/src/lib/nicole-minimos.ts` | ~200 | `MINIMOS_NICOLE`, `avaliarMinimosNicole` | **não toca** |
| `packages/web/src/lib/capabilities.ts` | — | registro; `imoveis.ativar_nicole` em `:165` | **não toca** |
| `packages/web/src/lib/permissions.ts` | — | `can()` em `:389` | **não toca** |
| `packages/ai/src/chat/pipeline.ts` | — | `loadProperties` com o filtro da `87-13` | **não toca** |

### Armadilhas

1. **`can()` é `async` e vem de `permissions.ts` (server-only).** Só pode ser chamado no Server
   Component (`page.tsx`), **nunca** dentro de `nicole-switch.tsx`. O componente recebe o booleano
   pronto — se ele tentar importar `permissions.ts`, o build quebra com erro de `server-only`.
2. **`nicole-switch.ts` (a função pura) não pode importar nada de servidor.** Mesmo motivo do
   `capabilities.ts`, que documenta a regra no próprio cabeçalho: *"Módulo PURO de propósito (sem
   imports server-side)"*. É lido por Client Component **e** por teste.
3. **O `PATCH` devolve 422 com `error`, `missing`, `faltando` e `avisos`.** O componente renderiza
   **`faltando`** (rótulos legíveis em pt-BR, ex.: *"Pelo menos uma tipologia cadastrada"*), não
   `missing` (ids técnicos: `"tipologias"`). Trocar os dois produz uma tela que fala em jargão.
4. **`router.refresh()`, não `window.location.reload()`.** A lista é Server Component com fetch
   dinâmico (cookies via `createClient()`); `refresh()` re-executa o servidor e preserva o scroll.
5. **Não mexer no texto do badge.** `"Nicole: ligada"` / `"Nicole: desligada"` já estão em produção
   e a AC4-(ii) os congela. O switch fica **ao lado** do rótulo, não no lugar dele.
6. **O mock de teste da rota deriva do `CAPABILITY_SEED`, não de constante.** É a decisão 2 do @po
   na `87-13`, e o arquivo já faz isso (`nicole-enabled.test.ts:31-40`, via `vi.importActual`).
   Manter — a AC1 depende disso para não virar tautologia.
7. **`KNOWN_ROLES` tem 10 papéis; produção tem 12 `role` distintos** (os 10 + `cliente` + 
   `auxadministrativo`). Ver Achado nº 1 — a AC1 cobre os 10 do registro, e a divergência está
   declarada em vez de escondida.

### Fronteiras com outras stories

- **`87-13`** (mergeada): dona do campo, do filtro, dos mínimos e do gate da rota. Esta story
  **consome** tudo isso e não altera nada — a AC6 é a prova mecânica disso.
- **`75-306` (F3-5, Perfis de Acesso 2.0)**: dona de `imoveis.ativar_nicole` e do `can()`. Esta
  story é **call site**, não altera o registro nem o seed. Se o @po quiser mudar quem liga a Nicole,
  a alteração é na matriz do painel (`/dashboard/configuracoes/perfis`), **sem deploy** — e é
  justamente por isso que a régua tem de ser `can()` e não papel digitado no componente.
- **`87-12`, `87-5`, `87-11`, `87-10`** (fila de deploy da Onda 1): **nenhuma colisão de arquivo** —
  esta story não abre `packages/ai/`. Pode subir em qualquer posição da fila.

---

## Achados colaterais — **registrar, NÃO corrigir aqui**

1. 🟡 **`auxadministrativo` existe em produção e não existe no registro de capabilities.** Medido:
   1 usuário ativo com esse `role`; `KNOWN_ROLES` (`capabilities.ts:21-31`) lista 10 papéis e não o
   inclui. Hoje é **seguro por acidente**: ele não tem linha `imoveis.ativar_nicole` em
   `role_permissions`, e a herança de `canAccess` cai no módulo pai `imoveis`, que para ele é
   `false`. Mas o mecanismo é mudo: um papel fora do registro cujo módulo pai fosse `true`
   **herdaria a capability**. Item para o @pm.
2. 🔴 **`/dashboard/properties` e `/dashboard/properties/[id]` não têm `canAccess(user, "imoveis")`.**
   Medido: 4 papéis com o módulo `imoveis = false` (`obras`, `gerente-relacionamento`,
   `social-media`, `auxadministrativo`, 5 pessoas) alcançam as duas páginas por URL. Corrigir aqui
   seria remover acesso de gente que hoje o tem, sem pedido — mudança de comportamento fora do
   escopo desta story.

   > ⚖️ **@po (15/08) — concordo que está fora do escopo, e discordo da cor.** Reconferi: das 8
   > páginas/layouts sob `properties/`, **só as três sub-rotas** (`new/`, `edit/`, `units/`) têm
   > guard, e todas por `canEditImoveis` — **nenhuma** por `canAccess("imoveis")`. Promovi de 🟡
   > para 🔴 e **abri item no `docs/backlog.md`** (*"[SEGURANÇA] 🔴 Módulo `imoveis` não é cobrado
   > na lista nem no detalhe"*), porque "registrar num Achado" é onde furo de acesso vai morrer.
   > **Não muda o veredito desta story:** ela não piora nada — as 5 pessoas já leem esse badge hoje
   > —, e por D2 continuarão lendo. Mas a decisão de quem enxerga o cadastro comercial inteiro é do
   > @pm, não de uma story de tela.
3. 🟡 **Ninguém sabe quem ligou ou desligou a Nicole num empreendimento.** O `PATCH` não grava
   `system_event` na mudança de `nicole_enabled` (conferido: `route.ts` não importa o `logger`). A
   `87-13` fez a decisão *deliberada*; ela ainda não é *rastreável*. Candidato natural a uma story
   pequena, e o dado já existiria para a reconciliação diária da `87-3`.
4. 🟡 **Os comentários do código ainda nomeiam constantes mortas.** As 8 menções a
   `IMOVEIS_CREATE_ROLES`/`IMOVEIS_EDIT_ROLES` que sobraram estão em
   `api/properties/[id]/route.ts:43,123`, `api/properties/route.ts:84`,
   `nicole-enabled.test.ts:202-203`, `capabilities.test.ts:413` e no cabeçalho de
   `permissions-imoveis.ts:4-5`. Só o último **explica** que elas viraram capability; os outros
   citam como se ainda existissem, e foi assim que o pedido chegou até esta story mandando reusar
   uma constante que não existe. Varredura de comentário é limpeza própria — **não fazer aqui**
   (poluiria o `git diff --stat` da AC6 nos arquivos de rota).
5. 🟢 **A tela de detalhe (`properties/[id]/page.tsx`) não mostra o estado da Nicole.** Depois desta
   story, quem abrir o detalhe direto não vê nem o badge. Baixo impacto (a lista é a porta), mas é
   uma linha de leitura barata para uma story futura.
6. 🔴 **O buraco residual da `87-13` segue aberto** e não é fechado aqui: um empreendimento **já
   ligado** cujo cadastro seja esvaziado depois continua ligado — a checagem só roda na transição
   `false → true`. Documentado no cabeçalho de `nicole-minimos.ts`. Exige trigger ou verificação
   contínua.

---

## Riscos

| # | risco | prob. | impacto | mitigação |
|---|---|---|---|---|
| **R1** | Remover o toggle da edição e o switch da lista não funcionar ⇒ **ninguém consegue alterar o campo** | Baixa | Alto | Um único PR: as duas mudanças sobem juntas ou nenhuma. Rollback = reverter o PR (nada de dado) |
| **R2** | `router.refresh()` não refletir por cache de rota ⇒ o admin clica e "não acontece nada" | Baixa | Médio | Passo 2 da AC8 é exatamente isso. Se falhar, `revalidatePath("/dashboard/properties")` numa Server Action |
| **R3** | Clique acidental **liga** a Nicole num empreendimento | Média | Baixo | Confirmação (§5). **E o servidor já é a rede real**: nas 2 linhas onde "ligar" é alcançável hoje (Japura, Solum), o `422` dos mínimos barra antes |
| **R3b** 🔴 | Clique acidental **DESLIGA** a Nicole no Vind ou no Yarden — ela para de citar o carro-chefe para lead pago, **em silêncio** | Média | **Alto** | Confirmação nas duas direções (§5, emenda E4 do @po). **Não há outra rede**: mínimos não se aplicam ao desligar (por decisão) e não há `system_event` (Achado nº 3). Detecção hoje = alguém reparar no badge |
| **R4** | Papel novo criado no painel sem linha `imoveis.ativar_nicole` herdar `imoveis` do pai e poder ligar | Baixa | Alto | Fora do escopo. Medido: `createRole` **sem** `cloneFromRoleId` semeia todos os módulos `false`; **com** clone copia as linhas dotted. Seguro hoje — Achado nº 1 |
| **R5** | O `grep` da AC5 dar 0 porque o @dev renomeou a variável em vez de remover o controle | Baixa | Alto | A AC5-(iii) exige o `git diff` do `handleSave` colado, e a AC8 passo 5 é conferência humana |

---

## Critério de rollback — escrito ANTES do deploy

**Rollback é reverter o PR. Não há passo de dado, não há migration, não há ordem entre etapas.**

- Nada em `supabase/migrations/` (AC6);
- Nada em `packages/ai/` ⇒ **o contexto da Nicole é indiferente a esta story**: reverter não muda um
  byte do que ela lê no turno seguinte;
- O estado de `properties.nicole_enabled` em produção **não é tocado pelo deploy** — só por clique de
  admin. Se alguém alternar algo pela tela nova e o PR for revertido, o valor permanece como ficou
  (é dado, não código), e volta a ser editável pelo toggle antigo da tela de edição.

**Gatilho de rollback:** qualquer passo da AC8 falhar em produção, **ou** um usuário autorizado
relatar que não consegue alternar o switch.

---

## Definition of Done

- [x] AC1–AC7 verdes, com os vermelhos das mutações colados (saída bruta do reporter)
- [ ] AC8 conferida por @qa + Gabriel, com prints dos 6 passos — **passo 4 com print lado a lado**
      (produção hoje × depois), provando que o badge de quem não pode não mudou
      → **T9, pendente. Não marcada por leitura de código, como a própria AC manda.**
- [x] `npx vitest run` da raiz sem falha (187 arquivos, 2372 passed, 6 expected fail);
      **`cd packages/web && npx tsc --noEmit` = 0 linhas**; lint = 0 errors / 23 warnings
- [x] AC6: `--name-only` com a exclusão **vazio** e `--numstat` do teste com deleções em **0**
- [x] `grep -c '"imoveis.ativar_nicole"' .../properties/page.tsx` = **1** (AC5-(v))
- [x] Os 14 casos da `87-13` em `nicole-enabled.test.ts` intactos e verdes (conferido por `comm`,
      título a título, não por contagem)
- [x] Nenhum arquivo novo em `packages/ai/`, `supabase/migrations/`, `packages/web/src/app/api/`
- [x] `File List` preenchida
- [ ] Entrada em `stories_planned` do Epic 87 (pedido ao @pm — ver abaixo). **Não editei o corpo do
      epic:** há validação da `87-12` rodando em paralelo no mesmo arquivo.

---

## Decisões — **ARBITRADAS. Fechadas em 15/08. Não reabrir.**

### As três que estavam em aberto

- **D1 — Quem pode ligar/desligar: `admin` + `supervisor`.** ⚖️ **Decisão do Gabriel.** Ele havia
  dito *"só admin"*; levei a divergência porque a capability `imoveis.ativar_nicole` **nasceu** com
  `seed: [A, S]` (`capabilities.ts:165`) e a rota cobra assim desde 11/08. Ele escolheu **manter o
  que está no ar**: apertar para só-admin seria alteração de permissão em produção, tirando do
  supervisor algo que ele já tem. **A story já estava certa** — nenhuma mudança.
  *(Conferido por mim em produção, 15/08: `role_permissions` dá `ativar_nicole = true` só para
  `admin` e `supervisor`, e **não há nenhuma `user_permission_exceptions` em `imoveis*`** — as 5
  exceções que existem são de outros módulos. Hoje a matriz de papéis é a verdade inteira.)*

- **D2 — Quem não tem permissão continua VENDO o estado, sem poder mudar.** ⚖️ **Decisão do
  Gabriel.** O badge *"Nicole: ligada / desligada"* **permanece para todos**; só o **controle** é
  restrito. Isto **recusa as duas saídas que estavam na mesa**: nem o desenho do @sm (controle
  desabilitado com o motivo), nem ocultar a coluna. Razão dele: *saber o que a IA fala é informação
  útil para o corretor; **mudar** é que é restrito.* ⇒ **Desenho §1 e §2 reescritos**, AC4-(i)
  e AC8 passo 4 idem.

- **D3 — Confirmação: MANTIDA, e nas DUAS direções.** ⚖️ **Minha** (@po). Contra a proposta do @sm
  de confirmar só ao ligar. Razão medida, na §5 do Desenho: nas 4 linhas de produção, "ligar" só é
  alcançável em Japura e Solum — **que o servidor já barra com 422** —, enquanto "desligar" é
  alcançável em Vind e Yarden, **sem rede nenhuma** e sem registro (Achado nº 3). Confirmar só o
  lado protegido é régua saturada. **Deixa de ser bloco separável.**

### As que o @sm tomou e eu ratifico

- **[RATIFICADA]** *"O switch fica só na lista, ou também na edição / no detalhe?"* → **só na
  lista**, e a tela de edição recebe **ponteiro estático, sem espelho de leitura** (ver o bloco
  ✅ na §4 do Desenho: espelho exigiria manter `nicole_enabled` na `PropertyData`, que é
  exatamente o vetor de ressurreição do 403 que a AC5 fecha).
- **[RATIFICADA]** *"Numeração 87-14"* → conferida por mim: `ls docs/stories/ | grep '^87-'` dá 13
  arquivos, sem `87-9`, `87-12` nem `87-14`; e `87-14` não aparece no `stories_planned` do epic.

### O que eu recusei

- **[RECUSADO]** *"AC6 = zero diff em `packages/web/src/app/api/`"* — impossível junto com a T6.
  Ver emenda E1.
- **[RECUSADO]** *"`npx tsc --noEmit` limpo"* da raiz — 14.292 linhas de erro hoje. Ver emenda E8.
- **[AUTO-DECISION]** *"Numeração"* → **87-14** (razão: `87-9` e `87-12` estão **reservadas** no
  `stories_planned` do epic com `status: 'Não criada'`; `87-13` é o maior arquivo existente.
  Conferido com `find docs -name '87-*'` em 15/08 — três stories deste epic já colidiram neste
  ponto, então a conferência é minha, não herdada).

### Pedido formal ao @pm

Criar a entrada em `stories_planned`, derivada do `W1-8`:

```yaml
  - item: 'derivado do W1-8 — o switch fica encontrável (na lista) e para de ser oferecido a quem
      a rota recusa (gate por `imoveis.ativar_nicole` na superfície, não só na rota)'
    story: docs/stories/87-14-switch-da-nicole-na-lista-e-so-para-quem-pode.story.md
    status: Draft
```

---

## Referências

- Story `87-13` — `docs/stories/87-13-switch-por-empreendimento-do-que-a-nicole-fala.story.md`
  (o campo, o filtro, os mínimos, o gate da rota); parecer do @po em `docs/qa/po-validation-87-13.md`
- Story `75-306` (F3-5, Perfis de Acesso 2.0) — conversão de `IMOVEIS_*_ROLES` em capabilities
- `packages/web/src/lib/capabilities.ts:165` — `imoveis.ativar_nicole`
- `packages/web/src/lib/nicole-minimos.ts` — `B1` bloqueia, `B2`/`A1`–`A3` avisam
- `supabase/migrations/225_capabilities_fundacao.sql:646-655` e `227_capability_obras_ver.sql` —
  seed das linhas de `imoveis.ativar_nicole`
- Epic 87, §10 — *"nenhuma AC pode ser 'existe no painel'"*; é a regra que produziu a AC8 nesta forma

---

## Dev Agent Record

**Executado por:** @dev (Dex) em 2026-08-15, modo YOLO · **Base:** `24800872` (= `origin/main`)
**Modelo:** claude-opus-5

> ⚠️ **Sobre os comandos com `origin/main...HEAD`.** O trabalho está **não commitado** sobre
> `main`, e `HEAD == origin/main == 24800872` (conferido). Um `origin/main...HEAD` devolveria vazio
> por construção e não mediria nada — seria a mesma classe de régua saturada que o @po pegou na E2.
> Rodei as réguas na forma que **mede o conteúdo que o PR vai carregar**: `git diff origin/main --`
> (árvore de trabalho × `origin/main`), acrescida de `git status --porcelain` nos mesmos pathspecs
> para pegar **arquivo novo não rastreado**, que o `git diff` não veria. Ambas as saídas abaixo.

### Debug Log References

#### AC1 — a permissão cobre os 10 papéis do registro

```
$ npx vitest run packages/web/src/app/api/properties/nicole-enabled.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)          # 14 da 87-13 + 6 novos (AC1×2, AC2×2, AC3×2)
```

🔴 **Mutação AC1-(iii)** — trocar a capability do gate da rota (`route.ts:125`) por `imoveis.editar`:

```
$ perl -0pi -e 's/"imoveis\.ativar_nicole"/"imoveis.editar"/' 'packages/web/src/app/api/properties/[id]/route.ts'
$ npx vitest run packages/web/src/app/api/properties/nicole-enabled.test.ts
 × papel: `obras` pode editar o empreendimento, mas NÃO pode ligar a Nicole 3ms
 × papel: `gerente-relacionamento` também não liga — e salvar outro campo não quebra 0ms
 × (i) os 10 papéis de `KNOWN_ROLES`: só quem tem a capability altera o campo 1ms
 × (ii) `obras` tentando DESLIGAR ⇒ 403 — a válvula não é 'qualquer um desliga' 0ms
      Tests  4 failed | 16 passed (20)

AssertionError: obras: expected 200 to be 403 // Object.is equality
```

**Caem 4, e a contagem é a prova de que os testes novos não passam por herança:** os 2 da `87-13`
(que já existiam) **mais** AC1-(i) e AC3-(ii), que são os dois casos novos que tocam o gate. AC2 e
AC3-(i) **não** caem — corretamente, porque não é papel que elas medem. Revertido.

#### AC2 — o controle negativo, nas duas direções da mutação

🔴 **(a) `avaliarMinimosNicole` devolvendo sempre `missing: []`:**

```
 × (i) ligar o Japura ⇒ 422 com `missing: ['tipologias']` — UM item, não dois 3ms
 × (ii) `supervisor` liga o Japura (0 tipologias) ⇒ 422 com `missing` e `faltando` legível 0ms
      Tests  2 failed | 18 passed (20)
```

🔴 **(b) devolvendo sempre `missing: ["tipologias"]`:**

```
 × (ii) o mesmo PATCH sobre o Vind ⇒ 200 e o campo grava 3ms
 × (ii) o pré-lançamento legítimo do Risco 4 recebe 200 + aviso, não 422 0ms
 × (iii) mídia (A1) é aviso: cadastro completo com 0 mídia LIGA 0ms
 × (i) os 10 papéis de `KNOWN_ROLES`: só quem tem a capability altera o campo 0ms
 × (ii) controle positivo COM DENTES: `supervisor` liga de verdade — não é bypass de admin 0ms
 × (i) `supervisor` liga o Vind (1 tipologia, passa o B1) ⇒ 200 e a linha grava 0ms
      Tests  6 failed | 14 passed (20)
```

A direção (b) derruba **AC1-(i) e AC1-(ii) junto** — e isso é sinal bom, não ruído: o controle
positivo da AC1 assere `status === 200` **e** `linha(VIND).nicole_enabled === true`, exatamente
como a emenda E2 exigiu. Se ele ainda fosse `status !== 403`, um 422 passaria e a AC1 **não** teria
caído aqui. A mutação de AC2 acabou virando, de graça, a prova de que a emenda E2 pegou. Revertidas.

#### AC3 — a distinção entre mínimos e papel

🔴 **Mutação AC3-(iii)** (a corrigida pelo @po — **remover o `if (desejado)` inteiro**, movendo
`carregarCadastroNicole` **+** `avaliarMinimosNicole` **+** o `return` 422 para fora dele):

```
 × (iii) DESLIGAR nunca é bloqueado, nem com o cadastro vazio 12ms
 × (i) `supervisor` desliga o Japura com o cadastro vazio ⇒ 200, sem 422 0ms
      Tests  2 failed | 18 passed (20)
```

**Confirmo a emenda E3 na prática:** eu havia mutado antes só a chamada de `carregarCadastroNicole`
e **nada ficou vermelho** — o `return` 422 continuava dentro do `if (desejado)`. Só a remoção do
bloco inteiro mata. Revertido.

#### AC4 — a função pura

```
$ npx vitest run packages/web/src/lib/nicole-switch.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

🔴 **Mutação (a)** — fixar `interativo: true`:

```
 × (i) as 4 combinações: `interativo === podeAtivar`, e `motivo` é não-nulo EXATAMENTE quando não é interativo 3ms
AssertionError: false/false: expected true to be false // Object.is equality
      Tests  1 failed | 2 passed (3)
```

> **Nota honesta sobre a contagem.** A AC4-(iv)(a) dizia *"2 dos 4 casos de (i) caem"*. As 4
> combinações moram **dentro de um `it`** (laço), então o reporter mostra **1 teste** vermelho, não
> 2 — ele para no primeiro caso quebrado. Os 2 casos quebrados são `podeAtivar === false`, e a
> mensagem de asserção nomeia qual (`false/false`), porque passei o rótulo da combinação como
> segundo argumento do `expect`. Preferi um `it` com rótulo a quatro `it`s: o vermelho identifica a
> combinação do mesmo jeito e a régua não se dilui em cópias.

🔴 **Mutação (b)** — fixar `textoConfirmacao` num literal só:

```
 × (iii) `textoConfirmacao` deriva da DIREÇÃO do clique, nas duas direções, com o nome interpolado 2ms
AssertionError: expected 'Ligar a Nicole no Yarden?' to be 'Desligar a Nicole no Yarden?'
      Tests  1 failed | 2 passed (3)
```

Ambas revertidas.

#### AC5 — o toggle não existe mais na tela de edição

```
$ grep -c "nicole_enabled\|nicoleEnabled\|faltando" 'packages/web/src/app/dashboard/properties/[id]/edit/page.tsx'
# antes  (origin/main): 15   → :32 :46 :71 :74 :79 :115 :116 :194 :195 :196 :213 :218 :442 :460 :462
# depois:               0
```

**(ii)** o ponteiro estático:

```
$ grep -n "fica na lista de empreendimentos" 'packages/web/src/app/dashboard/properties/[id]/edit/page.tsx'
429:            O switch da Nicole (quais empreendimentos ela pode citar) fica na lista de empreendimentos.{" "}
```

> ⚠️ **Pegadinha que quase custou a AC:** na primeira versão o JSX quebrou a frase em duas linhas
> (`...fica na lista de` / `empreendimentos.`) e o `grep` do @po deu **zero**, com o texto correto na
> tela. A frase agora fica **numa linha só**, de propósito, para a régua ser a régua. O mesmo vale
> para um comentário meu que citava `nicole_enabled` dentro do arquivo: reescrito como *"o campo"*,
> senão o grep da (i) daria 1 por comentário.

**(iii)** o `handleSave` não monta o campo em ramo nenhum:

```diff
-    // Story 87-13 — só vai no body quando MUDA (ver `nicoleEnabledOriginal`).
-    if (nicoleEnabled !== nicoleEnabledOriginal) {
-      body.nicole_enabled = nicoleEnabled
-    }
-
     try {
       const res = await fetch(`/api/properties/${propertyId}`, {
```

🔴 **(iv) mutação** — reintroduzir `body.nicole_enabled = nicoleEnabled`: **(i) e (iii) caem**, e o
type-check cai junto (o estado não existe mais):

```
$ grep -c "nicole_enabled\|nicoleEnabled\|faltando" '.../edit/page.tsx'
1                                                     # ≠ 0 ⇒ AC5-(i) vermelha
$ cd packages/web && npx tsc --noEmit
src/app/dashboard/properties/[id]/edit/page.tsx(190,27): error TS2304: Cannot find name 'nicoleEnabled'.
```

Revertido.

**(v) a chave literal da capability:**

```
$ grep -c '"imoveis.ativar_nicole"' packages/web/src/app/dashboard/properties/page.tsx
1
```

#### AC6 — zero diff onde o enforcement mora (T8)

```
$ git rev-parse --short HEAD; git rev-parse --short origin/main
24800872
24800872

# (a) NADA nas três pastas proibidas, exceto o arquivo de teste da 87-13
$ git diff --name-only origin/main -- packages/ai/ supabase/migrations/ packages/web/src/app/api/ \
  | grep -v '^packages/web/src/app/api/properties/nicole-enabled\.test\.ts$'
                       ← VAZIO (nenhuma linha de saída)

# e nenhum arquivo NOVO (não rastreado) nessas pastas — o `git diff` sozinho não veria
$ git status --porcelain -- packages/ai/ supabase/migrations/ packages/web/src/app/api/
 M packages/web/src/app/api/properties/nicole-enabled.test.ts
                       ← a ÚNICA entrada, e é a exceção prevista

# (b) e o que mudou naquele arquivo é ADITIVO — 2ª coluna (deleções) = 0
$ git diff --numstat origin/main -- packages/web/src/app/api/properties/nicole-enabled.test.ts
109     0       packages/web/src/app/api/properties/nicole-enabled.test.ts

# (ii) `config-surfaces.test.ts` intocado — a superfície `properties.nicole_enabled` já existe
$ git diff --numstat origin/main -- packages/ai/src/config-surfaces.test.ts
                       ← VAZIO
```

#### AC7 — a suíte inteira

**(i) `npx vitest run` da raiz, suíte inteira, sem `--reporter=basic`:**

```
 RUN  v4.1.2 /Users/ogabrielhr/trifold-crm
 Test Files  187 passed (187)
      Tests  2372 passed | 6 expected fail (2378)
   Duration  4.83s
```

Baseline meu em `24800872`, antes de tocar em código: **186 arquivos, 2363 passed, 6 expected fail**.
Delta: **+1 arquivo** (`nicole-switch.test.ts`) e **+9 testes** (3 da AC4 + 6 da rota). Zero falhas
novas, e os 6 `expected fail` continuam sendo os mesmos 6 de antes.

**(ii) os 14 títulos da `87-13`, verbatim** — conferido por `comm`, não por contagem:

```
$ comm -23 <(sort titulos-de-origin-main) <(sort titulos-de-agora)
                       ← VAZIO: nenhum dos 14 sumiu nem foi renomeado
antes: 14   depois: 20
```

Os 6 novos:

```
it("(i) os 10 papéis de `KNOWN_ROLES`: só quem tem a capability altera o campo", ...
it("(ii) controle positivo COM DENTES: `supervisor` liga de verdade — não é bypass de admin", ...
it("(i) `supervisor` liga o Vind (1 tipologia, passa o B1) ⇒ 200 e a linha grava", ...
it("(ii) `supervisor` liga o Japura (0 tipologias) ⇒ 422 com `missing` e `faltando` legível", ...
it("(i) `supervisor` desliga o Japura com o cadastro vazio ⇒ 200, sem 422", ...
it("(ii) `obras` tentando DESLIGAR ⇒ 403 — a válvula não é 'qualquer um desliga'", ...
```

**(iii) type-check — o comando corrigido pela emenda E8:**

```
$ cd packages/web && npx tsc --noEmit | wc -l
0
```

(Baseline conferido por mim antes de codar: também **0**. O da raiz eu não rodei — o @po já provou
que devolve 14.292 linhas e não é o gate deste monorepo.)

**(iv) lint:**

```
$ npm run lint
✖ 23 problems (0 errors, 23 warnings)
 Tasks:    8 successful, 8 total
```

**Idêntico ao baseline** (0 errors / 23 warnings, 8 tarefas). Nenhum dos 23 warnings está em arquivo
desta story.

### Completion Notes

**AC1–AC7 verdes, com os 6 vermelhos de mutação medidos e colados acima. AC8 NÃO marcada** — é
conferência humana e fica com @qa + Gabriel (T9).

**Decisões de implementação (nenhuma reabre arbitragem):**

1. **`MOTIVO_SEM_PERMISSAO` virou constante exportada da função pura.** A story pedia que o 403
   mostrasse *"a mensagem do `motivo`"*, mas `motivo` é `null` justamente quando `interativo ===
   true` — que é o único caso em que o componente chega a fazer `PATCH`. Um literal duplicado no
   componente resolveria e criaria duas verdades para a mesma frase; a constante mantém uma. O
   teste da AC4 assere contra ela, não contra uma cópia da string.
2. **`estadoSwitchNicole` não devolve classes de CSS.** As classes do badge são presentação e ficam
   no componente, copiadas **verbatim** de `page.tsx` (`BADGE_BASE`/`BADGE_LIGADA`/`BADGE_DESLIGADA`).
   Para os 8 papéis sem a capability o componente faz `return badge` **direto**, sem wrapper: o
   `<span>` continua sendo filho imediato do `<td>`, com a mesma string de `className` — o diff
   visível para eles é `+title`, como a D2 exige (AC8 passo 4 confere com print lado a lado).
3. **A confirmação é estado local do componente (`confirmando`), não campo da função pura.** A
   função devolve o **texto**; quem decide *quando* perguntar é o `onChange`. `Cancelar` só faz
   `setConfirmando(false)` — nenhum `fetch` no caminho, que é o que a AC8-6 confere na aba Network.
4. **Sem update otimista, e o checkbox nunca fica "travado".** Como o estado visual só muda depois
   do `200 + router.refresh()`, um checkbox que não se move ao clicar seria confuso — por isso, ao
   clicar, a célula **inteira** é substituída pela pergunta com [Confirmar]/[Cancelar]. O checkbox
   sai de cena em vez de ficar mentindo.
5. **A `<ul>` de `faltando` migrou junto com o controle.** A tela de edição já não recebe 422 deste
   campo (o body nunca leva `nicole_enabled`), então a lista lá era código morto. Ela agora vive no
   componente, com o link **"Completar cadastro"**, e continua renderizando `faltando` (rótulos
   pt-BR) e **nunca** `missing` (ids técnicos) — armadilha nº 3 das Dev Notes.

**O que eu confirmo do parecer do @po, por ter tropeçado:**

- **E3 estava certa.** Mutei primeiro só a chamada de `carregarCadastroNicole` e a suíte ficou
  **inteira verde**. O tiro de festim é real.
- **E2 estava certa, e a prova veio de lado.** A mutação (b) da AC2 derrubou AC1-(i)/(ii) — o que
  só acontece porque o ramo autorizado assere `200` **e** o estado da linha. Com `status !== 403`,
  um 422 teria passado.
- **Uma armadilha que o parecer não previu, e que anoto para as próximas ACs de `grep`:** régua de
  `grep` por frase é sensível a **quebra de linha do JSX** e a **comentário do próprio @dev**. As
  duas me deram falso vermelho/falso positivo antes do commit. Uma AC de grep precisa dizer se mede
  o texto renderizado ou o texto do arquivo — aqui é o do arquivo, e por isso a frase está numa
  linha só de propósito.

**Fora de escopo, respeitado:** `packages/ai/`, `supabase/migrations/`, `api/` (fora do teste),
`route.ts`, `nicole-minimos.ts`, `capabilities.ts`, `permissions.ts`, `edit/layout.tsx` — **nenhum
tocado** (AC6). Achados nº 1–6 **registrados e não corrigidos**, inclusive o guard de módulo
faltante (nº 2), que o @po abriu no `docs/backlog.md`. Nenhum DDL, nenhuma migration, nenhum toque
em `docs/stories/87-12-*` nem no corpo do `epic-87-*.md`.

**Pendências que NÃO são minhas:** T9/AC8 (@qa + Gabriel, com print lado a lado no passo 4);
entrada em `stories_planned` do Epic 87 (@pm); push e PR (@devops).

### File List

**Criados (3):**

- `packages/web/src/lib/nicole-switch.ts` — a função pura `estadoSwitchNicole` + `MOTIVO_SEM_PERMISSAO`
- `packages/web/src/lib/nicole-switch.test.ts` — AC4 (3 casos)
- `packages/web/src/app/dashboard/properties/_components/nicole-switch.tsx` — Client Component

**Modificados (3):**

- `packages/web/src/app/dashboard/properties/page.tsx` — `can(..., "imoveis.ativar_nicole")` e o
  `<span>` trocado pelo `<NicoleSwitch>` (**+23 / −9**)
- `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` — toggle, estados órfãos, campo da
  `PropertyData` e `<ul>` de `faltando` removidos; ponteiro estático com `<Link>` no lugar
  (**+23 / −49** — a story é de subtração, e o `numstat` mostra isso)
- `packages/web/src/app/api/properties/nicole-enabled.test.ts` — 6 casos novos (AC1/AC2/AC3),
  **+109 / −0** (aditivo, AC6-(b))

**Não tocados, e é a AC6:** `packages/ai/`, `supabase/migrations/`, todo o resto de
`packages/web/src/app/api/`.

---

## QA Results

**Revisado por:** @qa (Quinn) em 2026-08-15 · **Rodada 1** · **Base:** árvore de trabalho sobre
`24800872` (= `HEAD` = `origin/main`), nada commitado
**Gate:** `docs/qa/gates/87.14-switch-da-nicole-na-lista-e-so-para-quem-pode.yml`

### 🟡 Veredito: **CONCERNS** — liberado para @devops; **não pode ser marcada `Done` hoje**

Reproduzi tudo do zero, com comandos meus. **Não revisei o relato** — mutei o código, contei os
vermelhos e restaurei conferindo `md5` de 8 arquivos (manifesto antes × depois: idênticos).

#### O instrumento morde — e eu o mordi mais forte que o @dev

Apaguei o **efeito** do gate de capability (`route.ts:126`, o `if (forbiddenNicole) return ...`),
que é mutação mais dura que trocar a chave por `imoveis.editar` — aquela ainda deixava um gate de
pé. Suíte da raiz: **4 vermelhos**.

```
 × papel: `obras` pode editar o empreendimento, mas NÃO pode ligar a Nicole
 × papel: `gerente-relacionamento` também não liga — e salvar outro campo não quebra
 × (i) os 10 papéis de `KNOWN_ROLES`: só quem tem a capability altera o campo
 × (ii) `obras` tentando DESLIGAR ⇒ 403 — a válvula não é 'qualquer um desliga'
 Test Files  1 failed | 186 passed (187)
      Tests  4 failed | 2368 passed | 6 expected fail (2378)
```

A versão corrigida pela **emenda E2 morde**. Confirmo também de lado, como o @dev observou: a
mutação (b) da AC2 derruba AC1-(i)/(ii) — o que só é possível porque o ramo autorizado assere
`status === 200` **e** o estado da linha.

#### A guarda da 87-13 está intacta, e provei pelos dois lados

| camada | mutação | vermelhos |
|---|---|---|
| rota | `if (muda)` → `if (true)` | **2** — `(iv) a checagem roda SÓ na transição` e `reenviar o valor ATUAL não exige o papel elevado` |
| rota | `updateFields.nicole_enabled` movido para dentro do `if (muda)` | **1** — o `(iv)`, por `400 No fields to update` |
| cliente | — | grep no `edit/page.tsx`: **15 → 0**; o campo não vai no body em circunstância nenhuma |

As 3 pessoas de `obras`/`gerente-relacionamento` salvam o resto da tela **pelo motivo mais forte**.
E `route.ts` tem **zero diff** — a proteção de qualquer outro cliente da API segue de pé.

#### D2, conferida **literalmente** (script próprio, não leitura)

Extraí por regex o template do `<span>` de `git show origin/main:.../properties/page.tsx`, montei as
strings finais como o React montaria, e comparei com `===` contra as constantes do componente novo:

| item | resultado |
|---|---|
| `className` ligada | **IDÊNTICO** — `rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300` |
| `className` desligada | **IDÊNTICO** |
| texto | **IDÊNTICO** — `"Nicole: ligada"` / `"Nicole: desligada"` |
| `<td className>` | **IDÊNTICO** — `px-6 py-4` |
| wrapper | **NENHUM** — `if (!estado.interativo) return badge` devolve o `<span>` cru |
| atributos do `<span>` | `className`, `title` — exatamente **`+title`**, nada mais |

A troca de `p.nicole_enabled` (truthy) por `p.nicole_enabled === true` também não muda nada: a
coluna é `boolean not null default false` (migration 223:79). E os 4 `useState` + `useRouter` ficam
**todos antes** do `return` antecipado — a armadilha clássica de ordem de hooks não foi pisada.

#### As réguas do @po, refeitas por mim

`packages/web` `tsc --noEmit` = **0** · lint = **0 errors / 23 warnings** (8/8 turbo) · suíte =
**187 / 2372 passed / 6 expected fail** · AC5: 15→**0**, ponteiro = 1, capability literal = **1** ·
AC7-(ii): `comm -23` dos 14 títulos contra `origin/main` = **saída vazia**.

**AC6 na minha forma** — prefiro `git status --porcelain -uall` a `git diff --name-only`, porque
numa **só** chamada cobre modificado **e** não rastreado (o @dev precisou de dois comandos):

```
$ git status --porcelain -uall -- packages/ai/ supabase/migrations/ packages/web/src/app/api/ \
  | grep -v 'packages/web/src/app/api/properties/nicole-enabled\.test\.ts$'
                       ← VAZIO
```

**Concordo com a régua da emenda E1.** O inventário completo da árvore sob `packages/` bate com a
File List, arquivo a arquivo, sem sobra. E o `epic-87-*.md` modificado na árvore **não é desta
story**: `git diff origin/main` daquele arquivo tem **0** ocorrências de "87-14".

#### Mutações da função pura: as 2 do @dev + **3 minhas**, todas vermelhas

`motivo` sempre preenchido ⇒ vermelho (o lado `toBeNull` existe); polaridade de `rotulo` invertida
⇒ vermelho; `ligado` fixo em `true` ⇒ vermelho. A AC4 é apertada.

#### Julgamentos que me foram pedidos

- **A mutação que não mata (`carregarCadastroNicole` sozinha) é desenho aceitável, não teste
  frouxo.** Rodei: suíte **inteira verde**. É **mutante equivalente** — o `atual` já foi carregado
  com os mesmos três `.eq` logo acima, e a única diferença observável seria um SELECT extra no
  caminho do desligar. Nenhuma suíte mata mutante equivalente. O defeito estava na **escolha** da
  mutação pelo @sm; o @po acertou na E3.
- **A ressalva de contagem da AC4 (1 vermelho, não 2) é aceitável com ressalva.** O rótulo no 2º
  argumento do `expect` aparece no vermelho (`false/false: expected true to be false`), então dá
  para saber qual combinação quebrou. O que se perde é **resolução**: o laço aborta na primeira
  falha. Para uma função de 6 linhas não paga 4 `it`s — mas quem reaproveitar a AC deve escrever
  *"1 vermelho nomeando a combinação"*, não *"2 dos 4 caem"*, senão a próxima pessoa procura um
  segundo vermelho que não existe. O @dev declarou em vez de esconder: certo.
- **As ACs de grep ainda NÃO dizem o que medem.** A lição das duas armadilhas ficou só no Dev Agent
  Record; o texto da AC5 não foi emendado (e @dev não pode emendar AC). Risco real medido: **baixo**
  — a linha tem 108 caracteres e **não há Prettier instalado nem configurado** neste repositório,
  nem `max-len` como erro no lint. Nada no pipeline reflowa a frase sozinho.

#### 🔴 O que eu achei e ninguém pediu

**Q1 — a AC1-(i) se chama "os 10 papéis" e é discriminante para 2.** Instrumentei o
`requireCapability` mockado para registrar quem **chega** ao gate de `imoveis.ativar_nicole`:

```
["admin", "supervisor", "obras", "gerente-relacionamento"]     ← 4 de 10
```

Os outros 6 (`gerente-comercial`, `sdr`, `broker`, `imob`, `consultoria`, `social-media`) levam 403
do gate de **`imoveis.editar`**, em `route.ts:44`, **antes**. O `expect(status).toBe(403)` não sabe
de qual gate veio o 403 — para esses 6 ele ficaria verde mesmo sem a capability desta story. É
colinearidade entre **duas capabilities**, irmã da que o @po pegou na E6 pelo eixo do seed. Não é
falso verde (a mutação mata via `obras`/GR), mas esses dois **já eram cobertos pelos 2 testes da
87-13**: a contribuição marginal real da AC1 é o trip-wire `KNOWN_ROLES.length === 10` e assertar o
**estado da linha**. Ambas legítimas — a frase "os 10 papéis são exercidos [contra esta capability]"
é que não é verdade.

**Q2 — o inventário de superfícies passou a mentir, e a AC6 proíbe consertar.**
`packages/ai/src/config-surfaces.test.ts:270` continua declarando
`editadoEm: "painel /dashboard/properties/[id]/edit + ..."` — a tela de onde esta story **acabou de
remover** o controle. O teste segue verde (o campo é descritivo, só entra na mensagem de erro da
linha 422), mas o artefato que este epic criou para impedir *"controle no painel que o runtime
ignora"* agora aponta para a tela errada. Corrigir é uma palavra e **viola a AC6**. Não peço aqui —
registro que a cerca de escopo da story impede o conserto do que ela invalidou. É uma linha para a
próxima story do epic que já abra `packages/ai/`.

**Q4 — o passo 3 do roteiro da AC8 pede para observar algo que não está na tela.** Ao clicar, a
célula **inteira** vira a pergunta de confirmação; depois do 422 o `confirmando` não é resetado, e o
**checkbox não está visível** para se conferir que "não mudou". O comportamento está certo (sem
update otimista); o roteiro é que foi escrito para o desenho anterior. **Corrigido no gate:** após o
422, clicar **[Cancelar]** e conferir que o checkbox volta desmarcado.

#### ⚠️ NÃO VERIFICADO — dito na cara

**AC8 fica NÃO VERIFICADA.** Reconferi as três medições que sustentam a declaração e **todas
batem**: zero `@testing-library`, zero `.test.tsx`, e o `include` do `vitest.config.ts` só coleta
`**/*.test.ts` nos três pacotes. **Não inventei cobertura e não marquei por leitura de código** — é
exatamente o que a própria AC manda. O roteiro dos 6 passos, com o passo 3 corrigido, está no gate,
para mim + Gabriel (T9). Também não verificados: **R2** (`router.refresh()` refletir na lista) e
qualquer comportamento em produção — nada foi deployado.

#### Para fechar

Liberado para @devops. Antes de `Done`: (1) rodar o roteiro de 6 passos com o Gabriel, com o **print
lado a lado** do passo 4 — eu já provei byte a byte que o markup é o mesmo, o print é para ele ver o
que eu medi; (2) @pm criar a entrada em `stories_planned` do Epic 87, que continua faltando.

*— Quinn, guardião da qualidade 🛡️*

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-15 | v0.1 | Story criada a partir do pedido do Gabriel (switch invisível) + furo de permissão medido na tela de edição. Numeração 87-14 conferida contra `docs/stories/`. Estado de produção, matriz de papéis e ausência de biblioteca de teste de componente medidos em 15/08. | @sm (River) |
| 2026-08-15 | v1.1 | **Implementada — `Ready → Ready for Review`.** T1–T8 feitas; T9 (AC8) fica com @qa + Gabriel. 3 arquivos criados (função pura + teste + componente), 3 modificados. **AC1–AC7 verdes**, com **6 mutações medidas e revertidas** — cada vermelho colado no Debug Log: AC1 (capability do gate → `imoveis.editar`, caem 4), AC2 (`missing: []` caem 2; `missing: ["tipologias"]` caem 6), AC3 (remover o `if (desejado)` inteiro, caem 2), AC4 (`interativo: true`; `textoConfirmacao` literal). **Confirmo a emenda E3 por experiência:** mutar só a chamada de `carregarCadastroNicole` deixou a suíte **inteira verde** — o tiro de festim é real. **E a E2 se provou de lado:** a mutação (b) da AC2 derrubou AC1-(i)/(ii), o que só acontece porque o ramo autorizado assere `200` **e** o estado da linha. Suíte: 186→**187 arquivos**, 2363→**2372 testes**, 0 falhas novas; `cd packages/web && npx tsc --noEmit` = **0**; lint = **0 errors / 23 warnings** (idêntico ao baseline). AC6: `--name-only` **vazio** e teste **+109/−0**. AC5: grep 15 → **0**; capability literal = **1**. Duas armadilhas de régua de `grep` anotadas (quebra de linha do JSX e comentário do próprio @dev davam falso resultado). Decisão de implementação: `MOTIVO_SEM_PERMISSAO` virou constante exportada, porque `motivo` é `null` exatamente no caso em que o 403 pode acontecer. Nenhum toque em `packages/ai/`, `supabase/migrations/`, `route.ts`, `nicole-minimos.ts`, `87-12` ou no corpo do epic. Sem commit, sem push. | @dev (Dex) |
| 2026-08-15 | v1.0 | **Validada — GO (9/10) — `Draft → Ready`.** Reconferi TODAS as medições do @sm contra `24800872` e produção: as 4 linhas de `properties`, a matriz dos 10 papéis (+ `auxadministrativo`), `capabilities.ts:165`, `route.ts:121/125/131`, os 15 greps do `edit/page.tsx` (mesmas 15 linhas), as 8 menções mortas a `IMOVEIS_*_ROLES`, os 14 testes (rodados: verdes) e as 3 medições da AC8 — **tudo bate**. **8 emendas**, 3 delas bloqueantes por ACs que executei e eram impossíveis: **E1** AC6 excluía o próprio arquivo que a T6 manda editar (provado com `git diff` contra `ca26e5ed`); **E2** o controle positivo da AC1 era satisfeito por no-op (o gate só roda em `if (muda)`) e o laço sem reset transformava 9 das 10 voltas em no-op; **E8** `npx tsc --noEmit` da raiz já devolve 14.292 linhas de erro hoje. **E3** mutação da AC3 era tiro de festim. **E4** confirmação estendida às duas direções (decisão minha, medida). **E5** ponteiro estático ratificado com 2 exigências. **E6** AC5-(v): grep do literal da capability — 29 das 103 têm o mesmo seed `[A, S]`. **E7** AC7-(ii) passa a congelar os 14 títulos, não a contagem. Decisões D1/D2 do Gabriel registradas (Desenho §1/§2, AC4, AC8-4 reescritos). 2 itens abertos no `docs/backlog.md`. Parecer: `docs/qa/po-validation-87-14.md`. | @po (Pax) |
