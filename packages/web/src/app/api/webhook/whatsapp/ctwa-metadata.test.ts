/**
 * Story 50-3 (Epic 50) — Tests para buildCtwaMetadata.
 *
 * Cobre os 3 cenários obrigatórios de AC5:
 *  1. Lead novo com referral → metadata populado com shape de AC2
 *  2. Lead existente sem `metadata.ad_id` → atualizado
 *  3. Lead existente com `metadata.ad_id` → NÃO sobrescrito (AC3)
 *
 * Fixture: `__fixtures__/ctwa-referral.json` (payload real anonimizado).
 *
 * NOTA: localizado em `src/...` em vez do `__tests__/` proposto pela story
 * porque o `vitest.config.ts` só inclui `packages/web/src/**\/*.test.ts`.
 * Documentado nos Completion Notes da story.
 */
import { describe, it, expect } from "vitest"
import type { WhatsAppReferral } from "@trifold/shared"
import { buildCtwaMetadata } from "./ctwa-metadata"
import fixture from "./__fixtures__/ctwa-referral.json"

function getFixtureReferral(): WhatsAppReferral {
  // Type narrowing: o fixture é tipado como JSON genérico — extrair com cast.
  const referral = (
    fixture.entry[0]?.changes[0]?.value as
      | { messages?: Array<{ referral?: WhatsAppReferral }> }
      | undefined
  )?.messages?.[0]?.referral
  if (!referral) throw new Error("Fixture sem referral")
  return referral
}

describe("buildCtwaMetadata (Story 50-3)", () => {
  const baseTimestampMs = new Date("2026-06-03T12:00:00.000Z").getTime()
  const expectedExpiry = new Date(
    baseTimestampMs + 72 * 60 * 60 * 1000,
  ).toISOString()

  it("AC5.1: lead novo com referral popula metadata com shape AC2", () => {
    const referral = getFixtureReferral()

    const result = buildCtwaMetadata({
      currentMetadata: null,
      referral,
      baseTimestampMs,
    })

    expect(result).toEqual({
      ad_id: "test_ad_123",
      source_url: "https://fb.me/test_ad_url",
      ctwa_clid: "test_ctwa_clid_abcdef",
      headline: "Apartamento 2 quartos em SP",
      body: "Pronto para morar, financiamento facilitado",
      media_type: "image",
      ctwa_window_expires_at: expectedExpiry,
    })
  })

  it("AC5.1b: lead novo com metadata atual = undefined (default branch)", () => {
    const referral = getFixtureReferral()

    const result = buildCtwaMetadata({
      // currentMetadata omitido propositalmente
      referral,
      baseTimestampMs,
    })

    expect(result.ad_id).toBe("test_ad_123")
    expect(result.ctwa_window_expires_at).toBe(expectedExpiry)
  })

  it("AC5.2: lead existente sem metadata.ad_id é atualizado com novo ad_id", () => {
    const referral = getFixtureReferral()
    const currentMetadata: Record<string, unknown> = {
      // Outros campos legados — devem ser preservados via spread
      legacy_field: "preserve_me",
      // ad_id ausente
    }

    const result = buildCtwaMetadata({
      currentMetadata,
      referral,
      baseTimestampMs,
    })

    expect(result.ad_id).toBe("test_ad_123")
    expect(result.legacy_field).toBe("preserve_me")
    expect(result.headline).toBe("Apartamento 2 quartos em SP")
  })

  it("AC5.2b: ad_id presente mas string vazia é tratado como ausente", () => {
    const referral = getFixtureReferral()
    const currentMetadata = { ad_id: "" }

    const result = buildCtwaMetadata({
      currentMetadata,
      referral,
      baseTimestampMs,
    })

    expect(result.ad_id).toBe("test_ad_123")
  })

  it("AC5.3 / AC3: lead com metadata.ad_id NÃO é sobrescrito (preserva atribuição original)", () => {
    const referral = getFixtureReferral()
    const currentMetadata: Record<string, unknown> = {
      ad_id: "original_ad_456",
      campaign_id: "original_campaign",
      // outros campos previamente populados pelo Meta webhook
    }

    const result = buildCtwaMetadata({
      currentMetadata,
      referral,
      baseTimestampMs,
    })

    // ad_id original preservado
    expect(result.ad_id).toBe("original_ad_456")
    // campos previamente populados são preservados (spread current)
    expect(result.campaign_id).toBe("original_campaign")
    // contexto novo do CTWA é gravado normalmente
    expect(result.headline).toBe("Apartamento 2 quartos em SP")
    expect(result.ctwa_window_expires_at).toBe(expectedExpiry)
  })

  it("AC2 shape: todos os campos opcionais do referral viram null quando ausentes", () => {
    const minimalReferral: WhatsAppReferral = {
      // Nenhum campo preenchido — payload minimalista
    }

    const result = buildCtwaMetadata({
      currentMetadata: null,
      referral: minimalReferral,
      baseTimestampMs,
    })

    expect(result.ad_id).toBeNull()
    expect(result.source_url).toBeNull()
    expect(result.ctwa_clid).toBeNull()
    expect(result.headline).toBeNull()
    expect(result.body).toBeNull()
    expect(result.media_type).toBeNull()
    expect(result.ctwa_window_expires_at).toBe(expectedExpiry)
  })

  it("janela CTWA: ctwa_window_expires_at = baseTimestamp + 72h", () => {
    const referral: WhatsAppReferral = { source_id: "x" }
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime()

    const result = buildCtwaMetadata({
      currentMetadata: null,
      referral,
      baseTimestampMs: t0,
    })

    expect(result.ctwa_window_expires_at).toBe(
      "2026-01-04T00:00:00.000Z", // exatamente 72h depois
    )
  })

  it("idempotência: aplicar duas vezes o mesmo referral preserva ad_id após primeira gravação", () => {
    const referral = getFixtureReferral()

    // Primeira aplicação (lead novo)
    const first = buildCtwaMetadata({
      currentMetadata: null,
      referral,
      baseTimestampMs,
    })
    expect(first.ad_id).toBe("test_ad_123")

    // Segunda aplicação (re-engajamento com MESMO ad_id — comum no retry Meta)
    const second = buildCtwaMetadata({
      currentMetadata: first,
      referral,
      baseTimestampMs: baseTimestampMs + 1000, // 1s depois
    })
    expect(second.ad_id).toBe("test_ad_123")
    // janela atualiza para refletir nova base
    expect(second.ctwa_window_expires_at).toBe(
      new Date(baseTimestampMs + 1000 + 72 * 60 * 60 * 1000).toISOString(),
    )
  })
})
