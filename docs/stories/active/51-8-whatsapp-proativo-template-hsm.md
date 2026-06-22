# Story 51-8 — WhatsApp Proativo via Template HSM (Roleta, Gestor e Obra)

## Metadata
- **Epic:** 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma
- **Story:** 51-8
- **Status:** Done
- **Origin:** GitHub issue #17 — "WhatsApp proativo via template (Meta)" — Parte 2 (código). Os templates já foram criados e aprovados na Meta na Parte 1.
- **Priority:** P1 — fluxos proativos (roleta, gestor, obra) disparam freeform `type:"text"` que a Meta bloqueia fora da janela de 24h. Corretos/gestores/clientes raramente têm essa janela aberta.
- **Complexity:** M (4-6h)
- **Created:** 2026-06-22
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[type-check @trifold/web, vitest send-whatsapp-template.test.ts, regression notify-broker.ts, regression notificacoes.ts]`
- **Autossuficiente:** sim — não depende de nenhuma story em andamento do epic (código legado de notificação existia antes do epic 51)

---

## User Story

**Como** corretor, gestor e cliente Trifold,
**Quero** receber notificações proativas no WhatsApp mesmo sem ter iniciado conversa recentemente com o número business,
**Para que** não perca avisos importantes de novo lead atribuído pela roleta, distribuição de imobiliária e atualização de obra.

---

## Context

### Problema

Os três fluxos proativos de WhatsApp do CRM enviam mensagens com `type: "text"` (freeform):

| Fluxo | Arquivo | Função | Destinatário |
|-------|---------|--------|-------------|
| 1 | `packages/web/src/lib/roleta/notify-broker.ts` | `sendBrokerWhatsApp` | Corretor (novo lead da roleta) |
| 2 | mesmo arquivo | `notifyImobiliaria` — delega posicionalmente a `sendBrokerWhatsApp` | Gestor (aviso de distribuição) |
| 3 | `packages/web/src/lib/notificacoes.ts` | `sendWhatsApp` | Cliente (atualização de obra) |

Mensagens freeform (`type: "text"`) só são entregues pelo WhatsApp Business API **dentro da janela de 24h** após o último contato do usuário. Corretos, gestores e clientes raramente têm essa janela aberta pois não conversam regularmente com o número business da Trifold. Na prática, **praticamente nenhuma dessas notificações chega**.

A solução é usar **templates HSM aprovados pela Meta**. Templates HSM são entregues fora da janela de 24h sem restrição de frequência e sem depender de conversa prévia.

### Templates aprovados na Meta (issue #17 — templates já criados, esta story é o código)

Estão aprovados no ambiente de produção com language `pt_BR`. Os nomes são case-sensitive e devem ser referenciados EXATAMENTE assim:

| Template name | Fluxo | Destinatário |
|--------------|-------|-------------|
| `novo_lead_corretor` | 1 | Corretor — novo lead da roleta |
| `aviso_roleta_gestor` | 2 | Gestor — distribuição de lead |
| `atualizacao_obra_cliente` | 3 | Cliente — nova foto/doc/mensagem/progresso |

### Estrutura do payload de template (Graph API v21.0)

```json
{
  "messaging_product": "whatsapp",
  "to": "<phone E.164 sem +>",
  "type": "template",
  "template": {
    "name": "novo_lead_corretor",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "<{{1}}>" },
          { "type": "text", "text": "<{{2}}>" },
          { "type": "text", "text": "<{{3}}>" }
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": "0",
        "parameters": [
          { "type": "text", "text": "<id — sufixo dinâmico da URL>" }
        ]
      }
    ]
  }
}
```

### Mapeamento de variáveis por template

**`novo_lead_corretor` (Fluxo 1):**
- Corpo `{{1}}` = nome do corretor (`broker.name`)
- Corpo `{{2}}` = nome do lead (`leadName`)
- Corpo `{{3}}` = telefone do lead (`lead.phone`)
- Botão URL sufixo `{{1}}` = `lead.id` (base `https://crm.trifold.eng.br/broker/leads/` embutida no template Meta — enviar APENAS o UUID)

**`aviso_roleta_gestor` (Fluxo 2):**
- Corpo `{{1}}` = nome do gestor (`user.name` fetchado de `users`)
- Corpo `{{2}}` = mensagem descritiva (`messageBody`, ex: "Lead distribuído para o corretor Robson Silva.")
- Corpo `{{3}}` = info do lead (`"${lead.name ?? 'Lead'} — ${lead.phone ?? ''}"` trimado)
- Botão URL sufixo `{{1}}` = `lead.id` (base `https://crm.trifold.eng.br/dashboard/leads/` embutida)

**`atualizacao_obra_cliente` (Fluxo 3):**
- Corpo `{{1}}` = nome do cliente (`(user.name as string | null) ?? ""`)
- Corpo `{{2}}` = nome da obra (`obraName`)
- Corpo `{{3}}` = descrição do evento (`EVENTO_LABEL[evento]` — já mapeado em `notificacoes.ts`)
- Botão URL sufixo `{{1}}` = `obraId` (base `https://crm.trifold.eng.br/cliente/` embutida)

### Decisão crítica: `context` em `sendBrokerWhatsApp` (AC3)

`notifyBroker` aceita `context?: { title?: string; body?: string }`. Quando `context` está presente, a copy NÃO é "você recebeu um novo lead" — é algo como "visita agendada" (Story 51-3) ou "follow-ups esgotados" (Story 51-4). O template `novo_lead_corretor` **não** encaixa nessa copy.

[AUTO-DECISION] Quando `context` está presente, `sendBrokerWhatsApp` retorna imediatamente sem enviar WhatsApp. Reason: nenhum template aprovado cobre os paths de agendamento e alert_broker; enviar o template errado com copy errada é pior que não enviar. Push e email nesses fluxos continuam inalterados (estão no caller `notifyBroker`, não em `sendBrokerWhatsApp`). Os templates para agendamento/follow-up ficam como follow-up de produto quando a Meta aprovar.

[AUTO-DECISION] `notifyImobiliaria` não usa mais `sendBrokerWhatsApp`. Em vez disso, fetcha WA config em paralelo com o `users` query e chama `sendWhatsAppTemplate` diretamente com `aviso_roleta_gestor`. Reason: os dois fluxos têm templates diferentes, mapeamentos de variáveis completamente distintos e assinaturas incompatíveis — forçar um caminho comum exigiria branching confuso numa função privada já sobrecarregada.

[AUTO-DECISION] `sendBrokerWhatsApp` recebe `leadId: string` como novo parâmetro (adicionado antes do parâmetro `context`). O `leadUrl` é removido da assinatura — não é mais necessário já que a URL base está embutida no template. Reason: extrair o UUID do final de uma URL string é frágil; o caller `notifyBroker` já tem `lead.id` disponível.

### Precondição operacional (fora do escopo desta story)

Telefones de corretores, gestores e clientes devem estar em formato E.164 sem `+` (ex.: `5544999990000`). A normalização de telefone de leads já é feita por `normalizePhoneBR` (Story 21.1), mas a normalização de usuários/clientes é dependência operacional #20. Esta story passa `phone` as-is para o template helper — a responsabilidade de formato cabe ao dado no banco.

---

## Acceptance Criteria

1. **Helper puro `sendWhatsAppTemplate` criado:** O arquivo `packages/web/src/lib/whatsapp/send-whatsapp-template.ts` existe. Não contém imports `@web/*` ou Supabase. Exporta `sendWhatsAppTemplate(waConfig: WhatsAppConfig | null | undefined, phone: string, template: SendWhatsAppTemplateOptions, fetchImpl?: typeof fetch): Promise<SendWhatsAppResult>`. Importa `WhatsAppConfig` e `SendWhatsAppResult` de `"./send-whatsapp-message"` (relativo). Nunca lança — quando config ausente retorna `{ sent: false, error: "WHATSAPP_CONFIG_MISSING" }` sem chamar fetch.

2. **Fluxo 1 — template `novo_lead_corretor` no path da roleta:** Em `sendBrokerWhatsApp` (em `notify-broker.ts`), quando `context` é `undefined` ou `null`, o body da requisição ao Graph API usa `type: "template"` com name `"novo_lead_corretor"`, language code `"pt_BR"`, body component com 3 parâmetros `{ type: "text" }` (`brokerName`, `leadName`, `leadPhone`) e button component `sub_type: "url"` index `"0"` com `leadId` como sufixo. O envio `type: "text"` é removido.

3. **Fluxo 1 — early return quando `context` presente:** Quando `context` está presente (path dos gatilhos 51-3/51-4), `sendBrokerWhatsApp` retorna sem realizar nenhum fetch ao Graph API. Push e email em `notifyBroker` não são afetados — são disparados pelo caller antes de `sendBrokerWhatsApp`.

4. **Fluxo 2 — template `aviso_roleta_gestor` para o gestor:** Em `notifyImobiliaria`, quando `user.phone` está disponível, o envio WhatsApp usa `sendWhatsAppTemplate` com `"aviso_roleta_gestor"`, language `"pt_BR"`: body `{{1}}` = `user.name ?? ""`, `{{2}}` = `messageBody`, `{{3}}` = ``${lead.name ?? "Lead"} — ${lead.phone ?? ""}`.trim()``; button index `"0"` sufixo = `lead.id`. A delegação legada a `sendBrokerWhatsApp` posicional é removida. A WA config é fetchada em paralelo com a query de `users` (no mesmo `Promise.all` ou antes do `Promise.allSettled`).

5. **Fluxo 3 — template `atualizacao_obra_cliente` para clientes:** Em `notificacoes.ts`, a função privada `sendWhatsApp` tem `obraId: string` no lugar de `link: string`. A chamada em `notifyClientes` passa `obraId` (disponível como primeiro parâmetro da função exportada). O envio usa `sendWhatsAppTemplate` com `"atualizacao_obra_cliente"`: body `{{1}}` = `nome ?? ""`, `{{2}}` = `obraName`, `{{3}}` = `descricao` (= `EVENTO_LABEL[evento]`); button index `"0"` sufixo = `obraId`. O fetch de WA config muda de `.single()` para `.maybeSingle()` (`.single()` lança em 0 rows, corretivo concomitante).

6. **Nenhum template fora dos 3 aprovados:** O código não referencia nenhum template name além de `novo_lead_corretor`, `aviso_roleta_gestor` e `atualizacao_obra_cliente`. Nenhuma referência a template de boleto (issue #18).

7. **Fluxo freeform intocado:** `packages/web/src/lib/whatsapp/send-whatsapp-message.ts` e `packages/web/src/lib/broker/dispatch-broker-message.ts` não têm alterações. O fluxo corretor→lead dentro da janela de 24h (Stories 51-1/51-5) continua inalterado.

8. **Testes e compilação:** `pnpm --filter @trifold/web type-check` → 0 erros. `packages/web/src/lib/whatsapp/send-whatsapp-template.test.ts` existe com vitest, cobrindo: (a) config ausente → WHATSAPP_CONFIG_MISSING sem fetch; (b) HTTP 200 → `{ sent: true }` com payload JSON correto (`type: "template"`); (c) HTTP 4xx → `{ sent: false, error: "HTTP_4xx" }`; (d) falha de rede → `{ sent: false }` sem throw; (e) TimeoutError → `{ sent: false, error: "TIMEOUT" }`; (f) estrutura de `components` no payload validada (body + button).

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

---

## Tasks / Subtasks

- [x] **T1 — Criar helper puro `sendWhatsAppTemplate` (AC1)**
  - Criar `packages/web/src/lib/whatsapp/send-whatsapp-template.ts`
  - Importar tipos de `"./send-whatsapp-message"` (importação relativa — sem `@web/*`):
    ```ts
    import type { WhatsAppConfig, SendWhatsAppResult } from "./send-whatsapp-message"
    ```
  - Definir e exportar tipos:
    ```ts
    export interface WhatsAppTemplateBodyComponent {
      type: "body"
      parameters: Array<{ type: "text"; text: string }>
    }
    export interface WhatsAppTemplateButtonComponent {
      type: "button"
      sub_type: "url"
      index: string   // "0", "1", etc.
      parameters: Array<{ type: "text"; text: string }>
    }
    export type WhatsAppTemplateComponent = WhatsAppTemplateBodyComponent | WhatsAppTemplateButtonComponent
    export interface SendWhatsAppTemplateOptions {
      name: string          // ex: "novo_lead_corretor"
      languageCode: string  // ex: "pt_BR"
      components: WhatsAppTemplateComponent[]
    }
    ```
  - Implementar `sendWhatsAppTemplate`:
    - Guard config ausente → `{ sent: false, error: "WHATSAPP_CONFIG_MISSING" }` sem fetch
    - `try/catch` wrapping do fetch ao Graph API v21.0 (mesmo endpoint que `sendWhatsAppMessage`)
    - Body JSON: `{ messaging_product: "whatsapp", to: phone, type: "template", template: { name, language: { code: languageCode }, components } }`
    - `AbortSignal.timeout(15000)` — igual ao helper existente
    - Retornar `{ sent: true }` em 2xx; `{ sent: false, error: "HTTP_{status}" }` em não-2xx; `{ sent: false, error: "TIMEOUT" }` em AbortError/TimeoutError; `{ sent: false, error: err.message || "SEND_FAILED" }` em falha genérica
    - Nunca lança

- [x] **T2 — Criar testes de `sendWhatsAppTemplate` (AC8)**
  - Criar `packages/web/src/lib/whatsapp/send-whatsapp-template.test.ts`
  - Seguir exatamente o padrão de `send-whatsapp-message.test.ts` (vi.fn para fetchImpl, mock de Response)
  - Cenário 1: config null → WHATSAPP_CONFIG_MISSING, fetchMock not called
  - Cenário 2: config parcial (sem access_token) → WHATSAPP_CONFIG_MISSING
  - Cenário 3: HTTP 200 → `{ sent: true }` + verificar payload JSON tem `type: "template"`, `template.name`, `template.language.code`, `template.components`
  - Cenário 4: HTTP 400 → `{ sent: false, error: "HTTP_400" }` sem throw
  - Cenário 5: fetch rejeita com Error → `{ sent: false }` sem throw
  - Cenário 6: TimeoutError (name "TimeoutError") → `{ sent: false, error: "TIMEOUT" }`
  - Cenário 7: estrutura de button component incluída no payload (sub_type, index, parameters)
  - Executar `npx vitest run packages/web/src/lib/whatsapp/send-whatsapp-template.test.ts` antes de prosseguir

- [x] **T3 — Refatorar Fluxo 1: `sendBrokerWhatsApp` usa template (AC2, AC3)**
  - Editar `packages/web/src/lib/roleta/notify-broker.ts`
  - Adicionar import de `sendWhatsAppTemplate` e seus tipos:
    ```ts
    import { sendWhatsAppTemplate } from "../whatsapp/send-whatsapp-template"
    ```
  - Atualizar assinatura da função privada `sendBrokerWhatsApp` — adicionar `leadId: string`, remover `leadUrl: string`:
    ```ts
    async function sendBrokerWhatsApp(
      admin: ReturnType<typeof createAdminClient>,
      orgId: string,
      phone: string,
      brokerName: string,
      leadName: string,
      leadPhone: string,
      leadId: string,          // ← NOVO (era leadUrl — removido)
      context?: { title?: string; body?: string }
    ): Promise<void>
    ```
  - Lógica da função refatorada:
    - Se `context` presente → `return` imediatamente (early return — AC3)
    - Fetch WA config via `admin.from("whatsapp_config").select("phone_number_id, access_token").eq("org_id", orgId).eq("status", "active").maybeSingle()`
    - Guard: `if (!waConfig?.phone_number_id || !waConfig?.access_token) return`
    - Montar components para `novo_lead_corretor` e chamar `sendWhatsAppTemplate`
    - Se `!res.sent` → throw `new Error(`WhatsApp template error: ${res.error}`)` (manter prop de erro para o catch em `notifyBroker`)
  - Atualizar call-site em `notifyBroker` (linha 76 aproximadamente):
    ```ts
    // DE:
    sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, leadUrl, context)
    // PARA:
    sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, lead.id, context)
    ```
  - Remover a construção da `const message = ...` freeform e o fetch inline (todo o bloco de 112-133 atual)

  Aguarda: T1

- [x] **T4 — Refatorar Fluxo 2: `notifyImobiliaria` usa template `aviso_roleta_gestor` (AC4)**
  - Editar `packages/web/src/lib/roleta/notify-broker.ts`
  - Em `notifyImobiliaria`, converter o `await admin.from("users")...` de sequencial para paralelo com WA config:
    ```ts
    const [userRes, waConfigRes] = await Promise.all([
      admin.from("users").select("name, email, phone").eq("id", userId).maybeSingle(),
      admin.from("whatsapp_config").select("phone_number_id, access_token")
        .eq("org_id", orgId).eq("status", "active").maybeSingle(),
    ])
    const user = userRes.data
    const waConfig = waConfigRes.data
    if (!user?.email) return
    ```
  - No `Promise.allSettled`, substituir o bloco de WA (que chamava `sendBrokerWhatsApp`) por:
    ```ts
    (user.phone as string | null) && waConfig?.phone_number_id && waConfig?.access_token
      ? sendWhatsAppTemplate(
          waConfig,
          user.phone as string,
          {
            name: "aviso_roleta_gestor",
            languageCode: "pt_BR",
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: (user.name as string | null) ?? "" },
                  { type: "text", text: messageBody },
                  { type: "text", text: `${lead.name ?? "Lead"} — ${lead.phone ?? ""}`.trim() },
                ],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: lead.id }],
              },
            ],
          }
        ).then((res) => {
          if (!res.sent) throw new Error(res.error ?? "SEND_FAILED")
        }).catch((e: unknown) => console.error("[roleta] imob whatsapp error:", e))
      : Promise.resolve(),
    ```
  - Remover a delegação legada a `sendBrokerWhatsApp` e a construção de `leadUrl` que era usada somente para o WA (verificar se `leadUrl` ainda é usada por push ou email neste scope — se não, remover)

  Aguarda: T1

- [x] **T5 — Refatorar Fluxo 3: `sendWhatsApp` em `notificacoes.ts` usa template (AC5)**
  - Editar `packages/web/src/lib/notificacoes.ts`
  - Adicionar import de `sendWhatsAppTemplate`:
    ```ts
    import { sendWhatsAppTemplate } from "./whatsapp/send-whatsapp-template"
    ```
  - Atualizar assinatura da função privada `sendWhatsApp` — substituir `link: string` por `obraId: string`:
    ```ts
    async function sendWhatsApp(
      admin: ReturnType<typeof createAdminClient>,
      orgId: string,
      phone: string,
      nome: string,
      obraName: string,
      descricao: string,
      obraId: string     // ← SUBSTITUI link: string
    ): Promise<void>
    ```
  - Atualizar o call-site em `notifyClientes` (linha ~121):
    ```ts
    // DE:
    sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, link)
    // PARA:
    sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, obraId)
    ```
    (`obraId` está disponível como primeiro parâmetro de `notifyClientes`)
  - Implementar a nova lógica de `sendWhatsApp`:
    - Fetch WA config: `.maybeSingle()` em vez de `.single()` (`.single()` lança em 0 rows — org sem WA config não deve crashar)
    - Guard: `if (!config?.phone_number_id || !config?.access_token) throw new Error("whatsapp_config não encontrada para org")`
    - Chamar `sendWhatsAppTemplate` com `atualizacao_obra_cliente`:
      ```ts
      const res = await sendWhatsAppTemplate(config, phone, {
        name: "atualizacao_obra_cliente",
        languageCode: "pt_BR",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: nome ?? "" },
              { type: "text", text: obraName },
              { type: "text", text: descricao },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: obraId }],
          },
        ],
      })
      if (!res.sent) throw new Error(res.error ?? "SEND_FAILED")
      ```
    - Remover a construção do freeform `const body = ...` e o fetch inline (linhas 158-173 atuais)

  Aguarda: T1

- [x] **T6 — Compilação e regressão (AC8)**
  - `pnpm --filter @trifold/web type-check` → 0 erros
  - `npx vitest run packages/web/src/lib/whatsapp/` → todos os testes verdes (incluindo `send-whatsapp-message.test.ts` existente)
  - `git diff packages/web/src/lib/whatsapp/send-whatsapp-message.ts` → vazio (AC7)
  - `git diff packages/web/src/lib/broker/dispatch-broker-message.ts` → vazio (AC7)

---

## Dev Notes

### Blueprint: espelhar `send-whatsapp-message.ts`

O arquivo `packages/web/src/lib/whatsapp/send-whatsapp-message.ts` (criado na Story 51-5) é o blueprint exato para o novo helper. Invariantes a preservar:
- Zero imports `@web/*` ou Supabase — o caller injeta `waConfig` já resolvido
- `fetchImpl: typeof fetch = fetch` como último parâmetro para injeção em testes
- Nunca lança — sempre retorna `SendWhatsAppResult`
- `AbortSignal.timeout(15000)`
- Helper `errorCode(err)` interno (replicar)

Importação de tipos (importação relativa, funciona no vitest sem precisar de alias):
```ts
import type { WhatsAppConfig, SendWhatsAppResult } from "./send-whatsapp-message"
```

### Paths-chave

```
packages/web/src/lib/whatsapp/send-whatsapp-template.ts       ← CRIAR (T1)
packages/web/src/lib/whatsapp/send-whatsapp-template.test.ts  ← CRIAR (T2)
packages/web/src/lib/roleta/notify-broker.ts                  ← MODIFICAR (T3, T4)
packages/web/src/lib/notificacoes.ts                          ← MODIFICAR (T5)
packages/web/src/lib/whatsapp/send-whatsapp-message.ts        ← REFERÊNCIA (não modificar)
packages/web/src/lib/broker/dispatch-broker-message.ts        ← REFERÊNCIA (não modificar)
```

### Assinatura atual de `sendBrokerWhatsApp` (linhas 85-94 de `notify-broker.ts`)

```ts
async function sendBrokerWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  brokerName: string,
  leadName: string,
  leadPhone: string,
  leadUrl: string,               // ← REMOVER; substituir por leadId: string
  context?: { title?: string; body?: string }
): Promise<void>
```

Call-site atual em `notifyBroker` (linha ~76):
```ts
sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, leadUrl, context)
// mudar para:
sendBrokerWhatsApp(admin, orgId, broker.phone, broker.name, leadName, lead.phone, lead.id, context)
```

### Assinatura atual de `sendWhatsApp` em `notificacoes.ts` (linhas 139-148)

```ts
async function sendWhatsApp(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  phone: string,
  nome: string,
  obraName: string,
  descricao: string,
  link: string           // ← substituir por obraId: string
): Promise<void>
```

Call-site em `notifyClientes` (linha ~121):
```ts
sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, link)
// mudar para:
sendWhatsApp(admin, orgId, user.phone, user.name, obraName, descricao, obraId)
```
`obraId` está disponível como primeiro parâmetro de `notifyClientes`. `link` (linha 99 de `notifyClientes`) pode ser removido também se não for mais usado em outro lugar do mesmo escopo — confirmar durante implementação.

### Importante: URL base embutida no template Meta

Os templates aprovados têm a URL base hardcoded no painel Meta:
- `novo_lead_corretor` → botão aponta para `https://crm.trifold.eng.br/broker/leads/<sufixo>`
- `aviso_roleta_gestor` → botão aponta para `https://crm.trifold.eng.br/dashboard/leads/<sufixo>`
- `atualizacao_obra_cliente` → botão aponta para `https://crm.trifold.eng.br/cliente/<sufixo>`

O código deve enviar **apenas o sufixo** (UUID) como parâmetro do botão — NÃO a URL completa. Enviar a URL completa resultaria em URL inválida na entrega.

### `.single()` → `.maybeSingle()` em `notificacoes.ts:153`

A função `sendWhatsApp` usa `.single()` para buscar `whatsapp_config`. O projeto tem regra de usar `.maybeSingle()` (`.single()` lança em 0 rows). Corrigir como parte da refatoração desta story — trivial, mesmo arquivo.

### Tipo `any` em `notifyImobiliaria` (T4)

`user.name`, `user.phone` e `user.email` têm tipo `any` pela inferência do Supabase generic (retorno de `.select("name, email, phone")`). Usar cast explícito ao passar para o template: `(user.name as string | null) ?? ""`, `user.phone as string`. A guarda `if (!user?.email) return` cobre o caso de user não encontrado.

### `EVENTO_LABEL` já existe e exportado em `notificacoes.ts`

```ts
const EVENTO_LABEL: Record<EventoNotificacao, string> = {
  nova_foto: "Nova foto adicionada à sua obra",
  novo_documento: "Novo documento disponível",
  nova_mensagem: "Nova mensagem da equipe Trifold",
  progresso: "Progresso da obra atualizado",
}
```

Usar `EVENTO_LABEL[evento]` diretamente como `{{3}}` do template `atualizacao_obra_cliente`. Sem modificação.

### Convenção de testes do projeto

- Testes co-localizados ao lado do arquivo: `send-whatsapp-template.test.ts` em `packages/web/src/lib/whatsapp/`
- Framework: **vitest** (NÃO jest)
- Pattern de mock de fetch:
  ```ts
  function okResponse() {
    return { ok: true, status: 200, text: async () => "" } as unknown as Response
  }
  function errResponse(status: number) {
    return { ok: false, status, text: async () => "boom" } as unknown as Response
  }
  const fetchMock = vi.fn().mockResolvedValue(okResponse())
  ```
- Sem imports `@web/*`: o helper é puro; os testes importam só de `./send-whatsapp-template` (e `type { WhatsAppConfig }` de `./send-whatsapp-message`)
- Verificar payload com `JSON.parse(init.body as string)` — mesma técnica usada nos testes existentes

### Por que `context` early return é o comportamento correto (AC3)

A call chain para `context` presente é:
```
Story 51-3 (agendamento): pipeline.ts → APPOINTMENT_CREATED → notifyBrokerOfAppointment → notifyBroker(context={title, body})
Story 51-4 (follow-ups): cron/followup → notifyBroker(context={title, body})
```

Nesses paths, o corretor recebe push + email via `notifyBroker`. O WhatsApp proativo com template errado ("você recebeu um novo lead") seria confuso e poderia irritar o corretor que está sendo avisado de um agendamento ou alert. Os templates corretos para esses casos precisam ser criados e aprovados na Meta antes de uma story futura poder ativá-los.

### Estrutura de call do `notifyImobiliaria` no código atual

Em `notify-broker.ts` linhas 175-183 (call legado a remover em T4):
```ts
(user.phone as string | null)
  ? sendBrokerWhatsApp(
      admin, orgId,
      user.phone as string,
      (user.name as string) ?? "",
      title,         // ← repurposado como "leadName" posicional (semântica errada)
      messageBody,   // ← repurposado como "leadPhone" posicional (semântica errada)
      leadUrl,
    ).catch((e: unknown) => console.error("[roleta] imob whatsapp error:", e))
  : Promise.resolve(),
```
Este bloco é substituído integralmente em T4.

---

## Testing

### Framework
Vitest (co-localizado, sem jest)

### Cenários obrigatórios — `send-whatsapp-template.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { sendWhatsAppTemplate } from "./send-whatsapp-template"
import type { WhatsAppConfig } from "./send-whatsapp-message"

const WA_CONFIG: WhatsAppConfig = { phone_number_id: "111222", access_token: "tok_abc" }

// helper builders inline (não exportar para produção)
const SAMPLE_COMPONENTS = [
  { type: "body" as const, parameters: [{ type: "text" as const, text: "Robson" }] },
  { type: "button" as const, sub_type: "url" as const, index: "0", parameters: [{ type: "text" as const, text: "uuid-lead-123" }] },
]
```

**Cenário 1** — config null → WHATSAPP_CONFIG_MISSING, fetch não chamado
**Cenário 2** — config sem access_token → WHATSAPP_CONFIG_MISSING
**Cenário 3** — HTTP 200 → `{ sent: true }` + payload JSON correto:
```ts
const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
const body = JSON.parse(init.body as string)
expect(body.type).toBe("template")
expect(body.template.name).toBe("novo_lead_corretor")
expect(body.template.language.code).toBe("pt_BR")
expect(body.template.components).toHaveLength(2)
expect(body.template.components[1].sub_type).toBe("url")
expect(body.template.components[1].index).toBe("0")
```
**Cenário 4** — HTTP 400 → `{ sent: false, error: "HTTP_400" }` sem throw
**Cenário 5** — fetch rejeita com `new Error("network down")` → `{ sent: false, error: "network down" }` sem throw
**Cenário 6** — `TimeoutError` (name="TimeoutError") → `{ sent: false, error: "TIMEOUT" }`
**Cenário 7** — `AbortError` (name="AbortError") → `{ sent: false, error: "TIMEOUT" }`

### Smoke pós-deploy (manual)

- Trigger roleta → novo corretor recebe WA do template `novo_lead_corretor` (mesmo sem janela de 24h aberta)
- Verificar no console da API Meta que o status do envio é "sent" (não "failed")
- Trigger com `context` presente (agendamento 51-3) → corretor recebe push + email, NÃO recebe WA (`sendBrokerWhatsApp` early return)
- Gestor da org recebe WA de template `aviso_roleta_gestor` em distribuição
- Cliente recebe WA de template `atualizacao_obra_cliente` ao ser adicionada foto a uma obra
- Envio de mensagem freeform do corretor ao lead (Story 51-1/51-5) continua funcionando normalmente (dispatch-broker-message intacto)

---

## Out of Scope

- Template WhatsApp para path `context` presente (agendamento de visita / follow-ups esgotados) — sem template aprovado para essa copy; follow-up quando Meta aprovar
- Template de boleto — GitHub issue #18, story separada
- Normalização de telefones de usuários/clientes para E.164 — dependência operacional #20
- Modificar `send-whatsapp-message.ts` ou `dispatch-broker-message.ts`
- Modificar fluxos freeform dentro da janela de 24h (Story 51-1, 51-5)
- Auditoria / logging de entrega dos templates (Meta callback de status) — fora do escopo

---

## Definition of Done

- [x] AC1–AC8 verificados
- [x] `pnpm --filter @trifold/web type-check` → 0 erros nos arquivos da story (erros pré-existentes em `visual-editor.tsx` por dep `react-email-editor` ausente — fora de escopo)
- [x] `npx vitest run packages/web/src/lib/whatsapp/` → todos os testes verdes (19 passed: 8 novos + 11 existentes)
- [x] `git diff packages/web/src/lib/whatsapp/send-whatsapp-message.ts` → vazio
- [x] `git diff packages/web/src/lib/broker/dispatch-broker-message.ts` → vazio
- [x] @qa executou quality gate com verdict PASS
- [x] @devops fez push

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — @dev (Dex), modo YOLO autônomo

### Debug Log References
- `npx vitest run packages/web/src/lib/whatsapp/send-whatsapp-template.test.ts` → 8 passed
- `npx vitest run packages/web/src/lib/whatsapp/` → 19 passed (2 arquivos: novos + `send-whatsapp-message.test.ts`)
- `pnpm --filter @trifold/web type-check` → 0 erros nos arquivos da story; 3 erros pré-existentes em `src/app/dashboard/sistema/email-templates/_components/visual-editor.tsx` (módulo `react-email-editor` não instalado — fora de escopo, não tocado por esta story)
- `eslint` nos 4 arquivos (novos + modificados) → 0 erros/warnings
- `git diff --stat` → apenas `notificacoes.ts` e `notify-broker.ts` modificados; `send-whatsapp-message.ts` e `dispatch-broker-message.ts` intactos

### Completion Notes
- **T1/T2:** Helper puro `sendWhatsAppTemplate` criado espelhando exatamente `send-whatsapp-message.ts` (zero imports `@web/*`/Supabase, `AbortSignal.timeout(15000)`, `errorCode` interno, nunca lança, `fetchImpl` injetável). Tipos `WhatsAppConfig`/`SendWhatsAppResult` reusados via import relativo de `./send-whatsapp-message`. 8 cenários de teste (config null/parcial, HTTP 200 com payload `type:"template"` validado, button component, HTTP 400, falha de rede, TimeoutError, AbortError).
- **T3 (AC2/AC3):** `sendBrokerWhatsApp` agora recebe `leadId` no lugar de `leadUrl`; early return quando `context` presente (sem fetch ao Graph API — push/email no caller `notifyBroker` permanecem intactos). Path da roleta envia template `novo_lead_corretor` com 3 params de body (broker/lead/phone) + button URL sufixo = `lead.id`. Call-site em `notifyBroker` atualizado para passar `lead.id`. `leadUrl` mantido pois ainda é usado por push e email.
- **T4 (AC4):** `notifyImobiliaria` fetcha `whatsapp_config` em paralelo com `users` (`Promise.all`); bloco WhatsApp agora usa `sendWhatsAppTemplate` com `aviso_roleta_gestor` (body: nome do gestor / messageBody / info do lead trimada; button sufixo = `lead.id`). Delegação legada posicional a `sendBrokerWhatsApp` removida. `leadUrl` mantido (push/email).
- **T5 (AC5):** `sendWhatsApp` em `notificacoes.ts` recebe `obraId` no lugar de `link`; `.single()` → `.maybeSingle()` (corretivo, não crasha org sem WA config); envia template `atualizacao_obra_cliente` (body: nome/obra/`EVENTO_LABEL[evento]`; button sufixo = `obraId`). Call-site em `notifyClientes` passa `obraId`. `link` mantido (ainda usado pelo email).
- **AC6:** Apenas os 3 templates aprovados referenciados (`novo_lead_corretor`, `aviso_roleta_gestor`, `atualizacao_obra_cliente`). Sem referência a boleto.
- **AC7:** `send-whatsapp-message.ts` e `dispatch-broker-message.ts` não tocados (git diff vazio confirmado).
- **Decisão de URL:** apenas o sufixo (UUID) é enviado no button parameter — a URL base está embutida no template Meta, conforme story.
- CodeRabbit: desabilitado no `core-config.yaml` (revisão manual via @qa).

### File List

#### A Criar
- `packages/web/src/lib/whatsapp/send-whatsapp-template.ts`
- `packages/web/src/lib/whatsapp/send-whatsapp-template.test.ts`

#### A Modificar
- `packages/web/src/lib/roleta/notify-broker.ts` (T3: `sendBrokerWhatsApp`; T4: `notifyImobiliaria`)
- `packages/web/src/lib/notificacoes.ts` (T5: `sendWhatsApp` + call-site em `notifyClientes`)

#### Referência (não modificar)
- `packages/web/src/lib/whatsapp/send-whatsapp-message.ts` — blueprint do helper; fonte dos tipos `WhatsAppConfig` e `SendWhatsAppResult`
- `packages/web/src/lib/broker/dispatch-broker-message.ts` — freeform corretor→lead (janela 24h); NÃO tocar
- `packages/web/src/lib/roleta/distributor.ts` — orquestra a roleta; chama `notifyBroker`; NÃO tocar

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | 0.1 | Story criada — migração dos 3 fluxos proativos de freeform para templates HSM aprovados na Meta (issue #17 Parte 2) | @sm (River) |
| 2026-06-22 | 0.2 | Implementação completa (T1-T6). Helper puro `sendWhatsAppTemplate` + 8 testes; refatoração dos 3 fluxos (roleta/gestor/obra) para templates HSM; early return em `context`; `.single()`→`.maybeSingle()`. type-check 0 erros em escopo, 19 testes verdes, arquivos de referência intactos. Status → Ready for Review | @dev (Dex) |
| 2026-06-22 | 0.3 | Quality gate executado por @qa — verdict **PASS** (AC1-AC8 verificados, 19 testes verdes, type-check limpo no escopo, arquivos de referência intactos). Gate file gerado. | @qa (Quinn) |
| 2026-06-22 | 1.0 | Pre-push gates revalidados (type-check limpo no escopo, 19/19 vitest); commit seletivo dos 6 arquivos; push da branch `feat/epic-51-handoff-chat-corretor`. Status → Done. | @devops (Gage) |

---

## QA Results

### Review Date: 2026-06-22

### Reviewed By: Quinn (Test Architect)

### Resumo

Story migra os 3 fluxos proativos de WhatsApp (roleta→corretor, distribuição→gestor, obra→cliente) de freeform `type:"text"` para templates HSM aprovados na Meta. Implementação fiel ao spec, robusta e bem isolada. Helper puro `sendWhatsAppTemplate` espelha exatamente o blueprint `send-whatsapp-message.ts` (nunca lança, `AbortSignal.timeout(15000)`, `fetchImpl` injetável, `errorCode` interno).

### 7 Quality Checks

| Check | Status | Nota |
|-------|--------|------|
| 1. Code review | PASS | Tipos discriminados (`WhatsAppTemplateComponent`); comentários rastreiam ACs; sem `@web/*`/Supabase no helper |
| 2. Unit tests | PASS | 19 passed (8 novos + 11 existentes), 2 arquivos |
| 3. Acceptance criteria | PASS | AC1-AC8 verificados contra o código real |
| 4. No regressions | PASS | `send-whatsapp-message.ts` e `dispatch-broker-message.ts` com diff vazio (AC7) |
| 5. Performance | PASS | WA config de `notifyImobiliaria` agora em paralelo (`Promise.all`) — melhora latência |
| 6. Security | PASS | Sem secrets hardcoded; `access_token` via `waConfig` resolvido; só o UUID no botão (não a URL completa) |
| 7. Documentation | PASS | Dev Notes/Completion Notes completos; AUTO-DECISIONs documentadas |

### Verificação de ACs

- **AC1** — Helper puro `sendWhatsAppTemplate`: assinatura correta, tipos relativos de `./send-whatsapp-message`, `WHATSAPP_CONFIG_MISSING` sem fetch, nunca lança. ✓
- **AC2** — Fluxo 1 `novo_lead_corretor` (`pt_BR`): body `[brokerName, leadName, leadPhone]`, button `sub_type:"url"` index `"0"` sufixo = `leadId`; freeform removido. ✓
- **AC3** — `if (context) return` em `notify-broker.ts:101` antes de qualquer fetch; push/email no caller `notifyBroker` intactos. ✓
- **AC4** — Fluxo 2 `aviso_roleta_gestor`: WA config em `Promise.all` com `users`; body `[name??"", messageBody, "name — phone".trim()]`; button sufixo = `lead.id`; delegação legada posicional removida. ✓
- **AC5** — Fluxo 3 `atualizacao_obra_cliente`: `obraId` substitui `link`; `.single()`→`.maybeSingle()`; body `[nome??"", obraName, descricao]`; button sufixo = `obraId`. ✓
- **AC6** — Apenas os 3 templates aprovados referenciados; sem boleto. ✓
- **AC7** — Diff vazio nos 2 arquivos de referência. ✓
- **AC8** — type-check 0 erros no escopo (3 erros pré-existentes em `visual-editor.tsx`/`react-email-editor` — fora de escopo); 8 cenários de teste cobertos. ✓

### Validações executadas

- `npx vitest run packages/web/src/lib/whatsapp/` → **2 arquivos / 19 testes passed**
- `pnpm --filter @trifold/web type-check` → **0 erros no escopo** (3 erros pré-existentes em `visual-editor.tsx`, módulo `react-email-editor` ausente — não tocado por esta story)
- `git diff --stat HEAD` → apenas `notificacoes.ts` e `notify-broker.ts` modificados; `send-whatsapp-message.ts` e `dispatch-broker-message.ts` intactos

### Observações (não bloqueantes)

- **MNT-001 (low):** Deep links de email/push usam `NEXT_PUBLIC_APP_URL` (fallback `https://app.trifold.com.br`) enquanto a base dos botões dos templates HSM é `https://crm.trifold.eng.br` (embutida no painel Meta). Divergência de domínio pré-existente entre canais — fora do escopo desta story; sugerido alinhar em follow-up operacional.

### Gate Status

Gate: PASS → docs/qa/gates/51.8-whatsapp-proativo-template-hsm.yml
