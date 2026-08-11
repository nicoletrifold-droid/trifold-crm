/**
 * Story 75-290 — núcleo da leitura do feedback de visita.
 * Cobre as duas armadilhas do épico: autor vem da activity (não da tabela) e
 * `visited_at` nulo não pode subir ao topo da lista.
 */
import { describe, it, expect } from "vitest"
import {
  authorIdByFeedback,
  buildVisitFeedbackList,
  feedbackIdFromActivity,
  type VisitFeedbackRecord,
} from "./visit-feedback-read"

function fb(over: Partial<VisitFeedbackRecord> & { id: string }): VisitFeedbackRecord {
  return {
    visited_at: "2026-08-07T15:00:00Z",
    created_at: "2026-08-07T15:28:00Z",
    feedback: "Visitou o decorado",
    interest_after: "cold",
    next_steps: null,
    ...over,
  }
}

describe("feedbackIdFromActivity", () => {
  it("extrai feedback_id do metadata jsonb", () => {
    expect(feedbackIdFromActivity({ user_id: "u1", metadata: { feedback_id: "F1" } })).toBe("F1")
  })

  it("metadata inválido (nulo, array, string, sem a chave) → null", () => {
    for (const metadata of [null, undefined, [], "F1", {}, { feedback_id: 42 }, { feedback_id: "" }]) {
      expect(feedbackIdFromActivity({ user_id: "u1", metadata })).toBeNull()
    }
  })
})

describe("authorIdByFeedback", () => {
  it("casa autor por feedback_id", () => {
    const map = authorIdByFeedback([
      { user_id: "odair", metadata: { feedback_id: "F1" } },
      { user_id: "daiana", metadata: { feedback_id: "F2" } },
    ])
    expect(map.get("F1")).toBe("odair")
    expect(map.get("F2")).toBe("daiana")
  })

  it("activity SEM user_id não registra autor (nem apaga o autor já achado)", () => {
    // A activity followup_post_visit da Nicole carrega o MESMO feedback_id e
    // user_id nulo — não pode roubar o crédito do corretor.
    const map = authorIdByFeedback([
      { user_id: null, metadata: { feedback_id: "F1" } },
      { user_id: "odair", metadata: { feedback_id: "F1" } },
    ])
    expect(map.get("F1")).toBe("odair")
  })
})

describe("buildVisitFeedbackList", () => {
  it("resolve o nome do autor", () => {
    const [entry] = buildVisitFeedbackList(
      [fb({ id: "F1" })],
      [{ user_id: "u-odair", metadata: { feedback_id: "F1" } }],
      { "u-odair": "Odair Ferreira dos Santos" }
    )
    expect(entry!.author).toBe("Odair Ferreira dos Santos")
  })

  it("feedback antigo sem activity casada → author null (tela mostra Sistema)", () => {
    const [entry] = buildVisitFeedbackList([fb({ id: "F1" })], [], {})
    expect(entry!.author).toBeNull()
  })

  it("autor com nome vazio ou id desconhecido → author null, sem quebrar", () => {
    const [vazio] = buildVisitFeedbackList(
      [fb({ id: "F1" })],
      [{ user_id: "u1", metadata: { feedback_id: "F1" } }],
      { u1: "   " }
    )
    expect(vazio!.author).toBeNull()

    const [ausente] = buildVisitFeedbackList(
      [fb({ id: "F1" })],
      [{ user_id: "fantasma", metadata: { feedback_id: "F1" } }],
      {}
    )
    expect(ausente!.author).toBeNull()
  })

  it("ordena da visita mais recente para a mais antiga", () => {
    const list = buildVisitFeedbackList(
      [
        fb({ id: "antiga", visited_at: "2026-07-01T14:00:00Z" }),
        fb({ id: "recente", visited_at: "2026-08-07T15:00:00Z" }),
        fb({ id: "meio", visited_at: "2026-07-20T10:00:00Z" }),
      ],
      [],
      {}
    )
    expect(list.map((e) => e.id)).toEqual(["recente", "meio", "antiga"])
  })

  it("visited_at NULO cai para created_at — e nunca vai para o topo se não tiver data nenhuma", () => {
    const list = buildVisitFeedbackList(
      [
        fb({ id: "sem-data", visited_at: null, created_at: null }),
        fb({ id: "so-created", visited_at: null, created_at: "2026-08-09T12:00:00Z" }),
        fb({ id: "com-visita", visited_at: "2026-08-08T12:00:00Z" }),
      ],
      [],
      {}
    )
    expect(list.map((e) => e.id)).toEqual(["so-created", "com-visita", "sem-data"])
    expect(list.find((e) => e.id === "so-created")!.visited_at).toBe("2026-08-09T12:00:00Z")
  })

  it("preserva relato e próximos passos como vieram do formulário", () => {
    const [entry] = buildVisitFeedbackList(
      [fb({ id: "F1", feedback: "linha 1\nlinha 2", next_steps: "Represamento\nObs: ligar" })],
      [],
      {}
    )
    expect(entry!.feedback).toBe("linha 1\nlinha 2")
    expect(entry!.next_steps).toBe("Represamento\nObs: ligar")
  })

  it("feedback com texto nulo não quebra a tela", () => {
    const [entry] = buildVisitFeedbackList([fb({ id: "F1", feedback: null })], [], {})
    expect(entry!.feedback).toBe("")
  })
})
