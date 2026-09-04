"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { MoreHorizontal, ShieldCheck } from "lucide-react"
import { LogoutButton } from "./logout-button"
import { resolveSidebarBrand } from "./sidebar-nav-brand"
import { ThemeToggle } from "@web/components/theme-toggle"

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
  /** Story 63-18 — tom do badge: 'orange' (default) ou 'green' (não-lidas do Chat, 63-19). */
  badgeTone?: 'orange' | 'green'
  separator?: boolean
  external?: boolean
}

interface SidebarNavProps {
  items: NavItem[]
  userName: string
  userRole: string
  basePath: string
  alertCount?: number
  /**
   * Story 75-223 (generalizado na 75-286/75-287) — badges "vivos": o layout
   * (server) congela em navegação interna do App Router; cada entrada faz o
   * item de `href` re-buscar a contagem em `endpoint` a cada 60s, ao focar a
   * aba e a cada mudança de rota. Entradas com o MESMO endpoint compartilham
   * UM fetch; a resposta pode ser `{ count }` (vale p/ os hrefs do endpoint)
   * ou `{ counts: { [href]: number } }` (mapa por item, caso do /broker).
   * Falha de fetch mantém os últimos valores daquele endpoint (fail-open).
   */
  liveBadges?: Array<{ href: string; endpoint: string }>
  /**
   * Story 900-56 (defeito da porta de entrada) — o caminho de IDA do CRM para o console de
   * plataforma. `null`/ausente = a pessoa não é platform admin e nada é renderizado.
   *
   * O par `{href,label}` chega PRONTO do servidor (`atalhoDoConsole()` em `lib/platform.ts`) em
   * vez de um booleano com a rota escrita aqui. Este arquivo é `"use client"`: um literal
   * `"/platform"` daqui viajaria no bundle de todo usuário logado, e esconder o item deixaria a
   * rota descobrível assim mesmo. A forma é declarada inline, e não importada de
   * `@web/lib/platform`, porque aquele módulo é `server-only` — só o TIPO poderia atravessar, e
   * um `import` que só não quebra por ser `type` é uma linha a um caractere de virar defeito.
   */
  atalhoDoConsole?: { href: string; label: string } | null
  /**
   * Story 900-64 — a marca da EMPRESA no lugar da Trifold. As duas chegam do layout, que já
   * conhece a org da sessão (`user.orgId`) e já lê `organizations` sob RLS.
   *
   * Opcionais de propósito: um chamador que não as passe (nenhum hoje; medido por
   * `grep -rln "SidebarNav" packages/web/src/app` = `dashboard/layout.tsx` e `broker/layout.tsx`)
   * continua vendo a marca da Trifold, que é o comportamento de HOJE.
   *
   * ⚠️ Fora de escopo, e continua dizendo Trifold para toda empresa: a tela de login (a org só é
   * conhecida DEPOIS de autenticar — não há rota por empresa nem subdomínio) e os e-mails
   * transacionais (10 pontos de chamada passam `orgName` literal, e `password-action.ts` tem a
   * palavra escrita no assunto e no corpo). Ver as seções homônimas da story 900-64.
   */
  orgName?: string | null
  orgLogoUrl?: string | null
}

/**
 * As classes do logo, por superfície e por dono da marca.
 *
 * As duas de `TRIFOLD` são as strings de HOJE, byte a byte — o filtro monocromático foi pensado
 * para a wordmark da Trifold e não pode ser aplicado ao logo colorido de um cliente (nem no tema
 * escuro do celular, que é onde a primeira versão desta story deixava o defeito sobreviver).
 *
 * As duas de `CLIENTE` são TRAVA DE CAIXA, não estética. Medido: o contêiner do desktop é `h-20`
 * (80 px), o do mobile é `h-14` (56 px), o `<Image>` declara `width={143}`/`width={24}`, e o
 * preflight do Tailwind v4 aplica `img { height: auto }` — que vence o atributo `height`. Sem
 * `max-h-*`, um logo de cliente QUADRADO renderiza 143×143 e estoura o cabeçalho, que não tem
 * `overflow-hidden`. Com `w-auto` + `h-auto` + `max-h-*` + `max-w-*`, qualquer proporção cabe e o
 * navegador preserva a razão de aspecto (CSS 2.1 §10.4 para elemento substituído).
 */
const CLASSES_LOGO_TRIFOLD_DESKTOP = "brightness-0 dark:brightness-0 dark:invert"
const CLASSES_LOGO_TRIFOLD_MOBILE = "dark:brightness-0 dark:invert"
const CLASSES_LOGO_CLIENTE_DESKTOP = "h-auto max-h-12 w-auto max-w-full object-contain"
const CLASSES_LOGO_CLIENTE_MOBILE = "h-auto max-h-8 w-auto max-w-32 object-contain"

/** Classe de background do badge numérico conforme `badgeTone`. */
function badgeBg(item: NavItem): string {
  return item.badgeTone === "green" ? "bg-green-700" : "bg-orange-500"
}

export function SidebarNav({ items, userName, userRole, basePath, alertCount, liveBadges, atalhoDoConsole, orgName, orgLogoUrl }: SidebarNavProps) {
  const pathname = usePathname()
  // Story 900-64 — a imagem do cliente pode falhar (URL removida do balde, host fora do
  // `remotePatterns`, rede). O desfecho declarado é a marca da Trifold, nunca espaço vazio: o
  // `onError` liga esta chave e o helper devolve o fallback no render seguinte.
  const [imgFailed, setImgFailed] = useState(false)
  const brand = resolveSidebarBrand({ orgLogoUrl, orgName, imgFailed })
  // Story 63-18 — bottom sheet "Mais" (mobile).
  const [moreOpen, setMoreOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  // Story 75-223/75-286 — contagens vivas dos itens de `liveBadges`. Enquanto
  // um href não tem valor no mapa, vale o valor server-side do item (sem
  // flash). O efeito depende do pathname de propósito: cada navegação refaz
  // os fetches na hora (é o gatilho que zera o badge logo após abrir uma
  // conversa) e reinicia o intervalo. A serialização em `liveKey` mantém a
  // dependência estável (o array vem de um server component).
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({})
  const liveKey = liveBadges?.length ? JSON.stringify(liveBadges) : ""
  useEffect(() => {
    if (!liveKey) return
    const entries = JSON.parse(liveKey) as Array<{ href: string; endpoint: string }>
    // Um fetch por endpoint (75-287): hrefs que apontam pro mesmo endpoint
    // compartilham a resposta.
    const byEndpoint = new Map<string, string[]>()
    for (const { href, endpoint } of entries) {
      byEndpoint.set(endpoint, [...(byEndpoint.get(endpoint) ?? []), href])
    }
    let cancelled = false
    const apply = (updates: Record<string, number>) => {
      if (cancelled || Object.keys(updates).length === 0) return
      setLiveCounts((prev) => {
        const changed = Object.entries(updates).some(([href, n]) => prev[href] !== n)
        return changed ? { ...prev, ...updates } : prev
      })
    }
    const load = () =>
      Promise.all(
        Array.from(byEndpoint, async ([endpoint, hrefs]) => {
          try {
            const res = await fetch(endpoint, { cache: "no-store" })
            if (!res.ok) return
            const json = (await res.json()) as { count?: unknown; counts?: unknown }
            const updates: Record<string, number> = {}
            if (typeof json.count === "number") {
              for (const href of hrefs) updates[href] = json.count
            } else if (json.counts && typeof json.counts === "object") {
              for (const href of hrefs) {
                const n = (json.counts as Record<string, unknown>)[href]
                if (typeof n === "number") updates[href] = n
              }
            }
            apply(updates)
          } catch {
            // fail-open: mantém os últimos valores conhecidos daquele endpoint
          }
        })
      )
    void load()
    const interval = setInterval(() => void load(), 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [liveKey, pathname])

  const badgeCount = (item: NavItem): number | undefined =>
    liveCounts[item.href] ?? item.badge

  const isActive = (href: string) => {
    if (href === basePath) return pathname === basePath
    return pathname.startsWith(href)
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  // Story 63-18 — itens visíveis no bottom bar mobile (4 tabs) vs. ocultos no "Mais".
  const tabItems = items.slice(0, 4)
  const moreItems = items.slice(4)
  const moreHasBadge = moreItems.some((i) => {
    const b = badgeCount(i)
    return b != null && b > 0
  })

  const closeMore = useCallback(() => {
    setMoreOpen(false)
    moreButtonRef.current?.focus()
  }, [])

  // Story 63-18 — focus-trap + Esc enquanto o sheet "Mais" está aberto.
  useEffect(() => {
    if (!moreOpen) return
    const sheet = sheetRef.current
    if (!sheet) return

    const focusable = sheet.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusable[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        closeMore()
        return
      }
      if (e.key === "Tab" && focusable.length > 0) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [moreOpen, closeMore])

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="max-lg:hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-56 lg:flex-col">
        <div className="flex h-full flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
          {/* Logo */}
          <div className="flex h-20 shrink-0 items-center border-b border-stone-100 px-5 dark:border-stone-800">
            <Image
              src={brand.src}
              alt={brand.alt}
              width={143}
              height={143}
              className={brand.isCustom ? CLASSES_LOGO_CLIENTE_DESKTOP : CLASSES_LOGO_TRIFOLD_DESKTOP}
              onError={() => setImgFailed(true)}
            />
          </div>

          {/* Nav Items — scrollable */}
          <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActive(item.href)
                const badge = badgeCount(item)
                return (
                  <li key={item.href}>
                    {item.separator && (
                      <div className="mx-1 mb-1.5 mt-1 border-t border-stone-100 dark:border-stone-800" />
                    )}
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                      >
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                          active
                            ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                            : "text-stone-500 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {badge != null && badge > 0 && !active && (
                          <span aria-hidden="true" className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full ${badgeBg(item)} px-1.5 text-[10px] font-bold text-white`}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                        {item.label === "Alertas" && alertCount != null && alertCount > 0 && !active && (
                          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                            {alertCount > 99 ? "99+" : alertCount}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* User */}
          <div className="shrink-0 border-t border-stone-100 p-3 dark:border-stone-800">
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                {initials}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-[13px] font-medium text-stone-900 dark:text-stone-100">{userName}</p>
                <p className="text-[11px] text-stone-400 capitalize dark:text-stone-500">{userRole}</p>
              </div>
              <ThemeToggle />
            </div>
            {atalhoDoConsole && (
              <Link
                href={atalhoDoConsole.href}
                data-atalho-console="sidebar"
                className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-amber-700 transition-all hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  <ShieldCheck className="h-[18px] w-[18px]" />
                </span>
                <span className="flex-1">{atalhoDoConsole.label}</span>
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur-sm lg:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex items-center gap-2">
          <Image
            src={brand.src}
            alt={brand.alt}
            width={24}
            height={24}
            className={brand.isCustom ? CLASSES_LOGO_CLIENTE_MOBILE : CLASSES_LOGO_TRIFOLD_MOBILE}
            onError={() => setImgFailed(true)}
          />
          {!brand.isCustom && (
            <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">Trifold</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {atalhoDoConsole && (
            <Link
              href={atalhoDoConsole.href}
              data-atalho-console="mobile"
              aria-label={atalhoDoConsole.label}
              title={atalhoDoConsole.label}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-700 dark:text-amber-400"
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
            </Link>
          )}
          <ThemeToggle />
          <LogoutButton />
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-[10px] font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
            {initials}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar — Story 63-18: 4 tabs + botão "Mais" */}
      <nav className="mobile-nav-safe fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-sm lg:hidden dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex items-center justify-around px-1 py-1">
          {tabItems.map((item) => {
            const active = isActive(item.href)
            const badge = badgeCount(item)
            const mobileClass = `flex min-w-[52px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors ${
              active ? "text-orange-600 dark:text-orange-300" : "text-stone-400 dark:text-stone-500"
            }`
            return item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={mobileClass}
              >
                <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={mobileClass}>
                <span className="relative flex h-5 w-5 items-center justify-center">
                  {item.icon}
                  {badge != null && badge > 0 && !active && (
                    <span aria-hidden="true" className={`absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full ${badgeBg(item)} px-1 text-[9px] font-bold text-white`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          {moreItems.length > 0 && (
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-h-[44px] min-w-[52px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-stone-400 dark:text-stone-500"
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <MoreHorizontal className="h-[18px] w-[18px]" />
                {moreHasBadge && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white dark:ring-stone-950" />
                )}
              </span>
              <span className="text-[10px] font-medium">Mais</span>
            </button>
          )}
        </div>
      </nav>

      {/* Story 63-18 — Bottom Sheet "Mais" (mobile only) */}
      {moreOpen && (
        <div className="lg:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={closeMore}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="mobile-nav-safe fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900"
          >
            <div className="mx-auto mt-3 mb-1 h-1 w-8 rounded-full bg-stone-300 dark:bg-stone-600" />
            <ul className="flex flex-col gap-0.5 p-3">
              {moreItems.map((item) => {
                const active = isActive(item.href)
                const badge = badgeCount(item)
                const rowClass = `flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                    : "text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800/60"
                }`
                return (
                  <li key={item.href}>
                    {item.separator && (
                      <div className="mx-1 mb-1 mt-1 border-t border-stone-100 dark:border-stone-800" />
                    )}
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className={rowClass}
                      >
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                      </a>
                    ) : (
                      <Link href={item.href} onClick={() => setMoreOpen(false)} className={rowClass}>
                        <span className="flex h-5 w-5 items-center justify-center">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                        {badge != null && badge > 0 && !active && (
                          <span aria-hidden="true" className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full ${badgeBg(item)} px-1.5 text-[10px] font-bold text-white`}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
