# Story 75-356 — Variável vazia não sai: o "Oi !" que quase chegou ao lead

**Status:** InReview — gate PASS · sem migration
**Tipo:** Defeito pego ANTES do primeiro envio (medição, não teste)
**Epic:** 75 — CRM Trifold
**Complexidade:** XS (~1 pt — uma guarda na função pura + 3 acentos)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Depende de:** 75-353 e 75-355, ambas em produção.

## Como apareceu

O Marcos pediu versões novas para a cópia da regra de Atendimento. Antes de escrever texto, fui olhar
quais variáveis aquele texto e aquele template usam — e quantos leads da etapa têm cada dado:

| Variável | Situação em Atendimento (125 leads) |
|---|---|
| `{{1}}` nome | 🔴 **6 leads sem nome** · 37 com nome de uma palavra (isso é bom, é o primeiro nome) |
| `{corretor}` | ✅ zero leads sem corretor |
| `{empreendimento}` | ⚠️ 13 sem empreendimento; fallback era `"seu imovel"`, **sem acento** |

O template escolhido (`abertura_interesse_prioridades`) começa com `Oi {{1}}!`. Para os 6 sem nome sairia:

> Oi **!** Tudo bem?
>
> Vi que você demonstrou interesse em buscar um imóvel recentemente…

Mensagem **paga**, para o lead, com o buraco à mostra. E a run das 14:00 seria a primeira a incluí-los,
porque a 75-355 acabou de torná-los alcançáveis.

**Mitigação imediata (config, antes da run):** `hsm_template` da etapa Atendimento desligado às 13:3x
UTC. Nenhuma mensagem quebrada saiu. Religar é uma linha, depois desta story.

## AC1 — Nenhum parâmetro vazio chega à Meta

`decidirTemplateDoFollowUp` passa a barrar quando **qualquer** parâmetro resolvido está vazio ou só com
espaços, devolvendo `VARIAVEL_VAZIA` e a posição (`{{n}}`) que faltou.

Genérico de propósito: hoje morde o nome, mas o mesmo furo existiria em `{{2}}`/`{{3}}` de
`abertura_atendimento_corretor` — coberto por teste.

**Não enviar é melhor que enviar quebrado:** o lead continua no funil, o corretor pode preencher o nome,
e a run seguinte manda certo. O motivo aparece na atividade em português ("faltou dado do lead para
preencher o template"), então "não saiu" tem explicação em vez de virar mistério.

## AC2 — O fallback de empreendimento ganha acento

`"seu imovel"` → `"seu imóvel"` e `"o imovel"` → `"o imóvel"`, nos três lugares que **vão para o lead**
(cron de follow-up, pós-visita do cron, pós-visita da porta do corretor). Texto que o cliente lê não
sai sem acento.

## Descoberta que mudou a prioridade do pedido original

**`nicole_sent` entregues na etapa Atendimento em 30 dias: zero** — e é estrutural, não azar. A regra
dispara com 3+ dias sem contato, e qualquer mensagem do lead atualiza `last_contact_at` (trigger
`bump_lead_last_contact`). Logo, quando a regra dispara, a janela de 24h está **necessariamente**
fechada: **o texto livre daquela regra é praticamente inalcançável**.

Consequência prática: a cópia que o Marcos pediu para revisar quase nunca vai ao ar — quem fala com o
lead é o template. A revisão continua valendo (o texto está errado e é visível na tela de config), mas
como faxina, não como conserto. Fica registrado para não se gastar decisão de negócio com peso errado.

## Dev Agent Record

- [x] AC1 — guarda `VARIAVEL_VAZIA` + posição da variável; 3 testes novos.
- [x] AC2 — acento nos três fallbacks que chegam ao lead.
- [x] Mitigação — template desligado por config antes da run das 14:00.

### Validações

`npx vitest run` 233 arquivos / **2.833 testes** ✅ (3 novos) · `type-check` 8/8 ✅ · `eslint` 0 erros.

## File List

- `packages/web/src/lib/followup/template-fallback.ts` — AC1
- `packages/web/src/lib/followup/template-fallback.test.ts` — 3 testes
- `packages/web/src/app/api/cron/followup/route.ts` — AC1 (motivo legível) / AC2
- `packages/web/src/lib/appointments/visit-feedback-core.ts` — AC2
- `docs/qa/gates/75-356-guarda-variavel-vazia.yml` *(novo)*

## Depois do merge

1. **Religar** o template: `hsm_template = 'abertura_interesse_prioridades'` na etapa Atendimento.
2. Na run seguinte, conferir que os 6 leads sem nome aparecem como `VARIAVEL_VAZIA` no
   `follow_up_log.metadata` — e que os outros receberam:
   ```sql
   select metadata->>'motivo_sem_template' as motivo, count(*) from follow_up_log
    where type='nicole_sent' and created_at > now() - interval '3 hours' group by 1;
   ```
3. **Preencher o nome dos 6** é trabalho de quem opera — a mensagem só sai quando o dado existir.
