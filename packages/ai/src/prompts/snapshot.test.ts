/**
 * Story 87-0 (Tarefa 1 · AC1) — integridade do snapshot commitado.
 *
 * Estes testes NÃO falam com o banco (isso é o `--check` do script, que precisa de
 * credencial e roda em CI/gate). Eles garantem que o que está COMMITADO é coerente
 * consigo mesmo: arquivo × manifest × normalizador.
 *
 * Por que importa: o snapshot é o backup e o critério de rollback da story. Um arquivo
 * editado à mão — por alguém achando que edita a produção — silenciosamente corromperia
 * o backup e faria o `--check` acusar divergência que não existe no banco.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  PROMPT_SNAPSHOT_ORG_ID,
  getSnapshotDir,
  listSnapshotSlugs,
  normalizePromptContent,
  readSnapshotManifest,
  sha256,
  snapshotFileName,
} from "./snapshot"

describe("normalizePromptContent — a normalização declarada", () => {
  it("CRLF e CR viram LF", () => {
    expect(normalizePromptContent("a\r\nb\rc")).toBe("a\nb\nc")
  })

  it("aplica NFC (acento composto vira pré-composto)", () => {
    // Escritos com escape de propósito: se ficarem literais, qualquer editor
    // "arruma" o arquivo para NFC e o teste vira tautologia.
    const decomposto = "cafe\u0301" // e + U+0301 (acento combinante)
    const precomposto = "caf\u00e9" // é pré-composto
    expect(decomposto).not.toBe(precomposto)
    expect(normalizePromptContent(decomposto)).toBe(precomposto)
  })

  it("faz trim das pontas", () => {
    expect(normalizePromptContent("\n\n  texto  \n\n")).toBe("texto")
  })

  it("NÃO mexe em whitespace interno — diferença no meio é diferença de verdade", () => {
    expect(normalizePromptContent("a  b\n\n\nc")).toBe("a  b\n\n\nc")
  })

  it("é idempotente (normalizar duas vezes dá o mesmo)", () => {
    const sujo = "\r\n  Olá  \r\n mundo \r\n"
    expect(normalizePromptContent(normalizePromptContent(sujo))).toBe(normalizePromptContent(sujo))
  })
})

describe("snapshot commitado de agent_prompts", () => {
  const manifest = readSnapshotManifest()

  it("tem os 7 slugs de produção, e o manifest cobre exatamente os arquivos", () => {
    const slugsEmDisco = listSnapshotSlugs()
    const slugsNoManifest = manifest.prompts.map((p) => p.slug).sort()
    expect(slugsEmDisco).toEqual(slugsNoManifest)
    expect(slugsEmDisco).toHaveLength(7)
  })

  it("declara a org — snapshot sem org vira armadilha no multi-tenant (Epic 86)", () => {
    expect(manifest.org_id).toBe(PROMPT_SNAPSHOT_ORG_ID)
    for (const entry of manifest.prompts) expect(entry.org_id).toBe(PROMPT_SNAPSHOT_ORG_ID)
  })

  it("declara a normalização aplicada", () => {
    expect(manifest.normalization).toEqual({ crlf_to_lf: true, unicode: "NFC", trim: true })
  })

  it("sha256 e char_count do manifest batem com os bytes de cada arquivo (`shasum -a 256`)", () => {
    for (const entry of manifest.prompts) {
      const bytes = readFileSync(path.join(getSnapshotDir(), snapshotFileName(entry.slug)), "utf8")
      expect(sha256(bytes), `${entry.slug}: arquivo editado à mão?`).toBe(entry.sha256)
      expect(bytes.length, `${entry.slug}: char_count`).toBe(entry.char_count)
      // Já normalizado: reaplicar o normalizador não pode mudar nada.
      expect(normalizePromptContent(bytes), `${entry.slug}: não normalizado`).toBe(bytes)
    }
  })

  it("os 7 slugs estão ATIVOS — linha inativa é achado, não o esperado (AC3)", () => {
    const inativos = manifest.prompts.filter((p) => !p.is_active).map((p) => p.slug)
    expect(inativos).toEqual([])
  })

  it("nenhum slug está vazio — conteúdo vazio faz o runtime cair no fallback sem avisar", () => {
    for (const entry of manifest.prompts) {
      expect(entry.char_count, `${entry.slug} vazio`).toBeGreaterThan(0)
    }
  })
})
