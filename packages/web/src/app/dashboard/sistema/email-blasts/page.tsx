import { redirect } from "next/navigation"
import { getServerUser } from "@web/lib/auth"
import { BlastList } from "./_components/blast-list"

export default async function EmailBlastsPage() {
  const user = await getServerUser()
  if (user.role !== "admin") redirect("/dashboard")
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <BlastList />
    </div>
  )
}
