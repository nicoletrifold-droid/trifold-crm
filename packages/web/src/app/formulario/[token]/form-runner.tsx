"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormSchema, Pergunta } from "@web/lib/forms/schema"
import {
  proximaPergunta,
  perguntasVisiveis,
  formularioCompleto,
  limparRespostas,
  type Respostas,
  type Resposta,
} from "@web/lib/forms/branching"
import { prepararSalvamentoDeRascunho } from "@web/lib/forms/draft-save"
import { AgendaStep } from "./agenda-step"

// Story 75-330 — o executor do formulário público. Uma pergunta por vez.
//
// Toda a DECISÃO (qual é a próxima, se acabou, o que descartar) vem de
// lib/forms/branching.ts, que é puro e testado. Aqui só há tela e rede: o
// projeto não tem jsdom, então nada que decida pode morar neste arquivo.

const inputCls =
  "w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const

interface FormRunnerProps {
  token: string
  schema: FormSchema
}

export function FormRunner({ token, schema }: FormRunnerProps) {
  const [respostas, setRespostas] = useState<Respostas>({})
  const [rascunho, setRascunho] = useState<Resposta>("")
  const [lgpd, setLgpd] = useState(false)
  const [erro, setErro] = useState("")
  const [enviando, setEnviando] = useState(false)
  // Story 75-331: `agendaAtiva` decide se a tela final é a mensagem ou a agenda.
  const [concluido, setConcluido] = useState<{ mensagem: string | null; agendaAtiva: boolean } | null>(
    null
  )
  // Story 75-335 — o calendário só aparece DEPOIS do clique em "Agendar". Antes
  // ele abria junto com a mensagem final, e o lead caía numa grade de horários
  // sem ter lido o convite.
  const [abrirAgenda, setAbrirAgenda] = useState(false)
  const sessionToken = useRef<string | null>(null)

  // AC6 — a atribuição vem da URL do anúncio e viaja junto até o lead nascer.
  const utm = useMemo(() => {
    if (typeof window === "undefined") return {}
    const sp = new URLSearchParams(window.location.search)
    const encontrados: Record<string, string> = {}
    for (const k of UTM_KEYS) {
      const v = sp.get(k)
      if (v) encontrados[k] = v
    }
    return encontrados
  }, [])

  const pergunta = proximaPergunta(schema, respostas)
  const visiveis = perguntasVisiveis(schema, respostas)
  const completo = formularioCompleto(schema, respostas)
  const respondidas = visiveis.filter((p) => respostas[p.id] !== undefined).length
  const progresso = visiveis.length > 0 ? Math.round((respondidas / visiveis.length) * 100) : 0

  // Salva o progresso sem finalizar. É o que faz quem abandona no meio virar
  // lead assim mesmo (AC4) — desde que já tenha dado nome e telefone.
  // Story 75-333 — dedupe: o salvamento agora dispara também no blur, e sem
  // isto uma correção de digitação queimaria a cota de 30 req/min POR IP do
  // endpoint público. O próprio lead passaria a ver 429 no meio do
  // preenchimento — uma melhoria de captura virando perda total.
  const ultimoEnviado = useRef<string>("")

  const salvarParcial = useCallback(
    async (respostasAtuais: Respostas) => {
      const assinatura = JSON.stringify(respostasAtuais)
      if (assinatura === ultimoEnviado.current) return
      ultimoEnviado.current = assinatura
      try {
        const res = await fetch(`/api/formulario/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_token: sessionToken.current,
            respostas: respostasAtuais,
            utm,
          }),
        })
        const json = (await res.json()) as { session_token?: string }
        if (json.session_token) sessionToken.current = json.session_token
      } catch {
        // Silencioso de propósito: falha ao salvar o PARCIAL não pode
        // interromper quem está preenchendo. O envio final reporta erro.
      }
    },
    [token, utm]
  )

  function valorPreenchido(v: Resposta): boolean {
    return Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""
  }

  function responder() {
    if (!pergunta) return
    if (pergunta.obrigatoria && !valorPreenchido(rascunho)) {
      setErro("Esta resposta é obrigatória.")
      return
    }
    setErro("")
    const atualizadas = limparRespostas(schema, { ...respostas, [pergunta.id]: rascunho })
    setRespostas(atualizadas)
    setRascunho("")
    void salvarParcial(atualizadas)
  }

  // 🔴 Story 75-333 (AC5) — salva o que foi DIGITADO E NÃO CONFIRMADO.
  //
  // Até aqui o salvamento só rodava dentro de `responder()`, ou seja no clique
  // em "Continuar". Numa campanha paga o caso mais comum é o oposto: a pessoa
  // digita o telefone, hesita e fecha a aba — e era justamente o dado que
  // permite a oferta ativa que se perdia. Pedido do Marcos (17/08): "não posso
  // perder estas informações".
  // A DECISÃO (há rascunho? é diferente do último envio?) vive em
  // lib/forms/draft-save.ts — puro e testado. Aqui só a rede.
  const salvarRascunho = useCallback(() => {
    const pronto = prepararSalvamentoDeRascunho({
      pergunta,
      rascunho,
      respostas,
      ultimaAssinatura: ultimoEnviado.current,
    })
    if (!pronto) return
    void salvarParcial(pronto.payload)
  }, [pergunta, rascunho, respostas, salvarParcial])

  // Fechar/esconder a aba é o momento em que mais se perde: mobile mata a página
  // sem aviso, e `visibilitychange` é o único evento confiável nesse caso
  // (`beforeunload` não dispara em iOS).
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") salvarRascunho()
    }
    document.addEventListener("visibilitychange", aoEsconder)
    return () => document.removeEventListener("visibilitychange", aoEsconder)
  }, [salvarRascunho])

  // Rascunho acompanha a pergunta da vez (múltipla começa como lista).
  useEffect(() => {
    setRascunho(pergunta?.tipo === "multipla" ? [] : "")
  }, [pergunta?.id, pergunta?.tipo])

  async function finalizar() {
    if (!lgpd) {
      setErro("É preciso aceitar a política de privacidade para enviar.")
      return
    }
    setEnviando(true)
    setErro("")
    try {
      const res = await fetch(`/api/formulario/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_token: sessionToken.current,
          respostas,
          utm,
          lgpd_aceito: true,
          finalizar: true,
        }),
      })
      const json = (await res.json()) as {
        error?: string
        mensagem_final?: string | null
        agenda_ativa?: boolean
        session_token?: string
      }
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível enviar. Tente novamente.")
        return
      }
      // A sessão pode ter nascido só agora (quem respondeu tudo antes do primeiro
      // salvamento parcial): sem guardá-la, o passo de agenda não teria o que enviar.
      if (json.session_token) sessionToken.current = json.session_token
      setConcluido({ mensagem: json.mensagem_final ?? null, agendaAtiva: json.agenda_ativa === true })
    } catch {
      setErro("Não foi possível enviar. Verifique sua conexão e tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  if (concluido) {
    // Story 75-331 — com agenda ativa, o fim do formulário é a agenda (D2: ela
    // aparece para TODOS; nada nas respostas a esconde). Sem sessão gravada não
    // há como amarrar a visita ao lead, então cai na mensagem.
    //
    // Story 75-335 — mas primeiro a MENSAGEM com o convite e um botão. Abrir o
    // calendário direto joga o lead numa grade de horários antes de ele saber
    // por que deveria escolher um.
    if (concluido.agendaAtiva && sessionToken.current) {
      if (abrirAgenda) {
        return (
          <AgendaStep
            token={token}
            sessionToken={sessionToken.current}
            mensagemFinal={concluido.mensagem}
          />
        )
      }
      return (
        <div className="text-center">
          <p className="text-3xl">✅</p>
          <h2 className="mt-3 text-lg font-semibold text-stone-100">
            Recebemos suas respostas!
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-300">
            {concluido.mensagem ??
              "Nossa equipe entrará em contato para combinar a visita."}
          </p>
          <button
            type="button"
            onClick={() => setAbrirAgenda(true)}
            className="mt-6 w-full rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Agendar
          </button>
        </div>
      )
    }
    return (
      <div className="text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-3 text-lg font-semibold text-stone-100">Recebemos suas respostas!</h2>
        <p className="mt-2 text-sm text-stone-400">
          {concluido.mensagem ?? "Nossa equipe entrará em contato com você em breve."}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-stone-800">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-300"
          style={{ width: `${progresso}%` }}
        />
      </div>

      {pergunta ? (
        <div>
          <label className="block text-sm font-medium text-stone-100">
            {pergunta.titulo}
            {pergunta.obrigatoria ? <span className="ml-1 text-violet-400">*</span> : null}
          </label>
          {pergunta.ajuda ? <p className="mt-1 text-xs text-stone-500">{pergunta.ajuda}</p> : null}

          <div className="mt-3">
            <CampoDaPergunta
              pergunta={pergunta}
              valor={rascunho}
              onChange={setRascunho}
              onBlur={salvarRascunho}
            />
          </div>

          {erro ? <p className="mt-3 text-sm text-red-400">{erro}</p> : null}

          <button
            type="button"
            onClick={responder}
            className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Continuar
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-base font-semibold text-stone-100">Tudo certo!</h2>
          <p className="mt-1 text-sm text-stone-400">
            Confirme o envio para que nossa equipe entre em contato.
          </p>

          {/* AC7 — aceite explícito, nunca pré-marcado. */}
          <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs text-stone-400">
            <input
              type="checkbox"
              checked={lgpd}
              onChange={(e) => setLgpd(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-600 bg-stone-800 text-violet-600 focus:ring-violet-500"
            />
            <span>
              Autorizo o contato da Trifold e o tratamento dos meus dados conforme a{" "}
              <a
                href="/politica-de-privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline hover:text-violet-300"
              >
                Política de Privacidade
              </a>
              .
            </span>
          </label>

          {erro ? <p className="mt-3 text-sm text-red-400">{erro}</p> : null}

          <button
            type="button"
            onClick={() => void finalizar()}
            disabled={enviando || !completo}
            className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      )}
    </div>
  )
}

function CampoDaPergunta({
  pergunta,
  valor,
  onChange,
  onBlur,
}: {
  pergunta: Pergunta
  valor: Resposta
  onChange: (v: Resposta) => void
  /** Story 75-333 — salva o digitado ao sair do campo, sem esperar "Continuar". */
  onBlur: () => void
}) {
  if (pergunta.tipo === "escolha") {
    return (
      <div className="space-y-2">
        {pergunta.opcoes?.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
              valor === o.valor
                ? "border-violet-500 bg-violet-500/10 text-stone-100"
                : "border-stone-700 bg-stone-800 text-stone-300 hover:border-stone-600"
            }`}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    )
  }

  if (pergunta.tipo === "multipla") {
    const marcados = Array.isArray(valor) ? valor : []
    return (
      <div className="space-y-2">
        {pergunta.opcoes?.map((o) => {
          const ativo = marcados.includes(o.valor)
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() =>
                onChange(ativo ? marcados.filter((m) => m !== o.valor) : [...marcados, o.valor])
              }
              className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                ativo
                  ? "border-violet-500 bg-violet-500/10 text-stone-100"
                  : "border-stone-700 bg-stone-800 text-stone-300 hover:border-stone-600"
              }`}
            >
              {ativo ? "✓ " : ""}
              {o.rotulo}
            </button>
          )
        })}
      </div>
    )
  }

  const tipoHtml =
    pergunta.tipo === "email" ? "email" : pergunta.tipo === "telefone" ? "tel" : pergunta.tipo === "numero" ? "number" : "text"

  return (
    <input
      type={tipoHtml}
      value={Array.isArray(valor) ? "" : String(valor)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      inputMode={pergunta.tipo === "telefone" ? "tel" : pergunta.tipo === "numero" ? "numeric" : undefined}
      className={inputCls}
      autoFocus
    />
  )
}
