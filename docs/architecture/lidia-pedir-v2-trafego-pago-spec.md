# Lídia — "Pedir à Lídia" v2: criativo para tráfego pago (frontend spec)

**Autora:** @ux-design-expert (Uma) · 11/08/2026
**Base:** pesquisa de mercado 11/08 (AdCreative.ai, Meta Advantage+, guias de criativo 2026) +
componente atual (`agente-client.tsx:182-350`, Story 75-239/241).

## O problema

O modal atual pensa como **social media orgânico**: 1 pedido → 1 post → 1 arte na proporção do
formato. Tráfego pago vive de outra régua: **proporção certa por posicionamento** (1:1 feed,
4:5 feed vertical, 9:16 story/reels — ~90% do inventário do Meta é vertical), **volume de
variações** (contas vencedoras mantêm 15-50 criativos ativos) e **copy de anúncio estruturada**
(primary text ~125 chars + headline ~27). O campo "Direção da arte" é texto livre — exige que o
usuário saiba "promptar".

**Descoberta técnica que baliza tudo:** o motor de arte JÁ tem layout por proporção
(`ArteAspectRatio = "9:16" | "4:5" | "1:1"`, com `faixaLayout`/`ctaBox`/`logoBox` por ratio em
`arte-faixa.ts`/`arte-cta.ts`/`arte-logo.ts`). Hoje `aspectRatioForFormato()` trava 1 ratio por
formato. O trio é **destravar**, não construir.

## Princípios

1. **Um gesto → kit completo.** Pedido de tráfego pago devolve as 3 proporções da MESMA arte +
   copy de anúncio. Ninguém monta posicionamento à mão.
2. **Chips no lugar de prompt.** Direção de arte vira escolha visual; texto livre continua como
   refinamento, não como requisito.
3. **A Lídia mostra o que entendeu.** "Melhorar meu pedido" expande o texto cru num briefing
   editável — o humano corrige ANTES de gastar geração.
4. **Nada publicado sem gente** (mantém a fila de aprovação como está).

## Modal v2 — layout

```
┌─ Pedir à Lídia ────────────────────────────────────────────┐
│ Destino:  (•) Orgânico   ( ) Tráfego pago                  │
│                                                            │
│ O que você quer? *                            [✨ Melhorar]│
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Ex.: "Story pra investidor batendo na entrega..."      │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ Direção da arte (opcional — toque para escolher)           │
│ Cenário   [Fachada real 📷] [Pôr do sol] [Urbano noite]    │
│           [Interior decorado] [Minimalista]                │
│ Luz       [Manhã] [Golden hour] [Noite]                    │
│ Estilo    [Foto real] [Lifestyle] [Render]                 │
│ Pessoas   [Sem] [Com]                                      │
│ ┌ Detalhes extras (texto livre) ─────────────────────────┐ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ── se Tráfego pago ──────────────────────────────────────  │
│ Objetivo   [Leads] [Agendar visita] [Reconhecimento]       │
│ Proporções [✓ 1:1] [✓ 4:5] [✓ 9:16]   (todas por padrão)   │
│ ── se Orgânico (como hoje) ──────────────────────────────  │
│ Empreendimento ▾   Formato ▾   Canal ▾   Data              │
│                                                            │
│ Prefiro escrever manualmente    [Cancelar] [Criar c/ Lídia]│
└────────────────────────────────────────────────────────────┘
```

### Comportamentos

- **Destino** é a primeira decisão e muda o resto do form. Orgânico = exatamente o fluxo atual
  (zero regressão). Pago = empreendimento continua, formato some (arte estática nas proporções
  marcadas), canal vira implícito ("Meta — FB+IG").
- **Chips**: single-select por grupo, todos opcionais; sem escolha = "a critério da Lídia".
  Selecionado ganha borda laranja + fundo `orange-500/10`. Cada chip mapeia para um fragmento
  de prompt fixo no servidor (fonte única em `lib/marketing/`, nunca duplicar no client — ver
  [[feedback-consultar-fonte-nao-duplicar-constante]]).
- **Chip "Fachada real 📷"**: sinaliza usar foto real do Kit como base (jurídico: IA não pode
  inventar fachada). Quando o Kit não tem foto de fachada, chip aparece desabilitado com
  tooltip "adicione uma foto ao Kit".
- **✨ Melhorar**: um clique → chamada leve de LLM que reescreve o pedido como briefing
  (objetivo, ângulo, argumento do Kit, CTA), substitui o textarea com **Desfazer** (guarda o
  texto anterior; um nível basta). Desabilitado com <10 chars.
- **Objetivo** (pago): muda o CTA e o tom da copy. Leads = "Saiba mais/formulário";
  Visita = "Agende sua visita"; Reconhecimento = sem CTA duro.
- **Proporções**: multi-select, mínimo 1, padrão as 3.

## Saída na fila (card de post pago)

- Badge **`Tráfego pago`** ao lado das tags atuais (Lídia/Canal/Formato).
- **3 miniaturas lado a lado** com rótulo da proporção (1:1 · 4:5 · 9:16) — reusa o grid de
  miniaturas da 75-263; cada uma abre em tamanho real. "Refazer arte" refaz as proporções
  marcadas.
- Bloco **Copy do anúncio**: `Primary text` (com contador /125) e `Headline` (/27), cada um com
  botão copiar — pronto pra colar no Ads Manager.
- Aviso fixo no card pago: **"Arte gerada por IA — marque a declaração de IA ao subir no
  Meta"** (desde mar/2026 é motivo comum de rejeição). Texto informativo, não bloqueante.

## Estados, tema e acessibilidade

- Chips: `aria-pressed`, navegáveis por teclado; grupos com `role="group"` + label.
- Tema: tudo com variantes `dark:` (padrão do arquivo — [[feedback-theme-convention]]).
- Gerando: o botão mostra "Criando 3 proporções…" quando pago (expectativa de tempo maior).
- Erro parcial (1 proporção falhou): card entra na fila com as que deram certo + aviso
  "9:16 falhou — Refazer" (não descartar o que funcionou).

## Fora desta v2 (backlog, próximas stories)

1. **Variações em lote** (N conceitos por pedido) + fila agrupada com comparador.
2. **Loop de performance**: CTR/CPL do agente Meta Ads no card + "gerar variações do vencedor".
3. **Publicação direta** como rascunho de anúncio via Graph API.
4. Vídeo/Reel para pago.
