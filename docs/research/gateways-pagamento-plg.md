# Gateway de pagamento para o modelo PLG — pesquisa comparativa

**Data da pesquisa:** 2026-08-24
**Contexto:** Epic 900 (SaaS multi-tenant). Decisões D15/D16 trocaram venda assistida por signup
público com **trial de 3 dias e cartão vinculado no cadastro**.
**Substitui** a versão anterior deste documento (commit `698482cc`), que comparava só Asaas × Stripe
e **continha um erro de taxa** — ver [Correção](#correção-da-versão-anterior).

---

## 1. Como esta pesquisa foi ponderada

Os critérios foram reordenados a pedido do dono do produto, com a justificativa de que
*"como é uma recorrência relativamente simples, não precisamos de um gateway muito complexo;
melhor ter suporte bom e taxas competitivas"*.

**Primeira ordem (decidem):**

| # | Critério | Por que decide |
|---|----------|----------------|
| 1 | **Qualidade de suporte** | Em cobrança recorrente, suporte ruim = cliente sem acesso ao sistema esperando resposta = churn direto |
| 2 | **Taxas** | Incide sobre toda cobrança, todo mês, para sempre |
| 3 | **Requisito mínimo** | Tokenizar cartão no cadastro + cobrar automaticamente após 3 dias |

**Segunda ordem (desempate):** webhook, SDK/doc, liquidação (D+N), escopo PCI.

**Explicitamente NÃO valorizado:** marketplace, split, multi-moeda, faturamento internacional,
proration sofisticado, amplitude de recursos. Nada disso entra no roadmap.

> Um gateway "completo" que cobra caro e atende mal é **pior** para este caso do que um simples
> com bom atendimento.

### Aviso metodológico sobre os dados de suporte

Os números do Reclame Aqui medem **reclamações de consumidor final**, não de merchant/desenvolvedor
integrando API. Para Pagar.me o problema é ainda maior: a página do RA foi **unificada com a da
Stone**, então os números refletem a operação de maquininhas, não o suporte a integradores.

Onde foi possível, separei o sinal: reclamações no RA que são **especificamente sobre API/suporte
técnico** valem muito mais para nós do que a nota agregada. Isso está marcado caso a caso.

---

## 2. Rodada de eliminação

Descartados antes da comparação final, com o motivo:

| Candidato | Motivo do descarte | Evidência |
|---|---|---|
| **Appmax** | **Falha no requisito mínimo.** `POST /v1/subscriptions` exige um **pedido já aprovado** (`order_id` com status aprovado/integrado pelo antifraude). Não há conceito de trial em lugar nenhum da doc — busca por "trial", "período de teste", "teste gratuito" em `llms-full.txt` (10.932 linhas): **zero ocorrências**. Não há caminho documentado para tokenizar com R$ 0,00 e cobrar depois. Além disso, a modelagem é de e-commerce físico (frete, SKU, endereço de entrega, `shopify_variant_id`) e a arquitetura é de "app instalado na loja do merchant" via OAuth2 — mismatch estrutural com SaaS B2B próprio. | [docs Appmax — criar assinatura](https://docs.appmax.com.br/api-reference/subscriptions/criar-assinatura.md) |
| **Galax Pay** | **Falha no critério nº 1 de forma terminal.** Classificada "Não recomendada" no RA por responder **0%** das reclamações — 169 recebidas, 156 aguardando resposta. Ressalva honesta: boa parte das reclamações é de *pagadores finais* ("boleto que não reconheço"), não de merchants. Mesmo assim, uma empresa que não responde nada não passa num critério em que suporte é primeira ordem. | [RA — Galax Pay](https://www.reclameaqui.com.br/empresa/galax-pay/) |
| **Iugu** | **Suporte fraco demais para o peso do critério.** Nota 8.3, mas o **tempo médio de resposta vai de 18 a 30 dias** dependendo da janela medida (18d02h em 01/12/25–31/05/26; 23d21h em 01/02–31/07/26; 30d02h nos dados gerais) e o índice de solução geral cai para 78,1%. É o pior tempo de resposta entre todos os medidos. | [RA — Iugu](https://www.reclameaqui.com.br/empresa/iugu/) |
| **Vindi** | **Melhor suporte medido do grupo, eliminado por custo.** RA1000, 98,1% de solução, nota do consumidor 9,18, 6d21h de resposta — o melhor conjunto de indicadores da pesquisa. Mas: **acesso à API só a partir do plano Pro, R$ 499/mês fixo**, antes de qualquer transação, mais ~2,75–3,99% + R$ 0,39 + R$ 0,40 de antifraude, e liquidação em **D+14 ou D+30**. Ver [modelagem de custo](#5-custo-real-modelado). Vira candidato de novo se/quando a base passar de ~150–200 assinantes. | [Vindi — preços](https://vindi.com.br/precos/) · [RA — Vindi](https://www.reclameaqui.com.br/empresa/vindi/) |
| **Stripe** | **Perde nos três critérios de primeira ordem.** (1) Suporte: nota **5,9/10** no RA nos últimos 6 meses — "os consumidores avaliaram como ruim" — com padrão recorrente de **bloqueio de conta e retenção de valores** por verificação de identidade, durando meses. Para quem depende do gateway para faturar, esse é o pior modo de falha possível. (2) Taxa: **3,99% + R$ 0,39** para cartão nacional **+ 0,7% de Billing** = a mais cara do comparativo. (3) O requisito mínimo ele atende bem (`trial_period_days`), mas isso não compensa 1 e 2. O reenquadramento do dono do produto é explícito: profundidade técnica não compra a decisão. | [Stripe — preços BR](https://stripe.com/br/pricing) · [RA — Stripe](https://www.reclameaqui.com.br/empresa/stripe/) |
| **Mercado Pago / PagBank / Cielo** | **Não avançaram por perfil.** São adquirentes/carteiras de varejo, com recorrência secundária no produto (`preapproval`), suporte estruturado para consumidor final e histórico consistente de reclamação por bloqueio de conta e retenção de saldo. PagBank: nota 8.3–8.7, solução 80–90%, mas queixas dominantes de conta bloqueada e Pix travado. Nenhum deles é orientado a SaaS B2B. Não investiguei os casos de borda a fundo — se algum for reconsiderado, isso precisa ser feito. | [RA — PagBank](https://www.reclameaqui.com.br/empresa/pagseguro/) |
| **Malga / Barte** | **Não avaliados em profundidade.** Malga é orquestrador (camada sobre gateways — resolve um problema que não temos: múltiplos adquirentes). Barte é focado em B2B/crédito com pricing sob consulta. Ambos sem preço público e sem massa crítica de evidência de suporte. **Lacuna assumida**, não conclusão. | — |

---

## 3. Finalistas — tabela comparativa

Três sobreviveram: **Asaas**, **AbacatePay**, **Pagar.me**.

| Critério | **Asaas** | **AbacatePay** | **Pagar.me (Stone)** |
|---|---|---|---|
| **① SUPORTE — nota RA** | 8.4 | sem amostra útil (3 reclamações) | 8.9 (RA1000) |
| **① Índice de solução** | 86,4% (91% em outro recorte) | — | 90,8% |
| **① Tempo médio de resposta** | **8 dias e 21 horas** | 2d02h (sobre 3 casos) | **4 dias e 22 horas** |
| **① Voltaria a fazer negócio** | 71% | — | 82,5% |
| **① Reclamações RA (volume)** | 1.587 | 3 | unificado com Stone |
| **① Canal técnico dedicado** | Discord + "canal oficial de integração" + status page | **Discord + grupo WhatsApp com um dos founders** | Suporte Stone + doc; sem canal dev público destacado |
| **① Veredito de suporte** | ❌ **Vetado pelo dono do produto**, corroborado por dados | ⚠️ modelo bom, **sem histórico** | ✅ melhor evidência medida, **mas contaminada** |
| **② TAXA cartão (assinatura à vista)** | **R$ 0,49 + 2,99%** | R$ 0,60 + 3,5% | **~3,19% (não oficial)** — sob consulta |
| **② Pix** | R$ 0,99 (promo 3m) → R$ 1,99 | R$ 0,80 | mesmo dia |
| **② Mensalidade de plataforma** | Nenhuma | **Nenhuma** | Nenhuma (planos negociados) |
| **② Transparência de preço** | ✅ pública | ✅ pública | ❌ **não publicada** |
| **③ Trial c/ cartão** | ⚠️ via `nextDueDate` futuro | ✅ **`trialDays` (1–90) nativo** | ✅ `trial_period_days` nativo |
| **③ Mecanismo de tokenização** | Cartão validado na criação; **tokenização exige liberação da conta** em produção | Checkout cobra **R$ 0,00** e só tokeniza | Tokenização no cliente |
| **Dunning configurável** | ❌ fixo, ~2 dias | ✅ **`retryPolicy`: até 10 tentativas × até 30 dias** | ⚠️ 5 dias de tolerância + 4 tentativas × 3 dias (config.) |
| **Webhook de assinatura** | ✅ `SUBSCRIPTION_*` + eventos de cobrança | ✅ `subscription.*` | ✅ |
| **Verificação de webhook** | Token próprio + idempotência documentada | ⚠️ **HMAC com chave pública compartilhada** (ver §4.2) | Assinatura por conta |
| **Liquidação cartão** | ✅ **D+2** | ❌ **D+32** (antecipação D+2 caso a caso) | ✅ **D+2** (à vista) |
| **SDK Node oficial** | ⚠️ sem pacote oficial de peso (`asaas` npm parado em 03/2025) | ⚠️ **`abacatepay-nodejs-sdk` v1.6.0, último publish 07/10/2025 — não cobre assinaturas** | ✅ **`pagarme` v4.35.2, publish 08/08/2026** |
| **Sandbox** | ✅ | ✅ dev mode + `simulate-payment` | ✅ |
| **Escopo PCI** | SAQ-A se usar checkout hospedado | ✅ **SAQ-A** — cartão nunca toca nosso servidor (checkout hospedado obrigatório p/ assinatura) | SAQ-A com tokenização no cliente |
| **Maturidade da empresa** | Consolidada | ⚠️ **CNPJ aberto em 28/11/2024** (~21 meses) | Stone (capital aberto) |

---

## 4. Os três casos de borda — o coração da pesquisa

Estes definem como o entitlement do sistema reage. Errar aqui = módulo ligado sem pagamento, ou
desligado tendo pago.

### 4.1 Cartão falha na 1ª cobrança pós-trial (dunning)

| | Comportamento | Fonte / confiança |
|---|---|---|
| **AbacatePay** | **Documentado com precisão.** `retryPolicy.maxRetry` (default 3, min 1, max 10) e `retryPolicy.retryEvery` em dias (default 1, min 1, max 30). Esgotadas as tentativas, a assinatura é **cancelada automaticamente** com `cancelledDueTo: "max_payment_retries_exceeded"` e dispara `subscription.cancelled`. | Alta — doc oficial explícita |
| **Asaas** | 3 tentativas no dia do vencimento (8h/14h/20h, a cada 6h) + 2 tentativas a cada 24h = 5 no total, **limitado a 2 dias após o vencimento**. Depois disso a assinatura fica "vencida" e **não há novas tentativas** — o pagador precisa acessar a fatura e informar cartão novo. | Média — central de ajuda + blog. **Duas fontes divergem** (3+2 vs 3+3). Não está na doc de API. |
| **Pagar.me** | Prazo de tolerância default **5 dias** (`pending_payment`), depois até **4 tentativas a cada 3 dias** (`unpaid`), então cancelamento. | **Baixa** — extraído da doc **v3**. A v5 é a versão corrente. **Não confirmado para v5.** |

**Implicação de arquitetura:** a janela de dunning do Asaas (2 dias) é curta demais para um SaaS B2B
— cliente com cartão vencido perde acesso na quarta-feira porque o limite estourou na segunda.
AbacatePay permite modelar exatamente a política que quisermos (ex.: 5 tentativas a cada 3 dias =
15 dias de janela).

**⚠️ Lacuna crítica (AbacatePay):** a lista de eventos de webhook **não inclui nenhum evento de
falha de cobrança**. Os eventos de assinatura são `completed`, `cancelled`, `renewed`,
`trial_started` (+ `plan_changed`, citado na doc de change-plan mas **ausente da lista oficial de
eventos** — inconsistência da doc). Ou seja: durante o dunning, aparentemente **não somos avisados
das falhas individuais** — só do cancelamento no fim. Isso impede avisar o cliente "seu cartão
falhou, atualize". **Não documentado — exige teste em sandbox e/ou pergunta direta ao suporte.**

### 4.2 Cliente cancela durante o trial

| | Comportamento | Confiança |
|---|---|---|
| **AbacatePay** | **Documentado explicitamente:** "Cancelar uma assinatura em período de trial tem o mesmo comportamento que cancelar uma assinatura normal: o cancelamento é imediato e nenhuma cobrança futura é processada." Atenção: `cancelPolicy: NOW` — **acesso cai na hora, sem carência**. Se quisermos "cancelou mas usa até o fim do período pago", isso é lógica nossa, não do gateway. | Alta |
| **Asaas** | Como o trial é só um `nextDueDate` no futuro, remover a assinatura antes dessa data logicamente não gera cobrança — mas **não encontrei essa afirmação na documentação**. **Não documentado — exige teste em sandbox.** | Baixa |
| **Pagar.me** | Status `trialing` existe e "nenhuma cobrança foi feita" durante ele; cancelamento nesse estado não está descrito. **Não documentado para v5 — exige teste em sandbox.** | Baixa |

### 4.3 Upgrade/downgrade no meio do ciclo (proration)

| | Comportamento | Confiança |
|---|---|---|
| **AbacatePay** | **Sem proration, por design e documentado.** `POST /subscriptions/change-plan` agenda a mudança como `PENDING` e aplica **no início do próximo ciclo**; o ciclo atual não é afetado. Só uma alteração pendente por assinatura (nova chamada sobrescreve). Retorna `subu_...` com `newAmount`. | Alta |
| **Asaas** | **Não documentado.** Não localizei tratamento de proration na doc de assinaturas. **Exige teste em sandbox.** | — |
| **Pagar.me** | Existe seção de downgrade com a regra "considera o valor do plano mais caro ao criar a transação atrelada a um plano mais barato", mas a lógica de proration **não está detalhada** e o trecho é da **v3**. **Exige teste em sandbox / confirmação na v5.** | Baixa |

**Leitura:** para os 3 tiers acumulativos do Trifold, "sem proration, vale no próximo ciclo" é
provavelmente o comportamento **desejável** — é simples de explicar ao cliente e trivial de refletir
no entitlement (o módulo liga no vivo, a cobrança ajusta no próximo ciclo). AbacatePay entrega isso
como padrão, sem configuração.

---

## 5. Custo real modelado

Valores de tier ainda não definidos — uso R$ 199 / R$ 399 / R$ 799 **como ilustração**.
Custo por cobrança mensal de assinatura em cartão de crédito à vista, BRL:

| Gateway | R$ 199 | R$ 399 | R$ 799 | % efetivo @ R$399 |
|---|---|---|---|---|
| **Asaas** (0,49 + 2,99%) | R$ 6,44 | R$ 12,42 | R$ 24,38 | **3,11%** |
| **Pagar.me** (~3,19%, *não oficial*) | ~R$ 6,35 | ~R$ 12,73 | ~R$ 25,49 | **~3,19%** |
| **AbacatePay** (0,60 + 3,5%) | R$ 7,57 | R$ 14,57 | R$ 28,57 | **3,65%** |
| **Appmax** (0,99 + 3,49%) *(descartado)* | R$ 7,94 | R$ 14,91 | R$ 28,87 | 3,74% |
| **Stripe** (0,39 + 3,99% + 0,7% Billing) | R$ 9,72 | R$ 19,10 | R$ 37,86 | **4,79%** |

**Delta Asaas → AbacatePay:** ~0,54 p.p. Numa base de 100 clientes a R$ 399 (MRR R$ 39.900),
isso é **~R$ 215/mês** de diferença. Real, mas não estrutural.
**Delta AbacatePay → Stripe:** ~1,14 p.p. = **~R$ 455/mês** na mesma base.

**Vindi, para mostrar por que caiu** (Pro R$ 499/mês fixo, necessário para ter API):

| Base | MRR | Custo total Vindi | % do MRR |
|---|---|---|---|
| 20 clientes × R$ 399 | R$ 7.980 | ~R$ 734 | **9,2%** |
| 50 clientes × R$ 399 | R$ 19.950 | ~R$ 1.087 | 5,4% |
| 200 clientes × R$ 399 | R$ 79.800 | ~R$ 2.851 | **3,6%** |

A mensalidade fixa só se dilui perto de ~200 assinantes. Antes disso, o melhor suporte da pesquisa
custa 2–3× o dos concorrentes.

---

## 6. Recomendação

### 6.1 Principal — **Pagar.me (Stone)**

**Por que ganha nos critérios de primeira ordem:**

1. **Suporte** — é a melhor evidência *medida* disponível: RA1000, índice de solução 90,8%,
   **4 dias e 22 horas de tempo médio de resposta** (o melhor de todos os medidos, ~2× melhor que o
   Asaas), 82,5% voltariam a fazer negócio. Além disso, respaldo institucional da Stone: uma empresa
   de capital aberto tem custo reputacional em abandonar merchant, e não vai desaparecer.
2. **Taxas** — competitivas (~3,19% citado por terceiros), sem mensalidade de plataforma.
3. **Requisito mínimo** — atendido nativamente: `trial_period_days` no plano, status `trialing`,
   cobrança automática no fim do trial. É o mecanismo padrão de mercado.

**Desempate (segunda ordem), onde ele domina:** liquidação **D+2** (vs D+32 da AbacatePay), SDK Node
oficial **ativamente mantido** (`pagarme` 4.35.2, publicado em 08/08/2026), assinatura de webhook por
conta, e o maior pool de desenvolvedores brasileiros que já integrou isso — o que reduz o custo de
achar ajuda fora do suporte oficial.

**O que essa recomendação ASSUME (confirmar antes de fechar):**

- **Que a taxa negociada fique em ~3,2% ou menos.** O Pagar.me **não publica preço**. O número que
  usei é de terceiro, não oficial. Se a proposta comercial vier acima de ~3,5%, ele perde o critério
  nº 2 e a recomendação inverte para a alternativa. **Isto é a maior incerteza da análise.**
- **Que o suporte a integrador seja tão bom quanto o número do RA sugere.** Os dados do RA são da
  página **unificada com a Stone**, medindo consumidor de maquininha. Não encontrei evidência
  específica sobre suporte a merchant de API. **Assunção não verificada.**
- Que o comportamento de trial/dunning/cancelamento da **v5** seja igual ao documentado na v3.

**Risco de errar e custo de saída:** médio-baixo. Se o suporte decepcionar, a troca custa reescrever
a camada de billing e — o ponto caro — **remigrar os cartões tokenizados**. Portabilidade de tokens
entre gateways é possível (via processo de migração PCI entre instituições) mas é burocrática e
lenta. Mitigação desde o dia 1: **não espalhar o gateway pelo código**. Isolar tudo atrás de uma
interface `BillingProvider` (createSubscriptionWithTrial, cancel, changePlan, handleWebhook) para que
a troca seja um adapter, não uma cirurgia.

### 6.2 Alternativa — **AbacatePay**

**Por que ela pode ganhar:**

1. **Suporte por modelo, não por fila.** É o único candidato onde o canal é **Discord + grupo de
   WhatsApp com um dos founders**. Numa empresa de 21 meses com poucos merchants, isso é
   estruturalmente diferente de um ticket numa fila — e é exatamente o antídoto para o problema que
   o dono do produto viveu no Asaas. Contrapeso honesto: **isso não tem lastro estatístico** e os
   elogios que encontrei vêm do site da própria empresa.
2. **Taxas transparentes e públicas** — 3,5% + R$ 0,60, sem mensalidade, sem letra miúda, sem
   negociação comercial. 0,54 p.p. acima do Asaas.
3. **É o único que responde os TRÊS casos de borda explicitamente na documentação.** `trialDays`
   (1–90) com checkout de **R$ 0,00** que só tokeniza — encaixe literal em "3 dias grátis";
   `retryPolicy` configurável (até 10× a cada 30 dias); cancelamento no trial descrito ao pé da
   letra; troca de plano sem proration, no próximo ciclo. Nenhum outro candidato chega perto desse
   nível de resposta documentada.

Bônus não solicitado mas relevante: `POST /subscriptions/record-usage` (pay-as-you-go por unidade,
cobrado no ciclo seguinte) resolveria a **cota de IA** já prevista no pivô SaaS sem código extra.

**O que essa recomendação ASSUME:**

- **Que a empresa exista daqui a 3 anos.** CNPJ aberto em **28/11/2024**, fundadores Daniel Lima e
  Christopher Ribeiro, aporte da Latitud de valor não divulgado. E há um **sinal de pivô**: a
  imprensa de 2026 descreve que a startup "reformulou completamente sua plataforma e passou a se
  posicionar como orquestradora de dados financeiros". Depender dela para faturar é apostar que o
  foco em gateway continua.
- **Que D+32 caiba no fluxo de caixa.** Padrão é receber em 32 dias; antecipação para D+2 é
  "liberada caso a caso mediante consulta ao time comercial" — ou seja, **não garantida**.
- Que exista alguma forma de saber que uma cobrança falhou (ver lacuna em §4.1).

**Risco de errar e custo de saída:** mais alto que o do Pagar.me, mas **assimétrico a nosso favor no
início**. Nos primeiros meses, com poucos clientes, migrar sai barato. O risco cresce com a base — a
decisão deve ser reavaliada por volta de ~100 assinantes.

### 6.3 Asaas — por que não

O veto do dono do produto ("o suporte do Asaas é horrível") **é corroborado pelos dados**, não
contrariado por eles:

- **8 dias e 21 horas** de tempo médio de resposta no RA — mais que o dobro do Pagar.me.
- 1.587 reclamações, índice de solução 86,4% e **apenas 71% voltariam a fazer negócio** (o pior dos
  finalistas).
- E o mais relevante para nós: as reclamações no RA **especificamente sobre suporte técnico/API**
  são numerosas e explícitas — "Api pix asaas parou e suporte não responde", "Zero suporte — não
  consigo criar chave API", "API com problemas para emissão de notas fiscais e falta de suporte",
  "dificuldade em contatar suporte para liberar PIX via API". Este é o sinal mais valioso da
  pesquisa, porque é da mesma natureza da nossa dependência.

Some-se o dunning de apenas **2 dias** e o fato de que **tokenização em produção exige liberação da
conta** — um passo que depende justamente do suporte que é o problema. Asaas continua sendo o **mais
barato** (2,99% + R$ 0,49) e tem **D+2**; se o custo virar o critério dominante em algum momento,
ele volta à mesa. Hoje, sob o peso dado ao suporte, não.

---

## 7. O que NÃO foi possível verificar

Lacunas nomeadas. Nenhuma delas foi preenchida por inferência.

| # | Lacuna | Impacto | Como fechar |
|---|---|---|---|
| 1 | **Taxa real do Pagar.me.** Não é publicada. O ~3,19% é de comparativo de terceiro, não oficial. | **Alto — pode inverter a recomendação** | Pedir proposta comercial |
| 2 | **AbacatePay avisa falha de cobrança?** Nenhum evento de falha na lista oficial de webhooks. | **Alto — bloqueia o aviso "atualize seu cartão"** | Teste em sandbox + perguntar no Discord |
| 3 | **Trial/dunning/proration do Pagar.me na v5.** Tudo que li é da doc **v3**, descontinuada. | Alto | Ler doc v5 + sandbox |
| 4 | **Asaas: cancelar durante o trial cobra?** Não documentado. | Médio (candidato descartado) | Sandbox |
| 5 | **Asaas: proration.** Não documentado. | Médio (candidato descartado) | Sandbox |
| 6 | **Retentativa de webhook.** AbacatePay diz "backoff progressivo" mas **não publica nº de tentativas nem janela**. Não achei o número para nenhum dos três. | Médio — define se precisamos de reconciliação por polling | Sandbox / suporte |
| 7 | **Divergência nas fontes de dunning do Asaas** (3+2 vs 3+3 tentativas). | Baixo | Sandbox |
| 8 | **SLA de suporte de qualquer um deles.** Nenhum publica SLA de primeira resposta para merchant. AbacatePay não publica nem horário de atendimento. | **Alto — é o critério nº 1 e ninguém o documenta** | Ver §8 |
| 9 | **AbacatePay não tem status page pública** que eu tenha localizado (`status.abacatepay.com` não resolve). Asaas tem (`status.asaas.com`, sem incidentes abertos na consulta). | Médio | Perguntar |
| 10 | **Malga e Barte** não foram avaliados a fundo. | Baixo | Só se os finalistas caírem |
| 11 | **Histórico de incidentes** dos três não foi levantado além da consulta pontual ao status page. | Médio | Monitorar por 30 dias |

### Sobre o item 8 — recomendação de método

O critério nº 1 é aquele que **nenhum fornecedor documenta** e que o Reclame Aqui mede mal.
Nenhuma quantidade de pesquisa desk resolve isso. A forma barata de resolver é empírica:

> **Antes de fechar, abrir um chamado técnico real em Pagar.me e AbacatePay — uma pergunta
> específica e não-trivial (ex.: "existe evento de webhook para falha de cobrança em assinatura com
> trial?", que é a lacuna nº 2) — e medir o tempo até a primeira resposta útil.**

Isso custa dois e-mails e produz o dado que a pesquisa não conseguiu produzir. Também fecha a
lacuna nº 2 de graça.

---

## 8. Nota sobre PCI e sobre o CDC art. 49

**PCI.** Nos três finalistas o cartão **não precisa passar pelo nosso servidor**:
- **AbacatePay** — a assinatura obriga checkout **hospedado** (redirect para `app.abacatepay.com/pay/...`).
  Escopo PCI mínimo (SAQ-A). Custo: **é um redirect, não um formulário embutido** — o signup PLG sai
  do nosso domínio no momento do cartão. Considerar no desenho da tela. (O "Checkout Transparente"
  da AbacatePay existe, mas **só para PIX e Boleto**, não para cartão.)
- **Pagar.me / Stripe** — tokenização no cliente, permite formulário embutido no nosso domínio.
- **Asaas** — os dados do cartão são enviados **à API do Asaas**; usar o checkout hospedado dele
  mantém SAQ-A.

Nos payloads de webhook da AbacatePay, `taxId` vem mascarado e do cartão só vêm 4 últimos dígitos +
bandeira — bom para não vazarmos dado sensível para os nossos logs.

**⚠️ Achado de segurança — AbacatePay.** A verificação HMAC do webhook usa uma
**chave pública fixa, publicada na própria documentação** (a constante `ABACATEPAY_PUBLIC_KEY`,
idêntica para todos os merchants). Isso significa que **qualquer pessoa que leia a doc consegue
gerar um `X-Webhook-Signature` válido** para um corpo arbitrário. Na prática, o HMAC ali garante
*integridade em trânsito*, **não autenticidade**. A autenticidade real fica por conta do
`?webhookSecret=` na query string — que é um bearer secret numa URL, sujeito a vazar em logs de
proxy, APM e referrer. **Não é impeditivo, mas exige mitigação nossa** (secret longo e rotacionável,
scrubbing de query string nos logs da Vercel, e validação cruzada consultando a API antes de liberar
entitlement em eventos de alto impacto). Vale registrar como gotcha e reportar a eles.

**CDC art. 49 (direito de arrependimento).** Nenhum dos gateways pesquisados oferece funcionalidade
de aviso prévio de fim de trial ou fluxo de cancelamento fácil embutido. **Nenhum deles nos ajuda com
essa conformidade** — o aviso antes da 1ª cobrança e o cancelamento em 1 clique são
**responsabilidade da nossa aplicação**. Para o modelo "3 dias e cobra automático", o e-mail de aviso
antes do fim do trial não é cortesia: é redução de chargeback e de disputa. O
`subscription.trial_started` (AbacatePay) traz `trialEndsAt`, que é o gancho natural para agendar
esse aviso.

---

## Correção da versão anterior

A versão anterior deste documento afirmava que a taxa de cartão do Asaas para assinatura era
**"R$ 0,49 + 1,99%"**. A tabela pública de preços do Asaas consultada em **2026-08-24** informa
**R$ 0,49 + 2,99%** para crédito à vista (3,49% em 2–6x; 3,99% em 7–12x; 4,29% em 13–21x). A
diferença de 1 ponto percentual muda a comparação de custo e, portanto, o argumento central daquela
recomendação. Taxas mudam — reconferir antes de assinar contrato.

---

## Fontes

Todas consultadas em **2026-08-24**, salvo indicação. Dados de Reclame Aqui são móveis: a janela de
medição muda o número (visto de forma gritante na Iugu, 18d → 30d conforme o recorte).

**Documentação técnica**
- [AbacatePay — índice completo da doc (llms.txt)](https://docs.abacatepay.com/llms.txt)
- [AbacatePay — Referência de Assinaturas (trial, retryPolicy)](https://docs.abacatepay.com/pages/subscriptions/reference)
- [AbacatePay — Criar checkout de assinatura](https://docs.abacatepay.com/pages/subscriptions/create)
- [AbacatePay — Alterar plano](https://docs.abacatepay.com/pages/subscriptions/change-plan)
- [AbacatePay — Cancelar assinatura](https://docs.abacatepay.com/pages/subscriptions/cancel)
- [AbacatePay — Webhooks: verificação e segurança](https://docs.abacatepay.com/pages/webhooks/security)
- [AbacatePay — SDKs oficiais](https://docs.abacatepay.com/pages/sdks/sdks)
- [Asaas — Criando assinatura com cartão de crédito](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito)
- [Asaas — FAQ Assinaturas](https://docs.asaas.com/docs/duvidas-frequentes-assinaturas)
- [Asaas — Eventos de webhook para assinaturas](https://docs.asaas.com/docs/eventos-para-assinaturas)
- [Asaas — Como funcionam as cobranças recorrentes (central de ajuda)](https://central.ajuda.asaas.com/hc/pt-br/articles/31975240886555-Como-funcionam-as-cobran%C3%A7as-por-assinatura-recorrentes)
- [Pagar.me — Conceitos de recorrência (v3)](https://docs.pagar.me/v3/docs/conceitos-de-recorr%C3%AAncia)
- [Appmax — Criar assinatura (exige order_id aprovado)](https://docs.appmax.com.br/api-reference/subscriptions/criar-assinatura.md)
- [Appmax — doc completa (llms-full.txt)](https://docs.appmax.com.br/llms-full.txt)

**Preços**
- [Asaas — Preços e taxas](https://www.asaas.com/precos-e-taxas)
- [AbacatePay — Preços](https://www.abacatepay.com/pricing)
- [Stripe — Preços Brasil](https://stripe.com/br/pricing)
- [Vindi — Planos e preços](https://vindi.com.br/precos/)
- [Appmax — Taxas (blog oficial)](https://blog.appmax.com.br/taxas-da-appmax/)
- npm registry: `pagarme@4.35.2` (2026-08-08), `abacatepay-nodejs-sdk@1.6.0` (2025-10-07), `asaas@1.1.0` (2025-03-29)

**Reputação e suporte**
- [Reclame Aqui — Asaas](https://www.reclameaqui.com.br/empresa/asaas-gestao-financeira/)
- [RA — Asaas: "Api pix asaas parou e suporte não responde"](https://www.reclameaqui.com.br/asaas-gestao-financeira/api-pix-asaas-parou-e-suporte-na-oresponde_AL_w1RBN7yScph48/)
- [RA — Asaas: "Zero suporte — não consigo criar Chave API"](https://www.reclameaqui.com.br/asaas-gestao-financeira/zero-suporte-nao-consigo-criar-chave-api-problema-com-token_e4-utFtm84ZB2m5B/)
- [RA — Asaas: "API com problemas para emissão de NF e falta de suporte"](https://www.reclameaqui.com.br/asaas-gestao-financeira/api-com-problemas-para-emissao-de-notas-fiscais-e-falta-de-suporte-da-empr_qIozkYX0zhH9QpAa/)
- [Reclame Aqui — Pagar.me](https://www.reclameaqui.com.br/empresa/pagar-me/lista-reclamacoes/)
- [Reclame Aqui — Vindi](https://www.reclameaqui.com.br/empresa/vindi/)
- [Reclame Aqui — Iugu](https://www.reclameaqui.com.br/empresa/iugu/)
- [Reclame Aqui — Stripe](https://www.reclameaqui.com.br/empresa/stripe/)
- [Reclame Aqui — Galax Pay](https://www.reclameaqui.com.br/empresa/galax-pay/)
- [Reclame Aqui — Appmax](https://www.reclameaqui.com.br/empresa/appmax/)
- [Reclame Aqui — Abacatepay (Purple Box Tecnologia)](https://www.reclameaqui.com.br/empresa/purple-box-tecnologia-ltda/)
- [Reclame Aqui — PagBank/PagSeguro](https://www.reclameaqui.com.br/empresa/pagseguro/)
- [Asaas — Status page](https://status.asaas.com/)
- [Asaas — ecossistema para desenvolvedores (fonte da própria empresa)](https://blog.asaas.com/release/asaas-oferece-ecossistema-para-apoiar-desenvolvedores/amp/)
- [AbacatePay — Sobre nosso suporte (fonte da própria empresa)](https://www.abacatepay.com/blog/suporte)

**Empresa / risco**
- [Startups.com.br — Abacatepay evolui escopo e mira orquestração de dados financeiros](https://startups.com.br/negocios/fintech/abacatepay-evolui-escopo-e-mira-orquestracao-de-dados-financeiros/)
- [Let's Money — Fintech Abacatepay aposta em dados para ir além do Pix](https://www.letsmoney.com.br/fintech/fintech-abacatepay-dados-pix/)
- [Econodata — Abacatepay Tecnologia LTDA, CNPJ 58.271.413/0001-90](https://www.econodata.com.br/consulta-empresa/58271413000190-abacatepay-tecnologia-ltda)

---

*Pesquisa conduzida por @analyst (Atlas) — Epic 900. Documento de decisão, não de implementação.*
