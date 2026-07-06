// Story 75-127 (Etapa 2) — Extração dos dados dos documentos da pasta via visão do
// Claude. Baixa RG/CNH, CPF e comprovante de endereço (e variantes cônjuge/PJ) do
// bucket privado, manda pro Claude e recebe JSON estruturado (tool-use).
import { createAnthropicClient } from "@trifold/ai"
import type { SupabaseClient } from "@supabase/supabase-js"

const MODEL = "claude-sonnet-4-6"

export interface PessoaExtraida {
  nome?: string | null
  cpf?: string | null
  rg?: string | null
}
export interface EnderecoExtraido {
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null
}
export interface DadosExtraidos {
  titular?: PessoaExtraida
  conjuge?: PessoaExtraida
  endereco?: EnderecoExtraido
  razao_social?: string | null
  cnpj?: string | null
}

interface DocRef {
  slug: string
  label: string
  storage_path: string | null
  filename: string | null
}

// Slugs que interessam à extração (ignora comprovante de estado civil, PIX etc.).
const RELEVANT = ["rg_cnh", "cpf", "comprovante_endereco", "contrato_social"]
function isRelevant(slug: string): boolean {
  return RELEVANT.some((r) => slug === r || slug.startsWith(`${r}_`))
}

function mediaTypeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "pdf": return "application/pdf"
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "png": return "image/png"
    case "webp": return "image/webp"
    case "gif": return "image/gif"
    default: return null // heic e afins não são suportados pela visão → ignora
  }
}

const TOOL = {
  name: "registrar_dados",
  description: "Registra os dados pessoais extraídos dos documentos.",
  input_schema: {
    type: "object" as const,
    properties: {
      titular: {
        type: "object",
        description: "Pessoa física principal (interessado, ou o representante legal se for PJ).",
        properties: {
          nome: { type: "string", description: "Nome completo" },
          cpf: { type: "string", description: "CPF formatado 000.000.000-00" },
          rg: { type: "string", description: "Número do RG ou registro da CNH" },
        },
      },
      conjuge: {
        type: "object",
        description: "Cônjuge/companheiro(a), se houver documentos dele(a).",
        properties: {
          nome: { type: "string" },
          cpf: { type: "string" },
          rg: { type: "string" },
        },
      },
      endereco: {
        type: "object",
        description: "Endereço do comprovante de residência do titular.",
        properties: {
          logradouro: { type: "string", description: "Rua/avenida (sem número)" },
          numero: { type: "string" },
          complemento: { type: "string", description: "Apto/bloco/casa, se houver" },
          cidade: { type: "string" },
          uf: { type: "string", description: "Sigla do estado, 2 letras" },
          cep: { type: "string", description: "CEP formatado 00000-000" },
        },
      },
      razao_social: { type: "string", description: "Razão social (só se PJ / contrato social)" },
      cnpj: { type: "string", description: "CNPJ (só se PJ)" },
    },
  },
}

/**
 * Baixa os documentos relevantes da pasta e extrai os dados via visão do Claude.
 * `admin` = supabase service-role client (acesso ao bucket privado).
 */
export async function extractFromDocs(
  admin: SupabaseClient,
  docs: DocRef[],
  tipo: "pf" | "pj",
): Promise<DadosExtraidos> {
  const relevant = docs.filter((d) => d.storage_path && isRelevant(d.slug))
  if (relevant.length === 0) return {}

  // Monta os blocos de conteúdo (imagem/PDF) a partir dos arquivos do bucket.
  const blocks: Array<Record<string, unknown>> = []
  for (const d of relevant) {
    const name = d.filename ?? `${d.slug}.pdf`
    const mt = mediaTypeFromName(name)
    if (!mt) continue
    const { data: file, error } = await admin.storage.from("pastas").download(d.storage_path as string)
    if (error || !file) continue
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64")
    blocks.push({ type: "text", text: `Documento "${d.label}" (${d.slug}):` })
    if (mt === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: mt, data: b64 } })
    } else {
      blocks.push({ type: "image", source: { type: "base64", media_type: mt, data: b64 } })
    }
  }
  if (blocks.length === 0) return {}

  const instrucao =
    tipo === "pj"
      ? "Extraia a razão social e o CNPJ do contrato social, e os dados do representante legal (como 'titular') a partir do RG/CNH e CPF, além do endereço do comprovante."
      : "Extraia os dados do interessado (como 'titular') a partir do RG/CNH e CPF, e o endereço do comprovante de residência. Se houver documentos de um cônjuge, preencha 'conjuge'."

  const anthropic = createAnthropicClient()
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tool_choice: { type: "tool", name: TOOL.name },
    tools: [TOOL],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Você recebe documentos de identificação de um comprador de imóvel. ${instrucao} ` +
              "Use apenas o que estiver legível nos documentos; deixe campos ausentes em branco (não invente). " +
              "Chame a ferramenta registrar_dados com os dados encontrados.",
          },
          ...blocks,
        ] as never,
      },
    ],
  })

  const toolUse = resp.content.find((c) => c.type === "tool_use")
  if (toolUse && toolUse.type === "tool_use") {
    return (toolUse.input ?? {}) as DadosExtraidos
  }
  return {}
}
