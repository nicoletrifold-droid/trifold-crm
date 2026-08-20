# Story 75-354 — O aviso de lead parado não chegava ao corretor, e falhava sem deixar rastro

**Status:** InReview — gate PASS · ⏳ **template `lead_parado_corretor` PENDING na Meta** (criado 20/08 11:5x UTC)
**Tipo:** Entrega que não acontecia + falha silenciosa (a pior combinação)
**Epic:** 75 — CRM Trifold
**Complexidade:** S/M (~3 pts — 1 função de envio, 1 chamador, 1 template na Meta)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** nenhuma.
**Depende de:** PRs #462 (75-351), #463 (75-352), #464 (75-353). Esta branch nasce da 353.

## O defeito

`notifyBroker` tem dois caminhos de WhatsApp, e a diferença entre eles nunca foi
intencional:

| Caminho | Como enviava | Entrega fora da janela de 24h? |
|---|---|---|
| Roleta → corretor (sem `context`) | template `novo_lead_corretor` | ✅ sim (38 msgs/semana) |
| Avisos com `context` (agendamento 51-3, **lead parado 51-4**) | **texto livre** | ❌ não |

O aviso de lead parado é justamente o do `context`. Ele batia na janela de 24h do
WhatsApp **do próprio corretor** — que quase nunca escreve para o número da empresa,
porque o número da empresa é por onde ele atende cliente, não por onde ele fala com o
sistema. Resultado: não entregava.

**E pior que não entregar: não deixava rastro.** `sendBrokerWhatsApp` não chamava
`logWhatsappSend` em nenhum caminho, e o erro morria num `console.error` dentro de um
`.catch()`. Nada em `whatsapp_send_log`, nada em `system_events`. Push e e-mail
funcionavam, então o alerta "existia" — só a perna do WhatsApp é que era ficção.

Volume do aviso em 30 dias (`follow_up_log`, tipo `alert_broker`): **224** na etapa
Atendimento, 31 em Visita Agendada, 22 em Visitou.

## AC1 — O aviso vai por template aprovado

Template novo, criado na Meta em 20/08 e modelado no `novo_lead_corretor` que já
entrega:

```
Olá {{1}}! O lead {{2}} está sem resposta há {{3}} dia(s) após os follow-ups da Nicole. Vale uma ligação.
*Trifold*
[Botão URL] Ver lead → https://crm.trifold.eng.br/broker/leads/{{1}}
```

**Categoria UTILITY** — a Meta aceitou como utility, então é aviso operacional, não
divulgação: não entra na cota nem no custo de marketing, e não depende de opt-out.

## AC2 — Quem tem template usa template; quem não tem, não regride

`context` ganhou um campo opcional `template: { name, params }`. Quem informa (o
aviso de lead parado) sai por HSM e entrega dentro e fora da janela. Quem não informa
(o aviso de agendamento da 51-3, que não tem template dedicado) **continua exatamente
como estava** — texto livre, entregando só dentro da janela.

Não inventei template para o fluxo de agendamento: ele merece o mesmo tratamento, mas
é decisão de copy de quem opera, e vira story própria em vez de eu escolher o texto
que o corretor lê.

## AC3 — Falha de WhatsApp ao corretor deixa de ser invisível

Duas camadas, porque cada uma responde uma pergunta diferente:

- `logWhatsappSend` (sucesso e falha do template) → responde **quanto custou e o que
  foi entregue**;
- `logEvent` `BROKER_WHATSAPP_FALHOU` level `error` no `.catch()` compartilhado →
  responde **que o corretor não recebeu**, valendo para os três caminhos (template do
  aviso, template da roleta e texto livre).

O `console.error` continua ali, mas agora ele é o secundário. Em produção ninguém
abre o log da Vercel — foi essa exata aposta que custou 29 dias na 75-350.

## Dev Agent Record

- [x] AC1 — template `lead_parado_corretor` criado na Meta (UTILITY, pt_BR, botão de URL dinâmica).
- [x] AC2 — `context.template` opcional; caminho sem template inalterado.
- [x] AC3 — `logWhatsappSend` + `BROKER_WHATSAPP_FALHOU`.

### Decisões de implementação

- **Template em vez de checar a janela do corretor.** Daria para tentar descobrir se a
  janela dele está aberta, mas não existe conversa registrada para o número do
  corretor (ele não é lead): a informação não está no banco. Template resolve sem
  precisar da informação — entrega nos dois casos.
- **`params` na ordem do template, coberto por teste.** Inverter `{{1}}` e `{{2}}`
  manda *"Olá Maria Silva! O lead Corretor João…"* para o corretor — mensagem
  entregue, paga e invertida. É o tipo de erro que só um teste pega, e agora há dois
  (ordem e fallback para gerente).
- **Categoria `utility` no log.** Igual ao `novo_lead_corretor`/`alerta_sla_gestor`,
  que são a mesma natureza de aviso.

### Validações

`npx vitest run` 233 arquivos / **2.826 testes** ✅ (2 novos) · `type-check` 8/8 ✅ ·
`eslint` 0 erros nos arquivos tocados

## File List

- `packages/web/src/lib/roleta/notify-broker.ts` — AC1/AC2/AC3
- `packages/web/src/lib/broker/notify-stalled-lead.ts` — AC1/AC2
- `packages/web/src/app/api/cron/followup/notify-alert.test.ts` — AC2 (ordem dos params)
- `docs/qa/gates/75-354-corretor-por-template.yml` *(novo)*

## ⛔ Não mergear antes da Meta aprovar

O template está **PENDING**. Aprovação costuma sair em ~9 min (histórico do projeto),
e o estado é consultável:

```bash
GET /v21.0/{waba_id}/message_templates?name=lead_parado_corretor&fields=name,status,rejected_reason
```

Se subir antes da aprovação, o envio devolve erro da Graph API por template
inexistente/não aprovado. O comportamento é seguro (push e e-mail seguem, e agora a
falha aparece em `BROKER_WHATSAPP_FALHOU`), mas o corretor continua sem WhatsApp — ou
seja, o deploy não entregaria o que a story promete.

**Convenção que vale aqui:** template aprovado nunca é editado — se a cópia mudar,
cria-se `lead_parado_corretor_v2` e troca-se o nome no código.

## Verificar depois do deploy

1. **Aprovação:** `status: APPROVED` no GET acima.
2. **Entrega:** depois do primeiro `alert_broker` pós-deploy —
   ```sql
   select created_at, status, error from whatsapp_send_log
    where template = 'lead_parado_corretor' order by created_at desc limit 10;
   ```
   `sent` = o corretor recebeu. É a primeira vez que essa perna é verificável.
3. **Falha visível:** `select count(*) from system_events where event_type = 'BROKER_WHATSAPP_FALHOU' and created_at > now() - interval '1 day';`
   Diferente de zero não é regressão — é a falha que já existia, agora visível.
