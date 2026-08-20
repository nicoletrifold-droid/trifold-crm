# Story 75-353 — O follow-up finalmente ENTREGA: template HSM fora da janela de 24h

**Status:** InReview — gate PASS · **migration 235 NÃO aplicada** (ver "Ordem de deploy")
**Tipo:** Defeito de desenho (a condição que dispara o follow-up é a que proíbe a entrega)
**Epic:** 75 — CRM Trifold
**Complexidade:** M/L (~8 pts — 1 migration, 1 função pura, remetente, cron, webhook, tela)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** **235** (`follow_up_rules.hsm_template` + `hsm_min_days`, `leads.marketing_optout_at`) — additiva.
**Depende de:** PR #462 (75-351) e PR #463 (75-352). Esta branch nasce da 352.

## O defeito, em uma frase

**O follow-up manda texto livre, e a Meta só aceita texto livre nas 24h seguintes à
última mensagem DO LEAD** — mas follow-up existe justamente para o lead que ficou
calado. A condição que dispara é a mesma que proíbe entregar.

Medido em produção (20/08):

| Medida | Valor |
|---|---|
| Entregas ao lead em 20 dias | **0** |
| Tentativas puladas (`WHATSAPP_WINDOW_CLOSED`) | **~4.700** |
| Etapa "Atendimento", 7 dias | 1.560 tentativas / 46 leads |
| Etapa "Visitou" · "Visita Agendada" | 312 / 7 · 244 / 12 |

O próprio código já admitia o buraco: *"Approved templates (HSM) for the
out-of-window case are explicit backlog"*.

## Decisão do Marcos (20/08): sim, automatizar

Reabrir janela de lead frio com os templates `abertura_*` (categoria **MARKETING**),
que já estão aprovados e já entregam ~128 mensagens/semana pelo botão manual
"Iniciar atendimento". A contrapartida que ele pediu implicitamente ao dizer "sim" e
que eu tratei como parte do escopo: **marketing automático sem freio é spam, e spam
derruba a nota de qualidade da WABA**, que é o ativo de entrega da empresa inteira.

Daí os dois freios que nasceram junto: cap de frequência por lead e opt-out de
verdade (não existia **nenhuma** coluna de opt-out em `leads` — conferido).

## 🔥 O que mudou o plano no meio do caminho

O plano original dizia "dar template para as regras de Visita Agendada e Visitou".
Conferindo antes de escrever código, os dados reprovaram a ideia:

1. **A mensagem de visita já tem dono, e não é o follow-up.** O cron
   `appointment-whatsapp-reminders` manda `lembrete_visita_cliente` /
   `lembrete_visita_corretor` 24h e 3h antes, por template aprovado, com horário de
   bom senso (08–20 BRT) e catch-up. Conferido em produção: os flags
   `whatsapp_reminded_24h` / `_3h` estão gravados em **todos** os agendamentos de
   13 a 18/08.
2. **Dos 9 leads na etapa "Visita Agendada", 4 já tiveram a visita e não têm nada
   agendado à frente.** Para eles, o texto da regra — *"só confirmando sua visita ao
   X amanhã"* — é **falso**. Dar template àquela regra automatizaria uma mentira.
3. **A regra de "Visitou" duplica o caminho `post_visit`**, que já dispara a partir
   de agendamento `completed`.

**Feito em produção hoje (config, decisão do Marcos):** `nicole_takeover_days = 9999`
nas regras de **Visita Agendada** e **Visitou**.

**Por que não `is_active = false`:** cada regra alimenta DOIS ramos, e desligar
levaria também o alerta "lead parado" ao corretor — que funciona (30 dias:
Atendimento 224 · Visita Agendada 31 · Visitou 22, com push e e-mail entregando).
Com `9999`, o ramo da Nicole nunca dispara e o ramo do alerta continua intacto.
Reversível na tela Pipeline → Config; `message_template` intocado.

**A regra que fica escrita:** mensagem SOBRE VISITA sai só pelo cron de lembretes.
O follow-up não fala de visita.

## AC1 — Fora da janela, sai template aprovado (e só aí)

`sendFollowUpMessage` recebe um `fallbackTemplate` opcional. Dentro da janela, texto
livre como sempre (não gasta template pago). Fora da janela: **com** template
configurado, entrega por HSM; **sem**, o comportamento anterior, idêntico.

O resultado agora diz **como** saiu (`via: "freeform" | "template"` + nome do
template), porque quem chama precisa gravar na conversa o que o lead de fato leu.

## AC2 — A decisão de mandar é uma função pura, e são 5 freios

`lib/followup/template-fallback.ts` — sem I/O, testada sem banco e sem rede (o
projeto não tem jsdom; mesmo padrão de `post-visit-record` / `no-show-decision`):

| Freio | Motivo devolvido |
|---|---|
| Etapa não configurou template | `REGRA_SEM_TEMPLATE` |
| Lead pediu para parar | `LEAD_EM_OPT_OUT` (vence tudo, checado primeiro) |
| Recebeu template há menos de N dias | `CAP_DE_FREQUENCIA` (+ dias restantes) |
| Template que o código não sabe preencher | `TEMPLATE_DESCONHECIDO` |
| Template não aprovado na Meta nesta run | `TEMPLATE_NAO_APROVADO` |

## AC3 — Cap de frequência por lead (default 7 dias)

O cooldown de 48h do follow-up é curto demais para MARKETING: sem teto, lead frio
receberia template a cada 2 dias indefinidamente. O cap é lido de
`follow_up_log.metadata->>'template'` em lote (uma query por regra, só quando a
regra usa template) e é configurável por etapa na tela.

## AC4 — Opt-out que existe de verdade

Coluna nova `leads.marketing_optout_at`, respeitada antes de qualquer envio de
template. E capturada onde ela realmente chega: o botão nativo **"Parar promoções"**
dos templates de marketing entra pelo webhook do WhatsApp como texto comum.

O casamento é **deliberadamente estreito** — frase inteira, com tolerância a acento,
pontuação e "por favor", nunca "contém a palavra". *"Pode parar de chover que eu vou
visitar"* não é opt-out, e **calar um lead que quer conversar é pior que o spam que
se está tentando evitar**. Coberto por teste, inclusive o caso quase-armadilha *"não
quero mais receber ligação, prefiro whatsapp"*.

Grava com `.is("marketing_optout_at", null)` + `.select()`: preserva a data do
PRIMEIRO pedido, resolve em uma ida ao banco, e a atividade não duplica se o lead
repetir o pedido.

## AC5 — A conversa mostra o que o lead leu

Quando sai por template, a linha em `messages` recebe o **corpo do template
renderizado** (buscado da Meta nesta run, via `renderOpeningBody`), não o texto livre
que ficou no caminho. Espelho fiel é a regra desde a 75-166. A atividade também
distingue: *"enviou follow-up por template X (fora da janela de 24h)"*, e quando não
enviou, diz o motivo em português — inclusive *"lead pediu para nao receber"*.

## AC6 — Custo e falha de template deixam de ser invisíveis

`whatsapp_send_log` passa a registrar os envios de template do follow-up (sucesso e
falha). **E o achado de fora do escopo:** `sendVisitTemplate` **nunca** registrou
nada — a tabela não tinha uma linha de `lembrete_visita_cliente` em 7 dias, embora os
flags provem que os lembretes saíram. Custo e taxa de falha do caminho de visita
estavam cegos; agora registram (`recipient_type` distingue lead de corretor).

## AC7 — Quem escolhe o template é quem opera a tela

Pipeline → Config ganha, por etapa: **"Fora da janela de 24h, enviar template"**
(select com os templates que o código sabe preencher, default "Não enviar") e
**"Intervalo mínimo entre templates (dias)"**. Nada é ligado por esta story — o
deploy é neutro até alguém escolher um template na tela.

Lição aplicada da 89: não cortar a UX por escopo sem perguntar quem opera a tela.

## Dev Agent Record

- [x] AC1 — `fallbackTemplate` no remetente; `via`/`template` no resultado.
- [x] AC2 — `decidirTemplateDoFollowUp` pura, com os 5 freios.
- [x] AC3 — cap por lead, em lote, configurável.
- [x] AC4 — `marketing_optout_at` + captura no webhook + casamento estreito.
- [x] AC5 — espelho do corpo real na conversa + atividade que diz o motivo.
- [x] AC6 — `whatsapp_send_log` no follow-up e nos lembretes de visita.
- [x] AC7 — dois campos por etapa na tela de config.

### Decisões de implementação

- **Reuso em vez de criação** (nada de constante duplicada — lição registrada):
  `OPENING_TEMPLATE_PARAMS`, `resolveOpeningParams` e `renderOpeningBody` (75-217)
  são a fonte de quais variáveis cada template tem e de como renderizar; o
  transporte é o `sendWhatsAppTemplate` (75-142). Template novo continua exigindo o
  registro naquele mapa — sem isso, sairia mensagem com variável vazia.
- **Aprovação é fato da Meta, não do banco.** Uma chamada por run lista os
  aprovados; se falhar, **nenhum** template sai naquela run (`FOLLOWUP_TEMPLATES_
  INDISPONIVEIS`, level error) e o texto livre dentro da janela segue normal. Mandar
  sem validar renderia erro 132000 — pago.
- **Categoria `marketing` literal no call-site**, igual ao que `start-whatsapp` já
  faz para os mesmos templates. Não inventei um mapa novo de categoria.
- **O cap lê `metadata->>'template'`**, que só existe porque a 75-352 passou a
  gravar o desfecho na linha reivindicada. As duas stories se encaixam: sem o claim
  da 352, duas runs concorrentes furariam o cap.

### Validações

`npx vitest run` 233 arquivos / **2.824 testes** ✅ (18 novos) · `type-check` 8/8 ✅ ·
`eslint` 0 erros (3 warnings pré-existentes)

**Migration validada em produção, em transação REVERTIDA:** 2 colunas em
`follow_up_rules`, 1 em `leads`, índice criado, `hsm_min_days` default 7 —
e **0 regras com template depois de aplicar**, que é a prova de que o deploy da
migration não muda comportamento nenhum.

## File List

- `supabase/migrations/235_followup_template_hsm_e_optout.sql` *(novo — não aplicada)* — AC3/AC4
- `packages/web/src/lib/followup/template-fallback.ts` *(novo)* — AC2/AC4
- `packages/web/src/lib/followup/template-fallback.test.ts` *(novo)* — 13 testes
- `packages/web/src/lib/whatsapp/send-followup-message.ts` — AC1/AC6
- `packages/web/src/lib/whatsapp/send-followup-message.test.ts` *(novo)* — 5 testes
- `packages/web/src/app/api/cron/followup/route.ts` — AC1/AC3/AC5
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — AC4
- `packages/web/src/lib/appointments/visit-whatsapp.ts` — AC6
- `packages/web/src/app/api/cron/appointment-whatsapp-reminders/route.ts` — AC6
- `packages/web/src/app/dashboard/pipeline/config/page.tsx` — AC7
- `docs/qa/gates/75-353-template-hsm-no-followup.yml` *(novo)*

## Ordem de deploy (obrigatória)

**A migration 235 tem de estar aplicada ANTES do código subir.** O `select` dos leads
no cron passa a pedir `marketing_optout_at`: sem a coluna, o PostgREST reprova o
select inteiro, `leads` vem nulo e **o follow-up para de processar** — em silêncio,
porque `if (!leads) continue`.

Sequência: **aplicar 235 → mergear #462 → mergear #463 → mergear este PR**.

## Verificar depois do deploy

1. **Neutralidade** — antes de configurar qualquer template, o recibo do cron tem de
   mostrar `entregas_por_template: 0` e o comportamento de hoje.
2. **A primeira entrega de verdade** (depois de escolher um template na tela):
   ```sql
   select created_at, status, metadata->>'via', metadata->>'template'
     from follow_up_log where type='nicole_sent' order by created_at desc limit 20;
   ```
   Aparecer `via: template` com `status: sent` é a primeira entrega de follow-up em
   mais de 20 dias.
3. **O custo aparece** — inclusive dos lembretes de visita, que antes eram cegos:
   ```sql
   select template, category, status, count(*) from whatsapp_send_log
    where created_at > now() - interval '2 days' group by 1,2,3 order by 4 desc;
   ```
4. **O freio funciona** — nenhum lead com dois templates dentro do `hsm_min_days`:
   ```sql
   select lead_id, count(*) from follow_up_log
    where metadata->>'template' is not null and created_at > now() - interval '7 days'
    group by 1 having count(*) > 1;
   ```
   Zero linhas.
5. **Opt-out chegando** — `select count(*) from leads where marketing_optout_at is not null;`
   deve sair de 0 conforme os leads usarem o botão. Se ficar em 0 por semanas **com
   template ativo**, o casamento de texto está estreito demais e vale rever.
