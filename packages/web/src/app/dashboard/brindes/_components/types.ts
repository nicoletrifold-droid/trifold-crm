export interface DataComemorativa {
  id: string
  nome: string
  data: string
  ativa: boolean
}

export interface Destinatario {
  id: string
  org_id: string
  obra_nome: string
  tipo: "mae" | "pai" | "outro"
  nome: string
  observacao: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  endereco_cep: string | null
  endereco_referencia: string | null
  created_at: string
  updated_at: string
}

export type EntregaStatus = "pendente" | "entregue" | "nao_encontrado"

export interface Entrega {
  destinatario_id: string
  status: EntregaStatus
  observacao_entrega: string | null
  entregue_em: string | null
}

export const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]

export const STATUS_LABEL: Record<EntregaStatus, string> = {
  pendente: "Pendente",
  entregue: "Entregue",
  nao_encontrado: "Não encontrado",
}

export const STATUS_BADGE_CLASS: Record<EntregaStatus, string> = {
  pendente: "bg-gray-100 text-gray-600",
  entregue: "bg-green-100 text-green-700",
  nao_encontrado: "bg-red-100 text-red-700",
}
