/**
 * Story 900-57 · AC6 — a aba Plano, esqueleto honesto.
 *
 * As 6 abas existem desde o primeiro dia para que a forma final da casca fique visível. O que
 * NÃO existe é um número: `plans`, `plan_modules`, `org_module_grants` e `org_subscriptions`
 * somam **zero migrations** — varredura por nome não devolve nenhuma. Um card com "R$ 0,00" ou
 * "plano: gratuito" aqui inventaria um contrato.
 *
 * Nenhuma consulta a banco nesta rota, de propósito: não há o que consultar.
 */

export const dynamic = "force-dynamic"

export default function PlanoDaEmpresaPage() {
  return (
    <section className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plano</h2>
      <p className="mt-2 text-sm text-slate-300">
        ○ Fundação ausente — planos e módulos ainda não existem no sistema.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Depende das tabelas <code>plans</code> / <code>org_subscriptions</code>, que ainda não
        foram criadas. Sem elas não há plano contratado, módulos concedidos nem preço para
        exibir — e nenhum desses três pode ser suposto.
      </p>
    </section>
  )
}
