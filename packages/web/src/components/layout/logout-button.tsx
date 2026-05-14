import { logout } from "@web/app/login/actions"

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="mt-1 flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-[12px] text-stone-400 hover:bg-stone-50 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800/60 dark:hover:text-stone-200"
      >
        Sair
      </button>
    </form>
  )
}
