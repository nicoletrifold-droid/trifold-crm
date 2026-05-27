// Constantes de módulos — sem código server-side para poder importar em Client Components

export const ALL_MODULES: readonly string[] = [
  "agenda",
  "alertas",
  "analytics",
  "atividades",
  "brindes",
  "campanhas",
  "chamados",
  "configuracoes",
  "conversas",
  "corretores",
  "dashboard",
  "imoveis",
  "leads",
  "mensagens",
  "obras",
  "pipeline",
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
  configuracoes: "Configurações",
  sistema: "Sistema",
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
  configuracoes: "Preferências da org",
  sistema: "Administração total",
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
}
