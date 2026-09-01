/**
 * Story 75-371 — tradução das falhas de escrita da tela de Pipeline.
 *
 * A API responde `{ error: "Forbidden" }` com 403 (convenção de todo o projeto —
 * `requireCapability`, `lib/api-auth.ts`). Jogar esse corpo na tela é o que o Joabe
 * viu em 01/09/2026: a palavra "Forbidden" em vermelho, em inglês, sem dizer o que
 * fazer. Aqui a decisão de qual frase mostrar é função pura, para ter teste — o
 * componente só renderiza o que ela devolve.
 */

/** Frase única para 403: a tela de Pipeline tem um só dono de permissão. */
export const SEM_PERMISSAO_PIPELINE =
  "Você não tem permissão para alterar as etapas do pipeline. Peça a um administrador para liberar “Editar etapas do pipeline” no seu perfil de acesso."

export function mensagemDeErroDeEtapa(
  status: number,
  corpo: { error?: string } | null | undefined,
  fallback: string,
): string {
  // 403 é permissão: a mensagem da API é técnica por desenho e não serve à tela.
  if (status === 403) return SEM_PERMISSAO_PIPELINE

  // 409 é conflito de regra de negócio: a API manda a frase pronta, em português
  // (ex.: recusa de excluir a etapa padrão). Respeitar o que ela disse.
  const daApi = corpo?.error?.trim()
  if (status === 409 && daApi) return daApi

  return daApi || fallback
}
