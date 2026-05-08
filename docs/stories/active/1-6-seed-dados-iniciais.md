status: Done

# Story 1.6 — Seed de Dados Iniciais

## Contexto
O sistema precisa de dados base para funcionar: organizacao Trifold, usuario admin (Alexandre), pipeline stages default, e configuracoes iniciais do agente. Sem seed, o sistema abre vazio e nao e possivel testar nenhum fluxo. Esta story cobre apenas dados estruturais — seeds de empreendimentos sao stories separadas (2.5 e 2.6).

## Acceptance Criteria
- [x] AC1: Organizacao "Trifold Engenharia" criada com dados reais (Maringa-PR)
- [x] AC2: Usuario admin criado: Alexandre Guimaraes Nicolau (email a definir, role `admin`)
- [x] AC3: Usuario supervisor criado: Lucas/Marcao (email a definir, role `supervisor`)
- [x] AC4: 8 kanban_stages criados com dados exatos do PRD (Novo, Em Qualificacao, Qualificado, Visita Agendada, Visitou, Negociando, Fechou, Perdido) com cores e tipos corretos
- [x] AC5: `agent_config` base criado com configuracoes default (model: claude-sonnet-4-20250514, temperature, max_tokens)
- [x] AC6: `agent_prompts` base criados (placeholders): `system_personality`, `qualification_flow`, `property_presentation`, `visit_scheduling`, `handoff_summary`, `guardrails`, `off_hours`
- [x] AC7: Seed executavel via `pnpm seed` ou `supabase db seed`
- [x] AC8: Seed e idempotente (pode rodar multiplas vezes sem duplicar dados — usa UPSERT ou IF NOT EXISTS)

> Nota: Seed aplicado via scripts TypeScript (run-seed.ts)

## Detalhes Tecnicos

### Arquivos a criar:
- `supabase/seed.sql` — Seed SQL principal

### Dados do seed:

```sql
-- Organizacao
INSERT INTO organizations (id, name, slug, city, state) VALUES
  ('ORG_UUID', 'Trifold Engenharia', 'trifold', 'Maringa', 'PR')
ON CONFLICT (slug) DO NOTHING;

-- Kanban Stages
INSERT INTO kanban_stages (org_id, name, color, position, stage_type) VALUES
  ('ORG_UUID', 'Novo', '#3B82F6', 1, 'entry'),
  ('ORG_UUID', 'Em Qualificacao', '#F59E0B', 2, 'progress'),
  ('ORG_UUID', 'Qualificado', '#10B981', 3, 'progress'),
  ('ORG_UUID', 'Visita Agendada', '#8B5CF6', 4, 'progress'),
  ('ORG_UUID', 'Visitou', '#06B6D4', 5, 'progress'),
  ('ORG_UUID', 'Negociando', '#F97316', 6, 'progress'),
  ('ORG_UUID', 'Fechou', '#22C55E', 7, 'won'),
  ('ORG_UUID', 'Perdido', '#EF4444', 8, 'lost');

-- Agent Config
INSERT INTO agent_config (org_id, model, temperature, max_tokens) VALUES
  ('ORG_UUID', 'claude-sonnet-4-20250514', 0.7, 1024);

-- Agent Prompts (placeholders — conteudo real na story 3.1)
INSERT INTO agent_prompts (org_id, slug, name, content, is_active) VALUES
  ('ORG_UUID', 'system_personality', 'Personalidade Nicole', '[placeholder]', true),
  ('ORG_UUID', 'qualification_flow', 'Fluxo de Qualificacao', '[placeholder]', true),
  ('ORG_UUID', 'property_presentation', 'Apresentacao de Empreendimentos', '[placeholder]', true),
  ('ORG_UUID', 'visit_scheduling', 'Agendamento de Visitas', '[placeholder]', true),
  ('ORG_UUID', 'handoff_summary', 'Resumo para Corretor', '[placeholder]', true),
  ('ORG_UUID', 'guardrails', 'Guardrails da IA', '[placeholder]', true),
  ('ORG_UUID', 'off_hours', 'Mensagem Fora do Horario', '[placeholder]', true);
```

### Referencia agente-linda:
- Adaptar de `~/agente-linda/supabase/seed.sql`
- Kanban stages sao novos (agente-linda nao tinha pipeline imobiliario)

## Dependencias
- Depende de: 1.2 (schema), 1.5 (auth — precisa dos users criados no Supabase Auth)
- Bloqueia: Bloco 2 (seeds de empreendimentos referenciam org_id), Bloco 3 (prompts referenciam org_id)

## Estimativa
P (Pequena) — 1-2 horas

## File List

### Created/Modified
- `supabase/seed.sql` — Seed SQL principal com organizacao, usuarios, kanban stages, agent config e agent prompts
- `supabase/run-seed.ts` — Script TypeScript para execucao do seed

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
