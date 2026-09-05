---
name: ponte-do-client-nao-provada
description: Teste que prova ".eq() foi chamado" + medição em produção por URL crua deixam o elo do meio (supabase-js traduz um no outro) sem prova — feche capturando a URL real com fetch falso
metadata:
  type: feedback
---

Quando a evidência de um filtro vem em duas metades — um teste unitário que prova que a rota
**chamou** `.eq("tabela_embed.coluna", valor)`, e uma medição em produção que prova que a **URL**
`tabela_embed.coluna=eq.valor` filtra — **falta o elo do meio**: que o supabase-js traduz a
chamada naquela URL. Nenhuma das duas metades prova isso.

**Why:** as duas metades parecem cobrir tudo e passam a sensação de prova completa. Mas o
supabase-js pode normalizar, reordenar ou engolir o filtro (e de fato normaliza: apaga os espaços
de `select("*, t!inner(a, b)")` → `select=*,t!inner(a,b)`). Se ele mandasse o `.eq` do embed como
coluna literal da tabela raiz, o teste continuaria verde e a medição manual continuaria válida —
e o filtro estaria decorativo em produção. Foi a única lacuna real achada no gate da 75-372.

**How to apply:** feche a ponte sem rede e sem credencial. Client REAL do supabase-js com `fetch`
capturado, e então importe a rota de verdade:

```ts
const h = vi.hoisted(() => {           // hoisted: vi.mock sobe pro topo e quebra sem isso
  const urls: string[] = []
  const fakeFetch = async (input: unknown) => {
    urls.push(String((input as { url?: string }).url ?? input))
    return new Response("[]", { status: 200,
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } })
  }
  return { urls, fakeFetch }
})
vi.mock("@web/lib/api-auth", async () => {
  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient("http://sb.local", "anon-key", {
    global: { fetch: h.fakeFetch as unknown as typeof fetch }, auth: { persistSession: false } })
  return { requireAuth: async () => ({ error: null, appUser: { id: "u1", org_id: "org1" }, supabase }) }
})
import { GET } from "@web/app/api/.../route"
// depois: decodeURIComponent(h.urls[0]) e comparar com a URL medida em produção
```

Compare a URL capturada **byte a byte** com a que foi medida contra o banco. Se baterem, o AC
passa a ter prova de ponta a ponta sem escrever nada em produção.

Duas armadilhas medidas:
- `vi.mock` é hoisted — variável de topo referenciada na factory dá
  `ReferenceError: Cannot access 'x' before initialization`. Use `vi.hoisted()`.
- o supabase-js **remove os espaços** do `select`. Assertar
  `"t!inner(nome, tamanho, cor)"` falha; o que sai é `"t!inner(nome,tamanho,cor)"`.

Relacionado: [[mutacao-prova-teste-real]], [[reverificacao-focada]].
