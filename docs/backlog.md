# Backlog — Tarefas Pendentes

Tarefas operacionais, configurações e ajustes pendentes que não requerem uma story completa.

---

## Pendente

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
