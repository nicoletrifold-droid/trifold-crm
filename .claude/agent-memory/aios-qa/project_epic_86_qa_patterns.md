---
name: epic-86-qa-patterns
description: Epic 86 (Meta Pixel + CAPI) QA — armadilhas recorrentes de tracking que só um QA pega, e o gotcha de rebase do landing-pages/trifold-design-system
metadata:
  type: project
---

Padrões que se repetiram nas stories 86-9 e 86-11 (Pixel + CAPI). Valem para
qualquer story futura de tracking neste repo.

**Why:** as falhas de tracking são silenciosas por natureza — o Events Manager
mostra "sucesso" com o sinal errado dentro. Nenhuma delas quebra teste, lint ou
type-check; só leitura de código pega.

**How to apply:** rodar estes 5 checks em toda story que tocar
`packages/web/src/lib/meta/*`, `packages/shared/src/meta/*` ou
`landing-pages/*/api/*`.

1. **Quem enxerga o IP real?** Quando há proxy servidor-a-servidor no meio
   (landing → `api/lead.js` → CRM), o `x-forwarded-for` que o CRM vê é do
   datacenter Vercel. Ler o código elo por elo, do browser até
   `buildCapiUserData`. Teste bom assere que o IP do proxy **não aparece em canto
   nenhum** do payload nem das escritas no banco — não só que o IP certo está lá.
2. **ADAPT em módulo compartilhado muda a superfície dos OUTROS chamadores.**
   `extrairSinais(request, corpo)` ganhou precedência do corpo sobre headers na
   86-11 (correto lá) e com isso as duas rotas da 86-9 chamadas direto pelo
   browser passaram a aceitar `client_ip` forjado. Interface TypeScript **não**
   filtra chaves em runtime — um `body as CorpoX` não estreita nada. Sempre
   `grep` por todos os chamadores da função adaptada e perguntar "quem controla
   esse corpo?".

   **Padrão de correção que funcionou (86.11-QA-001, RESOLVED 2026-08-25):**
   precedência vira **opt-in com default seguro** — `OpcoesSinais.confiarEmClientIpDoCorpo`,
   lido com `=== true` estrito, e `(flag ? texto(corpo?.x) : undefined) ?? header`.
   Não é *fallback*: sem o opt-in é como se o campo não existisse. As rotas
   antigas **não são editadas** — a proteção passa a ser a ausência de uma linha,
   não a presença de uma, e não há o que alguém apagar sem perceber. Preferir
   sempre esta forma a "estreitar o corpo em cada chamador antigo".

   **E o raio quase sempre é maior do que o evento CAPI:** o mesmo objeto
   `SinaisTracking` é persistido em `leads.metadata.meta_ad` via `comMetaAd`
   (chamado por `formulario/[token]/route.ts` e `webhooks/landing-page/route.ts`)
   e relido DIAS depois pelo cron do evento "Visitou" (86-2/86-4). Um sinal
   forjado sobrevive ao request que o originou. Ao auditar qualquer coisa que
   monte `sinais`, grepar `comMetaAd` além de `buildCapiUserData`. **Correção-padrão aceita (86-11 v1.1, PASS):** tornar a
   precedência OPT-IN (`OpcoesSinais.confiarEmClientIpDoCorpo`, default `false`) e
   fazer dela um opt-in *verdadeiro* — sem o flag o corpo é `undefined`, NÃO
   fallback. Os chamadores confiáveis (com proxy no meio) passam `true`; os
   públicos não são editados (a proteção é o default, não uma linha removível). Ao
   re-verificar, confirmar no diff real que a leitura é
   `(flag ? texto(corpo?.x) : undefined) ?? fonteSegura` e que os testes forjam o
   valor no corpo e asserem que ele "não aparece em canto nenhum" da CAPI.
3. **Hashing (regra fixa do Meta):** `em`/`ph`/`fn`/`ln`/`external_id`/`st`
   sempre SHA-256 hex; `fbc`/`fbp`/`client_ip_address`/`client_user_agent`
   sempre TEXTO PURO. Hashear os últimos quebra o match sem erro nenhum.
4. **PII em `webhook_logs.payload` e `leads.metadata.raw_fields`:** os dois
   persistem o mapa `fields` inteiro. A proteção é estrutural —
   `flattenIntoFields` (`landing-page/route.ts`) descarta objetos aninhados, e
   por isso `tracking` nunca chega lá. Existe teste que quebra se alguém
   "consertar" o flatten. Nunca aprovar uma mudança nesse flatten sem revisar as
   duas tabelas.
5. **Dedup:** o Meta deduplica pelo par `event_name` + `event_id`. Ids diferentes
   entre browser e servidor = contagem inflada, pior que evento ausente. Conferir
   evento por evento numa tabela, não no agregado.

**Gotcha de repo (mordeu na 86-11):** `landing-pages/trifold-design-system/`
deixou de ser untracked — PR #501 (merged 2026-08-24) versionou seu `vercel.json`
(onde vive a CSP de `trifold.eng.br/vindresidence/`). Stories escritas antes disso
afirmam que é "ponto cego de auditoria"; não é mais. Se o working tree tiver esse
arquivo como untracked, um `git pull` aborta com "untracked working tree file
would be overwritten" e a resolução preguiçosa (`checkout -f`) parece descartar a
mudança de CSP. Sempre `git fetch` + comparar com `origin/main` antes de aceitar
a "Convenção de deploy" escrita numa story.

Ver também [[project_epic_52_qa_patterns]].
