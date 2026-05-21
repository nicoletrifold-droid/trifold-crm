import { redirect } from "next/navigation"
import { createClient } from "@web/lib/supabase/server"
import { ChatFeed } from "./_components/chat-feed"

export default async function MensagensPage({
  params,
}: {
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  const supabase = await createClient()

  // RLS garante isolamento — retorna null se obra não pertencer ao cliente
  const { data: obra } = await supabase
    .from("obras")
    .select("id, name")
    .eq("id", obra_id)
    .single()

  if (!obra) {
    redirect("/cliente/sem-obra")
  }

  const { data: authData } = await supabase.auth.getUser()
  const authUid = authData.user?.id ?? null

  // public.users.id ≠ auth.uid() — precisamos do ID interno para filtrar cliente_id
  const { data: userRow } = authUid
    ? await supabase.from("users").select("id").eq("auth_id", authUid).single()
    : { data: null }
  const userId = userRow?.id ?? null

  const mensagensQuery = supabase
    .from("obra_mensagens")
    .select("id, content, message_type, storage_path, sender_type, created_at")
    .eq("obra_id", obra_id)
    .order("created_at", { ascending: true })

  const [{ data: mensagens }] = await Promise.all([
    userId ? mensagensQuery.eq("cliente_id", userId) : mensagensQuery,
    userId
      ? supabase
          .from("obra_mensagens")
          .update({ read_at: new Date().toISOString() })
          .eq("obra_id", obra_id)
          .eq("cliente_id", userId)
          .eq("sender_type", "equipe")
          .is("read_at", null)
      : Promise.resolve(null),
  ])

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

  return (
    <div className="flex h-[100dvh] flex-col bg-stone-950">
      <header className="flex-shrink-0 border-b border-stone-800 bg-stone-950 lg:hidden">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <p className="text-xs text-stone-500">Mensagens</p>
          <p className="text-sm font-semibold text-white">{obra.name}</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden pb-16 lg:pb-0">
        <ChatFeed
          obraId={obra_id}
          userId={userId}
          initialMensagens={mensagens ?? []}
          supabaseUrl={supabaseUrl}
        />
      </div>
    </div>
  )
}
