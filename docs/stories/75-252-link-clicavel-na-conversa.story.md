# Story 75-252 — Link na conversa fica clicável

**Status:** InReview
**Tipo:** Feature (pequena)
**Epic:** Conversas / Chat
**Complexidade:** S

## Contexto
Marcos (31/07): *"Vi em uma das conversas da Nicole que o lead enviou um link,
porém ele não ficou clicável para abrir a página de destino."*

Confirmado no código: **não existe linkificador em nenhum lugar do projeto.** Toda
mensagem sai como texto puro — `<p className="whitespace-pre-wrap">{msg.content}</p>`.

O prejuízo é concreto e diário: o lead manda o link do imóvel que viu, do
concorrente, do boleto, da localização — e quem atende tem que **selecionar,
copiar e colar** na barra do navegador. Em telefone, pior ainda.

## Levantamento — 8 pontos de renderização, 6 arquivos
Feito antes de escrever a story, porque consertar um e esquecer os outros é o
modo de falha óbvio aqui:

| Arquivo | Linha | Superfície |
|---|---|---|
| `dashboard/chat/[id]/page.tsx` | 143 | Chat compartilhado |
| `dashboard/conversas/[id]/page.tsx` | 198 | Conversas |
| `broker/leads/[id]/_components/conversation-thread.tsx` | 244 e **265** | Conversa do lead no /broker (**dois** pontos) |
| `dashboard/leads/[id]/timeline/page.tsx` | 368 e 416 | Timeline do lead (`event.description`) |
| `cliente/[obra_id]/mensagens/_components/chat-feed.tsx` | 143 | Portal do cliente — chat de obra |
| `dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` | 177 | Chat de obra, lado admin |

> ⚠️ **Contagem corrigida no @dev:** o cabeçalho desta seção dizia "6 pontos, 5
> arquivos" — errado nas duas contas. A tabela tem 6 *linhas*, mas duas delas têm
> **dois** pontos cada (`conversation-thread` e `timeline`), e são 6 arquivos.
> Total real: **8 pontos**. A ressalva (b) do @po — contar os pontos depois de
> implementar — foi exatamente o que pegou isso.

**Fora de propósito:** `mensagens/_components/inbox-sidebar.tsx` e
`cliente/[obra_id]/_components/mensagens-list.tsx` são **preview de lista** — ali o
clique deve abrir a conversa, não o link. `/broker/chat` é lista de conversas, não
thread.

## Critérios de aceite
- **AC1** — URL no texto da mensagem vira `<a>` clicável, abrindo em nova aba, nos
  **8 pontos** acima.
- **AC2** — 🔒 **Nunca `dangerouslySetInnerHTML`.** O texto vem de terceiro (o
  lead escreve o que quiser). A tokenização devolve segmentos e o React monta os
  nós — XSS fica impossível por construção, não por sanitização.
- **AC3** — 🔒 Só esquema **`http` e `https`**. `javascript:`, `data:`,
  `vbscript:`, `file:` e afins **não** viram link — ficam texto.
- **AC4** — `www.algo.com` sem esquema vira link com `https://` no `href`, mas o
  **texto exibido continua o que a pessoa escreveu**.
- **AC5** — Todo link sai com `target="_blank"` e `rel="noopener noreferrer"`.
- **AC6** — Pontuação final não entra no link: `veja https://x.com/a.` não deve
  linkar o ponto; parêntese só entra se estiver balanceado.
- **AC7** — A tokenização é **função pura**, testável sem DOM e sem React.
- **AC8** — Quebra de linha e espaçamento preservados (hoje é
  `whitespace-pre-wrap`/`pre-line`); o visual das bolhas não muda para mensagem
  sem link.
- **AC9** — Zero regressão: suíte verde, `tsc` limpo, build OK.

## Escopo
**IN:** função pura de tokenização, um componente compartilhado de texto de
mensagem, aplicação nos **8 pontos**, testes.

**OUT (decidido):**
- **Preview de conversa em lista** (motivo acima).
- **Telefone e e-mail clicáveis** (`tel:`/`mailto:`). Seria útil, mas cada esquema
  novo é superfície de decisão própria; URL é o pedido. Story própria se quiserem.
- **Preview/cartão do link** (título, imagem do destino) — exige buscar a URL no
  servidor, com risco de SSRF. Bem maior.
- Markdown na mensagem. WhatsApp manda texto simples.

## Dependências
Nenhuma. Sem migração.

## Riscos
1. **Falso positivo na detecção** — texto como `visite trifold.eng.br` ou
   `arquivo.pdf` pode parecer domínio. Mitigação: exigir esquema explícito **ou**
   o prefixo `www.`; não sair adivinhando por TLD. `arquivo.pdf` não vira link.
2. **Segurança do destino** — o link é de terceiro e pode ser malicioso. O
   `noopener noreferrer` impede o site de destino mexer na aba de origem e de ver
   o referrer. Não cabe ao CRM julgar o conteúdo do destino.
3. **Regressão visual nas bolhas** — o componente novo precisa manter as classes
   de cada superfície (uma usa `pre-wrap`, outra `pre-line`). Mitigação: a classe
   entra por prop, o componente não impõe estilo.

## Valor
Quem atende para de copiar e colar link à mão, em todas as conversas do CRM —
lead, corretor e portal do cliente. É atrito diário, pequeno e constante, do tipo
que ninguém abre ticket para reclamar.

## Definição de pronto
AC1–AC9 verdes, gate do @qa, PR pelo @devops, deploy, e verificação na conversa
real onde o Marcos viu o link: ele clica e abre.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Levantamento dos 6 pontos de
  renderização feito antes de especificar — inclusive os **dois** pontos dentro do
  `conversation-thread.tsx`, que passariam batido numa leitura rápida.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Duas ressalvas: (a) o AC2
  é de segurança, testar payload de XSS explícito; (b) **contar** os pontos depois
  de implementar, porque o modo de falha é sobrar um.
- 31/07/2026 — @dev: `tokenizeLinks` (pura) + `MessageText` + 8 pontos + 19 testes.
  🔥 A ressalva (b) pegou erro real: a story dizia "6 pontos em 5 arquivos" e são
  **8 em 6** — dois arquivos têm dois pontos cada. Corrigido acima.
- 31/07/2026 — @qa: gate **PASS**. Segurança testada com payload real (incl.
  `javascript:` disfarçado em query string http). 8/8 pontos conferidos um a um.
