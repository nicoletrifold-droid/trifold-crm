/**
 * Backfill: convida clientes do Vind Residence para o portal.
 * Usa generateLink (sem rate limit de email do Supabase).
 *
 * Para cada vínculo clientes_obras_vinculos sem sienge_invite_sent_at:
 *  - Se cliente tem email + sienge_customer_id:
 *    1. Verifica se já existe na tabela users (role=cliente)
 *    2. Se não existe: cria auth user via generateLink (sem enviar email)
 *    3. Cria registro em users com sienge_customer_id
 *    4. Cria cliente_obras se não existir
 *    5. Marca sienge_invite_sent_at no vínculo
 *
 * Uso:
 *   npx tsx scripts/backfill-vind-portal-invites.ts             # dry-run (só lista)
 *   npx tsx scripts/backfill-vind-portal-invites.ts --execute   # executa
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

const envPath = resolve(__dirname, "../packages/web/.env.local")
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.trifold.eng.br"

const VIND_OBRA_ID = "74bd0414-d978-4f4e-b65c-3e25e6e40877"

const isDryRun = !process.argv.includes("--execute")

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  let page = 1
  const perPage = 50
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error || !data) break
    const found = data.users.find((u) => u.email === email)
    if (found) return found.id
    if (data.users.length < perPage) break
    page++
    await sleep(200)
  }
  return null
}

async function main() {
  console.log(`\n🏗️  Backfill Portal Invites — Vind Residence`)
  console.log(`Mode: ${isDryRun ? "DRY RUN (add --execute to apply)" : "EXECUTE"}\n`)

  // Carrega obra
  const { data: obra, error: obraErr } = await supabase
    .from("obras")
    .select("id, org_id, name")
    .eq("id", VIND_OBRA_ID)
    .single()

  if (obraErr || !obra) {
    console.error("Obra não encontrada:", obraErr?.message)
    process.exit(1)
  }

  console.log(`Obra: ${obra.name} (org: ${obra.org_id})\n`)

  // Carrega vínculos sem invite_sent_at
  const { data: vinculos, error: vinErr } = await supabase
    .from("clientes_obras_vinculos")
    .select("id, sienge_contract_numbers, clientes(id, nome, email, sienge_customer_id)")
    .eq("obra_id", VIND_OBRA_ID)
    .is("sienge_invite_sent_at", null)

  if (vinErr) {
    console.error("Erro ao buscar vínculos:", vinErr.message)
    process.exit(1)
  }

  const all = vinculos ?? []
  console.log(`Vínculos sem invite_sent_at: ${all.length}\n`)

  let invited = 0
  let linked = 0
  let skipped = 0

  for (const vinculo of all) {
    const cliente = Array.isArray(vinculo.clientes)
      ? vinculo.clientes[0]
      : vinculo.clientes

    const nome = (cliente as { nome: string } | null)?.nome ?? "?"
    const email = (cliente as { email: string | null } | null)?.email ?? null
    const siengeId = (cliente as { sienge_customer_id: number | null } | null)?.sienge_customer_id ?? null
    const clienteId = (cliente as { id: string } | null)?.id ?? null

    if (!email || !siengeId) {
      console.log(`  ⏭️  ${nome} — sem email ou sienge_customer_id, pulando`)
      skipped++
      continue
    }

    console.log(`  📋 ${nome} <${email}> (sienge_id: ${siengeId})`)

    if (isDryRun) {
      console.log(`     [dry-run] seria convidado`)
      invited++
      continue
    }

    // 1. Verifica se já existe na tabela users
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, auth_id, sienge_customer_id")
      .eq("email", email)
      .eq("role", "cliente")
      .maybeSingle()

    let userId: string | null = null

    if (existingUser) {
      userId = (existingUser as { id: string }).id
      // Atualiza sienge_customer_id se faltar
      if (!(existingUser as { sienge_customer_id: number | null }).sienge_customer_id) {
        await supabase
          .from("users")
          .update({ sienge_customer_id: siengeId })
          .eq("id", userId)
        console.log(`     ✅ user existente atualizado com sienge_customer_id`)
      } else {
        console.log(`     ✅ user existente já tem sienge_customer_id`)
      }
      linked++
    } else {
      // 2. Tenta convidar
      // Usa generateLink para criar auth user sem enviar email pelo Supabase
      // (evita rate limit em operações em massa)
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: `${APP_URL}/cliente`,
          data: { full_name: nome },
        },
      })

      let authUserId: string | null = null

      if (linkErr || !linkData?.user) {
        const errMsg = linkErr?.message ?? ""
        // Se o user já existe em auth, procura pelo email
        if (errMsg.toLowerCase().includes("already") || errMsg.toLowerCase().includes("registered")) {
          console.log(`     ⚠️  email já existe em auth, buscando user_id...`)
          authUserId = await findAuthUserByEmail(email)
          if (authUserId) {
            console.log(`     🔍 encontrado em auth: ${authUserId}`)
          } else {
            console.error(`     ❌ não encontrou em auth — pulando`)
            skipped++
            continue
          }
        } else {
          console.error(`     ❌ generateLink falhou: ${linkErr?.message}`)
          skipped++
          continue
        }
      } else {
        authUserId = linkData.user.id
        console.log(`     🔑 auth user criado via generateLink`)
      }

      // 3. Cria registro em users
      const { data: newUser, error: userErr } = await supabase
        .from("users")
        .insert({
          auth_id: authUserId,
          org_id: obra.org_id,
          name: nome,
          email,
          role: "cliente",
          sienge_customer_id: siengeId,
        })
        .select("id")
        .single()

      if (userErr) {
        // Pode já ter sido criado (upsert race)
        if (userErr.code === "23505") {
          const { data: retry } = await supabase
            .from("users")
            .select("id")
            .eq("auth_id", authUserId)
            .maybeSingle()
          userId = (retry as { id: string } | null)?.id ?? null
          console.log(`     ⚠️  users duplicado, usando existente`)
        } else {
          console.error(`     ❌ erro ao criar user: ${userErr.message}`)
          skipped++
          continue
        }
      } else {
        userId = (newUser as { id: string }).id
      }

      invited++
    }

    // 4. Garante cliente_obras
    if (userId) {
      const { data: portalLink } = await supabase
        .from("cliente_obras")
        .select("user_id")
        .eq("user_id", userId)
        .eq("obra_id", VIND_OBRA_ID)
        .maybeSingle()

      if (!portalLink) {
        await supabase.from("cliente_obras").insert({
          user_id: userId,
          obra_id: VIND_OBRA_ID,
          is_primary: false,
        })
        console.log(`     🔗 cliente_obras criado`)
      }
    }

    // 5. Marca invite_sent_at
    await supabase
      .from("clientes_obras_vinculos")
      .update({ sienge_invite_sent_at: new Date().toISOString() })
      .eq("id", vinculo.id)

    console.log(`     ✅ sienge_invite_sent_at marcado`)

    // Rate limit entre convites
    await sleep(600)
  }

  console.log(`\n📊 Resultado:`)
  console.log(`  Convidados/criados: ${invited}`)
  console.log(`  Vinculados (já existiam): ${linked}`)
  console.log(`  Pulados (sem email/sienge_id ou erro): ${skipped}`)

  if (isDryRun) {
    console.log(`\n💡 Para executar: npx tsx scripts/backfill-vind-portal-invites.ts --execute`)
  }
}

main().catch(console.error)
