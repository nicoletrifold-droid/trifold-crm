---
epic: 83
title: Revisão ortográfica na saída — guarda automática em toda escrita humana do CRM
status: InProgress
created_at: 2026-07-21
updated_at: 2026-07-21
created_by: Morgan (@pm)
priority: P1
objetivo_negocio:
  - Erro de português escrito pela equipe NUNCA chega ao cliente sem uma chance de correção — protege a imagem da empresa em todo canal de comunicação humana do CRM.
  - Guarda no ENVIO (decisão Marcos 2026-07-21, "camada 1 + camada 2 opção b") — a IA sugere, o humano decide; envio jamais é bloqueado.
  - Vale para TODOS que escrevem no sistema (decisão Marcos): corretor, gestor, equipe do portal — toda superfície de texto livre que sai para lead/cliente.
depends_on:
  - Padrão de flow LLM (packages/ai) + ANTHROPIC_MODELS (Epic 82).
  - Composer compartilhado BrokerMessageInput (51-1/63-x) — serve chat do lead em TODAS as telas (broker, dashboard conversa, conversas, chat da Samara).
related:
  - packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx (composer do lead)
  - packages/web/src/app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx (portal lado empresa, sendText)
  - packages/web/src/app/api/leads/[id]/send-message/route.ts (metadata da mensagem — auditoria)
  - packages/ai/src/flows/behavior-analysis.ts (padrão de flow pós-82-4)
stories_planned: [83-1, 83-2, 83-3]
---

# Epic 83 — Revisão ortográfica na saída

## Problema
Corretores e equipe escrevem direto pro WhatsApp do lead e pro chat do portal do cliente.
Erro de ortografia/gramática sai com o nome da empresa. Hoje não há nenhuma proteção.

## Decisões (Marcos, 2026-07-21)
- **Camada 1:** corretor nativo do navegador ligado (spellCheck + lang pt-BR) nos composers.
- **Camada 2 (opção b):** guarda automática NO ENVIO — Haiku revisa; se achar erro claro,
  mostra a sugestão com [Enviar corrigida] / [Enviar como escrevi]. Sem erro → envia direto.
- **Escopo = toda escrita humana que SAI do CRM:** chat do lead (composer compartilhado,
  todas as telas) + chat do portal lado empresa (obras/mensagens). Campanhas ficam FORA
  (templates aprovados pela Meta, texto fixo). Chat do CLIENTE (comprador escrevendo) fora.
- **Regras do revisor:** corrigir SÓ erro claro (ortografia/acentuação/concordância/digitação);
  NUNCA formalizar nem mexer em tom, abreviações intencionais (vc, tb, blz), gírias, emojis,
  nomes próprios, números/valores/links e quebras de linha. Mudança mínima.
- **Fail-open SEMPRE:** revisão com erro/timeout → envia sem revisão. A guarda protege,
  não trava a operação.
- **Auditoria:** ao enviar a versão corrigida, o texto original fica em metadata.

## Stories
- **83-1 — Backend:** flow `message-review.ts` (Haiku, JSON has_errors/corrected, timeout
  curto) + rota genérica `POST /api/messages/review` (qualquer usuário ativo; skip de
  mensagens triviais; fail-open).
- **83-2 — Chat do lead:** helper client compartilhado + caixa de sugestão; guarda no
  handleSend do BrokerMessageInput; spellCheck/lang no textarea; metadata.reviewed_original
  no send-message quando enviar corrigida.
- **83-3 — Portal lado empresa:** mesma guarda + spellcheck no sendText do admin-chat-feed
  (reuso do helper e da caixa de sugestão).

## Sequência
83-1 → 83-2 → 83-3 (mesma branch/PR).

## Riscos
- **Latência no envio:** +~1s do Haiku a cada envio com texto elegível. Mitigação: skip de
  triviais (<8 chars/sem letras), timeout 6s com fail-open, Haiku (modelo mais rápido).
- **Overcorreção (robotizar o corretor):** prompt com regra de mudança mínima + o humano
  sempre decide; monitorar reclamações da equipe.
- **Custo:** Haiku por mensagem elegível — fração de centavo; volume de chat humano é baixo
  (dezenas/dia). Sem rate-limit inicial (mesmo racional do Epic 82).
