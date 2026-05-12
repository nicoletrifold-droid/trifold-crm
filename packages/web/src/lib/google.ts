import "server-only"

import { google } from "googleapis"

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
  token_type: string
  scope: string
}

const DEFAULT_SCOPE = "https://www.googleapis.com/auth/forms.body.readonly"
const SCOPES: string[] = [
  DEFAULT_SCOPE,
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
]

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
    scope: tokens.scope ?? DEFAULT_SCOPE,
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

export function getDriveClient(tokens: OAuthTokens) {
  const client = getOAuth2Client()
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })
  return google.drive({ version: "v3", auth: client })
}

/**
 * Find the internal form ID by searching Google Drive for a form with the given title.
 * Returns the file/form ID or null.
 */
export async function findFormIdByTitle(
  tokens: OAuthTokens,
  title: string
): Promise<string | null> {
  const drive = getDriveClient(tokens)
  const escapedTitle = title.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.form' and name='${escapedTitle}' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 5,
  })
  const files = res.data.files ?? []
  const [firstFile] = files
  return firstFile?.id ?? null
}
