import { google } from "googleapis"

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
  token_type: string
  scope: string
}

const SCOPES = ["https://www.googleapis.com/auth/forms.responses.readonly"]

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(): string {
  const client = getOAuth2Client()
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  })
}

export async function exchangeCodeForTokens(
  code: string
): Promise<OAuthTokens> {
  const client = getOAuth2Client()
  const { tokens } = await client.getToken(code)
  return {
    access_token: tokens.access_token ?? "",
    refresh_token: tokens.refresh_token ?? "",
    expiry_date: tokens.expiry_date ?? 0,
    token_type: tokens.token_type ?? "Bearer",
    scope: tokens.scope ?? SCOPES[0],
  }
}

export async function refreshTokenIfNeeded(
  tokens: OAuthTokens
): Promise<{ tokens: OAuthTokens; refreshed: boolean }> {
  if (tokens.expiry_date > Date.now() + 60_000) {
    return { tokens, refreshed: false }
  }

  const client = getOAuth2Client()
  client.setCredentials({
    refresh_token: tokens.refresh_token,
  })

  const { credentials } = await client.refreshAccessToken()

  const updated: OAuthTokens = {
    ...tokens,
    access_token: credentials.access_token ?? tokens.access_token,
    expiry_date: credentials.expiry_date ?? tokens.expiry_date,
  }

  return { tokens: updated, refreshed: true }
}

export function getFormsClient(tokens: OAuthTokens) {
  const client = getOAuth2Client()
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })
  return google.forms({ version: "v1", auth: client })
}
