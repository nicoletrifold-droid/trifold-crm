import { ObraTabNav } from "./_components/obra-tab-nav"

export default async function ObraLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ obra_id: string }>
}) {
  const { obra_id } = await params
  return (
    <div className="flex min-h-screen flex-col bg-stone-950 pb-16">
      {children}
      <ObraTabNav obraId={obra_id} />
    </div>
  )
}
