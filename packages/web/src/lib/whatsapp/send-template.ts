// Story 75-142 — envio de template (HSM) via WhatsApp Cloud API. Mesmo padrão já
// usado em campanhas/notificações; centralizado para reuso pelo "Iniciar atendimento".

export interface TemplateComponent {
  type: string
  parameters: { type: string; text: string }[]
}

export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  components: TemplateComponent[],
  languageCode = "pt_BR"
): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp API ${res.status}: ${err}`)
  }
}
