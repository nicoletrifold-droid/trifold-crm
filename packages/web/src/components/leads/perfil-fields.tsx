"use client"

// Story 75-181 — Bloco "Perfil (marketing)" do lead: profissão (select + "Outra" →
// texto livre), renda familiar, filhos, estado civil, faixa etária, situação de
// moradia, cidade/bairro e pet. Nenhum campo obrigatório.
//
// Componente CONTROLADO e compartilhado pelas 4 superfícies (edição dashboard/corretor,
// cadastro dashboard, modal do corretor) — REUSE (IDS): a lógica da profissão vive só aqui.
// Estilo vem do pai via `inputClass`/`labelClass` p/ casar com cada formulário.

import { useState } from "react"
import {
  PROFISSAO_SUGESTOES,
  RENDA_FAMILIAR_OPTIONS,
  FILHOS_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  FAIXA_ETARIA_OPTIONS,
  SITUACAO_MORADIA_OPTIONS,
  TEM_PET_OPTIONS,
} from "@web/lib/leads/enrich"

/** Valores do bloco de perfil — string vazia = "não informado" (vira null no submit). */
export interface LeadPerfilValue {
  profissao: string
  renda_familiar: string
  filhos: string
  estado_civil: string
  faixa_etaria: string
  situacao_moradia: string
  cidade_bairro: string
  tem_pet: string
}

export const EMPTY_LEAD_PERFIL: LeadPerfilValue = {
  profissao: "",
  renda_familiar: "",
  filhos: "",
  estado_civil: "",
  faixa_etaria: "",
  situacao_moradia: "",
  cidade_bairro: "",
  tem_pet: "",
}

/** Monta o LeadPerfilValue a partir de um lead vindo do banco (null → ""). */
export function leadPerfilFromLead(lead: Partial<Record<keyof LeadPerfilValue, string | null>>): LeadPerfilValue {
  return {
    profissao: lead.profissao ?? "",
    renda_familiar: lead.renda_familiar ?? "",
    filhos: lead.filhos ?? "",
    estado_civil: lead.estado_civil ?? "",
    faixa_etaria: lead.faixa_etaria ?? "",
    situacao_moradia: lead.situacao_moradia ?? "",
    cidade_bairro: lead.cidade_bairro ?? "",
    tem_pet: lead.tem_pet ?? "",
  }
}

/** Payload p/ POST/PATCH: "" → null (campo não informado). */
export function leadPerfilToPayload(v: LeadPerfilValue): Record<string, string | null> {
  return {
    profissao: v.profissao.trim() || null,
    renda_familiar: v.renda_familiar || null,
    filhos: v.filhos || null,
    estado_civil: v.estado_civil || null,
    faixa_etaria: v.faixa_etaria || null,
    situacao_moradia: v.situacao_moradia || null,
    cidade_bairro: v.cidade_bairro.trim() || null,
    tem_pet: v.tem_pet || null,
  }
}

const OUTRA = "__outra__"

/** Chaves do perfil — usadas pelo wrapper de FormData e pelas APIs. */
export const LEAD_PERFIL_KEYS = [
  "profissao",
  "renda_familiar",
  "filhos",
  "estado_civil",
  "faixa_etaria",
  "situacao_moradia",
  "cidade_bairro",
  "tem_pet",
] as const

interface Props {
  value: LeadPerfilValue
  onChange: (patch: Partial<LeadPerfilValue>) => void
  inputClass: string
  labelClass: string
}

export function LeadPerfilFields({ value, onChange, inputClass, labelClass }: Props) {
  const isKnownProfissao = (PROFISSAO_SUGESTOES as readonly string[]).includes(value.profissao)
  // Select mostra a opção conhecida, vazio, ou "Outra" (quando há texto fora da lista).
  const profissaoSelect = value.profissao === "" ? "" : isKnownProfissao ? value.profissao : OUTRA
  const showOutraInput = profissaoSelect === OUTRA

  return (
    <>
      <div>
        <label className={labelClass}>Profissão</label>
        <select
          value={profissaoSelect}
          onChange={(e) => {
            const v = e.target.value
            // "Outra" abre o input com texto vazio; opção da lista grava o rótulo direto.
            onChange({ profissao: v === OUTRA ? " " : v })
          }}
          className={inputClass}
        >
          <option value="">Não informado</option>
          {PROFISSAO_SUGESTOES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value={OUTRA}>Outra…</option>
        </select>
        {showOutraInput && (
          <input
            type="text"
            value={value.profissao === " " ? "" : value.profissao}
            onChange={(e) => onChange({ profissao: e.target.value || " " })}
            placeholder="Digite a profissão"
            className={`${inputClass} mt-2`}
            autoFocus
          />
        )}
      </div>
      <div>
        <label className={labelClass}>Renda familiar mensal</label>
        <select value={value.renda_familiar} onChange={(e) => onChange({ renda_familiar: e.target.value })} className={inputClass}>
          {RENDA_FAMILIAR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Filhos</label>
        <select value={value.filhos} onChange={(e) => onChange({ filhos: e.target.value })} className={inputClass}>
          {FILHOS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Estado civil</label>
        <select value={value.estado_civil} onChange={(e) => onChange({ estado_civil: e.target.value })} className={inputClass}>
          {ESTADO_CIVIL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Faixa etária</label>
        <select value={value.faixa_etaria} onChange={(e) => onChange({ faixa_etaria: e.target.value })} className={inputClass}>
          {FAIXA_ETARIA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Situação de moradia</label>
        <select value={value.situacao_moradia} onChange={(e) => onChange({ situacao_moradia: e.target.value })} className={inputClass}>
          {SITUACAO_MORADIA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelClass}>Cidade / Bairro atual</label>
        <input
          type="text"
          value={value.cidade_bairro}
          onChange={(e) => onChange({ cidade_bairro: e.target.value })}
          placeholder="Ex: Maringá / Jd. Atami"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Tem pet?</label>
        <select value={value.tem_pet} onChange={(e) => onChange({ tem_pet: e.target.value })} className={inputClass}>
          {TEM_PET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </>
  )
}

/**
 * Variante autocontida p/ formulários com server action (FormData): mantém o estado
 * internamente e espelha os valores em `<input type="hidden" name={campo}>`, para o
 * server action ler `formData.get("profissao")` etc. Usada no cadastro do dashboard.
 */
export function LeadPerfilFieldsFormData({ inputClass, labelClass }: { inputClass: string; labelClass: string }) {
  const [perfil, setPerfil] = useState<LeadPerfilValue>(EMPTY_LEAD_PERFIL)
  const payload = leadPerfilToPayload(perfil)

  return (
    <>
      <LeadPerfilFields
        value={perfil}
        onChange={(patch) => setPerfil((p) => ({ ...p, ...patch }))}
        inputClass={inputClass}
        labelClass={labelClass}
      />
      {LEAD_PERFIL_KEYS.map((k) => (
        <input key={k} type="hidden" name={k} value={payload[k] ?? ""} />
      ))}
    </>
  )
}
