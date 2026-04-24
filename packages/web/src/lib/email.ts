import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  tags?: { name: string; value: string }[]
}): Promise<{ id: string | null; error?: string }> {
  if (!resend) {
    return { id: null, error: "RESEND_API_KEY not configured" }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "Trifold <contato@trifold.com.br>",
      to: params.to,
      subject: params.subject,
      html: params.html,
      tags: params.tags,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null }
  } catch (err) {
    return {
      id: null,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
