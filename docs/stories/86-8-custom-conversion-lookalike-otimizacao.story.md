# Story 86-8 — Custom Conversion "Visitou" + Lookalike + ajuste de otimização de campanha

**Status:** Ready
**Epic:** 86 — Conversions API (CAPI) e Rastreamento Meta
**Executor:** @devops (Gage) — runbook manual no Meta Events Manager/Ads Manager, sem código de aplicação
**Prioridade:** P1
**Depende de:** 86-4 (evento Visitou fluindo via CAPI), 86-7 (Advanced Matching melhorando o EMQ, idealmente concluído antes de configurar Lookalike para maximizar a qualidade da audiência-semente)

## Contexto

Com o evento "Visitou" (standard event `Schedule` + `content_name: "Visitou"`)
fluindo de ponta a ponta via CAPI (Stories 86-2 a 86-4) e enriquecido com
dados de atribuição e Advanced Matching (86-6/86-7), esta story fecha o loop
de valor de negócio: usar esse evento no Meta Ads Manager para (a) medir via
Custom Conversion, (b) alimentar uma audiência Lookalike de "quem visita",
e (c) **sem** mudar a otimização direta da campanha para esse evento — decisão
explícita da auditoria, documentada abaixo.

Esta story é inteiramente de configuração no painel do Meta (Events
Manager + Ads Manager) — não produz nem modifica código.

## Acceptance Criteria

1. **AC1 — Custom Conversion "Visitou" criada no Events Manager.** No
   Dataset `1337310707164669`, criar uma Custom Conversion baseada no evento
   standard `Schedule` filtrado por `content_name = "Visitou"` (usar a regra
   de filtro de parâmetro do próprio Meta, não um evento customizado
   separado — reaproveita o standard event já configurado nas stories
   anteriores). Nome sugerido no painel: "Visitou (CRM)".
2. **AC2 — Custom Conversion validada com volume real.** Após a Story 86-4
   estar em produção por tempo suficiente para gerar eventos reais (não
   apenas Test Events), confirmar no Events Manager que a Custom Conversion
   está recebendo e contabilizando eventos (`Conversions` > 0 na aba da
   Custom Conversion).
3. **AC3 — Audiência Lookalike criada a partir do evento Visitou.** No Ads
   Manager, criar uma Custom Audience de origem "Website/Pixel event"
   apontando para o evento `Schedule` filtrado por `content_name = "Visitou"`
   (ou diretamente pela Custom Conversion do AC1, se o Meta permitir
   Lookalike a partir de Custom Conversion — confirmar na interface atual),
   com janela de lookback adequada ao volume baixo (recomendado 180 dias,
   dado o volume de ~22 leads visitantes/mês — uma janela curta não teria
   audiência-semente suficiente). A partir dessa Custom Audience, criar uma
   Lookalike Audience (1-3%, Brasil ou a região geográfica relevante da
   campanha).
4. **AC4 — Campanha NÃO reconfigurada para otimizar por Visitou.** Documentar
   explicitamente (nesta story e/ou runbook) que a campanha continua
   otimizando por `Lead` (evento de topo de funil, com volume suficiente
   para saída do Learning Phase). **Não** trocar o evento de otimização da
   campanha para `Schedule`/"Visitou" — com ~22 conversões desse tipo por
   mês (menos de 50/semana, o mínimo recomendado pelo Meta), a campanha
   entraria em "Learning Limited" permanente, degradando a entrega.
5. **AC5 — Lookalike incorporado como audiência adicional (não substituta).**
   A nova Lookalike Audience (AC3) é adicionada como uma opção de
   segmentação em um ad set novo ou existente, em paralelo às audiências
   já em uso — não substitui a segmentação atual da campanha principal (que
   continua otimizando por Lead conforme AC4). Decisão de qual ad set/orçamento
   usar essa audiência é do time de mídia/negócio, não uma exigência técnica
   desta story.
6. **AC6 — Runbook documentado.** Passo-a-passo de como a Custom Conversion e
   a Lookalike foram configuradas (nomes exatos usados no painel, IDs
   gerados, filtros aplicados) é registrado em memória de agente
   (`@devops`) ou documento de runbook — não em código — para permitir
   replicação/manutenção futura sem depender de memória tribal.

## Tasks

- [ ] **T1 (AC1)** — Criar a Custom Conversion "Visitou (CRM)" no Events
  Manager, filtrando `Schedule` por `content_name = "Visitou"`.
- [ ] **T2 (AC2)** — Aguardar volume real (pós-deploy da Story 86-4) e
  validar que a Custom Conversion está contabilizando eventos.
- [ ] **T3 (AC3)** — Criar a Custom Audience de origem Pixel/evento
  (`Schedule` filtrado, janela de 180 dias) e a Lookalike Audience derivada.
- [ ] **T4 (AC4, AC5)** — Confirmar que a campanha principal permanece
  otimizando por `Lead` — nenhuma mudança de otimização é feita nesta story.
  Documentar a Lookalike como audiência adicional disponível para uso futuro
  em novos ad sets/campanhas, a critério do time de mídia.
- [ ] **T5 (AC6)** — Registrar o runbook (nomes, IDs, filtros, data de
  criação) em memória `@devops`.

## Dev Notes

### Por que não otimizar a campanha por "Visitou" (decisão da auditoria)
[Fonte: auditoria @analyst] Com ~22 leads/mês chegando ao estágio "visitou"
(estimativa baseada no volume atual de leads e taxa de conversão típica de
funil imobiliário), o volume semanal fica muito abaixo do mínimo recomendado
pelo Meta (~50 conversões/semana) para uma campanha saída da fase de
aprendizado (Learning Phase) de forma estável. Otimizar diretamente por esse
evento faria a campanha entrar em "Learning Limited" permanentemente —
entrega instável, CPL alto, sem sinal suficiente para o algoritmo aprender.
A estratégia correta com este volume é: (1) usar o evento como **sinal de
mensuração** (Custom Conversion, para saber quanto custa e quantos visitantes
cada campanha realmente gera — vai muito além do que "Lead" sozinho
mostra), e (2) usá-lo como **semente de Lookalike** (público de qualidade
para futuras campanhas de prospecção), mantendo a otimização de entrega no
evento `Lead`, que tem volume suficiente.

### Sem código, sem migration, sem deploy
Esta story é inteiramente operacional no painel do Meta. O `@devops` (Gage)
é o executor porque envolve infraestrutura de terceiros e credenciais/acesso
de negócio (Business Manager), análogo ao papel do `@devops` em outras
tarefas de infraestrutura do epic (Story 86-1) — não porque envolve
CI/CD ou push de código.

### Dependência temporal de volume real
O AC2 não pode ser validado no mesmo dia do merge desta story — depende de
a Story 86-4 estar em produção coletando eventos reais por dias/semanas. É
aceitável que esta story fique com um AC "em observação" documentado, sem
bloquear o fechamento formal do epic, desde que a configuração (AC1, AC3)
esteja feita e documentada.

### Testing
- Não há testes automatizados (sem código). Validação é observacional no
  painel do Meta Events Manager / Ads Manager.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Esta story não produz código — quality gate é validação manual do @devops
> + revisão de runbook pelo @pm/@po quanto à estratégia de campanha.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir da auditoria de tracking Meta. Fecha o valor de negócio do epic sem sacrificar a estabilidade da campanha (decisão explícita de não otimizar por Visitou dado o volume). | @sm (River) |
| 2026-08-04 | 0.2 | Validação @po (10-point): GO, 8/10. Draft → Ready. Runbook manual @devops (sem código) — coerente com o papel do @devops na 86-1. Decisão de NÃO otimizar por Visitou (AC4) é rastreável à decisão travada da auditoria (~22 leads/mês < 50/semana → Learning Limited) — No Invention ✓. AC2 (validação com volume real) corretamente marcado como "em observação" pós-deploy, não bloqueia o fechamento do epic desde que AC1/AC3/AC6 (config + runbook) estejam feitos. | @po (Pax) |
