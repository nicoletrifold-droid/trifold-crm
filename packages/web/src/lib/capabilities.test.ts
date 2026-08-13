// Story 75-300 — invariantes do registro de capabilities + tabela-verdade da resolução.
import { describe, expect, it } from "vitest"

import {
  CAPABILITIES,
  CAPABILITY_SEED,
  ENFORCED_CAPABILITIES,
  KNOWN_ROLES,
  VIRTUAL_GROUPS,
  VIRTUAL_GROUP_LABELS,
  adminMatrixKeys,
  capabilityCellState,
  capabilityGroup,
  enforcedCapabilitiesByGroup,
  resolveCapabilityDecision,
  roleEligibleForCapability,
} from "./capabilities"
import { ALL_MODULES, SUBMODULE_MAP } from "./permissions-modules"

describe("registro de capabilities — invariantes (AC1)", () => {
  it("chaves são únicas", () => {
    const keys = CAPABILITIES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("toda chave tem exatamente 1 ponto (garante a herança de 1 nível do SQL)", () => {
    for (const { key } of CAPABILITIES) {
      expect(key.split(".").length, key).toBe(2)
      expect(key).toMatch(/^[a-z-]+\.[a-z_]+$/)
    }
  })

  it("todo prefixo é módulo real (ALL_MODULES) ou grupo virtual declarado", () => {
    const valid = new Set<string>([...ALL_MODULES, ...VIRTUAL_GROUPS])
    for (const { key } of CAPABILITIES) {
      expect(valid.has(capabilityGroup(key)), key).toBe(true)
    }
  })

  it("nenhum grupo virtual colide com módulo da sidebar", () => {
    for (const g of VIRTUAL_GROUPS) {
      expect(ALL_MODULES.includes(g), g).toBe(false)
    }
  })

  it("nenhuma chave de AÇÃO colide com sub-módulo (TELA) do SUBMODULE_MAP", () => {
    const telas = new Set(
      Object.values(SUBMODULE_MAP).flatMap((subs) => Object.keys(subs))
    )
    for (const { key } of CAPABILITIES) {
      expect(telas.has(key), key).toBe(false)
    }
  })

  it("todo role citado no seed é role conhecido", () => {
    const known = new Set<string>(KNOWN_ROLES)
    for (const { key, seed } of CAPABILITIES) {
      for (const role of seed) {
        expect(known.has(role), `${key} → ${role}`).toBe(true)
      }
      // seed sem duplicata
      expect(new Set(seed).size, key).toBe(seed.length)
    }
  })

  it("labels e descrições não-vazios", () => {
    for (const { key, label, description } of CAPABILITIES) {
      expect(label.trim().length, key).toBeGreaterThan(0)
      expect(description.trim().length, key).toBeGreaterThan(0)
    }
  })

  it("CAPABILITY_SEED cobre exatamente as chaves do registro", () => {
    expect(Object.keys(CAPABILITY_SEED).sort()).toEqual(
      CAPABILITIES.map((c) => c.key).sort()
    )
  })
})

describe("resolveCapabilityDecision — tabela-verdade da paridade app ↔ SQL (AC5)", () => {
  it("1. exceção exata NEGANDO vence tudo — inclusive admin com tudo liberado", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: true,
        exactException: false,
        exactRoleRow: true,
        parentException: true,
        parentRoleRow: true,
      })
    ).toBe(false)
  })

  it("2. exceção exata CONCEDENDO vence tudo — mesmo com o resto negado", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        exactException: true,
        exactRoleRow: false,
        parentException: false,
        parentRoleRow: false,
      })
    ).toBe(true)
  })

  it("3. admin sem exceções = true (fullMatrix)", () => {
    expect(resolveCapabilityDecision({ isAdmin: true })).toBe(true)
  })

  it("4. admin com exceção do PAI negada = false (exceção mesclada por cima do fullMatrix)", () => {
    expect(
      resolveCapabilityDecision({ isAdmin: true, parentException: false })
    ).toBe(false)
  })

  it("5. admin IGNORA linha do role (fullMatrix descarta) — linha exata false não nega admin", () => {
    expect(
      resolveCapabilityDecision({ isAdmin: true, exactRoleRow: false })
    ).toBe(true)
  })

  it("6. linha exata do perfil vence herança do pai (true sobre pai negado)", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        exactRoleRow: true,
        parentException: false,
        parentRoleRow: false,
      })
    ).toBe(true)
  })

  it("7. linha exata do perfil NEGANDO vence pai liberado — o caso 'módulo ON, ação OFF'", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        exactRoleRow: false,
        parentException: true,
        parentRoleRow: true,
      })
    ).toBe(false)
  })

  it("8. sem linha exata: exceção do pai vence linha do pai", () => {
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        parentException: true,
        parentRoleRow: false,
      })
    ).toBe(true)
    expect(
      resolveCapabilityDecision({
        isAdmin: false,
        parentException: false,
        parentRoleRow: true,
      })
    ).toBe(false)
  })

  it("9. só o módulo pai decide quando não há nada mais específico (herança)", () => {
    expect(
      resolveCapabilityDecision({ isAdmin: false, parentRoleRow: true })
    ).toBe(true)
    expect(
      resolveCapabilityDecision({ isAdmin: false, parentRoleRow: false })
    ).toBe(false)
  })

  it("10. nada em lugar nenhum = default-deny (vale p/ grupos virtuais sem módulo)", () => {
    expect(resolveCapabilityDecision({ isAdmin: false })).toBe(false)
  })
})

describe("enforced — regra anti-'botão que mente' (75-301, AC1)", () => {
  it("enforced = exatamente os módulos já migrados (75-301..305)", () => {
    // ordem = ordem do registro (agrupado por módulo)
    expect(ENFORCED_CAPABILITIES.map((c) => c.key).sort()).toEqual(
      [
        "analytics.executivo",
        "analytics.geral",
        "atividades.ver",
        "campanhas.disparar",
        "campanhas.gerenciar",
        "campanhas.meta_acionar",
        "campanhas.meta_sincronizar",
        "campanhas.meta_ver",
        "agenda.gerenciar_house",
        "agenda.gerenciar_imob",
        "agenda.escolher_equipe",
        "agenda.feedback_visita",
        "conversas.enviar",
        "conversas.enviar_qualquer",
        "conversas.abrir_template",
        "conversas.transferir",
        "chat.responder",
        "chat.gerenciar_participantes",
        "chamados.responder",
        "chamados.ver_todos",
        "obras.ver",
        "obras.criar",
        "obras.editar",
        "obras.apagar",
        "obras.reativar",
        "obras.fases_gerenciar",
        "obras.fotos_enviar",
        "obras.fotos_apagar",
        "obras.documentos_gerenciar",
        "obras.documentos_assinar",
        "obras.aprovar_uploads",
        "obras.mensagens_enviar",
        "obras.clientes_vincular",
        "obras.distrato",
        "obras.sienge_gerenciar",
        "obras.vincular_imovel",
        "obras.receber_email_aprovacao",
        "sistema.manutencao",
        "clientes.gerenciar",
        "clientes.apagar",
        "clientes.resetar_senha",
        "clientes.sienge_vincular",
        "portal.ver_como_cliente",
        "portal.financeiro_ver",
        "imoveis.criar",
        "imoveis.editar",
        "imoveis.apagar",
        "imoveis.vender_unidade",
        "imoveis.tipologias_editar",
        "imoveis.resetar_status_unidade",
        "imoveis.ativar_nicole",
        "marketing.gerenciar",
        "pastas.gerenciar",
      ].sort()
    )
  })

  it("todo grupo VIRTUAL com capability enforced tem label de exibição", () => {
    for (const cap of ENFORCED_CAPABILITIES) {
      const group = capabilityGroup(cap.key)
      if ((VIRTUAL_GROUPS as readonly string[]).includes(group)) {
        const label =
          VIRTUAL_GROUP_LABELS[group as keyof typeof VIRTUAL_GROUP_LABELS]
        expect(label?.trim().length, cap.key).toBeGreaterThan(0)
      }
    }
  })

  it("todo grupo virtual declarado tem label (à prova de F3)", () => {
    for (const g of VIRTUAL_GROUPS) {
      expect(VIRTUAL_GROUP_LABELS[g]?.trim().length, g).toBeGreaterThan(0)
    }
  })

  it("enforcedCapabilitiesByGroup agrupa pelo prefixo", () => {
    const byGroup = enforcedCapabilitiesByGroup()
    expect(Object.keys(byGroup).sort()).toEqual(["agenda", "analytics", "atividades", "campanhas", "chamados", "chat", "clientes", "conversas", "imoveis", "marketing", "obras", "pastas", "portal", "sistema"])
    expect(byGroup["marketing"]?.map((c) => c.key)).toEqual(["marketing.gerenciar"])
    expect(byGroup["pastas"]?.map((c) => c.key)).toEqual(["pastas.gerenciar"])
    expect(byGroup["campanhas"]?.length).toBe(5)
  })
})

describe("capabilityCellState — exibição espelha a resolução real (75-301, risco 2/4)", () => {
  it("admin: sempre ON e TRAVADO (fullMatrix ignora a linha do role)", () => {
    expect(
      capabilityCellState({ isAdminRole: true, explicit: false, parentGranted: false })
    ).toEqual({ checked: true, locked: true })
  })

  it("não-admin: linha explícita manda; sem linha, herda o pai; virtual herda false", () => {
    expect(
      capabilityCellState({ isAdminRole: false, explicit: false, parentGranted: true })
    ).toEqual({ checked: false, locked: false })
    expect(
      capabilityCellState({ isAdminRole: false, parentGranted: true })
    ).toEqual({ checked: true, locked: false })
    expect(
      capabilityCellState({ isAdminRole: false, parentGranted: false })
    ).toEqual({ checked: false, locked: false })
  })

  it("CONSISTÊNCIA: para todo caso sem exceção de usuário, exibição === resolução da F1", () => {
    for (const isAdminRole of [true, false]) {
      for (const explicit of [true, false, undefined]) {
        for (const parentGranted of [true, false]) {
          const shown = capabilityCellState({ isAdminRole, explicit, parentGranted })
          const resolved = resolveCapabilityDecision({
            isAdmin: isAdminRole,
            exactRoleRow: explicit,
            parentRoleRow: parentGranted,
          })
          expect(shown.checked, JSON.stringify({ isAdminRole, explicit, parentGranted })).toBe(resolved)
        }
      }
    }
  })
})

describe("adminMatrixKeys — fix do T6 da 75-301 (admin × grupo virtual)", () => {
  it("cobre todos os módulos E todos os grupos virtuais", () => {
    const keys = adminMatrixKeys(ALL_MODULES)
    for (const m of ALL_MODULES) expect(keys, m).toContain(m)
    for (const g of VIRTUAL_GROUPS) expect(keys, g).toContain(g)
  })
})

describe("75-302 — Pastas via capability (espelho + elegibilidade)", () => {
  it("seed de pastas.gerenciar espelha a antiga PASTA_MANAGER_ROLES; demais fora", () => {
    const seed = [...CAPABILITY_SEED["pastas.gerenciar"]]
    expect(seed.sort()).toEqual(["admin", "gerente-comercial", "imob", "supervisor"])
    for (const role of ["broker", "sdr", "obras", "gerente-relacionamento", "consultoria", "social-media"]) {
      expect((seed as string[]).includes(role), role).toBe(false)
    }
  })

  it("roleEligibleForCapability — o caso Silmara: role customizado SEM linha explícita herda o MÓDULO ligado", () => {
    expect(
      roleEligibleForCapability({ roleName: "auxadministrativo", moduleRow: true })
    ).toBe(true)
  })

  it("roleEligibleForCapability — linha explícita FALSE bloqueia mesmo com módulo ligado", () => {
    expect(
      roleEligibleForCapability({ roleName: "broker", explicitRow: false, moduleRow: true })
    ).toBe(false)
  })

  it("roleEligibleForCapability — admin sempre elegível; nada em lugar nenhum nega", () => {
    expect(roleEligibleForCapability({ roleName: "admin" })).toBe(true)
    expect(roleEligibleForCapability({ roleName: "corretor-novo" })).toBe(false)
  })
})

describe("75-303 — Campanhas & Meta Ads (espelho dos 5 seeds)", () => {
  it("gerenciar e disparar = admin+supervisor (as antigas requireRole)", () => {
    expect([...CAPABILITY_SEED["campanhas.gerenciar"]].sort()).toEqual(["admin", "supervisor"])
    expect([...CAPABILITY_SEED["campanhas.disparar"]].sort()).toEqual(["admin", "supervisor"])
  })
  it("meta_sincronizar/meta_acionar/meta_ver = só admin (requireRole(['admin']) / inline / proxy sistema)", () => {
    expect([...CAPABILITY_SEED["campanhas.meta_sincronizar"]]).toEqual(["admin"])
    expect([...CAPABILITY_SEED["campanhas.meta_acionar"]]).toEqual(["admin"])
    expect([...CAPABILITY_SEED["campanhas.meta_ver"]]).toEqual(["admin"])
  })
})

describe("75-304 — Chamados (espelho dos 2 seeds)", () => {
  it("ver_todos e responder = admin+supervisor (as antigas checagens inline)", () => {
    expect([...CAPABILITY_SEED["chamados.ver_todos"]].sort()).toEqual(["admin", "supervisor"])
    expect([...CAPABILITY_SEED["chamados.responder"]].sort()).toEqual(["admin", "supervisor"])
  })
})

describe("75-305 — Analytics & Atividades (espelho dos 3 seeds)", () => {
  it("analytics.geral = admin+supervisor; executivo = +gerente-comercial+sdr; atividades = A/S/GC", () => {
    expect([...CAPABILITY_SEED["analytics.geral"]].sort()).toEqual(["admin", "supervisor"])
    expect([...CAPABILITY_SEED["analytics.executivo"]].sort()).toEqual(["admin", "gerente-comercial", "sdr", "supervisor"])
    expect([...CAPABILITY_SEED["atividades.ver"]].sort()).toEqual(["admin", "gerente-comercial", "supervisor"])
  })
  it("dashboard.ver_equipe segue NÃO-enforced (UX por role — bypass de admin tornaria admin elegível)", () => {
    expect(ENFORCED_CAPABILITIES.some((c) => c.key === "dashboard.ver_equipe")).toBe(false)
  })
})

describe("75-306 — Imóveis (espelho dos 7 seeds)", () => {
  it("editar = as ex-IMOVEIS_EDIT_ROLES; criar/apagar/vender/nicole/tipologias = A+S; resetar status = admin", () => {
    expect([...CAPABILITY_SEED["imoveis.editar"]].sort()).toEqual(["admin", "gerente-relacionamento", "obras", "supervisor"])
    for (const key of ["imoveis.criar", "imoveis.apagar", "imoveis.vender_unidade", "imoveis.ativar_nicole", "imoveis.tipologias_editar"] as const) {
      expect([...CAPABILITY_SEED[key]].sort(), key).toEqual(["admin", "supervisor"])
    }
    expect([...CAPABILITY_SEED["imoveis.resetar_status_unidade"]]).toEqual(["admin"])
  })
})

describe("75-307 — Agenda (espelho dos 4 seeds)", () => {
  it("gerenciar_house = A/S/GC/SDR; gerenciar_imob = A/S/IMB; escolher_equipe = A/S; feedback = A/S/GC/SDR", () => {
    expect([...CAPABILITY_SEED["agenda.gerenciar_house"]].sort()).toEqual(["admin", "gerente-comercial", "sdr", "supervisor"])
    expect([...CAPABILITY_SEED["agenda.gerenciar_imob"]].sort()).toEqual(["admin", "imob", "supervisor"])
    expect([...CAPABILITY_SEED["agenda.escolher_equipe"]].sort()).toEqual(["admin", "supervisor"])
    expect([...CAPABILITY_SEED["agenda.feedback_visita"]].sort()).toEqual(["admin", "gerente-comercial", "sdr", "supervisor"])
  })
})

describe("75-308 — Obras (espelho dos seeds-chave)", () => {
  it("ver/criar/editar/fases/fotos_enviar/docs/mensagens+broker/clientes = as ex-ALLOWED_ROLES", () => {
    for (const key of ["obras.ver", "obras.criar", "obras.editar", "obras.fases_gerenciar", "obras.fotos_enviar", "obras.documentos_gerenciar", "obras.documentos_assinar", "obras.clientes_vincular"] as const) {
      expect([...CAPABILITY_SEED[key]].sort(), key).toEqual(["admin", "gerente-relacionamento", "obras", "supervisor"])
    }
    expect([...CAPABILITY_SEED["obras.mensagens_enviar"]].sort()).toEqual(["admin", "broker", "gerente-relacionamento", "obras", "supervisor"])
  })
  it("aprovar/fotos_apagar/sienge/vincular_imovel/email = A+S; apagar/reativar/distrato/manutencao = admin", () => {
    for (const key of ["obras.aprovar_uploads", "obras.fotos_apagar", "obras.sienge_gerenciar", "obras.vincular_imovel", "obras.receber_email_aprovacao"] as const) {
      expect([...CAPABILITY_SEED[key]].sort(), key).toEqual(["admin", "supervisor"])
    }
    for (const key of ["obras.apagar", "obras.reativar", "obras.distrato", "sistema.manutencao"] as const) {
      expect([...CAPABILITY_SEED[key]], key).toEqual(["admin"])
    }
  })
  it("solicitar_exclusao segue NÃO-enforced (FLUXO de quem envia — seed sem admin, regra da 75-305)", () => {
    expect(ENFORCED_CAPABILITIES.some((c) => c.key === "obras.solicitar_exclusao")).toBe(false)
  })
})

describe("75-309 — Clientes & Portal (espelho dos 6 seeds)", () => {
  it("gerenciar/apagar/resetar_senha = ex-ALLOWED_ROLES; sienge_vincular/portal = A+S", () => {
    for (const key of ["clientes.gerenciar", "clientes.apagar", "clientes.resetar_senha"] as const) {
      expect([...CAPABILITY_SEED[key]].sort(), key).toEqual(["admin", "gerente-relacionamento", "obras", "supervisor"])
    }
    for (const key of ["clientes.sienge_vincular", "portal.ver_como_cliente", "portal.financeiro_ver"] as const) {
      expect([...CAPABILITY_SEED[key]].sort(), key).toEqual(["admin", "supervisor"])
    }
  })
})

describe("75-310 — Conversas & Chat (espelhos + constantes de UI congeladas ao seed)", () => {
  it("enviar = COR+A/S/GC/SDR; enviar_qualquer/abrir_template = A/S/GC/SDR/GR; transferir = A/S", () => {
    expect([...CAPABILITY_SEED["conversas.enviar"]].sort()).toEqual(["admin", "broker", "gerente-comercial", "sdr", "supervisor"])
    expect([...CAPABILITY_SEED["conversas.enviar_qualquer"]].sort()).toEqual(["admin", "gerente-comercial", "gerente-relacionamento", "sdr", "supervisor"])
    expect([...CAPABILITY_SEED["conversas.abrir_template"]].sort()).toEqual(["admin", "gerente-comercial", "gerente-relacionamento", "sdr", "supervisor"])
    expect([...CAPABILITY_SEED["conversas.transferir"]].sort()).toEqual(["admin", "supervisor"])
  })
  it("chat.responder e gerenciar_participantes = A/S/GR/GC", () => {
    expect([...CAPABILITY_SEED["chat.responder"]].sort()).toEqual(["admin", "gerente-comercial", "gerente-relacionamento", "supervisor"])
    expect([...CAPABILITY_SEED["chat.gerenciar_participantes"]].sort()).toEqual(["admin", "gerente-comercial", "gerente-relacionamento", "supervisor"])
  })
  it("🔒 OPENING_PRIVILEGED_ROLES (dica de UI client-side) CONGELADA ao seed de abrir_template", async () => {
    const { OPENING_PRIVILEGED_ROLES } = await import("./whatsapp/opening-roles")
    expect([...OPENING_PRIVILEGED_ROLES].sort()).toEqual([...CAPABILITY_SEED["conversas.abrir_template"]].sort())
  })
  it("conversas.ver_qualquer segue NÃO-enforced (gate é RLS — F4)", () => {
    expect(ENFORCED_CAPABILITIES.some((c) => c.key === "conversas.ver_qualquer")).toBe(false)
  })
})
