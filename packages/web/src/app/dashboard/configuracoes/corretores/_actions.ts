"use server"

import { createClient } from "@web/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function toggleBrokerAvailability(brokerId: string, currentValue: boolean) {
  const supabase = await createClient()
  const newAvailable = !currentValue

  // Story 75-54 — inativar corretor (deixar indisponível) também DESATIVA a conta
  // (users.is_active=false); reativar volta a ativar. Mantém disponibilidade e conta
  // em sincronia (corretor inativo não recebe lead, não conta nos analytics e não loga).
  const { data: broker } = await supabase
    .from("brokers")
    .update({ is_available: newAvailable })
    .eq("id", brokerId)
    .select("user_id, users!user_id(role)")
    .maybeSingle()

  // Story 75-226 — EXCEÇÃO p/ SDR: indisponível na roleta NÃO desativa a conta
  // (o SDR trabalha no /dashboard; bloquear o login tiraria dela o resto do sistema).
  const brokerUser = Array.isArray(broker?.users) ? broker?.users[0] : broker?.users
  const isSdr = (brokerUser as { role?: string } | null)?.role === "sdr"

  if (broker?.user_id && !isSdr) {
    await supabase
      .from("users")
      .update({ is_active: newAvailable })
      .eq("id", broker.user_id as string)
  }

  revalidatePath("/dashboard/configuracoes/corretores")
}
