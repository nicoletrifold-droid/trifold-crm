"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormSchema, Pergunta } from "@web/lib/forms/schema"
import {
  perguntasVisiveis,
  formularioCompleto,
  limparRespostas,
  passoAtual,
  passoCompleto,
  type Respostas,
  type Resposta,
} from "@web/lib/forms/branching"
import { prepararSalvamentoDeRascunho } from "@web/lib/forms/draft-save"
import {
  DDIS,
  DDI_PADRAO,
  formatarTelefone,
  montarTelefone,
  separarTelefone,
} from "@web/lib/forms/phone-mask"
import { AgendaStep } from "./agenda-step"

// Story 75-330 — o executor do formulário público. Uma pergunta por vez.
//
// Toda a DECISÃO (qual é a próxima, se acabou, o que descartar) vem de
// lib/forms/branching.ts, que é puro e testado. Aqui só há tela e rede: o
// projeto não tem jsdom, então nada que decida pode morar neste arquivo.

// ⚠️ GOTCHA Tailwind (já custou uma vez, no campo de telefone da 75-338): a
// base NÃO leva largura. Acrescentar `w-auto` depois de uma base que tem
// `w-full` não estreita nada — quem decide o conflito é a ordem no CSS gerado,
// não a ordem na string de classes. Largura sempre explícita no uso.
const inputBase =
  "rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
const inputCls = `${inputBase} w-full`

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const

interface FormRunnerProps {
  token: string
  schema: FormSchema
}

export function FormRunner({ token, schema }: FormRunnerProps) {
  const [respostas, setRespostas] = useState<Respostas>({})
  // Story 75-336 — o passo pode ter mais de um campo (nome + telefone juntos),
  // então o rascunho virou um mapa por id em vez de um valor só.
  const [rascunhos, setRascunhos] = useState<Respostas>({})
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

  const passo = passoAtual(schema, respostas)
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

  function responder() {
    if (passo.length === 0) return
    if (!passoCompleto(passo, rascunhos)) {
      setErro(
        passo.length > 1 ? "Preencha os campos obrigatórios." : "Esta resposta é obrigatória."
      )
      return
    }
    setErro("")
    const novas: Respostas = { ...respostas }
    for (const p of passo) {
      const v = rascunhos[p.id]
      if (v !== undefined) novas[p.id] = v
    }
    const atualizadas = limparRespostas(schema, novas)
    setRespostas(atualizadas)
    setRascunhos({})
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
      passo,
      rascunhos,
      respostas,
      ultimaAssinatura: ultimoEnviado.current,
    })
    if (!pronto) return
    void salvarParcial(pronto.payload)
  }, [passo, rascunhos, respostas, salvarParcial])

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

  // Rascunhos acompanham o passo da vez. A chave do effect é a lista de ids do
  // passo: mudou de passo, limpa; continuou no mesmo, preserva o que foi digitado.
  const chaveDoPasso = passo.map((p) => p.id).join("|")
  useEffect(() => {
    setRascunhos({})
  }, [chaveDoPasso])

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
            className="mt-6 w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
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
          className="h-full rounded-full bg-orange-500 transition-all duration-300"
          style={{ width: `${progresso}%` }}
        />
      </div>

      {passo.length > 0 ? (
        <div>
          {/* Story 75-336 — `intro` da primeira pergunta do passo é a frase amigável. */}
          {passo[0]?.intro ? (
            <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-stone-300">
              {passo[0].intro}
            </p>
          ) : null}

          <div className="space-y-4">
            {passo.map((p) => (
              <div key={p.id}>
                <label className="block text-sm font-medium text-stone-100">
                  {p.titulo}
                  {p.obrigatoria ? <span className="ml-1 text-orange-400">*</span> : null}
                </label>
                {p.ajuda ? <p className="mt-1 text-xs text-stone-500">{p.ajuda}</p> : null}
                <div className="mt-2">
                  <CampoDaPergunta
                    pergunta={p}
                    valor={rascunhos[p.id] ?? (p.tipo === "multipla" ? [] : "")}
                    onChange={(v) => setRascunhos((atual) => ({ ...atual, [p.id]: v }))}
                    onBlur={salvarRascunho}
                  />
                </div>
              </div>
            ))}
          </div>

          {erro ? <p className="mt-3 text-sm text-red-400">{erro}</p> : null}

          <button
            type="button"
            onClick={responder}
            className="mt-5 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500"
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
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-600 bg-stone-800 text-orange-600 focus:ring-orange-500"
            />
            <span>
              Autorizo o contato da Trifold e o tratamento dos meus dados conforme a{" "}
              <a
                href="/politica-de-privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 underline hover:text-orange-300"
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
            className="mt-5 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                ? "border-orange-500 bg-orange-500/10 text-stone-100"
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
                  ? "border-orange-500 bg-orange-500/10 text-stone-100"
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

  // Story 75-338 — telefone com DDI e máscara, em vez de texto livre.
  if (pergunta.tipo === "telefone") {
    return <CampoTelefone valor={Array.isArray(valor) ? "" : String(valor)} onChange={onChange} onBlur={onBlur} />
  }

  const tipoHtml =
    pergunta.tipo === "email" ? "email" : pergunta.tipo === "numero" ? "number" : "text"

  // Story 75-338 — `autoComplete` deixa o dispositivo oferecer o que ele já
  // sabe. Numa campanha paga isso é conversão: o lead toca na sugestão em vez
  // de digitar o nome inteiro no celular.
  const autoComplete =
    pergunta.campo_contato === "nome"
      ? "name"
      : pergunta.campo_contato === "email" || pergunta.tipo === "email"
        ? "email"
        : undefined

  return (
    <input
      type={tipoHtml}
      value={Array.isArray(valor) ? "" : String(valor)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      autoComplete={autoComplete}
      inputMode={pergunta.tipo === "numero" ? "numeric" : undefined}
      className={inputCls}
      // Sem autoFocus: com dois campos no mesmo passo (Story 75-336) eles
      // brigariam pelo foco, e no celular o teclado subiria sobre o segundo.
    />
  )
}

/**
 * Telefone: seletor de DDI (Brasil pré-selecionado) + número mascarado.
 *
 * O valor que sobe é `+55 (44) 99999-4444` — legível na ficha e, o que importa
 * mais, ainda normalizável pelo `normalizePhoneBR` que a API usa para achar o
 * lead. Há teste amarrando exatamente isso.
 */
function CampoTelefone({
  valor,
  onChange,
  onBlur,
}: {
  valor: string
  onChange: (v: Resposta) => void
  onBlur: () => void
}) {
  const inicial = separarTelefone(valor)
  const [ddi, setDdi] = useState(inicial.ddi || DDI_PADRAO)
  const [nacional, setNacional] = useState(inicial.nacional)

  function aplicar(novoDdi: string, novoNacional: string) {
    const mascarado = formatarTelefone(novoNacional, novoDdi)
    setDdi(novoDdi)
    setNacional(mascarado)
    onChange(montarTelefone(novoDdi, mascarado))
  }

  return (
    <div className="flex gap-2">
      <select
        value={ddi}
        onChange={(e) => aplicar(e.target.value, nacional)}
        onBlur={onBlur}
        aria-label="País"
        className={`${inputBase} w-[7.5rem] shrink-0`}
      >
        {DDIS.map((d) => (
          <option key={d.codigo} value={d.codigo}>
            {d.bandeira} +{d.codigo}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={nacional}
        onChange={(e) => aplicar(ddi, e.target.value)}
        onBlur={onBlur}
        placeholder={ddi === "55" ? "(44) 99999-9999" : "número"}
        // `min-w-0` é o que permite o input encolher dentro do flex: sem ele o
        // conteúdo mínimo o empurra e o select come a linha.
        className={`${inputBase} min-w-0 flex-1`}
      />
    </div>
  )
}
