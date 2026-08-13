-- 229: Perfis de Acesso 2.0 — F4-2: o GOD-GATE fatiado (Story 75-315).
-- Decisão do Marcos (13/08): "a matriz manda nos DADOS". Cada policy do antigo
-- gate central por nome de role passa a usar has_capability('<ação do domínio>').
-- Ramos de dono/participante preservados VERBATIM (policies geradas a partir do
-- pg_policies de prod, não de memória). Cortes intencionais (caronas): SDR/GR
-- perdem DADOS de obras/clientes/KB/imóveis; obras perde conversas de leads;
-- brindes fica só na matriz. FORA (nota F5): users_update_admin e
-- leads_select_consultoria (estruturas dedicadas).

DROP POLICY IF EXISTS "agent_config_manage" ON public.agent_config;
CREATE POLICY "agent_config_manage" ON public.agent_config FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('nicole.personalidade_editar'::text)));

DROP POLICY IF EXISTS "ama_delete" ON public.agent_media_assets;
CREATE POLICY "ama_delete" ON public.agent_media_assets FOR DELETE
  USING (((org_id = user_org_id()) AND has_capability('nicole.midia_gerenciar'::text)));

DROP POLICY IF EXISTS "ama_insert" ON public.agent_media_assets;
CREATE POLICY "ama_insert" ON public.agent_media_assets FOR INSERT
  WITH CHECK (((org_id = user_org_id()) AND has_capability('nicole.midia_gerenciar'::text)));

DROP POLICY IF EXISTS "ama_update" ON public.agent_media_assets;
CREATE POLICY "ama_update" ON public.agent_media_assets FOR UPDATE
  USING (((org_id = user_org_id()) AND has_capability('nicole.midia_gerenciar'::text)));

DROP POLICY IF EXISTS "broker_assign_manage" ON public.broker_assignments;
CREATE POLICY "broker_assign_manage" ON public.broker_assignments FOR ALL
  USING (((EXISTS ( SELECT 1
   FROM brokers b
  WHERE ((b.id = broker_assignments.broker_id) AND (b.org_id = user_org_id())))) AND has_module_access('corretores'::text)));

DROP POLICY IF EXISTS "chamados_select" ON public.chamados;
CREATE POLICY "chamados_select" ON public.chamados FOR SELECT
  USING (((org_id = user_org_id()) AND ((reporter_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid()))) OR has_capability('chamados.ver_todos'::text))));

DROP POLICY IF EXISTS "chamados_update_admin" ON public.chamados;
CREATE POLICY "chamados_update_admin" ON public.chamados FOR UPDATE
  USING (((org_id = user_org_id()) AND has_capability('chamados.responder'::text)))
  WITH CHECK (((org_id = user_org_id()) AND has_capability('chamados.responder'::text)));

DROP POLICY IF EXISTS "cliente_obras_manage_admin" ON public.cliente_obras;
CREATE POLICY "cliente_obras_manage_admin" ON public.cliente_obras FOR ALL
  USING (((EXISTS ( SELECT 1
   FROM obras o
  WHERE ((o.id = cliente_obras.obra_id) AND (o.org_id = user_org_id())))) AND has_capability('clientes.gerenciar'::text)));

DROP POLICY IF EXISTS "clientes_manage" ON public.clientes;
CREATE POLICY "clientes_manage" ON public.clientes FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('clientes.gerenciar'::text)));

DROP POLICY IF EXISTS "clientes_obras_vinculos_manage" ON public.clientes_obras_vinculos;
CREATE POLICY "clientes_obras_vinculos_manage" ON public.clientes_obras_vinculos FOR ALL
  USING ((has_capability('clientes.gerenciar'::text) AND (EXISTS ( SELECT 1
   FROM clientes c
  WHERE ((c.id = clientes_obras_vinculos.cliente_id) AND (c.org_id = user_org_id()))))));

DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT
  USING (((org_id = user_org_id()) AND (has_capability('conversas.ver_qualquer'::text) OR (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = conversations.lead_id) AND (l.assigned_broker_id = ( SELECT brokers.user_id
           FROM brokers
          WHERE (brokers.id = user_broker_id())))))))));

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.org_id = user_org_id()) AND (has_capability('conversas.ver_qualquer'::text) OR (EXISTS ( SELECT 1
           FROM leads l
          WHERE ((l.id = c.lead_id) AND (l.assigned_broker_id = ( SELECT brokers.user_id
                   FROM brokers
                  WHERE (brokers.id = user_broker_id())))))))))));

DROP POLICY IF EXISTS "fin_notif_select" ON public.financial_notification_log;
CREATE POLICY "fin_notif_select" ON public.financial_notification_log FOR SELECT TO authenticated
  USING (((org_id = user_org_id()) AND has_capability('sistema.notificacoes-financeiras'::text)));

DROP POLICY IF EXISTS "followup_rules_manage" ON public.follow_up_rules;
CREATE POLICY "followup_rules_manage" ON public.follow_up_rules FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('configuracoes.pipeline_followup'::text)));

DROP POLICY IF EXISTS "stages_manage_admin" ON public.kanban_stages;
CREATE POLICY "stages_manage_admin" ON public.kanban_stages FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('configuracoes.pipeline_editar'::text)));

DROP POLICY IF EXISTS "kb_manage" ON public.knowledge_base;
CREATE POLICY "kb_manage" ON public.knowledge_base FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('nicole.treinamento_gerenciar'::text)));

DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT
  USING (((org_id = user_org_id()) AND (has_capability('leads.ver_equipe'::text) OR (assigned_broker_id = public_user_id()))));

DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads FOR UPDATE
  USING (((org_id = user_org_id()) AND (has_capability('leads.editar_qualquer'::text) OR (assigned_broker_id = public_user_id()))));

DROP POLICY IF EXISTS "obra_conversas_manage" ON public.obra_conversas;
CREATE POLICY "obra_conversas_manage" ON public.obra_conversas FOR ALL
  USING (((org_id = user_org_id()) AND (has_capability('obras.mensagens_enviar'::text) OR (id IN ( SELECT obra_conversas_participants.conversa_id
   FROM obra_conversas_participants
  WHERE (obra_conversas_participants.user_id = public_user_id()))))));

DROP POLICY IF EXISTS "obra_conv_part_manage" ON public.obra_conversas_participants;
CREATE POLICY "obra_conv_part_manage" ON public.obra_conversas_participants FOR ALL
  USING ((EXISTS ( SELECT 1
   FROM obra_conversas c
  WHERE ((c.id = obra_conversas_participants.conversa_id) AND (c.org_id = user_org_id()) AND (has_capability('obras.mensagens_enviar'::text) OR (obra_conversas_participants.user_id = public_user_id()))))));

DROP POLICY IF EXISTS "obra_documentos_manage_admin" ON public.obra_documentos;
CREATE POLICY "obra_documentos_manage_admin" ON public.obra_documentos FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('obras.documentos_gerenciar'::text)));

DROP POLICY IF EXISTS "obra_fases_manage_admin" ON public.obra_fases;
CREATE POLICY "obra_fases_manage_admin" ON public.obra_fases FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('obras.fases_gerenciar'::text)));

DROP POLICY IF EXISTS "obra_fotos_manage_admin" ON public.obra_fotos;
CREATE POLICY "obra_fotos_manage_admin" ON public.obra_fotos FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('obras.fotos_enviar'::text)));

DROP POLICY IF EXISTS "obra_mensagens_manage_admin" ON public.obra_mensagens;
CREATE POLICY "obra_mensagens_manage_admin" ON public.obra_mensagens FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('obras.mensagens_enviar'::text)));

DROP POLICY IF EXISTS "obras_manage_admin" ON public.obras;
CREATE POLICY "obras_manage_admin" ON public.obras FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('obras.editar'::text)));

DROP POLICY IF EXISTS "org_update_admin" ON public.organizations;
CREATE POLICY "org_update_admin" ON public.organizations FOR UPDATE
  USING (((id = user_org_id()) AND has_capability('configuracoes.empresa_editar'::text)));

DROP POLICY IF EXISTS "properties_manage" ON public.properties;
CREATE POLICY "properties_manage" ON public.properties FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('imoveis.editar'::text)));

DROP POLICY IF EXISTS "media_manage" ON public.property_media;
CREATE POLICY "media_manage" ON public.property_media FOR ALL
  USING (((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = property_media.property_id) AND (p.org_id = user_org_id())))) AND has_capability('imoveis.editar'::text)));

DROP POLICY IF EXISTS "typologies_manage" ON public.typologies;
CREATE POLICY "typologies_manage" ON public.typologies FOR ALL
  USING (((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = typologies.property_id) AND (p.org_id = user_org_id())))) AND has_capability('imoveis.editar'::text)));

DROP POLICY IF EXISTS "units_manage" ON public.units;
CREATE POLICY "units_manage" ON public.units FOR ALL
  USING (((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = units.property_id) AND (p.org_id = user_org_id())))) AND has_capability('imoveis.editar'::text)));

DROP POLICY IF EXISTS "sales_manage" ON public.unit_sales;
CREATE POLICY "sales_manage" ON public.unit_sales FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('imoveis.vender_unidade'::text)));

DROP POLICY IF EXISTS "admin_delete_obra_docs" ON storage.objects;
CREATE POLICY "admin_delete_obra_docs" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'obra-docs'::text) AND has_capability('obras.documentos_gerenciar'::text)));

DROP POLICY IF EXISTS "admin_upload_obra_docs" ON storage.objects;
CREATE POLICY "admin_upload_obra_docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'obra-docs'::text) AND has_capability('obras.documentos_gerenciar'::text)));

DROP POLICY IF EXISTS "admin_delete_obra_fotos" ON storage.objects;
CREATE POLICY "admin_delete_obra_fotos" ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'obra-fotos'::text) AND has_capability('obras.fotos_enviar'::text)));

DROP POLICY IF EXISTS "admin_upload_obra_fotos" ON storage.objects;
CREATE POLICY "admin_upload_obra_fotos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'obra-fotos'::text) AND has_capability('obras.fotos_enviar'::text)));

DROP POLICY IF EXISTS "campaign_assets_admin_delete" ON storage.objects;
CREATE POLICY "campaign_assets_admin_delete" ON storage.objects FOR DELETE
  USING (((bucket_id = 'campaign-assets'::text) AND has_capability('campanhas.gerenciar'::text)));

DROP POLICY IF EXISTS "chamados_storage_delete" ON storage.objects;
CREATE POLICY "chamados_storage_delete" ON storage.objects FOR DELETE
  USING (((bucket_id = 'chamados-attachments'::text) AND has_capability('chamados.ver_todos'::text)));

DROP POLICY IF EXISTS "chamados_storage_select" ON storage.objects;
CREATE POLICY "chamados_storage_select" ON storage.objects FOR SELECT
  USING (((bucket_id = 'chamados-attachments'::text) AND (auth.uid() IS NOT NULL) AND (((storage.foldername(name))[2] = ( SELECT (users.id)::text AS id
   FROM users
  WHERE (users.auth_id = auth.uid()))) OR has_capability('chamados.ver_todos'::text))));

DROP POLICY IF EXISTS "brindes_tipos_write" ON public.brindes_tipos;
CREATE POLICY "brindes_tipos_write" ON public.brindes_tipos FOR ALL
  USING (((org_id = user_org_id()) AND has_module_access('brindes'::text)));

DROP POLICY IF EXISTS "brindes_dest_write" ON public.brindes_destinatarios;
CREATE POLICY "brindes_dest_write" ON public.brindes_destinatarios FOR ALL
  USING (((org_id = user_org_id()) AND has_module_access('brindes'::text)));

DROP POLICY IF EXISTS "brindes_ent_write" ON public.brindes_entregas;
CREATE POLICY "brindes_ent_write" ON public.brindes_entregas FOR ALL
  USING (((org_id = user_org_id()) AND has_module_access('brindes'::text)));

DROP POLICY IF EXISTS "datas_com_write" ON public.datas_comemorativas;
CREATE POLICY "datas_com_write" ON public.datas_comemorativas FOR ALL
  USING (((org_id = user_org_id()) AND has_module_access('brindes'::text)));

DROP POLICY IF EXISTS "roles_insert_policy" ON public.roles;
CREATE POLICY "roles_insert_policy" ON public.roles FOR INSERT
  WITH CHECK (((org_id = user_org_id()) AND has_capability('perfis.gerenciar'::text)));

DROP POLICY IF EXISTS "roles_update_policy" ON public.roles;
CREATE POLICY "roles_update_policy" ON public.roles FOR UPDATE
  USING (((org_id = user_org_id()) AND has_capability('perfis.gerenciar'::text)));

DROP POLICY IF EXISTS "roles_delete_policy" ON public.roles;
CREATE POLICY "roles_delete_policy" ON public.roles FOR DELETE
  USING (((org_id = user_org_id()) AND has_capability('perfis.gerenciar'::text) AND (is_system = false)));

DROP POLICY IF EXISTS "role_permissions_insert_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_insert_policy" ON public.role_permissions FOR INSERT
  WITH CHECK (((org_id = user_org_id()) AND has_capability('perfis.gerenciar'::text)));

DROP POLICY IF EXISTS "role_permissions_update_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_update_policy" ON public.role_permissions FOR UPDATE
  USING (((org_id = user_org_id()) AND has_capability('perfis.gerenciar'::text)));

DROP POLICY IF EXISTS "role_permissions_delete_policy" ON public.role_permissions;
CREATE POLICY "role_permissions_delete_policy" ON public.role_permissions FOR DELETE
  USING (((org_id = user_org_id()) AND has_capability('perfis.gerenciar'::text)));

DROP POLICY IF EXISTS "admins_manage_exceptions" ON public.user_permission_exceptions;
CREATE POLICY "admins_manage_exceptions" ON public.user_permission_exceptions FOR ALL TO authenticated
  USING ((has_capability('perfis.gerenciar'::text) AND (org_id = user_org_id())))
  WITH CHECK ((has_capability('perfis.gerenciar'::text) AND (org_id = user_org_id())));

DROP POLICY IF EXISTS "agent_prompts_manage" ON public.agent_prompts;
CREATE POLICY "agent_prompts_manage" ON public.agent_prompts FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('nicole.personalidade_editar'::text)));

DROP POLICY IF EXISTS "agent_prompt_versions_select_admin" ON public.agent_prompt_versions;
CREATE POLICY "agent_prompt_versions_select_admin" ON public.agent_prompt_versions FOR SELECT
  USING (((org_id = user_org_id()) AND has_capability('nicole.personalidade_editar'::text)));

DROP POLICY IF EXISTS "email_settings_upsert" ON public.email_settings;
CREATE POLICY "email_settings_upsert" ON public.email_settings FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('sistema.emails_gerenciar'::text)));

DROP POLICY IF EXISTS "whatsapp_config_manage" ON public.whatsapp_config;
CREATE POLICY "whatsapp_config_manage" ON public.whatsapp_config FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('configuracoes.integracoes_gerenciar'::text)));

DROP POLICY IF EXISTS "chamados_delete_admin" ON public.chamados;
CREATE POLICY "chamados_delete_admin" ON public.chamados FOR DELETE
  USING (((org_id = user_org_id()) AND has_capability('chamados.apagar'::text)));

DROP POLICY IF EXISTS "pii_log_admin_select_own_org" ON public.agent_pii_access_log;
CREATE POLICY "pii_log_admin_select_own_org" ON public.agent_pii_access_log FOR SELECT
  USING ((has_capability('agente.contexto_crm'::text) AND (org_id = user_org_id())));

DROP POLICY IF EXISTS "pii_log_admin_insert_only" ON public.agent_pii_access_log;
CREATE POLICY "pii_log_admin_insert_only" ON public.agent_pii_access_log FOR INSERT
  WITH CHECK ((has_capability('agente.contexto_crm'::text) AND (org_id = user_org_id())));

DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
CREATE POLICY "users_insert_admin" ON public.users FOR INSERT
  WITH CHECK (((org_id = user_org_id()) AND has_capability('usuarios.criar'::text)));

DROP POLICY IF EXISTS "Admins can read org events" ON public.system_events;
CREATE POLICY "Admins can read org events" ON public.system_events FOR SELECT
  USING (((org_id = user_org_id()) AND has_capability('sistema.auditoria_ver'::text)));

DROP POLICY IF EXISTS "aprovacoes_update" ON public.obra_upload_aprovacoes;
CREATE POLICY "aprovacoes_update" ON public.obra_upload_aprovacoes FOR UPDATE
  USING (((org_id = user_org_id()) AND has_capability('obras.aprovar_uploads'::text)));

DROP POLICY IF EXISTS "aprovacoes_delete" ON public.obra_upload_aprovacoes;
CREATE POLICY "aprovacoes_delete" ON public.obra_upload_aprovacoes FOR DELETE
  USING (((org_id = user_org_id()) AND has_capability('obras.aprovar_uploads'::text)));

DROP POLICY IF EXISTS "brokers_manage" ON public.brokers;
CREATE POLICY "brokers_manage" ON public.brokers FOR ALL
  USING (((org_id = user_org_id()) AND has_capability('corretores.gerenciar'::text)));
