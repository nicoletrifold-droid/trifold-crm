export interface EnderecoParseado {
  endereco_logradouro?: string
  endereco_numero?: string
  endereco_complemento?: string
  endereco_bairro?: string
  endereco_cidade?: string
  endereco_estado?: string
  endereco_cep?: string
  endereco_referencia?: string
}

const SPECIAL_PREFIXES = ["OBRA ", "SEDE ", "FILIAL ", "DEPOSITO ", "DEPÓSITO "]

export function parseEndereco(raw: string): EnderecoParseado {
  if (!raw || !raw.trim()) return {}

  const normalized = raw.trim()

  // Detect special references (OBRA X, SEDE X, etc.)
  const upper = normalized.toUpperCase()
  if (SPECIAL_PREFIXES.some((p) => upper.startsWith(p))) {
    return { endereco_referencia: normalized }
  }

  const result: EnderecoParseado = {}

  // Extract CEP: 99999-999 or 99999999
  const cepMatch = normalized.match(/\b(\d{5})-?(\d{3})\b/)
  if (cepMatch) {
    result.endereco_cep = `${cepMatch[1]}-${cepMatch[2]}`
  }

  // Extract state: 2 uppercase letters at the end (after - or space, optionally with city before)
  const stateMatch = normalized.match(/[-\s]([A-Z]{2})\s*$/)
  if (stateMatch) {
    result.endereco_estado = stateMatch[1]
  }

  // Extract city: text between last "-" and state, or between CEP and state
  let workStr = normalized
  if (result.endereco_cep) {
    workStr = workStr.replace(result.endereco_cep.replace("-", "-?"), "")
  }
  if (result.endereco_estado) {
    // Remove trailing "- STATE" or " STATE"
    workStr = workStr.replace(new RegExp(`[-\\s]+${result.endereco_estado}\\s*$`), "")
  }

  const cityMatch = workStr.match(/[-,]\s*([^,\-]+?)\s*$/)
  if (cityMatch) {
    const candidate = cityMatch[1]!.trim()
    // City should not look like a number or be very short (less than 3 chars)
    if (candidate.length >= 3 && !/^\d+$/.test(candidate)) {
      result.endereco_cidade = candidate
      workStr = workStr.slice(0, workStr.lastIndexOf(cityMatch[0]))
    }
  }

  // Remove CEP from working string
  workStr = workStr.replace(/,?\s*\d{5}-?\d{3}/, "").trim()
  // Clean trailing commas/dashes
  workStr = workStr.replace(/[,\s-]+$/, "").trim()

  if (!workStr) return result

  // Split remaining by comma: first part is logradouro+numero, rest is complemento
  const parts = workStr.split(",").map((p) => p.trim()).filter(Boolean)

  if (parts.length === 0) return result

  // First part: extract street name and number
  const firstPart = parts[0]!
  // Number patterns: "Nº 123", "nº 123", "n° 123", "123" at end
  const numMatch = firstPart.match(/\s+[Nn][°ºo]?\s*(\d+[A-Za-z]?)\s*$/) ||
    firstPart.match(/,?\s*(\d+[A-Za-z]?)\s*$/)

  if (numMatch) {
    result.endereco_numero = numMatch[1]
    result.endereco_logradouro = firstPart.slice(0, firstPart.lastIndexOf(numMatch[0])).trim()
  } else {
    result.endereco_logradouro = firstPart
  }

  // Remaining parts (index 1+) are complemento
  if (parts.length > 1) {
    const complemento = parts.slice(1).join(", ").trim()
    if (complemento) {
      result.endereco_complemento = complemento
    }
  }

  // If nothing meaningful was extracted, store as reference
  if (!result.endereco_logradouro && !result.endereco_cidade && !result.endereco_cep) {
    return { endereco_referencia: normalized }
  }

  return result
}
