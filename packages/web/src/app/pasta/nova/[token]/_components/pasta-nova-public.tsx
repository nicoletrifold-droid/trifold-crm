"use client"

import { useRouter } from "next/navigation"
import { PastaWizard, type CreatedPasta } from "@web/components/pastas/pasta-wizard"

// Story 75-146 — cliente da página pública de auto-cadastro. Renderiza o wizard em modo
// público (imobiliária travada, corretor pré-preenchido/editável) no tema claro do
// padrão /pasta/*. Ao criar, redireciona para a UI de upload existente `/pasta/[token]`.
export function PastaNovaPublicClient({
  token,
  imobiliaria,
  corretorDefaults,
}: {
  token: string
  imobiliaria: string
  corretorDefaults: { nome?: string; telefone?: string; email?: string }
}) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <span className="text-lg font-bold tracking-widest text-orange-600">TRIFOLD</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-1 text-center text-2xl font-bold">Cadastro de pasta</h1>
        <p className="mb-6 text-center text-sm text-stone-500">
          Preencha os dados do comprador e anexe os documentos na etapa final.
        </p>
        <PastaWizard
          mode="public"
          submitUrl={`/api/pasta/nova/${token}`}
          lockedImobiliaria={imobiliaria}
          corretorDefaults={corretorDefaults}
          onPublicCreated={(data: CreatedPasta) => router.push(`/pasta/${data.token}`)}
        />
      </main>
    </div>
  )
}
