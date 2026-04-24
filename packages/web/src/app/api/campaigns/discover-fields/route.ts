import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import {
  getFormsClient,
  findFormIdByTitle,
  type OAuthTokens,
} from "@web/lib/google"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function suggestMapping(title: string): string {
  const t = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (/nome\s*(completo)?/.test(t)) return "name"
  if (/whatsapp|telefone|celular|fone/.test(t)) return "phone"
  if (/e-?mail/.test(t)) return "email"

  return `custom:${slugify(title)}`
}

/**
 * Resolve any Google Forms URL to its resolved URL (follows redirects).
 */
async function resolveUrl(url: string): Promise<string> {
  if (/forms\.gle\//.test(url)) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" })
      return res.url
    } catch {
      return url
    }
  }
  return url
}

/**
 * Extract the internal form ID from an editor-style URL.
 * Returns null for published URLs (/d/e/...).
 */
function extractEditorFormId(url: string): string | null {
  const match = url.match(/\/forms\/d\/([a-zA-Z0-9_-]{20,})(?:\/|$)/)
  if (match && match[1] !== "e") return match[1]
  return null
}

/**
 * Extract the form title from a published Google Form's HTML page.
 */
async function extractTitleFromPublishedUrl(
  url: string
): Promise<string | null> {
  try {
    const pageUrl = url.includes("/viewform")
      ? url
      : url.replace(/\/?$/, "/viewform")
    const res = await fetch(pageUrl)
    const html = await res.text()
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    return titleMatch?.[1]?.replace(/ - Google Forms$/, "").trim() ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  const forbidden = requireRole(appUser, ["admin", "supervisor"])
  if (forbidden) return forbidden

  const body = await request.json()
  const { form_url } = body

  if (!form_url) {
    return NextResponse.json({ error: "form_url is required" }, { status: 400 })
  }

  // Get OAuth tokens first (needed for Drive API fallback)
  const { data: org } = await supabase
    .from("organizations")
    .select("google_oauth_tokens")
    .eq("id", appUser.org_id)
    .single()

  const tokens = org?.google_oauth_tokens as OAuthTokens | null
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: "Google não conectado. Vá em Configurações > Integrações para conectar." },
      { status: 400 }
    )
  }

  // Resolve shortened URLs
  const resolvedUrl = await resolveUrl(form_url)

  // Try editor URL first
  let formId = extractEditorFormId(resolvedUrl)

  // If published URL, extract title and search via Drive API
  if (!formId && /\/forms\/d\/e\//.test(resolvedUrl)) {
    const title = await extractTitleFromPublishedUrl(resolvedUrl)
    if (title) {
      formId = await findFormIdByTitle(tokens, title)
    }
    if (!formId) {
      return NextResponse.json(
        {
          error: title
            ? `Formulário "${title}" encontrado, mas não foi possível acessá-lo. Reconecte o Google em Configurações > Integrações (necessário permissão do Drive).`
            : "Não foi possível identificar o formulário a partir dessa URL.",
        },
        { status: 400 }
      )
    }
  }

  if (!formId) {
    return NextResponse.json(
      { error: "URL do Google Forms inválida." },
      { status: 400 }
    )
  }

  try {
    const forms = getFormsClient(tokens)
    const res = await forms.forms.get({ formId })

    const items = res.data.items ?? []
    const fields = items
      .filter((item) => item.questionItem?.question?.questionId)
      .map((item) => {
        const questionId = item.questionItem!.question!.questionId!
        const title = item.title ?? "Untitled"
        const target = suggestMapping(title)
        return {
          questionId,
          title,
          suggestedTarget: target,
        }
      })

    return NextResponse.json({
      data: {
        formId,
        formTitle: res.data.info?.title ?? "Untitled Form",
        fields,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to fetch form: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    )
  }
}
