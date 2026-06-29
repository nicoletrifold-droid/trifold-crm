# Story 75-70 — Frase de prova social na tela de login

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** feature/75-70-login-frase-prova-social · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]
- **Nota de processo:** micro-ajuste de copy/UI escopado pelo usuário direto como @dev→@qa→@devops (sem @sm/@po). UX (Uma) desenhou e o usuário aprovou o mockup.

## Story
**As a** Trifold (marca), **I want** uma frase de prova social/aspiração na tela de login, logo abaixo de "Entre com
suas credenciais", **so that** o cliente sinta que faz parte de algo maior ("login único para todos os imóveis") —
gerando pertencimento e desejo. Simplificação da ideia original do diretor (era um popup segmentado no portal).

## Contexto
Decisão do usuário (2026-06-29): em vez de cards segmentados no portal, **uma única frase** num ponto específico — a
tela de login (`/login`, compartilhada por cliente e equipe). Ver [[project-portal-welcome-prova-social]].

## Escopo
**IN:**
- Em `packages/web/src/app/login/page.tsx`, abaixo do subtítulo (linha ~56-58), exibir **apenas na view de login**
  (não na de recuperação): **"Todos seus imóveis em um único acesso"** com ícone de chave (`KeyRound`) e o trecho
  "um único acesso" no coral da marca `#F27A5E`, seguido de uma linha-divisória sutil em gradiente coral.

**OUT:**
- Não alterar a logo, o formulário, as actions de login/recuperação nem a view de recovery.
- Não condicionar por perfil (cliente vs equipe) — frase aparece para todos (decisão do usuário; heads-up dado).

## Acceptance Criteria
1. **Given** a tela de login (view "login"), **then** a frase aparece logo abaixo de "Entre com suas credenciais",
   com ícone de chave e "um único acesso" destacado em `#F27A5E`.
2. **Given** a view de **recuperação de senha**, **then** a frase NÃO aparece.
3. **Given** o tema dark do login, **then** o tratamento respeita a hierarquia (frase mais clara que o subtítulo,
   sem competir com o formulário) — conforme mockup aprovado.
4. typecheck/lint limpos; sem mudança de comportamento de autenticação.

## Dev Notes
- Arquivo único: `packages/web/src/app/login/page.tsx`. `lucide-react` já importado (Eye/EyeOff) → adicionar `KeyRound`.
- Coral da marca já usado no arquivo: `#F27A5E` (botão/foco). Reusar.
- Inserir dentro do bloco `{/* Logo & Title */}`, após o `<p>` do subtítulo, guardado por `view === "login"`.

## File List
- `packages/web/src/app/login/page.tsx` — frase de prova social abaixo do subtítulo (só na view de login).

## QA Results
- **Verdict:** PASS (XS, sem gate file separado) — typecheck 0, lint 0.
- ACs por inspeção: AC1 (frase+ícone+coral #F27A5E abaixo do subtítulo), AC2 (escondida na view recovery via `view === "login"`), AC3 (hierarquia: text-stone-400 < subtítulo stone-500 + divisória em gradiente), AC4 (auth intacta). Mockup aprovado pelo usuário bate com a implementação (mesmo coral).

## Change Log
- 2026-06-29 — @dev — Frase de prova social no login (KeyRound + "um único acesso" em #F27A5E + divisória sutil),
  só na view de login. Mockup aprovado pelo usuário. Ver [[project-portal-welcome-prova-social]].
