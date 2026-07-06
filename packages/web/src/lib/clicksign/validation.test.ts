import { describe, it, expect } from "vitest"
import { validateSignerForm } from "./validation"

const base = { name: "Marcos Martinelli", email: "marcos@trifold.eng.br", phone: "44999761478", auth: "email" }

describe("validateSignerForm", () => {
  it("aceita formulário válido (auth e-mail)", () => {
    expect(validateSignerForm(base)).toBeNull()
  })

  it("rejeita nome com uma palavra só", () => {
    expect(validateSignerForm({ ...base, name: "Marcos" })).toBe("Informe o nome completo (nome e sobrenome).")
    expect(validateSignerForm({ ...base, name: "  Marcos  " })).toBe("Informe o nome completo (nome e sobrenome).")
  })

  it("rejeita e-mail inválido (vírgula, sem @/domínio)", () => {
    expect(validateSignerForm({ ...base, email: "marcos@trifold.eng,br" })).toBe("E-mail inválido.")
    expect(validateSignerForm({ ...base, email: "semarroba.com" })).toBe("E-mail inválido.")
  })

  it("exige e-mail quando auth = email", () => {
    expect(validateSignerForm({ ...base, email: "", phone: "44999761478" })).toBe("Informe o e-mail (autenticação por e-mail).")
  })

  it("exige telefone com DDD quando auth = whatsapp/sms", () => {
    expect(validateSignerForm({ ...base, auth: "whatsapp", email: "", phone: "" })).toBe("Informe um telefone válido com DDD.")
    expect(validateSignerForm({ ...base, auth: "sms", email: "", phone: "1234" })).toBe("Informe um telefone válido com DDD.")
    expect(validateSignerForm({ ...base, auth: "whatsapp", phone: "(44) 99976-1478" })).toBeNull()
  })

  it("exige pelo menos um contato", () => {
    // auth desconhecido, sem e-mail e sem telefone
    expect(validateSignerForm({ name: "Ana Souza", email: "", phone: "", auth: "outro" })).toBe(
      "Informe e-mail ou telefone do signatário."
    )
  })
})
