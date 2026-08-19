# Story 75-346 — Os atalhos de Configurações saem da matriz, não de uma lista de perfis no código

**Status:** Done — gate PASS · **PR #457 mergeado em 19/08** (squash `c35ecee0`) · deploy de produção `success`
**Tipo:** Bug fix de governança (permissão que não abre porta) + furo de exposição na landing
**Epic:** 75 — CRM Trifold
**Complexidade:** M (~4 pts — 2 telas, 1 lib pura, 0 migrations)
**Fluxo:** @sm → @dev → @qa → @devops (executado 19/08)
**Migrations:** **nenhuma**.

## O pedido (Marcos, 19/08)

> *"É bom corrigir sim. No momento não tem necessidade, mas é uma correção importante para o
> futuro."*

Veio da 75-345: eu expliquei que dar a tela nova (Relatório Diário) ao Gerente Comercial não
funcionaria, porque a landing de Configurações mostra para esse perfil **três atalhos fixos escritos
no código** — qualquer tela nova nasce invisível para ele, mesmo com a permissão ligada na matriz.

## O defeito, em uma frase

`app/dashboard/configuracoes/page.tsx` tem `GERENTE_ALLOWED` — uma lista de três hrefs por **nome de
perfil**. Quem não é gerente-comercial vê **todos** os doze cards; quem é vê aqueles três. Nada disso
consulta a matriz. Consequências:

1. **Permissão que não abre porta.** Ligar `configuracoes.relatorio-diario` para o Gerente Comercial
   concede a tela e não cria caminho até ela. É o mesmo defeito da 75-344, do outro lado.
2. **A landing anuncia o que a pessoa não pode fazer.** Ela **não tem gate**: qualquer autenticado
   que digite `/dashboard/configuracoes` vê os doze atalhos — inclusive corretor.
3. O hub da Nicole (`configuracoes/nicole/page.tsx`) repete o padrão, com `roles: ["admin", …]` em
   cada card.

## A regra que fica

**O atalho aparece quando a pessoa pode fazer algo na tela — e a pergunta é a MESMA que a tela faz.**
Cada card declara a permissão que a própria página exige; a lista é derivada disso. Assim, tela nova
em Configurações passa a aparecer sozinha para quem tiver a permissão, e nunca mais depende de alguém
lembrar de editar uma lista de perfis.

Isso respeita a decisão da F5 (75-317) de que **card de hub é composição, não autorização** — o que
esta story conserta é uma composição que *mente*, não o modelo de autorização.

| Card | Permissão que a tela exige |
|---|---|
| Empresa · Central de Materiais | `configuracoes.empresa` |
| Usuários | `configuracoes.usuarios` |
| Corretores | `sistema` **ou** `corretores` (guard composto, preservado) |
| Clientes | `configuracoes.clientes` |
| Horário Comercial | `configuracoes.horario` |
| Integrações | `configuracoes.integracoes` |
| Nicole (hub) | qualquer um dos três filhos |
| Etapas do Pipeline | `configuracoes.pipeline` |
| Follow-up | `pipeline` |
| Perfil de Acesso | `configuracoes.perfil-acesso` |
| Relatório Diário | `configuracoes.relatorio-diario` |

**Empresa, Horário e Etapas do Pipeline não barram quem entra** — mostram conteúdo só-leitura e usam
a chave para liberar a EDIÇÃO. Para essas três o card segue a chave de edição, porque é o que o card
promete ("configurar"). **Não vou adicionar gate a elas nesta story:** tirar a leitura de quem hoje
tem é mudança de comportamento que ninguém pediu, e a URL continua funcionando.

## AC1 — Landing derivada da matriz

`GERENTE_ALLOWED` morre. A lista de cards vem de `canAccess` por card.

## AC2 — Landing com gate

Sem nenhum card visível, `redirect("/dashboard")`. Hoje a tela é aberta a qualquer autenticado e
anuncia doze atalhos; quem não tem nenhum não tem o que fazer ali.

## AC3 — Hub da Nicole pela mesma régua

Os `roles: [...]` de cada card saem; entram as capabilities que as três telas filhas já exigem
(`configuracoes.personalidade`, `nicole.treinamento_gerenciar`, `nicole.midia_gerenciar`).

## AC4 — Teste puro + o mapa congelado

A decisão "quais cards aparecem" vira função pura (`cardsVisiveis`), testada sem DOM. E um teste
congela o mapa card→permissão: **card sem permissão declarada reprova** — é o que impede a próxima
tela de Configurações de nascer visível para todo mundo (ou para ninguém).

## Efeito medido em produção ANTES de escrever código

Simulei a resolução (`exceção → linha do perfil → herança do pai`) contra os dados reais de
`role_permissions`, perfil por perfil:

| Perfil | Hoje | Depois | Diferença |
|---|---|---|---|
| Administrador | 12 | 12 | igual |
| Supervisor | 12 | 12 | igual |
| **Gerente Comercial** | 3 | 4 | **+ Etapas do Pipeline** |
| Corretor · Consultoria · SDR | 12 | 1 | perdem 11 atalhos que já não podiam usar (ficam com Follow-up, que têm pelo módulo `pipeline`) |
| Obras · IMOB · Social Media · Aux-Administrativo · Ger. Relacionamento | 12 | 0 | idem, e caem no `redirect` da AC2 |

Dois pontos que valem a atenção do Marcos:

- **O Gerente Comercial GANHA "Etapas do Pipeline"** — porque a matriz de produção já diz
  `configuracoes.pipeline = true` para ele. A lista fixa mostrava Follow-up e escondia essa. Depois
  desta story, a matriz manda: se não era a intenção, o lugar de corrigir é a matriz, na tela.
- **Os perfis que "perdem" atalhos nunca deveriam tê-los visto.** Eles não têm o item Config na
  sidebar; só chegavam digitando a URL. Nenhum deles perde acesso a nada que conseguisse usar.

O hub da Nicole: **zero mudança** para todos os perfis (medido igual). Lá é só matar nome de role.

## Dev Agent Record

- [x] **AC1** — `GERENTE_ALLOWED` morto; cards derivados por `canAccess`, uma consulta por CHAVE
      distinta (não por card).
- [x] **AC2** — `redirect("/dashboard")` quando não há nenhum atalho.
- [x] **AC3** — hub da Nicole pela mesma régua; `roles: [...]` mortos.
- [x] **AC4** — `config-cards.test.ts` (11 casos, inclui "todo card declara permissão") +
      `configuracoes-gate.contract.test.ts` (6 casos, criado no gate para travar a fiação).

### Decisões de implementação

- **O contract test ignora comentários.** O comentário que conta a história cita `GERENTE_ALLOWED`
  pelo nome; a asserção olha código, então o teste remove comentários antes de comparar. Sem isso,
  documentar o passado reprovaria o teste.
- **Não gatear Empresa/Horário/Etapas** (ver C1 do gate): elas mostram só-leitura e a chave é de
  edição. Fechar a leitura seria mudança que ninguém pediu.

### Validações

`npm test` 221 arquivos / 2729 testes ✅ · `type-check` 8/8 ✅ · `lint` 0 erros ✅ · `build` OK ✅

## File List (previsto)

- `packages/web/src/lib/config-cards.ts` *(novo)* + `config-cards.test.ts` *(novo)* — AC1/AC3/AC4
- `packages/web/src/app/dashboard/configuracoes/page.tsx` — AC1/AC2
- `packages/web/src/app/dashboard/configuracoes/nicole/page.tsx` — AC3
- `packages/web/src/app/dashboard/configuracoes/configuracoes-gate.contract.test.ts` *(novo)* — AC4
- `docs/qa/gates/75-346-cards-configuracoes-pela-matriz.yml` *(novo)*

## Verificar depois do deploy

- Admin e Supervisor: os doze atalhos, como antes.
- Ligar `configuracoes.relatorio-diario` para o Gerente Comercial na matriz e conferir que o card
  **aparece** para ele — é o teste do que motivou a story (depois pode desligar).
- Entrar como corretor e abrir `/dashboard/configuracoes` na URL: sem atalho de Configurações, cai no
  dashboard.

Relacionado: 75-345 (a tela que expôs o problema) · 75-344 (permissão inalcançável, outro lado) ·
75-317/F5 (card de hub = composição) · 75-251 (`podeVerMenuConfig`)
