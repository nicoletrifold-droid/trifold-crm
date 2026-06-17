# Story 51-0 — Google Ads: Setup Externo (Developer Token + OAuth App)

## Metadata
- **Epic:** 51 — Google Ads Marketing API Integration
- **Story:** 51-0
- **Status:** Ready
- **Priority:** P0 — pré-requisito externo crítico; desbloqueia todo o Epic 51
- **Complexity:** XS (~1h trabalho efetivo + 1-3 dias úteis latência Google)
- **Created:** 2026-06-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** lucas@trifold.eng.br (humano — não é code work)
- **Quality Gate:** N/A (verificação manual de env vars + doc publicada)
- **Nota:** Esta story não é executada por @dev. O executor é o tech lead da org (lucas@). O @sm e @pm acompanham o progresso.

---

## User Story

**Como** tech lead do Trifold CRM (lucas@trifold.eng.br),
**Quero** solicitar o Developer Token do Google Ads e configurar o OAuth App no Google Cloud Console,
**Para que** o time de desenvolvimento consiga implementar a integração técnica com a Google Ads API nas Stories 51-1 a 51-4 — sem blocker externo não resolvido.

---

## Context

A Google Ads API exige **aprovação manual de um Developer Token** pelo Google antes de qualquer chamada à API funcionar em produção. Este é o **blocker externo crítico** do Epic 51.

### Por que esta story existe
Sem story dedicada para rastrear o setup externo, a responsabilidade fica dispersa e o blocker pode ser esquecido enquanto o time implementa as stories técnicas. Com esta story, o status é visível no board e o timeout é monitorável.

### Tipos de acesso ao Developer Token

| Tipo | Operações/dia | Aprovação | Adequado para |
|------|---------------|-----------|---------------|
| Test Account | Ilimitado (conta de teste) | Automático | Desenvolvimento local |
| Basic Access | 15.000 | Geralmente automático ou 1-3 dias | MVP e produção inicial |
| Standard Access | Sem limite prático | 5-10 dias úteis (revisão manual) | Escala futura |

**Para o MVP:** Basic Access é suficiente (1 conta Google Ads, sync diário = ~1-2 chamadas/dia).

### Pré-requisito de conta Google
- É necessário ter acesso a um **Google Ads Manager Account (MCC)** — o Developer Token é registrado nele
- Ou criar uma conta de teste (Google Ads API test account) para desenvolvimento

---

## Tasks / Subtasks

- [ ] **T1** — Solicitar Developer Token via Google Ads Manager Account
  - [ ] T1.1 — Acessar [Google Ads Manager Account](https://ads.google.com/home/tools/manager-accounts/) com a conta Google do negócio
  - [ ] T1.2 — Navegar para: `Ferramentas e Configurações` → `API Center` → `Developer Token`
  - [ ] T1.3 — Preencher formulário de solicitação (Basic Access é suficiente para MVP — 15K operações/dia)
  - [ ] T1.4 — Aguardar aprovação (geralmente automático para Basic Access; pode levar 1-3 dias úteis)
  - [ ] T1.5 — Copiar o Developer Token gerado (formato: string alfanumérica longa)

- [ ] **T2** — Criar OAuth App no Google Cloud Console
  - [ ] T2.1 — Acessar [Google Cloud Console](https://console.cloud.google.com/) e selecionar (ou criar) o projeto Trifold CRM
  - [ ] T2.2 — Navegar para: `APIs & Services` → `Credentials` → `Create Credentials` → `OAuth client ID`
  - [ ] T2.3 — Application type: `Web application`
  - [ ] T2.4 — Adicionar Authorized redirect URIs:
    - `http://localhost:3000/api/auth/google-ads/callback` (desenvolvimento)
    - `https://trifold.app/api/auth/google-ads/callback` (produção — ajustar URL conforme domínio real)
  - [ ] T2.5 — Copiar `client_id` e `client_secret` gerados

- [ ] **T3** — Configurar OAuth Consent Screen
  - [ ] T3.1 — Em `APIs & Services` → `OAuth consent screen`, configurar:
    - App name: `Trifold CRM`
    - User support email: lucas@trifold.eng.br
    - Scopes: adicionar `https://www.googleapis.com/auth/adwords`
    - Test users: adicionar emails do time para testes (enquanto app não verificada)
  - [ ] T3.2 — Publicar a app (ou manter em modo "Testing" para MVP interno)
  - [ ] T3.3 — Ativar a API `Google Ads API` no projeto: `APIs & Services` → `Library` → buscar "Google Ads API" → `Enable`

- [ ] **T4** — Documentar processo
  - [ ] T4.1 — Criar `docs/integrations/google-ads-setup.md` com passo-a-passo completo (para onboarding de novos membros do time)
  - [ ] T4.2 — Documentar quaisquer decisões tomadas (ex: nome do projeto GCP, redirect URIs, nível de acesso solicitado)

- [ ] **T5** — Adicionar env vars no Vercel
  - [ ] T5.1 — Acessar Vercel Dashboard → Projeto Trifold → `Settings` → `Environment Variables`
  - [ ] T5.2 — Adicionar para **Production** e **Preview**:
    - `GOOGLE_ADS_DEVELOPER_TOKEN` = (valor do T1.5)
    - `GOOGLE_ADS_CLIENT_ID` = (valor do T2.5)
    - `GOOGLE_ADS_CLIENT_SECRET` = (valor do T2.5)
  - [ ] T5.3 — Verificar que as vars estão presentes em ambos os environments (Production + Preview)
  - [ ] T5.4 — **Não adicionar ao `.env.local`** em repositório — variáveis sensíveis somente no Vercel

---

## Estimativa e Cronograma

| Item | Esforço | Latência |
|------|---------|---------|
| Solicitar Developer Token | ~15 min | 0-3 dias úteis (aprovação Google) |
| Criar OAuth App + consent screen | ~30 min | Imediato |
| Documentar processo | ~15 min | Imediato |
| Adicionar env vars no Vercel | ~15 min | Imediato |
| **Total** | **~1h trabalho efetivo** | **1-3 dias úteis (domina latência Google)** |

**Timeout:** Se o Developer Token não for aprovado em **5 dias úteis** após a solicitação, escalar para @pm e revisar o Plan B do epic (Story 51-3 usa seed SQL; Story 51-2 fica em standby).

---

## Definition of Done

- [ ] Developer Token aprovado pelo Google e registrado no Vercel (`GOOGLE_ADS_DEVELOPER_TOKEN`)
- [ ] OAuth App criado com `client_id` + `client_secret` registrados no Vercel
- [ ] Redirect URIs configurados (localhost + produção)
- [ ] Escopo `https://www.googleapis.com/auth/adwords` ativo no OAuth consent screen
- [ ] Env vars presentes nos environments Production + Preview do Vercel
- [ ] Documento `docs/integrations/google-ads-setup.md` publicado no repositório

---

## Dependencies

- **Depende de:** nenhuma (nenhum blocker técnico — só latência Google)
- **Bloqueia:**
  - Story 51-4 (OAuth UI — precisa do `client_id` e `client_secret` para configurar o flow)
  - Story 51-2 em produção (cron precisa do `GOOGLE_ADS_DEVELOPER_TOKEN` para chamar a API)
  - Testes end-to-end de 51-2 e 51-3 com dados reais

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Developer Token demora > 5 dias úteis | Acionar Plan B: @dev implementa 51-3 com seed SQL; 51-2 fica em standby; escalar com @pm |
| R2 | Google exige Standard Access (rejeitou Basic) | Pouco provável para MVP interno; se ocorrer, solicitar Standard Access (5-10 dias) e acionar Plan B |
| R3 | Redirect URI incorreto na produção | Confirmar URL exata do deploy Vercel antes de configurar — pode ser atualizado sem re-aprovação |

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-08 | 0.1 | Story criada a partir de PM review (AI-1) — formalizar blocker externo com owner e critério de timeout | @sm (River) |
| 2026-06-08 | 0.3 | Validated (10-point checklist, score 10/10), Draft → Ready | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
N/A — executor humano (lucas@trifold.eng.br)

### Completion Notes List
_(preencher quando cada task for concluída)_

### File List

#### Created
- `docs/integrations/google-ads-setup.md` (T4.1)

#### Modified
- _(nenhum arquivo de código — apenas configuração externa)_

---

## QA Results
N/A — verificação manual pelo executor (lucas@).
