import { describe, it, expect } from "vitest"
import {
  LEAD_PATCH_ALLOWED_FIELDS,
  LEAD_PATCH_FORBIDDEN_FIELDS,
} from "./patch-allowed-fields"

// Story 75-273 — o guard-rail que faltava. A 75-269 tirou `lost_reason` da
// whitelist do PATCH, mas enquanto a lista era uma `const` local dentro do
// handler, nada impedia alguém de reintroduzir o campo numa story futura e a
// suíte seguir verde. Este arquivo é o que transforma aquela decisão em REGRA.

describe("LEAD_PATCH_ALLOWED_FIELDS", () => {
  it("NÃO contém nenhum campo proibido — se falhar, leia o motivo na mensagem", () => {
    for (const [campo, motivo] of Object.entries(LEAD_PATCH_FORBIDDEN_FIELDS)) {
      expect(
        LEAD_PATCH_ALLOWED_FIELDS,
        `"${campo}" voltou para a whitelist do PATCH. ${motivo}`
      ).not.toContain(campo)
    }
  })

  it("`lost_reason` segue FORA (o caso concreto da 75-269)", () => {
    expect(LEAD_PATCH_ALLOWED_FIELDS).not.toContain("lost_reason")
    // `lost_reason_grupo` FICA: é validado contra whitelist na rota e não tem o
    // problema do texto livre. Se este assert quebrar, alguém removeu o campo
    // errado tentando consertar o outro.
    expect(LEAD_PATCH_ALLOWED_FIELDS).toContain("lost_reason_grupo")
  })

  it("não tem duplicata (campo repetido é sinal de merge malfeito)", () => {
    expect(new Set(LEAD_PATCH_ALLOWED_FIELDS).size).toBe(LEAD_PATCH_ALLOWED_FIELDS.length)
  })

  it("todo campo é snake_case, como as colunas do banco", () => {
    for (const campo of LEAD_PATCH_ALLOWED_FIELDS) {
      expect(campo, `"${campo}" não parece nome de coluna`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it("mantém os campos que a UI realmente edita (não esvaziou por acidente)", () => {
    // Amostra de cada época: cadastro base, perfil (75-112) e marketing (75-181).
    for (const campo of ["name", "phone", "stage_id", "assigned_broker_id", "interest_level", "observacao", "profissao", "tem_pet"]) {
      expect(LEAD_PATCH_ALLOWED_FIELDS).toContain(campo)
    }
    expect(LEAD_PATCH_ALLOWED_FIELDS.length).toBeGreaterThan(25)
  })

  it("cada proibido vem com motivo escrito (regra sem porquê não sobrevive)", () => {
    for (const [campo, motivo] of Object.entries(LEAD_PATCH_FORBIDDEN_FIELDS)) {
      expect(motivo.length, `"${campo}" precisa de um motivo explicando a decisão`).toBeGreaterThan(40)
      expect(motivo).toMatch(/Story \d+-\d+/)
    }
  })
})
