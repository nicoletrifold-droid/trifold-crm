import { NextResponse } from "next/server"

export async function GET() {
  const env = process.env
  return NextResponse.json({
    has_secret: Boolean(env["LANDING_PAGE_WEBHOOK_SECRET"]),
    has_meta: Boolean(env["META_APP_SECRET"]),
    has_supabase: Boolean(env["SUPABASE_URL"]),
    node_env: env["NODE_ENV"],
    secret_length: (env["LANDING_PAGE_WEBHOOK_SECRET"] ?? "").length,
  })
}
