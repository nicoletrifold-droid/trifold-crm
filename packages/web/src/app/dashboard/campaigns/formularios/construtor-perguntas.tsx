"use client"

import { useState } from "react"
import {
  TIPOS_PERGUNTA,
  CAMPOS_CONTATO,
  problemasParaPublicar,
  type Pergunta,
  type TipoPergunta,
  type CampoContato,
  type FormSchema,
} from "@web/lib/forms/schema"
import {
  TIPO_LABELS,
  aceitaOpcoes,
  moverPergunta,
  candidatasParaCondicao,
  novaPergunta,
  novaOpcao,
  montarSchema,
} from "@web/lib/forms/builder"

// Story 75-334 — o construtor visual de perguntas.
//
// Substitui o textarea de JSON. O formato de ARMAZENAMENTO é o mesmo — muda
// quem escreve. Toda decisão (mover, limpar condição órfã, gerar id) vive em
// lib/forms/builder.ts, testada sem DOM.

const CAMPO_CONTATO_LABELS: Record<CampoContato, string> = {
  nome: "Nome do lead",
  email: "E-mail do lead",
  telefone: "Telefone / WhatsApp",
}

const inputCls =
  "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
const labelCls = "block text-xs font-medium text-stone-600 dark:text-stone-400"
const btnGhost =
  "rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"

export function ConstrutorPerguntas({
  schemaInicial,
  onSalvar,
  salvando,
}: {
  schemaInicial: FormSchema
  onSalvar: (schema: FormSchema) => void
  salvando: boolean
}) {
  const [perguntas, setPerguntas] = useState<Pergunta[]>(schemaInicial.perguntas)
  const [mensagemFinal, setMensagemFinal] = useState(schemaInicial.mensagem_final ?? "")
  const [agendaAtiva, setAgendaAtiva] = useState(schemaInicial.agenda?.ativa === true)
  const [agendaLocal, setAgendaLocal] = useState(schemaInicial.agenda?.local ?? "")
  const [tituloNovo, setTituloNovo] = useState("")
  const [tipoNovo, setTipoNovo] = useState<TipoPergunta>("texto")
  const [aviso, setAviso] = useState("")
  const [verJson, setVerJson] = useState(false)

  const schema = montarSchema({ perguntas, mensagemFinal, agendaAtiva, agendaLocal })
  // AC5 — o que impede publicar aparece AQUI, não no envio do lead.
  const problemas = problemasParaPublicar(schema)

  function atualizar(i: number, patch: Partial<Pergunta>) {
    setPerguntas((atual) => atual.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  function mover(de: number, para: number) {
    const r = moverPergunta(perguntas, de, para)
    setPerguntas(r.perguntas)
    setAviso(
      r.condicoesRemovidas.length
        ? `A condição de "${r.condicoesRemovidas.join('", "')}" foi removida: a pergunta que ela usava passou a vir depois.`
        : ""
    )
  }

  function adicionar() {
    const t = tituloNovo.trim()
    if (!t) return
    setPerguntas((atual) => [...atual, novaPergunta(tipoNovo, t, atual.map((p) => p.id))])
    setTituloNovo("")
    setAviso("")
  }

  return (
    <div className="space-y-4">
      {problemas.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {problemas.join(" ")}
        </p>
      )}
      {aviso && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          {aviso}
        </p>
      )}

      {perguntas.map((p, i) => (
        <div
          key={p.id}
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
        >
          <div className="flex items-start gap-2">
            <span className="mt-2 w-6 shrink-0 text-sm text-stone-400">{i + 1}.</span>
            <div className="min-w-0 flex-1 space-y-3">
              <input
                value={p.titulo}
                onChange={(e) => atualizar(i, { titulo: e.target.value })}
                placeholder="Pergunta que o lead vê"
                className={`${inputCls} font-medium`}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Tipo de resposta</label>
                  <select
                    value={p.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as TipoPergunta
                      atualizar(i, {
                        tipo,
                        // Trocar para um tipo sem opções descarta as opções; para
                        // um tipo com opções, semeia uma (o parse exige ≥1).
                        opcoes: aceitaOpcoes(tipo)
                          ? (p.opcoes?.length ? p.opcoes : [{ valor: "opcao_1", rotulo: "Opção 1" }])
                          : undefined,
                      })
                    }}
                    className={inputCls}
                  >
                    {TIPOS_PERGUNTA.map((t) => (
                      <option key={t} value={t}>
                        {TIPO_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  {/* AC2 — contato é escolha guiada. Digitar "cpf" e descobrir no
                      envio que não existe era o modo de falha antigo. */}
                  <label className={labelCls}>Preenche qual dado do lead?</label>
                  <select
                    value={p.campo_contato ?? ""}
                    onChange={(e) =>
                      atualizar(i, {
                        campo_contato: (e.target.value || undefined) as CampoContato | undefined,
                      })
                    }
                    className={inputCls}
                  >
                    <option value="">— nenhum (só resposta)</option>
                    {CAMPOS_CONTATO.map((c) => (
                      <option key={c} value={c}>
                        {CAMPO_CONTATO_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                value={p.ajuda ?? ""}
                onChange={(e) => atualizar(i, { ajuda: e.target.value || undefined })}
                placeholder="Texto de ajuda (opcional)"
                className={`${inputCls} text-xs`}
              />

              <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                <input
                  type="checkbox"
                  checked={p.obrigatoria === true}
                  onChange={(e) => atualizar(i, { obrigatoria: e.target.checked || undefined })}
                  className="h-4 w-4 rounded"
                />
                Obrigatória
              </label>

              {aceitaOpcoes(p.tipo) && (
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-950/40">
                  <label className={labelCls}>Opções</label>
                  <div className="mt-2 space-y-2">
                    {(p.opcoes ?? []).map((o, oi) => (
                      <div key={o.valor} className="flex items-center gap-2">
                        <input
                          value={o.rotulo}
                          onChange={(e) =>
                            atualizar(i, {
                              opcoes: (p.opcoes ?? []).map((x, xi) =>
                                xi === oi ? { ...x, rotulo: e.target.value } : x
                              ),
                            })
                          }
                          className={`${inputCls} flex-1`}
                        />
                        <input
                          type="number"
                          value={o.peso ?? ""}
                          onChange={(e) =>
                            atualizar(i, {
                              opcoes: (p.opcoes ?? []).map((x, xi) =>
                                xi === oi
                                  ? { ...x, peso: e.target.value === "" ? undefined : Number(e.target.value) }
                                  : x
                              ),
                            })
                          }
                          placeholder="peso"
                          className={`${inputCls} w-20`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            atualizar(i, { opcoes: (p.opcoes ?? []).filter((_, xi) => xi !== oi) })
                          }
                          disabled={(p.opcoes?.length ?? 0) <= 1}
                          className={btnGhost}
                          title={
                            (p.opcoes?.length ?? 0) <= 1
                              ? "Uma escolha precisa de ao menos uma opção"
                              : "Remover opção"
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      atualizar(i, {
                        opcoes: [...(p.opcoes ?? []), novaOpcao(`Opção ${(p.opcoes?.length ?? 0) + 1}`, p.opcoes ?? [])],
                      })
                    }
                    className={`${btnGhost} mt-2`}
                  >
                    + Opção
                  </button>
                  {/* AC6 — peso explicado onde é usado, senão vira número mágico. */}
                  <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                    <strong>Peso</strong> alimenta o score do lead (0–100). Hoje ele é só
                    registrado — não esconde perguntas nem muda o destino do lead.
                  </p>
                </div>
              )}

              {/* AC3 — condição em português, com candidatas limitadas às anteriores. */}
              {candidatasParaCondicao(perguntas, i).length > 0 && (
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-950/40">
                  <label className={labelCls}>Quando mostrar esta pergunta</label>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-stone-600 dark:text-stone-400">Só mostrar se</span>
                    <select
                      value={p.condicoes?.[0]?.pergunta ?? ""}
                      onChange={(e) => {
                        const alvo = e.target.value
                        if (!alvo) return atualizar(i, { condicoes: undefined })
                        atualizar(i, { condicoes: [{ pergunta: alvo, em: [] }] })
                      }}
                      className={`${inputCls} w-auto`}
                    >
                      <option value="">— sempre mostrar</option>
                      {candidatasParaCondicao(perguntas, i).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.titulo}
                        </option>
                      ))}
                    </select>
                    {p.condicoes?.[0] && (
                      <>
                        <span className="text-stone-600 dark:text-stone-400">for</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(perguntas.find((x) => x.id === p.condicoes![0]!.pergunta)?.opcoes ?? []).map(
                            (o) => {
                              const marcado = p.condicoes![0]!.em.includes(o.valor)
                              return (
                                <button
                                  key={o.valor}
                                  type="button"
                                  onClick={() => {
                                    const em = marcado
                                      ? p.condicoes![0]!.em.filter((v) => v !== o.valor)
                                      : [...p.condicoes![0]!.em, o.valor]
                                    atualizar(i, {
                                      condicoes: [{ pergunta: p.condicoes![0]!.pergunta, em }],
                                    })
                                  }}
                                  className={`rounded-full px-2.5 py-1 text-xs ${
                                    marcado
                                      ? "bg-violet-600 text-white"
                                      : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
                                  }`}
                                >
                                  {o.rotulo}
                                </button>
                              )
                            }
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-1">
              <button type="button" onClick={() => mover(i, i - 1)} disabled={i === 0} className={btnGhost}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(i, i + 1)}
                disabled={i === perguntas.length - 1}
                className={btnGhost}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  setPerguntas((atual) => atual.filter((_, idx) => idx !== i))
                  setAviso("")
                }}
                className={btnGhost}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-dashed border-stone-300 p-4 dark:border-stone-700">
        <label className={labelCls}>Nova pergunta</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={tituloNovo}
            onChange={(e) => setTituloNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
            placeholder="Ex.: Como pretende pagar?"
            className={`${inputCls} min-w-[220px] flex-1`}
          />
          <select
            value={tipoNovo}
            onChange={(e) => setTipoNovo(e.target.value as TipoPergunta)}
            className={`${inputCls} w-auto`}
          >
            {TIPOS_PERGUNTA.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={adicionar}
            disabled={!tituloNovo.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900">
        <div className="sm:col-span-2">
          <label className={labelCls}>Mensagem final (depois do envio)</label>
          <input
            value={mensagemFinal}
            onChange={(e) => setMensagemFinal(e.target.value)}
            placeholder="Recebemos suas respostas! Nossa equipe entra em contato."
            className={inputCls}
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
            <input
              type="checkbox"
              checked={agendaAtiva}
              onChange={(e) => setAgendaAtiva(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Oferecer agenda no fim
          </label>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Ligado, o lead marca a visita e o horário é bloqueado na hora.
          </p>
        </div>
        <div>
          <label className={labelCls}>Decorado</label>
          <input
            value={agendaLocal}
            onChange={(e) => setAgendaLocal(e.target.value)}
            placeholder="Ex.: Decorado Vind (vazio = o lead escolhe)"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onSalvar(schema)}
          disabled={salvando}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar perguntas"}
        </button>
        {/* AC7 — o JSON continua acessível, recolhido, para suporte e depuração. */}
        <button type="button" onClick={() => setVerJson((v) => !v)} className={btnGhost}>
          {verJson ? "Ocultar JSON" : "Ver JSON"}
        </button>
      </div>

      {verJson && (
        <pre className="overflow-x-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-200">
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  )
}
