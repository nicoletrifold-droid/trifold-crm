# Story 75-343 — As respostas do formulário na ficha do /dashboard (a tela da SDR)

**Status:** Review
**Tipo:** Bug fix (entrega incompleta da AC9 da 75-330) + melhoria (onde parou · histórico no plural)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-343
**Complexidade:** S (~3 pts — 1 helper, 1 componente, 2 páginas, 0 migrations)
**Fluxo:** @sm → @dev → @qa → @devops
**Migrations:** **nenhuma** — o dado já está gravado desde a 75-330 (mig 232).

## O pedido (Marcos, 19/08)

> *"Ontem criamos a parte de formulários e já teve um lead que até completou a etapa. Queria saber se
> conseguimos carregar o histórico das perguntas e respostas junto do lead, mesmo os que não
> terminaram o formulário — senão nossa SDR Thielly irá ficar perdida até onde o lead respondeu e
> qual o real interesse. Pensei em colocar aqui."* (print da aba **Histórico** de
> `/dashboard/leads/[id]`)

Decisão dele depois do diagnóstico: **nos dois lugares** — aba Info e aba Histórico.

## O diagnóstico: o dado existe, o painel existe, a tela é que não recebeu

Nada foi perdido. `lead_form_responses` (mig 232) grava a resposta desde o primeiro POST, e o lead
nasce no instante em que nome+telefone entram (`api/formulario/[token]/route.ts:263`) — quem
abandona depois disso **já é lead com resposta parcial gravada**. Na base de ontem: "Gabriel
Henrique", `Não terminou`, com telefone e lead.

O painel `FormResponsesPanel` também já existe (AC9 da 75-330) e o comentário dele diz, textualmente,
"painel compartilhado entre /broker e /dashboard". **Nunca foi:** o File List da 75-330 só tocou
`app/broker/leads/[id]/page.tsx`. E `sdr` não é `broker` — todo perfil que não é corretor cai em
`/dashboard` no login (`app/login/actions.ts:68`). Ou seja: a Thielly abre a única ficha de lead que
não tem o painel.

### O detalhe que decide o desenho

Quem **não terminou não tem activity**. A `form_completed` só é gravada na conclusão
(`route.ts:375`) — é por isso que a ficha da Thereza (completa) mostra a linha `FORM_COMPLETED` no
Histórico e a do Gabriel não mostra nada. Portanto: pendurar as respostas *dentro* da entrada de
activity resolveria o caso que já funciona e deixaria invisível exatamente o caso que motivou o
pedido. O painel precisa ser um **bloco próprio**, alimentado pela tabela de respostas, não pela
timeline.

## AC1 — O painel nas duas abas do /dashboard

`app/dashboard/leads/[id]/page.tsx` passa a buscar as respostas do lead e a renderizar
`FormResponsesPanel`:

- **aba Info** — acima do card "Informações". É a aba que abre por padrão: a SDR vê sem clicar.
- **aba Histórico** — acima de "Atividades", porque é onde o Marcos foi procurar.

Sem resposta de formulário, nenhum dos dois renderiza nada (o painel já devolve `null`) — a ficha de
lead que não veio de formulário fica igual ao que é hoje.

## AC2 — "Parou em: `<pergunta>`"

O painel hoje mostra o selo "Não terminou", mas não **onde** travou — que é a pergunta literal do
Marcos ("até onde o lead respondeu"). A regra já existe e já está em produção na tela de
Formulários: `perguntaDeAbandono` (`lib/forms/response-list.ts`), que reusa a ramificação
(`proximaPergunta`) — a "próxima pergunta a mostrar" de uma resposta abandonada é justamente onde
ela parou.

Resposta completa não mostra a linha (não há abandono).

## AC3 — Histórico no plural

`fetchRespostaDoLead` devolve **só a resposta mais recente** (`.limit(1).maybeSingle()`). Se o lead
preencher duas campanhas, a primeira desaparece — e o pedido é "carregar o **histórico** das
perguntas e respostas". Passa a devolver **todas**, da mais nova para a mais antiga, uma por painel.

Isso vale também para o `/broker`: o componente e o helper são compartilhados, e deixar o corretor
vendo só a última enquanto a SDR vê todas criaria duas verdades para a mesma pergunta. **É mudança
na tela do corretor** — declarada aqui, não escondida.

## AC4 — Teste da decisão, sem DOM

O projeto não tem jsdom, então a regra sai do componente e vira função pura testável
(`mapRespostasDoLead`), no padrão que a 75-333 já usa: ordenação, `parouEm` só em parcial, schema
quebrado não derruba a ficha, resposta sem nenhuma pergunta respondida não vira painel vazio, e
`resumo_ia` lido do metadata.

## Fora de escopo, e por quê

- **As linhas "sem contato"** (3 das 6 respostas de ontem) **não vão aparecer em ficha de lead
  nenhuma** — não existe lead: a pessoa saiu antes de dar nome e telefone. Elas seguem só na tela de
  Formulários, que é onde a oferta ativa pode sair. Isso é limite do dado, não da tela.
- **Criar activity para resposta parcial.** Seria uma linha de timeline por POST parcial; o painel
  resolve a visibilidade sem poluir o Histórico de quem só respondeu duas perguntas.

## Dev Agent Record

- [x] **AC1** — painel na Info (acima de "Informações") e no Histórico (acima de "Atividades"). Uma
      função `painelFormulario()` na página serve as duas abas: duas cópias do JSX divergiriam.
- [x] **AC2** — "Parou em: `<pergunta>`" no painel, via `perguntaDeAbandono` (regra já em produção
      na tela de Formulários — importada, não reescrita).
- [x] **AC3** — `fetchRespostasDoLead` (plural) devolve todas, `created_at` DESC. `/broker` passou a
      listar todas também.
- [x] **AC4** — `lead-responses.test.ts` novo: 7 casos do mapper puro + 1 do recorte da query.

### Decisões de implementação

- **`fetchRespostaDoLead` (singular) foi REMOVIDA**, não mantida ao lado da plural. Duas portas para
  a mesma leitura é como as divergências deste produto nascem — e a única chamadora era o `/broker`.
- **O recorte da query ganhou teste** (`lead_id` + `org_id` + ordem DESC) com um fake que captura o
  que foi pedido ao PostgREST. `lead_form_responses` tem RLS **sem policies** (mig 232) e é lida com
  service-role: o `WHERE` é a única barreira que existe, então ele é comportamento, não detalhe.

### Validações

`npm test` 216 arquivos / 2687 testes ✅ · `type-check` 8/8 ✅ · `lint` 0 erros (26 warnings
pré-existentes) ✅ · `build` OK ✅ (`/dashboard/leads/[id]` e `/broker/leads/[id]` presentes)

## File List

- `packages/web/src/lib/forms/lead-responses.ts` — plural + `parouEm` + mapper puro
- `packages/web/src/lib/forms/lead-responses.test.ts` *(novo)* — AC4
- `packages/web/src/components/leads/form-responses-panel.tsx` — AC2
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` — AC1
- `packages/web/src/app/broker/leads/[id]/page.tsx` — AC3 (lista todas)
- `docs/qa/gates/75-343-respostas-formulario-ficha-dashboard.yml` *(novo)* — gate

## Verificar depois do deploy

- `/dashboard/leads/14b88a50-d7d8-4e21-882b-a5c703c1e27b` (Thereza, completa): as 5 respostas
  aparecem na Info e no Histórico, com o score 44 e sem linha "Parou em".
- A ficha do **Gabriel Henrique** (parcial): aparece o que ele respondeu, o selo "Não terminou" e
  "Parou em: Quando você pensa em investir em um imóvel em Maringá, o que mais te atrai?".
- Um lead que nunca preencheu formulário: ficha inalterada, sem bloco vazio.

Relacionado: 75-330 (motor + AC9) · 75-332 (resumo da IA) · 75-333 (base de respostas) ·
75-340 (origem do formulário)
