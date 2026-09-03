export interface EmailLayoutOptions {
  orgName?: string
  /**
   * Story 900-67 — o `organizations.id` da org dona do e-mail. Decide, por identidade, se o
   * cabeçalho leva a marca da Trifold (`isMarcaTrifold`). Ausente ⇒ NÃO é a Trifold.
   */
  orgId?: string | null
  unsubscribeUrl?: string
  previewText?: string
}
