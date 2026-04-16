import type { MessagingAdapter, ParsedMessage, TemplateComponent } from "./messaging-adapter"

interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
}

export class WhatsAppAdapter implements MessagingAdapter {
  private phoneNumberId: string
  private accessToken: string
  private baseUrl = "https://graph.facebook.com/v21.0"

  constructor(config: WhatsAppConfig) {
    this.phoneNumberId = config.phoneNumberId
    this.accessToken = config.accessToken
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.callApi("messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    })
  }

  async sendImage(to: string, url: string, caption?: string): Promise<void> {
    await this.callApi("messages", {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: url, caption },
    })
  }

  async sendDocument(
    to: string,
    url: string,
    filename: string
  ): Promise<void> {
    await this.callApi("messages", {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { link: url, filename },
    })
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[]
  ): Promise<void> {
    await this.callApi("messages", {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components?.length ? { components } : {}),
      },
    })
  }

  parseIncoming(body: unknown): ParsedMessage | null {
    const data = body as Record<string, unknown>
    const entry = (data.entry as Array<Record<string, unknown>>)?.[0]
    if (!entry) return null

    const changes = (entry.changes as Array<Record<string, unknown>>)?.[0]
    if (!changes) return null

    const value = changes.value as Record<string, unknown>
    const messages = value?.messages as Array<Record<string, unknown>>
    if (!messages?.[0]) return null

    const msg = messages[0]
    if (msg.type !== "text") return null

    const textObj = msg.text as Record<string, string>

    return {
      from: msg.from as string,
      text: textObj?.body ?? "",
      timestamp: parseInt(msg.timestamp as string, 10) * 1000,
      messageId: msg.id as string,
      channel: "whatsapp",
    }
  }

  private async callApi(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/${endpoint}`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`WhatsApp API error: ${res.status} ${error}`)
    }

    return res.json()
  }
}
