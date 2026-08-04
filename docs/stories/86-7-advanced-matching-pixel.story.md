# Story 86-7 — Advanced Matching no Meta Pixel (AAM + external_id/em/ph)

**Status:** Ready
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Prioridade:** P1
**Depende de:** 86-5 (landing/pixel básico existe), 86-6 (dados de atribuição sendo capturados)

## Contexto

A auditoria identificou match quality em 3.9/10 no Events Manager — nada no
código atual controla o Advanced Matching do Pixel, porque não há Pixel no
browser deste repo (é tudo WordPress). Com a landing própria (86-5) e a
captura de atribuição (86-6) resolvidas, esta story fecha o ciclo do lado do
browser: habilita o **Automatic Advanced Matching (AAM)** e passa
explicitamente `external_id` (lead_id), `em` (e-mail) e `ph` (telefone) no
`fbq('init')`, que é — segundo a auditoria — o conjunto de campos que mais
sobe o EMQ.

Isso é puramente sobre o Pixel do browser (evento `PageView`/`Lead` client-side
na landing 86-5) — não altera o evento server-side "Visitou" (que já usa
`external_id`/`em`/`ph` desde a Story 86-3, no lado da CAPI).

## Acceptance Criteria

1. **AC1 — Automatic Advanced Matching habilitado.** O `fbq('init', ...)` na
   landing page (Story 86-5) é atualizado para habilitar AAM — conforme a
   documentação oficial do Meta Pixel, isso é feito automaticamente pelo
   Pixel Base Code quando não há dados manuais suficientes, mas o objetivo
   aqui é o **manual matching explícito** (AC2), que tem prioridade e
   qualidade maior que o automático. Confirmar na doc atual do Meta (ao
   implementar) se AAM automático precisa de um parâmetro de init separado
   ou se é sempre ativo por padrão nesta versão do Pixel — documentar o
   achado.
2. **AC2 — `external_id`/`em`/`ph` passados no `fbq('init')` quando
   disponíveis.** Quando o usuário já é um lead conhecido no momento em que
   a página carrega (cenário improvável nesta landing de captura — mais
   relevante seria depois da submissão do form, ver AC3) ou quando há dados
   pré-preenchidos, o `init` inclui:
   ```js
   fbq('init', '1337310707164669', {
     external_id: <lead_id, se conhecido>,
     em: <email, se conhecido>,
     ph: <telefone normalizado, se conhecido>
   });
   ```
   Nota: o Pixel faz o hashing desses campos automaticamente no client antes
   de enviar — **não hashear manualmente no browser** (diferente do módulo
   server-side da Story 86-3, que hasheia explicitamente porque fala direto
   com a API CAPI sem o SDK do Pixel fazer isso por ele).
3. **AC3 — `fbq('track', 'Lead', ...)` inclui `external_id` pós-submissão.**
   Como na maioria dos casos o `lead_id` só existe **depois** da submissão
   do formulário (a API cria o lead e retorna o ID), o disparo de
   `fbq('track', 'Lead', ...)` feito no callback de sucesso (Story 86-5, AC5)
   é estendido para re-invocar `fbq('init', DATASET_ID, { external_id: leadId, em, ph })`
   imediatamente antes do `track`, atualizando o matching daquele visitante
   específico com os dados recém-coletados do formulário.
4. **AC4 — Normalização client-side consistente com o server-side.** O
   telefone passado para `ph` no browser é normalizado com a mesma lógica
   conceitual de `normalizePhoneBR` (Story 86-3) — se possível, reexportar
   um helper de `@trifold/shared` que funcione tanto em Node quanto no
   browser (confirmar que `normalizePhoneBR` não depende de nada exclusivo
   de Node antes de reusar no client; se depender, replicar a lógica de
   formato sem duplicar regras de negócio, ou extrair uma função isomórfica).
5. **AC5 — EMQ mensurável após a mudança.** Não é possível automatizar este
   AC (depende do painel do Meta, que demora dias para recalcular o EMQ com
   volume suficiente de eventos) — o AC é tratado como validação manual
   pós-deploy, documentada como item de acompanhamento (não bloqueia o
   merge da story): revisar o EMQ do Dataset no Events Manager 1-2 semanas
   após o deploy e confirmar melhoria em relação ao baseline de 3.9/10.
6. **AC6 — Sem regressão no fluxo de submissão do formulário.** As mudanças
   desta story são estritamente adições ao redor de `fbq(...)` — nenhuma
   mudança na lógica de criação de lead, validação de formulário, ou
   navegação. Falha do Pixel (ou de `fbq` indisponível) continua não
   bloqueando a submissão (herda o AC7 da Story 86-5).

## Tasks

- [ ] **T1 (AC1)** — Pesquisar o comportamento atual do AAM no Meta Pixel
  Base Code (documentação oficial, verificar no momento da implementação —
  pode ter mudado desde a auditoria) e confirmar se algum parâmetro de
  `init` precisa ser setado explicitamente ou se é automático.
- [ ] **T2 (AC2, AC3)** — Implementar a passagem de `external_id`/`em`/`ph`
  no `fbq('init')` inicial e a reinvocação pós-submissão com os dados do
  lead criado.
- [ ] **T3 (AC4)** — Garantir normalização de telefone consistente entre
  client e server (extrair helper isomórfico se necessário).
- [ ] **T4 (AC6)** — Testes/revisão manual confirmando que o formulário
  continua funcionando normalmente com Pixel ativo e com Pixel bloqueado.
- [ ] **T5 (AC5)** — Criar um item de acompanhamento (não uma task de
  código) para revisar o EMQ 1-2 semanas pós-deploy — registrar como nota
  de Change Log ou lembrete para o @po/@pm.

## Dev Notes

### Diferença entre hashing no browser (Pixel SDK) e no server (CAPI direta)
[Fonte: auditoria @analyst] O Meta Pixel SDK (`fbq`) faz o hashing SHA-256
dos campos de Advanced Matching **internamente**, antes de enviar ao Meta —
o código desta story passa os valores em **texto puro** para `fbq('init', ...)`.
Isso é o oposto do módulo server-side (Story 86-3), que hasheia manualmente
porque fala direto com o endpoint `/events` da CAPI sem o SDK do Pixel
mediando. Não confundir os dois padrões — cada canal (browser vs. servidor)
tem sua própria responsabilidade de hashing.

### `external_id` é o dado que mais sobe o EMQ
[Fonte: auditoria @analyst] Entre todos os campos de matching, `external_id`
(o identificador interno do lead) é o que a documentação do Meta aponta como
mais impactante para o Event Match Quality — daí ser destacado como AC
próprio (AC2/AC3) em vez de apenas mencionado en passant.

### Dependência de 86-5 e 86-6
Esta story não introduz nenhuma rota nova nem schema novo — é uma extensão
cirúrgica do código de Pixel já criado na Story 86-5, usando os dados de
lead (id, email, phone) já disponíveis no fluxo de submissão daquela story e
os dados de atribuição da Story 86-6 (indiretamente — o `fbc`/`fbp` já
capturados por 86-6 não são afetados aqui, que foca em `external_id`/`em`/`ph`).

### Testing
- Manual: usando Meta Pixel Helper (extensão), confirmar que o evento `Lead`
  disparado após submissão do formulário inclui os parâmetros de Advanced
  Matching esperados (a extensão mostra os campos hasheados enviados).
- Manual: confirmar que bloquear o Pixel (ad blocker) não impede a
  submissão do formulário (regressão do AC6, herdada da 86-5).
- Acompanhamento (não bloqueante): revisão de EMQ no Events Manager
  1-2 semanas pós-deploy.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via revisão manual do @dev + @qa gate.

**Story Type:** Frontend (Pixel/Advanced Matching) — extensão cirúrgica sem schema/API novos.
**Complexidade:** Low — escopo estritamente aditivo em torno de chamadas `fbq(...)` já existentes da Story 86-5.
**Focus Areas:** Nenhum hashing manual client-side (delegar ao SDK do Pixel), normalização de telefone consistente entre client/server, sem regressão na submissão do formulário.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta — fecha o objetivo de subir o EMQ acima de 3.9/10. | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 8/10. Draft → Ready. Escopo estritamente aditivo em torno de `fbq(...)` da 86-5, dependências (86-5, 86-6) corretas. Distinção crítica browser-hash-pelo-SDK vs. server-hash-manual (86-3) está bem explicada — evita o erro clássico de hashear duas vezes. AC5 (EMQ) corretamente tratado como acompanhamento manual não bloqueante. Nota: T4 (isomorfia de `normalizePhoneBR`) — confirmado que a função não usa nada exclusivo de Node (regex/string puro), então é reutilizável no client sem extração especial. | @po (Pax) |
