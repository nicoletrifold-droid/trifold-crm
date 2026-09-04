import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"

/**
 * A SEGUNDA porta da frente do produto — irmã de `login/actions.ts`.
 *
 * `login/actions.ts` decide para onde vai quem ACABOU de digitar a senha. Esta rota decide para
 * onde vai quem abre `/` **com sessão viva** — o caso do favorito, do atalho da barra de
 * endereço e da aba reaberta. Como ela só age para quem já tem cookie, ela passa despercebida:
 * a Story 900-56 consertou o roteamento pós-login e este arquivo continuou mandando o operador
 * da plataforma para o CRM de uma empresa cliente.
 *
 * ## Por que `is_platform_admin` vem ANTES do `role`, aqui como lá
 *
 * `users.role` diz o que a pessoa faz DENTRO de uma empresa; `users.is_platform_admin` diz que
 * ela opera a plataforma, ACIMA das empresas. Um valor não implica nada sobre o outro, então a
 * precedência tem que ser DECLARADA — sem isso, o desfecho de quem casa os dois ramos seria
 * decidido pela ordem em que os `if` foram escritos, que é acidente, não decisão.
 *
 * A ordem é a MESMA de `login/actions.ts`, e isso não é estética: duas portas da frente que
 * discordam mandam a mesma pessoa para lugares diferentes conforme o caminho que ela tomou, e
 * ninguém consegue reproduzir o relato de quem reclama.
 *
 * A plataforma vence porque o desfecho é RECUPERÁVEL num sentido só: de `/platform` existe
 * `← Voltar ao CRM`, e de lá o `role` volta a mandar. O caminho inverso é exatamente o defeito
 * que isto conserta — cair no CRM sem porta de volta ao painel.
 *
 * ## Por que a coluna entra NESTA consulta, e não numa segunda
 *
 * É a mesma linha de `users`. Uma segunda consulta abriria a janela em que as duas leituras
 * discordam — e a projeção do PostgREST narrowa o tipo pela string do `select`, então esquecer
 * a coluna aqui é erro de compilação lá embaixo, não silêncio.
 *
 * ⚠️ Este arquivo NÃO usa `platform-guard.ts` nem `platform-query.ts`: os dois são do console e
 * `platform-query-scan.ts` só varre `app/platform/**` e `app/api/platform/**`. A autoridade
 * daqui é `users.is_platform_admin`, lida pela sessão do próprio usuário — a mesma coluna que
 * `lib/platform.ts` e as policies do Epic 78 leem.
 */
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("role, is_platform_admin")
    .eq("auth_id", user.id)
    .single()

  if (appUser?.is_platform_admin === true) {
    redirect("/platform")
  }

  redirect(appUser?.role === "broker" ? "/broker" : "/dashboard")
}
