// Story 75-105 — Perfis que gerenciam o módulo Pastas (ver/criar/anexar/deletar).
// admin, supervisor, gerente-comercial e imob (o mundo IMOB lida com interessados do
// pré-lançamento). O perfil revisor dedicado ("Deferido") continua futuro.
export const PASTA_MANAGER_ROLES = ["admin", "supervisor", "gerente-comercial", "imob"] as const

export function isPastaManager(role: string): boolean {
  return (PASTA_MANAGER_ROLES as readonly string[]).includes(role)
}
