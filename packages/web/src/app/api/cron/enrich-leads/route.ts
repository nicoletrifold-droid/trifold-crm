import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@web/lib/supabase/admin"

const CRON_SECRET = process.env.CRON_SECRET
const MAX_CONVERSATIONS_PER_RUN = 20
const ENRICHMENT_WINDOW_MINUTES = 30

/**
 * Cron: Enrich leads with Haiku batch extraction.
 * GET /api/cron/enrich-leads
 *
 * Runs every 30 minutes. For each conversation with recent activity:
 * 1. Load last 20 messages
 * 2. Call Haiku for summary + structured data extraction
 * 3. Sync extracted data + ai_summary to leads table
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET) {
    console.error("[ENRICH_CRON] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { createAnthropicClient } = await import("@trifold/ai")
  const { enrichLeadFromConversation, mapExtractedDataToLeadFields } = await import("@trifold/ai")
  const anthropic = createAnthropicClient()

  const cutoff = new Date(Date.now() - ENRICHMENT_WINDOW_MINUTES * 60 * 1000).toISOString()

  // AC2: Find conversations with recent activity that haven't been enriched yet
  const { data: rawConversations, error: convError } = await supabase
    .from("conversations")
    .select("id, lead_id, org_id, last_message_at, last_enriched_at")
    .eq("is_ai_active", true)
    .gte("last_message_at", cutoff)
    .limit(MAX_CONVERSATIONS_PER_RUN)

  if (convError) {
    console.error("[ENRICH_CRON] Error fetching conversations:", convError.message)
    return NextResponse.json({ error: "DB error" }, { status: 500 })
  }

  // Filter: only process if last_message_at > last_enriched_at (or never enriched)
  const conversations = (rawConversations ?? []).filter((c) => {
    if (!c.last_enriched_at) return true // never enriched
    return new Date(c.last_message_at) > new Date(c.last_enriched_at)
  })

  if (conversations.length === 0) {
    return NextResponse.json({ processed: 0, skipped: rawConversations?.length ?? 0, message: "No new messages to enrich" })
  }

  const results = { processed: 0, skipped: 0, failed: 0 }

  for (const conv of conversations) {
    try {
      // AC3: Load last 20 messages
      const { data: messages } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conv.id)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(20)

      if (!messages || messages.length < 2) {
        results.skipped++
        continue
      }

      // Load current collected_data from conversation_state
      const { data: state } = await supabase
        .from("conversation_state")
        .select("collected_data")
        .eq("conversation_id", conv.id)
        .single()

      const currentData = (state?.collected_data as Record<string, unknown>) ?? {}

      // Load current lead data for merge logic
      const { data: currentLead } = await supabase
        .from("leads")
        .select("name, email, preferred_bedrooms, preferred_floor, preferred_view, preferred_garage_count, has_down_payment, source, qualification_score, property_interest_id")
        .eq("id", conv.lead_id)
        .single()

      // AC4-AC7: Call Haiku for extraction + summary
      const enrichment = await enrichLeadFromConversation(anthropic, {
        messages: messages as Array<{ role: string; content: string }>,
        currentCollectedData: currentData,
      })

      if (!enrichment) {
        console.warn(`[ENRICH_CRON] Failed to parse Haiku response for conversation ${conv.id}`)
        results.failed++
        continue
      }

      // AC8-AC12: Sync to leads table
      const leadPatch = mapExtractedDataToLeadFields(
        enrichment.extracted_data,
        currentData
      )

      // AC8: Always update ai_summary
      leadPatch.ai_summary = enrichment.summary

      // AC10: Resolve property_interest to property_interest_id
      if (enrichment.extracted_data.property_interest) {
        const interest = (enrichment.extracted_data.property_interest as string).toLowerCase()
        const { data: matchedProperty } = await supabase
          .from("properties")
          .select("id")
          .eq("org_id", conv.org_id)
          .eq("is_active", true)
          .or(`slug.eq.${interest},name.ilike.%${interest}%`)
          .limit(1)
          .maybeSingle()

        if (matchedProperty) {
          leadPatch.property_interest_id = matchedProperty.id
        }
      }

      // Apply patch — only non-null fields (AC10)
      const cleanPatch: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(leadPatch)) {
        if (value !== null && value !== undefined) {
          cleanPatch[key] = value
        }
      }

      if (Object.keys(cleanPatch).length > 0) {
        await supabase.from("leads").update(cleanPatch).eq("id", conv.lead_id)
      }

      // Update conversation_state.collected_data with enriched data
      const mergedCollectedData = { ...currentData, ...enrichment.extracted_data }
      await supabase
        .from("conversation_state")
        .update({ collected_data: mergedCollectedData })
        .eq("conversation_id", conv.id)

      // Mark conversation as enriched — prevents reprocessing until new messages arrive
      await supabase
        .from("conversations")
        .update({ last_enriched_at: new Date().toISOString() })
        .eq("id", conv.id)

      // AC15: Log success
      console.log(`[ENRICH_CRON] Enriched lead ${conv.lead_id}: ${Object.keys(enrichment.extracted_data).join(", ")}`)
      results.processed++
    } catch (error) {
      // AC13: Skip failed conversations, don't block others
      console.error(`[ENRICH_CRON] Error processing conversation ${conv.id}:`, error)
      results.failed++
    }
  }

  return NextResponse.json({
    ...results,
    total: conversations.length,
  })
}
