/**
 * Story 900-65 · Gate por host do console de plataforma — **a decisão, como função pura**.
 *
 * ## Origem da decisão de mecanismo
 *
 * `docs/architecture/admin-saas-isolamento-por-host.md` (2026-08-31, @architect) avaliou quatro
 * mecanismos de isolamento (`rewrites()` do `next.config.ts`, app separado `packages/admin`,
 * `vercel.json` com `has: host`, e gate no `proxy.ts`) e recomendou o quarto — §0 e §3.1. Este
 * arquivo é a conversão daquela recomendação em código; ele **não** redecide o mecanismo.
 *
 * Os três motivos que ganharam, resumidos para quem só ler aqui:
 * 1. A regra é uma **função pura** que o `vitest` executa **antes** do merge. Nenhum dos outros
 *    três mecanismos é exercitado por teste nenhum.
 * 2. Ativação e reversão são uma **variável de ambiente**, não um deploy de código — o merge pode
 *    acontecer semanas antes de qualquer host existir, inerte.
 * 3. Roda **antes** de `updateSession`: caminho bloqueado devolve 404 sem tocar o Supabase.
 *
 * ## O que este gate NÃO é
 *
 * **Não é fronteira de autorização.** A autorização do console continua inteira em
 * `./platform-guard.ts` (`requirePlatformAdmin()` no layout, `getPlatformAdmin()` nos handlers),
 * e a Story 900-65 não tocou uma linha de lá. Este gate entrega **fronteira de produto** (o host
 * `admin.…` serve o console, e só) e **redução de superfície**. Quem tratá-lo como autorização vai
 * concluir que "o painel agora está protegido", que é falso — ver o doc-fonte §5.1 e §5.3.
 *
 * ## Inerte por omissão
 *
 * Sem `PLATFORM_ADMIN_HOSTS` no ambiente — o estado de **todos** os ambientes reais nesta data —
 * o conjunto de hosts admin é vazio, `papelDoHost()` devolve `"app"` para todo host, e
 * `decidirPorHost()` devolve `"segue"` sem nunca consultar a allowlist. O `proxy.ts` chama
 * `updateSession` para 100% das requisições, exatamente como antes desta story.
 */

/**
 * **EXCEÇÃO NOMEADA** — hosts que servem o CRM de um inquilino e que **nunca** podem ser
 * promovidos a host de console, nem que `PLATFORM_ADMIN_HOSTS` mande.
 *
 * ## Por que a lista existe
 *
 * O argumento de segurança desta story é "reversível por variável de ambiente, sem deploy". Ele
 * cobre *"liguei e quero desligar"*. Ele **não** cobre *"liguei com o valor errado"* — e o valor
 * errado aqui tem desfecho catastrófico: com `crm.trifold.eng.br` dentro de
 * `PLATFORM_ADMIN_HOSTS`, o deny-by-default de {@link decidirNoHostAdmin} passa a responder
 * `"bloqueado"` para as **326 rotas de API e 138 páginas** que vivem fora de `/platform`, e o CRM
 * inteiro da Trifold responde 404. Uma variável digitada errada derrubaria o host que
 * `docs/architecture/whitelabel-e-migracao-jud.md` (§4.2/§4.4) diz que **nunca** pode ser
 * aposentado — PWA instalado, assinaturas de push e o logo absoluto de todo e-mail já entregue
 * apontam para ele.
 *
 * ## Mesma classe de `./trifold-org.ts`
 *
 * É uma exceção nomeada com casa certa e cabeçalho de proveniência, não um literal solto — o
 * padrão que a Story 900-23 estabeleceu. E, como aquela, tem prazo: ela some no dia em que os
 * hosts de inquilino vierem do banco (`organizations`), e não de uma constante.
 *
 * ## Como um host entra aqui
 *
 * Todo host de produção que sirva o CRM de uma organização. Hoje há um.
 */
export const HOSTS_DE_TENANT: readonly string[] = ["crm.trifold.eng.br"]

/** O que o gate decide para uma requisição. */
export type DecisaoDeHost =
  | { tipo: "segue" }
  | { tipo: "reescreve"; para: string }
  | { tipo: "bloqueado" }

/** O papel que um host cumpre neste deployment. */
export type PapelDeHost = "admin" | "app"

/**
 * O host, minúsculo e sem porta.
 *
 * O cabeçalho `Host` chega como `exemplo.com`, `exemplo.com:3000` ou, em IPv6, `[::1]:3000`.
 * A porta sai porque `admin.judtecnologia.com.br:443` e `admin.judtecnologia.com.br` são o mesmo
 * host, e ninguém escreve a porta na variável de ambiente.
 *
 * O que **não** é normalizado: ponto final de FQDN (`exemplo.com.`) e formas Unicode/punycode.
 * As duas deixam o host **não** casar com `PLATFORM_ADMIN_HOSTS` — ou seja, caem em `"app"`, o
 * lado seguro. Normalizá-las só importaria para deixar o gate mais fácil de LIGAR, nunca para
 * impedir que ele ligue por engano.
 */
export function normalizarHost(host: string | null | undefined): string {
  const bruto = (host ?? "").trim().toLowerCase()
  if (bruto.startsWith("[")) {
    const fim = bruto.indexOf("]")
    return fim < 0 ? bruto : bruto.slice(0, fim + 1)
  }
  const doisPontos = bruto.indexOf(":")
  return doisPontos < 0 ? bruto : bruto.slice(0, doisPontos)
}

/**
 * Os hosts declarados em `PLATFORM_ADMIN_HOSTS`, normalizados, sem os hosts de inquilino.
 *
 * Lido por **notação de colchete**, nunca `process.env.X`: é o padrão já estabelecido em
 * `../supabase/middleware.ts` (linhas 36-47) para variável lida em edge/proxy, onde a notação de
 * ponto é alvo de inlining estático no build da Vercel. E lido **a cada chamada**, sem cache de
 * módulo: um valor congelado na primeira importação tornaria o gate dependente da ordem de
 * carregamento dos módulos, e faria as réguas medirem o estado do primeiro teste.
 */
function hostsAdminDeclarados(): Set<string> {
  const cru = process.env["PLATFORM_ADMIN_HOSTS"] ?? ""
  const hosts = new Set<string>()
  for (const parte of cru.split(",")) {
    const host = normalizarHost(parte)
    if (host === "") continue
    if (HOSTS_DE_TENANT.includes(host)) {
      // Audível de propósito. Descartar em silêncio transformaria um erro de configuração em
      // "o console admin simplesmente não liga", sem ninguém saber por quê — e o operador
      // procuraria o defeito no DNS, no certificado e no build antes de olhar para a variável.
      console.error("[900-65] host de tenant recusado em PLATFORM_ADMIN_HOSTS", { host })
      continue
    }
    hosts.add(host)
  }
  return hosts
}

/**
 * O papel do host: `"admin"` só para host declarado em `PLATFORM_ADMIN_HOSTS` e que **não** seja
 * host de inquilino. Todo o resto — inclusive `null`, vazio e a variável ausente — é `"app"`.
 *
 * A comparação é insensível a maiúsculas dos dois lados (host e variável), porque o cabeçalho
 * `Host` não é normalizado por ninguém no caminho e a variável é digitada por um humano.
 */
export function papelDoHost(host: string | null | undefined): PapelDeHost {
  const normalizado = normalizarHost(host)
  if (normalizado === "") return "app"
  return hostsAdminDeclarados().has(normalizado) ? "admin" : "app"
}

/** `pathname` é exatamente `prefixo` ou está sob ele. `/platformx` não está sob `/platform`. */
function sobOPrefixo(pathname: string, prefixo: string): boolean {
  return pathname === prefixo || pathname.startsWith(prefixo + "/")
}

/**
 * A decisão para uma requisição **que já se sabe estar num host admin**.
 *
 * **Allowlist, deny-by-default**: tudo que não estiver listado abaixo é `"bloqueado"`. É a única
 * forma que envelhece bem — a rota nº 465, criada amanhã por outra story, nasce negada no host
 * admin sem que ninguém precise lembrar de negá-la. Uma blocklist esqueceria uma das 464.
 *
 * A raiz `/` é **reescrita** para `/platform`, não redirecionada: um `307` anunciaria a quem
 * observa de fora que existe outra árvore de rotas atrás deste host.
 */
export function decidirNoHostAdmin(input: { pathname: string }): DecisaoDeHost {
  const { pathname } = input

  if (pathname === "/") return { tipo: "reescreve", para: "/platform" }

  if (sobOPrefixo(pathname, "/platform")) return { tipo: "segue" }
  if (sobOPrefixo(pathname, "/api/platform")) return { tipo: "segue" }
  if (pathname === "/login") return { tipo: "segue" }
  if (sobOPrefixo(pathname, "/auth")) return { tipo: "segue" }
  if (pathname === "/reset-senha") return { tipo: "segue" }
  if (pathname === "/favicon.ico") return { tipo: "segue" }

  return { tipo: "bloqueado" }
}

/**
 * A decisão completa do gate: host + caminho.
 *
 * O `return` antecipado do papel `"app"` é a garantia de retrocompatibilidade inteira desta story
 * (AC9): num host que não é admin, {@link decidirNoHostAdmin} **não é consultada**, e por isso
 * nenhuma mudança futura na allowlist pode alcançar o CRM de um inquilino. A régua C3 de
 * `papel-do-host.test.ts` mede essa não-consulta pela divergência: para as mesmas rotas em que
 * `decidirNoHostAdmin` responderia `"bloqueado"`, esta função responde `"segue"`.
 */
export function decidirPorHost(input: { host: string | null | undefined; pathname: string }): DecisaoDeHost {
  if (papelDoHost(input.host) === "app") return { tipo: "segue" }
  return decidirNoHostAdmin({ pathname: input.pathname })
}

/**
 * Para onde vai um usuário **já logado** que revisita `/login`.
 *
 * Extraída de `../supabase/middleware.ts` (o bounce de `if (user && pathname === "/login")`), que
 * sempre apontou para `/dashboard`. No host admin isso caía em 404, porque `/dashboard` está
 * bloqueado lá — o operador de plataforma ficava sem porta de entrada.
 *
 * É função exportada, e não um parâmetro dentro do `middleware.ts`, porque o bounce só é
 * alcançável de dentro de `updateSession`, que exige `NextRequest`/`NextResponse` reais. Sem a
 * extração, a régua C5 nasceria sem carrasco.
 *
 * No papel `"app"` o destino continua `/dashboard`, byte a byte igual ao de antes desta story.
 */
export function destinoDoBounceDeLogin(papel: PapelDeHost): string {
  return papel === "admin" ? "/platform" : "/dashboard"
}
