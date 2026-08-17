/**
 * Story 88-2 (AC5) — a primeira asserção honesta sobre a ENTRADA nomeia um defeito
 * de produção que nenhuma asserção sobre a SAÍDA conseguiria nomear.
 *
 * O INCIDENTE, COM CARIMBO DE TEMPO
 * ---------------------------------
 * 12/08 11:34 a corretora confirma 09h por mensagem · 11:45 o `appointment` nasce às
 * 10:00, já divergente da fala · 16/08 14:16 o lead José pede 14h · 14:20:18.320 o
 * `NICOLE_SLOT_MISMATCH` dispara · 14:20:18.419 a mensagem **sai assim mesmo**, 99 ms
 * depois · 15:27:46 um humano cancela e recria — 67 min de reparo.
 *
 * O bloco `[SISTEMA]` que o modelo recebeu mandava **reconfirmar 10:00**, "se o
 * cliente NÃO pediu para mudar" — e o cliente tinha acabado de pedir, com hora e
 * tudo. **O modelo obedeceu.** É o inverso exato do caso Ronaldo (Epic 87 · CR-7):
 * lá a instrução estava certa e o modelo desobedeceu; aqui o modelo estava certo
 * sobre o mundo e a instrução estava cega.
 *
 * A CAUSA VINCULANTE — E O QUE ELA **NÃO** É
 * ------------------------------------------
 * Não é o `detectRescheduleIntent`. O caso 2 é o controle que mata essa hipótese: com
 * a palavra-chave de remarcação ENXERTADA na frase, o bloco sai **idêntico**.
 *
 * A causa é `parseHour` (`visit-slot.ts:197`) devolver a **PRIMEIRA** hora da frase.
 * O José nomeia a hora da qual está FUGINDO antes da hora que PEDE:
 *
 *     "...justamente ás 10h, da pra ser ... a partir das 14h?"
 *              ↑ o conflito (devolvida)         ↑ o pedido (ignorado)
 *
 * ⇒ `newStartUtc` cai em cima do `appointment` existente ⇒ `differs = false`
 * (`pipeline.ts:950`) ⇒ a cadeia de `else if` escorrega até o último `else`
 * (`pipeline.ts:1014-1017`), cuja premissa é *"o cliente não pediu para mudar"*.
 *
 * **O conserto NÃO mora nesta story** — é o item `88-14`, estreito ao ramo
 * `activeAppointment`, com corpus retrospectivo próprio. Aqui só se NOMEIA.
 *
 * POR QUE QUATRO CASOS, E NÃO UM
 * ------------------------------
 * Com um caso só, esta fixture ficaria **verde** no dia em que alguém acrescentasse
 * `"a partir de"` ao `RESCHEDULE_RE` — **sem o defeito ter sido tocado**. Régua
 * colinear é régua que concorda, não que mede. Os 3 controles quebram a
 * colinearidade entre "o regex não casou" e "o parser pegou a hora errada":
 *
 *   1  José, literal de produção .................. reconfirma 10:00 (o defeito)
 *   2  o mesmo + palavra-chave enxertada .......... IDÊNTICO ⇒ não é o regex
 *   3  o mesmo SEM a hora do conflito ............. REMARCAR 14:00 (o pipeline sabe)
 *   4  o mesmo com "as 10" sem o `h` .............. REMARCAR 14:00 (depende da grafia)
 *
 * E o controle de EFEITO, que é melhor que "o bloco contém REMARCAR": nos casos 1–2 o
 * `scheduled_at` fica **intacto**; nos 3–4 ele **se move**, com `appointments`
 * continuando em uma linha só.
 *
 * 🔴 ESTA FIXTURE NASCE VERDE, E ISSO ESTÁ DITO DE PROPÓSITO
 * ----------------------------------------------------------
 * Ela descreve um defeito **vivo**. Chamá-la de "vermelho comprovado" seria o teatro
 * que esta casa cobra dos outros. O vermelho é real e vem de dois lugares:
 *  (a) o `casoDeDivida` abaixo, que afirma o que o bloco DEVERIA dizer e por isso
 *      **falha hoje** — visível num comando:
 *        AIOS_88_2_SEM_MARCADORES=1 npx vitest run packages/ai/src/chat/pipeline-entrada-do-modelo.test.ts
 *  (b) as mutações do harness (M1a/M1b/M1c/M2), colhidas no Dev Agent Record.
 *
 * 🔴 O CASO 1 É A GUARDA DE VIVACIDADE DO `casoDeDivida` — NÃO É REDUNDANTE
 * ------------------------------------------------------------------------
 * `it.fails` é verde para QUALQUER `throw`, inclusive erro de setup: medido, uma
 * falha de asserção e um `TypeError` de fixture quebrada contam os dois como
 * `expected fail`. Como o `casoDeDivida` roda um `processMessage` inteiro sobre
 * seeds que outras stories estão editando, um seed que mude de forma o deixaria
 * verde **para sempre**. Por isso o **caso 1 roda o MESMO turno, pelo MESMO helper**
 * (`rodarTurnoComVisitaAtiva`) e afirma o bloco: se o turno quebrar, ELE fica
 * vermelho. Remover o caso 1 por parecer redundante cega o marcador de dívida.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { STAGE_IDS } from "@trifold/shared"
import { processMessageWithMetadata } from "./pipeline"
import { createFakeSupabase, type FakeSupabase, type Row } from "./__fixtures__/fake-supabase"
import { criarAnthropicFake, type ChamadaCapturada } from "./__fixtures__/anthropic-harness"

/** Idioma da casa (87-0/87-1): dívida que se apaga sozinha, em vez de `skip` que apodrece. */
const casoDeDivida = process.env.AIOS_88_2_SEM_MARCADORES === "1" ? it : it.fails

const ORG = "org-1"
const CONVERSATION = "conv-88-2"
const LEAD = "lead-88-2"

/** Domingo, 16/08/2026 14:16 BRT — o instante do turno real. "Amanhã" = segunda, 17/08. */
const AGORA = "2026-08-16T17:16:03.242Z"
/** A visita que existia: segunda-feira, 17/08, 10:00 BRT. */
const VISITA_ATUAL = "2026-08-17T13:00:00.000Z"
/** Para onde ela DEVERIA ir: 14:00 BRT do mesmo dia. */
const VISITA_PEDIDA = "2026-08-17T17:00:00.000Z"

/**
 * 🔴 A STRING LITERAL DE PRODUÇÃO, colhida do banco pelo @po
 * (`messages`, `role='user'`, 2026-08-16 14:16:03.242939+00, lead José).
 *
 * Copiada tal e qual: **dois espaços** entre "pra" e "ser", e "ás" com a crase
 * invertida. É o idioma da casa (`88-13`): a paráfrase dá o mesmo resultado HOJE, e
 * no dia em que não der ninguém saberá se o que mudou foi o produto ou a paráfrase.
 *
 * Denominador que justifica o cuidado, medido em produção (60 dias): 1.683 mensagens
 * de lead · 14 com expressão horária · **1** com duas horas na mesma frase — é esta.
 */
const JOSE_LITERAL =
  "Bom dia! Me surgiu um compromisso no trabalho para amanhã justamente ás 10h da pra  ser em algum horário a partir das 14h?"

/**
 * Caso 2 — a MESMA frase com a palavra-chave de remarcação enxertada. Uma variável
 * só muda: a presença do gatilho do `RESCHEDULE_RE`.
 */
const JOSE_COM_PALAVRA_CHAVE = `podemos remarcar? ${JOSE_LITERAL}`

/**
 * Caso 3 — a MESMA frase SEM a hora do conflito. Uma variável só muda: o trecho
 * "justamente ás 10h" sai. Tudo o mais (inclusive os dois espaços) fica.
 */
const JOSE_SEM_A_HORA_DO_CONFLITO = JOSE_LITERAL.replace(" justamente ás 10h", "")

/**
 * Caso 4 — a MESMA frase com "ás 10h" virando "as 10". Uma variável só muda: o
 * marcador `h`. Sem ele o `10` não é lido como hora e o defeito SOME — o que só uma
 * asserção sobre a entrada consegue dizer.
 */
const JOSE_SEM_O_MARCADOR_DE_HORA = JOSE_LITERAL.replace("ás 10h", "as 10")

function seed(): Record<string, Row[]> {
  return {
    conversations: [{ id: CONVERSATION, lead_id: LEAD, org_id: ORG }],
    conversation_state: [
      {
        conversation_id: CONVERSATION,
        collected_data: { name: "José" },
        qualification_step: "floor",
        current_property_id: null,
        visit_proposed: true,
      },
    ],
    leads: [
      {
        id: LEAD,
        name: "José",
        phone: "5544999999999",
        stage_id: STAGE_IDS.visita_agendada,
        assigned_broker_id: "broker-1",
        lost_reason: null,
        ai_summary: null,
        source: "whatsapp_organic",
        qualification_status: "in_progress",
      },
    ],
    // UMA mensagem semeada de propósito: com quatro, `msgCount % 5 == 0` liga o
    // resumo com lastro e aparece uma TERCEIRA chamada — DEPOIS do retorno do turno.
    // Nada aqui afirma total de chamadas, mas seed determinístico é de graça.
    messages: [
      {
        id: "m1",
        conversation_id: CONVERSATION,
        role: "assistant",
        content: "Sua visita está confirmada para segunda-feira às 10h. Te espero lá!",
        created_at: "2026-08-12T14:34:00.000Z",
      },
    ],
    appointments: [
      {
        id: "appt-1",
        lead_id: LEAD,
        org_id: ORG,
        team: "house",
        status: "scheduled",
        scheduled_at: VISITA_ATUAL,
        google_event_id: null,
        broker_id: "broker-1",
      },
    ],
    activities: [],
    lead_facts: [],
    properties: [],
  }
}

interface Turno {
  fake: FakeSupabase
  /** A chamada de RESPOSTA — rotulada pelo harness, não escolhida por ordem. */
  resposta: ChamadaCapturada
  auxiliares: ChamadaCapturada[]
}

function fixarRelogio(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(iso))
}
afterEach(() => {
  vi.useRealTimers()
})

/**
 * O helper ÚNICO do arquivo. O caso 1 e o `casoDeDivida` passam por aqui, e é isso
 * que faz do caso 1 a guarda de vivacidade do marcador (ver cabeçalho).
 */
async function rodarTurnoComVisitaAtiva(mensagemDoLead: string): Promise<Turno> {
  fixarRelogio(AGORA)
  const fake = createFakeSupabase(seed())
  const { anthropic, captura } = criarAnthropicFake({
    resposta: "Claro! Vou verificar aqui pra você.",
  })
  await processMessageWithMetadata({
    supabase: fake as unknown as SupabaseClient,
    anthropic,
    conversationId: CONVERSATION,
    message: mensagemDoLead,
    orgId: ORG,
  })
  return { fake, resposta: captura.resposta(), auxiliares: captura.auxiliares() }
}

function visitas(fake: FakeSupabase): Row[] {
  return fake.table("appointments")
}

// ════════════════════════════════════════════════════════════════════════════
// AC5 — o texto do bloco [SISTEMA] que o modelo RECEBEU, com os 3 controles
// ════════════════════════════════════════════════════════════════════════════

describe("AC5 — o turno do José: o que a Nicole RECEBEU", () => {
  /**
   * (i) CARACTERIZAÇÃO do defeito vivo — nasce VERDE, e isso está escrito.
   * Também é a GUARDA DE VIVACIDADE do `casoDeDivida` (E7).
   */
  it("(i) caso 1 — o bloco manda RECONFIRMAR 10:00, e o pedido de 14h não chega ao modelo", async () => {
    const t = await rodarTurnoComVisitaAtiva(JOSE_LITERAL)

    expect(t.resposta.bloco).toContain("Visita JÁ confirmada para segunda-feira, 17 de agosto às 10:00")
    expect(t.resposta.bloco).toContain("Se o cliente NÃO pediu para mudar nem cancelar, apenas confirme")
    expect(t.resposta.bloco).not.toContain("REMARCAR")
    expect(t.resposta.bloco).not.toContain("14:00")
    // Controle de vivacidade do próprio caso: a mensagem do lead CHEGOU inteira ao
    // modelo. Sem isto, um bloco vazio ou um turno que nem rodou passaria em tudo
    // acima só por não conter as strings proibidas.
    expect(t.resposta.bloco).toContain(JOSE_LITERAL)
  })

  /**
   * (ii) 🔴 O CONTROLE QUE MATA A CAUSA ERRADA. Se a hipótese do
   * `detectRescheduleIntent` valesse, este caso divergiria do caso 1. Ele não diverge.
   */
  it("(ii) caso 2 — com 'podemos remarcar?' enxertado, o bloco é IDÊNTICO: não é o regex", async () => {
    const semPalavraChave = await rodarTurnoComVisitaAtiva(JOSE_LITERAL)
    const comPalavraChave = await rodarTurnoComVisitaAtiva(JOSE_COM_PALAVRA_CHAVE)

    // O bloco é a instrução + a mensagem do lead; a mensagem difere de propósito.
    // O que tem de ser idêntico é a INSTRUÇÃO — o que o pipeline decidiu.
    const soAInstrucao = (bloco: string) => bloco.slice(0, bloco.indexOf("]") + 1)
    expect(soAInstrucao(comPalavraChave.resposta.bloco)).toBe(soAInstrucao(semPalavraChave.resposta.bloco))
    expect(comPalavraChave.resposta.bloco).toContain(
      "Visita JÁ confirmada para segunda-feira, 17 de agosto às 10:00"
    )
    expect(comPalavraChave.resposta.bloco).not.toContain("REMARCAR")
  })

  /** (iii) CONTROLE POSITIVO — a mesma frase sem a hora do conflito. O pipeline SABE fazer certo. */
  it("(iii) caso 3 — sem 'justamente ás 10h', o bloco manda REMARCAR para 14:00", async () => {
    const t = await rodarTurnoComVisitaAtiva(JOSE_SEM_A_HORA_DO_CONFLITO)

    expect(t.resposta.bloco).toContain("REMARCAR")
    expect(t.resposta.bloco).toContain("14:00")
    expect(t.resposta.bloco).not.toContain("Visita JÁ confirmada")
  })

  /** (iv) CONTROLE DE GRAFIA — sem o marcador `h`, o `10` não vira hora e o defeito some. */
  it("(iv) caso 4 — com 'as 10' no lugar de 'ás 10h', o bloco manda REMARCAR para 14:00", async () => {
    const t = await rodarTurnoComVisitaAtiva(JOSE_SEM_O_MARCADOR_DE_HORA)

    expect(t.resposta.bloco).toContain("REMARCAR")
    expect(t.resposta.bloco).toContain("14:00")
    expect(t.resposta.bloco).not.toContain("Visita JÁ confirmada")
  })

  /**
   * (v) 🔴 O MARCADOR DE DÍVIDA. Afirma o que o bloco DEVERIA dizer.
   *
   * Verde hoje **porque falha**; passa a FALHAR no dia em que o `88-14` consertar o
   * `parseHour` — obrigando quem consertar a vir aqui e apagar o marcador. A guarda
   * de vivacidade é o caso 1, no mesmo `describe` e pelo mesmo helper.
   */
  casoDeDivida("(v) DÍVIDA (88-14) — o bloco deveria registrar o pedido de 14h, e não registra", async () => {
    const t = await rodarTurnoComVisitaAtiva(JOSE_LITERAL)

    // O que um bloco honesto diria: o cliente pediu para mudar PARA 14:00.
    expect(t.resposta.bloco).toContain("14:00")
    expect(t.resposta.bloco).not.toContain("apenas confirme")
  })

  /**
   * (vi) O CONTROLE DE EFEITO — intacto × movido.
   *
   * Melhor que "o bloco contém REMARCAR": é o EFEITO no banco, não a instrução. O par
   * é o que prova que a fixture reproduz ESTE incidente e não outra coisa qualquer.
   */
  it("(vi-a) casos 1 e 2 — o `scheduled_at` fica INTACTO, como ficou em produção", async () => {
    for (const mensagem of [JOSE_LITERAL, JOSE_COM_PALAVRA_CHAVE]) {
      const t = await rodarTurnoComVisitaAtiva(mensagem)
      expect(visitas(t.fake)).toHaveLength(1)
      expect(visitas(t.fake)[0]!.scheduled_at).toBe(VISITA_ATUAL)
    }
  })

  it("(vi-b) casos 3 e 4 — o `scheduled_at` SE MOVE para 14:00 BRT, em UMA linha só", async () => {
    for (const mensagem of [JOSE_SEM_A_HORA_DO_CONFLITO, JOSE_SEM_O_MARCADOR_DE_HORA]) {
      const t = await rodarTurnoComVisitaAtiva(mensagem)
      // Uma linha: remarcar MOVE a visita, não cria uma segunda.
      expect(visitas(t.fake)).toHaveLength(1)
      expect(visitas(t.fake)[0]!.scheduled_at).toBe(VISITA_PEDIDA)
    }
  })

  /**
   * 🔴 M2 CONVERTIDA EM CONTROLE — o rótulo DISCRIMINA.
   *
   * O falso verde que já estava documentado no repositório dizia: apontar a asserção
   * para a chamada auxiliar zera o `system` e o teste passa contra string vazia. Aqui
   * ele vira caso: a auxiliar existe, e o que ela carrega **não** é o bloco do turno.
   */
  it("M2 — a chamada AUXILIAR não carrega o bloco [SISTEMA]: é por isso que o rótulo existe", async () => {
    const t = await rodarTurnoComVisitaAtiva(JOSE_LITERAL)

    // A resposta tem `system`; a auxiliar, por definição do rótulo, não.
    expect(t.resposta.system.length).toBeGreaterThan(100)
    for (const aux of t.auxiliares) {
      expect(aux.system).toBe("")
      expect(aux.bloco).not.toContain("Visita JÁ confirmada")
    }
  })
})
