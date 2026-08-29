import { createClient } from "@supabase/supabase-js"
import { resolverAmbiente } from "./lib/db-env"

// Story 900-3b (AC3): alvo por `scripts/lib/db-env.ts` — allowlist que falha FECHADA,
// default TESTE. Escrever em produção exige TRIFOLD_ENV=producao E TRIFOLD_ALLOW_PROD=1.
const ALVO = resolverAmbiente({ escreve: true })
const supabaseUrl = ALVO.url
const serviceRoleKey = ALVO.serviceRoleKey

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_ID = "00000000-0000-0000-0000-000000000001"

const users = [
  {
    email: "alexandre@trifold.com.br",
    password: "395Trifold@",
    name: "Alexandre Guimaraes Nicolau",
    role: "admin" as const,
  },
  {
    email: "lucas@trifold.com.br",
    password: "395Trifold@",
    name: "Lucas Supervisor",
    role: "supervisor" as const,
  },
  {
    email: "corretor@trifold.com.br",
    password: "395Trifold@",
    name: "Corretor Demo",
    role: "broker" as const,
  },
]

async function seedUsers() {
  for (const user of users) {
    console.log(`Creating user: ${user.email}...`)

    // Create auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      })

    if (authError) {
      if (authError.message.includes("already been registered")) {
        console.log(`  User ${user.email} already exists in auth, skipping auth creation`)
        // Get existing auth user
        const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers()
        const existing = existingUsers?.find((u) => u.email === user.email)
        if (existing) {
          // Upsert into public.users
          const { error: upsertError } = await supabase
            .from("users")
            .upsert(
              {
                org_id: ORG_ID,
                auth_id: existing.id,
                email: user.email,
                name: user.name,
                role: user.role,
              },
              { onConflict: "auth_id" }
            )
          if (upsertError) console.error(`  Error upserting user: ${upsertError.message}`)
          else console.log(`  Upserted ${user.email} in public.users`)
        }
        continue
      }
      console.error(`  Auth error: ${authError.message}`)
      continue
    }

    // Insert into public.users
    const { error: insertError } = await supabase.from("users").upsert(
      {
        org_id: ORG_ID,
        auth_id: authData.user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      { onConflict: "auth_id" }
    )

    if (insertError) {
      console.error(`  Insert error: ${insertError.message}`)
    } else {
      console.log(`  Created ${user.email} (${user.role})`)
    }
  }

  console.log("\nDone!")
}

seedUsers()
