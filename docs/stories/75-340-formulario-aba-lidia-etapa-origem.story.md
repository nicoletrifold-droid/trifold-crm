# Story 75-340 — Formulários: aba Lídia sumindo, visita que não move a etapa, origem congelada

**Status:** Ready for Review
**Tipo:** Bug fix (3 defeitos independentes, mesma tela de origem)
**Epic:** 89 — Formulário de qualificação para tráfego pago
**Story ID:** 75-340
**Complexidade:** M (~5 pts — 1 regra de pipeline revisada em 4 pontos de agendamento, 0 migrations)
**Fluxo:** @dev → @qa → @devops
**Depende de:** 75-330 a 75-339 (aba Formulários já em produção)
**Migrations:** **nenhuma**.

## O pedido (Marcos, 18/08)

> *"Se você ver que quando clicamos em Formulário a aba Lídia apaga. Outra coisa, os leads que
> preencherem o formulário todo, exemplo Lucas Teste, foi certinho para agenda, porém o mesmo
> não foi para o pipeline na etapa visita agendada — se ele agendou visita, já tem que ir para
> esta etapa. E a origem do lead não está pegando o último local de origem, que no caso seria o
> formulário: está pegando o que o CRM já tinha na base."*

Decisão do diretor na mesma conversa: a correção da etapa vale para **todo agendamento**, não só
o do formulário — regra única, sem divergência entre canais.

---

## AC1 — A aba "Lídia" não desaparece ao entrar em Formulários

**Causa:** `formularios/page.tsx` passava `showAgente={false}` fixo para o `CampaignsTabs`.

Ironia registrada: o cabeçalho do próprio `CampaignsTabs` (Story 75-333) existe para impedir
exatamente esta falha — "uma barra que PERDE a aba conforme a tela em que você está". A 75-333
matou a versão por **cópia** do bug e a 75-333 mesma reintroduziu a versão por **valor**.

**Correção:** a aba segue a capability real — `can(user.id, user.orgId, "marketing.gerenciar")`,
igual às outras três telas de Campanhas.

## AC2 — Visita agendada leva o lead para a etapa "Visita Agendada"

**Causa:** o guard `advanceToVisitaAgendada` (Story 75-196) era uma **allowlist** de etapas de
partida: `novo`, `em_qualificacao`, `qualificado`, `no_show`. Qualquer outra ficava parada.

O "Lucas Teste" estava em **Perdido** (`lost_reason: "teste"`) — agendou pelo formulário e
continuou em Perdido. E não era só o caso dele: lead vindo de `importar_crm` (entrada do Supremo
CRM), de `acao_muffato` ou de `represamento` também agendava e não saía do lugar. Allowlist erra
em silêncio a cada etapa nova criada no kanban.

**Correção:** a regra virou **blocklist** — `VISITA_AGENDADA_NAO_REGRIDE` = `visitou`,
`proposta`, `negociando`, `fechou`. De qualquer outra etapa (inclusive `NULL` e Perdido) o lead
avança. O guard continua no WHERE do UPDATE, não é read-then-write.

**`lost_reason` e `lost_reason_grupo` são limpos no mesmo UPDATE.** Não é cosmético: o Pipeline
— inclusive o IMOB — filtra `lost_reason IS NULL`. Sem limpar, o lead entraria na etapa e
continuaria invisível no quadro, que é o defeito de novo com outra roupa.

**Trilha:** sair de Perdido gera activity `lead_reactivated` (`automatico: true`, etapa e motivo
anteriores no metadata). Sem isso a timeline mostra lead perdido mudando de etapa sem
explicação. Rótulo e ícone já existiam na timeline.

**Os 4 pontos de agendamento cobertos:**

| Ponto | Arquivo | Origem na trilha |
|---|---|---|
| Formulário público | `api/formulario/[token]/agenda/route.ts` | `formulário "{nome}"` |
| Link da imobiliária | `api/agendar/[token]/route.ts` | `link da imobiliária {nome}` |
| Agenda do CRM | `api/appointments/route.ts` | `agendamento no CRM` |
| Nicole (WhatsApp) | `packages/ai/src/chat/pipeline.ts` | `visita agendada pela Nicole` |

O pipeline da Nicole vive no pacote `ai` e não pode importar de `web` — por isso a activity é
inline lá, usando `PERDIDO_STAGE_IDS` que subiu para o `shared` nesta story (os dois UUIDs
estavam copiados em quatro lugares).

**Pipeline IMOB:** confirmado que usa as MESMAS etapas (`kanban_stages`), filtrando por
`segmento='imob'`. O guard nunca toca `segmento`, então o lead imob avança na etapa e segue
aparecendo só no quadro dele — era a dúvida levantada pelo Marcos.

## AC3 — A origem passa a ser a do último contato

**Causa:** deliberada até aqui. O código dizia, em comentário, "lead que já existia NÃO tem a
origem reescrita: quem chegou antes pelo Meta Ads continua sendo do Meta Ads".

Na ficha do lead a Origem é `source` — e, quando `source='website'`, o `utm_content`. Daí o
"LP Vind Residence" aparecendo para quem tinha ACABADO de preencher o formulário novo: o
corretor lia a origem errada e ligava falando da campanha errada.

**Correção:** ao reconhecer um lead que já existe, o formulário grava
`source='form_qualificacao'`.

Dois cuidados que a correção mantém:
- **UTM só é sobrescrita se ESTA visita trouxe UTM** — link sem parâmetro não apaga a atribuição
  existente.
- **A origem anterior não se perde:** vai para `metadata.origem_anterior` (`source`,
  `utm_content`, data) e para a activity `lead_source_updated`, que só é gravada quando a origem
  realmente mudou (segundo preenchimento do mesmo formulário não repete).

---

## Testes

| Arquivo | O que cobre |
|---|---|
| `packages/shared/src/leads/advance-to-visita-agendada.test.ts` | 18 casos — blocklist, `perdido`/`importar_crm`/`acao_muffato`/`represamento` avançando, `visitou`/`proposta`/`negociando`/`fechou` NÃO regredindo, limpeza de `lost_reason` |
| `packages/web/src/lib/leads/advance-visita-agendada.test.ts` (novo) | reativação + activity, `lost_reason` residual, e o caso de borda "perdido em etapa posterior não é reativado de mentira" |
| `packages/web/src/app/api/formulario/[token]/route.test.ts` (novo) | origem do último contato, UTM ausente não apaga a anterior, UTM nova sobrescreve, activity não repete, lead novo inalterado |
| `packages/web/src/app/api/formulario/[token]/agenda/route.test.ts` | atualizado: a rota chama o helper com o lead e a origem certos |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | fake passou a entender `not.in` no `.or()` — sem isso o novo guard quebrava 12 testes do pipeline |

**Validações:** 208 arquivos / 2612 testes passando · `type-check` 8/8 · `lint` 0 erros.

## File List

- `packages/shared/src/constants/stages.ts` — `nao_qualificado` + `PERDIDO_STAGE_IDS`
- `packages/shared/src/leads/advance-to-visita-agendada.ts` — allowlist → blocklist, limpa perda
- `packages/shared/src/leads/advance-to-visita-agendada.test.ts`
- `packages/web/src/lib/leads/advance-visita-agendada.ts` *(novo)* — guard + trilha de reativação
- `packages/web/src/lib/leads/advance-visita-agendada.test.ts` *(novo)*
- `packages/web/src/lib/leads/stage-filters.ts` — reexporta do shared
- `packages/web/src/app/api/formulario/[token]/route.ts` — origem do último contato
- `packages/web/src/app/api/formulario/[token]/route.test.ts` *(novo)*
- `packages/web/src/app/api/formulario/[token]/agenda/route.ts`
- `packages/web/src/app/api/formulario/[token]/agenda/route.test.ts`
- `packages/web/src/app/api/agendar/[token]/route.ts`
- `packages/web/src/app/api/appointments/route.ts`
- `packages/web/src/app/dashboard/campaigns/formularios/page.tsx` — AC1
- `packages/web/src/app/dashboard/leads/[id]/timeline/page.tsx` — rótulos `form_completed` e `lead_source_updated`
- `packages/ai/src/chat/pipeline.ts` — activity de reativação
- `packages/ai/src/chat/__fixtures__/fake-supabase.ts`

## Dado existente em produção (fora do código)

Varredura em 18/08 nas visitas ativas: **1 lead** ficou com visita marcada e etapa errada —
"Lidia", em Perdido (`lost_reason: "Sem interação"`), visita 22/08 14:00. O "Lucas Teste" já não
conta: a visita dele foi cancelada depois, então Perdido é coerente.

O código novo só age em agendamentos futuros. Ajustar esse 1 registro é escrita em produção e
aguarda decisão do Marcos.
