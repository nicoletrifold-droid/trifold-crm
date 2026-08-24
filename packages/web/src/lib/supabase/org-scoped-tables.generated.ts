/**
 * ARQUIVO GERADO — NÃO EDITE À MÃO.
 *
 * Fonte   : docs/audits/schema-snapshot.json (introspecção do schema, Story 900-2a)
 * Gerador : scripts/generate-schema-snapshot.ts · `pnpm gate:tenancy:snapshot`
 *
 * POR QUE ESTE MÓDULO EXISTE (Story 900-14b)
 * ------------------------------------------
 * `org-scoped-admin.ts` precisa da lista de tabelas com `org_id`, e ela tem de continuar
 * **derivada por introspecção, nunca escrita à mão** — uma lista manual nasce correta e apodrece,
 * com modo de falha silencioso (o client simplesmente deixa de escopar). Mas o `.vercelignore` da
 * raiz exclui `docs/` do build da Vercel: importar o JSON de lá passa local e no CI e quebra só
 * no deploy. Este módulo é o mesmo dado, dentro da árvore que a Vercel envia — e de brinde
 * mantém 194 KB de JSON de auditoria fora do bundle das rotas.
 *
 * LIMITAÇÃO CONHECIDA: não existe check automático garantindo que este arquivo esteja em sincronia
 * com o snapshot. O que os mantém alinhados é o gerador — os dois artefatos saem da MESMA captura,
 * numa única execução de `pnpm gate:tenancy:snapshot`. Regenere sempre por ele; editar à mão
 * desalinha os dois em silêncio.
 *
 * Snapshot: projeto dsopqkqjkmhytudaaolv · fonte management-api · capturado em 2026-08-23T12:39:14.292Z
 * 92 de 120 tabelas têm `org_id`.
 */

export const TABELAS_COM_ORG_ID = [
  "activities",
  "agent_chat_sessions",
  "agent_config",
  "agent_media_assets",
  "agent_pii_access_log",
  "agent_prompt_versions",
  "agent_prompts",
  "appointments",
  "audit_logs",
  "brindes_destinatarios",
  "brindes_entregas",
  "brindes_tipos",
  "brokers",
  "campaign_entries",
  "campaign_events",
  "campaigns",
  "chamados",
  "clientes",
  "conversations",
  "datas_comemorativas",
  "email_automations",
  "email_blasts",
  "email_logs",
  "email_sends_queue",
  "email_settings",
  "email_templates",
  "financial_notification_log",
  "follow_up_log",
  "follow_up_rules",
  "fornecedores",
  "fvs_equipes",
  "fvs_ficha_modelo_itens",
  "fvs_fichas_modelo",
  "fvs_locais",
  "fvs_servicos",
  "imob_card_comments",
  "imob_cards",
  "imob_columns",
  "imobiliarias",
  "kanban_stages",
  "knowledge_base",
  "lancamento_card_attachments",
  "lancamento_card_checklist",
  "lancamento_card_comments",
  "lancamento_card_fornecedores",
  "lancamento_cards",
  "lancamento_columns",
  "lancamentos",
  "lead_distribution_log",
  "lead_form_responses",
  "lead_forms",
  "lead_tasks",
  "leads",
  "marketing_brand_assets",
  "marketing_brands",
  "marketing_posts",
  "meta_ad_accounts",
  "meta_ads",
  "meta_adsets",
  "meta_alerts",
  "meta_campaigns",
  "meta_capi_outbox",
  "meta_insights_daily",
  "meta_insights_placement_daily",
  "meta_sync_log",
  "obra_conversas",
  "obra_documentos",
  "obra_fase_templates",
  "obra_fases",
  "obra_fotos",
  "obra_mensagens",
  "obra_upload_aprovacoes",
  "obras",
  "pasta_links",
  "pastas",
  "properties",
  "qualificacao_comercial_config",
  "role_permissions",
  "roles",
  "roleta_config",
  "roleta_fila",
  "roleta_schedule",
  "signature_envelopes",
  "supremo_sync_log",
  "system_events",
  "unit_sales",
  "user_permission_exceptions",
  "users",
  "visit_feedback",
  "webhook_logs",
  "whatsapp_config",
  "whatsapp_send_log",
] as const
