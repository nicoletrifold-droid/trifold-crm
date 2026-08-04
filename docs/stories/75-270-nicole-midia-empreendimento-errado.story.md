# Story 75-270 — Planta do Vind no papo do Yarden (e "comprar na planta" não é pedir planta)

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-04
**Formato:** Correção de bug com incidente real em prod
**Origem:** Marcos, 04/08/2026 — "a Nicole ofereceu o Yarden e foi ótimo, porém ela mandou a planta do Vind quando o assunto já era outro"

---

## Story

**Como** quem construiu um acervo de mídia por empreendimento para a Nicole usar,
**Quero** que a imagem que ela manda seja do empreendimento de que ela está falando **naquela
resposta**,
**Para que** um pivô bem feito de produto não seja desmentido pela imagem que chega dois segundos
depois.

---

## Context — o incidente da Orlice (lead `09f6294f…4830`, 03/08 17:40)

A Orlice veio pelo **Vind**. No meio da conversa ela explicou, por áudio, que quer outra região —
perto da Cidade Alta, onde os filhos moram — e que 2027 é cedo demais. A Nicole leu isso muito bem e
**pivotou para o Yarden**:

> "Entendi, Orlice! Faz todo sentido querer algo mais próximo da família.
> Temos o **Yarden Residence**, que é nosso lançamento mais recente — obras já iniciadas, com
> previsão de entrega para 2029. Fica na Gleba Itororó… a partir de 79m², com rooftop exclusivo…"

Dois segundos depois saiu, sozinha, uma imagem: **`[Mídia enviada] Planta`**. Conferido no banco pelo
`media_asset_id` da mensagem:

```
asset "Planta" → property = Vind Residence     ← 66,91m², logo da Vind na arte
```

A conversa era Yarden. A imagem era Vind. São **duas** falhas independentes:

### Falha A — "comprar na planta" virou pedido de planta baixa

A frase da Orlice (áudio transcrito) foi:

> "…eu tô vendendo a minha casa, daí que eu queria comprar um **na planta**. Quando tivesse, assim,
> lançando, sabe?"

"Comprar na planta" é comprar em lançamento — não é pedir o PDF da planta baixa. O `PLANTA_RE`
(`packages/web/src/lib/ai/send-library-media.ts:38`) casa `\bplantas?\b` sem olhar a vizinhança, e
tipos específicos são **auto-sinalizadores** por desenho (`detectMediaRequest`, linha 63: não exigem
sinal de pedido). Resultado: homônimo do mercado imobiliário dispara envio.

### Falha B — a mídia é resolvida ANTES da fala, e não pode acompanhar o pivô

Em `packages/web/src/app/api/webhook/whatsapp/route.ts:833`, `resolveSendableMedia` roda **antes** de
`processMessage` — de propósito, para a Nicole não prometer imagem que não sairia (Story 75-157). Mas
isso fixa o empreendimento **antes** de ela decidir sobre o que falar, e a preferência é
`leads.property_interest_id` (`send-library-media.ts:251-256`), que naquele instante ainda era Vind.

Estruturalmente: **um pivô de produto feito na resposta nunca chega à mídia daquele turno.** Não é
um caso de borda — é o caminho normal de todo lead que troca de empreendimento no meio da conversa.

O caption piora: é só `asset.title` ("Planta"), sem o nome do empreendimento. Nada avisa a Orlice de
que aquela planta é de outro produto — ela conclui, razoavelmente, que o Yarden tem 66,91m².

### Falha C (bônus, mesmo lead, 17:37) — prometeu duas mídias, mandou uma

> "Já te mandei aqui algumas fotos **e a planta**, dá uma olhada."

Saiu **um** asset: `Localização`. O `mediaContext.willSend` (75-157) existe exatamente para a fala não
prometer além do que vai sair; nesse turno a fala furou o contrato.

---

## Os três itens

### Item 1 — "na planta" não é pedido de planta

`PLANTA_RE` ganha guarda de contexto: `na planta`, `comprar na planta`, `imóvel na planta`,
`ainda na planta`, `compra na planta` **não** disparam. "Me manda a planta", "planta baixa",
"metragem", "qual a planta do 79m²" continuam disparando.

### Item 2 — a mídia segue o empreendimento da resposta

O empreendimento do envio passa a ser reconciliado **depois** da fala, sem perder a checagem
pré-fala:

1. `resolveSendableMedia` continua rodando antes (a fala precisa saber se haverá imagem);
2. depois de `processMessage`, se a resposta da Nicole nomeia um empreendimento **diferente** do
   resolvido, o envio é **re-resolvido** para esse — e, se não houver asset do tipo pedido lá, **não
   envia nada** (melhor silêncio que imagem errada) e loga `nicole_media_property_pivot`.

O `identifiedPropertyId` do pipeline é o candidato natural de fonte — checar o que ele já devolve
antes de reimplementar match por nome (ver `identify-property.ts`).

### Item 3 — caption diz de qual empreendimento é

`caption` passa a ser `"{Empreendimento} — {título}"` ("Yarden Residence — Planta"). Barato, e
transforma um erro silencioso em erro visível.

---

## Acceptance Criteria

- **AC1** — `detectMediaRequest("queria comprar um na planta")` → `[]`. Idem "imóvel na planta",
  "ainda na planta", "compra na planta".
- **AC2** — `detectMediaRequest("me manda a planta")`, `"planta baixa"`, `"qual a metragem"`
  continuam retornando `planta` (nenhuma regressão nos testes existentes de
  `send-library-media.test.ts`).
- **AC3** — Cenário Orlice: `property_interest_id = Vind`, resposta da Nicole nomeia Yarden →
  **nenhum** asset do Vind é enviado.
- **AC4** — No mesmo cenário, havendo asset do tipo pedido no Yarden, é o do **Yarden** que sai; não
  havendo, nada sai e o skip fica logado com o motivo.
- **AC5** — Caption de toda mídia da biblioteca traz o nome do empreendimento.
- **AC6** — A fala não promete mídia além de `mediaContext.willSend` (guardrail de prompt — **também
  em `agent_prompts` no banco**).
- **AC7** — Validação em prod: um lead que troca de empreendimento no meio da conversa recebe (ou
  não recebe) mídia coerente com a última fala da Nicole.

---

## Dev Notes

- `messages` **não tem** `org_id` — não incluir no INSERT (já documentado em
  `send-library-media.ts:389`, foi bug real da 56-3).
- Dedup por `metadata.media_asset_id` continua valendo; re-resolver por pivô **não** pode reenviar
  asset já mandado.
- Ordem no webhook (833 → 954) é intencional (75-157). Este trabalho **acrescenta** uma
  reconciliação; não inverte a ordem nem remove a checagem pré-fala.
- Rodar `npm test -- send-library-media`.

## Fora de escopo

- Hora sem "h" / visita que não entra na agenda → **story 75-268**.
- Gerar planta do Yarden que não existe no acervo: se falta asset, o certo é faltar — cadastro é
  operação, não código.
- A questão da fachada gerada por IA (#343) segue independente.
