import { logout } from "@web/app/login/actions"

/**
 * Server Component shown when a logged-in `cliente` has no obra vinculada.
 * Standalone (no layout dependency) — kept intentionally simple per Story 20.1b
 * scope. Story 20.2 will replace/wrap this with the real cliente layout.
 */
export default function SemObraPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-white">
          Nenhuma obra vinculada
        </h1>
        <p className="mb-6 text-sm text-stone-400">
          Sua conta ainda não possui obras associadas. Entre em contato com a
          equipe Trifold para solicitar acesso ao acompanhamento da sua obra.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-stone-500 underline transition-colors hover:text-[#F27A5E]"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  )
}
