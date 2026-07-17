// Story 75-103 / 81-3 — Governança de edição/cancelamento e conflito de horário da agenda.
//
// Regras (diretor, Epic 81):
//  - Agenda é COMPARTILHADA (todos veem tudo) — isolamento não se aplica.
//  - Editar/cancelar/completar POR EQUIPE (Story 81-3):
//      admin/supervisor → tudo (house e imob);
//      HOUSE → dono (broker_id) ou gerente-comercial;
//      IMOB  → só perfil `imob` (Daiana).
//  - Compromisso do CALENDLY (cliente marcou sozinho; tem calendly_event_uri, sem
//    broker_id): edição/cancelamento LIVRES (não há dono interno; será desligado na 81-4).
//  - Conflito por LOCAL dentro da MESMA equipe; equipes diferentes nunca conflitam
//    (Story 81-1); para o Calendly, conflito por HORÁRIO (ignora local).
//  - Nicole remarca/cancela via service role (packages/ai) SEM passar por aqui.

export const APPOINTMENT_ADMIN_ROLES = ["admin", "supervisor"] as const

export interface MutableAppointment {
  broker_id: string | null
  calendly_event_uri: string | null
  /** 'house' | 'imob' (Story 81-3); ausente/desconhecido = house (default do banco). */
  team?: string | null
}

/**
 * Pode este usuário editar/cancelar/completar este compromisso? (matriz Story 81-3)
 * Calendly (sem dono interno) → livre; admin/supervisor → tudo;
 * IMOB → só perfil `imob`; HOUSE → gerente-comercial ou dono (broker_id).
 */
export function canMutateAppointment(
  role: string,
  userId: string,
  appt: MutableAppointment
): boolean {
  if (appt.calendly_event_uri) return true // cliente marcou sozinho — sem dono interno
  if ((APPOINTMENT_ADMIN_ROLES as readonly string[]).includes(role)) return true
  if (appt.team === "imob") return role === "imob"
  // HOUSE (ou team ausente — default do banco)
  if (role === "gerente-comercial") return true
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
