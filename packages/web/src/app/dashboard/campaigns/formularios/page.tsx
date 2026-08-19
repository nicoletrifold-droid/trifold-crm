import { notFound } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { resolverAcessoCampanhas } from "@web/lib/campaigns/access"
import { createAdminClient } from "@web/lib/supabase/admin"
import { montarLinhas, abandonoPorPergunta, type RespostaCrua } from "@web/lib/forms/response-list"
import { CampaignsTabs } from "../_components/campaigns-tabs"
import { FormulariosClient, type FormularioRow } from "./formularios-client"
import { RespostasBase } from "./respostas-base"

// Story 75-333 (Epic 89) — aba "Formulários" de Campanhas.
//
// Duas seções: as PERGUNTAS (config que veio de `configuracoes/formularios`,
// onde era inalcançável — nada linkava para ela) e a BASE de respostas.
//
// 🔴 GATE EXPLÍCITO, e isso é deliberado. O `NAV_MODULE_MAP` do layout
// (`app/dashboard/layout.tsx:73`) só filtra o SIDEBAR — nenhuma rota sob
// /dashboard/campaigns tem gate de servidor, então quem tem o módulo desligado
// não vê o menu mas abre a tela pela URL. Nas outras abas isso é discutível;
// aqui é inaceitável, porque esta tela lista TELEFONE de lead e texto livre que
// a pessoa escreveu. Esconder do menu não é bloquear.

export const dynamic = "force-dynamic"

const POR_PAGINA = 50

export default async function FormulariosPage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string; status?: string; pagina?: string }>
}) {
  const user = await getServerUser()
  // Story 75-344 — o gate desta tela é o SUB-MÓDULO. `canAccess` herda do módulo
  // pai quando o perfil não tem linha explícita, então quem já entrava continua
  // entrando; o que muda é que agora existe uma chave só desta aba, e o Marcos a
  // liga para gerente-comercial e SDR pela tela de Perfil de Acesso.
  const acesso = await resolverAcessoCampanhas(user.id, user.orgId)
  if (!acesso.formularios) notFound()

  const filtros = await searchParams
  const pagina = Math.max(1, Number(filtros.pagina) || 1)
  const admin = createAdminClient()

  const { data: formsData } = await admin
    .from("lead_forms")
    .select("id, nome, token, schema, is_active, created_at")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
  const formularios = (formsData ?? []) as FormularioRow[]

  // A base: completas, parciais e as SEM lead. `lead_id` nulo é caso de
  // primeira classe aqui — é a resposta que o pedido do Marcos nomeia.
  let query = admin
    .from("lead_form_responses")
    .select(
      "id, answers, score, status, created_at, completed_at, metadata, lead_id, lead_forms(nome, schema), leads(name, phone)",
      { count: "exact" }
    )
    .eq("org_id", user.orgId)

  if (filtros.form) query = query.eq("form_id", filtros.form)
  if (filtros.status === "completa") query = query.eq("status", "completa")
  if (filtros.status === "nao_terminou") query = query.eq("status", "parcial").not("lead_id", "is", null)
  if (filtros.status === "sem_contato") query = query.eq("status", "parcial").is("lead_id", null)

  // AC9 — pagina. O projeto já apanhou do teto de 1000 linhas do PostgREST em
  // três telas; `.range()` exige ordenação por coluna ÚNICA para não repetir nem
  // pular registro entre páginas — `created_at` empata, `id` não.
  const de = (pagina - 1) * POR_PAGINA
  const { data: respostasData, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(de, de + POR_PAGINA - 1)

  const linhas = montarLinhas((respostasData ?? []) as unknown as RespostaCrua[])
  const abandono = abandonoPorPergunta(linhas)
  const total = count ?? linhas.length

  return (
    <div>
      {/* 🔴 `showAgente` PRECISA da capability real. Passar `false` fixo aqui fazia a
          aba "Lídia" DESAPARECER ao entrar em Formulários — exatamente a falha
          silenciosa que o cabeçalho do CampaignsTabs descreve, só que por valor
          em vez de por cópia. */}
      <CampaignsTabs
        showAgente={acesso.agente}
        showFormularios={acesso.formularios}
        showModuloCampanhas={acesso.modulo}
      />

      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Formulários</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          O link público vai no anúncio. Tudo que for preenchido fica guardado — inclusive de
          quem não terminou.
        </p>
      </div>

      <RespostasBase
        linhas={linhas}
        abandono={abandono}
        formularios={formularios.map((f) => ({ id: f.id, nome: f.nome }))}
        filtroForm={filtros.form ?? ""}
        filtroStatus={filtros.status ?? ""}
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={total}
      />

      <div className="mt-10 border-t border-stone-200 pt-6 dark:border-stone-800">
        <h2 className="mb-1 text-lg font-semibold text-stone-900 dark:text-stone-100">Perguntas</h2>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          Editar aqui muda o formulário no ar, sem deploy.
        </p>
        <FormulariosClient formularios={formularios} podeEditar />
      </div>
    </div>
  )
}
