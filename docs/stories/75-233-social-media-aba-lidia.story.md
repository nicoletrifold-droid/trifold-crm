# Story 75-233 — Role social-media com acesso total à aba Lídia

**Status:** Done
**Tipo:** Permissão (rename de gate)
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** XS

## Contexto
Perfil `social-media` criado 29/07 (Laura Santiago) — a operadora do marketing —
mas a aba Lídia era restrita a admin/supervisor (decisão da 75-219, anterior ao
perfil existir). Print confirmou: ela via só CRM/Meta Ads. Decisão do Marcos:
acesso TOTAL dentro da aba (gerar sugestões, operar a fila, Kit de Marcas).

## Entrega
- `MARKETING_POST_ROLES` += `social-media` → marketingGuard libera as 8 rotas
  (`marketing-posts*` e `marketing-brands*`) de uma vez.
- Aba visível nas 2 telas de tabs + gate da page `/campaigns/agente`.
- União de tipos `AppUser["role"]` ganha `social-media`; teste do gate atualizado.
- Fora da aba nada muda: role não entra em roleta/bolsão/hierarquia comercial
  (COMMERCIAL_ROLE_RANK sem ele = sem acesso comercial extra, verificado no QA).

## QA Results
Quinn: APROVADO — diff = 6 pontos esperados; 8/8 rotas atrás do guard; nenhum
Record exaustivo por role quebra; deep link passa; suíte 1270/1270; tsc/build
limpos. Obs. checada: matriz do role já tem módulo campanhas (sidebar ok).
