# Story 900-12 — buckets com PII privados: análise e quebra em 12a/12b

**Status:** análise concluída, implementação **não iniciada**. Draft de 2026-08-23.

O epic estimou a `900-12` como **G** e a validação do @po sugeriu quebrá-la em "preparação
reversível / flip irreversível". O levantamento abaixo confirma a quebra e mostra que **a linha de
corte não é a que o epic imaginava** — ela é definida por *quem consome a URL*.

---

## O problema, verificado em produção

`obra-fotos` e `nicole-media` são buckets **públicos**. Em bucket público, a policy de SELECT é
irrelevante: a URL basta. Verificado após a `900-11`:

```
GET /storage/v1/object/public/obra-fotos/obras/{obra_id}/fotos/{arquivo}  →  HTTP 200
```

Ou seja: as policies org-scoped criadas pela `900-11` **não protegem estes dois buckets**. Quem
tiver o link lê o arquivo, de qualquer empresa.

---

## A linha de corte: quem consome a URL

| Bucket | Consumidores | Todos internos? |
|---|---|---|
| **obra-fotos** | `dashboard/obras/[obra_id]/page.tsx`, `obra-detail-tabs.tsx`, `cliente/[obra_id]/fotos/page.tsx`, `fotos-grid.tsx`, 2 rotas de admin | ✅ **sim** |
| **nicole-media** | `webhook/whatsapp/route.ts`, `leads/[id]/send-file/route.ts`, `nicole/media/route.ts`, `lib/media/inbound-media.ts` | ❌ **não** |

### `nicole-media` tem um consumidor externo — e isso muda tudo

`send-file/route.ts:139` monta a URL pública e **a entrega à WhatsApp Cloud API**: quem baixa o
arquivo é a **Meta**, não o nosso frontend.

```ts
const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath)
const fileUrl = pub.publicUrl        // ← vai no payload para a Meta
```

Tornar o bucket privado sem resolver isso **quebra o envio de mídia por WhatsApp em produção**.

E há uma pergunta em aberto que não dá para responder por leitura de código: **a Meta rebaixa o
arquivo depois?** Se houver re-entrega, retentativa ou cache com refetch, uma URL assinada de
validade curta expira e a mídia falha *depois* do envio parecer bem-sucedido — falha silenciosa e
difícil de diagnosticar. Isso precisa ser verificado contra a documentação da Cloud API ou medido,
não presumido.

---

## Quebra proposta

### `900-12a` — `obra-fotos` privado + URL assinada *(seguro, reversível)*
Todos os 6 consumidores são nossos. O caminho é: helper de URL assinada → trocar os 6 pontos →
flipar o bucket para privado. Reversível a qualquer momento (basta reabrir o bucket).

**Fecha a exposição de fotos de obra, que é PII de cliente.**

### `900-12b` — `nicole-media` privado *(depende de resposta externa)*
Bloqueada pela pergunta da Meta acima. Antes de qualquer código:
1. Determinar se a Cloud API rebaixa a mídia após o envio inicial.
2. Se rebaixar: a saída não é URL assinada — é **fazer upload do binário para a Meta** (endpoint de
   media da Cloud API) e enviar por `media_id`, que é o padrão recomendado e não depende de URL
   nossa nenhuma.
3. Só então flipar.

**Não juntar 12a e 12b.** `obra-fotos` está a um passo de ser protegido; prendê-lo a uma pergunta
sobre integração externa adiaria a correção de PII por tempo indeterminado.

---

## Recomendação

Fazer a **`900-12a`** em seguida — ela fecha exposição real de PII, tem escopo fechado e é
reversível. A **`900-12b`** precisa primeiro da resposta sobre a Meta, e essa resposta muda a
solução inteira (URL assinada × upload por `media_id`).
