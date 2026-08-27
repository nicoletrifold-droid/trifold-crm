---
epic: 90
title: Live Coach — assistência ao corretor em tempo real durante a conversa com o lead
status: Draft
created_at: 2026-08-27
updated_at: 2026-08-27
created_by: Morgan (@pm)
priority: P1
objetivo_negocio:
  - Quando o corretor assume a conversa, a Nicole cala e o CRM fica MUDO exatamente no momento
    mais caro do funil — a hora da objeção. O Live Coach ocupa esse silêncio.
  - O corretor lê, na própria tela da conversa, qual objeção o lead acabou de levantar e 1-2
    respostas prontas — ancoradas em dado real do empreendimento (RAG), não em técnica genérica
    de vendas.
  - Diferencial defensável — concorrentes que vendem "coach de IA" sugerem retórica. Nós sugerimos
    retórica + tabela, prazo e unidade comparável, porque temos a base de conhecimento e a
    memória do lead no mesmo banco.
  - O humano SEMPRE decide. O coach nunca envia mensagem, nunca move etapa, nunca fala com o lead.
depends_on:
  - Epic 82 (behavior-analysis) — flow de análise com campo `objecoes` já em produção; o Live
    Coach é a versão AO VIVO e ENXUTA do mesmo raciocínio, não uma segunda régua.
  - Epic 83 (revisão ortográfica) — `ReviewSuggestion` + `reviewOutgoing` já estabeleceram o
    padrão "IA sugere junto ao input, humano aceita ou ignora". O card do coach herda esse padrão.
  - Epic 63 (UX atendimento corretor) — handoff via `is_ai_active` e canal Realtime
    `broker-chat-{convId}` já funcionais; o coach usa os dois sem criar trilho novo.
  - RAG operacional (`match_knowledge`, threshold 0.45 calibrado na Story 75-173).
  - Transcrição de áudio no webhook (`transcribeAudio`) — áudio do lead já chega como texto.
related:
  - packages/web/src/app/api/webhook/whatsapp/route.ts (ponto de entrada; `is_ai_active` resolvido ~linha 941; transcrição ~linha 808)
  - packages/ai/src/flows/behavior-analysis.ts (contrato de saída de referência — `objecoes`, `como_abordar`)
  - packages/ai/src/flows/message-review.ts (padrão de flow curto, fail-open, JSON estrito)
  - packages/ai/src/rag/search.ts (searchKnowledge) + packages/ai/src/rag/context-builder.ts
  - packages/ai/src/client/anthropic.ts (ANTHROPIC_MODELS.haiku / .sonnet)
  - packages/ai/src/flows/lead-memory.ts + memory/loader.ts (perfil do lead para ancorar a sugestão)
  - packages/web/src/components/messages/review-suggestion.tsx (padrão visual do card de sugestão)
  - packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx (input do corretor)
  - packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx:223 (canal Realtime)
  - packages/web/src/lib/capabilities.ts (fonte única do kill switch por perfil)
  - supabase/migrations/001_base_schema.sql:172 (tabela messages — role user|assistant|system|broker)
stories_planned: [90-1, 90-2]
---

# Epic 90 — Live Coach

## Problema

O CRM tem duas fases de conversa e trata a segunda como cega.

**Fase 1 — Nicole ativa.** O lead escreve, a Nicole responde, qualifica, agenda. Bem coberto.

**Fase 2 — corretor assumiu** (`conversations.is_ai_active = false`). A partir daqui a Nicole
não responde mais, por desenho (Story 63-15). O corretor está sozinho contra as objeções mais
duras do funil — "tá caro", "vou pensar", "achei outro mais perto", "preciso falar com minha
esposa" — e o CRM, que tem a conversa inteira, o perfil do lead e a base de conhecimento do
empreendimento, não oferece nada. O que existe hoje é o `behavior-analysis` (Epic 82): excelente,
porém **on-demand por clique e pesado** (cronologia inteira no Sonnet). Ninguém clica em botão
no meio de uma negociação por WhatsApp.

O resultado prático: a objeção é respondida com o que o corretor lembrar na hora. Corretor
experiente improvisa bem; corretor novo trava ou promete o que não pode. A informação que
resolveria a objeção — prazo de entrega, tabela, unidade equivalente em outro andar — está no
nosso banco, a dois cliques de distância que ninguém dá durante a conversa.

## Decisões (Marcos, 2026-08-27)

- **Gatilho: só quando o corretor assumiu.** Dispara na mensagem `role='user'` quando
  `is_ai_active = false`. Enquanto a Nicole conduz, ela já resolve — rodar o coach ali seria
  custo dobrado e risco de sugerir algo que contradiz o que ela acabou de dizer.
- **Escopo MVP: entrada (reagir), não saída.** O coach reage à mensagem do lead. Interceptar a
  resposta do corretor ANTES do envio ("sua resposta ignora a objeção") é candidata pós-MVP —
  mexer no caminho de envio, que hoje está estável, não vale o risco antes de a sugestão provar
  qualidade.
- **Modelo: Haiku 4.5 detecta, Sonnet 5 redige.** Gate barato em toda mensagem elegível
  (é objeção? qual?); Sonnet só quando há objeção real. Sem objeção, custo ≈ Haiku e nenhum card.
- **Sugestão é RASCUNHO, nunca envio.** O card oferece "usar no input" (cola no campo, corretor
  edita e manda) e "descartar". O coach não tem permissão de escrita no WhatsApp.
- **Fail-open, como o Epic 83.** Erro, timeout ou resposta inválida = nenhum card. O coach nunca
  pode atrasar, travar ou quebrar a thread da conversa.
- **Ancoragem obrigatória.** Sugestão que não conseguiu apoio no RAG nem na memória do lead sai
  marcada como genérica (`ancorada: false`) — honestidade sobre a origem, mesmo padrão do
  `dados_faltando` do Epic 82.

## Contrato de saída (por sugestão)

| Campo | Conteúdo |
|---|---|
| `objecao` | A objeção detectada, em uma frase, na linguagem do lead |
| `tipo` | Classe: `preco` \| `prazo` \| `localizacao` \| `concorrente` \| `decisor` \| `financiamento` \| `indeciso` \| `outro` |
| `confianca` | `alta` \| `media` — abaixo de `media` o detector não abre card |
| `respostas` | 1-2 rascunhos prontos para o corretor colar e editar |
| `ancoras` | Trechos/fontes do RAG e do perfil que sustentam as respostas (vazio ⇒ `ancorada: false`) |
| `ancorada` | `true` só quando há ao menos uma âncora real |
| `cuidado` | Opcional: o que NÃO prometer neste caso (ex.: desconto não autorizado, prazo não confirmado) |

## Stories

### 90-1 — Backend: detecção de objeção + sugestão ancorada + persistência

- **Descrição:** Migration da tabela `coach_suggestions` (por `conversation_id` + `message_id`,
  org-scoped com RLS, colunas de ciclo `used_at` / `dismissed_at` para medir adoção sem épico de
  analytics). Flow novo em `packages/ai/src/flows/live-coach.ts`: gate Haiku (elegibilidade
  textual antes da IA, no padrão `isReviewEligible`) → detecção de objeção → quando confirmada,
  Sonnet redige as respostas com contexto de `searchKnowledge` + memória do lead. Disparo no
  `webhook/whatsapp/route.ts` após a gravação da mensagem, **assíncrono e não-bloqueante**:
  a resposta do webhook para a Meta não espera o coach. Kill switch como capability em
  `packages/web/src/lib/capabilities.ts` (seed regenerado pelo script, nunca à mão).
- **Executor Assignment:** `executor: @dev`, `quality_gate: @architect`
- **Quality Gate Tools:** `[code_review, pattern_validation, security_scan]`
- **Consulta obrigatória:** @data-engineer na migration (RLS org-scoped, índice por
  `conversation_id`, numeração — próxima livre é **242**, e já existe colisão histórica em 240).
- **Quality Gates:** Pre-Commit (@dev) + Pre-PR (@devops) — toca rota de produção da Meta.
- **Foco:** custo por conversa, latência fora do caminho crítico do webhook, fail-open real
  (try/catch que engole tudo), zero alteração no comportamento da Nicole.

### 90-2 — UI: card do Live Coach na conversa do corretor

- **Descrição:** Card na thread do `/broker/leads/[id]`, entregue pelo canal Realtime
  `broker-chat-{convId}` já existente (nova subscription na tabela `coach_suggestions`, sem
  polling novo). Visual e vocabulário herdados do `ReviewSuggestion` (Story 83-2), componente
  compartilhado. Ações: **usar no input** (cola no `broker-message-input`, corretor edita antes
  de enviar), **descartar** (grava `dismissed_at`). Mostra a objeção detectada, as respostas, as
  âncoras (com selo visível quando `ancorada: false`) e o `cuidado` quando houver. Acessibilidade
  no padrão do `AiStatusBanner` (`role="status"` + `aria-live="polite"`), e o card nunca rouba o
  foco do campo de digitação.
- **Executor Assignment:** `executor: @ux-design-expert`, `quality_gate: @dev`
- **Quality Gate Tools:** `[accessibility_audit, component_review, pattern_validation]`
- **Quality Gates:** Pre-Commit (@dev) + Pre-PR (@devops).
- **Foco:** não competir com a conversa (o corretor está digitando), mobile primeiro — o corretor
  atende do celular, tema claro/escuro (Epic 30), e o card não empurrar a thread para cima quando
  aparece.

## Sequência e dependências

90-1 → 90-2. A 90-2 depende da tabela e do contrato nascidos na 90-1. A 90-1 é entregável
sozinha: sem UI, ela já grava sugestões em produção e permite medir qualidade e custo reais
antes de expor qualquer coisa ao corretor.

## Compatibility Requirements

- [ ] `is_ai_active`, `handoff_at` e o pipeline da Nicole permanecem intactos — o coach só LÊ.
- [ ] Nenhuma alteração no contrato do webhook da Meta; resposta continua no mesmo prazo.
- [ ] Tabela nova apenas; nenhuma coluna alterada em `messages`, `conversations` ou `leads`.
- [ ] Coach desligado (capability off, ou flow falhando) = comportamento de hoje, byte a byte.
- [ ] UI segue o design system e o tema; nenhuma mudança na thread quando não há sugestão.

## Risk Mitigation

- **Primary Risk:** o webhook do WhatsApp é caminho crítico de produção — atrasar ou derrubar
  ele custa mensagens de lead perdidas.
- **Mitigation:** disparo assíncrono após a gravação da mensagem, com timeout curto e try/catch
  total (fail-open). Nenhum `await` do coach antes do retorno para a Meta. Teste explícito de
  "coach lança exceção ⇒ webhook responde 200 igual".
- **Rollback Plan:** capability off por perfil/org (efeito imediato, sem deploy) para esconder e
  parar de gerar. Reversão de código = remover o disparo no webhook; a tabela pode ficar (órfã e
  inofensiva).

## Riscos

- **Sugestão genérica mata a adoção.** É o risco número um: card que diz "contorne mostrando
  valor" é lido duas vezes e ignorado para sempre. Mitigado pelo campo `ancorada` e pelo RAG
  obrigatório na redação — e medido por `used_at` vs `dismissed_at` desde o primeiro dia.
- **Custo por conversa.** Toda mensagem de lead em conversa assumida paga um Haiku. Mitigado
  pelo gate textual antes da IA (mensagem curta / "ok" / emoji não chama modelo) e pelo Sonnet
  só entrar com objeção confirmada. Monitorar custo/conversa na primeira semana.
- **Latência percebida.** O corretor pode responder antes do card chegar — e nesse caso o card
  vira ruído. Mitigado pelo Haiku no gate e pela regra de não abrir card para mensagem que já foi
  respondida pelo corretor.
- **Ruído em conversa longa.** Sequência de cards a cada mensagem cansa. Regra: uma sugestão
  ativa por conversa; objeção nova do mesmo `tipo` atualiza o card em vez de empilhar.
- **Falso positivo de objeção.** "Tá caro" pode ser brincadeira. Mitigado pelo corte de
  `confianca` e pelo fato de o card ser passivo — não interrompe, não bloqueia, não notifica.
- **Expectativa do anúncio ≠ nosso produto.** O "live coach" que circula em ads sugere coach
  durante LIGAÇÃO DE VOZ (stream de áudio em tempo real). Não é o que este épico entrega e não
  temos infraestrutura para isso. Aqui o "ao vivo" é chat/WhatsApp assíncrono — segundos entre a
  mensagem do lead e a resposta do corretor. Alinhamento explícito para não vender o que não é.

## Definition of Done

- [ ] Objeção do lead detectada em conversa assumida gera sugestão ancorada, visível na thread do
      corretor em segundos, sem ação dele.
- [ ] Corretor consegue colar a sugestão no input, editar e enviar; e consegue descartar.
- [ ] Uso e descarte medidos no banco (`used_at` / `dismissed_at`).
- [ ] Coach falhando não altera nada: webhook responde igual, thread renderiza igual.
- [ ] Kill switch por capability testado em produção (liga e desliga sem deploy).
- [ ] Custo médio por conversa medido e registrado na story.
- [ ] Testes: gate de elegibilidade, parse do JSON, fail-open no webhook, RLS org-scoped.
- [ ] Nenhuma regressão no pipeline da Nicole nem no handoff (suíte de `packages/ai` verde).

## Fora de escopo (Epic 90)

- **Coach de saída** (avisar antes de o corretor enviar) — candidata pós-MVP, decisão explícita.
- **Coach durante ligação de voz** — outro produto, exige stream de áudio em tempo real.
- **Envio automático** de qualquer sugestão. O coach nunca fala com o lead.
- **Mover etapa, alterar score ou escrever no lead.** Só a tabela nova.
- **Coach com a Nicole ativa** — decisão explícita de gatilho.
- **Push notification** de objeção crítica — depende de a adoção do card provar valor primeiro.
- **Painel de analytics de objeções** (quais objeções mais aparecem, por empreendimento) — épico
  futuro; os dados nascem aqui.
- **Treinamento/fine-tuning** com as sugestões aceitas — épico futuro.
