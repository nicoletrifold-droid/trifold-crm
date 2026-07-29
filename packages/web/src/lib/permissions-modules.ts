// Constantes de módulos — sem código server-side para poder importar em Client Components

export const ALL_MODULES: readonly string[] = [
  "agenda",
  "alertas",
  "analytics",
  "atividades",
  "bolsao",
  "brindes",
  "campanhas",
  "chamados",
  "chat",
  "configuracoes",
  "conversas",
  "corretores",
  "dashboard",
  "fluxo",
  "imob",
  "imoveis",
  "lancamentos",
  "leads",
  "materiais",
  "mensagens",
  "obras",
  "pastas",
  "pipeline",
  "roleta",
  "sistema",
  "treinamento",
] as const

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  pipeline: "Pipeline",
  leads: "Leads",
  imoveis: "Imóveis",
  corretores: "Corretores",
  conversas: "Conversas",
  agenda: "Agenda",
  alertas: "Alertas",
  atividades: "Atividades",
  analytics: "Analytics",
  campanhas: "Campanhas",
  chamados: "Suporte",
  treinamento: "Treinamento",
  obras: "Obras",
  brindes: "Brindes",
  mensagens: "Mensagens",
  chat: "Chat",
  configuracoes: "Configurações",
  roleta: "Roleta de Leads",
  sistema: "Sistema",
  imob: "IMOB",
  bolsao: "Bolsão",
  fluxo: "Fluxo de Pagamento",
  pastas: "Pastas",
  lancamentos: "Lançamentos",
  materiais: "Central de Materiais",
}

export const MODULE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Visão geral e métricas",
  pipeline: "Kanban de oportunidades",
  leads: "Cadastro e qualificação",
  imoveis: "Catálogo de propriedades",
  corretores: "Equipe e performance",
  conversas: "Mensagens e atendimento",
  agenda: "Eventos e compromissos",
  alertas: "Notificações e follow-ups",
  atividades: "Histórico de ações",
  analytics: "Relatórios avançados",
  campanhas: "Marketing e automação",
  chamados: "Suporte e melhorias do sistema",
  treinamento: "Conteúdos e cursos",
  obras: "Acompanhamento de obras",
  brindes: "Presentes e brindes",
  mensagens: "Comunicação interna",
  chat: "Atendimento de relacionamento (clientes no WhatsApp)",
  configuracoes: "Preferências da org",
  roleta: "Distribuição automática de leads",
  sistema: "Administração total",
  imob: "Imobiliárias parceiras (board + cadastro)",
  bolsao: "Bolsão de leads (pool de atendimento)",
  fluxo: "Fluxo de pagamento (link externo)",
  pastas: "Upload de documentos por link (pré-lançamento)",
  lancamentos: "Board de lançamentos por empreendimento + fornecedores",
  materiais: "Materiais de marketing (artes, fotos, peças) para os corretores — link externo",
}

/**
 * Mapeia módulos pai que possuem sub-módulos. Cada chave é o nome do módulo
 * top-level (ex: "configuracoes") e o valor é um mapa de chaves de sub-módulo
 * (formato `"modulo.submodulo"`) para labels de exibição.
 *
 * Usado por:
 *  - `canAccess` em `permissions.ts` para detectar e processar chaves
 *    com sub-módulo (formato com ponto).
 *  - `UserEditModal` para renderizar as linhas expansíveis de sub-módulos
 *    na aba "Exceções".
 */
export const SUBMODULE_MAP: Record<string, Record<string, string>> = {
  configuracoes: {
    "configuracoes.clientes": "Clientes",
    "configuracoes.usuarios": "Usuários",
    "configuracoes.empresa": "Empresa",
    "configuracoes.horario": "Horário Comercial",
    "configuracoes.integracoes": "Integrações",
    "configuracoes.personalidade": "Personalidade Nicole",
    "configuracoes.pipeline": "Etapas do Pipeline",
    "configuracoes.perfil-acesso": "Perfil de Acesso",
  },
  sistema: {
    "sistema.notificacoes-financeiras": "Notificações Financeiras",
  },
  campanhas: {
    "campanhas.agente": "Agente",
  },
}
