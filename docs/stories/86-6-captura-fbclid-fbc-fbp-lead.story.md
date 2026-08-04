# Story 86-6 — Captura de `fbclid`/`fbc`/`fbp` e IP/User-Agent na entrada do lead

**Status:** Ready
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @dev (Dex)
**Prioridade:** P1
**Depende de:** 86-4 (P0 completo — dispatcher envia o evento Visitou) **e 86-5** (a captura de fbclid/IP/UA e a persistência de `metadata.meta_ad` acontecem na landing e na rota `POST /api/public/leads` criadas pela 86-5; sem elas, os AC2/AC4/AC5 não têm onde existir). Ver nota @po no rodapé.

## Contexto

Hoje o payload do evento "Visitou" (Story 86-3/86-4) é construído apenas com
dados que já existem em `leads` (nome, telefone, e-mail) — sem `fbc`/`fbp`,
que são os campos de maior impacto na qualidade de correspondência (EMQ) do
Meta CAPI. Essa story fecha essa lacuna: captura o `fbclid` da URL (quando o
lead chega via clique em anúncio), monta os formatos `fbc`/`fbp` exigidos
pelo Meta, e persiste tudo em `leads.metadata` — a mesma coluna JSONB já
usada pelo fluxo CTWA (`buildCtwaMetadata`,
`packages/web/src/app/api/webhook/whatsapp/ctwa-metadata.ts`), seguindo o
mesmo shape/convenção (namespace próprio dentro do JSONB para não colidir
com as chaves já usadas pelo CTWA e pelo Meta Ads leadgen).

## Acceptance Criteria

1. **AC1 — Namespace `metadata.meta_ad` definido e documentado.** Novo shape
   dentro de `leads.metadata`, análogo ao já existente para CTWA, mas sob uma
   chave própria para não colidir:
   ```json
   {
     "meta_ad": {
       "fbc": "fb.1.<creation_time_ms>.<fbclid>",
       "fbp": "fb.1.<creation_time_ms>.<random>",
       "fbclid": "<valor bruto capturado>",
       "client_ip": "<ip do request>",
       "client_ua": "<user-agent do request>",
       "captured_at": "<ISO 8601>"
     }
   }
   ```
   Documentado com comentário de coluna análogo ao de
   `075_leads_metadata.sql` (`COMMENT ON COLUMN leads.metadata IS ...`), se
   uma migration for necessária para atualizar o comentário (avaliar se
   `COMMENT ON COLUMN` precisa de nova migration ou se basta atualizar a
   documentação em código/Dev Notes — decisão do @dev, não é uma alteração
   de schema).
2. **AC2 — Captura de `fbclid` na landing page nova (86-5).** Na página
   criada pela Story 86-5, o `fbclid` é lido dos query params da URL
   (`useSearchParams` ou equivalente) no carregamento e enviado junto com o
   payload de submissão do formulário para a API de criação de lead.
3. **AC3 — Cálculo de `fbc`/`fbp` no browser.** Função utilitária (client-side,
   `packages/web/src/lib/meta/browser-attribution.ts` ou local à página) que:
   - Lê o cookie `_fbc` do browser se existir (o Pixel já popula esse cookie
     automaticamente quando há `fbclid` na URL — reaproveitar em vez de
     recalcular manualmente sempre que o cookie existir).
   - Se o cookie `_fbc` não existir mas houver `fbclid` na URL (primeira
     visita, cookie ainda não setado pelo Pixel no momento da leitura), monta
     o valor manualmente no formato `fb.1.{Date.now()}.{fbclid}`.
   - Lê o cookie `_fbp` do browser (populado automaticamente pelo Pixel após
     `fbq('init')`) — não recalcular manualmente, é sempre gerado pelo script
     oficial do Meta.
4. **AC4 — Captura de IP e User-Agent no servidor.** Na API route de criação
   de lead (`POST /api/public/leads`, Story 86-5), captura-se o IP do
   request (via header `x-forwarded-for` — padrão em ambiente Vercel — com
   fallback documentado) e o `User-Agent` do header da requisição.
5. **AC5 — Persistência em `leads.metadata.meta_ad`.** Ao criar o lead (na
   mesma rota `POST /api/public/leads`), os campos capturados (`fbc`, `fbp`,
   `fbclid`, `client_ip`, `client_ua`, `captured_at = now()`) são gravados no
   namespace `metadata.meta_ad`, usando um helper puro análogo a
   `buildCtwaMetadata` (spread do metadata atual, preservando outras chaves
   já existentes — ex. se o lead também tiver dados de CTWA por outro canal,
   o que na prática não deve ocorrer para leads desta landing, mas o padrão
   defensivo de merge é o mesmo).
6. **AC6 — Dispatcher (86-4) passa a usar `metadata.meta_ad` quando
   disponível.** O cron `meta-capi-dispatch` (Story 86-4), ao montar o
   `user_data` do evento Visitou, lê `lead.metadata?.meta_ad?.fbc`,
   `?.fbp`, `?.client_ip`, `?.client_ua` (se presentes) e os inclui no
   payload via `buildCapiUserData` (Story 86-3, campos já suportados na
   assinatura da função). Se ausentes (lead não veio da landing com
   atribuição — ex. veio do Instant Form nativo), o evento é enviado sem
   esses campos, sem erro.
7. **AC7 — Nenhum dado sensível é hasheado incorretamente.** `fbc`, `fbp`,
   `client_ip`, `client_ua` permanecem em texto puro em todas as camadas
   (persistência, payload) — apenas `em`/`ph`/`fn`/`ln`/`external_id`
   (Story 86-3) são hasheados. Teste garante que este AC não regride.
8. **AC8 — Fallback gracioso quando não há `fbclid`.** Tráfego orgânico
   (sem `fbclid` na URL) não gera erro — `metadata.meta_ad` é gravado com os
   campos disponíveis (pode não ter `fbc`/`fbclid`, mas ainda tem `fbp` se o
   Pixel tiver criado o cookie, `client_ip`/`client_ua` sempre presentes).

## Tasks

- [ ] **T1 (AC1)** — Documentar o shape `metadata.meta_ad` (Dev Notes desta
  story + comentário de coluna, se aplicável).
- [ ] **T2 (AC2, AC3)** — Implementar a leitura de `fbclid`/`_fbc`/`_fbp` no
  client da landing page (86-5) e incluir no payload de submissão.
- [ ] **T3 (AC4)** — Capturar IP/User-Agent na API route de criação de lead.
- [ ] **T4 (AC5)** — Implementar o helper de merge de metadata (análogo a
  `buildCtwaMetadata`) e persistir na criação do lead.
- [ ] **T5 (AC6)** — Atualizar o cron `meta-capi-dispatch` (86-4) para ler
  `metadata.meta_ad` e passar os campos para `buildCapiUserData`.
- [ ] **T6 (AC7, AC8)** — Testes unitários do helper de merge (com/sem
  `fbclid`, cookie presente/ausente, preservação de outras chaves de
  metadata) e do dispatcher lendo o namespace novo.
- [ ] **T7** — Teste manual fim-a-fim: acessar a landing (86-5) com um
  `fbclid` fake na URL, submeter o form, confirmar `metadata.meta_ad`
  populado no lead criado, mover o lead para `visitou`, confirmar que o
  evento CAPI enviado (via Test Events) inclui `fbc`/`fbp` corretamente.

## Dev Notes

### [@po — dependência real de 86-5 confirmada]
O header desta story lista `Depende de: 86-4`, mas os AC2 (captura de `fbclid` na
landing), AC4 (IP/UA na rota `POST /api/public/leads`) e AC5 (persistência) só têm
onde acontecer **depois da 86-5**, que cria a landing e a rota. Ajustado o campo
"Depende de" para incluir 86-5 explicitamente. A parte que **não** depende de 86-5
é o AC6 (dispatcher da 86-4 ler `metadata.meta_ad`) — essa pode ser feita
independentemente, mas só produz efeito visível quando houver leads com o namespace
populado (o que exige 86-5+resto da 86-6). Recomendação: executar 86-6 logo após
86-5, na mesma leva de trabalho de frontend/rota pública.

### Reuso do padrão `buildCtwaMetadata`
[Fonte: `packages/web/src/app/api/webhook/whatsapp/ctwa-metadata.ts`] Esta
story reaplica o mesmo padrão de "merge helper puro e testável" já usado
para o metadata de atribuição CTWA — não reinventar a abordagem.

> **[@po — verificado]** `buildCtwaMetadata` grava seus campos (`ctwa_clid`,
> `source_url`, `ctwa_window_expires_at`, etc.) **na RAIZ do JSONB `leads.metadata`**,
> não sob um namespace. Isso **valida** a decisão desta story de usar
> `metadata.meta_ad` como namespace próprio: como o CTWA ocupa a raiz, colocar os
> campos de atribuição Meta sob `meta_ad` evita qualquer colisão de chave. A
> sugestão do draft de "avaliar mover o CTWA para `metadata.ctwa`" deve ser
> **rejeitada** nesta story — é código em produção (Story 50-3, com testes), mexer
> no shape dele é risco fora de escopo. Manter o CTWA como está.

A diferença desta story é o namespace (`meta_ad`) vs. os campos de nível raiz que o
CTWA usa atualmente (`ctwa_clid`, `source_url`, etc.) e a origem do dado (formulário
próprio vs. webhook do WhatsApp). Se o `buildCtwaMetadata` grava campos na
raiz do JSONB (sem namespace), avaliar se vale a pena, nesta story, também
mover esses campos para dentro de um namespace (`metadata.ctwa`) por
consistência — **decisão do @dev, documentar se optar por não tocar no CTWA
existente** (é código funcionando em produção, mudança de shape ali é risco
desnecessário fora do escopo deste epic).

### `_fbc`/`_fbp` são cookies do próprio Pixel, não hand-rolled
O Meta Pixel, uma vez inicializado (`fbq('init', ...)`, Story 86-5), já
gerencia os cookies `_fbc` e `_fbp` automaticamente no domínio. Ler esses
cookies é preferível a recalcular manualmente sempre — reduz risco de
formato incorreto. O cálculo manual do AC3 é apenas um fallback para o caso
raro de o cookie `_fbc` ainda não existir no exato momento da leitura (ex.:
script do Pixel ainda carregando de forma assíncrona quando o usuário já
submeteu o form rapidamente).

### `x-forwarded-for` em ambiente Vercel
Vercel popula esse header com o IP real do cliente em produção. Em
desenvolvimento local, o header pode não existir — tratar com fallback
(`request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null`),
sem lançar erro se ausente (AC8 exige tolerância a campos faltantes).

### Testing
- Unit: helper de merge de metadata preserva chaves não relacionadas,
  sobrescreve `meta_ad` corretamente, funciona com `currentMetadata: null`
  (lead novo).
- Unit: dispatcher (86-4) constrói `user_data` corretamente com e sem
  `metadata.meta_ad` presente.
- Manual: fluxo fim-a-fim descrito na T7.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via revisão manual do @dev + @qa gate.

**Story Type:** Integration (atribuição de campanha) + Frontend (leitura de query params/cookies)
**Complexidade:** Low/Medium — reaproveita padrão existente (`buildCtwaMetadata`), escopo bem contido.
**Focus Areas:** Nenhum dado sensível hasheado incorretamente (AC7 — crítico), fallback gracioso sem `fbclid` (tráfego orgânico), preservação de outras chaves de `leads.metadata` já em uso por outros fluxos (CTWA, Meta Ads leadgen).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta. Enriquece o evento Visitou (86-4) com dados de atribuição capturados na landing própria (86-5). | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 8/10. Draft → Ready. Dois fixes aplicados: (1) dependência real de 86-5 tornada explícita no header (AC2/4/5 vivem na landing/rota da 86-5); (2) confirmado que `buildCtwaMetadata` grava na RAIZ do JSONB — valida o namespace `meta_ad` e a sugestão de "mover CTWA para namespace" foi rejeitada (código em prod, fora de escopo). AC7 (fbc/fbp/IP/UA nunca hasheados) coerente com AC5 da 86-3. | @po (Pax) |
