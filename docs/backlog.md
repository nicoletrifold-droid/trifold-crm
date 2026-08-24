# Backlog — Tarefas Pendentes

Tarefas operacionais, configurações e ajustes pendentes que não requerem uma story completa.

---

## Pendente

### [CI] 🔴 Nada compara o `schema-snapshot.json` commitado com o schema real do banco

**Adicionado em:** 2026-08-24
**Prioridade:** P1 (candidata à story de migração das rotas `900-15` ou à `900-18`, que torna o gate bloqueante)
**Origem:** Validação @po da Story `900-14b` (hotfix do deploy travado), AC5 — pergunta levantada pelo dono do produto

O AC5 da `900-14b` garante que `org-scoped-tables.generated.ts` ≡ `docs/audits/schema-snapshot.json`
**commitado**. Não garante que o JSON esteja em dia com o banco — e essa lacuna é **anterior** ao
hotfix: a `900-14` já lia o mesmo JSON commitado.

Hoje nenhum gate fecha essa porta. `scripts/gate-tenancy.ts` introspecta ao vivo e a **R3** acusa
*tabela nova sem `org_id`*; uma tabela nova **com** `org_id` que não entrou no snapshot passa em
silêncio — e o efeito é `createOrgScopedAdminClient()` **deixar de escopá-la**, exatamente o modo de
falha silencioso que a `900-14` existe para eliminar. Agrava: o job `tenancy-gate` do
`.github/workflows/ci.yml` é `continue-on-error: true`.

**Ação:** regra/passo que compara a introspecção ao vivo com o snapshot commitado e falha no diff
(com PAT, portanto no job que já tem o secret), ou torna a defasagem visível no comentário do PR.
Enquanto não existir, o frescor da lista depende de alguém rodar `pnpm gate:tenancy:snapshot`.

---


### [CI] 🔴 Job de diff de `agent_prompts` — a única rede contra a paridade apodrecer de novo

**Adicionado em:** 2026-08-05
**Prioridade:** P1 (mesma sprint da Story 87-0 — condição nº 10 do @architect)
**Origem:** Validação @po da Story 87-0 (`docs/qa/po-validation-87-0.md`), Nota de tensão sobre D5

Com a decisão **D-87-0-a** (o painel admin é a fonte da verdade dos prompts), o git deixa de ser a
rede contra divergência: qualquer save no painel pode reintroduzir o fork que causou o incidente de
05/08. A Story 87-0 entrega o script (`scripts/dump-agent-prompts.ts --check`, exit ≠ 0 na
divergência) mas **não** o fia na CI — isso é a story de **D5**, do @devops.

Sem este job, a AC3 da 87-0 (diff vazio) é uma foto de um instante. Palavras do @architect:
*"é o único jeito de a paridade não voltar a apodrecer em 4 meses"*.

**Ação:** criar o workflow em `.github/workflows/` (hoje `.github/` tem 11 arquivos de agente e
**nenhum** workflow) rodando `npx tsx scripts/dump-agent-prompts.ts --check` em PR e diariamente,
com o PAT de leitura do projeto `dsopqkqjkmhytudaaolv` em secret.

**Rede interina até lá:** o @qa roda o `--check` em todo gate de story do Epic 87 que toque prompt.

---

### [NICOLE] 🔴 Compromisso de **ligação** da Nicole não vira artefato nenhum

**Adicionado em:** 2026-08-07
**Prioridade:** P1
**Origem:** Revisão @po do Epic 88 (`docs/qa/po-validation-epic-88.md` §8, item 1) — auditoria do
caso Silvana no banco de produção

A Nicole promete *"o corretor te liga segunda às 9h"* e **nada é gravado**. `lead_tasks` só tem
`source: 'manual'` — na Silvana (24/07 23:41), um humano leu a conversa e criou a tarefa à mão em
25/07 09:54. A ligação aconteceu **porque alguém percebeu**, não porque o sistema registrou.

**É a mesma classe de dano da agenda — fala sem lastro — por um caminho diferente**, e por isso não
entra no Epic 88 (que trata só de `appointments`): lá a tool `agendar_visita` não resolveria, porque
não havia visita a agendar. Nenhum dos dois epics da Nicole cobre este caminho hoje.

**Ação:** decidir se compromisso de ligação vira `lead_tasks` automático (mesma discussão de
autoridade de escrita do Epic 88) ou se entra apenas na reconciliação diária (Epic 87 · W0-5)
como alerta. A segunda opção é XS e já pega o dano.

---

### [NICOLE] 🟢 Célia (28/06) nunca foi remediada — acredita ter visita marcada há 40+ dias

**Adicionado em:** 2026-08-07
**Prioridade:** P3 (decisão comercial, não técnica)
**Origem:** Revisão @po do Epic 88 §8, item 4 · @architect §2.3

Em 28/06 a Nicole escreveu *"Agendei sua visita para este sábado às 9h"*. **Zero `appointments` até
hoje**, e ninguém corrigiu à mão — ao contrário de Sueli, Valnira e Maria, que tiveram conserto
humano. O lead se perdeu em silêncio. É o caso que justifica o `W0-5` (reconciliação diária) do
Epic 87: com ele, isso teria aparecido em **29/06**.

**Ação:** decidir se há contato ativo com a Célia (e com os demais da lista que o `W0-5` produzir
ao rodar sobre 60 dias retroativos). Decisão do Gabriel/Marcos.

---

### [NICOLE] 🟡 `detect-appointment.ts:71` — comparação `=== true` num campo que sempre foi string

**Adicionado em:** 2026-08-07
**Prioridade:** P2 (não urgente — o caminho está **morto**, não errado em produção)
**Origem:** Achado do @sm ao redigir a Story 87-4; ratificado pelo @po
(`docs/qa/po-validation-87-3-87-4.md` §4, correção C5)

```ts
// packages/ai/src/flows/detect-appointment.ts:71
const hasVisitAvailability = collectedData.visit_availability === true
```

`visit_availability` **sempre foi string** (`packages/shared/src/constants/lead-fields.ts:23`,
`type: "text"`). A comparação com booleano é **sempre falsa** — ou seja, `visit_availability`
**nunca** funcionou como sinal de suporte para detecção de agendamento. O `detected` da função sai
apenas de `hasKeyword`, `hasDayKeyword` e `dateMatch`.

**Por que NÃO entra na Story 87-4 (Onda 1):** "consertar" isso **liga um caminho de detecção que
hoje está morto**. Isso é caminho de decisão novo, e a regra de corte da Onda 1 do Epic 87 o
proíbe (*"nenhuma story pode adicionar um novo caminho de decisão da Nicole"*). O @po conferiu a
linha e ratificou que está corretamente fora de escopo.

**Por que está aqui e não como tarefa da 87-4:** a v0.1 da 87-4 previa uma T9 para abrir este item.
**Item de backlog dentro de uma story que ainda não começou é frágil** — se a story escorregar, o
achado escorrega junto. Aberto agora, com dono próprio.

**Ação:** decidir, **em uma story de Onda 3 ou 4**, se a intenção original era ligar esse sinal.
Se for, medir o efeito antes (quantos turnos a mais entrariam em `detected: true`) — o risco é
exatamente o de "agendar sozinho", classe do incidente que os Epics 87 e 88 existem para fechar.
Se não for, **remover a linha** em vez de corrigi-la.
⚠️ **Ao migrar o formato na Story 87-4, deixar a comparação morta como está** (ou preservar a
semântica de "sempre falso"). Trocá-la por uma verdadeira, de carona na migração, muda
comportamento sem AC.

---

### [NICOLE] 🔴 Fala **humana** gravada como `role='assistant'` — a Nicole é acusada por promessa de gente

**Adicionado em:** 2026-08-07
**Prioridade:** P1 (não bloqueia hoje; **cada consumidor futuro vai reencontrá-lo**)
**Origem:** Achado do @sm na Story 87-3; medido e escalado pelo @po
(`docs/qa/po-validation-87-3-87-4.md` §4) — *"🔴 Não está no backlog em lugar nenhum"*

```ts
// packages/web/src/app/api/leads/[id]/send-message/route.ts:210-222
await db.from("messages").insert({
  role: "assistant",                      // ← linha 214: fala do CORRETOR, humana
  content: transitionText,
  metadata: { is_transition: true, broker_id: appUser.id, ... },
})
```

A fala de **transição do handoff** — escrita por humano, disparada pelo corretor — é gravada com
`role: "assistant"`. A única coisa que a distingue da fala da Nicole é `metadata.is_transition`,
e **quem lê `messages` filtrando por `role` não vê o metadata**.

**Volume medido pelo @po (60 dias, produção):** **104 mensagens**.

**Estado atual do dano — hoje é ZERO, e isso é sorte:** nenhuma dessas 104 dispara a
`detectAffirmedSlot`. Mas o defeito é de **origem**, e o raio dele é muito maior que qualquer story
que o contorne:

| quem vai reencontrar | efeito se não filtrar |
|---|---|
| Story **87-3** (`W0-5`) | acusaria a Nicole de afirmar visita que **um humano** prometeu — **já tratado** ali como filtro do módulo, que é o certo para o escopo dela |
| `W2-3` (`detectSlotMismatch` shadow) | mesma classe |
| `W3-1` (validador) | mesma classe |
| `88-3` (funil das 7 portas) | contaria turno humano como turno da Nicole na instrumentação |
| `loadConversationHistory` (`pipeline.ts:1543`) | seleciona só `role, content` — **a Nicole já lê algumas falas humanas achando que são dela** |

**Cada consumidor vai pagar o mesmo imposto de contorno, e um deles vai esquecer.**

**Ação:** decidir a representação correta da fala humana em `messages` — `role` próprio
(`'broker'` já existe e é usado para as 882 mensagens do corretor nos últimos 30 dias) ou coluna de
autoria explícita — e migrar os leitores. **Não é conserto de story de agenda:** é decisão de
modelo de dados, com impacto em histórico, extração e instrumentação. Enquanto não acontecer, todo
leitor novo de `messages` **precisa** filtrar `metadata.is_transition` explicitamente.

---

### [NICOLE] ℹ️ Dois defeitos desta revisão que **já ganharam dono** — não abrir item novo

**Adicionado em:** 2026-08-07
**Origem:** @po Epic 88 §8, itens 2 e 3 — registrados aqui só para não serem redescobertos

- **`freeSlotsInPeriod` ignora "semana × fim de semana"** (lead pede "semana de manhã", o pré-fetch
  oferece três sábados — Valnira, 03/08 23:57; causa em `visit-slot.ts:363-381`, a guarda da 75-268
  não foi aplicada ao caminho `pendingDay`) → **Epic 87 · W1-2b**.
- **`detectSlotMismatch` falhou também COM slot autorizado** (Ailton, 30/07 22:17: autorizado 10h,
  afirmou 9h, **0 eventos em toda a história do `system_events`**) → **Epic 87 · W2-3**.

---

### [BOLSÃO] 🔴 O carimbo sujo continua NASCENDO — a 75-286 calou o sintoma e o dano piorou de forma

**Adicionado em:** 2026-08-07
**Prioridade:** **P1 — o mais alto desta lista.** O dano deixou de ser visível
**Origem:** Efeito medido do merge da Story 75-286 (`6d141692`), levantado na revisão de 07/08
**Decisão (@pm, 07/08):** **backlog, não epic.** O Epic 87 lista *"roleta/distribuição, notificação
de corretor"* em `FORA DE ESCOPO` (§4) por raio de impacto próprio, e este item é de distribuição,
não de contexto da Nicole. Trazê-lo para lá reabriria escopo no meio da Onda 1. Precisa de story
própria — **é a única coisa desta entrada que está pendente de decisão: quem e quando, não se.**

A 75-286 corrigiu **a leitura**, e corrigiu bem: o digest passou a espelhar o filtro do painel
(`bolsao-rebalance/route.ts:178`, `.is("assigned_broker_id", null)`), e o gerente parou de receber
aviso sobre lead que já tem dono. **O que ela não fez — e o commit diz isso com todas as letras — é
impedir o carimbo sujo de nascer.** Os três caminhos de atribuição continuam gravando
`assigned_broker_id` sem limpar `bolsao_em`, verificado no código de hoje:

```
leads/[id]/assign/route.ts:46       .update({ assigned_broker_id: body.broker_id })
leads/[id]/handoff/route.ts:72      .update({ assigned_broker_id: body.broker_id })
leads/[id]/transferir/route.ts:83   .update({ assigned_broker_id: targetUserId })
```

`bolsao_em` só é limpo pela RPC `pegar_lead_bolsao`. Quem entra por qualquer outra porta deixa o
carimbo — e a **cronologia medida prova que o fix não estancou a fonte**: **14 avisos em 05/08** e
**2 em 06/08, depois da limpeza manual** — ou seja, **um lead novo sujou o carimbo no dia seguinte**.

**O dano maior nunca foi o spam.** Um lead com carimbo sujo é excluído dos candidatos do
rebalanceamento — `bolsao-rebalance/route.ts:100` exige `.is("bolsao_em", null)`. Ele fica com dono,
fora do painel do bolsão, **e sem a rede de segurança que devolveria o lead ao pool se o corretor
não atendesse**. É exatamente a população que o bolsão existe para resgatar.

> **A inversão que torna isto P1:** **antes o spam denunciava o fantasma; agora ele nasce em
> silêncio.** O único sintoma observável do defeito era o aviso ao gerente, e foi ele que a 75-286
> removeu. O lead que perde o resgate não gera evento, não aparece em tela nenhuma e não tem
> descobridor — é a mesma classe de cegueira que o `W0-5` do Epic 87 existe para fechar na agenda da
> Nicole, aqui na distribuição. **Nenhuma crítica ao fix:** corrigir a leitura primeiro estava certo
> e parou a sangria visível. O erro seria dar o item por encerrado.

**Ação — a escrita, não a leitura:**
1. Limpar `bolsao_em` nos três caminhos de atribuição (o certo é na **RPC/atribuição**, um lugar só,
   não três `update` espalhados). A roleta **não** entra: já tem guard próprio (bail `"em_bolsao"`
   + `AND bolsao_em IS NULL` na `roleta_pick_and_advance`) e nunca atribui lead carimbado.
2. **Contar antes de consertar:** quantos leads vivos estão hoje com `bolsao_em IS NOT NULL AND
   assigned_broker_id IS NOT NULL` — é a lista de quem já perdeu o resgate.
3. Remediar essa lista (decidir por lead: limpar carimbo ou devolver ao pool).
4. **Invariante que impede a reincidência:** `bolsao_em IS NOT NULL` ⇒ `assigned_broker_id IS NULL`.
   É um `CHECK` ou um teste — sem ele, o 4º caminho de atribuição que alguém escrever repete tudo.

---

### [SEGURANÇA] 🔴 Roleta com guarda nova nunca exercitada em produção

**Adicionado em:** 2026-08-03
**Prioridade:** P1 (verificar na próxima janela de trabalho)
**Origem:** Aplicação das migrations 209/210 (PRs #308 e #338)

`roleta_pick_and_advance` recebeu a guarda `assert_org_scope()` e **nunca rodou desde então**. A última distribuição foi `2026-08-03 15:28:46Z`, dois minutos **antes** da migration ser aplicada. É a única função de **escrita** alterada pelo hotfix, não foi exercitada em nenhum round de QA (mutaria produção), e o modo de falha é **silencioso**: o lead cai em `sem_corretor_disponivel` em vez de ser distribuído — ninguém recebe erro.

**Ação:** distribuir 1 lead ponta a ponta e conferir:
```sql
select status, count(*) from lead_distribution_log
where created_at > now() - interval '24 hours' group by 1;
```
Baseline: 02/08 = 12 `distributed`; 01/08 = 8; 31/07 = 5. Se aparecer `sem_corretor_disponivel` com corretor disponível na fila, é regressão da guarda → rollback pelo bloco `-- ROLLBACK` da `209_hotfix_rls_org_scope.sql`. Vigiar `[roleta] RPC error:`, `"org mismatch"`, `"org scope required"` e ERRCODE 42501.

Smokes menores pendentes (confirmam o que já foi medido por privilégio): `/broker` como corretor, `/dashboard` como gerente-comercial, `/dashboard/configuracoes/corretores` (a coluna de leads ativos não pode zerar), `/dashboard/sistema/billing` como admin, e detalhe de campanha com ROAS **usando o perfil `social-media`**.

---

### [DB] ⛔ `supabase db push` proibido contra produção — registro 52 versões atrasado

**Adicionado em:** 2026-08-03
**Prioridade:** P2 (decisão pendente)
**Origem:** Aplicação das migrations 209/210

`supabase_migrations.schema_migrations` tem 120 versões registradas, a última `20260710171933` (10/07), enquanto o repo já vai até a `210` — **~52 migrations de atraso**. Um `db push` tentaria reaplicar tudo desde a `164`.

Aplicação em produção deve ser sempre pela **Management API, arquivo inteiro num único POST** (roda em transação implícita: erro aborta tudo sem deixar estado parcial). Procedimento em `docs/runbooks/aplicar-209-210.md`.

**Decisão pendente:** ou registrar as ~52 versões faltantes de uma vez, ou assumir formalmente que `db push` não vale para este projeto e documentar. Registrar só as últimas mascararia o drift sem tornar o push seguro.

---

### [SAAS] Pivô multi-tenant — Epic 86 pronto, aguardando pré-requisitos

**Adicionado em:** 2026-08-03
**Prioridade:** P1 (linha de trabalho principal)
**Origem:** Epic 86 (`docs/stories/epics/epic-86-saas-multi-tenant.md`), validado GO pelo @po em 3 rodadas

51 stories em 8 ondas. Onda 0 draftada: `86-1`, `86-2a/2b/2c` em `Ready`; `86-3` em `Draft` por bloqueio. **PR #337** (epic + 5 stories) aberto, aguardando merge.

**Bloqueios:**
- **Supabase descartável não existe** — trava tudo a partir de `86-18`, ou seja **7 das 8 ondas**. Sem ele não há como provar isolamento cross-tenant (os testes criam e apagam orgs, e o Supabase de "dev" aponta para produção). É o gargalo real do epic.
- **Decisões comerciais:** preço dos 3 tiers e cota de atendimentos por tier (travam `86-27b` → marco "vendável"); preço do excedente (`86-41` → marco "cobrável"); definição de "1 atendimento" (`86-37`); lista de tabelas legíveis pelo platform-admin (`86-42b`).

**Pode andar sem nada disso:** `@sm` draftar Ondas 1 e 2 (22 stories) e `@dev` implementar `86-1`.

Marcos: Onda 1 = isolamento fechado · Onda 2 = multi-org + `/platform` mínimo · Onda 3 = 🟢 vendável · Onda 5 = 💰 cobrável · Onda 6 = painel admin completo.

---

### [DB] Índice `idx_leads_metadata_leadgen_id` não recriado pela migration 075

**Adicionado em:** 2026-06-25
**Prioridade:** P3 (não urgente)
**Origem:** Encerramento da Story 25-3 (@po Pax) — migration 063 descartada

A migration `075_leads_metadata.sql` (tracked) criou a coluna `leads.metadata` + índice `idx_leads_metadata_ad_id`, mas **não** recriou o índice parcial `idx_leads_metadata_leadgen_id` (lookup por `metadata->>'leadgen_id'`). Esse índice só existia na migration `063_leads_metadata.sql` (untracked), descartada por ser redundante com a 075. A dedup por `leadgen_id` no webhook Meta Lead Forms e no `scripts/meta-backfill-leads.ts` fica sem índice dedicado. Impacto atual nulo (~124 leads, seq scan barato). Se o volume de leads Meta crescer, portar **apenas o índice** para uma migration nova tracked:
```sql
CREATE INDEX IF NOT EXISTS idx_leads_metadata_leadgen_id
  ON leads ((metadata->>'leadgen_id'))
  WHERE metadata->>'leadgen_id' IS NOT NULL;
```

---

### [UX] Portal — Página Financeiro sem conteúdo

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

A página `/cliente/[obra_id]/financeiro` existe na navegação mas não tem conteúdo implementado. O cliente vê uma tela vazia ao clicar em "Financeiro". Implementar conteúdo ou remover o item da navegação até estar pronto.

---

### [UX] Portal — Empty states sem ilustração/CTA

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

Quando não há dados (ex: sem fotos, sem documentos, sem fases), o portal exibe apenas texto simples como "Nenhuma foto disponível ainda." Melhorar com ícone SVG ilustrativo + mensagem mais amigável em todas as páginas do portal. Fotos e documentos já têm SVG, fases não tem.

---

### [UX] Portal — Galeria de fotos sem lightbox

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

Ao clicar em uma foto na galeria, ela abre em nova aba como URL crua do storage. Implementar lightbox (visualização em tela cheia com navegação entre fotos) para melhor experiência mobile.

---

### [UX] Portal — Página Notificações sem conteúdo real

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

A página `/cliente/[obra_id]/notificacoes` está na navegação mas o conteúdo precisa ser validado. Verificar se exibe notificações reais ou é placeholder.

---

### [UX] Chat — Indicadores de leitura de mensagens

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

Mensagens enviadas pelo cliente não mostram indicadores de "enviado" / "lido pela equipe". O campo `read_at` já existe na tabela `obra_mensagens` — usá-lo para exibir um ✓ ou ✓✓ nos balões do cliente.

---

### [UX] Admin — Modais sem foco automático no primeiro campo

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

Ao abrir modais (clientes, fases, etc.), o foco não vai automaticamente para o primeiro campo. Usuários de teclado precisam dar Tab manual. Adicionar `autoFocus` ou `useRef + focus()` no primeiro input de cada modal.

---

### [UX] Portal — Pull-to-refresh no mobile

**Adicionado em:** 2026-05-26
**Prioridade:** Baixa
**Origem:** Análise @ux-design-expert (Story 42.1)

Páginas do portal (fases, fotos, docs) são Server Components e não têm mecanismo de refresh no mobile. Considerar `router.refresh()` + gesto swipe-down para recarregar dados sem sair da página.

---

### [OPS] Configurar env vars do Calendly no Vercel

**Adicionado em:** 2026-05-20
**Relacionado à:** Story 37-1 (Integração Calendly → Agenda)

Para ativar o sync automático de agendamentos do Calendly, configurar as seguintes variáveis de ambiente no painel do Vercel (Settings → Environment Variables → Production):

| Variável | Valor |
|----------|-------|
| `CALENDLY_PAT` | Token gerado em Calendly → Integrações → API & Webhooks → Personal Access Tokens |
| `CALENDLY_USER_URI` | `https://api.calendly.com/users/6f5ae058-0133-4f8a-971a-674f0e72b075` |

Após configurar, o cron `/api/cron/calendly-sync` rodará automaticamente a cada 30 minutos.

**Teste manual após configurar:**
```bash
curl -X GET https://crm.trifold.eng.br/api/cron/calendly-sync \
  -H "Authorization: Bearer {CRON_SECRET}"
```

---

### [NICOLE] 🟡 O resumo de handoff não diz QUEM falou — e agora existem três autores

**Adicionado em:** 2026-08-15
**Prioridade:** P2
**Origem:** Story 87-5, AC8-(iii) — deliberadamente FORA do escopo dela

`generateHandoffSummary` (`packages/ai/src/flows/handoff.ts:142`) imprime só `role === "user"`: a
seção `MENSAGENS DO LEAD` nunca citou fala da Nicole e continua não citando a do corretor. Com a
87-5, o corretor entrou no histórico, então o resumo passou a **contá-lo** em `TOTAL DE MENSAGENS`
sem **mostrá-lo** — o corretor que recebe o handoff lê "TOTAL: 14" e vê 5 frases do lead.

Marcar o autor dentro do resumo seria **acrescentar conteúdo** ao artefato do handoff, ou seja
comportamento novo — proibido pela regra de corte da Onda 1 do Epic 87. Fica para onda posterior,
e a decisão de fazer ou não é do produto, não do implementador.

---

### [NICOLE] 🟡 A promessa do CORRETOR não tem reconciliação — só a da Nicole tem

**Adicionado em:** 2026-08-15
**Prioridade:** P2
**Origem:** Story 87-5 (fronteiras) + Story 87-3

A rotina diária da 87-3 mede `M1`/`M4` sobre a fala **da Nicole**. Depois da 87-5 a fala do corretor
está no mesmo histórico e no mesmo resumo, e ela pode afirmar dia/horário de visita sem lastro em
`appointments` exatamente como a dela podia. Hoje ninguém mede isso, e o volume não é pequeno:
**1.288 mensagens `role='broker'` em 30 dias** (medido em 15/08), contra 588 da Nicole.

---

### [ARQ] 🔴 O carregador de histórico não tem eixo de ORGANIZAÇÃO — e o pipeline lê dois valores de org sem comparar

**Adicionado em:** 2026-08-15
**Prioridade:** P2 hoje · **P0 antes do pivô SaaS** (ver item `[SAAS] Pivô multi-tenant` acima)
**Dono:** @architect — destino é o épico do pivô multi-tenant, não uma story do Epic 87
**Origem:** achado R-A2 do re-gate da Story 87-5 (`docs/qa/gates/87.5-historico-rotulado-fala-do-corretor.yml`, §11)

A 87-5 fechou o eixo **conversa**: `.eq("conversation_id", …)` nas três consultas de
`packages/ai/src/chat/conversation-history.ts` (`:282` janela, `:308` count, `:317` sinal), cada uma
com vermelho dedicado e disjunto. **O eixo que não existe é o de organização.** Conferido por leitura:

- **nenhuma** das quatro consultas do carregador tem escopo de org;
- o único lugar que poderia reconciliar — `packages/ai/src/chat/pipeline.ts` — lê **dois** valores de
  org, de fontes diferentes, e **nunca os compara**: `params.orgId` decide o prompt
  (`loadAgentConfig`, `:545`) e os empreendimentos (`loadProperties`, `:588`); `conversation.org_id`,
  lido do banco em `:615`, decide **onde escreve** (appointments `:1453`, activities `:1515`/`:1564`,
  handoff `:1600`);
- no webhook do WhatsApp os dois **nascem separados**: `orgId = config.org_id` vem do número de
  telefone (`packages/web/src/app/api/webhook/whatsapp/route.ts:400`) e o `conversationId` vem da
  conversa. Se divergirem, o carregador entrega o histórico sem uma linha de defesa.

**Exposição hoje: ZERO** — `agent_config` tem uma única linha (org
`00000000-0000-0000-0000-000000000001`), então os dois valores não podem divergir. Com multi-tenant,
vira o mesmo vazamento cross-lead **um nível acima**: cross-org.

**Sub-achado, e é o que dá urgência ao registro:** a consulta a `users`
(`conversation-history.ts:236`) é a **única do carregador sem escopo nenhum** — nem conversa, nem org.
O @qa mediu: trocar `.select("id, name").in("id", idsParaResolver)` por `.select("id, name")` deixa a
suíte **inteira verde** (2.407 passed). É **mutante equivalente em comportamento** (o `Map` só é lido
por id) **e não em risco**: passa a trazer a tabela `users` inteira para a memória do turno, com
client de service-role e RLS desligada. Nenhum teste alcança isso — é achado de leitura, não de
mutação. **Manter o `.in("id", …)`: a leitura é a única guarda que existe.**

**O que fazer (fora do escopo da 87-5, que é read-only e proibida de abrir caminho de decisão novo):**
comparar `params.orgId` × `conversation.org_id` no pipeline, emitir evento na divergência e decidir a
política (abortar o turno vs. seguir com o do banco). Uma comparação e um evento — mas é caminho de
decisão novo, e por isso não entrou aqui.

---

## Concluído

### [INFRA] Chaves Supabase legacy no .env.local

**Verificado em:** 2026-06-17
**Resolução:** Não havia ação pendente. O `.env.local` (raiz e `packages/web/`) já usa o formato novo de chaves (`sb_publishable_…` / `sb_secret_…`). Nenhuma chave JWT legacy (`eyJ…`) presente em qualquer arquivo de env, e as chaves novas estão funcionais (REST API responde HTTP 200). Item fechado como falso positivo / já resolvido.

---

### [INFRA] Filesystem /private/tmp/claude-501 supostamente cheio

**Verificado em:** 2026-06-17
**Resolução:** Falso positivo. O diretório tinha 696K (10 itens) e o disco ~29 GiB livres. `CLAUDE_CODE_TMPDIR` em default (unset). Nenhuma limpeza necessária — `sudo rm -rf` desaconselhado por ser desnecessário e arriscado. Item fechado.

## [PO 24/08/2026] Follow-up da Nicole ignora o handoff da conversa

**Origem:** validação da Story 75-368 (@po). **Prioridade sugerida:** média. **Complexidade:** XS.

O cron `/api/cron/followup` **não olha** `conversations.is_ai_active` — verificado, zero ocorrências em
`packages/web/src/app/api/cron/followup/`. Consequência: quando o corretor assume a conversa via
`handoff/route.ts` (Epic 63), a Nicole para de falar **na conversa**, mas continua mandando follow-up
pelo cron. É provavelmente o defeito que originou o pedido da 75-368.

Fora do escopo da 75-368 por decisão de escopo mínimo — a 75-368 entrega o botão explícito por lead, que
cobre um caso que este item não cobre (lead sem conversa nenhuma). Os dois são complementares.

**Aguarda decisão do Marcos.**

## [@devops 24/08/2026] CodeRabbit está inativo, mas os artefatos dizem que é gate obrigatório

**Origem:** Story 75-368 (o `@dev` reportou que não conseguiu rodar). **Prioridade sugerida:** média —
não é o que está falhando hoje, mas é uma mentira documentada. **Complexidade:** XS para acertar os
documentos; a instalação depende de assinatura.

### O que foi verificado (não repetir a investigação)

- **O app do CodeRabbit não está instalado no repositório.** Conferido nos 4 PRs mais recentes
  (#497, #496, #495, #492): **zero** revisões dele em qualquer um. O PR #500 desta story também
  não recebeu nenhuma.
- **`.coderabbit.yaml` existe e está bem configurado** — `auto_review.enabled: true`,
  `base_branches: [main]`, `request_changes_workflow: true`. Configuração não instala nada; o arquivo
  fica no repositório aparentando que o serviço está ativo.
- **Nenhum workflow da CI chama CodeRabbit.** `.github/workflows/` tem só o `ci.yml`.
- **O CLI também não roda nesta máquina.** As definições de `@dev`, `@qa` e `@devops` apontam para
  `~/.local/bin/coderabbit` via `wsl bash -c`, e o host é macOS. O CodeRabbit tem CLI para Mac — a
  configuração dos agentes é que está desatualizada.

### Por que isso importa mais do que parece

**124 stories** têm seção "CodeRabbit Integration" preenchida, e três definições de agente listam o
CodeRabbit como gate obrigatório antes de commit, de review e de PR. Quem lê esses artefatos conclui
que houve revisão automatizada. Na 75-368 deu certo porque o `@dev` reportou honestamente que não
rodou — mas isso dependeu de o agente ser honesto, não do sistema.

A camada de revisão em si **não é o que está falhando**: nesta mesma story, sem CodeRabbit, o `@po`
achou 3 lacunas no draft e o `@qa` achou um defeito HIGH real, além da CI com type-check, lint, testes
e gate de tenancy. CodeRabbit seria uma quarta camada útil, não a primeira.

### Opções

1. **Instalar o app no GitHub** (recomendado) — revisa todo PR automaticamente, independe de máquina e
   de alguém lembrar de rodar, e o `.coderabbit.yaml` que já existe passa a valer. Produto pago para
   repositório privado.
2. **Instalar o CLI no macOS** e corrigir as definições dos agentes (hoje apontam para WSL) — faz os
   passos locais funcionarem, mas só protege quando alguém executa.
3. **Não instalar e marcar como inativo** nos três agentes e no `.coderabbit.yaml` — custo zero, e
   pelo menos os documentos param de afirmar o que não acontece.

**O que não manter:** o estado atual, em que o documento diz uma coisa e a realidade é outra.

**Aguarda decisão do Marcos** (a opção 1 e a 2 envolvem assinatura; a 3 não).
