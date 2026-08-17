# Story 75-333 — Aba "Formulários" em Campanhas: perguntas + base de respostas

**Status:** InReview
**Tipo:** Feature (tela nova + fechamento de furo de captura)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-333
**Complexidade:** M (~5 pts — 1 aba, 2 telas, 1 correção no runner, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Depende de:** 75-330 (#437), 75-331 (#438), 75-332 (#439). Branch empilhada sobre a 332.
**Migrations:** **nenhuma**.

## O pedido (Marcos, 17/08)

> *"Quando um lead não termina o cadastro eu não posso perder estas informações, pois posso
> fazer uma oferta ativa. Então precisamos deixar tudo que for preenchido, completo ou não,
> guardado. Pensei em colocar [o formulário] em mais uma aba [em Campanhas], e dentro dela ter
> a parte para cadastrarmos as perguntas e ter a base de dados destes leads — os que
> preencheram tudo e também os que abandonaram."*

## O nome da aba: **Formulários**

As abas de Campanhas hoje são **CRM · Meta Ads · Lídia** — duas nomeiam o canal, uma nomeia a
agente. "Formulários" nomeia o artefato, que é o que o usuário procura quando quer mexer nas
perguntas ou ver quem respondeu. Descartados: "Qualificação" (descreve o objetivo, não a
coisa, e colide com a Qualificação Comercial do Épico 84) e "Captação" (vago — todas as abas
captam).

## O que JÁ está guardado (e por isso esta story é menor do que parece)

A 75-330 já grava a cada clique em "Continuar", e a resposta nasce **antes** de existir lead:

- `lead_form_responses` recebe uma linha na primeira resposta, com `status='parcial'`
- `lead_id` fica `NULL` até haver nome + telefone; a partir daí o lead existe e é vinculado
- O `metadata` guarda a UTM de origem desde o começo

**Ou seja: o dado não está sendo perdido — está invisível.** Não existe tela que mostre
resposta parcial, e para uma resposta órfã (`lead_id IS NULL`) não existe nem ficha onde ela
apareceria. É isso que esta story resolve.

## 🔴 O furo real de captura

`form-runner.tsx` chama `salvarParcial` **dentro de `responder()`** — ou seja, só quando a
pessoa clica em "Continuar". **O que ela digitou e não confirmou vai embora.**

Numa campanha paga isso é justamente o caso mais comum: a pessoa digita o telefone, hesita e
fecha a aba. Hoje esse telefone — o dado que torna a oferta ativa possível — se perde.

## ⚠️ O limite honesto: resposta sem contato não permite oferta ativa

Precisa estar dito, porque a expectativa "não perco nada" encosta nele: se a pessoa responde
duas perguntas e **nunca** informa telefone nem e-mail, a resposta fica guardada mas **não há
quem chamar**. Nenhuma tela conserta isso.

O que a resposta órfã ainda vale, e é muito:

- **Onde as pessoas desistem.** Se 40% param na pergunta de renda, o problema é a pergunta,
  não o anúncio. Esse é o dado que faz o formulário melhorar.
- **Volume real por campanha** — quantos começaram × quantos terminaram, por UTM.

A defesa contra o órfão é de desenho, não de tela, e já está na AC4 da 75-330: pedir contato
**cedo**. Esta story reforça isso ao mostrar a taxa de abandono por pergunta — se o contato
está pedido tarde, a tela denuncia.

## O que já existe e vai ser REUSADO

| Peça | Onde | Observação |
|------|------|-----------|
| Config das perguntas | `app/dashboard/configuracoes/formularios/` (75-330) | **Movida** para a aba nova — ver decisão abaixo |
| Respostas formatadas | `lib/forms/format-response.ts` | Resolve rótulo de opção; a base mostra texto legível, não jsonb |
| Ramificação | `lib/forms/branching.ts` — `perguntasVisiveis`, `proximaPergunta` | É o que diz **em qual pergunta** a pessoa parou |
| Barra de abas | `campaigns/page.tsx`, `meta/campaigns-meta-client.tsx`, `agente/agente-client.tsx` | ⚠️ **três cópias** — ver AC1 |
| Link para o lead | `lib/leads/lead-url.ts` | Rota certa por perfil do dono (`/broker` × `/dashboard`) |

### Decisão: a config **sai** de Configurações

A tela de perguntas criada pela 75-330 vive em `configuracoes/formularios`. Ela **muda de
lugar**, não é duplicada: duas portas para a mesma coisa divergem na primeira alteração, e o
usuário nunca sabe qual é a de verdade. O gate de acesso (`canAccess("configuracoes")`) é
substituído pelo da própria aba.

## Escopo

### IN

1. Aba **Formulários** em `/dashboard/campaigns/formularios`.
2. Dentro dela, duas seções: **Perguntas** (a config, movida) e **Respostas** (a base).
3. A base lista respostas **completas e parciais**, incluindo as sem lead.
4. Correção do furo: salvar o que foi digitado sem clicar "Continuar".
5. Taxa de abandono por pergunta — onde as pessoas param.

### OUT

- Exportar CSV em massa (dado pessoal em volume; se for necessário, story própria com decisão de LGPD)
- Disparo automático de oferta ativa para quem abandonou (é a pendência da Nicole, decisão D-B da 75-330)
- Editor visual de perguntas (segue fora, Epic 89 §7)

## Acceptance Criteria

1. **AC1 — A aba aparece em TODAS as telas de Campanhas.** A barra de abas está **duplicada em
   três arquivos** (`page.tsx`, `meta/campaigns-meta-client.tsx`, `agente/agente-client.tsx`).
   Somar a aba em um e esquecer outro produz uma barra que perde a aba conforme a tela — falha
   silenciosa e visível só por acidente. **Extrair a barra para um componente único** e usar
   nos três; a aba nova entra uma vez só.

2. **AC2 — 🔴 Gate EXPLÍCITO na página. Copiar as vizinhas não serve.**

   `[@po 17/08]` A redação original dizia "mesma capability das abas vizinhas". Fui verificar
   qual é: **não existe.** O `NAV_MODULE_MAP` de `app/dashboard/layout.tsx:73` mapeia
   `/dashboard/campaigns → campanhas`, mas é consumido **só na linha 202, para filtrar o
   sidebar**. O único `redirect` do layout é o do corretor (linha 104). Nenhuma rota sob
   `/dashboard/campaigns` tem gate de servidor — quem tem o módulo `campanhas` desligado
   **não vê o item no menu, mas abre a tela digitando a URL**.

   Nas abas atuais isso é ruim e discutível. Nesta tela é inaceitável: ela lista **telefone de
   lead e texto livre que a pessoa escreveu**. Esconder do menu não é bloquear.

   **A página gateia explicitamente** com `canAccess(..., "campanhas")` e nega a rota, não só o
   link. Não é "como as vizinhas" — é melhor que elas, de propósito.

   ⚠️ **Fora do escopo, mas registrado:** o resto da árvore `/dashboard/campaigns` (e,
   provavelmente, as outras rotas do mapa) segue sem gate de rota. Fechar isso mexe em gating
   compartilhado e é story própria — não passageira desta.

3. **AC3 — A base mostra o que foi respondido, completo ou não.** Cada linha traz: quando,
   nome/telefone (ou "sem contato"), formulário de origem, campanha (UTM), status
   (**Completa** / **Não terminou**), score quando houver, e link para o lead quando existir.
   Resposta **sem lead aparece igual** — é o caso que o pedido nomeia.

4. **AC4 — Dá para ver o que a pessoa escreveu sem sair da tela.** Abrir uma linha mostra
   pergunta + resposta em texto legível (`format-response.ts`), não jsonb cru.

5. **AC5 — 🔴 Nada digitado se perde.** O que foi preenchido é salvo **sem depender do clique
   em "Continuar"**: ao sair do campo (blur) e ao fechar/esconder a aba. Um telefone digitado e
   não confirmado precisa estar no banco.

   **Teste obrigatório:** simular preenchimento sem confirmação e provar que a resposta foi
   persistida. Um teste que só exercite o caminho do "Continuar" não vale — é justamente o
   caminho que já funciona.

6. **AC6 — Onde as pessoas param.** Para respostas parciais, a tela mostra **em qual pergunta**
   pararam (via `proximaPergunta`) e o total por pergunta. É o dado que melhora o formulário —
   e o que denuncia contato pedido tarde demais.

7. **AC7 — Filtros que servem à operação.** Filtrar por formulário e por status (completa /
   não terminou / sem contato). Sem filtro, a lista é inútil depois da primeira campanha.

8. **AC8 — A config muda de lugar sem perder gate.** `configuracoes/formularios` deixa de
   existir; quem tinha acesso à edição continua tendo pela aba nova. Nenhum link órfão apontando
   para a rota antiga.

9. **AC9 — Lista grande não derruba a tela.** A base pagina. O projeto já apanhou do teto de
   1000 linhas do PostgREST em três telas diferentes — não repetir.

## Notas técnicas

- **A decisão vai para função pura**, como nas 330–332: "em qual pergunta parou" e "como
  rotular o status desta linha" são funções testáveis sem DOM.
- **`lead_id IS NULL` é caso de primeira classe**, não borda. O índice da 232 é parcial
  (`WHERE lead_id IS NOT NULL`) porque servia à ficha do lead; a consulta desta tela é por
  `org_id + form_id`, que o outro índice cobre — conferir o plano antes de assumir.
- **Salvar no blur multiplica requisições.** Debounce e não reenviar payload idêntico: o
  endpoint é público e tem rate limit por IP (30/min) — um blur por caractere queimaria a cota
  do próprio lead.

## Definition of Done

- [ ] Aba visível nas três telas de Campanhas, com a barra extraída para um componente só
- [ ] Base listando completas, parciais e **sem contato**
- [ ] **Teste provando que o digitado-sem-confirmar foi salvo** (AC5)
- [ ] Abandono por pergunta conferido com uma resposta real
- [ ] `configuracoes/formularios` removida, sem link órfão
- [ ] `tsc` 0 · `eslint` sem warning nova · `build` · `vitest` sem regressão
- [ ] @qa PASS antes do push

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 17/08/2026 | @sm (River) | Story criada a partir do pedido do Marcos. Achados: a barra de abas está duplicada em 3 arquivos, e o `salvarParcial` só roda no clique em "Continuar" — o digitado-sem-confirmar se perde hoje |

---

## Validação @po — 17/08/2026

**VEREDITO: 🟢 GO — `Draft` → `Ready`. Checklist 9/10.**

Verifiquei as três afirmações centrais no código:

1. ✅ **O furo de captura existe.** `salvarParcial` é chamada em exatamente um ponto —
   `form-runner.tsx:99`, dentro de `responder()`. Confirmado: digitado-sem-confirmar se perde.
2. ✅ **A barra de abas está duplicada em 3 arquivos.** Confirmado.
3. 🔴 **A AC2 estava errada e virou o achado mais importante** — ver AC2 acima. "Mesma
   capability das vizinhas" resolvia para *nenhuma*.

### Achado de brinde: a tela da 75-330 nasceu ÓRFÃ

`configuracoes/formularios` **não é linkada de lugar nenhum** — a única menção no código são
dois comentários na rota da API. Eu criei a tela na 75-330 e nunca adicionei o link para ela;
ela só era alcançável digitando a URL.

Duas consequências: a AC8 (mover sem deixar link órfão) é trivial, e — mais importante — **a
config de perguntas estava inalcançável na prática**. O pedido do Marcos de trazê-la para uma
aba não é só organização: é o que a torna usável.

### Ressalvas

- ⚠️ **Empilhamento quádruplo.** Ordem: **#437 → #438 → #439 → esta**.
- ⚠️ **AC5 é a que corre risco de virar teatro.** Salvar no blur é fácil; provar que salvou sem
  o clique é o que vale. O teste tem de exercitar o caminho novo, não o que já funcionava.
- ⚠️ **Debounce não é detalhe.** O endpoint é público com 30 req/min por IP. Sem dedupe, um
  formulário de 6 campos com blur a cada correção queima a cota do próprio lead e ele passa a
  ver 429 no meio do preenchimento — transformando uma melhoria de captura em perda total.

— Pax, @po
| 17/08/2026 | @dev (Dex) | Implementada. Barra de abas unificada (era 3 cópias), config movida de Configurações, base com filtros e paginação, rascunho salvo no blur + `visibilitychange` |
| 17/08/2026 | @qa (Quinn) | **CONCERNS** — gate de rota explícito confirmado; AC5 virou testável via `draft-save.ts` (7 casos). Ressalva: "onde as pessoas param" conta só a página atual. Parecer: `docs/qa/qa-gate-75-333.md` |
