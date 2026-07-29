/**
 * Deep link interno do lead conforme o app do dono (Story 75-226).
 *
 * Corretor trabalha no /broker; SDR trabalha no /dashboard (o layout /broker
 * redireciona role ≠ broker e o lead se perderia). Fail-open: sem role
 * conhecido, mantém a URL de corretor (comportamento histórico).
 */
export function leadDeepLink(
  appUrl: string,
  ownerRole: string | null | undefined,
  leadId: string
): string {
  return ownerRole === "sdr"
    ? `${appUrl}/dashboard/leads/${leadId}`
    : `${appUrl}/broker/leads/${leadId}`
}
