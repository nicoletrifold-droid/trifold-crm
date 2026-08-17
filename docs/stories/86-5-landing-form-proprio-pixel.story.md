# Story 86-5 — Landing page/form próprio no CRM com Meta Pixel instrumentado

**Status:** Superseded (por 86-9)
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex) + @ux-design-expert (Uma)
**Prioridade:** P1
**Depende de:** 86-4 (P0 completo — o dispatch já funciona; esta story adiciona uma nova origem de lead que também deve alimentar o mesmo funil)

## Contexto

Decisão travada do stakeholder: migrar os forms/landing de captação de lead
do WordPress (fora deste repo, sem controle de tracking) para dentro do CRM,
com Pixel + captura de clique instrumentados desde o início. Isso dá controle
total do tracking (hoje impossível, pois a landing atual não é código deste
repositório) e é pré-requisito funcional para a Story 86-7 (Advanced
Matching no Pixel).

Esta story cria a página pública (rota nova, sem autenticação, análoga em
estrutura a `packages/web/src/app/agendar/[token]/page.tsx` mas sem token —
acesso aberto) com um formulário de captura de lead (nome, telefone, e-mail,
interesse) que:
1. Carrega o Meta Pixel (`fbq('init', DATASET_ID)` + `fbq('track', 'PageView')`)
   no carregamento da página.
2. Ao submeter, cria o lead no CRM (reaproveitando a lógica de criação de
   lead existente, não duplicando) e dispara `fbq('track', 'Lead')` no
   browser.
3. Prepara o terreno para a Story 86-6 (captura de `fbclid` da URL) e 86-7
   (Advanced Matching).

**Escopo desta story:** a página, o formulário, a integração com Pixel
básico (sem Advanced Matching ainda — isso é 86-7), e a criação do lead via
API existente. **Fora do escopo:** migração de DNS/domínio, descontinuação da
landing WordPress, design visual definitivo (usar componentes/estilo já
existentes do design system do CRM; refinamento visual fica com
@ux-design-expert em paralelo, sem bloquear o dev).

## Acceptance Criteria

1. **AC1 — Rota pública nova.** `packages/web/src/app/(marketing)/landing/[slug]/page.tsx`
   (ou path equivalente decidido pelo @dev — usar route group `(marketing)`
   ou similar para deixar claro que é conteúdo público não-autenticado,
   seguindo o espírito de `docs/stories/75-189-rotas-publicas-agendar-pasta.story.md`
   que já tratou de rotas públicas no projeto). `[slug]` permite múltiplas
   landing pages (uma por empreendimento/campanha) sem duplicar código —
   confirmar contra `property_interest` ou `empreendimentos` existentes se
   já há um identificador reutilizável, ou introduzir um `slug` simples por
   enquanto (uma landing inicial é suficiente para o MVP desta story).
2. **AC2 — Meta Pixel carregado.** O componente da página injeta o script
   padrão do Meta Pixel (`fbq('init', '1337310707164669')` +
   `fbq('track', 'PageView')`) no mount — usar `next/script` com estratégia
   `afterInteractive` (padrão Next.js para scripts de terceiros que não
   bloqueiam render).
3. **AC3 — Formulário de captura.** Campos mínimos: nome, telefone (com
   máscara BR, reaproveitar componente de input de telefone já existente no
   projeto se houver), e-mail (opcional ou obrigatório — decisão do @dev
   conforme UX), e um campo de interesse (empreendimento/produto) se houver
   mais de uma landing (`[slug]` do AC1).
4. **AC4 — Submissão cria lead via API existente.** O submit do form chama
   uma API route (nova, `POST /api/public/leads` ou reaproveitando uma
   existente se já houver endpoint de criação pública de lead — investigar
   antes de criar; se não houver, criar uma rota dedicada com rate-limiting
   básico para evitar abuso, já que é uma rota pública sem auth) que cria o
   lead na tabela `leads` com `source` apropriado (novo valor de enum
   `lead_source` — ex. `landing_page_crm` — ou reaproveitar um valor
   existente compatível; confirmar o enum `lead_source` antes de decidir).
5. **AC5 — `fbq('track', 'Lead')` disparado no sucesso.** Após a criação do
   lead ser confirmada (resposta 2xx da API), o browser dispara
   `fbq('track', 'Lead', { content_name: <slug ou nome do empreendimento> })`.
   Este é o evento standard `Lead` do Meta — mesmo evento hoje disparado
   pelos Instant Forms nativos, agora também disparado por esta origem nova.
6. **AC6 — Sem duplicação de eventos Lead entre origens.** Esta landing é uma
   origem **adicional** de leads, não substitui os Instant Forms existentes
   nesta entrega — não há risco de duplicação porque são leads diferentes
   (pessoas diferentes preenchendo formulários diferentes), mas o Dev Notes
   deve deixar claro que a coexistência das duas origens é intencional e
   temporária (decisão de negócio futura sobre desativar a landing WordPress
   está fora do escopo técnico).
7. **AC7 — Página funciona sem JavaScript de terceiros bloqueado
   silenciosamente quebrar o form.** Se o Pixel falhar ao carregar (ad
   blocker, por exemplo), a submissão do formulário e a criação do lead
   continuam funcionando normalmente — o tracking é best-effort, nunca
   bloqueante para a conversão de negócio real.
8. **AC8 — Responsiva e acessível.** Formulário funciona em mobile (a
   maioria do tráfego de Meta Ads é mobile) e segue os padrões de
   acessibilidade já usados no projeto (labels associados, mensagens de erro
   anunciadas).

## Tasks

- [ ] **T1 (AC1)** — Criar a estrutura de rota pública nova (`page.tsx` +
  layout se necessário, sem exigir sessão autenticada — verificar
  `middleware.ts` do projeto para garantir que a rota nova não é interceptada
  por guards de autenticação existentes).
- [ ] **T2 (AC2, AC7)** — Instrumentar o Meta Pixel via `next/script`, com
  tratamento de falha silenciosa (try/catch ou verificação de `window.fbq`
  antes de chamar `track`).
- [ ] **T3 (AC3, AC8)** — Construir o formulário (client component), campos
  mínimos, validação client-side básica, máscara de telefone.
- [ ] **T4 (AC4)** — Investigar se já existe uma rota pública de criação de
  lead (grep por `lead_source` valores e rotas `POST` sem `requireAuth`); se
  não houver, criar `POST /api/public/leads` com validação de payload e
  rate-limiting básico (ex.: por IP, janela curta — reaproveitar qualquer
  utilitário de rate-limit já existente no projeto).
- [ ] **T5 (AC4)** — Confirmar/estender o enum `lead_source` se for
  necessário um valor novo (`landing_page_crm` ou equivalente) — se exigir
  migration, coordenar com @data-engineer (migration separada, não nesta
  story se o enum já cobrir o caso com um valor existente como `website`).
- [ ] **T6 (AC5)** — Disparar `fbq('track', 'Lead', ...)` no callback de
  sucesso da submissão.
- [ ] **T7 (AC6)** — Documentar nos Dev Notes a coexistência intencional das
  origens de lead.
- [ ] **T8** — Testes: unitário do formulário (validação de campos),
  integração da API route nova (criação de lead, rate-limit), manual do
  fluxo completo (preencher form → lead aparece no kanban → `fbq('track',
  'Lead')` disparado, confirmável via Meta Pixel Helper extension ou Test
  Events).

## Dev Notes

### [@po — notas de validação / fronteira de escopo]
Verificado na validação:
- **Não existe** `packages/web/src/app/api/public/` no repo hoje — a T4 de fato
  criará `POST /api/public/leads` do zero. A investigação prévia (grep) já está
  na task, mas o resultado é conhecido: não há rota reaproveitável.
- **`lead_source` é um enum Postgres** (`CREATE TYPE lead_source AS ENUM (...)`,
  `001_base_schema.sql`), com valor `'website'` já existente. Preferir `'website'`
  (ou `'meta_ads'`, ambos existentes) evita `ALTER TYPE ... ADD VALUE`, que tem a
  peculiaridade de não poder ser usado no mesmo enum na mesma transação de sua
  criação. **Recomendação do @po:** usar `'website'` no MVP e NÃO abrir migration
  de enum nesta story (mantém T5 sem custo de schema). Se o negócio exigir
  distinguir a origem depois, isso vira story própria.
- **Rate-limit:** não há utilitário genérico de rate-limit no projeto (confirmado
  na validação). O @dev provavelmente terá que introduzir um mecanismo simples
  (in-memory por IP com janela curta, ou honeypot + validação de payload) — dado
  o volume baixo, um rate-limit in-memory básico é suficiente para o MVP; evitar
  puxar dependência nova (Upstash etc.) sem necessidade.

### [@po — fix de fronteira com a Story 86-6 (importante)]
A rota `POST /api/public/leads` criada aqui é o ponto onde a **86-6** captura
IP/User-Agent do servidor e persiste `metadata.meta_ad`. Para evitar retrabalho:
ao criar a rota nesta story, **já deixar o handler estruturado para receber campos
de atribuição opcionais no body** (`fbc?`, `fbp?`, `fbclid?`) e ter acesso aos
headers do request — mesmo que a persistência de `metadata.meta_ad` só seja
implementada na 86-6. Não implementar a lógica de metadata aqui (é escopo da 86-6),
apenas não fechar a assinatura da rota de um jeito que a 86-6 tenha que reescrevê-la.
Documentar essa "costura" no PR desta story.

### Referência de rota pública existente
[Fonte: `packages/web/src/app/agendar/[token]/page.tsx`,
`docs/stories/75-189-rotas-publicas-agendar-pasta.story.md`] O projeto já tem
pelo menos uma família de rotas públicas sem autenticação (`/agendar/[token]`).
Aquele caso usa token de acesso (link enviado por WhatsApp) — este caso é
diferente: acesso aberto (qualquer visitante da campanha), sem token. Herdar
apenas o padrão de "rota fora do guard de autenticação", não o padrão de
token.

### Coexistência com Instant Forms — não é substituição
[Decisão do epic] Esta story NÃO desativa nem substitui os Instant Forms do
Meta nem a landing WordPress existente. Cria uma alternativa adicional,
controlada pelo CRM, que os próximos anúncios podem passar a usar. A
migração completa de tráfego (redirecionar anúncios existentes para esta
landing) é decisão de negócio/mídia, não uma tarefa de código desta story.

### Meta Pixel básico agora, Advanced Matching depois (86-7)
Esta story instala o Pixel com `fbq('init', DATASET_ID)` simples. A Story
86-7 estende esse `init` para incluir Automatic Advanced Matching e passar
`external_id`/`em`/`ph` — dependência explícita, não implementar AAM aqui
para manter esta story focada e revisável.

### Rate-limiting da rota pública
Como é uma rota sem autenticação recebendo submissões de qualquer origem,
precisa de alguma proteção básica contra spam/abuso (bots preenchendo o
form). Verificar se o projeto já tem algum utilitário de rate-limit
(Upstash, in-memory, ou similar) antes de introduzir uma dependência nova.

### Testing
- Unit: validação de campos do formulário (telefone inválido, e-mail
  malformado quando obrigatório).
- Integration: `POST /api/public/leads` cria lead com `source` correto,
  rejeita payload malformado, rate-limit bloqueia excesso de submissões da
  mesma origem em janela curta.
- Manual: fluxo completo com Meta Pixel Helper (extensão de browser) ou aba
  "Test Events" do Events Manager confirmando `PageView` e `Lead` disparados
  corretamente.
- Manual: Pixel bloqueado (simular via ad blocker) não impede a submissão
  do formulário nem a criação do lead (AC7).

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via revisão manual do @dev + @ux-design-expert + @qa gate.

**Story Type:** Frontend (página pública + formulário) + Integration (Pixel + API de criação de lead)
**Complexidade:** Medium — página nova sem autenticação exige atenção a rate-limiting/abuso; Pixel é client-side, tolerante a falha.
**Focus Areas:** Acessibilidade (labels, mensagens de erro), responsividade mobile-first (tráfego de Ads é majoritariamente mobile), falha graciosa do Pixel (AC7), rate-limiting básico na rota pública.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta e da decisão travada de migrar forms/landing para o CRM. | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 8/10. Draft → Ready. É a maior story do epic mas o escopo está bem delimitado (Fora do escopo explícito: DNS, descontinuação WP, design final). Fixes aplicados via Dev Notes: (1) enum `lead_source` já tem `'website'` — não abrir migration de enum; (2) rate-limit não existe no projeto, usar in-memory básico; (3) costura com 86-6 — deixar a rota `/api/public/leads` pronta para receber campos de atribuição sem reescrita. Dependência formal em 86-4 é conservadora (só P0 completo) mas 86-5 poderia iniciar após 86-4 em paralelo com 86-6 — sequência do epic OK. | @po (Pax) |

## Nota do @po (2026-08-17)

Story **substituída pela 86-9**. Ela presumia a landing e a rota `POST /api/public/leads`
da Story 86-5, que nunca foram criadas: o Epic 89 entregou `/formulario/[token]` +
`POST /api/formulario/[token]` no lugar. Os objetivos desta story foram consolidados
na 86-9, apontando para os arquivos que de fato existem.
