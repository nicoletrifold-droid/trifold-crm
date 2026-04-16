export interface TemplateComponent {
  type: "body" | "header"
  parameters: { type: "text"; text: string }[]
}

export interface MessagingAdapter {
  sendText(to: string, text: string): Promise<void>
  sendImage(to: string, url: string, caption?: string): Promise<void>
  sendDocument(to: string, url: string, filename: string): Promise<void>
  sendTemplate?(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[]
  ): Promise<void>
  parseIncoming(body: unknown): ParsedMessage | null
}

export interface ParsedMessage {
  from: string
  text: string
  timestamp: number
  messageId: string
  channel: "whatsapp" | "telegram"
}
