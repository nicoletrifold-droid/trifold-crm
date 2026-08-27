export * from "./client/anthropic"
export * from "./prompts"
export * from "./rag"
export * from "./chat"
export * from "./flows"
export * from "./utils/business-hours"

/**
 * Story 90-1 — o barrel não expunha `./memory`, e o Live Coach precisa do perfil
 * do lead. Export NOMEADO (não `export *`) de propósito: só o que consumidor
 * externo usa. O resto do módulo (loadL1Snapshot, detectRoom, writer…) segue
 * interno ao pipeline, que importa pelo caminho profundo.
 *
 * Regressão que motivou isto: o import existia no helper mas o símbolo não era
 * exportado — em runtime virava `undefined` e o try/catch do coach engolia, então
 * ele rodaria PERMANENTEMENTE sem perfil do lead, em silêncio (gate FAIL do @qa,
 * MF-1). Coberto agora por `barrel-contract.test.ts`.
 */
export { loadMemoryContext, type MemoryContext } from "./memory/loader"
