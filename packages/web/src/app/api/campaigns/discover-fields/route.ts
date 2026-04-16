import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requireRole } from "@web/lib/api-auth"
import { getFormsClient, type OAuthTokens } from "@web/lib/google"

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

  // Extract form ID from URL
  const match = form_url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/)
  const formId = match?.[1]
  if (!formId) {
    return NextResponse.json(
      { error: "Invalid Google Forms URL" },
      { status: 400 }
    )
  }

  // Get OAuth tokens
  const { data: org } = await supabase
    .from("organizations")
    .select("google_oauth_tokens")
    .eq("id", appUser.org_id)
    .single()

  const tokens = org?.google_oauth_tokens as OAuthTokens | null
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: "Google not connected. Go to Settings > Integrations to connect." },
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
