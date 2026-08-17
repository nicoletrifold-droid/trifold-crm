// Rate limit em memória, por IP — extraído de `api/formulario/[token]/route.ts`
// (Story 75-330) na Story 86-9, quando uma segunda rota pública do formulário
// passou a precisar da mesma proteção. Comportamento idêntico ao original.
//
// ⚠️ LIMITAÇÃO CONHECIDA E ACEITA: na Vercel isso vale POR INSTÂNCIA de lambda.
// Segura repetição acidental e script ingênuo; NÃO é defesa contra abuso
// distribuído. Defesa séria de endpoint público é story própria.
//
// ⚠️ A chave é IP de tráfego pago — sem poda, o Map cresceria sem teto enquanto
// a lambda viver e viraria vazamento de memória. Daí a varredura no início.

const JANELA_MS = 60 * 1000

/** Um balde por rota: o limite do formulário não consome o do tracking. */
export function criarRateLimit(maxPorJanela: number) {
  const marcasPorIp = new Map<string, number[]>()

  return function checarRateLimit(ip: string): boolean {
    const agora = Date.now()

    for (const [chave, marcas] of marcasPorIp) {
      if (marcas.every((t) => agora - t >= JANELA_MS)) marcasPorIp.delete(chave)
    }

    const recentes = (marcasPorIp.get(ip) ?? []).filter((t) => agora - t < JANELA_MS)
    if (recentes.length >= maxPorJanela) return false
    recentes.push(agora)
    marcasPorIp.set(ip, recentes)
    return true
  }
}

export function ipDaRequisicao(request: {
  headers: { get(nome: string): string | null }
}): string {
  const fwd = request.headers.get("x-forwarded-for")
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconhecido"
}
