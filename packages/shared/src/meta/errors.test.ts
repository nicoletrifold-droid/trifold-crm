import { describe, it, expect } from "vitest"
import { parseMetaError, MetaOAuthException, MetaRateLimitError, MetaPermissionError, MetaAPIError } from "./errors"

describe("parseMetaError", () => {
  it("classifies code 190 with type OAuthException as fatal token error", () => {
    const err = parseMetaError({ error: { message: "Invalid token", type: "OAuthException", code: 190, error_subcode: 463 } })
    expect(err).toBeInstanceOf(MetaOAuthException)
  })

  it("classifies throttle code 4 as rate limit even when Meta mislabels type as OAuthException", () => {
    const err = parseMetaError({ error: { message: "Application request limit reached", type: "OAuthException", code: 4 } })
    expect(err).toBeInstanceOf(MetaRateLimitError)
    expect(err).not.toBeInstanceOf(MetaOAuthException)
  })

  it("classifies throttle codes 17, 32 and 613 as rate limit", () => {
    for (const code of [17, 32, 613]) {
      const err = parseMetaError({ error: { message: "Throttled", type: "OAuthException", code } })
      expect(err).toBeInstanceOf(MetaRateLimitError)
    }
  })

  it("does not treat non-190 OAuthException-typed errors as fatal token errors", () => {
    const err = parseMetaError({ error: { message: "Unknown transient error", type: "OAuthException", code: 1 } })
    expect(err).not.toBeInstanceOf(MetaOAuthException)
    expect(err).toBeInstanceOf(MetaAPIError)
  })

  it("classifies codes 200-299 as permission errors", () => {
    const err = parseMetaError({ error: { message: "Permission denied", type: "PermissionError", code: 200 } })
    expect(err).toBeInstanceOf(MetaPermissionError)
  })
})
