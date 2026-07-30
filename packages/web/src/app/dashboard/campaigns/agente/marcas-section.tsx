"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@web/lib/supabase/client"
import {
  BRAND_ASSET_IMAGE_TIPOS,
  BRAND_ASSET_LABELS,
  mimeForBrandAssetFile,
} from "@web/lib/marketing/brands"
import type { BrandAssetImageTipo, BrandCor, BrandFonte, MarketingBrandAssetTipo } from "@web/lib/marketing/brands"

// Story 75-229 — Kit de Marcas da aba Agente: identidade por marca (institucional
// + empreendimentos) que alimentará o "Gerar arte". Upload via signed URL
// (convenção 75-208): sign → uploadToSignedUrl → registro JSON.

export interface BrandAsset {
  id: string
  tipo: MarketingBrandAssetTipo
  label: string | null
  file_path: string
  file_url: string
  file_name: string
  file_size: number | null
  created_at: string
}

export interface MarketingBrand {
  id: string
  nome: string
  tipo: "institucional" | "empreendimento"
  property_id: string | null
  cores: BrandCor[]
  fontes: BrandFonte[]
  voz_da_marca: string | null
  diretrizes: string | null
  created_at: string
  properties: { name: string } | { name: string }[] | null
  assets: BrandAsset[]
}

interface PropertyOption {
  id: string
  name: string
}

function brandPropertyName(brand: MarketingBrand): string | null {
  const p = Array.isArray(brand.properties) ? brand.properties[0] : brand.properties
  return p?.name ?? null
}

/** Miniatura do card: logo e, na falta dele, o ícone da marca (75-235). */
function brandThumb(brand: MarketingBrand): BrandAsset | null {
  return (
    brand.assets.find((a) => a.tipo === "logo") ??
    brand.assets.find((a) => a.tipo === "icone") ??
    null
  )
}

// ─── Fontes (Story 75-234) ─────────────────────────────────────────────────

const FONTE_EXT_RE = /\.(ttf|otf|woff2?)$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024

/** family do @font-face da prévia — nunca colide com fonte do sistema. */
function fonteFamily(assetId: string): string {
  return `brand-fonte-${assetId}`
}

/** "Montserrat-SemiBold.ttf" → "Montserrat SemiBold" (sugestão de nome). */
function nomeFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim()
}

/** Linhas com algum conteúdo — o que vai ao servidor no Salvar. */
function cleanFontes(list: BrandFonte[]): BrandFonte[] {
  return list.filter((f) => f.papel.trim() || f.nome.trim() || f.asset_id)
}

/**
 * Solta vínculo com arquivo que não existe mais (excluído por outra via) — sem
 * isso o PATCH devolveria "Arquivo de fonte não encontrado nesta marca" e o
 * Salvar travaria. `known` é a lista EFETIVA de assets (o state pode estar um
 * render atrás quando o upload/exclusão acabou de acontecer).
 */
function sanitizeFontes(list: BrandFonte[], known: BrandAsset[]): BrandFonte[] {
  return list.map((f) => (f.asset_id && !known.some((a) => a.id === f.asset_id) ? { ...f, asset_id: null } : f))
}

// ─── Modal criar/editar marca ──────────────────────────────────────────────

function BrandModal({
  brand,
  properties,
  onClose,
  onSaved,
  onDeleted,
  onAssetsChanged,
  onFontesChanged,
}: {
  brand: MarketingBrand | null
  properties: PropertyOption[]
  onClose: () => void
  onSaved: (brand: MarketingBrand) => void
  onDeleted: (id: string) => void
  /** Upload/exclusão de arquivo persiste NA HORA (independe do Salvar) — o pai
   *  precisa refletir imediatamente, senão fechar no ✕ deixa o card stale e
   *  reabrir "some" com os arquivos (QA 75-229, item 1). */
  onAssetsChanged: (brandId: string, assets: BrandAsset[]) => void
  /** Story 75-234 — o VÍNCULO fonte↔arquivo também persiste na hora (mesmo
   *  motivo do onAssetsChanged: reabrir o modal não pode perder o arquivo). */
  onFontesChanged: (brandId: string, fontes: BrandFonte[]) => void
}) {
  const [nome, setNome] = useState(brand?.nome ?? "")
  const [tipo, setTipo] = useState<"institucional" | "empreendimento">(brand?.tipo ?? "empreendimento")
  const [propertyId, setPropertyId] = useState(brand?.property_id ?? "")
  const [cores, setCores] = useState<BrandCor[]>(brand?.cores ?? [])
  const [fontes, setFontes] = useState<BrandFonte[]>(brand?.fontes ?? [])
  // QA 75-234 (medium 1/3): upload é assíncrono e a usuária continua digitando
  // no meio. `fontes`/`assets` de closure ficam um render atrás e sobrescreviam
  // o que foi digitado (e iam parar no PATCH). Os refs são a fonte da verdade
  // de TODA mutação e de TODO payload de rede — nunca leia o state direto aqui.
  const fontesRef = useRef<BrandFonte[]>(fontes)
  const applyFontes = (
    next: BrandFonte[] | ((prev: BrandFonte[]) => BrandFonte[])
  ): BrandFonte[] => {
    const value = typeof next === "function" ? next(fontesRef.current) : next
    fontesRef.current = value
    setFontes(value)
    return value
  }
  const [voz, setVoz] = useState(brand?.voz_da_marca ?? "")
  const [diretrizes, setDiretrizes] = useState(brand?.diretrizes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [assets, setAssetsRaw] = useState<BrandAsset[]>(brand?.assets ?? [])
  const assetsRef = useRef<BrandAsset[]>(assets)
  // Toda mutação de asset persiste no servidor na hora — propaga ao pai junto.
  // Aceita função pra somar em cima do valor CORRENTE (uploads concorrentes de
  // imagem e de fonte não se atropelam mais — QA 75-234, medium 3).
  const applyAssets = (next: BrandAsset[] | ((prev: BrandAsset[]) => BrandAsset[])): BrandAsset[] => {
    const value = typeof next === "function" ? next(assetsRef.current) : next
    assetsRef.current = value
    setAssetsRaw(value)
    if (brand) onAssetsChanged(brand.id, value)
    return value
  }
  const [assetTipo, setAssetTipo] = useState<BrandAssetImageTipo>("logo")
  const [assetLabel, setAssetLabel] = useState("")
  // Story 75-232 — fila de arquivos escolhidos ANTES de criar a marca
  // Story 75-234 — fonteIndex amarra o arquivo à linha de fonte que o escolheu.
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; tipo: string; label: string; fonteIndex?: number }>>([])
  const [fonteBusyIdx, setFonteBusyIdx] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null)
  const [confirmDeleteBrand, setConfirmDeleteBrand] = useState(false)
  const [deletingBrand, setDeletingBrand] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 🔥 GOTCHA (bug 75-234): NÃO coloque `w-full` na base. No Tailwind v4 a regra
  // `.w-full` é emitida DEPOIS de `.w-28`/`.w-40`, então `${inp} w-40` continuava
  // 100% (a ordem das classes no atributo não importa) — a linha estourava o
  // modal e o campo seguinte saía da tela. Largura vem sempre do uso.
  const inpBase =
    "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
  const inp = `${inpBase} w-full`
  const lbl = "mb-1 block text-xs font-medium text-gray-600 dark:text-stone-400"

  const fonteFaceCss = assets
    .filter((a) => a.tipo === "fonte" && !a.file_url.includes('"'))
    .map((a) => `@font-face{font-family:"${fonteFamily(a.id)}";src:url("${a.file_url}");font-display:swap;}`)
    .join("")

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    setSaving(true)
    try {
      const body = {
        nome,
        tipo,
        property_id: tipo === "empreendimento" ? propertyId || null : null,
        // "#" solto = linha recém-adicionada não preenchida — descarta; hex
        // inválido DIGITADO segue ao server p/ devolver o erro (não some calado).
        cores: cores.filter((c) => c.hex.trim().length > 1),
        fontes: cleanFontes(sanitizeFontes(fontesRef.current, assetsRef.current)),
        voz_da_marca: voz || null,
        diretrizes: diretrizes || null,
      }
      const res = await fetch(brand ? `/api/marketing-brands/${brand.id}` : "/api/marketing-brands", {
        method: brand ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { brand?: MarketingBrand; error?: string }
      if (!res.ok || !data.brand) throw new Error(data.error ?? "Erro ao salvar marca")
      // Story 75-232 — marca recém-criada: sobe a fila escolhida durante a criação.
      let createdAssets: BrandAsset[] = data.brand.assets ?? []
      let brandFinal = data.brand
      const failed: string[] = []
      if (!brand && pendingFiles.length > 0) {
        setUploading(true)
        // Story 75-234 — arquivo de fonte só ganha id agora; o vínculo vai num
        // PATCH depois (o POST não podia referenciar asset inexistente).
        const fonteAssetByIndex = new Map<number, string>()
        for (const p of pendingFiles) {
          try {
            const asset = await uploadOne(data.brand.id, p.file, p.tipo, p.label)
            createdAssets = [...createdAssets, asset]
            if (p.fonteIndex !== undefined) fonteAssetByIndex.set(p.fonteIndex, asset.id)
          } catch (e) {
            failed.push(`${p.file.name} (${e instanceof Error ? e.message : "erro"})`)
          }
        }
        setUploading(false)
        setPendingFiles([])
        if (fonteAssetByIndex.size > 0) {
          const linked = cleanFontes(
            fontesRef.current.map((f, idx) => {
              const assetId = fonteAssetByIndex.get(idx)
              return assetId ? { ...f, asset_id: assetId } : f
            })
          )
          try {
            const patchRes = await fetch(`/api/marketing-brands/${data.brand.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fontes: linked }),
            })
            const patchData = (await patchRes.json().catch(() => ({}))) as { brand?: MarketingBrand; error?: string }
            if (!patchRes.ok || !patchData.brand) throw new Error(patchData.error ?? "erro ao vincular")
            brandFinal = patchData.brand
          } catch (e) {
            // Rollback: asset de fonte sem vínculo não aparece em NENHUMA tela
            // (a grade só mostra imagens) — ficaria preso no bucket. Solta os
            // arquivos e a usuária reanexa pela marca já criada (QA 75-234, 4).
            const orfaos = [...fonteAssetByIndex.values()]
            for (const assetId of orfaos) {
              await deleteAssetRequest(data.brand.id, assetId).catch(() => {})
            }
            createdAssets = createdAssets.filter((a) => !orfaos.includes(a.id))
            failed.push(`vínculo das fontes (${e instanceof Error ? e.message : "erro"}) — reanexe o arquivo da fonte`)
          }
        }
        if (failed.length > 0) {
          window.alert(`A marca foi criada, mas ${failed.length} item(ns) falharam: ${failed.join(", ")}. Reenvie pela própria marca.`)
        }
      }
      onSaved({ ...brandFinal, assets: brand ? (data.brand.assets ?? assetsRef.current) : createdAssets })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar marca")
    } finally {
      setSaving(false)
    }
  }

  // Sobe UM arquivo (sign → uploadToSignedUrl → registro) p/ a marca informada.
  async function uploadOne(brandId: string, file: File, tipo: string, label: string): Promise<BrandAsset> {
    if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" passa de 10 MB`)
    const supabase = createClient()
    const signRes = await fetch(`/api/marketing-brands/${brandId}/assets/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // tipo vai ao sign p/ validar a extensão (imagem × fonte) — Story 75-234.
      body: JSON.stringify({ file_name: file.name, file_size_bytes: file.size, tipo }),
    })
    const signData = (await signRes.json().catch(() => ({}))) as {
      token?: string
      storagePath?: string
      error?: string
    }
    if (!signRes.ok || !signData.token || !signData.storagePath) {
      throw new Error(signData.error ?? `Erro ao preparar envio de "${file.name}"`)
    }
    const { error: upErr } = await supabase.storage
      .from("marketing-brands")
      .uploadToSignedUrl(signData.storagePath, signData.token, file, {
        // Mime pela EXTENSÃO (o navegador erra o de fonte) — assim o bucket não
        // precisa aceitar octet-stream (QA 75-234, item 6).
        contentType: mimeForBrandAssetFile(file.name) ?? file.type ?? "application/octet-stream",
      })
    if (upErr) throw new Error(`Falha no envio de "${file.name}": ${upErr.message}`)
    const regRes = await fetch(`/api/marketing-brands/${brandId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        label: label || null,
        storage_path: signData.storagePath,
        file_name: file.name,
        file_size: file.size,
      }),
    })
    const regData = (await regRes.json().catch(() => ({}))) as { asset?: BrandAsset; error?: string }
    if (!regRes.ok || !regData.asset) throw new Error(regData.error ?? `Erro ao registrar "${file.name}"`)
    return regData.asset
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || uploading) return
    // Story 75-232 — no modo CRIAÇÃO os arquivos entram numa fila local e sobem
    // automaticamente logo após o "Criar marca" (o upload precisa do id da marca).
    if (!brand) {
      const tooBig = Array.from(files).filter((f) => f.size > 10 * 1024 * 1024)
      if (tooBig.length > 0) {
        setError(`${tooBig.map((f) => `"${f.name}"`).join(", ")} passa de 10 MB`)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      setError(null)
      setPendingFiles((prev) => [
        ...prev,
        ...Array.from(files).map((file) => ({ file, tipo: assetTipo, label: assetLabel })),
      ])
      setAssetLabel("")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setUploadMsg(null)
    setError(null)
    setUploading(true)
    let okCount = 0
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadOne(brand.id, file, assetTipo, assetLabel)
        applyAssets((prev) => [...prev, asset])
        okCount++
      }
      setUploadMsg(`${okCount} arquivo(s) enviado(s).`)
      setAssetLabel("") // variação não pode "grudar" na próxima leva (QA 75-230)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no envio")
      if (okCount > 0) setUploadMsg(`${okCount} arquivo(s) enviado(s) antes do erro.`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // Exclusão do arquivo no servidor (linha + objeto do Storage).
  async function deleteAssetRequest(brandId: string, assetId: string) {
    const res = await fetch(`/api/marketing-brands/${brandId}/assets/${assetId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? "Erro ao excluir arquivo")
    }
  }

  // Story 75-234 — grava SÓ as fontes (autosave do vínculo com o arquivo, que
  // sobe/é excluído na hora); PATCH parcial, não toca cores/voz/diretrizes.
  async function persistFontes(brandId: string, next: BrandFonte[], known: BrandAsset[]) {
    const safe = sanitizeFontes(next, known)
    // QA 75-234 (medium 2): manda o MESMO payload do Salvar. Filtrar "linha
    // incompleta" aqui apagaria do banco uma fonte já salva que a usuária
    // estava no meio de reescrever — autosave nunca deleta calado. Se alguma
    // linha estiver incompleta o servidor recusa e quem chamou mostra o erro.
    const res = await fetch(`/api/marketing-brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fontes: cleanFontes(safe) }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? "Erro ao salvar as fontes")
    }
    onFontesChanged(brandId, safe)
  }

  async function handleFonteFile(index: number, file: File | null) {
    if (!file || fonteBusyIdx !== null) return
    if (!FONTE_EXT_RE.test(file.name)) {
      setError(`"${file.name}" não é arquivo de fonte (use .ttf, .otf, .woff ou .woff2)`)
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`"${file.name}" passa de 10 MB`)
      return
    }
    setError(null)
    const nomeAuto = nomeFromFileName(file.name)
    // Modo criação: entra na fila (upload precisa do id da marca) — 75-232.
    if (!brand) {
      setPendingFiles((prev) => [
        ...prev.filter((p) => p.fonteIndex !== index),
        { file, tipo: "fonte", label: fontesRef.current[index]?.papel ?? "", fonteIndex: index },
      ])
      applyFontes((prev) => prev.map((x, j) => (j === index ? { ...x, nome: x.nome.trim() || nomeAuto } : x)))
      return
    }
    setFonteBusyIdx(index)
    try {
      const asset = await uploadOne(brand.id, file, "fonte", fontesRef.current[index]?.papel ?? "")
      const nextAssets = applyAssets((prev) => [...prev, asset])
      // Aplica sobre o valor CORRENTE — o que a usuária digitou durante o upload
      // continua valendo.
      const next = applyFontes((prev) =>
        prev.map((x, j) => (j === index ? { ...x, nome: x.nome.trim() || nomeAuto, asset_id: asset.id } : x))
      )
      try {
        await persistFontes(brand.id, next, nextAssets)
      } catch (err) {
        // Arquivo subiu, vínculo não: o state local já tem o asset_id, então o
        // "Salvar alterações" fecha a conta depois de corrigir a linha.
        setError(
          `Arquivo enviado, mas as fontes não foram salvas: ${err instanceof Error ? err.message : "erro"}. Ajuste a linha e clique em Salvar alterações.`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar a fonte")
    } finally {
      setFonteBusyIdx(null)
    }
  }

  async function handleRemoveFonteFile(index: number) {
    const f = fontesRef.current[index]
    if (!f || fonteBusyIdx !== null) return
    const assetId = f.asset_id
    if (!brand || !assetId) {
      applyFontes((prev) => prev.map((x, j) => (j === index ? { ...x, asset_id: null } : x)))
      return
    }
    setFonteBusyIdx(index)
    setError(null)
    try {
      await deleteAssetRequest(brand.id, assetId)
      const nextAssets = applyAssets((prev) => prev.filter((a) => a.id !== assetId))
      const next = applyFontes((prev) => prev.map((x, j) => (j === index ? { ...x, asset_id: null } : x)))
      await persistFontes(brand.id, next, nextAssets)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover o arquivo da fonte")
    } finally {
      setFonteBusyIdx(null)
    }
  }

  async function handleRemoveFonte(index: number) {
    if (fonteBusyIdx !== null) return
    const assetId = fontesRef.current[index]?.asset_id
    // A fila é indexada por linha: solta a desta e reindexa as de baixo.
    const shiftPending = () =>
      setPendingFiles((prev) =>
        prev
          .filter((p) => p.fonteIndex !== index)
          .map((p) => (p.fonteIndex !== undefined && p.fonteIndex > index ? { ...p, fonteIndex: p.fonteIndex - 1 } : p))
      )
    if (!brand || !assetId) {
      applyFontes((prev) => prev.filter((_, j) => j !== index))
      shiftPending()
      return
    }
    setFonteBusyIdx(index)
    setError(null)
    try {
      await deleteAssetRequest(brand.id, assetId)
      const nextAssets = applyAssets((prev) => prev.filter((a) => a.id !== assetId))
      const next = applyFontes((prev) => prev.filter((_, j) => j !== index))
      shiftPending()
      await persistFontes(brand.id, next, nextAssets)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover a fonte")
    } finally {
      setFonteBusyIdx(null)
    }
  }

  async function handleDeleteAsset(asset: BrandAsset) {
    if (!brand || deletingAssetId) return
    setDeletingAssetId(asset.id)
    setError(null)
    try {
      await deleteAssetRequest(brand.id, asset.id)
      applyAssets(assets.filter((a) => a.id !== asset.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir arquivo")
    } finally {
      setDeletingAssetId(null)
      setConfirmDeleteAssetId(null)
    }
  }

  async function handleDeleteBrand() {
    if (!brand || deletingBrand) return
    setDeletingBrand(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing-brands/${brand.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Erro ao excluir marca")
      }
      onDeleted(brand.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir marca")
      setDeletingBrand(false)
      setConfirmDeleteBrand(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-stone-900 dark:ring-1 dark:ring-stone-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-stone-100">
            {brand ? `Editar marca — ${brand.nome}` : "Nova marca"}
          </h3>
          <button onClick={onClose} disabled={saving} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 disabled:opacity-40 dark:text-stone-500 dark:hover:text-stone-300">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</div>
        )}

        <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Nome <span className="text-red-500">*</span></label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required className={inp} placeholder="Ex.: Vind Residence" />
          </div>
          <div>
            <label className={lbl}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "institucional" | "empreendimento")} className={inp}>
              <option value="empreendimento">Empreendimento</option>
              <option value="institucional">Institucional (empresa)</option>
            </select>
          </div>
          {tipo === "empreendimento" && (
            <div className="col-span-2">
              <label className={lbl}>Empreendimento <span className="text-red-500">*</span></label>
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required className={inp}>
                <option value="">Selecione…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {/* Story 75-230 — cores com papel (Primária/Secundária…), estilo Brand Hub */}
          <div className="col-span-2">
            <label className={lbl}>Cores</label>
            <div className="space-y-2">
              {cores.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#E8856A"}
                    onChange={(e) => setCores((prev) => prev.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)))}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-gray-300 bg-transparent p-0.5 dark:border-stone-700"
                    aria-label={`Cor ${i + 1}`}
                  />
                  <input
                    value={c.hex}
                    onChange={(e) => setCores((prev) => prev.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
                    className={`${inpBase} w-28 flex-none font-mono text-xs uppercase`}
                    placeholder="#E8856A"
                  />
                  <input
                    value={c.nome ?? ""}
                    onChange={(e) => setCores((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                    className={`${inpBase} min-w-0 flex-1`}
                    placeholder="Papel (ex.: Primária)"
                    list="cores-papeis"
                  />
                  <button type="button" onClick={() => setCores((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remover cor"
                    className="shrink-0 text-sm text-gray-400 hover:text-red-500 dark:text-stone-500">✕</button>
                </div>
              ))}
              <datalist id="cores-papeis">
                <option value="Primária" /><option value="Secundária" /><option value="Fundo" /><option value="Texto" /><option value="Destaque" />
              </datalist>
              <button type="button" onClick={() => setCores((prev) => [...prev, { hex: "#", nome: null }])}
                className="text-xs font-medium text-orange-600 hover:underline dark:text-orange-300">
                + Adicionar cor
              </button>
            </div>
          </div>

          {/* Story 75-230 — fontes por papel tipográfico
              Story 75-234 — cada fonte aceita o ARQUIVO (.ttf/.otf/.woff/.woff2) */}
          <div className="col-span-2">
            <label className={lbl}>Fontes</label>
            {/* Prévia com a fonte real — confirma na hora que o arquivo subiu certo. */}
            {fonteFaceCss && <style>{fonteFaceCss}</style>}
            <div className="space-y-2">
              {fontes.map((f, i) => {
                const asset = f.asset_id ? assets.find((a) => a.id === f.asset_id) ?? null : null
                const pending = pendingFiles.find((p) => p.fonteIndex === i) ?? null
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      value={f.nome}
                      onChange={(e) => applyFontes((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                      className={`${inpBase} min-w-0 flex-1`}
                      placeholder="Nome da fonte (ex.: Montserrat)"
                      style={asset ? { fontFamily: `"${fonteFamily(asset.id)}"` } : undefined}
                    />
                    <input
                      value={f.papel}
                      onChange={(e) => applyFontes((prev) => prev.map((x, j) => (j === i ? { ...x, papel: e.target.value } : x)))}
                      className={`${inpBase} w-36 flex-none`}
                      placeholder="Papel (ex.: Título)"
                      list="fontes-papeis"
                    />
                    {asset ? (
                      <span className="flex min-w-0 items-center gap-1 rounded-md bg-gray-100 px-2 py-1.5 text-[11px] text-gray-600 dark:bg-stone-800 dark:text-stone-300">
                        <a href={asset.file_url} target="_blank" rel="noreferrer" className="max-w-[9rem] truncate hover:underline" title={asset.file_name}>
                          {asset.file_name}
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleRemoveFonteFile(i)}
                          disabled={fonteBusyIdx === i}
                          aria-label={`Remover arquivo da fonte ${f.nome || i + 1}`}
                          className="shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-40 dark:text-stone-500"
                        >✕</button>
                      </span>
                    ) : pending ? (
                      <span className="flex min-w-0 items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-[11px] text-gray-500 dark:border-stone-700 dark:text-stone-400">
                        <span className="max-w-[9rem] truncate" title={pending.file.name}>{pending.file.name}</span>
                        <span className="shrink-0 text-gray-400 dark:text-stone-500">(sobe ao criar)</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((p) => p.fonteIndex !== i))}
                          aria-label="Remover arquivo escolhido"
                          className="shrink-0 text-gray-400 hover:text-red-500 dark:text-stone-500"
                        >✕</button>
                      </span>
                    ) : (
                      <label className={`shrink-0 cursor-pointer rounded-md border border-gray-300 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 ${fonteBusyIdx === i ? "pointer-events-none opacity-50" : ""}`}>
                        {fonteBusyIdx === i ? "Enviando…" : "Anexar arquivo"}
                        <input
                          type="file"
                          accept=".ttf,.otf,.woff,.woff2"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null
                            e.target.value = ""
                            void handleFonteFile(i, file)
                          }}
                        />
                      </label>
                    )}
                    <button type="button" onClick={() => void handleRemoveFonte(i)}
                      disabled={fonteBusyIdx === i}
                      aria-label="Remover fonte"
                      className="shrink-0 text-sm text-gray-400 hover:text-red-500 disabled:opacity-40 dark:text-stone-500">✕</button>
                  </div>
                )
              })}
              <datalist id="fontes-papeis">
                <option value="Título" /><option value="Subtítulo" /><option value="Cabeçalho" /><option value="Corpo" /><option value="Legenda" />
              </datalist>
              <button type="button" onClick={() => applyFontes((prev) => [...prev, { papel: "", nome: "", asset_id: null }])}
                className="text-xs font-medium text-orange-600 hover:underline dark:text-orange-300">
                + Adicionar fonte
              </button>
              <p className="text-[11px] text-gray-400 dark:text-stone-500">
                Só o nome já ajuda a Lídia; o arquivo (.ttf, .otf, .woff, .woff2) garante a tipografia exata na arte.
              </p>
            </div>
          </div>
          <div className="col-span-2">
            <label className={lbl}>Voz da marca</label>
            <textarea value={voz} onChange={(e) => setVoz(e.target.value)} rows={3} className={inp} placeholder="Tom de voz, personalidade, como a marca fala…" />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Diretrizes / proibições</label>
            <textarea value={diretrizes} onChange={(e) => setDiretrizes(e.target.value)} rows={3} className={inp} placeholder="O que nunca falar, regras jurídicas, restrições comerciais…" />
          </div>

          <div className="col-span-2 flex items-center justify-between gap-2">
            {brand ? (
              confirmDeleteBrand ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-red-600 dark:text-red-400">Excluir marca e todos os arquivos?</span>
                  <button type="button" onClick={() => void handleDeleteBrand()} disabled={deletingBrand} className="font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-red-400">
                    {deletingBrand ? "Excluindo…" : "Confirmar"}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteBrand(false)} className="text-gray-400 hover:text-gray-600 dark:text-stone-500">Cancelar</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteBrand(true)} className="text-xs text-red-500 hover:text-red-400 dark:text-red-400">
                  Excluir marca
                </button>
              )
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
                {saving ? "Salvando…" : brand ? "Salvar alterações" : "Criar marca"}
              </button>
            </div>
          </div>
        </form>

        {/* Arquivos — upload imediato no edit; no create entram na fila (75-232) */}
        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-stone-800">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-stone-100">Arquivos da marca</h4>
          {!brand && (
            <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">
              Pode escolher os arquivos agora — eles sobem automaticamente quando você clicar em &quot;Criar marca&quot;.
            </p>
          )}
          <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Opções e grupos derivam de BRAND_ASSET_IMAGE_TIPOS: tipo novo
                    aparece na tela sem edição manual (QA 75-235). */}
                <select value={assetTipo} onChange={(e) => setAssetTipo(e.target.value as BrandAssetImageTipo)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100">
                  {BRAND_ASSET_IMAGE_TIPOS.map((t) => (
                    <option key={t} value={t}>{BRAND_ASSET_LABELS[t].singular}</option>
                  ))}
                </select>
                <input
                  value={assetLabel}
                  onChange={(e) => setAssetLabel(e.target.value)}
                  className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  placeholder="Variação (ex.: azul escuro)"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => void handleUpload(e.target.files)}
                  disabled={uploading}
                  className="text-xs text-gray-500 file:mr-2 file:rounded-md file:border-0 file:bg-orange-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-orange-700 dark:text-stone-400"
                />
                {uploading && <span className="text-xs text-gray-400 animate-pulse dark:text-stone-500">Enviando…</span>}
                {uploadMsg && !uploading && <span className="text-xs text-emerald-600 dark:text-emerald-400">{uploadMsg}</span>}
              </div>
              <p className="mt-1 text-[11px] text-gray-400 dark:text-stone-500">PNG, JPG, WEBP ou SVG · máx. 10 MB por arquivo</p>

              {/* Story 75-230 — agrupado por categoria, como o Brand Hub */}
              {BRAND_ASSET_IMAGE_TIPOS.map((grupo) => {
                const doGrupo = assets.filter((a) => a.tipo === grupo)
                if (doGrupo.length === 0) return null
                return (
                  <div key={grupo} className="mt-3">
                    <h5 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">
                      {BRAND_ASSET_LABELS[grupo].plural} ({doGrupo.length})
                    </h5>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {doGrupo.map((a) => (
                    <div key={a.id} className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-stone-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.file_url} alt={a.label ?? a.file_name} className="h-20 w-full bg-gray-50 object-contain dark:bg-stone-800" />
                      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                        {confirmDeleteAssetId === a.id ? (
                          <span className="flex items-center gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => void handleDeleteAsset(a)}
                              disabled={deletingAssetId === a.id}
                              className="font-semibold text-red-500 hover:text-red-400 disabled:opacity-40"
                            >
                              Excluir?
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAssetId(null)}
                              className="text-gray-400 hover:text-gray-600 dark:text-stone-500"
                            >
                              Não
                            </button>
                          </span>
                        ) : (
                          <>
                            <span className="truncate text-[10px] text-gray-500 dark:text-stone-400" title={a.label ? `${a.label} — ${a.file_name}` : a.file_name}>
                              {a.label || a.file_name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAssetId(a.id)}
                              aria-label={`Excluir ${a.file_name}`}
                              className="shrink-0 text-[11px] text-gray-400 hover:text-red-500 dark:text-stone-500"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                    </div>
                  </div>
                )
              })}

              {/* Story 75-232 — fila de arquivos aguardando o "Criar marca".
                  Fontes ficam de fora: aparecem na própria linha (75-234). */}
              {!brand && pendingFiles.some((p) => p.fonteIndex === undefined) && (
                <div className="mt-3">
                  <h5 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-stone-500">
                    Aguardando criação da marca ({pendingFiles.filter((p) => p.fonteIndex === undefined).length})
                  </h5>
                  <ul className="space-y-1">
                    {pendingFiles.map((pf, i) =>
                      pf.fonteIndex !== undefined ? null : (
                      <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 dark:border-stone-700 dark:text-stone-300">
                        <span className="truncate">
                          {pf.file.name}
                          <span className="ml-1 text-gray-400 dark:text-stone-500">
                            ({pf.tipo}{pf.label ? ` · ${pf.label}` : ""})
                          </span>
                        </span>
                        <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Remover ${pf.file.name} da fila`}
                          className="shrink-0 text-gray-400 hover:text-red-500 dark:text-stone-500">✕</button>
                      </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </>
        </div>
      </div>
    </div>
  )
}

// ─── Seção Marcas ──────────────────────────────────────────────────────────

export default function MarcasSection({ properties }: { properties: PropertyOption[] }) {
  const [brands, setBrands] = useState<MarketingBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; brand: MarketingBrand | null }>({ open: false, brand: null })

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing-brands")
      const data = (await res.json().catch(() => ({}))) as { brands?: MarketingBrand[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar marcas")
      setBrands(data.brands ?? [])
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar marcas")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBrands()
  }, [fetchBrands])

  const sectionTitle = "text-lg font-semibold text-gray-900 dark:text-stone-100"
  const sectionHint = "text-sm text-gray-500 dark:text-stone-400"
  const emptyBox =
    "rounded-lg bg-white p-6 text-center text-sm text-gray-400 shadow-sm dark:bg-stone-900 dark:text-stone-500 dark:ring-1 dark:ring-stone-800"

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className={sectionTitle}>Marcas</h2>
          <p className={sectionHint}>
            Kit de identidade por marca — logos, cores, voz e diretrizes que a Lídia usa para criar.
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, brand: null })}
          className="rounded-md border border-orange-600 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:text-orange-300 dark:border-orange-400 dark:hover:bg-orange-500/10"
        >
          + Nova marca
        </button>
      </div>

      {loadError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          <span>{loadError}</span>
          <button
            onClick={() => { setLoading(true); void fetchBrands() }}
            className="ml-4 shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-400/40 dark:hover:bg-red-500/20"
          >
            Recarregar
          </button>
        </div>
      )}

      {loading ? (
        <div className={emptyBox}>Carregando marcas…</div>
      ) : brands.length === 0 && !loadError ? (
        <div className={emptyBox}>
          Nenhuma marca ainda. Crie a marca institucional e uma por empreendimento.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => {
            const logo = brandThumb(brand)
            const propName = brandPropertyName(brand)
            return (
              <button
                key={brand.id}
                onClick={() => setModal({ open: true, brand })}
                className="flex items-center gap-3 rounded-lg bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:bg-stone-900 dark:ring-1 dark:ring-stone-800 dark:hover:ring-stone-700"
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo.file_url} alt={brand.nome} className="h-12 w-12 shrink-0 rounded-md bg-gray-50 object-contain dark:bg-stone-800" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-100 text-lg font-bold text-gray-400 dark:bg-stone-800 dark:text-stone-500">
                    {brand.nome.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-stone-100">{brand.nome}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-stone-400">
                    {brand.tipo === "institucional" ? "Institucional" : propName ?? "Empreendimento"}
                    {" · "}
                    {brand.assets.length} arquivo(s)
                  </p>
                  {brand.cores.length > 0 && (
                    <div className="mt-1.5 flex gap-1">
                      {brand.cores.slice(0, 6).map((c, i) => (
                        <span key={`${c.hex}-${i}`} title={c.nome ?? c.hex} className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {modal.open && (
        <BrandModal
          key={modal.brand?.id ?? "nova"}
          brand={modal.brand}
          properties={properties}
          onClose={() => setModal({ open: false, brand: null })}
          onSaved={(saved) => {
            setBrands((prev) => {
              const exists = prev.some((b) => b.id === saved.id)
              return exists ? prev.map((b) => (b.id === saved.id ? saved : b)) : [...prev, saved]
            })
            // criar → reabre em modo edição pra já subir os arquivos
            setModal((m) => (m.brand ? { open: false, brand: null } : { open: true, brand: saved }))
          }}
          onDeleted={(id) => {
            setBrands((prev) => prev.filter((b) => b.id !== id))
            setModal({ open: false, brand: null })
          }}
          onAssetsChanged={(brandId, assets) => {
            setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, assets } : b)))
            // mantém o modal coerente se remontar (ex.: brand recém-criada)
            setModal((m) => (m.brand && m.brand.id === brandId ? { ...m, brand: { ...m.brand, assets } } : m))
          }}
          onFontesChanged={(brandId, fontes) => {
            setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, fontes } : b)))
            setModal((m) => (m.brand && m.brand.id === brandId ? { ...m, brand: { ...m.brand, fontes } } : m))
          }}
        />
      )}
    </section>
  )
}
