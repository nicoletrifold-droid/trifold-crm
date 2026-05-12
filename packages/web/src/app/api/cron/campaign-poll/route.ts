import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"
import { logEvent } from "@web/lib/logger"
import {
  refreshTokenIfNeeded,
  getFormsClient,
  type OAuthTokens,
} from "@web/lib/google"
import { sendEmail } from "@web/lib/email"
import { STAGE_IDS } from "@trifold/shared"

async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  components?: { type: string; parameters: { type: string; text: string }[] }[]
): Promise<void> {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`
  const res = await fetch(url, {
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
        ...(components?.length ? { components } : {}),
      },
    }),
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`WhatsApp API error: ${res.status} ${error}`)
  }
}

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

interface FieldMapping {
  [questionId: string]: { target: string; label: string }
}

interface Campaign {
  id: string
  org_id: string
  name: string
  slug: string
  google_form_id: string
  last_polled_at: string | null
  last_response_at: string | null
  field_mapping: FieldMapping
  whatsapp_template_name: string | null
  email_enabled: boolean
  email_subject: string | null
  email_body_html: string | null
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 11) return digits
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2)
  // 10-digit: DDD(2) + 8 digits (formato antigo sem o 9) → insere 9 após DDD
  if (digits.length === 10) return digits.slice(0, 2) + "9" + digits.slice(2)
  // 12-digit: 55 + DDD(2) + 8 digits → insere 9 após DDD
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2, 4) + "9" + digits.slice(4)
  // 9-digit: número sem DDD → assume DDD 44 (Maringá/PR)
  if (digits.length === 9) return "44" + digits
  // 8-digit: número sem DDD no formato antigo → assume DDD 44 + insere 9
  if (digits.length === 8) return "449" + digits
  return null
}

function extractFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
  fieldMapping: FieldMapping
): {
  name: string
  phone: string
  email: string
  custom_data: Record<string, string>
} | null {
  let name = ""
  let phone = ""
  let email = ""
  const custom_data: Record<string, string> = {}

  for (const [questionId, mapping] of Object.entries(fieldMapping)) {
    const answer =
      response.answers?.[questionId]?.textAnswers?.answers?.[0]?.value
    if (!answer) continue

    if (mapping.target === "name") name = answer
    else if (mapping.target === "phone") {
      const normalized = normalizePhone(answer)
      if (!normalized) return null
      phone = normalized
    } else if (mapping.target === "email")
      email = answer.toLowerCase().trim()
    else if (mapping.target.startsWith("custom:")) {
      const key = mapping.target.replace("custom:", "")
      custom_data[key] = answer
    } else if (mapping.target === "ignore") {
      // skip
    }
  }

  if (!name || !phone || !email) return null
  return { name, phone, email, custom_data }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()

  let processed = 0
  let skipped = 0
  let errors = 0

  // Fetch active Google Forms campaigns
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      "id, org_id, name, slug, google_form_id, last_polled_at, last_response_at, field_mapping, whatsapp_template_name, email_enabled, email_subject, email_body_html"
    )
    .eq("status", "active")
    .eq("type", "google_forms")
    .gt("ends_at", new Date().toISOString())
    .not("google_form_id", "is", null)

  if (campaignsError || !campaigns?.length) {
    return NextResponse.json({
      processed: 0,
      skipped: 0,
      errors: 0,
      message: campaignsError?.message ?? "No active campaigns",
    })
  }

  for (const campaign of campaigns as Campaign[]) {
    try {
      // Get OAuth tokens for the org
      const { data: org } = await supabase
        .from("organizations")
        .select("google_oauth_tokens")
        .eq("id", campaign.org_id)
        .single()

      const tokens = org?.google_oauth_tokens as OAuthTokens | null
      if (!tokens?.refresh_token) {
        logEvent({
          level: "warn",
          category: "cron",
          event_type: "CAMPAIGN_POLL_NO_TOKENS",
          message: `No Google tokens for org ${campaign.org_id}, skipping campaign ${campaign.id}`,
          org_id: campaign.org_id,
        })
        continue
      }

      // Refresh token if needed
      const { tokens: freshTokens, refreshed } =
        await refreshTokenIfNeeded(tokens)
      if (refreshed) {
        await supabase
          .from("organizations")
          .update({ google_oauth_tokens: freshTokens })
          .eq("id", campaign.org_id)
      }

      // Poll Google Forms API
      // Usa last_response_at (timestamp da última resposta VISTA) em vez de last_polled_at
      // para evitar race condition: respostas enviadas entre a consulta à API e o update
      // do last_polled_at seriam perdidas se usarmos o horário do cron.
      const forms = getFormsClient(freshTokens)
      const filterBase = campaign.last_response_at ?? campaign.last_polled_at
      const filter = filterBase
        ? `timestamp > ${filterBase}`
        : undefined

      const res = await forms.forms.responses.list({
        formId: campaign.google_form_id,
        filter,
      })

      const responses = res.data.responses ?? []

      if (responses.length === 0) {
        await supabase
          .from("campaigns")
          .update({ last_polled_at: new Date().toISOString() })
          .eq("id", campaign.id)
        continue
      }

      // Get WhatsApp config for sending templates.
      // Use maybeSingle() so orgs without (or with multiple) whatsapp_config rows
      // do not crash the entire campaign — WhatsApp is simply skipped while
      // email/entry persistence proceed normally.
      const { data: waConfig } = await supabase
        .from("whatsapp_config")
        .select("phone_number_id, access_token")
        .eq("org_id", campaign.org_id)
        .eq("status", "active")
        .maybeSingle()

      if (!waConfig) {
        logEvent({
          level: "info",
          category: "cron",
          event_type: "CAMPAIGN_POLL_WHATSAPP_NOT_CONFIGURED",
          message: `WhatsApp não configurado para org ${campaign.org_id}`,
          org_id: campaign.org_id,
          metadata: { campaignId: campaign.id },
          source: "api/cron/campaign-poll",
        })
      }

      let lastResponseTime: string | null = null

      for (const response of responses) {
        try {
          const responseId = response.responseId
          const responseTime =
            response.lastSubmittedTime ?? response.createTime

          if (responseTime && (!lastResponseTime || responseTime > lastResponseTime)) {
            lastResponseTime = responseTime
          }

          // Extract fields using mapping
          const fields = extractFields(
            response,
            campaign.field_mapping as FieldMapping
          )
          if (!fields) {
            skipped++
            continue
          }

          // Check duplicate by google_response_id
          const { data: existingByResponse } = await supabase
            .from("campaign_entries")
            .select("id")
            .eq("campaign_id", campaign.id)
            .eq("google_response_id", responseId)
            .maybeSingle()

          if (existingByResponse) {
            skipped++
            continue
          }

          // Check duplicate by phone
          const { data: existingByPhone } = await supabase
            .from("campaign_entries")
            .select("id")
            .eq("campaign_id", campaign.id)
            .eq("phone", fields.phone)
            .maybeSingle()

          if (existingByPhone) {
            skipped++
            continue
          }

          // Find or create lead in CRM
          let leadId: string | null = null
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id, name, email")
            .eq("phone", fields.phone)
            .eq("org_id", campaign.org_id)
            .maybeSingle()

          if (existingLead) {
            leadId = existingLead.id
            // Update name/email if they were empty
            const updates: Record<string, string> = {}
            if (!existingLead.name && fields.name) updates.name = fields.name
            if (!existingLead.email && fields.email) updates.email = fields.email
            if (Object.keys(updates).length > 0) {
              await supabase.from("leads").update(updates).eq("id", leadId)
            }
          } else {
            const { data: newLead } = await supabase
              .from("leads")
              .insert({
                org_id: campaign.org_id,
                name: fields.name,
                phone: fields.phone,
                email: fields.email,
                channel: "google_forms",
                source: "google_forms",
                stage_id: STAGE_IDS.novo,
                utm_source: campaign.slug,
                utm_campaign: campaign.name,
                is_active: true,
              })
              .select("id")
              .single()

            leadId = newLead?.id ?? null
          }

          // Insert campaign entry
          const { data: entry } = await supabase
            .from("campaign_entries")
            .insert({
              org_id: campaign.org_id,
              campaign_id: campaign.id,
              lead_id: leadId,
              name: fields.name,
              phone: fields.phone,
              email: fields.email,
              custom_data: fields.custom_data,
              google_response_id: responseId,
              raw_payload: response,
            })
            .select("id")
            .single()

          const entryId = entry?.id

          // Fire-and-forget: WhatsApp template
          if (campaign.whatsapp_template_name && waConfig && entryId) {
            try {
              const components = []
              const customValues = Object.values(fields.custom_data)
              if (fields.name || customValues.length > 0) {
                components.push({
                  type: "body",
                  parameters: [
                    { type: "text", text: fields.name },
                    ...customValues.map((v) => ({
                      type: "text",
                      text: String(v),
                    })),
                  ],
                })
              }

              await sendWhatsAppTemplate(
                waConfig.phone_number_id,
                waConfig.access_token,
                `55${fields.phone}`,
                campaign.whatsapp_template_name,
                "pt_BR",
                components
              )

              await supabase
                .from("campaign_entries")
                .update({
                  whatsapp_status: "sent",
                  whatsapp_sent_at: new Date().toISOString(),
                })
                .eq("id", entryId)

              await supabase.from("campaign_events").insert({
                org_id: campaign.org_id,
                campaign_id: campaign.id,
                entry_id: entryId,
                channel: "whatsapp",
                event_type: "sent",
              })
            } catch (waError) {
              await supabase
                .from("campaign_entries")
                .update({ whatsapp_status: "failed" })
                .eq("id", entryId)

              await supabase.from("campaign_events").insert({
                org_id: campaign.org_id,
                campaign_id: campaign.id,
                entry_id: entryId,
                channel: "whatsapp",
                event_type: "failed",
                metadata: {
                  error:
                    waError instanceof Error ? waError.message : "Unknown",
                },
              })
            }
          }

          // Fire-and-forget: Email
          if (
            campaign.email_enabled &&
            campaign.email_subject &&
            campaign.email_body_html &&
            entryId
          ) {
            try {
              // Replace placeholders in email body
              let html = campaign.email_body_html
                .replace(/\{\{nome\}\}/gi, fields.name)
                .replace(/\{\{name\}\}/gi, fields.name)

              for (const [key, value] of Object.entries(fields.custom_data)) {
                html = html.replace(
                  new RegExp(`\\{\\{${key}\\}\\}`, "gi"),
                  String(value)
                )
              }

              const result = await sendEmail({
                to: fields.email,
                subject: campaign.email_subject.replace(
                  /\{\{nome\}\}/gi,
                  fields.name
                ),
                html,
                tags: [
                  { name: "campaign_id", value: campaign.id },
                  { name: "entry_id", value: entryId },
                ],
              })

              const emailStatus = result.error ? "failed" : "sent"
              await supabase
                .from("campaign_entries")
                .update({
                  email_status: emailStatus,
                  email_sent_at: new Date().toISOString(),
                })
                .eq("id", entryId)

              await supabase.from("campaign_events").insert({
                org_id: campaign.org_id,
                campaign_id: campaign.id,
                entry_id: entryId,
                channel: "email",
                event_type: emailStatus,
                metadata: result.error ? { error: result.error } : {},
              })
            } catch (emailError) {
              await supabase
                .from("campaign_entries")
                .update({ email_status: "failed" })
                .eq("id", entryId)

              await supabase.from("campaign_events").insert({
                org_id: campaign.org_id,
                campaign_id: campaign.id,
                entry_id: entryId,
                channel: "email",
                event_type: "failed",
                metadata: {
                  error:
                    emailError instanceof Error
                      ? emailError.message
                      : "Unknown",
                },
              })
            }
          }

          processed++
        } catch (responseError) {
          errors++
          logEvent({
            level: "error",
            category: "cron",
            event_type: "CAMPAIGN_POLL_RESPONSE_ERROR",
            message: `Error processing response in campaign ${campaign.id}`,
            metadata: {
              error:
                responseError instanceof Error
                  ? responseError.message
                  : "Unknown",
              responseId: response.responseId,
            },
            source: "api/cron/campaign-poll",
            org_id: campaign.org_id,
          })
        }
      }

      // Update campaign poll timestamps
      await supabase
        .from("campaigns")
        .update({
          last_polled_at: new Date().toISOString(),
          ...(lastResponseTime ? { last_response_at: lastResponseTime } : {}),
        })
        .eq("id", campaign.id)
    } catch (campaignError) {
      errors++
      logEvent({
        level: "error",
        category: "cron",
        event_type: "CAMPAIGN_POLL_ERROR",
        message: `Error polling campaign ${campaign.id}`,
        metadata: {
          error:
            campaignError instanceof Error
              ? campaignError.message
              : "Unknown",
        },
        source: "api/cron/campaign-poll",
        org_id: campaign.org_id,
      })
    }
  }

  return NextResponse.json({ processed, skipped, errors })
}
