/**
 * Story 900-57 · AC6 — a aba Uso, esqueleto honesto.
 *
 * "Leads novos", "conversas ativas" e "mensagens da IA" existem crus nas tabelas do cliente e
 * **não** são consultáveis daqui: nenhuma delas está em `PLATFORM_READABLE_TABLES`, e nem deve
 * estar. A lista concede a TABELA, não a consulta — pôr `leads` nela para exibir um `count`
 * autorizaria, permanentemente, qualquer tela futura a pedir nome e telefone do lead.
 *
 * Some-se a isso que `messages` não tem `org_id` (o escopo é via `conversation_id →
 * conversations.org_id`), e o caminho sancionado de leitura não faz join. O caminho correto é um
 * objeto AGREGADO no banco, que não tem PII para vazar por construção — e ele não existe ainda.
 *
 * Nenhuma consulta a banco nesta rota, de propósito.
 */

export const dynamic = "force-dynamic"

export default function UsoDaEmpresaPage() {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Uso</h2>
      <p className="mt-2 text-sm text-slate-300">
        ○ Medição ausente — nenhum contador por empresa existe hoje.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Depende de um agregado de uso por empresa. Exibir <code>0</code> aqui afirmaria que a
        empresa não teve atividade nenhuma, que é diferente de não termos medido.
      </p>
    </section>
  )
}
