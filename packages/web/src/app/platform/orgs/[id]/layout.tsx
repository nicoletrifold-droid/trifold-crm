/**
 * Story 900-57 · AC1/AC7 — a casca da empresa. A rota que não existia.
 *
 * ## O defeito estrutural que isto corrige
 *
 * Até esta story `/platform/orgs/[id]` **não era rota**. Só existia
 * `/platform/orgs/[id]/integracoes`: uma tela funcional de uma empresa, com um `← Empresas` e
 * nenhum cabeçalho dizendo de quem era aquilo. O caminho do operador era
 * `lista → tela de integrações`, sem nível intermediário. É por isso que o console "parecia uma
 * cópia de uma empresa" — porque, na estrutura, era exatamente isso
 * (`docs/ux/console-plataforma.md` §0 e §1.2).
 *
 * ## A faixa de identidade é o segundo nível da proteção visual
 *
 * A barra escura do topo diz "você está na Trifold". Ela não diz "você está DENTRO da empresa
 * X". Num painel que cria e configura empresas, essa segunda pergunta é a que custa caro errar,
 * e a resposta precisa estar visível na tela inteira — não só na barra. Daí a borda esquerda
 * âmbar (§2.4 do desenho).
 *
 * ## `notFound()` aqui cobre as SEIS abas
 *
 * Layouts do App Router podem chamar `notFound()` durante a renderização, e o efeito é o mesmo
 * de uma page: o 404 mais próximo. Reimplementar "empresa não encontrada" em seis arquivos seria
 * seis chances de esquecer um — e a aba esquecida renderizaria uma tela em branco em vez de 404
 * (AC7).
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { platformQuery } from "@web/lib/tenancy/platform-query"
import { leituraFalhou } from "@web/lib/tenancy/console-visao-geral"
import { FUSO_DO_CONSOLE } from "@web/lib/tenancy/console-leitura"
import { AbasDaEmpresa } from "../_components/abas-da-empresa"

export const dynamic = "force-dynamic"

interface OrgDaCasca {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export default async function EmpresaLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params

  // Só a identidade. `google_oauth_tokens` e `admin_invite_email` continuam sendo lidos pelas
  // páginas que precisam deles — a casca não carrega dado que a casca não desenha.
  const resposta = await platformQuery(
    "organizations",
    "id, name, slug, is_active, created_at",
  ).eq("id", orgId)
  const org = ((resposta.data ?? []) as unknown as OrgDaCasca[])[0]

  // CodeRabbit #547 — o `error` era descartado, e o `?? []` transformava "não consegui ler" em
  // "não existe". Aqui as duas coisas levam ao MESMO destino, e é uma escolha: `notFound()` numa
  // falha de leitura é fail-closed — a tela não afirma nada sobre uma empresa que ela não leu.
  // O que NÃO é aceitável é o inverso: seguir e desenhar `org.name`/`org.is_active` a partir de
  // um objeto que não veio. Ler o `error` explicitamente é o que impede a próxima edição de
  // trocar este `notFound()` por um "empresa sem nome" sem perceber que está afirmando.
  if (leituraFalhou(resposta) || !org) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/orgs" className="text-xs text-slate-400 hover:text-slate-200">
          ← Empresas
        </Link>

        <div className="mt-2 border-l-4 border-amber-500 pl-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-100">{org.name}</h1>
            <span
              className={
                org.is_active
                  ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400"
                  : "rounded bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400"
              }
            >
              {org.is_active ? "ativa" : "inativa"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            <span className="font-mono">{org.slug}</span> · criada em{" "}
            {new Date(org.created_at).toLocaleDateString("pt-BR", { timeZone: FUSO_DO_CONSOLE })} ·{" "}
            {/* "Plano: —" e não a omissão da linha: a lacuna fica visível, e um `0` ou um valor
                inventado seria pior que o travessão (§5 do desenho). */}
            <span className="text-slate-500">Plano: —</span>
          </p>
        </div>
      </div>

      <AbasDaEmpresa orgId={orgId} />

      {children}
    </div>
  )
}
