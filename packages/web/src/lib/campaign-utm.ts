export interface ImageVariant {
  variant_id: string
  link_url: string | null
  image_url: string
}

function appendUtm(url: string, variantId: string): string {
  if (url.includes("utm_content=")) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}utm_content=${variantId}`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function injectUtmToHtml(html: string, images: ImageVariant[]): string {
  if (!images.length) return html

  let result = html
  for (const image of images) {
    if (!image.link_url) continue
    const linkWithUtm = appendUtm(image.link_url, image.variant_id)
    if (linkWithUtm === image.link_url) continue

    const escaped = escapeRegex(image.link_url)
    const re = new RegExp(`(href=["'])${escaped}(["'])`, "gi")
    result = result.replace(re, `$1${linkWithUtm}$2`)
  }

  return result
}
