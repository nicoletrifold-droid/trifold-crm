# Story 75-29 — Microfone: corretor/gestor grava e envia áudio (voz) ao lead via WhatsApp

## Metadata
- **Status:** Done
- **Epic:** 75 · **Branch:** main · **Complexidade:** L (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, build]

## Story
**As a** corretor (e gestor), **I want** gravar um áudio pelo composer (web + PWA) e
enviar ao lead, **so that** explicações longas saiam por voz, como o cliente prefere.

## Contexto
Pedido do usuário (2026-06-23). Já existe envio de mídia por link
(`/api/leads/[id]/send-file` → bucket público `nicole-media` → WhatsApp). Falta gravar
áudio. Restrição-chave: o WhatsApp só toca **OGG/Opus** como mensagem de voz; o
`MediaRecorder` nativo grava WebM (Chrome) — não aceito. Solução: gravar OGG/Opus
direto no navegador com **`opus-recorder`** (WASM, cross-browser); worker vendorizado
em `public/opus/encoderWorker.min.js`. Posição do mic definida pelo usuário: **lado
direito da barra, junto do enviar** (separado do clips à esquerda).

## Escopo
**IN:**
- Dependência `opus-recorder` + worker em `public/opus/encoderWorker.min.js`.
- `AudioRecorder` (client): botão de microfone à direita no composer; grava OGG/Opus,
  mostra tempo, permite cancelar e **pré-ouvir** antes de enviar; envia via `send-file`.
- `send-file/route.ts`: trata `audio/*` → WhatsApp `type:"audio"` (link), grava em
  `messages` com `media_type='audio'` e conteúdo `[Áudio]`.
- Vale para corretor e gestor (mesmo `BrokerMessageInput`); respeita janela 24h.

**OUT (follow-up):** player de áudio inline no thread (hoje mídia aparece como texto,
igual ao 📎); transcrição; envio de áudio fora da janela 24h.

## Acceptance Criteria
1. Botão de microfone aparece à direita do composer (entre textarea e enviar), separado do clips.
2. Gravar → tempo correndo → parar → pré-ouvir → enviar; cancelar descarta.
3. Áudio gravado é OGG/Opus e é enviado ao lead via WhatsApp `type:audio`.
4. `send-file` aceita `audio/*` e grava `messages` com `media_type='audio'`, conteúdo `[Áudio]`.
5. Respeita a janela de 24h (bloqueia quando fechada) e o limite de 4 MB.
6. typecheck, lint e build limpos.

## Notas de validação
Gravação depende de microfone/navegador → **teste final manual pelo usuário** (gravar,
enviar, confirmar que chega como áudio no WhatsApp). Não verificável via CLI.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.29-...yml`, quality_score 88)
- **typecheck/lint/build:** limpos (next build completou).
- **Ressalva:** gravação precisa de teste manual real (microfone/WhatsApp) — não verificável por CLI.

## File List
- `packages/web/package.json` (+opus-recorder)
- `packages/web/public/opus/encoderWorker.min.js` (vendor)
- `packages/web/src/app/broker/leads/[id]/_components/audio-recorder.tsx` (novo)
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx`
- `packages/web/src/app/api/leads/[id]/send-file/route.ts`
