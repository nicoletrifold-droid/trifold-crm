# Story 75-220 — Módulo Campanhas / aba Agente: botão "Gerar arte" via Canva (conexão OAuth + MCP connector da Claude API)

**Status:** Blocked
**Tipo:** Feature (integração externa + IA)
**Epic:** Agente de Marketing (Fase 2 — módulo no CRM)
**Complexidade:** L (integração OAuth nova + MCP connector; spike bloqueante)
**Depende de:** Story 75-219 (LIVE em prod — PR #290: aba Agente, tabela `marketing_posts`, rotas `/api/marketing-posts`)

## Contexto

A aba **Agente** (75-219) gera a copy dos posts por IA, mas a arte hoje é o campo
manual `arte_url` — um link do Canva colado à mão, gerado numa sessão do Claude
Code com o Marcos (Fase 1 do agente de marketing roda fora do CRM). Decisão do
Marcos (27/07): **"Opção A — deixar pronto; se precisar evoluímos"** — o time
precisa gerar a arte DE DENTRO do CRM, sem terminal, para demonstrar e usar de
verdade.

O caminho técnico é o mesmo já validado na Fase 1: o **servidor MCP oficial do
Canva** (`https://mcp.canva.com/mcp`) gera designs por prompt (`generate-design`
→ candidatas efêmeras → `create-design-from-candidate` salva na conta) e aceita
`brand_kit_id` — a conta "Trifold Engenheira" tem Canva **Pro** com brand kits
por empreendimento (Vind Residence, Yarden, SOLUN + institucional). Só que em
vez do Claude Code local, quem chama o MCP é a **Claude API via MCP connector**
(beta `mcp-client-2025-11-20`): a rota do CRM chama o modelo, o modelo usa as
tools do Canva server-side, e a URL do design volta para `arte_url`.

⚠️ **FORA do escopo (gotcha conhecido):** autofill/brand templates via Canva
Connect API exigem Canva **ENTERPRISE** ([[project-agente-marketing]]) — esta
story usa exclusivamente o MCP (generate-design), que funciona no plano Pro.

## Arquitetura

1. **Conexão Canva org-level (uma vez)** — espelha a integração Google já
   existente: tokens OAuth em coluna JSONB de `organizations` (padrão
   `google_oauth_tokens`, mig 013), card de conexão em **Configurações ›
   Integrações** (padrão `GoogleIntegrationCard`), rotas
   `api/auth/canva/{route,callback,disconnect}` autenticadas (padrão
   `api/auth/google/*`). Diferença crítica: o Canva MCP usa **OAuth 2.0 com
   dynamic client registration (DCR/RFC 7591) + PKCE + discovery via
   /.well-known** — não há client_id/secret pré-cadastrados como no Google.
   Por isso a story COMEÇA com um spike de validação (Task 1, bloqueante).
2. **Geração de arte on-demand** — rota
   `POST /api/marketing-posts/[id]/generate-art` gateada pelo
   `marketingGuard()` existente (admin/supervisor + admin client), que monta o
   prompt com copy/empreendimento/canal do post e chama a Claude API com o MCP
   connector apontando para o Canva com o token vigente do banco. Flow puro em
   `packages/ai` no padrão dos flows existentes (rota junta contexto → flow
   chama o modelo → parse estrito → rota persiste).
3. **Fail-open sempre** — erro do OAuth, do modelo ou do Canva fica contido no
   botão: mensagem amigável + retry; o campo manual `arte_url` continua
   existindo como fallback; a fila de aprovação (75-219) não depende de nada
   disto.

## Acceptance Criteria

1. **AC1 — Spike de validação OAuth+MCP (BLOQUEANTE, primeira task).** Antes de
   qualquer implementação definitiva, o fluxo completo é validado em dev:
   (a) discovery OAuth no host `mcp.canva.com` (protected resource metadata →
   authorization server metadata), (b) dynamic client registration, (c)
   authorization code + PKCE com redirect para uma URL do CRM, (d) troca de
   code por access_token + refresh_token, (e) refresh, e (f) o access_token
   obtido funciona numa chamada real da Claude API com MCP connector
   (ex.: tool `list-brand-kits` retorna os kits da conta). Inclui validar a
   versão do SDK `@anthropic-ai/sdk` (ver Dev Notes — a versão do repo é
   anterior ao beta `mcp-client-2025-11-20`). **Se qualquer etapa falhar de
   forma não contornável dentro do desenho desta story, a story PARA: status
   → Blocked, resultado documentado no Dev Agent Record e reporte ao
   @po/Marcos. PARAR ≠ contornar: as alternativas conhecidas (token colado
   manualmente no banco, render via Templated.io/Bannerbear ou similares)
   NÃO estão autorizadas nesta story e não devem ser implementadas.**
2. **AC2 — Conexão Canva org-level em Configurações › Integrações.** Card
   "Canva" visível na página de Integrações com botão "Conectar Canva" →
   fluxo OAuth → tokens (access + refresh + expiry + client_id do DCR)
   armazenados em `organizations` no banco — **NUNCA no cliente/bundle**.
   Status visível: **Conectado (conta X)** / **Desconectado**. Botão
   "Desconectar" apaga os tokens. Conectar/desconectar restrito a **admin**
   (mesmo gate das rotas `api/auth/google/*`).
3. **AC3 — Refresh automático server-side.** Toda chamada que usa o token passa
   por um helper que renova via refresh_token quando expirado/expirando e
   persiste os tokens novos. Token expirado **sem** refresh possível → status
   vira Desconectado + aviso na UI (card e aba Agente); nada disso quebra a
   fila existente nem qualquer outra tela.
4. **AC4 — Botão "Gerar arte" nos cards da fila.** Cada card de post com
   `status` `sugerido` ou `aprovado` e **sem** `arte_url` mostra o botão
   "Gerar arte", que chama `POST /api/marketing-posts/[id]/generate-art`
   (gateada admin/supervisor server-side, como as demais rotas de
   `marketing_posts`). A rota:
   - chama a Claude API com MCP connector (beta `mcp-client-2025-11-20`):
     `mcp_servers=[{type:"url", url:"https://mcp.canva.com/mcp", name:"canva",
     authorization_token:<token vigente do banco>}]` +
     `tools=[{type:"mcp_toolset", mcp_server_name:"canva"}]`;
   - o prompt instrui o agente a: usar o brand kit correspondente ao
     empreendimento se existir (`list-brand-kits`; post institucional → kit
     Trifold; sem match → gerar sem kit, não falhar), gerar o design com
     `generate-design` a partir de copy + empreendimento + canal, salvar com
     `create-design-from-candidate` (candidatas expiram!) e retornar a URL
     final do design;
   - persiste a URL em `marketing_posts.arte_url` + metadata (quando/por quem
     gerado, design_id, brand kit usado);
   - **NUNCA muda o `status` do post.**
5. **AC5 — Estados e fail-open.** Canva não conectado → botão desabilitado com
   tooltip "Conecte o Canva em Configurações › Integrações". Geração em
   andamento → loading no card (timeout generoso — geração no Canva pode levar
   ~60s). Erro (OAuth, modelo, Canva, parse) → erro amigável + retry, nada
   persistido; o campo manual `arte_url` (modal de edição) continua como
   fallback SEMPRE. Post com arte já gerada não mostra o botão (link "Ver
   arte" existente permanece).
6. **AC6 — Qualidade.** Testes de unidade (parser do flow, guard de estado da
   rota, helper de refresh), `npm run lint` + `type-check` + suíte completa +
   `build` verdes. **Pós-upgrade do `@anthropic-ai/sdk` (T1): suíte completa
   do monorepo verde + smoke manual em dev de message-review (envio humano),
   behavior-analysis (Análise IA) e marketing-suggestions (Gerar sugestões)
   — nenhum flow existente pode regredir (REGRA: não quebrar o que
   funciona).** Tema da UI segue a convenção `/dashboard` (light/dark com
   `dark:`).

## Tasks

- [ ] **T1 (AC1) — SPIKE bloqueante: validar OAuth DCR + MCP connector.**
      **→ SPIKE EXECUTADO 27/07 — RESULTADO: BLOQUEADO (ver Dev Agent Record).**
  - [x] Descoberta: `GET https://mcp.canva.com/.well-known/oauth-protected-resource`
        (RFC 9728) → `authorization_servers` → metadata do authorization server
        (endpoints de authorize/token/register, PKCE `S256`). ✅ OK (evidências
        no Dev Agent Record).
  - [x] Dynamic client registration (RFC 7591) com `redirect_uris` apontando
        para o CRM (`{NEXT_PUBLIC_APP_URL}/api/auth/canva/callback`) → guardar
        `client_id` (e `client_secret` se emitido). ✅ OK (201; client emitido).
  - [ ] Authorization code + PKCE manual (navegador) → troca por
        access_token/refresh_token → testar refresh. ❌ **BLOQUEADO: o
        `/authorize` do Canva rejeita o redirect do CRM com
        `400 "Invalid redirect URI. It must be from an allowed host."` —
        allowlist de hosts do lado do Canva; entrada só via Waitlist form
        oficial (ver Dev Agent Record).**
  - [ ] Validar SDK: subir `@anthropic-ai/sdk` em `packages/ai` para versão que
        suporte `betas: ["mcp-client-2025-11-20"]` + `mcp_servers` +
        `tools: [{type:"mcp_toolset"}]` (a `^0.52.0` atual é ANTERIOR a esse
        beta). Raio de impacto = TODOS os flows de IA — logo, após o bump:
        (a) **suíte COMPLETA do monorepo** verde (não só `packages/ai`) +
        `type-check`; (b) **smoke manual em dev** dos flows críticos que
        passam pelo `createAnthropicClient()`: enviar mensagem humana pelo
        chat (message-review/revisão ortográfica responde e não bloqueia —
        fail-open), rodar "Análise IA" de um lead (behavior-analysis) e
        "Gerar sugestões" na aba Agente (marketing-suggestions); (c) suíte de
        `packages/ai` cobre o pipeline da Nicole — confirmar verde; smoke da
        Nicole com WhatsApp real fica para o gate do @qa/@devops pós-deploy.
        Breaking change relevante no upgrade → reportar antes de seguir.
  - [ ] Chamada real: `client.beta.messages.create` com o token → pedir
        `list-brand-kits` → confirmar blocos `mcp_tool_use`/`mcp_tool_result`
        no content e kits da conta "Trifold Engenheira".
  - [x] Registrar resultado no story (Dev Agent Record). **Falhou de forma não
        contornável → PARAR (status → Blocked) e reportar ao @po/Marcos.
        NÃO implementar alternativa alguma (token manual, Templated.io,
        Bannerbear etc.) — decisão de rota alternativa é do Marcos.**
        ✅ Registrado; status → Blocked; T2–T6 e upgrade do SDK NÃO executados
        (PARAR ≠ contornar; bump do SDK afeta todos os flows de IA e só serve
        a esta story).
- [ ] **T2 (AC2) — Migration `supabase/migrations/194_canva_mcp_tokens.sql`**
  (⚠️ conferir numeração contra a pasta local — última hoje: 193 — E contra o
  schema remoto de prod por OBJETOS antes de aplicar; `schema_migrations` de
  prod não registra 164+ — lições 75-188/75-219):
  - [ ] `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS canva_mcp_tokens JSONB;`
        (padrão `google_oauth_tokens`, mig 013) + COMMENT documentando o shape
        (ver Dev Notes › Shape dos tokens).
  - [ ] `ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS metadata JSONB;`
        + COMMENT (a mig 193 não criou metadata; necessário p/ auditoria da
        geração — quando/por quem/design_id/brand kit).
- [ ] **T3 (AC2, AC3) — Conexão OAuth: lib + rotas + card.**
  - [ ] `packages/web/src/lib/canva/oauth.ts` (server-only, fetch puro — sem
        dependência nova): discovery com cache em memória, `registerClient()`,
        `buildAuthUrl()` (PKCE S256 + `state`), `exchangeCode()`,
        `refreshIfNeeded()` (margem de 60s, padrão `lib/google.ts`),
        `getValidCanvaToken(admin, orgId)` (lê tokens → refresh se preciso →
        persiste via admin client → devolve access_token; refresh falhou →
        erro tipado `canva_disconnected`).
  - [ ] Rotas (padrão `api/auth/google/*` — `requireAuth` + `requireRole(["admin"])`,
        redirects para `/dashboard/configuracoes/integracoes?canva=...`):
    - `GET /api/auth/canva` — garante client registrado, gera PKCE verifier +
      `state`, guarda ambos em cookie httpOnly (TTL curto), redireciona para o
      authorize do Canva.
    - `GET /api/auth/canva/callback` — valida `state` contra o cookie, troca o
      code (com verifier), persiste tokens em `organizations.canva_mcp_tokens`
      via admin client, redireciona com `?canva=connected` (ou `?canva=error&reason=…`).
    - `POST /api/auth/canva/disconnect` — apaga `canva_mcp_tokens` (NULL).
  - [ ] Card `CanvaIntegrationCard` em
        `dashboard/configuracoes/integracoes/` (padrão `GoogleIntegrationCard`):
        status Conectado (conta X — ver Dev Notes) / Desconectado, botões
        Conectar/Desconectar, aviso quando o último refresh falhou. O server
        component deriva e repassa APENAS booleans/strings de exibição — token
        nunca chega ao client component.
- [ ] **T4 (AC4) — Flow + rota de geração.**
  - [ ] Flow `packages/ai/src/flows/marketing-art.ts` (+ teste): recebe
        `{ post: {copy, canal, empreendimentoNome|null}, canvaToken }`; chama
        `client.beta.messages.create` com MCP connector; prompt com o roteiro
        list-brand-kits → generate-design → create-design-from-candidate →
        terminar com JSON estrito `{ "design_url": string, "design_id": string,
        "brand_kit_id": string|null }`; parser `parseMarketingArt` filtra
        blocos por type (tolerando `thinking`, `mcp_tool_use`,
        `mcp_tool_result`), extrai o JSON do ÚLTIMO bloco text, valida
        `design_url` (https, host canva.com) → inválido = `null` (nada
        persiste). Export em `flows/index.ts`.
  - [ ] Rota `POST /api/marketing-posts/[id]/generate-art`:
        `marketingGuard()` → carrega o post via admin client (404 se não
        existe; 422 se `status` fora de sugerido/aprovado ou se já tem
        `arte_url`) → `getValidCanvaToken()` (falhou → 409
        `canva_disconnected`) → flow → persiste `arte_url` + `metadata.arte`
        `{generated_at, generated_by, design_id, brand_kit_id, origem:"canva-mcp"}`
        via admin client SEM tocar no status → devolve o post atualizado.
        Parse inválido → 502 sem persistir; try/catch → 500 amigável.
        `export const maxDuration = 300` (ver Dev Notes › Timeout).
- [ ] **T5 (AC4, AC5) — UI da aba Agente.**
  - [ ] Page server (`agente/page.tsx`): ler `canva_mcp_tokens` (server-side)
        e repassar `canvaConnected: boolean` ao client component.
  - [ ] `agente-client.tsx` / `PostCard`: botão "Gerar arte" nos cards
        sugerido/aprovado sem `arte_url`; desabilitado + tooltip quando
        `canvaConnected=false`; loading por card durante a chamada; sucesso →
        refresh da lista (padrão existente); erro → mensagem amigável + retry;
        409 `canva_disconnected` → mensagem apontando Configurações ›
        Integrações e botão passa a desabilitado. Tema `dark:` consistente.
- [ ] **T6 (AC6) — Testes e validações.** Parser do flow (JSON válido /
  inválido / truncado / só-thinking / URL fora de canva.com / blocos MCP
  intercalados), guard de estado da rota (matriz status × arte_url),
  `refreshIfNeeded` (válido / expirado→refresh / refresh falha), roles do
  gate. `npm run lint` + `type-check` + suíte completa + `build` verdes.

## Dev Notes

### 🔥 SDK `@anthropic-ai/sdk` — upgrade obrigatório (validar no spike)
`packages/ai/package.json` está em `^0.52.0`, ANTERIOR ao beta
`mcp-client-2025-11-20` (que introduziu o par `mcp_servers` +
`tools: [{type:"mcp_toolset"}]`). O upgrade é parte do T1 e o raio de impacto
inclui TODOS os flows existentes de `packages/ai` (behavior-analysis,
marketing-suggestions, enrich, pipeline da Nicole) — rodar a suíte completa
após o bump (REGRA: não quebrar o que funciona). `createAnthropicClient()` e
`ANTHROPIC_MODELS` (`packages/ai/src/client/anthropic.ts`) continuam sendo a
porta de entrada.

### Contrato do MCP connector (validado contra a skill claude-api, 27/07)
- Endpoint beta: `client.beta.messages.create({ betas: ["mcp-client-2025-11-20"], ... })`.
- **As duas metades são obrigatórias**: `mcp_servers=[{type:"url",
  url:"https://mcp.canva.com/mcp", name:"canva", authorization_token:<token>}]`
  E `tools=[{type:"mcp_toolset", mcp_server_name:"canva"}]` — server declarado
  sem toolset correspondente é rejeitado com erro de validação.
- O content da resposta traz blocos `mcp_tool_use` e `mcp_tool_result`
  intercalados com `thinking`/`text`. 🔥 GOTCHA Sonnet 5 (memória +
  `marketing-suggestions.ts:177-183`): **nunca ler `content[0]`** — filtrar
  por `type === "text"` e usar o ÚLTIMO bloco text para o JSON final;
  `max_tokens` folgado (8000+; a conversa com tools consome bastante).
- [AUTO-DECISION] Modelo = `ANTHROPIC_MODELS.sonnet` (convenção do repo; mesma
  classe do flow de sugestões — orquestração de tools + criação, não extração
  barata). O flow recebe o client pronto; trocar modelo depois é 1 linha.

### OAuth do Canva MCP (o que o spike precisa provar)
- O Canva MCP usa o fluxo OAuth padrão de servidores MCP remotos: discovery
  RFC 9728 no host (`/.well-known/oauth-protected-resource`) → metadata do
  authorization server → **dynamic client registration** (RFC 7591) →
  authorization code + **PKCE S256** → token endpoint (code e refresh grants).
  Não há app pré-cadastrado tipo Google — o `client_id` nasce do registration
  e DEVE ser persistido junto com os tokens (refresh precisa dele).
- Anti-CSRF: `state` aleatório + `code_verifier` guardados em **cookie
  httpOnly** (SameSite=Lax, TTL ~10min) entre o redirect e o callback —
  [AUTO-DECISION] cookie em vez de linha no banco: é efêmero, por-navegador e
  o fluxo inteiro acontece na mesma sessão do admin.
- O callback é rota AUTENTICADA (o navegador do admin tem o cookie de sessão)
  — **não** entra no `isPublicRoute` do middleware; a convenção
  [[project-rotas-publicas-token-middleware]] não se aplica aqui (não é rota
  pública por token). Validar mesmo assim com um curl anônimo pós-deploy
  (deve devolver redirect/401, nunca 500).
- Redirect URI: `{NEXT_PUBLIC_APP_URL}/api/auth/canva/callback` — em prod
  DEVE ser `https://crm.trifold.eng.br/...` ([[project-link-notificacao-dominio]]).
  Se o registration exigir URI exata, registrar também a de dev/preview ou
  re-registrar por ambiente (client_id fica no banco por org, então dev DB e
  prod DB têm registrations independentes — sem conflito).
- Env vars novas (se necessárias — ex.: override de redirect URI): criar via
  **Vercel REST API** (`scripts/vercel-env-set.sh`), NUNCA `vercel env add`
  via stdin (gotcha do CLAUDE.md); mudança só vale após redeploy.

### Shape dos tokens (`organizations.canva_mcp_tokens` JSONB)
```jsonc
{
  "client_id": "...",            // do dynamic client registration
  "client_secret": "...",        // se emitido (token_endpoint_auth)
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1769999999999,   // epoch ms (padrão expiry_date do google.ts)
  "scope": "...",
  "account_label": "Trifold Engenheira", // p/ "Conectado (conta X)" — ver abaixo
  "connected_by": "<user_id>",
  "connected_at": "2026-07-27T...",
  "last_refresh_error": null     // string quando o último refresh falhou → UI mostra aviso
}
```
- [AUTO-DECISION] Coluna JSONB em `organizations` (padrão exato de
  `google_oauth_tokens`, mig 013) em vez de tabela nova: é 1 registro por org,
  o padrão já existe com UI/rotas análogas e RLS de `organizations` já cobre.
- [AUTO-DECISION] "Conectado (conta X)": se o token response/userinfo do Canva
  não expuser nome da conta de forma barata, o spike pode preencher
  `account_label` com o resultado de uma chamada `list-brand-kits`/perfil via
  MCP na conexão, ou fixar o rótulo "Canva Pro conectado" — decidir no T1 com
  o que a API realmente devolve; o AC exige status claro, não um campo
  específico.
- Segredo NUNCA no client bundle: leituras só em server components/rotas;
  escrita só via admin client. O server component de Integrações repassa
  apenas booleans/labels (padrão já usado com `google_oauth_tokens`).

### Qual client do banco em cada acesso (padrão 75-219)
| Acesso | Client |
|--------|--------|
| `organizations.canva_mcp_tokens` (ler p/ status na page) | server component com client do usuário (RLS de organizations já permite; padrão da page de Integrações) |
| `organizations.canva_mcp_tokens` (escrever/refresh/disconnect) | **admin client** (padrão do callback do Google) |
| `marketing_posts` (ler post, persistir arte_url/metadata) | **admin client** (RLS habilitada SEM policies — decisão da 75-219) |

### Rota `generate-art` — regras de estado
- Válido: `status IN ('sugerido','aprovado')` **e** `arte_url IS NULL` → 422
  caso contrário (espelha `isMarketingPostEditable` de `lib/marketing/posts.ts`;
  se preferir, estender o helper puro com `canGenerateArt(post)` + teste).
- Regerar arte de um post que já tem `arte_url` está FORA do escopo (o humano
  pode limpar o campo manualmente pelo modal de edição e gerar de novo —
  comportamento aceitável nesta fase).
- A rota NUNCA transita status — nem em sucesso nem em erro (AC4). O guard de
  transições do PATCH (75-219) permanece a única porta de mudança de status.

### Timeout / UX de espera
- `export const maxDuration = 300` na rota `generate-art` — generate-design +
  polling de candidatas + create-design no Canva passam fácil de 60s; 90s
  (padrão da rota generate de sugestões) é apertado para uma conversa
  multi-tool. ✅ [AUTO-DECISION @po 27/07] Teto CONFIRMADO: plano Vercel do
  time = **Pro** (verificado via API, `team_XCf2jBxUmCXao0prWVy0VmOZ`) e o
  repo JÁ roda `maxDuration = 300` em prod (`admin/obras/*/sienge/sync`,
  crons `sienge-customer-sync`/`supremo-*`). 300 é válido — usar sem
  degradação.
- UI: loading POR CARD (não global), botão desabilitado durante a chamada,
  mensagem "isso pode levar ~1 min". Sem streaming/polling nesta fase —
  request única com timeout folgado (fail-open cobre o resto).

### UI (AC5)
- Tema: página `/dashboard` → light/dark com `dark:` (padrão visível no
  próprio `agente-client.tsx`; accent laranja `orange-600`/`dark:orange-300`).
- O botão entra no `PostCard` existente (`agente-client.tsx:223+`), ao lado do
  link "Ver arte ↗" (que só aparece quando há `arte_url` — os dois são
  mutuamente exclusivos por construção).
- Tooltip de desconectado: `title=` simples basta (padrão do repo; não
  introduzir lib de tooltip).

### Fora do escopo (stories futuras)
- Publicação automática (Graph API) e calendário automático.
- Geração de arte em LOTE (um post por vez nesta fase).
- Autofill/brand templates via Connect API (🔥 exige Canva ENTERPRISE).
- Escolha de template/candidata pela UI (o agente decide; humano rejeita/edita).
- Regenerar arte por cima de arte existente (limpar manualmente é o caminho).
- Export/download do design (o link do Canva basta para o fluxo atual).

### Testing
- Testes de unidade junto aos arquivos (padrão do repo):
  - `parseMarketingArt`: JSON válido; JSON com campos faltando; resposta
    não-JSON; blocos thinking/mcp_tool_use/mcp_tool_result antes do text;
    dois blocos text (usa o último); `design_url` http/host estranho → null.
  - Regras de estado da rota: matriz status × arte_url (sugerido sem arte ✅;
    aprovado sem arte ✅; sugerido com arte ❌; rejeitado ❌; publicado ❌).
  - `refreshIfNeeded`/`getValidCanvaToken`: token válido (não refresca);
    expirado → refresca e persiste; refresh falha → erro `canva_disconnected`
    (mock de fetch; sem rede nos testes).
  - Gate: constante de roles das rotas novas (mesmo desenho da 75-219 —
    repo não tem testes de integração de route handlers).
- Manual (dev): conectar Canva de verdade → gerar arte de um post real →
  link abre o design na conta Trifold; desconectar → botão desabilita;
  token corrompido no banco → erro amigável + status Desconectado.
- Suíte completa + `tsc` + `eslint` + `build` limpos antes do gate.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only (@qa gate).

## Pendências do @sm — RESOLVIDAS na validação do @po (27/07)

1. **T1 é gate da story inteira.** ✅ [AUTO-DECISION @po] Mantido e tornado
   inequívoco no AC1 e no T1: falha não contornável → status **Blocked** +
   reporte ao @po/Marcos; alternativas (token manual, Templated.io/Bannerbear)
   explicitamente NÃO autorizadas — PARAR ≠ contornar.
2. **`maxDuration = 300`.** ✅ RESOLVIDO: plano Vercel = **Pro** (verificado
   via API Vercel em 27/07) e o repo já usa 300 em rotas de prod. Valor
   mantido sem contingência (ver Dev Notes › Timeout).
3. **Conexão admin-only.** ✅ [AUTO-DECISION @po] Mantido **admin-only** para
   conectar/desconectar (espelha exatamente `api/auth/google/*`, que usa
   `requireRole(["admin"])` — verificado no código; conexão é infraestrutura
   org-level, 1x). USO do botão "Gerar arte" segue admin/supervisor via
   `marketingGuard()` como o resto da aba. Sem mudança na story.
4. **Raio de impacto do upgrade do SDK.** ✅ RESOLVIDO: T1 e AC6 agora exigem
   de forma testável: suíte COMPLETA do monorepo + type-check pós-bump, smoke
   manual em dev de message-review + behavior-analysis + marketing-suggestions,
   suíte de `packages/ai` (cobre pipeline da Nicole) verde; smoke da Nicole
   real fica no gate @qa/@devops pós-deploy. Breaking change → reportar antes
   de seguir.

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (`claude-fable-5`) — @dev Dex, modo YOLO, 2026-07-27.

### Debug Log References

**Resultado do spike T1 (27/07/2026): 🔴 BLOQUEADO no passo (c) — authorization
code. Discovery e DCR funcionam; o `/authorize` do Canva aplica um ALLOWLIST DE
HOSTS ao `redirect_uri` e o host do CRM não está nele.**

Scripts do spike rodados no scratchpad (fora do repo), server-side via Node
`fetch`. Evidências:

1. **(a) Discovery — ✅ OK**
   - `GET https://mcp.canva.com/.well-known/oauth-protected-resource` → 200:
     `resource: https://mcp.canva.com`, `authorization_servers:
     ["https://mcp.canva.com"]`, `scopes_supported` inclui `brandkit:read`,
     `design:content:read/write`, `asset:read/write`, `profile:read`,
     `folder:read/write` (variante `/.well-known/oauth-protected-resource/mcp`
     também responde 200 com `resource: https://mcp.canva.com/mcp`).
   - `GET https://mcp.canva.com/.well-known/oauth-authorization-server` → 200:
     `authorization_endpoint: https://mcp.canva.com/authorize`,
     `token_endpoint: https://mcp.canva.com/token`,
     `registration_endpoint: https://mcp.canva.com/register`,
     `grant_types_supported: [authorization_code, refresh_token, jwt-bearer]`,
     `code_challenge_methods_supported: [plain, S256]`,
     `token_endpoint_auth_methods_supported: [client_secret_basic,
     client_secret_post, none]`, `client_id_metadata_document_supported: true`.

2. **(b) Dynamic client registration (RFC 7591) — ✅ OK**
   - `POST https://mcp.canva.com/register` com `redirect_uris:
     ["https://crm.trifold.eng.br/api/auth/canva/callback"]`,
     `grant_types: [authorization_code, refresh_token]`,
     `token_endpoint_auth_method: client_secret_post` → **201**:
     `client_id: "-8-pmUmt7-mchJ4x"`, `client_secret` emitido
     (`client_secret_expires_at: 0`), `registration_client_uri:
     /register/-8-pmUmt7-mchJ4x`. O registration aceita QUALQUER redirect_uri.

3. **(c) Authorization URL + PKCE — ❌ BLOQUEADO**
   - URL montada com `response_type=code`, `client_id` do DCR,
     `code_challenge` S256, `state` — `GET /authorize` responde
     **`400 "Invalid redirect URI. It must be from an allowed host."`**
     para o redirect do CRM, ANTES de qualquer tela de login.
   - Matriz de hosts testada (cada um com client DCR próprio, mesma URI exata
     registrada):
     | redirect host | /authorize |
     |---|---|
     | `crm.trifold.eng.br` | ❌ 400 allowlist |
     | `trifold-crm.vercel.app` | ❌ 400 allowlist |
     | `localhost:3000` | ✅ 302 → login canva.com |
     | `127.0.0.1:3000` | ✅ 302 → login canva.com |
     | `claude.ai` / `claude.com` | ✅ 302 → login canva.com |
   - Hipótese CIMD (client_id metadata document, mecanismo recomendado — DCR
     está deprecated): testado com doc JSON real hospedado (client_id = URL do
     doc). CIMD FUNCIONA (redirect localhost declarado no doc → 302), mas o
     allowlist de host do redirect é aplicado do mesmo jeito — inclusive com
     client_id e redirect no MESMO host (❌ 400). Ou seja: hospedar o metadata
     doc no CRM NÃO contorna; o allowlist é absoluto e independente do método
     de registro.
   - **Confirmação na documentação oficial** (canva.dev/docs/mcp, 27/07):
     _"To add your redirect URI to the Canva MCP allowlist, apply for access
     with our Waitlist form."_ — form:
     `https://docs.google.com/forms/d/1jgC4vAA2-5LqaNzVhnP8ygSknF4Vysc1UzAWJukzcp0/viewform`
     (pede empresa, objetivos da integração, requisitos técnicos e timeline).

4. **SDK upgrade (T1b) e chamada real com MCP connector (T1c) — NÃO executados**
   por decisão de gate: com o OAuth bloqueado a story PARA (AC1); o bump do
   `@anthropic-ai/sdk` tem raio de impacto em todos os flows de IA em prod e
   não deve ser feito fora de uma story ativa que o exija.

Higiene do spike: os clients DCR de teste ficaram registrados no Canva mas são
inertes (nenhum token foi/pode ser emitido — o redirect deles é bloqueado no
authorize; DCR é aberto a qualquer um por design). O gist temporário usado no
teste CIMD foi apagado. Nenhum arquivo de spike entrou no repo.

### Completion Notes

- **Story BLOQUEADA no gate do AC1** — exatamente o cenário previsto: falha
  não contornável dentro do desenho da story. Nenhuma linha de código de
  produção foi escrita; nenhuma migration criada; nenhuma alternativa proibida
  (token manual / Templated.io / Bannerbear) foi implementada.
- **Caminho para desbloquear (decisão do Marcos/@po):** preencher o Waitlist
  form oficial do Canva pedindo allowlist do redirect
  `https://crm.trifold.eng.br/api/auth/canva/callback` (e, se quisermos testar
  em dev, também a URL de dev/preview). Quando o Canva aprovar, a story volta
  para Ready e o restante do desenho segue válido — discovery, registro
  (preferir CIMD, que é o recomendado; DCR está deprecated mas funcional),
  token/refresh endpoints e scopes necessários (`brandkit:read`,
  `design:content:read/write`) já foram validados neste spike.
- **Nota para a retomada:** como o Canva marca DCR como deprecated em favor de
  CIMD, ao retomar vale considerar hospedar o client metadata document no
  próprio CRM (ex.: rota/arquivo público servindo JSON com `client_id` = URL
  do doc + `redirect_uris`) em vez de DCR — o spike provou que o fluxo CIMD
  funciona ponta-a-ponta até o login. Isso NÃO muda o shape dos tokens nem o
  resto da arquitetura da story.
- Smokes pós-deploy e validações de suíte não se aplicam (nada foi alterado
  além do arquivo da story).

### File List

- `docs/stories/75-220-campanhas-gerar-arte-canva-mcp.story.md` (modificado —
  status Blocked + Dev Agent Record; único arquivo tocado)

## QA Results
_(preenchido pelo @qa)_

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-27 | 0.1 | Draft criado a partir da decisão de 27/07 ("Opção A — deixar pronto"): conexão Canva OAuth org-level (padrão Google/mig 013) + botão "Gerar arte" via MCP connector da Claude API; spike OAuth+SDK como Task 1 bloqueante. Story-draft-checklist aplicado (READY). | @sm (River) |
| 2026-07-27 | 0.2 | Validação @po (GO 9/10): Status Draft→Ready. Pendências resolvidas: (1) gate do spike endurecido no AC1/T1 (Blocked + alternativas não autorizadas nomeadas); (2) maxDuration=300 confirmado (plano Vercel Pro, verificado via API + rotas 300 já em prod); (3) conexão admin-only mantida (padrão api/auth/google verificado); (4) T1/AC6 exigem suíte completa do monorepo + smoke de message-review/behavior-analysis/marketing-suggestions pós-upgrade do SDK. Contrato MCP connector re-validado contra a skill claude-api. | @po (Pax) |
| 2026-07-27 | 0.3 | Spike T1 executado: discovery ✅, DCR ✅, MAS `/authorize` do Canva rejeita redirect do CRM — allowlist de hosts (só localhost/claude.ai etc.); CIMD testado inclusive mesmo-host, allowlist é absoluto; doc oficial confirma que entrada no allowlist é via Waitlist form. Status Ready→Blocked conforme gate do AC1; T2–T6 e upgrade do SDK não executados; nenhuma alternativa implementada. Evidências completas no Dev Agent Record. | @dev (Dex) |
