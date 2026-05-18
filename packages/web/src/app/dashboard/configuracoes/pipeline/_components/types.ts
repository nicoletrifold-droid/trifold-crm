export interface Stage {
  id: string
  name: string
  slug: string
  type: string
  position: number
  color: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
}
