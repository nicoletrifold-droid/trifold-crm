// Story 75-104 — Checklist dos documentos exigidos para a "pasta" (contrato de compra
// e venda de imóvel). Fonte: relação oficial da Trifold.
//   PF: RG/CNH, CPF, comprovante de estado civil, comprovante de endereço (+ infos
//       profissão/e-mail/celular). Se CASADO → repete tudo para o cônjuge.
//   PJ: contrato social + representante legal (mesmos docs/infos de uma PF).

export type PastaTipo = "pf" | "pj"
export type Titular = "interessado" | "conjuge" | "representante"

export interface DocSlot {
  slug: string
  label: string
  titular: Titular
}

export interface InfoField {
  key: string
  label: string
  titular: Titular
  type: "text" | "email" | "tel"
}

const TITULAR_LABEL: Record<Titular, string> = {
  interessado: "Titular",
  conjuge: "Cônjuge",
  representante: "Representante legal",
}

export function titularLabel(t: Titular): string {
  return TITULAR_LABEL[t]
}

// Documentos de UMA pessoa física (titular, cônjuge ou representante).
// Story 75-125 — o "Comprovante de estado civil" é opcional: solteiro não precisa
// enviar (só casado/união estável). Default true mantém cônjuge/representante iguais.
function pessoaDocs(titular: Titular, includeEstadoCivil = true): DocSlot[] {
  const suf = titular === "interessado" ? "" : `_${titular}`
  const docs: DocSlot[] = [
    { slug: `rg_cnh${suf}`, label: "RG ou CNH (frente e verso)", titular },
    { slug: `cpf${suf}`, label: "CPF ou CNH", titular },
  ]
  if (includeEstadoCivil) {
    docs.push({ slug: `comprovante_estado_civil${suf}`, label: "Comprovante de estado civil", titular })
  }
  docs.push({ slug: `comprovante_endereco${suf}`, label: "Comprovante de endereço", titular })
  return docs
}

function pessoaInfos(titular: Titular): InfoField[] {
  const suf = titular === "interessado" ? "" : `_${titular}`
  return [
    { key: `profissao${suf}`, label: "Profissão", titular, type: "text" },
    { key: `email${suf}`, label: "E-mail", titular, type: "email" },
    { key: `celular${suf}`, label: "Celular", titular, type: "tel" },
  ]
}

// Story 75-123 — quando a pasta é marcada com "PIX", o interessado precisa anexar
// o comprovante do pagamento. É sempre do titular/interessado (PF ou PJ).
const PIX_DOC: DocSlot = {
  slug: "comprovante_pix",
  label: "Comprovante de pagamento (PIX)",
  titular: "interessado",
}

// Story 75-124 — união estável exige comprovante próprio (escritura/contrato), que
// tem validade e é distinto da certidão de casamento.
const UNIAO_ESTAVEL_DOC: DocSlot = {
  slug: "comprovante_uniao_estavel",
  label: "Comprovante de união estável",
  titular: "interessado",
}

/**
 * Documentos (uploads) exigidos conforme tipo/estado civil e marcações.
 * `casado` OU `uniaoEstavel` puxam os documentos do parceiro(a); união estável
 * adiciona ainda o comprovante próprio. Só valem para PF (PJ ignora).
 */
export function buildDocSlots(
  tipo: PastaTipo,
  casado: boolean,
  temPix = false,
  uniaoEstavel = false,
): DocSlot[] {
  let docs: DocSlot[]
  if (tipo === "pj") {
    docs = [
      { slug: "contrato_social", label: "Contrato social", titular: "interessado" },
      ...pessoaDocs("representante"),
    ]
  } else {
    // Story 75-125 — solteiro não envia comprovante de estado civil.
    docs = pessoaDocs("interessado", casado || uniaoEstavel)
    if (casado || uniaoEstavel) docs.push(...pessoaDocs("conjuge"))
    if (uniaoEstavel) docs.push(UNIAO_ESTAVEL_DOC)
  }
  if (temPix) docs.push(PIX_DOC)
  return docs
}

/** Campos de informação (formulário) conforme tipo/estado civil. */
export function buildInfoFields(tipo: PastaTipo, casado: boolean): InfoField[] {
  if (tipo === "pj") return pessoaInfos("representante")
  const infos = pessoaInfos("interessado")
  if (casado) infos.push(...pessoaInfos("conjuge"))
  return infos
}
