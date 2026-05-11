# Story 24.5 — Auto-vincular Cliente à Obra na Venda de Unidade

## Status: Draft

## Story

**Como** sistema,
**Quero** vincular automaticamente o comprador à obra do empreendimento quando uma venda de unidade é registrada,
**Para que** o cliente já tenha acesso ao portal de acompanhamento sem ação manual da equipe.

## Contexto

Fecha o ciclo completo: lead → venda → portal do cliente. Quando uma `unit_sale` é registrada para uma unidade de um empreendimento que tem obra vinculada, o comprador deve ser inserido em `cliente_obras` automaticamente.

Depende de 24.1 e 24.2.

## Acceptance Criteria

### Lógica de Auto-vínculo
- [ ] AC1: Quando uma nova `unit_sale` é criada, o sistema verifica se `unit.property_id` tem uma obra vinculada (`obras.property_id = property_id`)
- [ ] AC2: Se obra encontrada E comprador já tem conta de cliente (auth_id em `users` com `role='cliente'`): insere registro em `cliente_obras` (se não existir)
- [ ] AC3: Se obra encontrada E comprador NÃO tem conta de cliente: cria conta temporária de cliente com senha aleatória e envia email de boas-vindas com link de acesso ao portal
- [ ] AC4: Se nenhuma obra vinculada ao empreendimento: nenhuma ação é tomada (sem erro)
- [ ] AC5: Se o cliente já está em `cliente_obras` para esta obra: nenhum duplicate (constraint UNIQUE já cobre, tratar silenciosamente)
- [ ] AC6: `is_primary = true` se for a primeira obra do cliente, `false` se já tem outras

### Observabilidade
- [ ] AC7: Log de sistema registra o auto-vínculo (ou ausência de obra vinculada) para auditoria
- [ ] AC8: Na tela de detalhes da venda, exibir badge "Cliente adicionado ao portal de obra ✓" se vínculo foi criado

### Email de Boas-Vindas (se nova conta criada)
- [ ] AC9: Email enviado via Resend com template simples: nome do empreendimento, link de acesso ao portal, senha temporária
- [ ] AC10: Assunto: "Acompanhe a obra do seu {nome_empreendimento} — Acesso ao Portal"

## Escopo

**IN:**
- Hook/lógica na rota de criação de unit_sale
- Criação de conta de cliente se necessário
- Email de boas-vindas para conta nova
- Badge na tela de detalhes da venda

**OUT:**
- Retroativo: vendas já registradas não serão reprocessadas (coberto pelo backfill Story 24.3 + ação manual via Story 24.2)
- Notificações push (já cobertas pelo sistema de prefs do Epic 20)
- Atualizar `is_primary` de obras existentes do cliente

## Dev Notes

- Localizar a rota de criação de `unit_sale`: provavelmente `POST /api/properties/[id]/units/[unit_id]/sales` ou similar
- Reutilizar a lógica de `POST /api/admin/obras/[obra_id]/clientes` para criar conta de cliente
- Usar `supabase admin` (service role) para criar o auth user se necessário
- Para senha temporária: `crypto.randomUUID().slice(0, 12)` (suficientemente aleatório)
- Template de email de boas-vindas: criar em `packages/web/src/lib/emails/` seguindo padrão Resend existente
- A lógica deve ser tolerante a falhas: erro no vínculo NÃO deve impedir o registro da venda

## Tasks

- [ ] 1. Localizar e ler a rota de criação de unit_sale
- [ ] 2. Implementar função `autoVincularClienteObra(unitSaleData)` em `lib/`
- [ ] 3. Integrar chamada da função na rota de criação (após salvar a venda)
- [ ] 4. Criar template de email de boas-vindas para novo cliente do portal
- [ ] 5. Adicionar badge na tela de detalhes da venda (se obra vinculada)
- [ ] 6. Testes: venda sem obra, venda com obra + cliente existente, venda com obra + cliente novo

## Estimativa: 4h

## Dependências

- Story 24.1 (property_id em obras) — MUST be Done
- Story 24.2 (UI e API de vínculo) — MUST be Done
- Epic 18 (Resend configurado) — ✅ Done
- Epic 20 (cliente_obras, auth de cliente) — ✅ Done

## Change Log

| Data | Agente | Mudança |
|------|--------|---------|
| 2026-05-11 | @pm (Morgan) | Story criada |
