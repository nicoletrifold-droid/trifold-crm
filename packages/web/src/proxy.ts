import { decidirPorHost } from "@web/lib/tenancy/papel-do-host"
import { updateSession } from "@web/lib/supabase/middleware"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Story 900-65 — gate por host, ANTES de `updateSession`.
 *
 * Sem `PLATFORM_ADMIN_HOSTS` no ambiente, `decidirPorHost` devolve `"segue"` para todo host e
 * todo caminho, e a última linha é a única que executa — o comportamento de antes desta story,
 * sem desvio. Ver `lib/tenancy/papel-do-host.ts` para o desenho e a proveniência.
 *
 * O host vem de `request.headers.get("host")`, nunca de `request.nextUrl.hostname`: o segundo
 * pode devolver `localhost` dentro do proxy (doc-fonte §3.1).
 */
export async function proxy(request: NextRequest) {
  const decisao = decidirPorHost({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
  })

  if (decisao.tipo === "bloqueado") {
    // Corpo NU, de propósito. Reescrever para uma rota inexistente e deixar o Next renderizar o
    // `not-found` passaria pelo `layout.tsx` raiz, que é o chrome do Trifold CRM (title,
    // metadata) — vazando a marca de um inquilino no host da plataforma. É o defeito que esta
    // story existe para não criar.
    return new NextResponse(null, {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    })
  }

  if (decisao.tipo === "reescreve") {
    return NextResponse.rewrite(new URL(decisao.para, request.url))
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
