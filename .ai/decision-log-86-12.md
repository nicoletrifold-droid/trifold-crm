# Decision Log — Story 86-12 (Pixel Meta + CAPI na landing do Yarden)

**Executor:** @dev (Dex) · **Modo:** autônomo (YOLO) · **Data:** 2026-08-26
**Escopo executado:** T1–T11. T12/T13 são de @devops e não foram tocadas.
**Commit base:** `60575eee` (`docs(story): 86-12 Draft → Ready`)

Só decisões **não cobertas literalmente pela story** estão aqui. Onde a story
prescreveu o valor/desenho, não há decisão a registrar.

---

## D1 — `hasOwnProperty` em vez de `slug in LANDING_CONFIGS` (AC5)

**Decisão:** `resolveLandingConfig` valida com
`Object.prototype.hasOwnProperty.call(LANDING_CONFIGS, slug)`, não com o
`slug in LANDING_CONFIGS` do esboço da story.

**Por quê:** o operador `in` também encontra propriedades herdadas de
`Object.prototype`. `resolveLandingConfig("constructor")` cairia no ramo "slug
conhecido" e devolveria `LANDING_CONFIGS["constructor"]` — a **função**
`Object`, não uma config. `landingConfig.contentCategory` viria `undefined` e o
evento CAPI sairia sem categoria, silenciosamente. O mesmo vale para
`"toString"`, `"hasOwnProperty"`, `"__proto__"`. O corpo que traz o slug é JSON
externo, então isso é alcançável por qualquer chamador com o token.

**Alternativas descartadas:** (a) manter `in` — aceita entrada alcançável que
produz payload inválido; (b) `Object.keys(...).includes(slug)` — equivalente,
mas aloca a cada chamada.

**Prova:** teste `"chave herdada do Object.prototype não vaza como config"` em
`packages/web/src/lib/meta/landing-page-tracking.test.ts`. Ele falha com `in`.

---

## D2 — `montarTracking` do Yarden nunca devolve `null` (AC8)

**Decisão:** em `landing-pages/yarden/api/lead.js`, `payload.tracking` é sempre
atribuído; o `if (tracking) payload.tracking = tracking` do proxy do Vind
Residence não foi clonado.

**Por quê:** o AC8 manda `landing: "yarden"` ser campo **fixo** do
`payload.tracking`. Com um campo sempre presente, o objeto nunca é vazio e o
`if` seria código morto — pior, um `if` que sugere um caminho "sem tracking" que
não existe mais. A divergência está comentada no arquivo para não parecer drift
acidental do clone.

**Impacto verificado:** nenhum novo. Na prática o proxy do Vind Residence
também sempre anexa `client_ip`/`client_ua`, então `tracking` já era sempre
presente lá (é o defeito `86.11-QA-006`, herdado conscientemente pelo AC10).
Sem `event_id`, o CRM continua não disparando evento nenhum.

---

## D3 — `connect-src` dos blocos novos de CSP aponta para `yarden.vercel.app` (AC9)

**Decisão:** os 3 blocos novos de `headers` em
`landing-pages/trifold-design-system/vercel.json` trocam
`connect-src ... https://vind-residence.vercel.app` por
`https://yarden.vercel.app`. Não é uma cópia literal dos blocos do Vind.

**Por quê:** o `index.html` do Yarden chama `https://yarden.vercel.app/api/lead`
e `/api/track` (URLs absolutas, exigidas pelo AC12 porque a página é servida via
proxy sob `trifold.eng.br/yarden/`). Herdar o `connect-src` do Vind bloquearia
os dois `fetch` — o AC9 deixava isso condicional ("se o Pixel hospedar no
domínio novo do Yarden algo além de `trifold.eng.br`"), e a condição se
verifica.

**Nota:** os blocos do Vind Residence **não** foram alterados (nem para
acrescentar `yarden.vercel.app`) — a landing dele não chama esse domínio.

---

## D4 — Sem WhatsApp flutuante e sem link de política de privacidade (AC12)

**Decisão:** o placeholder não clona o `CONFIG.whatsapp`/botão flutuante nem o
`<a href="#">Políticas de privacidade</a>` do Vind Residence. O checkbox de
aceite existe (é obrigatório pelo AC12), mas como texto sem link.

**Por quê:** Artigo IV (No Invention). Não existe número de WhatsApp confirmado
para o Yarden nem URL de política de privacidade fornecida. Um número clonado do
Vind Residence mandaria lead para a conversa do empreendimento errado; um
`href="#"` é um link morto que a auditoria de conteúdo teria que caçar depois. A
mensagem de erro do formulário também deixou de citar WhatsApp por consequência.

**Follow-up para quem integrar o conteúdo:** registrado no `README.md` do
projeto.

---

## D5 — Nenhum `assets/` e nenhuma referência a arquivo de imagem (AC12)

**Decisão:** o `index.html` não referencia `assets/favicon.png`,
`assets/logo-branco.png` nem nenhum arquivo do diretório `assets/` do Vind
Residence, e o diretório não foi criado.

**Por quê:** as imagens são dependência externa. Uma referência clonada daria
404 em produção (console sujo, favicon quebrado) e um `assets/` copiado do Vind
publicaria renders do empreendimento errado numa landing do Yarden. Há teste
estático travando isso (`não referencia assets que ainda não existem`).

---

## D6 — Teste novo `tracking-browser.test.ts`, além do `api-proxy.test.ts` pedido

**Decisão:** criado `landing-pages/yarden/tracking-browser.test.ts`, que extrai
os dois `<script>` inline do `index.html` e os executa com globais falsos
(`window`, `document`, `fetch`, `setInterval` passados como parâmetros de um
`new Function`, sem jsdom — que este projeto não usa).

**Por quê:** a seção Testing da story deixava `index.html` como verificação
**manual**. Mas as três classes de erro mais prováveis num arquivo clonado de
outra landing são exatamente as que a inspeção manual não pega de forma
confiável, e todas são silenciosas em produção:

1. o id do Pixel divergindo entre `fbq('init')` e o `<noscript>` — o próprio @po
   levantou isso no AC1, e são dois lugares num arquivo de 400 linhas;
2. `TRACK_ENDPOINT`/`CONFIG.leadEndpoint` apontando para `vind-residence.vercel.app`;
3. o `console.log('[lead capturado]', data)` (`86.11-QA-005`) voltando num merge.

O mesmo harness cobre de forma automatizada os itens de AC11 que antes só
existiriam como teste manual (`localStorage` bloqueado, `fbq` ausente ou
lançando, `fetch` rejeitado, `_fbp` que nunca nasce).

**Alternativa descartada:** deixar tudo manual, como na 86-11. Rejeitada porque
esta story é a **segunda** cópia do padrão — a partir daqui o modo de falha
dominante é o clone incompleto, e ele não tem sintoma visível.

---

## D7 — `<meta name="robots" content="noindex, nofollow">` no placeholder

**Decisão:** o `index.html` do placeholder pede para não ser indexado.

**Por quê:** a URL `trifold.eng.br/yarden/` hoje é 404. Publicar no lugar dela
uma página sem conteúdo e deixá-la indexar cria um resultado de busca ruim para o
nome do empreendimento, difícil de reverter depois. Não afeta tráfego pago nem os
eventos do Pixel/CAPI (que é o objeto desta story).

**Risco introduzido e como foi mitigado:** se ninguém remover a tag quando o
conteúdo definitivo chegar, a landing final fica fora da busca orgânica
silenciosamente. Está como **passo 0** do checklist "Integrar o conteúdo
definitivo" no `README.md` do projeto, antes de qualquer outro passo.

---

## D8 — Comentários das rotas compartilhadas atualizados de "Vind Residence" para "landings standalone"

**Decisão:** além da troca de import exigida por AC6/AC7, os cabeçalhos de
`landing-page/route.ts` e `landing-page/track/route.ts` (e o docblock de
`landing-page-tracking.ts`) deixaram de dizer que servem "a landing do Vind
Residence".

**Por quê:** depois do AC5 a afirmação é falsa. Um comentário que promete uma
garantia que o código não tem mais é pior que nenhum comentário — o próximo
leitor conclui que a rota é single-landing e o discriminador é decorativo.
Nenhuma linha de lógica foi tocada além do que os ACs pedem.
