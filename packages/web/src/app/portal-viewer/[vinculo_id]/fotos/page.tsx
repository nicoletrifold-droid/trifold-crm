import { redirect } from "next/navigation"
import { requireViewerAccess, getViewerVinculo } from "@web/lib/portal/viewer"
import { FotosGrid } from "@web/app/cliente/[obra_id]/_components/fotos-grid"

export default async function ViewerFotosPage({
  params,
}: {
  params: Promise<{ vinculo_id: string }>
}) {
  const { vinculo_id } = await params
  const { user, admin } = await requireViewerAccess()

  const ctx = await getViewerVinculo(admin, vinculo_id, user.orgId)
  if (!ctx) redirect("/dashboard/portal-cliente")

  const { data: fotos } = await admin
    .from("obra_fotos")
    .select("id, storage_path, caption, taken_at, fase_id, created_at")
    .eq("obra_id", ctx.obra.id)
    .order("created_at", { ascending: false })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

  return <FotosGrid fotos={fotos ?? []} supabaseUrl={supabaseUrl} />
}
