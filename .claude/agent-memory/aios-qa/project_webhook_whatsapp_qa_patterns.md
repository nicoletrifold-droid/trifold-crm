---
name: webhook-whatsapp-qa-patterns
description: Armadilhas ao revisar o webhook do WhatsApp (texto sintético que vira turno do lead, trigger 038, snapshot de prod, gate que suja a árvore)
metadata:
  type: project
---

Quatro coisas que economizam (ou evitam) horas ao revisar `packages/web/src/app/api/webhook/whatsapp/route.ts`.

**1. Texto sintético vira turno do LEAD dentro da Nicole.**
Quando um branch fabrica `text` para um tipo não-textual (`"[Vídeo recebido — o CRM ainda não exibe vídeos]"`),
esse `text` vira `asyncText` → `processMessageWithMetadata({ message: asyncText })` → resposta gerada → **enviada
por `fetch` ao Cloud API**. O modelo lê a frase como se o LEAD a tivesse escrito, e o lead recebe a resposta.
**Why:** medido em runtime (probe com `pipelineMock`), não inferido — `sticker` e `video` chegaram à Nicole com
a string entre colchetes em `message`. **How to apply:** sempre que um webhook inventar `text`, provar por probe
se `acionaNicole`/pipeline é atingido; ler o código não basta porque a flag é decidida ~150 linhas antes.

**2. `conversations.last_message_at` NÃO precisa de UPDATE na rota.**
Trigger `trg_messages_update_conv` (migration 038, função `update_conversation_last_msg`) roda AFTER INSERT em
`messages` e escreve `last_message_at`, `last_message_preview`, `last_message_role`. **Why:** evita o falso
positivo "o early-return pulou a atualização da conversa". **How to apply:** o `supabase.from("conversations")
.update({last_message_at})` dentro do `after()` é redundante — pular não é defeito.

**3. `docs/audits/schema-snapshot.json` é foto da PRODUÇÃO.**
`source: management-api`, `projectRef: dsopqkqjkmhytudaaolv`. Traz `functions` (com corpo) e `policies` (com
`qual`) — dá para confirmar função/policy em prod **sem credencial**. Não traz constraints nem triggers.
**How to apply:** usar para checar RLS e existência de função; para CHECK constraint, ler as migrations.

**4. `pnpm gate:tenancy` SUJA a árvore.** Reescreve `docs/audits/gate-tenancy-report.json`. Rodar e depois
`git checkout -- docs/audits/gate-tenancy-report.json`. Ele também imprime a catraca (baseline 83 FAIL) e
avisa sozinho que não vê "rota em service-role sem `.eq('org_id')`".

Relacionado: [[reverificacao-focada]] (turbo `--force`), [[mutacao-prova-teste-real]].
