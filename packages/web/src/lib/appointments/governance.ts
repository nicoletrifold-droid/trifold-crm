// Story 75-103 — Governança de edição/cancelamento e conflito de horário da agenda.
//
// Regras (diretor):
//  - Agenda é COMPARTILHADA (todos veem tudo) — isolamento não se aplica.
//  - Editar/cancelar um compromisso INTERNO: só o DONO (corretor atribuído = broker_id)
//    ou admin/supervisor/gerente-comercial.
//  - Compromisso do CALENDLY (cliente marcou sozinho; tem calendly_event_uri, sem
//    broker_id): edição/cancelamento LIVRES (não há dono interno).
//  - Conflito por LOCAL para internos; para o Calendly, conflito por HORÁRIO (ignora
//    local), pois o Calendly não sincroniza com Google/nosso sistema.

export const APPOINTMENT_PRIVILEGED_ROLES = ["admin", "supervisor", "gerente-comercial"] as const

export interface MutableAppointment {
  broker_id: string | null
  calendly_event_uri: string | null
}

/**
 * Pode este usuário editar/cancelar/completar este compromisso?
 * Calendly (sem dono interno) → livre; senão dono ou perfil privilegiado.
 */
export function canMutateAppointment(
  role: string,
  userId: string,
  appt: MutableAppointment
): boolean {
  if (appt.calendly_event_uri) return true // cliente marcou sozinho — sem dono interno
  if ((APPOINTMENT_PRIVILEGED_ROLES as readonly string[]).includes(role)) return true
  return appt.broker_id != null && appt.broker_id === userId
}

/** Dois intervalos [aStart,aEnd) e [bStart,bEnd) se sobrepõem? (ms epoch) */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Equipes da agenda (Epic 81): house = corretores/gerente/Nicole; imob = Daiana/imobiliárias. */
export type AppointmentTeam = "house" | "imob"

/**
 * Um candidato conflita com um existente? (Epic 81 / Story 81-1)
 * EQUIPES DIFERENTES NUNCA CONFLITAM — nem no mesmo local (decisão do diretor:
 * são operações independentes, HOUSE × IMOB). Dentro da MESMA equipe vale a
 * regra original: sobrepõe no tempo E (mesmo local OU o existente é do
 * Calendly — que ocupa horário independente do local).
 */
export function isConflict(
  candidate: { start: number; end: number; location: string; team: AppointmentTeam },
  existing: {
    start: number
    end: number
    location: string
    team: AppointmentTeam
    calendly_event_uri: string | null
  }
): boolean {
  if (candidate.team !== existing.team) return false
  if (!overlaps(candidate.start, candidate.end, existing.start, existing.end)) return false
  return existing.location === candidate.location || existing.calendly_event_uri != null
}
