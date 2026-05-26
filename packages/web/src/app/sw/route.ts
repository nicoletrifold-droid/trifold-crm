import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

const BUILD_HASH =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  process.env.BUILD_ID ??
  Date.now().toString()

export const dynamic = 'force-dynamic'

export async function GET() {
  const template = readFileSync(
    join(process.cwd(), 'src/lib/pwa/sw-source.js'),
    'utf-8'
  )
  const swContent = template.replaceAll('__BUILD_HASH__', BUILD_HASH)

  return new NextResponse(swContent, {
    headers: {
      'Content-Type': 'text/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}
