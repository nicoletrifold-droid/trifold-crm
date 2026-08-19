# Story 75-344 — A aba Formulários liberável pelo CRM (e a convenção para abas)

**Status:** Review
**Tipo:** Bug fix de governança (acesso que só o dev consegue dar) + fechamento de furo de gate
**Epic:** 75 — CRM Trifold (encosta no 89 e em Perfis de Acesso 2.0)
**Story ID:** 75-344
**Complexidade:** M (~4 pts — 1 mapa, 4 telas, 1 sidebar, 0 migrations)
**Fluxo:** @sm → @dev → @qa → @devops
**Migrations:** **nenhuma** — quem concede é o Marcos, na tela, gravando a linha `role_permissions`.

## O pedido (Marcos, 19/08)

> *"Quero mostrar a aba Formulário que fica dentro do módulo Campanhas a alguns perfis, como o
> gerente comercial e a SDR, porém não consigo habilitar ela via CRM, somente por dev. O ideal seria
> sempre pelo CRM, então vamos corrigir isto para submenus ou abas dentro dos menus."*

Print: busca "formu" em Perfil de Acesso → **0 de 27 módulos**.

## Por que a busca não acha nada

A aba Formulários não é uma linha da matriz: ela é gateada pelo **módulo `campanhas` inteiro**
(`formularios/page.tsx:32` e as quatro telas que montam a barra de abas). Só existem dois estados
hoje: ou o perfil tem Campanhas — e aí vê CRM, Meta Ads e Formulários —, ou não tem nada. Para dar
Formulários à SDR sem lhe dar a base de campanhas e o Meta Ads, não há chave na tela: só linha no
banco, feita por dev. É exatamente o que ele não quer.

## O mecanismo já existe — e é o `SUBMODULE_MAP`

Não precisa inventar nada. A matriz de Perfil de Acesso **já renderiza sub-linhas** por módulo
(`permissions-matrix.tsx:780`), com toggle por perfil, gravando a chave dotted
(`campanhas.formularios`) em `role_permissions`; a busca já varre os rótulos dos sub-módulos
(`permissions-matrix.tsx:456`). E `canAccess` já resolve dotted: exceção do usuário → linha
explícita do perfil → **herança do módulo pai** (`permissions.ts:340-367`).

A herança é o que torna isto retrocompatível de graça: quem tem o módulo `campanhas` continua
entrando em Formulários sem nenhuma linha nova.

**A regra da casa, que esta story respeita:** só entra no `SUBMODULE_MAP` sub-módulo que **já tem
gate real** no código. Sub-módulo na UI sem `canAccess("pai.sub")` é botão que mente — liga, desliga
e nada acontece.

## AC1 — `campanhas.formularios` na matriz

`SUBMODULE_MAP.campanhas = { "campanhas.formularios": "Formulários" }`. Efeito imediato: a linha
aparece sob Campanhas, a busca por "formu" encontra, e o Marcos liga para gerente-comercial e SDR
**na tela**, sem migration e sem dev.

## AC2 — Gate real na tela e na aba

- `app/dashboard/campaigns/formularios/page.tsx` passa a exigir `canAccess("campanhas.formularios")`
  (era `"campanhas"`).
- A aba "Formulários" segue a mesma chave nas quatro telas da barra.

Quem tem o módulo não sente nada (herança). Quem receber só o sub-módulo passa a entrar.

## AC3 — Acesso honesto para quem só tem o sub-módulo

Sem isto a chave da AC1 não serve para nada: a SDR receberia `campanhas.formularios` e **não teria
como chegar lá** — o item Campanhas da sidebar exige o módulo, e o `/dashboard/campaigns` cairia na
base de campanhas.

1. **Sidebar:** Campanhas aparece com o módulo **OU** `campanhas.formularios` — função pura
   `podeVerMenuCampanhas`, gêmea da `podeVerMenuConfig` que já faz isso para Configurações
   (`permissions-modules.ts:139`). Quando a pessoa não tem o módulo, o item aponta direto para
   `/dashboard/campaigns/formularios`.
2. **Abas CRM e Meta Ads** passam a depender do módulo. Hoje elas aparecem sempre — inclusive para
   quem não pode abri-las.
3. **`/dashboard/campaigns` e `/dashboard/campaigns/meta` ganham gate de servidor.** Hoje **não têm
   nenhum** — o comentário da 75-333 (`formularios/page.tsx:16`) já registra que o
   `NAV_MODULE_MAP` só filtra a sidebar e que qualquer autenticado abre estas rotas pela URL. Quem
   cair nelas sem o módulo é **redirecionado para a aba que pode ver** (Formulários, ou Lídia se for
   o caso de `marketing.gerenciar`); sem nenhuma das três, `notFound()`.

O redirecionamento em vez de 404 seco é o que preserva as portas existentes: o perfil de marketing
chega em `/dashboard/campaigns` pelo botão de voltar da tela da Lídia.

## AC4 — Teste sem DOM

`podeVerMenuCampanhas` e a decisão de quais abas aparecem são funções puras, testadas direto (o
projeto não tem jsdom). O `campaigns-tabs.contract.test.ts` da 75-340 ganha a prop nova na lista de
props que **nenhuma tela pode passar com valor fixo** — é a trava contra a regressão que já
aconteceu duas vezes naquela barra.

## A convenção (o "vamos corrigir isto para submenus ou abas")

Fica escrita no `SUBMODULE_MAP`. Para qualquer aba/submenu virar liberável pelo CRM:

1. `canAccess("pai.sub")` gateando a página **e** a aba;
2. entrada no `SUBMODULE_MAP` (rótulo como o humano lê);
3. o menu do pai passa a ser "módulo OU sub-módulo", senão a chave concede um lugar inalcançável.

**Nada além de Campanhas›Formulários muda nesta story.** O inventário do que ainda não é
gerenciável pela tela — e que o Marcos decide se quer converter — é:

| Onde | Abas | Situação hoje |
|---|---|---|
| IMOB | Leads · Pipeline · Imobiliárias | nenhuma gateada (proposta de 02/07, adiada por ele) |
| Lançamentos | Board · Fornecedores | nenhuma gateada |
| Campanhas | Lídia | **já** gerenciável, como AÇÃO (`marketing.gerenciar`) |
| Configurações · Sistema | todas | **já** gerenciáveis (sub-módulos) |

## Dev Agent Record

- [x] **AC1** — `SUBMODULE_MAP.campanhas = { "campanhas.formularios": "Formulários" }`.
- [x] **AC2** — a tela de Formulários gateia pelo sub-módulo; a aba segue a mesma chave.
- [x] **AC3** — sidebar por `podeVerMenuCampanhas` (+ href direto para a aba quando não há módulo);
      abas CRM/Meta Ads seguem o módulo; **gate de servidor novo** em `/campaigns` e `/campaigns/meta`.
- [x] **AC4** — testes puros (`podeVerMenuCampanhas`, `destinoSemModuloCampanhas`) + dois contratos de
      código-fonte (props da barra e gates das telas).
- [x] A convenção dos três passos escrita no `SUBMODULE_MAP`.

### Decisões de implementação

- **`lib/campaigns/access.ts` novo.** As quatro telas montam a mesma barra e precisavam das três
  respostas (módulo · sub-módulo · capability da Lídia). Deixar cada uma resolvendo do seu jeito é
  exatamente como aquela barra regrediu duas vezes (75-333, 75-340); agora é uma função e um tipo.
- **Redirect em vez de 404** para quem cai em CRM/Meta sem o módulo: preserva a porta que o perfil de
  marketing usa hoje (o "voltar" da tela da Lídia). A ordem do destino é pura e testada.
- **O contract test da 75-340 foi ajustado, não afrouxado:** a asserção da capability da Lídia migrou
  de "a tela contém `marketing.gerenciar`" para "o `access.ts` contém" — a string saiu das quatro
  telas de propósito, e o teste agora vigia o lugar onde ela passou a viver.

### Validações

`npm test` 218 arquivos / 2702 testes ✅ · `type-check` 8/8 ✅ · `lint` 0 erros (26 warnings
pré-existentes) ✅ · `build` OK ✅

### Não medido

Quais perfis têm hoje o módulo `campanhas` em produção — sem PAT do Supabase nesta máquina. Não
bloqueia: a mudança é retrocompatível por herança (quem tem o módulo continua igual), e o efeito
para quem NÃO tem só aparece depois que o Marcos ligar a chave na tela.

## File List

- `packages/web/src/lib/permissions-modules.ts` — AC1 + `podeVerMenuCampanhas` + a convenção
- `packages/web/src/lib/permissions.ts` — re-export de `podeVerMenuCampanhas`
- `packages/web/src/lib/campaigns/access.ts` *(novo)* + `access.test.ts` *(novo)* — acesso do módulo num lugar só
- `packages/web/src/app/dashboard/campaigns/_components/campaigns-gates.contract.test.ts` *(novo)* — gates das telas
- `docs/qa/gates/75-344-aba-formularios-gerenciavel-pelo-crm.yml` *(novo)*
- `packages/web/src/lib/permissions-modules.test.ts` — AC4
- `packages/web/src/app/dashboard/layout.tsx` — AC3.1
- `packages/web/src/app/dashboard/campaigns/_components/campaigns-tabs.tsx` — AC3.2
- `packages/web/src/app/dashboard/campaigns/_components/campaigns-tabs.contract.test.ts` — AC4
- `packages/web/src/app/dashboard/campaigns/page.tsx` · `meta/page.tsx` · `meta/campaigns-meta-client.tsx` · `agente/page.tsx` · `agente/agente-client.tsx` · `formularios/page.tsx` — AC2/AC3

## Verificar depois do deploy

- Perfil de Acesso: buscar "formu" acha a linha **Formulários** sob Campanhas.
- Ligar para **Gerente Comercial** e **SDR** → entrar como uma delas: sidebar mostra Campanhas,
  clicar abre **Formulários**, e as abas CRM/Meta Ads **não** aparecem.
- Abrir `/dashboard/campaigns` na URL com esse perfil: cai em Formulários (não na base de campanhas).
- Admin/Supervisor: nada muda — as quatro abas seguem lá.

Relacionado: 75-150-b/c (sub-módulos na matriz) · 75-251 (`podeVerMenuConfig`) · 75-300..317
(Perfis de Acesso 2.0) · 75-333 (aba Formulários) · 75-340 (contract test da barra)
