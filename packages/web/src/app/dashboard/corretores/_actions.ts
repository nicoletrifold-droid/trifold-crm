"use server"

import { createClient } from "@web/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function toggleBrokerAvailability(brokerId: string, currentValue: boolean) {
  const supabase = await createClient()
  await supabase
    .from("brokers")
    .update({ is_available: !currentValue })
    .eq("id", brokerId)
  revalidatePath("/dashboard/corretores")
}
