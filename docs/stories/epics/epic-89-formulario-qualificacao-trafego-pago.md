---
epic: 89
title: Formulário de qualificação para tráfego pago (com agenda no fim)
status: Draft
created_at: 2026-08-17
updated_at: 2026-08-17
created_by: Morgan (@pm)
priority: P1 (aquisição — substitui ferramenta paga externa e muda o sinal de otimização do Meta)
pedido_original: >
  Marcos, 17/08/2026 — "criar um formulário para colocarmos em nossas campanhas de tráfego
  pago, para leads ultra qualificados, com perguntas que evoluem conforme as respostas, e no
  final quem fizer sentido já pode marcar a visita no decorado pela agenda. No passado usei
  YayForms + Calendly + Google Agenda. Sigo nisso ou montamos dentro do CRM? E até fazer
  análise de sentimento conforme as respostas, se for necessário."
decisao_de_arquitetura: >
  Construir dentro do CRM. Não é decisão de preferência: a peça cara (agenda pública por
  token, com horários reais e espelho no Google) JÁ EXISTE em produção desde a Story 81-4 e
  está sendo reusada, não reescrita. Ver §2.
decisoes_do_diretor:
  data: 17/08/2026
  itens:
    - id: D1
      pergunta: O horário fica bloqueado na hora ou só depois do SDR confirmar?
      decisao: BLOQUEIA NA HORA. A visita nasce `scheduled`, some da lista de livres e espelha no Google.
      motivo: Evita dois leads marcando o mesmo horário no decorado enquanto ninguém confirmou.
    - id: D2
      pergunta: Todo mundo vê a agenda no fim, ou existe um piso de qualificação?
      decisao: TODOS, SEM EXCEÇÃO. Nenhuma resposta esconde a agenda.
      motivo: >
        Máximo de visitas marcadas. O custo aceito é o SDR desmarcar algumas. Mitigação
        obrigatória: o score é GRAVADO desde o dia 1 mesmo sem ser usado para nada (ver §6),
        para que ligar um corte no futuro seja mudar um número, não refazer a tela.
    - id: D3
      pergunta: Quem recebe o lead que agendou pelo formulário?
      decisao: SDR (Thielly) abre e confirma; DEPOIS vai para a roleta.
      motivo: Mantém a decisão de 04/08 ("todo lead passa pelo SDR humano") intacta.
      revisado_em: 17/08/2026
      revisao: >
        SIMPLIFICADA pelo Marcos ao ver o custo da versão original. NÃO existe passo de
        confirmação e NÃO há entrega à roleta. O lead agenda, a visita cai na agenda, o SDR
        fica como responsável e **transfere manualmente** para um corretor quando fizer
        sentido. Some a tela de confirmar (que seria construção nova), some a chamada ao
        distribuidor e some a migration na `roleta_pick_and_advance`.
      o_que_isso_resolve: >
        A versão original esbarrava em duas coisas achadas na validação da 75-331: (1) o
        distribuidor desiste se o lead já tem dono (`distributor.ts:86-88`), então carimbar o
        SDR mataria a entrega à roleta em silêncio; (2) a Thielly está no pool da roleta e a
        RPC não tem parâmetro de exclusão, então a roleta poderia devolver o lead para ela
        mesma. Sem roleta neste fluxo, os dois problemas deixam de existir.
      pre_requisito_operacional: >
        ⚠️ MEDIDO EM PROD (17/08): o perfil `sdr` está com `leads.transferir = false` — só
        `admin` e `supervisor` transferem. Do jeito que está, a Thielly NÃO consegue transferir.
        É um toggle na matriz de Perfis de Acesso (tela já existente), não código. Alternativa
        sem mexer em nada: quem transfere é admin/supervisor.
substitui:
  - YayForms (formulário) — sai
  - Calendly (agenda) — sai
  - Google Agenda — FICA (já integrado via `lib/appointments/google-mirror.ts`)
---

# Epic 89 — Formulário de qualificação para tráfego pago

## 1. O problema

O funil de tráfego pago hoje entrega o lead cru: o anúncio capta nome/telefone e alguém
descobre depois, na conversa, se aquela pessoa tem perfil. Três consequências:

1. **O corretor qualifica no braço.** Cada lead consome tempo humano antes de se saber se
   valia o tempo humano.
2. **O Meta otimiza pelo sinal errado.** Ele aprende com "preencheu formulário", que é barato
   e abundante. Quem agenda visita é um sinal muito mais raro e muito mais correlacionado com
   venda — e hoje esse sinal não volta para a plataforma de forma confiável.
3. **A stack está fora de casa.** YayForms + Calendly significam duas assinaturas, uma
   integração no meio (mais um lugar onde lead se perde, como já aconteceu com o webhook do
   meta-ads) e resposta de qualificação que não chega à ficha do lead.

## 2. Por que dentro do CRM (o que já existe)

Este epic é majoritariamente **reuso**. O que já está em produção e vai ser aproveitado:

| Peça | Onde | O que faz |
|------|------|-----------|
| Rota pública por token | `packages/web/src/lib/supabase/middleware.ts:115` | `isPublicRoute` — padrão já validado (`/agendar/*`, `/pasta/*`) |
| Página pública de agendamento | `packages/web/src/app/agendar/[token]/page.tsx` | Valida token, responde "link inválido" sem vazar nada |
| Horários reais da empresa | `lib/roleta/business-time.ts` → `getOrgSchedule()` | Lê o `roleta_schedule` da org + timezone |
| Montagem dos dias/slots | `lib/appointments/imob-slots.ts` → `buildDayOptions()` | Dias e horas cheias disponíveis |
| Decorados | `lib/appointments/locations.ts` → `LOCATIONS` | Lista de locais |
| Criação da visita | `app/api/agendar/[token]/route.ts` | **Já insere `status: "scheduled"`**, já detecta conflito checando `.in("status", ["scheduled","confirmed"])` (409), já registra `activities` |
| Espelho no Google Agenda | `lib/appointments/google-mirror.ts` → `mirrorCreate()` | Chamado pela própria rota |
| Visita segue o dono | `lib/appointments/sync-visit-owner.ts` | Troca de dono do lead MOVE a visita |
| Calor do lead | `lib/leads/calor.ts` (`interest_level`) | frio / morno / quente |
| Qualificação comercial | `lib/leads/qualificacao.ts` (`qualificacao_comercial`) | bom / regular / ruim / inválido |
| Leitura de IA sobre o lead | `app/api/leads/[id]/behavior-analysis/route.ts`, `lib/leads/enrich.ts` | Haiku já lê o lead e preenche campos |

**Consequência importante para o dimensionamento:** o `appointment_status` (migration
`006_appointments.sql:5`) já tem `scheduled` e `confirmed`. "Pré-agendado" e "confirmado"
sempre foram o significado desses dois estados — a única novidade é que agora quem cria um
`scheduled` é alguém de fora. **Nenhuma migration nova é necessária para a decisão D1.**

O único ponto onde a ferramenta externa era melhor é **marketing editar o formulário sem
deploy**. Por isso o schema do formulário nasce em `jsonb` editável por tela, nunca hardcoded
(§4, AC do 75-330).

## 3. Resultado esperado

- Lead de anúncio chega qualificado, com as respostas na própria ficha
- Visita marcada pelo próprio lead, no horário que ele escolheu, sem intermediário
- "Agendou visita" vira evento server-side com dado first-party para o Meta otimizar
- Duas assinaturas a menos e um ponto de integração a menos onde perder lead

## 4. O fluxo decidido

```
anúncio → /formulario/[token]  (público, sem login)
  │
  ├─ perguntas ramificam conforme as respostas
  ├─ telefone + e-mail capturados CEDO  ──→ abandonou no meio? vira lead assim mesmo
  │
  └─ fim: agenda visível para TODOS (D2)
        │
        ├─ escolheu horário → visita criada `scheduled` (D1)
        │     ├─ horário BLOQUEADO na hora
        │     ├─ espelhado no Google Agenda
        │     └─ lead entra na etapa "Visita Agendada", dona = SDR (D3)
        │
        └─ tela final: "Visita agendada para {data}. Nossa equipe entra em contato."

SDR trabalha o lead → quando fizer sentido, TRANSFERE manualmente a um corretor
                                                              │
                                            corretor assume → sync-visit-owner move a visita
```

> **D3 revisada em 17/08** (ver frontmatter): não há passo de confirmação nem entrega à
> roleta. A transferência é manual e usa o endpoint que já existe
> (`/api/leads/[id]/transferir`), cuja capability é `leads.transferir`.

## 5. Stories

| ID | Título | Tamanho | Depende de |
|----|--------|---------|-----------|
| **75-330** | Motor do formulário: schema em `jsonb`, ramificação, score gravado, página pública | M | — |
| **75-331** | Agenda no fim: visita `scheduled`, SDR dona, confirmação promove a `confirmed`, entrega à roleta | S | 75-330 |
| **75-332** | Haiku lê as respostas abertas → **calor e resumo** para o corretor | M | 75-330 |

> **Correção de 17/08 (@sm, na 75-332):** este item dizia "calor, **qualificação comercial** e
> resumo". A qualificação comercial **saiu**: `217_leads_qualificacao_comercial.sql` a define
> como *"campo **manual** e independente"* (Story 84-1). IA escrevendo ali apagaria o
> julgamento do corretor — que é exatamente o bug que a migration **201** teve de consertar no
> calor (*"corretor evoluía p/ Quente e a próxima mensagem devolvia p/ Frio"*). Repetir em
> outro campo seria reincidência.
>
> Descoberto junto: o cron `enrich-leads` itera sobre **conversas com mensagens**, e o lead do
> formulário não tem nenhuma. Sem a 75-332 ele fica **sem calor para sempre** — a leitura por
> IA não é extra, é o único caminho. Por isso o item subiu de S para M.

Migration livre no momento da criação: **231** (a 230 é a última aplicada).

## 6. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Formulário longo derruba a conversão do anúncio | Ramificação de verdade (quem responde "à vista" não vê pergunta de financiamento), 4–6 telas curtas, contato capturado cedo |
| D2 (todos veem a agenda) enche a agenda de visita sem perfil | **Aceito pelo diretor.** Score gravado desde o dia 1 sem ser usado: ligar o corte depois é mudar um número. Medir por 30 dias antes de propor qualquer corte |
| Formulário compete com a Nicole, que já qualifica no WhatsApp | O formulário é o trilho de autoatendimento. Quem abandona no meio deve ser retomado pela Nicole de onde parou — **definir explicitamente no 75-330**, senão nascem duas qualificações concorrentes |
| Dado pessoal em página pública | Aceite de LGPD com link para `/politica-de-privacidade`, que já existe e já é rota pública |
| Token do formulário vazar / ser abusado | Mesmo padrão do `/agendar/[token]`: token inválido responde genérico sem vazar nada. Rate limit por IP no POST |
| Meta CAPI ainda sem credenciais no Vercel | Bloqueia só o evento de conversão, **não o epic**. Registrar como pendência do Épico 86 |

## 7. Fora de escopo

- Corte de qualificação bloqueando a agenda (revogado por D2; o score fica gravado para permitir isso depois sem retrabalho)
- Editor visual de formulário arrastando campos — a v1 edita o `jsonb` por uma tela simples
- Múltiplos formulários por campanha — a v1 assume um formulário por token, com N tokens possíveis
- Substituir o Meta Lead Forms já existente (`api/webhooks/meta-ads`), que continua funcionando em paralelo
