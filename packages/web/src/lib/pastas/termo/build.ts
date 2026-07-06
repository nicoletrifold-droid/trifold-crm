// Story 75-127 (Etapa 2/3) — Monta o TermoData a partir dos dados da pasta
// (colunas + form_data do formulário público) + o que a visão extraiu dos documentos.
// O Termo (modelo) só usa nome + endereço dos docs; profissão/celular/e-mail vêm do
// form_data/pasta; corretor/imobiliária/fluxo/PIX das colunas.
import type { TermoData } from "./fill"
import type { DadosExtraidos } from "./extract"

export interface PastaRowForTermo {
  nome: string
  tipo: "pf" | "pj"
  casado: boolean
  uniao_estavel: boolean
  corretor_nome: string | null
  imobiliaria: string | null
  interessado_telefone: string | null
  interessado_email: string | null
  tem_pix: boolean
  fluxo_pagamento: string | null
  form_data: Record<string, string> | null
}

export function buildTermoData(p: PastaRowForTermo, ex: DadosExtraidos): TermoData {
  const fd = p.form_data ?? {}
  const isPJ = p.tipo === "pj"
  const nome1 = (isPJ ? ex.razao_social : ex.titular?.nome) || p.nome
  const profissao = isPJ ? fd.profissao_representante : fd.profissao
  const temConjuge = !isPJ && (p.casado || p.uniao_estavel)

  return {
    nome1,
    profissao: profissao ?? null,
    celular: p.interessado_telefone || fd.celular || null,
    email: p.interessado_email || fd.email || null,
    endereco: ex.endereco ?? null,
    conjuge: temConjuge
      ? {
          nome: ex.conjuge?.nome ?? null,
          profissao: fd.profissao_conjuge ?? null,
          celular: fd.celular_conjuge ?? null,
          email: fd.email_conjuge ?? null,
        }
      : null,
    corretor: p.corretor_nome ?? null,
    imobiliaria: p.imobiliaria ?? null,
    fluxoPagamento: (p.fluxo_pagamento as TermoData["fluxoPagamento"]) ?? null,
    temPix: !!p.tem_pix,
    data: null,
  }
}
