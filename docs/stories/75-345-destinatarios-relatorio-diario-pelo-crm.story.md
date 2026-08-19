# Story 75-345 — Quem recebe o relatório diário sai do CRM (e o gerente comercial entra)

**Status:** Review
**Tipo:** Feature (configuração que era env de dev) + atende pedido direto
**Epic:** 75 — CRM Trifold
**Complexidade:** M (~4 pts — 1 tela, 1 helper, 1 cron, 0 migrations)
**Fluxo:** @sm → @dev → @qa → @devops
**Migrations:** **nenhuma** — a lista mora em `organizations.settings` (jsonb que já existe, mesmo
lugar do `materiais_url` da 75-117).

## O pedido (Marcos, 19/08)

> *"Dá pra incluir o gerente comercial para receber também? Aí receberia o Alexandre e o gerente
> comercial."* — número informado: **5544988441602**. Escolheu a opção B: **pelo CRM**, não por env.

## O que existe hoje

Cron `/api/cron/daily-report`, `59 10 * * *` UTC = **07:59 BRT**, template
`relatorio_diario_leads_v3`. Os destinatários vêm de **`DAILY_REPORT_RECIPIENTS`** (env da Vercel,
lista separada por vírgula) — hoje só o WhatsApp do Alexandre. Trocar quem recebe exige REST API da
Vercel + redeploy, ou seja: dev.

## O que a consulta em produção mostrou (e mudou o desenho)

| Número | Quem é | No CRM? |
|---|---|---|
| 5544984070700 | **Alexandre Guimaraes Nicolau** | **é usuário** (role `admin`), telefone preenchido |
| 5544988441602 | **Joabe Albuquerque Silva** | **é usuário** (role `gerente-comercial`), telefone preenchido |

Duas consequências:

1. **A memória do projeto estava desatualizada** ("Alexandre é SÓ destinatário, não é usuário"). Ele
   virou usuário em algum momento. Os dois destinatários são usuários com telefone no cadastro — então
   a lista pode ser **escolha de usuários**, não digitação de números.
2. **A lista NÃO pode ser uma capability.** Era a primeira ideia, mas na matriz o admin é `true` por
   construção (`adminFullMatrix`) — e há 5 admins ativos, 2 com telefone. Uma capability faria o
   Marcos e qualquer admin futuro passarem a receber WhatsApp às 07:59 sem pedir. É a regra que a
   própria F3-4 registrou: *seed que exclui admin de propósito = composição de UX, não autorização*.
   Lista de distribuição é composição, então é escolha explícita por pessoa.

## AC1 — Tela "Relatório Diário" em Configurações

`/dashboard/configuracoes/relatorio-diario`: lista os usuários **ativos com telefone** com uma caixa
de seleção cada, mostrando nome, perfil e o número que receberá. Salvar grava
`organizations.settings.relatorio_diario_destinatarios` = lista de ids.

Usuário ativo **sem telefone** aparece separado, desabilitado, com o motivo escrito ("sem telefone no
cadastro") e o link para editá-lo. Esconder seria pior: o Marcos procuraria a pessoa na lista e não
acharia, sem saber por quê.

**Gate:** `canAccess("configuracoes.relatorio-diario")` + entrada no `SUBMODULE_MAP` — a convenção de
três passos da 75-344, aplicada à própria tela nova. O menu Config já aparece por qualquer
sub-módulo concedido (`podeVerMenuConfig`), então o passo 3 sai de graça.

## AC2 — O cron passa a ler a lista

Destinatários = **usuários selecionados** (ativos, com telefone) **+** `DAILY_REPORT_RECIPIENTS`,
deduplicados por número normalizado (`normalizePhoneBR`, o helper da casa).

- **A env fica.** É a porta para número que não é usuário (o Alexandre era esse caso até ontem) e,
  mais importante, é o que garante que **nada muda entre o deploy e a primeira configuração**: com a
  lista vazia, o comportamento é idêntico ao de hoje.
- **Dedup por número normalizado, não por id:** o telefone do Alexandre está na env E no cadastro
  dele. Sem dedup ele receberia duas vezes a mesma mensagem.
- Usuário que sai da empresa (`is_active=false`) ou que perde o telefone **para de receber sem
  ninguém mexer na lista** — a resolução acontece na hora do envio, não na hora do clique.

## AC3 — Seleção aplicada em produção

Depois do deploy, semear a lista com **Alexandre + Joabe** (via Management API, idempotente, com
verificação por query). É o pedido original: os dois recebem o envio de 07:59 de amanhã.

## AC4 — Teste da decisão, sem DOM

`mergeRecipients` é pura: recebe a lista de usuários selecionados e a env, devolve os números que vão
receber. Cobre dedup do mesmo número em formatos diferentes, usuário inativo, usuário sem telefone,
id selecionado que não existe mais, lista vazia (= só a env) e número inválido na env.

## Fora de escopo

- **Observabilidade do envio.** Este relatório não grava nada no banco: se a Graph API falhar (token
  rotacionado, como em 10/08), ninguém sabe. Eu levantei isso e o Marcos disse que era outra demanda —
  fica registrado, não entra aqui.
- **O filtro `GERENTE_ALLOWED` da landing de Configurações** (role hardcoded) não é tocado.

## Dev Agent Record

- [x] **AC1** — tela `/dashboard/configuracoes/relatorio-diario` (escolha por pessoa, indisponíveis
      listados com o motivo), card na landing, sub-módulo no `SUBMODULE_MAP`.
- [x] **AC2** — cron resolve usuários escolhidos + env, dedup por `normalizePhoneBR`.
- [ ] **AC3** — semear Alexandre + Joabe em produção (**depois do deploy**).
- [x] **AC4** — `recipients.test.ts` (9 casos) + `daily-report/route.test.ts` (5 casos, novo).

### Decisões de implementação

- **Rótulo do perfil sai da tabela `roles`** (`getOrgRoles`), não de um mapa nome→rótulo novo: não
  existe `ROLE_LABELS` no projeto e criar um seria duplicar a fonte.
- **A server action revalida a permissão e valida os ids** contra usuários ativos da org. O
  formulário é do cliente: uma lista de ids arbitrários viraria envio para telefone alheio.
- **O retorno do cron passou a incluir `destinatarios`** — quem recebeu, não só quantos. É a única
  observabilidade possível hoje sem sair do escopo (ver C1 do gate).

### Validações

`npm test` 219 arquivos / 2713 testes ✅ · `type-check` 8/8 ✅ · `lint` 0 erros ✅ · `build` OK ✅

## File List (previsto)

- `packages/web/src/lib/reports/recipients.ts` *(novo)* + `recipients.test.ts` *(novo)* — AC2/AC4
- `packages/web/src/app/dashboard/configuracoes/relatorio-diario/page.tsx` *(novo)* — AC1
- `packages/web/src/lib/permissions-modules.ts` — sub-módulo da tela nova
- `packages/web/src/app/dashboard/configuracoes/page.tsx` — card
- `packages/web/src/app/api/cron/daily-report/route.ts` — AC2
- `packages/web/src/app/api/cron/daily-report/route.test.ts` *(novo)* — AC4
- `packages/web/src/lib/permissions-modules.test.ts` — AC4
- `docs/qa/gates/75-345-destinatarios-relatorio-diario.yml` *(novo)*

## Verificar depois do deploy

- Configurações › Relatório Diário: Alexandre e Joabe marcados; usuários sem telefone listados como
  indisponíveis.
- Perfil de Acesso: buscar "relat" acha a linha **Relatório Diário** sob Configurações.
- 07:59 BRT do dia seguinte: os dois recebem, **uma** mensagem cada.

Relacionado: 75-45 / 75-45-b / 75-45-c / 75-212 (o relatório e seus fixes) · 75-117 (`settings` como
config editável) · 75-344 (convenção de sub-módulo) · 75-289 (falha silenciosa do token)
