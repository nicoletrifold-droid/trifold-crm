# Backlog — Tarefas Pendentes

Tarefas operacionais, configurações e ajustes pendentes que não requerem uma story completa.

---

## Pendente

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

## Concluído

### [INFRA] Chaves Supabase legacy no .env.local

**Verificado em:** 2026-06-17
**Resolução:** Não havia ação pendente. O `.env.local` (raiz e `packages/web/`) já usa o formato novo de chaves (`sb_publishable_…` / `sb_secret_…`). Nenhuma chave JWT legacy (`eyJ…`) presente em qualquer arquivo de env, e as chaves novas estão funcionais (REST API responde HTTP 200). Item fechado como falso positivo / já resolvido.

---

### [INFRA] Filesystem /private/tmp/claude-501 supostamente cheio

**Verificado em:** 2026-06-17
**Resolução:** Falso positivo. O diretório tinha 696K (10 itens) e o disco ~29 GiB livres. `CLAUDE_CODE_TMPDIR` em default (unset). Nenhuma limpeza necessária — `sudo rm -rf` desaconselhado por ser desnecessário e arriscado. Item fechado.
