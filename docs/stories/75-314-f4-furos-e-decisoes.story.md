# Story 75-314 — Perfis de Acesso 2.0 · F4-1: furos de segurança + decisões do Marcos

**Story ID:** 75-314 · **Status:** InReview · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO(9/10) → @dev → @qa → @devops (esteira contínua) · **mig 228 APLICADA e verificada em prod**

## Decisões do Marcos (pergunta direta, 13/08) — todas implementadas

1. **Consultoria × Obras**: módulo DESLIGADO na matriz (era cosmético) ✓ verificado.
2. **leads.criar ganha GC/SDR** (furo nº5 fechado — a tela sempre aparentou permitir):
   registro + seed em prod + teste-espelho atualizados. Única mudança de comportamento
   POSITIVA da F4-1: gerente/SDR agora criam leads escolhendo o corretor.
3. **God-gate: matriz manda** → executado na F4-2 (75-315).
4. **is_platform_admin: só o Marcos** — coluna + função `is_platform_admin()` + flag.
   ⚠️ Gotcha: o login dele no CRM é `marcos@trifold.com.br` (não `.eng.br`) — o 1º UPDATE
   casou 0 linhas, pego pela verificação por query (de novo ela se paga).

## Furos corrigidos (mig 228, transação implícita segurou o 1º erro — nada parcial)

- **LGPD (mig 067)**: `privacy_consents` NEM TINHA org_id (a causa-raiz do furo!) — policy
  nova escopa via JOIN com users da org + `has_capability('sistema.auditoria_ver')`.
- **Billing plataforma (164/171)**: 5 tabelas → `plataforma_only` via `is_platform_admin()`;
  rotas billing-panel/billing-reminders trocam requireRole admin → `isPlatformAdmin()`
  (`lib/platform.ts` novo — permissão de PLATAFORMA, fora da matriz por design).
- **Bolsão (128)**: leads no bolsão visíveis só p/ módulo bolsao OU corretor ativo.
- **Policy dupla (047/048)**: `admins_delete_roles` DROPADA — o guard `is_system` da 047
  volta a valer (admin não apaga o perfil admin).
- **`is_cliente()` (020)**: DROPADA.

## Evidências

7/7 verificações por query em prod (platform admin = Marcos; 5 policies plataforma_only;
1 policy DELETE em roles; is_cliente 0; consultoria obras false; leads.criar 5 roles;
privacy policy nova) · suíte **2353 passed** · tsc 0 · eslint 23 · build 0.

## QA — PASS (96)

O erro de coluna inexistente na 1ª aplicação validou o desenho (transação implícita = zero
estado parcial) e revelou a causa-raiz do furo LGPD. As duas verificações que falharam
primeiro (e-mail errado; coluna inexistente) foram pegas pela disciplina de verificar por
query — 3ª vez que ela paga o custo. Sem concerns.
