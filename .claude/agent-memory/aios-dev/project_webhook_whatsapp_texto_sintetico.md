---
name: webhook-whatsapp-texto-sintetico-vira-fala-do-lead
description: Todo `text` que o webhook do WhatsApp monta entra no pipeline da Nicole como se fosse fala do lead e pode virar resposta enviada ao cliente — texto que descreve limitação do CRM não pode acionar a IA
metadata:
  type: project
---

Em `packages/web/src/app/api/webhook/whatsapp/route.ts`, o `text` montado no bloco de tipos
inbound é a MESMA string que (a) vira o `content` da bolha, (b) é lida pelo corretor e (c) chega
ao `processMessageWithMetadata` como turno do lead — e a resposta da Nicole é **enviada ao
WhatsApp do cliente**. Não há camada que separe "texto sintético do CRM" de "o que o lead
escreveu".

**Why:** ao cobrir os tipos que o webhook descartava (gate de 01/09/2026), os branches `video` e
`sticker` herdaram `acionaNicole = true` e seus textos descrevem uma limitação nossa ("o CRM ainda
não exibe vídeos"). Lead manda vídeo da obra → a Nicole responde ao lead sobre o nosso sistema.
Linguagem interna de produto vazando para o cliente, sem nenhum teste dizendo o contrário — o
defeito nasceu de OMISSÃO, não de código errado.

**How to apply:**
- Ao acrescentar um tipo inbound, decidir explicitamente **duas** flags independentes:
  `acionaNicole` e `notificaCorretor`. Elas divergem de propósito (reação: nenhuma das duas;
  `system`: nenhuma das duas mas por outro motivo; `video`/`sticker`/desconhecido: só push) e
  alguém vai querer "simplificar" unificando.
- Regra prática: se o texto fala do CRM em vez de falar do lead, `acionaNicole = false`.
- Afirmar a decisão em teste para o tipo novo **e** para os que não mudaram — regra não escrita
  vira regra indefinida.
