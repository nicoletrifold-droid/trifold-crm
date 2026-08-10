# Story 75-289 — Token da Meta expira e o CRM falha calado (rotação + alerta)

**Story ID:** 75-289
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M/L (~8 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix + hardening (nasceu do incidente de 10/08/2026)

---

## Story

Como **gestor comercial**, quero que o CRM **grite** quando a credencial da Meta morrer, em vez
de os corretores mandarem mensagem que não chega e os leads entrarem sem telefone — e quero que
a troca do token seja um lugar só, não uma caça em quatro esconderijos.

---

## Context — o incidente de 10/08/2026

Marketing trocou a senha da conta Meta. A Meta invalidou a sessão do token com
`code 190 / subcode 460` ("the session has been invalidated because the user changed their
password"). O token que morreu era um **token de usuário pessoal** — por construção ele morre
sempre que aquela pessoa troca senha.

Janela morta: **11:25 → 14:23 BRT** (~3h), fechada com a troca manual do token em prod.

### O que quebrou, e como ninguém viu

| Consumidor | Onde mora a credencial | Sintoma |
|---|---|---|
| Menu "Iniciar atendimento" | `whatsapp_config.access_token` | erro visível na tela (o único sintoma percebido) |
| Chat do corretor / Nicole / follow-up / lembretes | `whatsapp_config.access_token` | **mensagem aparece enviada na tela e não chega ao lead** |
| **Áudio / imagem / documento recebidos do lead** | `whatsapp_config.access_token` | **mídia nunca baixa e é perdida para sempre** (áudio não transcreve → Nicole e corretor ficam cegos) |
| Lead de formulário do Meta | `META_PAGE_ACCESS_TOKEN` (Vercel) | lead criado **sem nome, sem telefone, sem e-mail** |
| Sync de anúncios / insights | `meta_ad_accounts.access_token` | `status='error'`, sync parado |

**O único sintoma que chegou ao humano foi o erro do menu.** Todo o resto falhou em silêncio.

### As quatro causas-raiz

1. **Credencial espalhada em 4 lugares** (2 tabelas + N envs do Vercel), sem dono e sem
   validade rastreada. Trocar o token é um ritual manual de arqueologia.
2. **Falha de envio não alerta ninguém.** `dispatch-broker-message` grava
   `metadata.send_error = 'HTTP_401'` na mensagem e devolve sucesso à UI: o corretor vê o balão
   na tela e presume entregue. No incidente, 2 mensagens sumiram assim (Thielly→Cristiane,
   Odair→lead 5544 98607826) e só apareceram numa query manual.
3. **Mídia recebida é irrecuperável.** O webhook do WhatsApp baixa áudio/imagem/documento com
   `config.access_token` dentro de `if (mediaRes.ok)` **sem `else`** — token morto = mídia
   silenciosamente perdida. Pior: o `media_id` (`msg.audio.id`) **nunca é persistido** (o
   `metadata` guarda só `whatsapp_message_id` + `media_type`), e o webhook do WhatsApp **não
   grava em `webhook_logs`** como o do meta_ads. Ou seja: o payload some, e a Meta guarda a
   mídia ~30 dias mas **não há como pedi-la de volta** sem o media id. No incidente, 2 mensagens
   de voz de um lead em etapa SDR (5544 99892607, corretora Thielly) foram perdidas
   definitivamente — e eram a **resposta dele à mensagem de abertura de 24h**.

4. **Lead do Meta incompleto é irrecuperável.** O webhook grava
   `webhook_logs.processed = true` mesmo quando a busca na Graph API volta vazia; o cron
   `meta-leads-retry` só varre `processed = false`, então **nunca** volta nesse evento. O lead
   fica órfão para sempre (recuperado à mão no incidente).

### Bug adjacente encontrado no mesmo caminho

`packages/web/src/lib/meta/process-lead.ts:481-486` — a busca da conta de anúncio faz
`.eq('status','active').maybeSingle()` **sem `.limit(1)`**. Com duas contas `active` na mesma
org o PostgREST devolve PGRST116, `data` vem `null`, e o `if (!account?.access_token) return`
mata a atribuição de criativo **calada** (mesma classe do PGRST116 da 75-282). Hoje só a
`TRIFOLD - VIND` está `active` (a `INSTITUCIONAL`, sem gasto, foi para `disconnected`) — o bug
está dormente, não corrigido.

E `GET /api/meta-ads/account` mostra a conta **mais recentemente criada** (`order created_at
desc limit 1`), não a `active` — a tela de configuração exibe a INSTITUCIONAL/`disconnected`
enquanto quem sincroniza é a VIND.

---

## Acceptance Criteria

- [x] **AC1 — `META_PAGE_ACCESS_TOKEN` rotacionado em produção.** ✅ **FEITO 10/08 antecipado
      fora do ciclo** (decisão Marcos): env `9TBM9A9WalW2cN3b` (production, `type=sensitive`)
      atualizada via `scripts/vercel-env-set.sh` (PATCH, nunca `env add` via pipe) +
      `vercel redeploy` → `trifold-630nguvb9` READY, aliased em `crm.trifold.eng.br`.
      Gravação confirmada pelo `updatedAt` da API (17/06 → 10/08 15:06), **não** pelo
      `env pull` — variável `sensitive` devolve string vazia no pull mesmo quando correta.
      ⏳ Confirmação comportamental (próximo lead de formulário entrar com nome/telefone)
      pendente no fechamento da story.
- [x] **AC2 — falha de envio deixa de ser silenciosa.** Quando o envio ao Graph falha, a UI do
      corretor **não** mostra a mensagem como entregue: balão marcado como "não entregue" com
      ação de reenviar. O `send_error` já gravado passa a ser lido pela tela (sem coluna nova).
- [x] **AC3 — credencial morta alerta o gestor.** `HTTP_401`/`code 190` no Graph gera **uma**
      notificação para admin/supervisor (coalescing por dia, não uma por mensagem), com texto
      dizendo qual credencial e onde trocar. Fonte: o mesmo ponto que hoje grava `send_error`.
- [x] **AC4 — mídia recebida deixa de ser perdida.** O `media_id` do payload passa a ser
      persistido em `messages.metadata` (áudio, imagem e documento). Falha no download marca a
      bolha como "mídia não baixada" com ação de **tentar de novo** (a Meta retém ~30 dias), em
      vez de virar `media_url = null` calado. Teste: download 401 → media_id gravado + retry
      posterior baixa e transcreve.
- [x] **AC5 — lead do Meta incompleto volta a ser recuperável.** Evento cuja busca na Graph
      voltou sem contato **não** é marcado `processed = true` (ou é marcado com
      `processing_error` que o retry reconhece), de modo que `meta-leads-retry` o reprocesse
      dentro da janela de `MAX_ATTEMPTS`.
- [x] **AC6 — `process-lead` não morre com 2 contas ativas.** A busca de `meta_ad_accounts`
      ganha ordenação estável + `.limit(1)` antes do `maybeSingle()`; teste cobre o caso de
      duas linhas `active` na mesma org.
- [x] **AC7 — a tela de configuração mostra a conta que sincroniza.** `GET
      /api/meta-ads/account` prioriza a `active` em vez da mais recente.
- [x] **AC8 — validade do token visível.** A tela de integrações mostra o vencimento do token
      (via `debug_token`, campo `expires_at`; "nunca expira" quando ausente), para que a
      renovação deixe de ser descoberta pelo estrago.
- [x] **AC9 — testes.** Cobertura de: envio 401 → mensagem marcada não-entregue + 1
      notificação; evento leadgen sem contato → elegível ao retry; 2 contas `active` → token
      resolvido.

---

## Valor de negócio

O incidente custou, em ~3h e **sem ninguém perceber**: 2 mensagens de corretor que o lead nunca
recebeu (uma delas em negociação de valor), 2 mensagens de voz perdidas para sempre — que eram a
**resposta de um lead em etapa SDR à mensagem de abertura de 24h** —, 1 lead pago de formulário
sem nenhum contato, e o sync de anúncios parado. O único sintoma que chegou a um humano foi um
erro de tela num botão.

O valor aqui não é "trocar token": é **deixar de descobrir queda de credencial pelo prejuízo**.
Enquanto o CRM falha calado, cada rotação de credencial futura repete a conta acima — e a
rotação vai acontecer de novo (troca de senha, saída de pessoa, revisão de app pela Meta).

---

## Dependências

- **Nenhuma story bloqueante.** AC1 já está cumprido (token permanente emitido e aplicado).
- **Credencial:** depende do System User token permanente (`expires_at: 0`) já vigente — não
  exige nova ida ao Business Manager, **exceto** se o @dev optar pelo `pages_read_engagement`
  (ver Riscos).
- **Toca código de:** `webhook/whatsapp/route.ts` (mídia), `lib/broker/dispatch-broker-message.ts`
  + UI do chat (AC2), `lib/notificacoes.ts` (AC3), `lib/meta/process-lead.ts` (AC5/AC6),
  `api/meta-ads/account/route.ts` (AC7), tela de integrações (AC8).
- **Convenções a respeitar:** notificação com coalescing (ver `project-notificacoes-portal`);
  dedup de notificação **deve** incluir `userId`; nenhum token em log.

---

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| **AC2 toca o caminho de envio do corretor** — o mais quente do CRM | Regressão aqui cala o chat inteiro | Não alterar a ordem gravar↔enviar; só **ler** o `send_error` já persistido na UI. Teste de não-regressão no envio OK. |
| **AC3 pode virar spam** — um 401 gera N mensagens falhando | Gestor recebe dezenas de notificações e passa a ignorar | Coalescing por dia **por credencial**, não por mensagem (AC3 já exige) |
| **AC5 muda `processed`** — se marcar `false` errado, o retry reprocessa lead bom | Lead duplicado ou automação disparada semanas depois | A política de idade da 75-215 já existe (`<6h` completo, `≥6h` sem automations) — **reusar**, não reinventar |
| **AC6 é bug dormente** — hoje só 1 conta está `active` | Corrigir sem teste dá falsa confiança | Teste **obrigatório** com 2 linhas `active` na mesma org |
| `pages_read_engagement` exigiria **regerar o token** | Nova rotação = novo risco de queda | **Decisão @po: NÃO regerar** (ver abaixo) |

---

## Decisões do @po

**`resolveFormName` — aceitar a degradação, NÃO regerar o token.** O fallback de nome de
formulário só entra quando a campanha não tem nome, e na prática ela tem (`"[LEADS. 05.07.26
[VIND]"` resolveu 200 no teste). O ganho é marginal e o custo é uma nova rotação de credencial
— exatamente a operação que causou este incidente. **Revisitar se** aparecerem leads com
`utm_campaign` nulo no analytics; aí sim vale o escopo extra.

---

## Definition of Done

- Os 9 ACs marcados, com o AC1 fechado **pela confirmação comportamental** (lead de formulário
  entrando com nome e telefone), não só pela gravação da env.
- `vitest` + `typecheck` + `lint` verdes.
- Gate do @qa em PASS ou CONCERNS documentado.
- Verificado **rodando em prod** (não só em teste): um envio que falha aparece como não-entregue
  na tela do corretor, e uma credencial morta gera exatamente 1 notificação.
- Nenhum token em código, teste, log ou neste arquivo.

---

## Fora de escopo

- Unificar as 4 fontes de credencial numa só (vale uma story própria; aqui só se torna
  **observável**).
- Emitir o token permanente (feito fora do código, no Business Manager).
- Reenvio das 2 mensagens perdidas no incidente (feito à mão pelos corretores) e o pedido ao
  lead 5544 99892607 para reenviar os 2 áudios (a janela de 24h dele fecha ~12:09 de 11/08).

---

## Notas de execução

- ⚠️ **Nenhum token neste arquivo, em teste ou em log.** A credencial vive em
  `whatsapp_config` / `meta_ad_accounts` / env do Vercel. Log e notificação citam **onde**
  trocar, nunca o valor (nem prefixo).
- Já aplicado em prod durante o incidente (fora desta story, sem migration):
  `whatsapp_config.access_token` e `meta_ad_accounts.access_token` (VIND `active`,
  INSTITUCIONAL `disconnected`); lead órfão `bce83eee-b1c4-4d1c-8eb0-8f55a48b78cd` preenchido.
- ✅ O token vigente já é **System User permanente** (expiração "Nunca" → `debug_token` devolve
  `expires_at: 0`), emitido no mesmo dia do incidente e aplicado em `whatsapp_config` + nas 2
  `meta_ad_accounts`. Não há mais data-bomba. O AC8 continua valendo: a tela deve **mostrar**
  "nunca expira" em vez de o time descobrir a validade pelo estrago.
- ⚠️ **`AC1` tem um detalhe:** o system user token **não** resolve `resolveFormName`
  (`GET /{form_id}?fields=name` → 400, pede `pages_read_engagement`), que hoje roda com o
  `META_PAGE_ACCESS_TOKEN` de Página. Leadgen, `resolveCampaignName`, criativo (Epic 50) e
  insights funcionam todos com ele — só o *fallback* de `utm_campaign` (usado quando a campanha
  não tem nome) degrada. **Resolvido em "Decisões do @po": aceitar a degradação.**

---

## File List

**Novos**
- `packages/web/src/lib/meta/alert-credencial-morta.ts` (AC3) + `.test.ts`
- `packages/web/src/lib/meta/token-validity.ts` (AC8) + `.test.ts`
- `packages/web/src/app/broker/leads/[id]/_components/delivery-status.ts` (AC2) + `.test.ts`
- `packages/web/src/app/api/leads/[id]/messages/[messageId]/resend/route.ts` (AC2)

**Modificados**
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (AC4 + AC3) — persiste `media_id`;
  `mergeMessageMetadata` (jsonb não mescla); `markMediaDownloadFailed` nos 3 caminhos
- `packages/web/src/lib/meta/process-lead.ts` (AC5 + AC6)
- `packages/web/src/app/api/cron/meta-leads-retry/route.ts` (AC5)
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` (AC3)
- `packages/web/src/app/api/meta-ads/account/route.ts` (AC7)
- `packages/web/src/app/dashboard/configuracoes/integracoes/page.tsx` (AC8)
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` (AC2)
- `packages/web/src/lib/meta/process-lead.test.ts`,
  `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` (AC9)

**Sem migration.** O coalescing reusa `logEventOnce` + o índice único da migration 218
(Story 87-6); o contador de tentativas continua vivendo em `webhook_logs.processing_error`.

### Notas do @dev

- **`vitest` 168 arquivos / 2110 testes verdes; `tsc --noEmit` limpo; `eslint` 0 erros**
  (24 warnings, todos pré-existentes ou do mesmo padrão `_params` já aceito em
  `logger.test.ts`).
- **Desvio consciente do texto do AC5:** o gatilho do retry é `field_data` **vazio**, não
  `incomplete`. `incomplete` também é true quando o formulário veio com telefone-lixo
  (75-215/75-216) — ali o retry é inútil, a Graph devolveria o mesmo lixo e só queimaria
  tentativas. Os 3 testes daquelas stories provaram isso na prática (quebraram na primeira
  versão).
- **Duas armadilhas encontradas durante a implementação**, ambas cobertas por teste:
  1. Devolver `ok:true` com `processed=false` faria o cron reprocessar o evento **a cada 15min
     para sempre** (ele só conta tentativa no ramo `!ok`). Daí o `ok:false` deliberado.
  2. Tentativas esgotadas precisavam **encerrar** o evento: a query pega os 20 mais antigos, e
     eventos travados passariam a consumir o lote inteiro, bloqueando retries novos.
- **AC8 achou um bug adjacente não previsto:** o card de WhatsApp lia
  `process.env.WHATSAPP_ACCESS_TOKEN`, que **não existe no Vercel** — a tela dizia "Inativo"
  com o WhatsApp funcionando (e diria "Ativo" com a credencial morta). Agora lê
  `whatsapp_config` (a fonte real).
- ⏳ **Pendente para o gate:** verificação com a coisa **rodando em prod** (item do DoD) e a
  confirmação comportamental do AC1 (próximo lead de formulário). Nada disso é coberto por
  teste unitário.

---

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 10/08/2026 | @sm | Story criada a partir do incidente do dia; 3 causas-raiz + bug adjacente. |
| 10/08/2026 | @sm | Token permanente emitido; registrado o gap do `resolveFormName`. |
| 10/08/2026 | @sm | Áudio/imagem/documento recebidos entram na story (novo AC4, ACs renumerados). |
| 10/08/2026 | @po | **Validação 10 pontos: GO condicional (7/10)** → lacunas corrigidas nesta mesma passagem: adicionados Valor de negócio, Dependências, Riscos e Definition of Done; estimativa revista de M (~5) para **M/L (~8)** — 9 ACs cruzam webhook, envio, notificações, 2 rotas e 1 tela; decisão do `pages_read_engagement` tomada (não regerar); **AC1 marcado como feito** (antecipado por decisão do Marcos). Status **Draft → Ready**. |
| 10/08/2026 | @dev | **AC2–AC9 implementados.** 4 arquivos novos + 9 modificados, sem migration. Desvio consciente no AC5 (gatilho = `field_data` vazio, não `incomplete` — telefone-lixo não merece retry). Duas armadilhas corrigidas: `ok:true` com `processed=false` reprocessaria a cada 15min para sempre, e tentativas esgotadas entupiriam o lote de 20 mais antigos. AC8 revelou que o card de WhatsApp lia uma env var inexistente. 2110 testes verdes, typecheck limpo, lint 0 erros. Status **Ready → InReview**. |
