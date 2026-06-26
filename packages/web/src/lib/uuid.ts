// Story 75-67 — validação de UUID para guarda defensiva de rotas [id]/[obra_id].
// Usado para redirecionar links malformados (ex.: botão de template WhatsApp com "{{1}}"
// literal) para a lista/home, em vez de cair em 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: string | null | undefined): boolean {
  return typeof v === "string" && UUID_RE.test(v)
}
