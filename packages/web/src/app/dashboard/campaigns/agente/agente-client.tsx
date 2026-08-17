"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import MarcasSection from "./marcas-section"
import { FORMATO_LABELS, MARKETING_POST_FORMATOS, type MarketingPostFormato } from "@web/lib/marketing/posts"
import {
  AD_HEADLINE_MAX,
  AD_OBJETIVO_LABELS,
  AD_OBJETIVOS,
  AD_PRIMARY_MAX,
  AD_RATIO_LABELS,
  AD_RATIOS,
  DIRECAO_CHIP_GROUPS,
  type AdObjetivo,
  type AdRatio,
  type PostDestino,
} from "@web/lib/marketing/direcao"
import { PostPreviewModal } from "./_components/post-preview-modal"
import { buildPostPreview, nomeDaUnidade, quantasArtes, tipoDePreview } from "@web/lib/marketing/post-preview"
// Story 75-333: barra de abas compartilhada (antes era copiada aqui).
import { CampaignsTabs } from "../_components/campaigns-tabs"

// Story 75-219 — aba "Agente": sugestões do agente de marketing IA + fila de
// aprovação + publicados. Nada é publicado automaticamente — toda transição é
// ação humana. Sem realtime de propósito: refresh após ação é suficiente.

interface MarketingPost {
  id: string
  empreendimento_id: string | null
  canal: "instagram" | "facebook"
  formato: MarketingPostFormato | null
  pedido: string | null
  copy: string
  roteiro: string | null
  arte_url: string | null
  /** Story 75-255 — uma arte por tela; arte_url espelha a de ordem 1.
   *  Story 75-294 — `ratio` presente = peça de tráfego pago (1:1/4:5/9:16). */
  artes: Array<{ ordem: number; url: string; descricao?: string | null; cta?: string | null; ratio?: AdRatio | null }> | null
  scheduled_for: string | null
  status: "sugerido" | "aprovado" | "rejeitado" | "publicado"
  justificativa: string | null
  origem: "agente" | "humano"
  /** Story 75-294 — tráfego pago */
  destino?: PostDestino | null
  objetivo?: AdObjetivo | null
  ad_primary_text?: string | null
  ad_headline?: string | null
  created_at: string
  updated_at: string
  properties: { name: string } | { name: string }[] | null
}

interface PropertyOption {
  id: string
  name: string
}


// ─── Helpers ───────────────────────────────────────────────────────────────

// Story 75-254 — elevado a constante de módulo: o PostCard também usa (botão
// Visualizar), e duplicar a string faria os botões divergirem com o tempo.
const actionBtn = "rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60 transition-colors"

const CANAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
}

const ORIGEM_BADGES: Record<string, { label: string; className: string }> = {
  agente: {
    label: "Lídia",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
  humano: {
    label: "Manual",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
}

// Story 75-240 — arte gerada (bucket marketing-artes) aparece inline; link
// externo continua como link.
function isImageUrl(url: string): boolean {
  return url.includes("/marketing-artes/") || /\.(png|jpe?g|webp)(\?|$)/i.test(url)
}

// onError cai pro link (QA #14: URL externa terminando em .png pode não ser
// imagem servível — sem fallback ficava um ícone quebrado no card).
function ArtePreview({ url, rotulo }: { url: string; rotulo?: string | null }) {
  const [broken, setBroken] = useState(false)
  if (!isImageUrl(url) || broken) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
      >
        Ver {rotulo ? rotulo.toLowerCase() : "arte"} ↗
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block" title={rotulo ?? "Abrir arte"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={rotulo ? `Arte da ${rotulo}` : "Arte do post"}
        onError={() => setBroken(true)}
        className="max-h-72 rounded-md border border-gray-200 object-contain dark:border-stone-800"
      />
      {rotulo && (
        <span className="mt-1 block text-center text-[11px] font-medium text-gray-500 dark:text-stone-400">
          {rotulo}
        </span>
      )}
    </a>
  )
}

/**
 * Story 75-263 — TODAS as artes do post, uma miniatura por tela/card.
 *
 * Antes o card renderizava só `arte_url`, que por contrato da 75-255 espelha a
 * tela de MENOR ordem: num story de 2 telas a tela 2 existia, tinha botão de
 * "Refazer arte (tela 2)" ao lado, e não aparecia em lugar nenhum. O card já
 * sabia que havia 2 artes — só desenhava uma.
 *
 * Rótulo segue o vocabulário do preview (`post-preview.ts`): story = "Tela N",
 * carrossel = "Card N". Peça única não recebe rótulo, para não poluir o card do
 * post estático com um "Tela 1" que não significa nada.
 */
function ArtesDoPost({
  artes,
  arteUrl,
  formato,
}: {
  artes: MarketingPost["artes"]
  arteUrl: string | null
  formato: MarketingPostFormato | null
}) {
  // Story 75-294 — peça de tráfego pago: dentro da mesma ordem, 4:5 primeiro
  // (mesma régua do espelho arte_url no servidor).
  const ratioIdx = (r?: AdRatio | null) => (r ? ["4:5", "1:1", "9:16"].indexOf(r) : -1)
  const lista = (artes ?? [])
    .filter((a) => a.url)
    .sort((a, b) => a.ordem - b.ordem || ratioIdx(a.ratio) - ratioIdx(b.ratio))

  // Post legado/manual: sem `artes`, mas com `arte_url`. Mantém o de sempre.
  if (lista.length === 0) {
    return arteUrl ? <ArtePreview key={arteUrl} url={arteUrl} /> : null
  }

  // Vocabulário vem de post-preview.ts — fonte única (ver nomeDaUnidade).
  const nome = nomeDaUnidade(tipoDePreview(formato))
  const unica = lista.length === 1

  return (
    <div className="mt-3 flex flex-wrap items-start gap-3">
      {lista.map((a) => (
        <ArtePreview
          key={`${a.ordem}-${a.ratio ?? ""}-${a.url}`}
          url={a.url}
          // Tráfego pago: o rótulo é a PROPORÇÃO (é assim que se sobe no Meta).
          // Orgânico: peça única sem rótulo; 2+ ganha "Tela/Card N" como antes.
          rotulo={a.ratio ? AD_RATIO_LABELS[a.ratio] : unica || !nome ? null : `${nome} ${a.ordem}`}
        />
      ))}
    </div>
  )
}

function propertyName(post: MarketingPost): string | null {
  const prop = Array.isArray(post.properties) ? post.properties[0] : post.properties
  return prop?.name ?? null
}

function formatDay(d: string | null): string | null {
  if (!d) return null
  const [y, m, day] = d.split("-")
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

// ─── Pedir à Lídia (Story 75-239) ──────────────────────────────────────────
// A diretriz livre é o caminho PRINCIPAL de criação: o humano descreve
// ("story do Vind pra investidor, usa a foto da fachada") e a Lídia entrega
// copy no formato pedido (+ roteiro quando reel) direto na fila de aprovação.

interface PedidoFormValues {
  pedido: string
  direcao_arte: string
  empreendimento_id: string
  formato: MarketingPostFormato
  canal: "instagram" | "facebook"
  scheduled_for: string
  // Story 75-294 — tráfego pago + chips de direção
  destino: PostDestino
  objetivo: AdObjetivo
  proporcoes: AdRatio[]
  chips: Record<string, string>
}

const EMPTY_PEDIDO: PedidoFormValues = {
  pedido: "",
  direcao_arte: "",
  empreendimento_id: "",
  formato: "estatico",
  canal: "instagram",
  scheduled_for: "",
  destino: "organico",
  objetivo: "leads",
  proporcoes: [...AD_RATIOS],
  chips: {},
}

function PedirLidiaModal({
  properties,
  generating,
  error,
  onGenerate,
  onManual,
  onClose,
}: {
  properties: PropertyOption[]
  generating: boolean
  error: string | null
  onGenerate: (values: PedidoFormValues) => void
  /** Leva os values atuais: trocar pro manual não descarta o que foi digitado. */
  onManual: (values: PedidoFormValues) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<PedidoFormValues>(EMPTY_PEDIDO)
  // Story 75-294 — "✨ Melhorar meu pedido" (com Desfazer de 1 nível, fail-open)
  const [melhorando, setMelhorando] = useState(false)
  const [pedidoAnterior, setPedidoAnterior] = useState<string | null>(null)
  const [melhorarAviso, setMelhorarAviso] = useState<string | null>(null)
  // Story 75-294 — o chip "Fachada real" só habilita se o Kit ESCOPADO tem foto
  const [brandsInfo, setBrandsInfo] = useState<Array<{ tipo: string; property_id: string | null; temFoto: boolean }> | null>(null)

  useEffect(() => {
    let alive = true
    void fetch("/api/marketing-brands")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { brands?: Array<{ tipo: string; property_id: string | null; assets?: Array<{ tipo: string }> }> } | null) => {
        if (!alive || !json?.brands) return
        setBrandsInfo(
          json.brands.map((b) => ({
            tipo: b.tipo,
            property_id: b.property_id,
            temFoto: (b.assets ?? []).some((a) => a.tipo === "foto"),
          }))
        )
      })
      .catch(() => {
        /* sem info de Kit: chips que precisam de foto ficam desabilitados */
      })
    return () => {
      alive = false
    }
  }, [])

  // Mesma régua de escopo do servidor: institucional + a marca DO empreendimento.
  const kitTemFachada = (brandsInfo ?? []).some(
    (b) =>
      b.temFoto &&
      (b.tipo === "institucional" || (values.empreendimento_id !== "" && b.property_id === values.empreendimento_id))
  )

  function toggleChip(groupKey: string, chipKey: string) {
    setValues((v) => {
      const chips = { ...v.chips }
      if (chips[groupKey] === chipKey) delete chips[groupKey]
      else chips[groupKey] = chipKey
      return { ...v, chips }
    })
  }

  function toggleRatio(r: AdRatio) {
    setValues((v) => {
      const has = v.proporcoes.includes(r)
      // mínimo 1 proporção marcada
      if (has && v.proporcoes.length === 1) return v
      return { ...v, proporcoes: has ? v.proporcoes.filter((x) => x !== r) : [...v.proporcoes, r] }
    })
  }

  async function melhorarPedido() {
    if (values.pedido.trim().length < 10 || melhorando) return
    setMelhorando(true)
    setMelhorarAviso(null)
    try {
      const res = await fetch("/api/marketing-posts/melhorar-pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedido: values.pedido,
          empreendimento_id: values.empreendimento_id || null,
          destino: values.destino,
        }),
      })
      const json = (await res.json().catch(() => null)) as { pedido?: string; error?: string } | null
      if (!res.ok || !json?.pedido) {
        // FAIL-OPEN — o texto original fica como está
        setMelhorarAviso(json?.error ?? "Não consegui melhorar agora — seu texto ficou como estava.")
        return
      }
      setPedidoAnterior(values.pedido)
      setValues((v) => ({ ...v, pedido: json.pedido! }))
    } catch {
      setMelhorarAviso("Não consegui melhorar agora — seu texto ficou como estava.")
    } finally {
      setMelhorando(false)
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1 dark:text-stone-400"
  const chipBase =
    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
  const chipOff =
    "border-gray-300 text-gray-600 hover:border-orange-400 dark:border-stone-700 dark:text-stone-300 dark:hover:border-orange-500"
  const chipOn = "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-stone-100">Pedir à Lídia</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-stone-400">
          Descreva o post como falaria com um social media. A Lídia usa o Kit de Marcas (voz,
          diretrizes, briefing) e devolve na fila de aprovação.
        </p>

        <div className="mt-4 space-y-3">
          {/* Story 75-294 — destino é a PRIMEIRA decisão: muda o resto do form */}
          <div role="group" aria-label="Destino" className="flex gap-2">
            {(["organico", "pago"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={values.destino === d}
                onClick={() => setValues((v) => ({ ...v, destino: d, formato: d === "pago" ? "estatico" : v.formato }))}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  values.destino === d
                    ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    : "border-gray-300 text-gray-600 hover:border-orange-400 dark:border-stone-700 dark:text-stone-300"
                }`}
              >
                {d === "organico" ? "Orgânico" : "Tráfego pago"}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>O que você quer? *</label>
              <div className="mb-1 flex items-center gap-2">
                {pedidoAnterior !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setValues((v) => ({ ...v, pedido: pedidoAnterior }))
                      setPedidoAnterior(null)
                    }}
                    className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-600 dark:text-stone-500 dark:hover:text-stone-300"
                  >
                    Desfazer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void melhorarPedido()}
                  disabled={melhorando || values.pedido.trim().length < 10}
                  className="rounded-md border border-orange-300 px-2 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-40 dark:border-orange-500/40 dark:text-orange-300 dark:hover:bg-orange-500/10"
                  title="A Lídia reescreve seu texto como um briefing completo (dá pra desfazer)"
                >
                  {melhorando ? "Melhorando…" : "✨ Melhorar"}
                </button>
              </div>
            </div>
            <textarea
              value={values.pedido}
              onChange={(e) => setValues((v) => ({ ...v, pedido: e.target.value }))}
              rows={4}
              maxLength={2000}
              className={inputClass}
              placeholder={
                values.destino === "pago"
                  ? 'Ex.: "Anúncio pra investidor batendo na entrega em abril de 2027, focado em agendar visita."'
                  : 'Ex.: "Story pra investidor batendo na entrega em abril de 2027, com CTA de agendar visita. Usa a foto da fachada."'
              }
              autoFocus
            />
            {melhorarAviso && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{melhorarAviso}</p>}
          </div>

          {/* Story 75-294 — direção de arte por CHIPS (fonte única em lib/marketing/direcao)
              + detalhes livres. Reel não gera arte, então a seção some (regra 75-241). */}
          {values.formato !== "reel" && (
            <div>
              <label className={labelClass}>Direção da arte (opcional — toque para escolher)</label>
              <div className="space-y-1.5">
                {DIRECAO_CHIP_GROUPS.map((g) => (
                  <div key={g.key} role="group" aria-label={g.label} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 flex-none text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-stone-500">
                      {g.label}
                    </span>
                    {g.chips.map((c) => {
                      const bloqueado = !!c.precisaFachada && !kitTemFachada
                      return (
                        <button
                          key={c.key}
                          type="button"
                          aria-pressed={values.chips[g.key] === c.key}
                          disabled={bloqueado}
                          title={bloqueado ? "Adicione uma foto ao Kit da marca para usar" : c.fragmento}
                          onClick={() => toggleChip(g.key, c.key)}
                          className={`${chipBase} ${values.chips[g.key] === c.key ? chipOn : chipOff}`}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <input
                value={values.direcao_arte}
                onChange={(e) => setValues((v) => ({ ...v, direcao_arte: e.target.value }))}
                maxLength={400}
                className={`${inputClass} mt-2`}
                placeholder="Detalhes extras (texto livre) — ex.: destacar a piscina da cobertura"
              />
            </div>
          )}

          {values.destino === "pago" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Objetivo do anúncio</label>
                <div role="group" aria-label="Objetivo do anúncio" className="flex flex-wrap gap-1.5">
                  {AD_OBJETIVOS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={values.objetivo === o}
                      onClick={() => setValues((v) => ({ ...v, objetivo: o }))}
                      className={`${chipBase} ${values.objetivo === o ? chipOn : chipOff}`}
                    >
                      {AD_OBJETIVO_LABELS[o]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Proporções (posicionamentos do Meta)</label>
                <div role="group" aria-label="Proporções" className="flex flex-wrap gap-1.5">
                  {AD_RATIOS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={values.proporcoes.includes(r)}
                      onClick={() => toggleRatio(r)}
                      className={`${chipBase} ${values.proporcoes.includes(r) ? chipOn : chipOff}`}
                    >
                      {AD_RATIO_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Empreendimento</label>
              <select
                value={values.empreendimento_id}
                onChange={(e) => setValues((v) => ({ ...v, empreendimento_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">Institucional (a empresa)</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {values.destino === "organico" && (
              <div>
                <label className={labelClass}>Formato</label>
                <select
                  value={values.formato}
                  onChange={(e) => setValues((v) => ({ ...v, formato: e.target.value as MarketingPostFormato }))}
                  className={inputClass}
                >
                  {MARKETING_POST_FORMATOS.map((f) => (
                    <option key={f} value={f}>{f === "reel" ? "Reel (roteiro + legenda)" : FORMATO_LABELS[f]}</option>
                  ))}
                </select>
              </div>
            )}
            {values.destino === "organico" && (
              <div>
                <label className={labelClass}>Canal</label>
                <select
                  value={values.canal}
                  onChange={(e) => setValues((v) => ({ ...v, canal: e.target.value as "instagram" | "facebook" }))}
                  className={inputClass}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Data (opcional)</label>
              <input
                type="date"
                value={values.scheduled_for}
                onChange={(e) => setValues((v) => ({ ...v, scheduled_for: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            onClick={() => onManual(values)}
            disabled={generating}
            className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 disabled:opacity-60 dark:text-stone-500 dark:hover:text-stone-300"
          >
            Prefiro escrever manualmente
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={generating}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancelar
            </button>
            <button
              onClick={() => onGenerate(values)}
              disabled={generating || values.pedido.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {generating && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {generating
                ? values.destino === "pago"
                  ? `Criando ${values.proporcoes.length} proporç${values.proporcoes.length === 1 ? "ão" : "ões"}…`
                  : "Criando…"
                : "Criar com a Lídia"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Formulário (modo manual / editar) ─────────────────────────────────────

interface PostFormValues {
  empreendimento_id: string
  canal: "instagram" | "facebook"
  formato: "" | MarketingPostFormato
  copy: string
  roteiro: string
  arte_url: string
  scheduled_for: string
}

const EMPTY_FORM: PostFormValues = {
  empreendimento_id: "",
  canal: "instagram",
  formato: "",
  copy: "",
  roteiro: "",
  arte_url: "",
  scheduled_for: "",
}

function PostFormModal({
  title,
  initial,
  properties,
  canalEditable,
  saving,
  error,
  onSave,
  onClose,
}: {
  title: string
  initial: PostFormValues
  properties: PropertyOption[]
  canalEditable: boolean
  saving: boolean
  error: string | null
  onSave: (values: PostFormValues) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<PostFormValues>(initial)

  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1 dark:text-stone-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-stone-100">{title}</h3>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>Empreendimento</label>
            <select
              value={values.empreendimento_id}
              onChange={(e) => setValues((v) => ({ ...v, empreendimento_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">Institucional (sem empreendimento)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Canal</label>
            <select
              value={values.canal}
              onChange={(e) =>
                setValues((v) => ({ ...v, canal: e.target.value as "instagram" | "facebook" }))
              }
              disabled={!canalEditable}
              className={`${inputClass} disabled:opacity-60`}
            >
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>

          {/* Story 75-239 — formato também no manual (o roteiro abre quando reel) */}
          <div>
            <label className={labelClass}>Formato</label>
            <select
              value={values.formato}
              onChange={(e) => setValues((v) => ({ ...v, formato: e.target.value as PostFormValues["formato"] }))}
              className={inputClass}
            >
              <option value="">Sem formato</option>
              {MARKETING_POST_FORMATOS.map((f) => (
                <option key={f} value={f}>{FORMATO_LABELS[f]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Copy do post *</label>
            <textarea
              value={values.copy}
              onChange={(e) => setValues((v) => ({ ...v, copy: e.target.value }))}
              rows={5}
              className={inputClass}
              placeholder="Texto pronto para publicar"
            />
          </div>

          {values.formato === "reel" && (
            <div>
              <label className={labelClass}>Roteiro de gravação</label>
              <textarea
                value={values.roteiro}
                onChange={(e) => setValues((v) => ({ ...v, roteiro: e.target.value }))}
                rows={6}
                className={inputClass}
                placeholder="Cena a cena, texto de tela, narração…"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Arte (link externo, opcional)</label>
            <input
              type="url"
              value={values.arte_url}
              onChange={(e) => setValues((v) => ({ ...v, arte_url: e.target.value }))}
              className={inputClass}
              placeholder="https://…"
            />
          </div>

          <div>
            <label className={labelClass}>Data sugerida</label>
            <input
              type="date"
              value={values.scheduled_for}
              onChange={(e) => setValues((v) => ({ ...v, scheduled_for: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(values)}
            disabled={saving || values.copy.trim().length === 0}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Refazer arte (Story 75-240) ───────────────────────────────────────────
// Regenera a imagem com um ajuste opcional ("menos texto", "usa a piscina").
// Não mexe na copy — só a arte.

function RefazerArteButton({
  busy,
  onRefazer,
  ordem,
  totalTelas,
}: {
  busy: boolean
  onRefazer: (ajuste: string) => void
  /** Story 75-255 — qual tela refazer (1-based) */
  ordem?: number
  /** Só rotula quando o post tem mais de uma tela */
  totalTelas?: number
}) {
  const [open, setOpen] = useState(false)
  const [ajuste, setAjuste] = useState("")

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        className="rounded-md px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        🎨 Refazer arte{(totalTelas ?? 1) > 1 && ordem ? ` (tela ${ordem})` : ""}
      </button>
    )
  }
  return (
    <span className="flex w-full flex-wrap items-center gap-2">
      <input
        value={ajuste}
        onChange={(e) => setAjuste(e.target.value)}
        maxLength={500}
        disabled={busy}
        placeholder="Ajuste (opcional): menos texto, usa a foto da piscina…"
        className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs disabled:opacity-60 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        autoFocus
      />
      <button
        onClick={() => onRefazer(ajuste)}
        disabled={busy}
        className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {busy ? "Gerando…" : "Gerar"}
      </button>
      <button
        onClick={() => { setOpen(false); setAjuste("") }}
        disabled={busy}
        className="text-xs text-gray-400 hover:text-gray-600 dark:text-stone-500"
      >
        Cancelar
      </button>
    </span>
  )
}

// ─── Card de post ──────────────────────────────────────────────────────────

/**
 * Story 75-255 — quantas telas o post tem, para render de um botão de refazer por
 * tela. Usa as MESMAS funções puras do servidor (buildPostPreview + quantasArtes),
 * senão a interface e o motor discordam sobre quantas artes existem.
 */
function telasDoPost(post: MarketingPost): number[] {
  const totalTelas = buildPostPreview({
    copy: post.copy,
    formato: post.formato,
    temArteGerada: false,
  }).telas.length
  const quantas = quantasArtes(post.formato, totalTelas)
  return Array.from({ length: quantas }, (_, i) => i + 1)
}

/** Story 75-294 — linha de copy de anúncio: texto + contador + copiar. */
function AdCopyRow({ label, text, max }: { label: string; text: string; max: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">
          {label}{" "}
          <span className={text.length > max ? "text-red-500" : ""}>
            {text.length}/{max}
          </span>
        </span>
        <p className="text-xs text-gray-800 dark:text-stone-200">{text}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
        className="flex-none rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  )
}

function PostCard({
  post,
  actions,
}: {
  post: MarketingPost
  actions: React.ReactNode
}) {
  // Story 75-254 — o botão Visualizar vive AQUI, não em cada lista: assim nasce
  // em sugeridos, aprovados e publicados de uma vez (ressalva do @po: botão
  // replicado por call-site nasce faltando em alguma).
  const [preview, setPreview] = useState(false)
  const origem = ORIGEM_BADGES[post.origem] ?? ORIGEM_BADGES.humano!
  const prop = propertyName(post)
  const day = formatDay(post.scheduled_for)

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${origem.className}`}>
          {origem.label}
        </span>
        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-stone-700/50 dark:text-stone-300">
          {CANAL_LABELS[post.canal] ?? post.canal}
        </span>
        {post.formato && (
          <span className="inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
            {FORMATO_LABELS[post.formato] ?? post.formato}
          </span>
        )}
        {post.destino === "pago" && (
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            Tráfego pago{post.objetivo ? ` · ${AD_OBJETIVO_LABELS[post.objetivo]}` : ""}
          </span>
        )}
        {prop && (
          <span className="text-xs font-medium text-gray-700 dark:text-stone-300">{prop}</span>
        )}
        {!prop && (
          <span className="text-xs text-gray-400 dark:text-stone-500">Institucional</span>
        )}
        {day && (
          <span className="ml-auto text-xs text-gray-500 dark:text-stone-400">Sugerido para {day}</span>
        )}
      </div>

      {post.pedido && (
        <p className="mt-2 line-clamp-2 text-xs italic text-gray-400 dark:text-stone-500" title={post.pedido}>
          &ldquo;{post.pedido}&rdquo;
        </p>
      )}

      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800 dark:text-stone-200">{post.copy}</p>

      {post.roteiro && (
        <details className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-700 dark:bg-stone-800/60 dark:text-stone-300">
          <summary className="cursor-pointer font-semibold">🎬 Roteiro de gravação</summary>
          <p className="mt-2 whitespace-pre-wrap">{post.roteiro}</p>
        </details>
      )}

      {post.justificativa && (
        <div className="mt-3 rounded-md bg-orange-50 p-3 text-xs text-orange-900 dark:bg-orange-500/10 dark:text-orange-200">
          <span className="font-semibold">Por que a Lídia sugeriu: </span>
          {post.justificativa}
        </div>
      )}

      {/* Story 75-294 — copy do anúncio pronta pra colar no Ads Manager */}
      {(post.ad_primary_text || post.ad_headline) && (
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3 dark:bg-stone-800/60">
          {post.ad_primary_text && (
            <AdCopyRow label="Primary text" text={post.ad_primary_text} max={AD_PRIMARY_MAX} />
          )}
          {post.ad_headline && <AdCopyRow label="Headline" text={post.ad_headline} max={AD_HEADLINE_MAX} />}
        </div>
      )}

      <ArtesDoPost artes={post.artes} arteUrl={post.arte_url} formato={post.formato} />

      {post.destino === "pago" && post.origem === "agente" && (
        <p className="mt-2 text-[11px] text-gray-400 dark:text-stone-500">
          ⚠️ Arte gerada por IA — marque a declaração de IA ao subir o anúncio no Meta.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setPreview(true)}
          className={`${actionBtn} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800`}
        >
          👁 Visualizar
        </button>
        {actions}
      </div>

      {preview && (
        <PostPreviewModal
          copy={post.copy}
          formato={post.formato}
          roteiro={post.roteiro}
          arteUrl={post.arte_url}
          artes={post.artes}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function AgenteClient({
  properties,
  // Story 75-333 — a barra de abas virou compartilhada; a visibilidade da aba
  // de Formulários vem do servidor, que é quem sabe o módulo do usuário.
  showFormulariosTab,
}: {
  properties: PropertyOption[]
  showFormulariosTab: boolean
}) {
  const [posts, setPosts] = useState<MarketingPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const [modal, setModal] = useState<
    | { mode: "pedir" }
    | { mode: "create"; seed?: PostFormValues }
    | { mode: "edit"; post: MarketingPost }
    | null
  >(null)
  const [pedidoSaving, setPedidoSaving] = useState(false)
  const [pedidoError, setPedidoError] = useState<string | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch("/api/marketing-posts")
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const json = (await res.json()) as { posts: MarketingPost[] }
      setPosts(json.posts)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar posts")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPosts()
  }, [fetchPosts])

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch("/api/marketing-posts/generate", { method: "POST" })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(json?.error ?? `Erro ${res.status}`)
      }
      await fetchPosts()
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Falha ao gerar sugestões. Tente novamente.")
    } finally {
      setGenerating(false)
    }
  }

  const patchPost = async (id: string, body: Record<string, unknown>) => {
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/marketing-posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? `Erro ${res.status}`)
      await fetchPosts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Falha ao atualizar o post")
    } finally {
      setPendingId(null)
    }
  }

  // Story 75-239 — pedido livre → a Lídia cria e o post cai na fila.
  const handlePedido = async (values: PedidoFormValues) => {
    setPedidoSaving(true)
    setPedidoError(null)
    try {
      const res = await fetch("/api/marketing-posts/pedir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedido: values.pedido,
          direcao_arte: values.direcao_arte.trim() || null,
          chips: Object.keys(values.chips).length > 0 ? values.chips : null,
          empreendimento_id: values.empreendimento_id || null,
          formato: values.formato,
          canal: values.canal,
          scheduled_for: values.scheduled_for || null,
          // Story 75-294 — tráfego pago (organico não manda campos de pago)
          destino: values.destino,
          ...(values.destino === "pago"
            ? { objetivo: values.objetivo, proporcoes: values.proporcoes }
            : {}),
        }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? `Erro ${res.status}`)
      setModal(null)
      await fetchPosts()
    } catch (e) {
      setPedidoError(e instanceof Error ? e.message : "Falha ao gerar o post")
    } finally {
      setPedidoSaving(false)
    }
  }

  // Story 75-240 — refaz só a ARTE do post (a copy fica).
  // Story 75-255 — refazer é POR TELA: `ordem` diz qual. Sem ordem, o servidor
  // assume a tela 1 (comportamento de antes).
  const handleRefazerArte = async (id: string, ajuste: string, ordem?: number) => {
    setPendingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/marketing-posts/${id}/arte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ajuste: ajuste || undefined, ordem }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? `Erro ${res.status}`)
      await fetchPosts()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Falha ao refazer a arte")
    } finally {
      setPendingId(null)
    }
  }

  const handleModalSave = async (values: PostFormValues) => {
    setModalSaving(true)
    setModalError(null)
    const payload = {
      empreendimento_id: values.empreendimento_id || null,
      canal: values.canal,
      formato: values.formato || null,
      copy: values.copy,
      roteiro: values.roteiro || null,
      arte_url: values.arte_url || null,
      scheduled_for: values.scheduled_for || null,
    }
    try {
      const res =
        modal?.mode === "edit"
          ? await fetch(`/api/marketing-posts/${modal.post.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch("/api/marketing-posts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? `Erro ${res.status}`)
      setModal(null)
      await fetchPosts()
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Falha ao salvar o post")
    } finally {
      setModalSaving(false)
    }
  }

  const sugeridos = posts.filter((p) => p.status === "sugerido")
  const aprovados = posts.filter((p) => p.status === "aprovado")
  const publicados = posts.filter((p) => p.status === "publicado")
  const rejeitados = posts.filter((p) => p.status === "rejeitado")

  const sectionTitle = "text-lg font-semibold text-gray-900 dark:text-stone-100"
  const sectionHint = "text-sm text-gray-500 dark:text-stone-400"
  const emptyBox =
    "rounded-lg bg-white p-6 text-center text-sm text-gray-400 shadow-sm dark:bg-stone-900 dark:text-stone-500 dark:ring-1 dark:ring-stone-800"

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-stone-100">Campanhas</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-stone-400">
            Lídia — agente de marketing: sugestões de posts com base na performance real
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setPedidoError(null)
              setModal({ mode: "pedir" })
            }}
            className="rounded-md border border-orange-600 px-4 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-300 dark:border-orange-400 dark:hover:bg-orange-500/10"
          >
            + Novo post
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {generating && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {generating ? "Analisando performance…" : "Gerar sugestões"}
          </button>
        </div>
      </div>

      <CampaignsTabs showAgente showFormularios={showFormulariosTab} />

      {/* Erros de geração/ação com retry */}
      {generateError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          <span>{generateError}</span>
          <button
            onClick={() => void handleGenerate()}
            className="ml-4 shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-400/40 dark:hover:bg-red-500/20"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {actionError}
        </div>
      )}
      {loadError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          <span>{loadError}</span>
          <button
            onClick={() => {
              setLoading(true)
              void fetchPosts()
            }}
            className="ml-4 shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-400/40 dark:hover:bg-red-500/20"
          >
            Recarregar
          </button>
        </div>
      )}

      {/* Story 75-229 — Kit de Marcas (base do futuro "Gerar arte") */}
      <MarcasSection properties={properties} />

      {loading ? (
        <div className="flex items-center justify-center rounded-lg bg-white p-12 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
          <svg className="h-6 w-6 animate-spin text-gray-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Área 1 — Sugestões (fila de aprovação) */}
          <section className="space-y-3">
            <div>
              <h2 className={sectionTitle}>Sugestões — fila de aprovação</h2>
              <p className={sectionHint}>
                Posts aguardando decisão. Aprove, edite ou rejeite — nada é publicado sem você.
              </p>
            </div>
            {sugeridos.length === 0 ? (
              <div className={emptyBox}>
                Nenhuma sugestão pendente. Clique em &quot;Gerar sugestões&quot; para a Lídia analisar a
                performance das campanhas.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {sugeridos.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    actions={
                      <>
                        <button
                          onClick={() => void patchPost(post.id, { status: "aprovado" })}
                          disabled={pendingId === post.id}
                          className={`${actionBtn} bg-green-600 text-white hover:bg-green-700`}
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => {
                            setModalError(null)
                            setModal({ mode: "edit", post })
                          }}
                          disabled={pendingId === post.id}
                          className={`${actionBtn} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => void patchPost(post.id, { status: "rejeitado" })}
                          disabled={pendingId === post.id}
                          className={`${actionBtn} border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-400/40 dark:text-red-300 dark:hover:bg-red-500/10`}
                        >
                          Rejeitar
                        </button>
                        {/* Story 75-255 — um botão POR TELA: refazer a tela 2 não
                            pode destruir a tela 1 já aprovada. */}
                        {post.formato && post.formato !== "reel" &&
                          telasDoPost(post).map((ordem, _i, arr) => (
                            <RefazerArteButton
                              key={`${ordem}-${post.artes?.find((a) => a.ordem === ordem)?.url ?? "sem"}`}
                              busy={pendingId === post.id}
                              ordem={ordem}
                              totalTelas={arr.length}
                              onRefazer={(ajuste) => void handleRefazerArte(post.id, ajuste, ordem)}
                            />
                          ))}
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Área 2 — Publicados (aprovados aguardando + histórico) */}
          <section className="space-y-3">
            <div>
              <h2 className={sectionTitle}>Publicados</h2>
              <p className={sectionHint}>
                Aprovados aguardam a publicação manual (Instagram/Facebook) — depois marque como
                publicado.
              </p>
            </div>
            {aprovados.length === 0 && publicados.length === 0 ? (
              <div className={emptyBox}>Nenhum post aprovado ou publicado ainda.</div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {aprovados.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    actions={
                      <>
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300">
                          Aprovado
                        </span>
                        <button
                          onClick={() => {
                            setModalError(null)
                            setModal({ mode: "edit", post })
                          }}
                          disabled={pendingId === post.id}
                          className={`${actionBtn} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => void patchPost(post.id, { status: "publicado" })}
                          disabled={pendingId === post.id}
                          className={`${actionBtn} bg-orange-600 text-white hover:bg-orange-700`}
                        >
                          Marcar como publicado
                        </button>
                        {/* Story 75-255 — um botão POR TELA: refazer a tela 2 não
                            pode destruir a tela 1 já aprovada. */}
                        {post.formato && post.formato !== "reel" &&
                          telasDoPost(post).map((ordem, _i, arr) => (
                            <RefazerArteButton
                              key={`${ordem}-${post.artes?.find((a) => a.ordem === ordem)?.url ?? "sem"}`}
                              busy={pendingId === post.id}
                              ordem={ordem}
                              totalTelas={arr.length}
                              onRefazer={(ajuste) => void handleRefazerArte(post.id, ajuste, ordem)}
                            />
                          ))}
                      </>
                    }
                  />
                ))}
                {publicados.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    actions={
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-stone-700/50 dark:text-stone-300">
                        Publicado
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Área 3 — Rejeitados (consultáveis, nunca deletados) */}
          {rejeitados.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className={sectionTitle}>Rejeitados</h2>
                <p className={sectionHint}>
                  Fora da fila, mas preservados como aprendizado da Lídia.
                </p>
              </div>
              <div className="grid gap-3 opacity-70 lg:grid-cols-2">
                {rejeitados.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    actions={
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        Rejeitado
                      </span>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modal Pedir à Lídia (caminho principal) — Story 75-239 */}
      {modal?.mode === "pedir" && (
        <PedirLidiaModal
          properties={properties}
          generating={pedidoSaving}
          error={pedidoError}
          onGenerate={(values) => void handlePedido(values)}
          onManual={(values) => {
            setModalError(null)
            // QA 75-239: o texto do pedido vira rascunho da copy — trocar de
            // modo não joga fora o que a pessoa escreveu.
            setModal({
              mode: "create",
              seed: {
                ...EMPTY_FORM,
                empreendimento_id: values.empreendimento_id,
                canal: values.canal,
                formato: values.formato,
                copy: values.pedido,
                scheduled_for: values.scheduled_for,
              },
            })
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* Modal manual / editar */}
      {(modal?.mode === "create" || modal?.mode === "edit") && (
        <PostFormModal
          title={modal.mode === "create" ? "Novo post (manual)" : "Editar post"}
          initial={
            modal.mode === "create"
              ? modal.seed ?? EMPTY_FORM
              : {
                  empreendimento_id: modal.post.empreendimento_id ?? "",
                  canal: modal.post.canal,
                  formato: modal.post.formato ?? "",
                  copy: modal.post.copy,
                  roteiro: modal.post.roteiro ?? "",
                  arte_url: modal.post.arte_url ?? "",
                  scheduled_for: modal.post.scheduled_for ?? "",
                }
          }
          properties={properties}
          canalEditable={true}
          saving={modalSaving}
          error={modalError}
          onSave={(values) => void handleModalSave(values)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
