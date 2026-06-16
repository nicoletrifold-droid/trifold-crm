import { NextResponse } from "next/server"
import { getServerUser } from "@web/lib/auth"

export async function POST() {
  await getServerUser()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const res = await fetch(`${baseUrl}/api/cron/followup`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET || ""}`,
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: "Falha ao acionar Nicole" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
