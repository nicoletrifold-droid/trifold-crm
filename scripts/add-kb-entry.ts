/**
 * Insere UMA entrada na knowledge_base COM embedding (text-embedding-3-small,
 * mesma família do runtime — gotcha 75-173: sem embedding a Nicole não enxerga)
 * e valida na sequência com match_knowledge (threshold 0.45 do runtime).
 *
 * Uso:
 *   OPENAI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/add-kb-entry.ts --title "..." --content "..." \
 *     [--property "vind"] [--category "investimento"] [--test "pergunta de teste"]
 */
import { createClient } from "@supabase/supabase-js"

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const title = arg("title")
const content = arg("content")
const propertyNeedle = arg("property")
const category = arg("category")
const testQuery = arg("test")

if (!title || !content) {
  console.error("Uso: --title \"...\" --content \"...\" [--property vind] [--category x] [--test \"pergunta\"]")
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: text, model: "text-embedding-3-small", dimensions: 1536 }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  return (await res.json()).data[0].embedding
}

async function main() {
  const { data: orgs } = await supabase.from("organizations").select("id, name")
  if (!orgs || orgs.length !== 1) {
    console.error("Esperava exatamente 1 org, achei:", orgs?.map((o) => o.name))
    process.exit(1)
  }
  const orgId = orgs[0]!.id

  let sourceId: string | null = null
  if (propertyNeedle) {
    const { data: props } = await supabase
      .from("properties").select("id, name").ilike("name", `%${propertyNeedle}%`).eq("is_active", true)
    if (!props || props.length !== 1) {
      console.error(`Empreendimento "${propertyNeedle}" ambíguo/não achado:`, props?.map((p) => p.name))
      process.exit(1)
    }
    sourceId = props[0]!.id
    console.log(`Empreendimento: ${props[0]!.name} (${sourceId})`)
  }

  const embedding = await embed(`${title}\n\n${content}`)
  const { data: entry, error } = await supabase
    .from("knowledge_base")
    .insert({
      org_id: orgId,
      source_id: sourceId,
      title,
      content,
      source: "manual",
      metadata: category ? { category } : {},
      embedding: JSON.stringify(embedding),
    })
    .select("id, title")
    .single()
  if (error) { console.error("Insert falhou:", error); process.exit(1) }
  console.log(`✅ Inserido: ${entry.id} — "${entry.title}"`)

  if (testQuery) {
    const qEmbedding = await embed(testQuery)
    const { data: matches, error: mErr } = await supabase.rpc("match_knowledge", {
      query_embedding: qEmbedding,
      match_org_id: orgId,
      match_property_id: sourceId,
      match_threshold: 0.45,
      match_count: 5,
    })
    if (mErr) { console.error("match_knowledge falhou:", mErr); process.exit(1) }
    console.log(`\nBusca de validação: "${testQuery}"`)
    for (const m of matches ?? []) {
      console.log(`  ${m.similarity.toFixed(3)}  ${m.title}${m.id === entry.id ? "   ← ENTRADA NOVA" : ""}`)
    }
    const hit = (matches ?? []).some((m: { id: string }) => m.id === entry.id)
    console.log(hit ? "\n✅ A Nicole ENCONTRA a entrada nova." : "\n⚠️ Entrada NÃO retornou acima do threshold 0.45 — revisar texto.")
  }
}

main()
