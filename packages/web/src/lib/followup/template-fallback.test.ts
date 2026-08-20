/**
 * Story 75-353 — testes da decisão de mandar template fora da janela de 24h.
 *
 * Esta é a função que separa "o follow-up finalmente entrega" de "a empresa
 * manda spam e perde a nota de qualidade da WABA". Os cenários obrigatórios são
 * os freios, não o caminho felizic:
 *
 *  1. sem template na regra        → nada sai (comportamento anterior, intocado)
 *  2. lead em opt-out              → nada sai, mesmo com template configurado
 *  3. cap de frequência            → nada sai antes de N dias, e diz quantos faltam
 *  4. template não aprovado/desconhecido → nada sai (não queima envio pago)
 *  5. caminho válido               → sai, com os parâmetros na ORDEM do template
 */
import { describe, it, expect } from "vitest"

import {
  decidirTemplateDoFollowUp,
  ehPedidoDeOptOut,
  podeFollowUpSemConversa,
} from "./template-fallback"

const AGORA = new Date("2026-08-20T12:00:00.000Z")
const APROVADOS = new Set(["abertura_basica", "abertura_atendimento_corretor"])
const CTX = { nomeLead: "Marcos", corretor: "Thielly", empreendimento: "Reserva Ipê" }

const base = {
  hsmTemplate: "abertura_basica",
  hsmMinDays: 7,
  marketingOptOutAt: null,
  ultimoTemplateEm: null,
  templatesAprovados: APROVADOS,
  contexto: CTX,
  now: AGORA,
}

describe("decidirTemplateDoFollowUp", () => {
  it("cenário 1: regra sem template → não envia (é o comportamento de hoje, e ele não muda)", () => {
    const d = decidirTemplateDoFollowUp({ ...base, hsmTemplate: null })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("REGRA_SEM_TEMPLATE")
  })

  it("cenário 2: lead em opt-out → não envia NEM com template configurado e aprovado", () => {
    const d = decidirTemplateDoFollowUp({
      ...base,
      marketingOptOutAt: "2026-08-01T10:00:00.000Z",
    })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("LEAD_EM_OPT_OUT")
  })

  it("cenário 2b: opt-out vence até o cap — o motivo reportado é o opt-out, não o cap", () => {
    const d = decidirTemplateDoFollowUp({
      ...base,
      marketingOptOutAt: "2026-08-01T10:00:00.000Z",
      ultimoTemplateEm: "2026-08-19T12:00:00.000Z",
    })
    expect(d.motivo).toBe("LEAD_EM_OPT_OUT")
  })

  it("cenário 3: dentro do cap de 7 dias → não envia e informa os dias restantes", () => {
    // Último template há 2 dias → faltam 5.
    const d = decidirTemplateDoFollowUp({
      ...base,
      ultimoTemplateEm: "2026-08-18T12:00:00.000Z",
    })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("CAP_DE_FREQUENCIA")
    expect(d.diasRestantes).toBe(5)
  })

  it("cenário 3b: exatamente no limite (7 dias) → LIBERA", () => {
    const d = decidirTemplateDoFollowUp({
      ...base,
      ultimoTemplateEm: "2026-08-13T12:00:00.000Z",
    })
    expect(d.enviar).toBe(true)
  })

  it("cenário 3c: hsmMinDays = 0 desliga o cap (configuração explícita de quem opera a tela)", () => {
    const d = decidirTemplateDoFollowUp({
      ...base,
      hsmMinDays: 0,
      ultimoTemplateEm: "2026-08-20T11:00:00.000Z",
    })
    expect(d.enviar).toBe(true)
  })

  it("cenário 4: template que o código não sabe preencher → não envia", () => {
    const d = decidirTemplateDoFollowUp({ ...base, hsmTemplate: "promo_inventada" })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("TEMPLATE_DESCONHECIDO")
  })

  it("cenário 4b: template conhecido mas NÃO aprovado na Meta nesta run → não envia", () => {
    const d = decidirTemplateDoFollowUp({
      ...base,
      hsmTemplate: "abertura_interesse_status",
      templatesAprovados: new Set(["abertura_basica"]),
    })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("TEMPLATE_NAO_APROVADO")
  })

  it("cenário 4c: listagem da Meta vazia (falhou na run) → nenhum template sai", () => {
    const d = decidirTemplateDoFollowUp({ ...base, templatesAprovados: new Set() })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("TEMPLATE_NAO_APROVADO")
  })

  it("🔥 cenário 4d: nome vazio → NÃO envia (evita o 'Oi !' pago) e diz qual variável faltou", () => {
    // Medido antes do primeiro envio: 6 leads da etapa Atendimento sem nome.
    const d = decidirTemplateDoFollowUp({ ...base, contexto: { ...CTX, nomeLead: "" } })
    expect(d.enviar).toBe(false)
    expect(d.motivo).toBe("VARIAVEL_VAZIA")
    expect(d.variavelVazia).toBe(1)
  })

  it("cenário 4e: nome só com espaços conta como vazio", () => {
    const d = decidirTemplateDoFollowUp({ ...base, contexto: { ...CTX, nomeLead: "   " } })
    expect(d.motivo).toBe("VARIAVEL_VAZIA")
  })

  it("cenário 4f: variável vazia numa posição posterior também barra (template de 3 vars)", () => {
    const d = decidirTemplateDoFollowUp({
      ...base,
      hsmTemplate: "abertura_atendimento_corretor",
      contexto: { ...CTX, empreendimento: "" },
    })
    expect(d.motivo).toBe("VARIAVEL_VAZIA")
    expect(d.variavelVazia).toBe(3)
  })

  it("cenário 5: caminho válido → envia com os parâmetros do template", () => {
    const d = decidirTemplateDoFollowUp(base)
    expect(d.enviar).toBe(true)
    expect(d.template).toBe("abertura_basica")
    // `abertura_basica` tem uma variável só: o nome do lead.
    expect(d.params).toEqual(["Marcos"])
  })

  it("cenário 5b: template de 3 variáveis respeita a ORDEM (nome, corretor, empreendimento)", () => {
    const d = decidirTemplateDoFollowUp({ ...base, hsmTemplate: "abertura_atendimento_corretor" })
    expect(d.enviar).toBe(true)
    expect(d.params).toEqual(["Marcos", "Thielly", "Reserva Ipê"])
  })
})

describe("ehPedidoDeOptOut", () => {
  it("reconhece o botão nativo da Meta e as variações escritas", () => {
    for (const texto of [
      "Parar promoções",
      "parar promocoes",
      "PARAR PROMOÇÕES",
      "Stop promotions",
      "não quero mais receber",
      "descadastrar",
      "sair da lista",
      "Me remova da lista, por favor",
      "por favor cancelar inscrição",
    ]) {
      expect(ehPedidoDeOptOut(texto), texto).toBe(true)
    }
  })

  it("🔥 NÃO confunde conversa normal com opt-out — calar um lead que quer falar é pior que o spam", () => {
    for (const texto of [
      "pode parar de chover que eu vou visitar",
      "quero receber mais informações",
      "não quero mais receber ligação, prefiro whatsapp",
      "vou sair da lista de espera do apartamento 302",
      "parar",
      "",
      null,
      undefined,
    ]) {
      expect(ehPedidoDeOptOut(texto as string | null), String(texto)).toBe(false)
    }
  })
})

describe("podeFollowUpSemConversa (Story 75-355)", () => {
  it("com conversa → segue, independentemente de template", () => {
    expect(podeFollowUpSemConversa({ temConversa: true, hsmTemplate: null, atingiuTakeover: false })).toBe(true)
  })

  it("🔥 SEM conversa + template + passou do takeover → segue (os 37 leads que o cron descartava)", () => {
    expect(
      podeFollowUpSemConversa({ temConversa: false, hsmTemplate: "abertura_basica", atingiuTakeover: true })
    ).toBe(true)
  })

  it("sem conversa e sem template → NÃO segue (comportamento anterior preservado)", () => {
    expect(podeFollowUpSemConversa({ temConversa: false, hsmTemplate: null, atingiuTakeover: true })).toBe(false)
  })

  it("sem conversa, com template, mas ainda no prazo do takeover → NÃO segue", () => {
    // Impede que o lead sem conversa caia no ramo de alert_broker: seriam 37
    // notificações ao corretor de uma vez, consertando uma coisa e estragando outra.
    expect(
      podeFollowUpSemConversa({ temConversa: false, hsmTemplate: "abertura_basica", atingiuTakeover: false })
    ).toBe(false)
  })
})
