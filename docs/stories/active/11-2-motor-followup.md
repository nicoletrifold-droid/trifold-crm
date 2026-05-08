status: Done

# Story 11.2 — Motor de Follow-up (Engine)

## Contexto
Engine que roda periodicamente, verifica leads que precisam de follow-up baseado nas regras por etapa, e executa acoes (alerta ao corretor ou Nicole assume). Monitora se corretor ja entrou em contato.

## Acceptance Criteria
- [ ] AC1: Tabela `follow_up_log`: id, org_id, lead_id, rule_id (FK follow_up_rules), type (alert_broker/nicole_sent), status (pending/sent/cancelled/completed), scheduled_at, sent_at, message, created_at
- [ ] AC2: API cron `POST /api/cron/followup` que processa todos os leads: verifica ultima mensagem (do corretor OU Nicole), compara com regras da etapa atual, cria entries no follow_up_log
- [ ] AC3: Se corretor enviou mensagem apos ultima interacao — cancela follow-up pendente e registra como "completed"
- [ ] AC4: Se dias sem contato >= alert_days — cria alerta tipo "alert_broker"
- [ ] AC5: Se dias sem contato >= nicole_takeover_days E corretor nao respondeu — Nicole envia mensagem automaticamente
- [ ] AC6: Controle de frequencia: maximo 1 follow-up por lead a cada 48h
- [ ] AC7: Respeita horario comercial (usa isBusinessHours)
- [ ] AC8: Activity log registrado para cada follow-up enviado (type: followup_sent, followup_alert)
- [ ] AC9: Nicole personaliza mensagem com dados da memoria (ai_summary) e template da regra
- [ ] AC10: Endpoint `GET /api/followup/pending` retorna follow-ups pendentes para dashboard

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/cron/followup/route.ts` — endpoint cron que processa follow-ups
- `packages/web/src/app/api/followup/pending/route.ts` — endpoint para listar follow-ups pendentes
- `packages/web/src/lib/followup-engine.ts` — logica do motor de follow-up
- `supabase/migrations/XXXXXX_create_follow_up_log.sql` — migracao da tabela follow_up_log + RLS

## Dependencias
- Depende de: 11.1
- Bloqueia: 11.3, 11.4, 11.5

## Estimativa
G — 3-4h

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
