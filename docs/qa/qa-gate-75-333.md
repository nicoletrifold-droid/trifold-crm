# QA Gate — Story 75-333 (*aba Formulários: perguntas + base de respostas*)

**Revisor:** @qa (Quinn) · **Data:** 2026-08-17 · **Story:** `docs/stories/75-333-formularios-aba-campanhas.story.md`
**Base:** branch `story/75-333-formularios-aba-campanhas` (empilhada sobre 332 → 331 → 330)

---

## VEREDITO: 🟡 **CONCERNS** — aprovado; 2 correções feitas durante o desenvolvimento

Esta story fechou dois furos que o @po encontrou **antes** do código existir — o que é a ordem
certa. O gate não abriu em FAIL.

## 1. O que o @po pegou e o código honrou

**Gate de rota explícito.** A story original dizia "mesma capability das abas vizinhas". As
vizinhas **não têm nenhuma**: o `NAV_MODULE_MAP` (`layout.tsx:73`) é consumido só na linha 202,
para filtrar o sidebar. Quem tem o módulo `campanhas` desligado não vê o menu e **abre a tela
pela URL**. Numa tela que lista telefone de lead e texto livre, isso não passa. A página gateia
com `canAccess(..., "campanhas")` e devolve 404 — melhor que as vizinhas, de propósito.

⚠️ **O resto da árvore `/dashboard/campaigns` segue sem gate de rota.** Fica registrado como
story própria: mexer em gating compartilhado não é passageiro desta.

**Barra de abas unificada.** Estava copiada em 3 arquivos — e o próprio `agente-client.tsx`
documentava isso (*"padrão duplicado-inline das telas CRM e Meta Ads"*). Somar a aba em dois e
esquecer o terceiro faria a aba sumir conforme a tela. Agora é um componente só, com a aba
ativa vindo do `usePathname`.

## 2. AC5 — como ela virou testável

O projeto não tem jsdom, então "provar que o digitado-sem-confirmar persiste" não podia ser
teste de componente. A decisão foi extraída para `lib/forms/draft-save.ts` e o runner passou a
usá-la — o teste cobre o código que roda, não uma cópia.

Sete casos, incluindo os dois que importam: **o telefone digitado e não confirmado entra no
payload**, e o **dedupe** impede que uma correção de digitação queime os 30 req/min por IP do
endpoint público (sem ele, a melhoria de captura viraria 429 na cara do lead).

`visibilitychange` em vez de `beforeunload`: no iOS o segundo não dispara, e mobile é onde a
aba morre sem aviso.

## 3. Os 7 checks

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review | ✅ decisões (`statusDaLinha`, `perguntaDeAbandono`, `montarLinhas`, rascunho) em funções puras; telas só desenham |
| 2 | Testes | ✅ **2545 passed** (202 arquivos), +21 nesta story |
| 3 | Critérios de aceite | ✅ AC1–AC9 |
| 4 | Sem regressão | ✅ as 3 telas de Campanhas seguem renderizando; `configuracoes/formularios` removida sem link órfão |
| 5 | Performance | ✅ pagina em 50 com `.range()` ordenado por coluna única (`id`) — o projeto já apanhou do teto de 1000 do PostgREST |
| 6 | Segurança | ✅ gate de rota explícito; dado pessoal só atrás dele; export em massa ficou fora de propósito |
| 7 | Documentação | ✅ o porquê do gate e do dedupe está no código |

**Gates:** `type-check` 8/8 · `lint` exit 0 · `build` 5/5 (rota `/dashboard/campaigns/formularios`
presente, `configuracoes/formularios` ausente) · `test` 2545 passed.

> O `turbo build` falhou uma vez com cache sujo após a remoção da rota antiga; `next build`
> direto passou e o `turbo` repetido também. Não é código.

## 4. Achado de brinde, e ele muda a leitura do pedido

`configuracoes/formularios` **não era linkada de lugar nenhum** — criei a tela na 75-330 e
nunca adicionei o link. Ela só era alcançável digitando a URL.

Ou seja: o pedido do Marcos de trazê-la para uma aba não era organização, era **o que a torna
alcançável**. Sem esta story, a configuração de perguntas seria funcionalidade fantasma.

## 5. Ressalvas que o merge NÃO resolve

1. ⛔ **Empilhamento quádruplo.** Ordem: **#437 → #438 → #439 → #440**.
2. ⛔ **Nada exercitado com dado real.** Toda a base foi testada com fixtures. O ranking de
   abandono, em particular, só prova seu valor com respostas de verdade.
3. 🟡 **"Onde as pessoas param" conta apenas a PÁGINA atual**, não a base inteira. Com 50 por
   página é útil como amostra, mas não é a estatística da campanha — a tela diz "nesta página"
   para não mentir. Agregado real exige contagem no banco: story própria.
4. 🟡 **Resposta sem contato continua sem contato.** A tela a mostra e a rotula, mas ninguém
   pode ser chamado. A defesa segue sendo pedir contato cedo — e agora o ranking de abandono
   denuncia quando ele está sendo pedido tarde.

— Quinn, @qa
