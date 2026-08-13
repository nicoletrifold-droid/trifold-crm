// Perfis de Acesso 2.0 — F1 fundação (Story 75-300).
//
// REGISTRO ÚNICO das capabilities (ações) do CRM: `modulo.acao`, exatamente 1 ponto
// por chave (invariante testada — é o que garante a herança de 1 nível do SQL).
// A coluna `seed` espelha o comportamento de HOJE (inventário de 13/08, artifact
// "Perfis de Acesso 2.0") — inclusive furos conhecidos, corrigidos em F4.
//
// Módulo PURO de propósito (sem imports server-side): é lido por Client/Server
// Components, pelos testes e pelo gerador do seed (scripts/gen-capability-seed.mts).
// O `import type` abaixo é apagado na compilação — não puxa código do auth.ts.
//
// REGRA PRO FUTURO (F3): gate novo de AÇÃO usa `can(user, "modulo.acao")`
// (permissions.ts) — nunca lista de nomes de role.

import type { AppUser } from "./auth"

export type RoleName = AppUser["role"]

/** Roles internos conhecidos (nomes do banco). `cliente` (portal) fica de fora: zero capability. */
export const KNOWN_ROLES = [
  "admin",
  "supervisor",
  "gerente-comercial",
  "sdr",
  "broker",
  "obras",
  "gerente-relacionamento",
  "imob",
  "consultoria",
  "social-media",
] as const satisfies readonly RoleName[]

/**
 * Grupos que NÃO são módulo da sidebar (decisão 2 do épico): na matriz (F2) são
 * grupos visuais; na resolução, pai inexistente em `role_permissions` = default-deny
 * (`perms[pai] ?? false` no app; `COALESCE(..., false)` no SQL).
 */
export const VIRTUAL_GROUPS = [
  "agente",
  "clientes",
  "marketing",
  "nicole",
  "perfis",
  "portal",
  "usuarios",
] as const

export interface CapabilityDef {
  key: string
  label: string
  description: string
  /** Espelho dia 1: roles que HOJE têm a ação (inventário 13/08). */
  seed: readonly RoleName[]
  /**
   * Story 75-301 — `true` SOMENTE quando o gate real no código já decide por
   * `can()` (regra anti-"botão que mente" do épico). Capability sem `enforced`
   * NÃO aparece em nenhuma UI (matriz/exceções). Cada story F3 liga o flag das
   * capabilities que migrar — nunca antes do gate.
   */
  enforced?: true
}

const A = "admin" as const
const S = "supervisor" as const
const GC = "gerente-comercial" as const
const SDR = "sdr" as const
const COR = "broker" as const
const OBR = "obras" as const
const GR = "gerente-relacionamento" as const
const IMB = "imob" as const
const SM = "social-media" as const

export const CAPABILITIES = [
  // ── Leads ────────────────────────────────────────────────────────────────
  // enforced na 75-311 (F3-10): rotas + telas de leads decidem por can().
  { key: "leads.ver_equipe", label: "Ver leads da equipe", description: "Listas completas, filtro por corretor e funil da equipe (não só os próprios leads). ⚠ o dado em si é RLS — F4.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.criar", label: "Criar lead", description: "Cadastrar lead manualmente (para si ou escolhendo o corretor).", seed: [COR, A, S, GC, SDR], enforced: true }, // furo nº5 FECHADO na F4-1 (decisão Marcos 13/08): GC/SDR liberados — a tela sempre aparentou permitir
  { key: "leads.criar_para_outro", label: "Criar lead para outro corretor", description: "Escolher o corretor dono no cadastro manual.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.editar_qualquer", label: "Editar lead de terceiros", description: "Editar dados de lead que não é seu (o dono sempre edita o próprio).", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.apagar", label: "Excluir lead", description: "Exclusão (soft delete) de lead.", seed: [A], enforced: true },
  { key: "leads.reativar", label: "Reativar lead perdido", description: "Tirar lead da etapa Perdido e devolver ao funil.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.atribuir", label: "Atribuir corretor", description: "Definir/trocar o corretor responsável pelo lead.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.transferir", label: "Transferir lead", description: "Transferir lead + conversa entre corretores.", seed: [A, S], enforced: true },
  { key: "leads.mover_etapa_qualquer", label: "Mover etapa de terceiros", description: "Mover lead de outra pessoa no pipeline.", seed: [A, S], enforced: true },
  { key: "leads.acoes_em_massa", label: "Ações em massa", description: "Atribuir, marcar perdido ou enviar à roleta em lote.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.anotar_qualquer", label: "Anotar em lead de terceiros", description: "Notas, atividades e aviso de resposta em lead de outra pessoa.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.ia_handoff", label: "Handoff da Nicole", description: "Tirar o lead da IA e passar para atendimento humano.", seed: [A, S], enforced: true },
  { key: "leads.ia_retomar", label: "Devolver lead à Nicole", description: "Reativar a IA num lead em atendimento humano.", seed: [A, S, GC, SDR], enforced: true },
  { key: "leads.ia_resumo", label: "Resumo IA do lead", description: "Gerar resumo da conversa por IA.", seed: [A, S], enforced: true },
  { key: "leads.ia_analisar", label: "Análise de comportamento", description: "Rodar a análise de comportamento IA do lead.", seed: [A, S, GC, SDR, COR], enforced: true },

  // ── Conversas (WhatsApp com leads) ───────────────────────────────────────
  // enforced na 75-310 (F3-9): composers/rotas de envio decidem por can().
  { key: "conversas.enviar", label: "Enviar no próprio lead", description: "Mensagem/arquivo WhatsApp no lead que é seu.", seed: [COR, A, S, GC, SDR], enforced: true },
  { key: "conversas.ver_qualquer", label: "Ler conversas de terceiros", description: "Leitura de conversas e mensagens de qualquer lead (vale direto no banco — RLS).", seed: [A, S, GC, SDR, GR], enforced: true }, // F4-2: obras CORTADO do seed (decisão Marcos) e RLS passou a obedecer a matriz
  { key: "conversas.enviar_qualquer", label: "Enviar em qualquer lead", description: "Enviar/reenviar mensagem e mídia em lead de terceiros.", seed: [A, S, GC, SDR, GR], enforced: true },
  { key: "conversas.abrir_template", label: "Iniciar por template", description: "Abrir atendimento com template de abertura (o dono sempre pode no próprio lead).", seed: [A, S, GC, SDR, GR], enforced: true },
  { key: "conversas.transferir", label: "Transferir conversa", description: "Passar a conversa para outro atendente.", seed: [A, S], enforced: true },

  // ── Chat (relacionamento com clientes) ───────────────────────────────────
  { key: "chat.responder", label: "Responder cliente", description: "Ler e responder conversas de clientes da base no Chat.", seed: [A, S, GR, GC], enforced: true },
  { key: "chat.gerenciar_participantes", label: "Gerenciar participantes", description: "Adicionar/remover participantes de uma conversa do Chat.", seed: [A, S, GR, GC], enforced: true },

  // ── Agenda ───────────────────────────────────────────────────────────────
  // enforced na 75-307 (F3-6): governança da agenda decide por can().
  { key: "agenda.gerenciar_house", label: "Gerenciar agenda HOUSE", description: "Editar/remarcar/cancelar compromissos de terceiros da equipe HOUSE (o dono sempre pode o seu).", seed: [A, S, GC, SDR], enforced: true },
  { key: "agenda.gerenciar_imob", label: "Gerenciar agenda IMOB", description: "Editar/cancelar compromissos da equipe IMOB.", seed: [A, S, IMB], enforced: true },
  { key: "agenda.escolher_equipe", label: "Escolher equipe", description: "Definir HOUSE/IMOB ao criar um compromisso e consultar a grade da outra equipe.", seed: [A, S], enforced: true },
  { key: "agenda.feedback_visita", label: "Feedback de visita de terceiros", description: "Registrar visita/feedback em compromisso de outra pessoa.", seed: [A, S, GC, SDR], enforced: true },

  // ── Analytics · Atividades · Dashboard ───────────────────────────────────
  // enforced na 75-305 (F3-4): as 6 rotas de analytics decidem por can().
  { key: "analytics.geral", label: "Analytics completo", description: "Métricas gerais, origens, relatório PDF e analytics de campanhas.", seed: [A, S], enforced: true },
  { key: "analytics.executivo", label: "Visão executiva", description: "Painel executivo e leads por período.", seed: [A, S, GC, SDR], enforced: true },
  { key: "atividades.ver", label: "Ver atividades", description: "Página de atividades da equipe.", seed: [A, S, GC], enforced: true },
  // ⚠️ 75-305: NÃO migra para can() — é COMPOSIÇÃO DE UX por role (admin/supervisor
  // têm dashboard próprio e ficariam elegíveis pelo bypass de admin). Reavaliar na F5.
  { key: "dashboard.ver_equipe", label: "Blocos de equipe", description: "Blocos “Leads da Equipe” e “Funil da Equipe” no dashboard. (UX por role — não migra p/ capability; ver 75-305.)", seed: [GC, SDR] },

  // ── Obras ────────────────────────────────────────────────────────────────
  // enforced na 75-308 (F3-7): todas as rotas/telas de Obras decidem por can().
  // obras.ver é NOVA (mig 227): os GETs hoje exigem A/S/OBR/GR — o módulo `obras`
  // ligado NÃO basta (consultoria tem o módulo ON em prod e segue bloqueada; a RLS
  // também a bloquearia — liberar é decisão p/ F4, com o Marcos).
  { key: "obras.ver", label: "Ver obras", description: "Listar e abrir obras, fases, documentos e mensagens (leitura).", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.criar", label: "Criar obra", description: "Cadastrar nova obra.", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.editar", label: "Editar obra", description: "Editar dados da obra.", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.apagar", label: "Excluir obra", description: "Excluir a obra.", seed: [A], enforced: true },
  { key: "obras.reativar", label: "Reativar obra", description: "Restaurar obra arquivada.", seed: [A], enforced: true },
  { key: "obras.fases_gerenciar", label: "Gerenciar fases", description: "Criar/editar/excluir fases do cronograma.", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.fotos_enviar", label: "Gerenciar fotos", description: "Enviar, editar e excluir fotos pela API (obras/gerente-relacionamento entram na fila de aprovação — regra de fluxo; a exclusão DIRETA pela tela é a ação separada abaixo).", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.fotos_apagar", label: "Apagar foto/documento direto", description: "Exclusão direta, sem passar pela fila de aprovação.", seed: [A, S], enforced: true },
  { key: "obras.solicitar_exclusao", label: "Solicitar exclusão de foto", description: "Pedir exclusão via fila de aprovação.", seed: [OBR, GR] },
  { key: "obras.documentos_gerenciar", label: "Gerenciar documentos", description: "Upload, edição e download de documentos da obra.", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.documentos_assinar", label: "Assinar documentos", description: "Disparar assinatura eletrônica (Clicksign).", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.aprovar_uploads", label: "Aprovar uploads", description: "Fila de aprovações: ver, aprovar, rejeitar (+ badge no menu).", seed: [A, S], enforced: true },
  { key: "obras.mensagens_enviar", label: "Chat da obra", description: "Ler e enviar mensagens no chat da obra com o cliente.", seed: [A, S, OBR, GR, COR], enforced: true },
  { key: "obras.clientes_vincular", label: "Vincular clientes", description: "Vincular/desvincular cliente da obra.", seed: [A, S, OBR, GR], enforced: true },
  { key: "obras.distrato", label: "Registrar distrato", description: "Registrar distrato de vínculo.", seed: [A], enforced: true },
  { key: "obras.sienge_gerenciar", label: "Integração Sienge", description: "Vincular, sincronizar e reconciliar com o Sienge.", seed: [A, S], enforced: true },
  { key: "obras.vincular_imovel", label: "Vincular imóvel", description: "Vincular empreendimento (imóvel) à obra.", seed: [A, S], enforced: true },
  { key: "obras.receber_email_aprovacao", label: "Receber e-mail de aprovação", description: "Elegível ao toggle pessoal de e-mails de aprovação pendente.", seed: [A, S], enforced: true },

  // ── Clientes (portal) — grupo virtual ────────────────────────────────────
  // enforced na 75-309 (F3-8): rotas de clientes + Portal Viewer decidem por can().
  { key: "clientes.gerenciar", label: "Gerenciar clientes", description: "Criar/editar cliente do portal, vincular obras, buscar.", seed: [A, S, OBR, GR], enforced: true },
  { key: "clientes.apagar", label: "Excluir cliente", description: "Excluir cliente do portal.", seed: [A, S, OBR, GR], enforced: true },
  { key: "clientes.resetar_senha", label: "Resetar senha", description: "Resetar a senha de acesso do cliente ao portal.", seed: [A, S, OBR, GR], enforced: true },
  { key: "clientes.sienge_vincular", label: "Vincular ao Sienge", description: "Vincular cliente ao cadastro do Sienge.", seed: [A, S], enforced: true },

  // ── Portal do Cliente (visão interna) — grupo virtual ────────────────────
  { key: "portal.ver_como_cliente", label: "Ver como cliente", description: "Abrir o Portal Viewer de qualquer cliente.", seed: [A, S], enforced: true },
  { key: "portal.financeiro_ver", label: "Financeiro do cliente", description: "Boleto e extrato do cliente pelo dashboard.", seed: [A, S], enforced: true },

  // ── Imóveis ──────────────────────────────────────────────────────────────
  // enforced na 75-306 (F3-5): rotas + páginas de Imóveis decidem por can().
  { key: "imoveis.criar", label: "Criar empreendimento", description: "Cadastrar novo empreendimento.", seed: [A, S], enforced: true },
  { key: "imoveis.editar", label: "Editar empreendimento", description: "Editar empreendimento e unidades; criar tipologias.", seed: [A, S, OBR, GR], enforced: true },
  { key: "imoveis.apagar", label: "Excluir empreendimento", description: "Excluir empreendimento ou tipologia.", seed: [A, S], enforced: true },
  { key: "imoveis.vender_unidade", label: "Registrar venda", description: "Registrar a venda de uma unidade.", seed: [A, S], enforced: true },
  // 75-306: PATCH de tipologia é historicamente MAIS estrito que criar (A/S vs A/S/OBR/GR) —
  // espelho estrito preserva a assimetria; alinhar é decisão de negócio futura. Seed na mig 226.
  { key: "imoveis.tipologias_editar", label: "Editar tipologia existente", description: "Alterar uma tipologia já criada (criar tipologia segue em Editar empreendimento).", seed: [A, S], enforced: true },
  { key: "imoveis.resetar_status_unidade", label: "Resetar status de unidade", description: "Resetar o status de uma unidade para disponível, fora da máquina de estados.", seed: [A], enforced: true },
  { key: "imoveis.ativar_nicole", label: "Ativar Nicole no empreendimento", description: "Ligar a IA no empreendimento (desligar é livre).", seed: [A, S], enforced: true },

  // ── Pastas · IMOB · Marketing ────────────────────────────────────────────
  // enforced na 75-302 (F3-1): rotas/páginas de Pastas + imobiliariasGuard decidem por can().
  { key: "pastas.gerenciar", label: "Gerenciar pastas", description: "Pastas de pré-lançamento: criar, editar, documentos, links públicos, termos e assinaturas.", seed: [A, S, GC, IMB], enforced: true },
  { key: "imob.imobiliarias_gerenciar", label: "Gerenciar imobiliárias", description: "CRUD de imobiliárias parceiras.", seed: [A, S, GC, IMB] },
  // enforced na 75-301 (piloto): marketingGuard + telas de campanhas decidem por can().
  { key: "marketing.gerenciar", label: "Gerenciar marketing (Lídia)", description: "Posts, artes, pedidos, marcas e assets do agente de marketing.", seed: [A, S, SM], enforced: true },

  // ── Campanhas & Meta Ads ─────────────────────────────────────────────────
  // enforced na 75-303 (F3-2): rotas de campanhas + telas Meta decidem por can().
  { key: "campanhas.gerenciar", label: "Gerenciar campanhas", description: "Criar/editar/ativar/pausar campanhas, entradas e imagens.", seed: [A, S], enforced: true },
  { key: "campanhas.disparar", label: "Disparar em massa", description: "Disparo WhatsApp/e-mail em massa + importação de CSV.", seed: [A, S], enforced: true },
  { key: "campanhas.meta_sincronizar", label: "Sincronizar Meta Ads", description: "Rodar o sync de campanhas do Meta (botão e rota).", seed: [A], enforced: true },
  { key: "campanhas.meta_acionar", label: "Acionar campanha Meta", description: "Pausar/ativar campanha Meta pela tela de detalhe.", seed: [A], enforced: true },
  { key: "campanhas.meta_ver", label: "Ver detalhes Meta", description: "Criativos e log de ações da campanha Meta.", seed: [A], enforced: true },

  // ── Nicole — grupo virtual ───────────────────────────────────────────────
  { key: "nicole.personalidade_editar", label: "Editar personalidade", description: "Prompts e configuração da Nicole.", seed: [A], enforced: true },
  { key: "nicole.treinamento_gerenciar", label: "Gerenciar treinamento", description: "Criar/editar entradas da base de conhecimento.", seed: [A, S, GC], enforced: true },
  { key: "nicole.treinamento_apagar", label: "Excluir treinamento", description: "Excluir entrada da KB e editar entradas vindas do site.", seed: [A], enforced: true },
  { key: "nicole.midia_gerenciar", label: "Gerenciar mídia", description: "Biblioteca de mídia: upload, edição e exclusão.", seed: [A, S, GC], enforced: true },
  { key: "nicole.midia_enviar", label: "Enviar mídia a lead", description: "Enviar mídia da biblioteca a um lead (o dono também pode).", seed: [A, S, GC], enforced: true },

  // ── Agente de marketing (Lídia · chat) — grupo virtual ───────────────────
  { key: "agente.contexto_crm", label: "Contexto CRM no chat", description: "Chat da Lídia com dados CRM/PII injetados.", seed: [A], enforced: true },
  { key: "agente.contexto_criativo", label: "Contexto de criativos", description: "Chat da Lídia com performance de criativos.", seed: [A, S, GC], enforced: true },
  { key: "agente.confirmar_acoes", label: "Confirmar ações", description: "Confirmar/cancelar ações sugeridas pelo agente.", seed: [A], enforced: true },
  { key: "agente.ver_log", label: "Ver log do agente", description: "Log de sessões e de uso do agente.", seed: [A, S], enforced: true },

  // ── Roleta · Bolsão · Corretores ─────────────────────────────────────────
  { key: "roleta.configurar", label: "Configurar roleta", description: "Configuração, agenda de distribuição e fila da roleta.", seed: [A, S, GC], enforced: true },
  { key: "roleta.distribuir_manual", label: "Distribuir manualmente", description: "Distribuir um lead na mão.", seed: [A, S], enforced: true },
  { key: "roleta.atender_todo_empreendimento", label: "Atender qualquer empreendimento", description: "Bypass do vínculo corretor↔empreendimento na distribuição (hoje hardcoded para SDR na RPC).", seed: [SDR] },
  { key: "bolsao.puxar", label: "Puxar do bolsão", description: "Puxar lead do bolsão na própria área (/broker).", seed: [COR] },
  { key: "bolsao.puxar_dashboard", label: "Puxar pelo dashboard", description: "Puxar lead do bolsão pela tela do dashboard.", seed: [GC] },
  { key: "corretores.gerenciar", label: "Gerenciar corretores", description: "Criar/editar corretor (cadastro, teto, disponibilidade).", seed: [A, GC], enforced: true },

  // ── Chamados ─────────────────────────────────────────────────────────────
  // enforced na 75-304 (F3-3): API de listagem, tela e badge do menu decidem por can().
  { key: "chamados.ver_todos", label: "Ver todos os chamados", description: "Ver todos os tickets da organização (não só os próprios) + badge no menu.", seed: [A, S], enforced: true },
  { key: "chamados.responder", label: "Responder chamados", description: "Responder, mudar status, resolver e reabrir tickets.", seed: [A, S], enforced: true },
  { key: "chamados.apagar", label: "Excluir chamado", description: "Excluir um ticket (gate na RLS — obedece a matriz desde a F4-2).", seed: [A], enforced: true },

  // ── Usuários & Perfis — grupos virtuais ──────────────────────────────────
  // enforced na 75-312 (F3-11): APIs de usuários/config + telas decidem por can().
  { key: "usuarios.criar", label: "Criar usuário", description: "Cadastrar novo usuário na organização.", seed: [A], enforced: true },
  { key: "usuarios.editar", label: "Editar usuário", description: "Editar usuário, ativar/desativar, resetar senha (gerente-comercial: só corretores).", seed: [A, GC], enforced: true },
  { key: "usuarios.trocar_perfil", label: "Trocar perfil", description: "Trocar o perfil de acesso de um usuário.", seed: [A], enforced: true },
  { key: "perfis.gerenciar", label: "Gerenciar perfis de acesso", description: "Criar/editar/excluir perfis, matriz de permissões e exceções por usuário.", seed: [A], enforced: true },

  // ── Configurações (ações; as TELAS são sub-módulos do SUBMODULE_MAP) ─────
  { key: "configuracoes.empresa_editar", label: "Editar empresa", description: "Editar os dados da organização.", seed: [A], enforced: true },
  { key: "configuracoes.horario_editar", label: "Editar horário comercial", description: "Editar a grade de horário comercial.", seed: [A] },
  { key: "configuracoes.pipeline_editar", label: "Editar etapas do pipeline", description: "Criar/editar/excluir etapas.", seed: [A], enforced: true },
  { key: "configuracoes.pipeline_followup", label: "Follow-up da etapa", description: "Configurar regras de follow-up por etapa.", seed: [A, S], enforced: true },
  { key: "configuracoes.integracoes_gerenciar", label: "Gerenciar integrações", description: "Conectar/desconectar Google Calendar e demais integrações.", seed: [A], enforced: true },
  { key: "configuracoes.atendente_padrao_ver", label: "Ver atendente padrão", description: "Consultar o atendente padrão do Chat.", seed: [A, S, OBR, GR, GC], enforced: true },
  { key: "configuracoes.atendente_padrao_editar", label: "Editar atendente padrão", description: "Trocar o atendente padrão do Chat.", seed: [A, S], enforced: true },

  // ── Sistema · Alertas ────────────────────────────────────────────────────
  // enforced na 75-313 (F3-12): APIs/telas de sistema, nicole e agente decidem por can().
  { key: "sistema.auditoria_ver", label: "Auditoria e logs", description: "Audit logs, exportação, eventos do sistema e logs de webhook.", seed: [A], enforced: true },
  { key: "sistema.emails_gerenciar", label: "Gerenciar e-mails", description: "Config SMTP, templates, automações e logs de e-mail.", seed: [A], enforced: true },
  { key: "sistema.emails_disparar", label: "Disparar e-mails", description: "Blast em massa e envio rápido.", seed: [A], enforced: true },
  { key: "sistema.manutencao", label: "Manutenção", description: "Backfills e ferramentas de manutenção.", seed: [A], enforced: true },
  { key: "alertas.followup_ver", label: "Follow-ups da equipe", description: "Ver follow-ups pendentes de toda a equipe.", seed: [A, S], enforced: true },
] as const satisfies readonly CapabilityDef[]

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"]

/**
 * Mapa chave → roles do seed dia 1 (derivado do registro — fonte única).
 * `Object.fromEntries` perde as chaves literais, daí o cast via `unknown`;
 * a completude é garantida em runtime pelo teste "CAPABILITY_SEED cobre
 * exatamente as chaves do registro" (capabilities.test.ts).
 */
export const CAPABILITY_SEED = Object.fromEntries(
  CAPABILITIES.map((c) => [c.key, c.seed])
) as unknown as Record<CapabilityKey, readonly RoleName[]>

/** Grupo (prefixo antes do ponto) de uma capability — derivado, nunca digitado 2×. */
export function capabilityGroup(key: string): string {
  return key.slice(0, key.indexOf("."))
}

/** Capabilities com gate real no código — as ÚNICAS que aparecem em UI (75-301). */
// O `as const satisfies` estreita cada entrada ao seu literal (sem `enforced`
// nas que não o declaram) — o cast devolve a visão uniforme de CapabilityDef.
export const ENFORCED_CAPABILITIES = (CAPABILITIES as readonly CapabilityDef[]).filter(
  (c) => c.enforced === true
)

/** Ações enforced agrupadas pelo prefixo (módulo real ou grupo virtual). */
export function enforcedCapabilitiesByGroup(): Record<string, CapabilityDef[]> {
  const out: Record<string, CapabilityDef[]> = {}
  for (const cap of ENFORCED_CAPABILITIES) {
    const group = capabilityGroup(cap.key)
    ;(out[group] ??= []).push(cap)
  }
  return out
}

/**
 * Labels de exibição dos GRUPOS VIRTUAIS na matriz/exceções (grupos que não são
 * módulo da sidebar). Grupo virtual só é renderizado quando tem ≥1 capability
 * enforced — invariante testada exige label para esses casos.
 */
export const VIRTUAL_GROUP_LABELS: Record<(typeof VIRTUAL_GROUPS)[number], string> = {
  agente: "Agente de Marketing (chat)",
  clientes: "Clientes (portal)",
  marketing: "Marketing (Lídia)",
  nicole: "Nicole",
  perfis: "Perfis de Acesso",
  portal: "Portal do Cliente",
  usuarios: "Usuários",
}

/**
 * 🔴 Descoberta do T6 da 75-301: para ADMIN, `getUserPermissions` devolvia
 * `fullMatrix()` (só módulos de ALL_MODULES) — grupos VIRTUAIS ficavam fora e
 * a herança do pai negava capability de grupo virtual PARA ADMIN (divergindo
 * do contrato `resolveCapabilityDecision` e do `has_capability` SQL, que dão
 * `true`). Este helper é a lista de chaves que o mapa do admin precisa cobrir:
 * módulos + grupos virtuais, tudo `true` (exceções mescladas por cima negam).
 */
export function adminMatrixKeys(allModules: readonly string[]): string[] {
  return [...allModules, ...VIRTUAL_GROUPS]
}

/**
 * 75-302 — elegibilidade de um ROLE para uma capability (sem exceções de
 * usuário; nível role). Usada p/ resolver DESTINATÁRIOS de notificação que
 * seguem a matriz (ex.: "gestores de Pastas"). Mesma tabela-verdade da F1.
 */
export function roleEligibleForCapability(input: {
  roleName: string
  /** linha explícita (role, capability) em role_permissions */
  explicitRow?: boolean
  /** linha do MÓDULO pai para o role */
  moduleRow?: boolean
}): boolean {
  return resolveCapabilityDecision({
    isAdmin: input.roleName === "admin",
    exactRoleRow: input.explicitRow,
    parentRoleRow: input.moduleRow,
  })
}

// ============================================================================
// Exibição da célula de capability na matriz (75-301) — decisão PURA, espelha
// resolveCapabilityDecision para o caso SEM exceção de usuário (a matriz é por
// ROLE; exceções são por usuário e vivem na aba Exceções).
// ============================================================================

export interface CapabilityCellInput {
  /** role.name === 'admin' — admin ignora linhas do role (fullMatrix). */
  isAdminRole: boolean
  /** linha explícita (role_id, capability) em role_permissions */
  explicit?: boolean
  /** valor do módulo pai para o role (grupo virtual ⇒ false) */
  parentGranted: boolean
}

/**
 * Estado exibido do toggle de uma capability na matriz.
 * `locked` = admin: sempre ON e desabilitado — a resolução real (F1) ignora a
 * linha do role para admin; um toggle editável mentiria (risco 4 da story).
 */
export function capabilityCellState(input: CapabilityCellInput): {
  checked: boolean
  locked: boolean
} {
  if (input.isAdminRole) return { checked: true, locked: true }
  return { checked: input.explicit ?? input.parentGranted, locked: false }
}

// ============================================================================
// Contrato de resolução — a MESMA ordem do canAccess dotted (permissions.ts)
// e do has_capability() (migration 225). Função pura de referência: os testes
// exercitam a tabela-verdade aqui; o SQL espelha em comentário.
// ============================================================================

export interface CapabilityDecisionInput {
  /** users.role === 'admin' */
  isAdmin: boolean
  /** user_permission_exceptions com a chave EXATA (undefined = sem linha) */
  exactException?: boolean
  /** role_permissions com a chave EXATA (undefined = sem linha; IGNORADA p/ admin — fullMatrix descarta as linhas do role) */
  exactRoleRow?: boolean
  /** user_permission_exceptions do MÓDULO pai */
  parentException?: boolean
  /** role_permissions do MÓDULO pai (p/ admin é sempre true via fullMatrix) */
  parentRoleRow?: boolean
}

/**
 * Ordem REAL do app (conferida em permissions.ts:234-352):
 *  1. exceção EXATA vence tudo — inclusive admin (canAccess dotted checa a
 *     exceção ANTES de montar o mapa);
 *  2. admin: fullMatrix() (módulos true, dotted ausentes) + exceções mescladas
 *     por cima ⇒ resolve pela exceção do PAI, senão true;
 *  3. linha explícita do perfil para a chave exata;
 *  4. exceção do módulo pai (mesclada por cima da linha do pai no mapa);
 *  5. linha do módulo pai; ausente = nega (default-deny — vale p/ grupos virtuais).
 *
 * Divergência DOCUMENTADA (igual à has_module_access desde a mig 166): role sem
 * NENHUMA linha em role_permissions cai no getHardcodedPermissions no app e em
 * `false` no SQL — inócua em prod (todo role seedado tem linhas).
 */
export function resolveCapabilityDecision(input: CapabilityDecisionInput): boolean {
  if (input.exactException !== undefined) return input.exactException
  if (input.isAdmin) return input.parentException ?? true
  if (input.exactRoleRow !== undefined) return input.exactRoleRow
  if (input.parentException !== undefined) return input.parentException
  return input.parentRoleRow ?? false
}
