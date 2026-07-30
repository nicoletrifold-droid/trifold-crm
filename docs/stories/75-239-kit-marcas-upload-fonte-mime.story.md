# Story 75-239 — Kit de Marcas: upload da fonte falhava com "mime type application/octet-stream is not supported"

**Status:** Done
**Tipo:** Bug
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** S

## Contexto
Depois da 75-234 (que consertou o layout e trouxe o "Anexar arquivo" da fonte), a
equipe voltou ao modal "Editar marca — Vind Residence" e o envio da fonte
continuou falhando:

> Falha no envio de "Montserrat-Italic-VariableFont_wght.ttf": mime type
> application/octet-stream is not supported

O erro `fonte do papel "Montserrat" sem nome` visto no dia 29/07 **já não
existe** — era a 75-230 e morreu na 75-234 (mensagem e ordem dos campos
trocadas). Os dois prints reportados juntos são de versões diferentes.

## Causa raiz
A 75-234 partiu de uma premissa falsa. Ela decidiu **não** aceitar
`application/octet-stream` no bucket (QA item 6, correto) e mandar o mime
canônico derivado da extensão via `options.contentType` do `uploadToSignedUrl`.
Só que **`uploadToSignedUrl` ignora `contentType` quando o corpo é `Blob`/`File`**
— exatamente o caso do navegador:

```js
// @supabase/storage-js 2.101.1, uploadToSignedUrl
if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
  body = new FormData()
  body.append("cacheControl", options.cacheControl)
  body.append("", fileBody)          // ← nada de contentType aqui
} else {
  headers["content-type"] = options.contentType   // só neste caminho
}
```

Como o corpo vai num `FormData`, o Storage lê o mime **da parte do form**, que
vem do `File.type` que o navegador atribuiu — e o Chrome reporta `.ttf` como
`application/octet-stream`. O bucket (mig 199, 13 mime types, sem
octet-stream — confirmado em prod) recusava. O `contentType` que o código
passava nunca chegou a sair na requisição.

## Entrega
- Novo helper puro `brandAssetUploadBody(file)` em `lib/marketing/brands.ts`:
  **reembala** o arquivo (`new File([file], file.name, { type: mimeCanônico })`)
  quando o navegador errou o mime. É o único jeito de o mime canônico valer no
  caminho Blob/FormData. Devolve o próprio arquivo quando o navegador já acertou
  (imagens) ou quando a extensão é desconhecida (a rota `/assets/sign` já
  recusa antes).
- `marcas-section.tsx` usa o helper no `uploadOne` — vale para os dois fluxos
  (fonte por linha e imagens/logo/ícone), edição e criação.
- Comentário 🔥 GOTCHA no helper documentando o comportamento do SDK, para a
  próxima pessoa não voltar a confiar no `contentType`.
- Corrigido comentário obsoleto em `isAllowedBrandAssetFile` que dizia que o
  bucket aceitava octet-stream (a mig 199 nunca aceitou — contradizia o schema).

### Fora de escopo (decisão)
Aceitar `application/octet-stream` no bucket resolveria o sintoma em uma linha,
mas foi **rejeitado no QA da 75-234** (bucket público não deve aceitar bytes
arbitrários). Mantida a decisão.

## Arquivos
- `packages/web/src/lib/marketing/brands.ts`
- `packages/web/src/lib/marketing/brands.test.ts` (4 casos de regressão)
- `packages/web/src/app/dashboard/campaigns/agente/marcas-section.tsx`

Sem migração — o bucket em prod já está correto.

## Raio de impacto
- Varredura de `uploadToSignedUrl` no repo: além do Kit de Marcas, só
  `obras/documentos` e `lancamentos/attachments`. Os buckets desses dois têm
  `allowed_mime_types = null` (verificado em prod), então nunca sofreram do bug
   — nada a mudar lá.
- Imagens do Kit seguem idênticas: o navegador acerta `image/png` etc., e o
  helper devolve o mesmo objeto `File` (teste cobre).

## QA Results
**PASS.** A causa raiz foi provada contra o Storage REAL (projeto dev), replicando
byte a byte o que o SDK faz (FormData com o File dentro, `contentType` só no
header que o Storage ignora):

| Parte do FormData | Resultado |
|---|---|
| `application/octet-stream` (o que o Chrome manda) | `400 invalid_mime_type — mime type application/octet-stream is not supported` — **a mensagem exata do print** |
| `font/ttf` (após `brandAssetUploadBody`) | `200 OK` |

O objeto gravado é servido com `content-type: font/ttf` — ou seja, a prévia
`@font-face` da 75-234 continua funcionando. Objeto de teste removido do bucket.

## Validação
- `brands.test.ts`: 22 casos passando, incluindo o `.ttf` com
  `type: "application/octet-stream"` → sai `font/ttf` com nome e tamanho
  preservados.
- Suíte completa: **1289/1289** · `tsc --noEmit` limpo · eslint sem erros (18
  warnings pré-existentes, nenhum nos arquivos tocados) · `next build` OK.
- ✅ LIVE: PR #313 squash-merged (`0382b209`), deploy de produção concluído;
  smoke anônimo OK (`/dashboard/campaigns/agente` 307, `/api/marketing-brands` 401).
- Pendente: teste real da equipe subindo a Montserrat na marca Vind Residence
  (o caminho do navegador só fecha com o arquivo de verdade no Chrome dela).
