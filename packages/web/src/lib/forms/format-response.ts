// Story 75-330 (Epic 89) — AC9: as respostas na ficha do lead em texto legível.
//
// O corretor precisa ler "Como pretende pagar? → Financiado", não
// `{"pagamento":"financiado"}`. Traduzir valor→rótulo é decisão (o que fazer com
// opção que sumiu do schema? com pergunta apagada?), então é função pura aqui,
// não JSX espalhado no componente.

import type { FormSchema } from "./schema"
import type { Respostas } from "./branching"

export interface RespostaLegivel {
  perguntaId: string
  titulo: string
  resposta: string
}

/** Rótulo de uma opção, caindo para o próprio valor quando ela não existe mais. */
function rotuloDaOpcao(opcoes: { valor: string; rotulo: string }[] | undefined, valor: string): string {
  return opcoes?.find((o) => o.valor === valor)?.rotulo ?? valor
}

/**
 * Formata as respostas na ORDEM do schema.
 *
 * Regras que valem a pena saber:
 *  - pergunta sem resposta some (não polui a ficha com "—" em série);
 *  - resposta cuja pergunta não existe mais no schema é PRESERVADA, com o id
 *    como título: o formulário é editável em produção e apagar a pergunta não
 *    pode apagar o que o lead respondeu;
 *  - opção removida do schema mostra o valor cru, em vez de sumir.
 */
export function formatarRespostas(schema: FormSchema, respostas: Respostas): RespostaLegivel[] {
  const saida: RespostaLegivel[] = []
  const vistos = new Set<string>()

  for (const pergunta of schema.perguntas) {
    vistos.add(pergunta.id)
    const bruta = respostas[pergunta.id]
    if (bruta === undefined || bruta === null) continue

    let texto: string
    if (Array.isArray(bruta)) {
      if (bruta.length === 0) continue
      texto = bruta.map((v) => rotuloDaOpcao(pergunta.opcoes, String(v))).join(", ")
    } else {
      texto = String(bruta).trim()
      if (!texto) continue
      texto = rotuloDaOpcao(pergunta.opcoes, texto)
    }

    saida.push({ perguntaId: pergunta.id, titulo: pergunta.titulo, resposta: texto })
  }

  // Respostas órfãs (a pergunta foi removida depois que alguém respondeu).
  for (const [id, bruta] of Object.entries(respostas)) {
    if (vistos.has(id) || bruta === undefined || bruta === null) continue
    const texto = Array.isArray(bruta) ? bruta.join(", ") : String(bruta).trim()
    if (!texto) continue
    saida.push({ perguntaId: id, titulo: id, resposta: texto })
  }

  return saida
}
