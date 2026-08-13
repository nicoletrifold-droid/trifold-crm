import { chromium } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
const envFile = readFileSync(".env.local", "utf8")
const env = Object.fromEntries(envFile.split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: linkData } = await admin.auth.admin.generateLink({ type: "magiclink", email: "lucas@trifold.com.br" })
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } })
const { data: verified } = await anon.auth.verifyOtp({ type: "email", token_hash: linkData.properties.hashed_token })
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
const raw = "base64-" + Buffer.from(JSON.stringify(verified.session)).toString("base64url")
const CHUNK = 3180
const cookies = raw.length <= CHUNK ? [{ name: `sb-${ref}-auth-token`, value: raw, domain: "localhost", path: "/" }] : Array.from({ length: Math.ceil(raw.length / CHUNK) }, (_, i) => ({ name: `sb-${ref}-auth-token.${i}`, value: raw.slice(i * CHUNK, (i + 1) * CHUNK), domain: "localhost", path: "/" }))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, colorScheme: "dark" })
await context.addCookies(cookies)
const page = await context.newPage()
const out = (n, ok, e = "") => console.log(`${ok ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`)

await page.goto("http://localhost:3777/dashboard/analytics", { waitUntil: "domcontentloaded", timeout: 180000 })
await page.waitForTimeout(8000)

const regua = await page.getByText("Pipeline", { exact: false }).count()
out("régua do Pipeline presente", regua > 0, `count=${regua}`)
const agora = await page.getByText("· agora").count()
out("régua marcada '· agora' (ao vivo)", agora > 0)
const funil = await page.locator('svg[aria-label="Funil de conversão em 4 etapas"]').count()
out("funil SVG renderizado", funil > 0, `count=${funil}`)
const ondas = await page.locator(".funil-onda").count()
out("ondas de líquido animando (8 = 2 por andar × 5 seções)", ondas >= 8, `count=${ondas}`)

// screenshots: régua entre cards e gráfico + funil
const reguaEl = page.getByText("· agora").first()
await reguaEl.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
await page.screenshot({ path: "/private/tmp/claude-501/-Users-marcos/5ef1e00b-d525-41da-9c64-a8098b8bae1f/scratchpad/analytics-regua.png" })
await page.locator('svg[aria-label="Funil de conversão em 4 etapas"]').scrollIntoViewIfNeeded()
await page.waitForTimeout(800)
await page.screenshot({ path: "/private/tmp/claude-501/-Users-marcos/5ef1e00b-d525-41da-9c64-a8098b8bae1f/scratchpad/analytics-funil.png" })
await browser.close()
console.log("done")
