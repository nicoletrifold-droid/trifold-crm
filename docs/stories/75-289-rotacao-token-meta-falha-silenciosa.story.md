# Story 75-289 — Token da Meta expira e o CRM falha calado (rotação + alerta)

**Story ID:** 75-289
**Epic:** 75 (CRM Trifold) · **Status:** Draft · **Estimativa:** M (~5 pts)

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
| Lead de formulário do Meta | `META_PAGE_ACCESS_TOKEN` (Vercel) | lead criado **sem nome, sem telefone, sem e-mail** |
| Sync de anúncios / insights | `meta_ad_accounts.access_token` | `status='error'`, sync parado |

**O único sintoma que chegou ao humano foi o erro do menu.** Todo o resto falhou em silêncio.

### As três causas-raiz

1. **Credencial espalhada em 4 lugares** (2 tabelas + N envs do Vercel), sem dono e sem
   validade rastreada. Trocar o token é um ritual manual de arqueologia.
2. **Falha de envio não alerta ninguém.** `dispatch-broker-message` grava
   `metadata.send_error = 'HTTP_401'` na mensagem e devolve sucesso à UI: o corretor vê o balão
   na tela e presume entregue. No incidente, 2 mensagens sumiram assim (Thielly→Cristiane,
   Odair→lead 5544 98607826) e só apareceram numa query manual.
3. **Lead do Meta incompleto é irrecuperável.** O webhook grava
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

- [ ] **AC1 — `META_PAGE_ACCESS_TOKEN` rotacionado em produção.** Vercel (Production) recebe o
      System User token vigente + redeploy para aplicar. Validação: um lead de formulário novo
      entra **com nome e telefone** (ou `POST` no webhook de teste seguido de conferência do
      `metadata.incomplete = false`).
- [ ] **AC2 — falha de envio deixa de ser silenciosa.** Quando o envio ao Graph falha, a UI do
      corretor **não** mostra a mensagem como entregue: balão marcado como "não entregue" com
      ação de reenviar. O `send_error` já gravado passa a ser lido pela tela (sem coluna nova).
- [ ] **AC3 — credencial morta alerta o gestor.** `HTTP_401`/`code 190` no Graph gera **uma**
      notificação para admin/supervisor (coalescing por dia, não uma por mensagem), com texto
      dizendo qual credencial e onde trocar. Fonte: o mesmo ponto que hoje grava `send_error`.
- [ ] **AC4 — lead do Meta incompleto volta a ser recuperável.** Evento cuja busca na Graph
      voltou sem contato **não** é marcado `processed = true` (ou é marcado com
      `processing_error` que o retry reconhece), de modo que `meta-leads-retry` o reprocesse
      dentro da janela de `MAX_ATTEMPTS`.
- [ ] **AC5 — `process-lead` não morre com 2 contas ativas.** A busca de `meta_ad_accounts`
      ganha ordenação estável + `.limit(1)` antes do `maybeSingle()`; teste cobre o caso de
      duas linhas `active` na mesma org.
- [ ] **AC6 — a tela de configuração mostra a conta que sincroniza.** `GET
      /api/meta-ads/account` prioriza a `active` em vez da mais recente.
- [ ] **AC7 — validade do token visível.** A tela de integrações mostra o vencimento do token
      (via `debug_token`, campo `expires_at`; "nunca expira" quando ausente), para que a
      renovação deixe de ser descoberta pelo estrago.
- [ ] **AC8 — testes.** Cobertura de: envio 401 → mensagem marcada não-entregue + 1
      notificação; evento leadgen sem contato → elegível ao retry; 2 contas `active` → token
      resolvido.

---

## Fora de escopo

- Unificar as 4 fontes de credencial numa só (vale uma story própria; aqui só se torna
  **observável**).
- Emitir o token permanente (feito fora do código, no Business Manager).
- Reenvio das 2 mensagens perdidas no incidente (feito à mão pelos corretores).

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
  `meta_ad_accounts`. Não há mais data-bomba. O AC7 continua valendo: a tela deve **mostrar**
  "nunca expira" em vez de o time descobrir a validade pelo estrago.
- ⚠️ **`AC1` tem um detalhe:** o system user token **não** resolve `resolveFormName`
  (`GET /{form_id}?fields=name` → 400, pede `pages_read_engagement`), que hoje roda com o
  `META_PAGE_ACCESS_TOKEN` de Página. Leadgen, `resolveCampaignName`, criativo (Epic 50) e
  insights funcionam todos com ele — só o *fallback* de `utm_campaign` (usado quando a campanha
  não tem nome) degrada. Duas saídas: aceitar a degradação, ou regerar o token incluindo o
  escopo `pages_read_engagement`. Decidir no @po.
