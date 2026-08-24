---
name: gateway-selection-epic900
description: Epic 900 — critérios de escolha do gateway de pagamento PLG, veto ao Asaas por suporte, e as lacunas que faltam fechar
metadata:
  type: project
---

# Escolha de gateway para o SaaS multi-tenant (Epic 900)

Pesquisa em `docs/research/gateways-pagamento-plg.md` (2026-08-24).

**Modelo de venda decidido (D15/D16, 2026-08-24):** signup público → escolhe módulos →
vincula cartão no cadastro → 3 dias grátis → cobra automático sem nova ação.

**Veto explícito do dono do produto: Asaas está fora por qualidade de suporte.**
Não é impressão — é experiência direta dele, e a pesquisa corroborou (8d21h de tempo médio
de resposta no RA; reclamações específicas sobre suporte a API/token).

**Ponderação que ele definiu:** suporte > taxas > requisito mínimo. Segunda ordem: webhook,
SDK, D+N, PCI. **Não valorizar** amplitude de recursos, split, multi-moeda, proration
sofisticado — a recorrência é simples e nada disso será usado.

**Why:** num gateway de cobrança recorrente, suporte ruim significa cliente sem acesso ao
sistema enquanto se espera resposta — churn direto. Gateway "completo" que atende mal é pior
que um simples com bom atendimento.

**How to apply:** se a conversa voltar a gateway, não reabrir Asaas nem propor Stripe como
"escolha segura" (Stripe: RA 5.9/10, histórico de bloqueio de conta no Brasil, e o mais caro).
Recomendação: **Pagar.me** principal, **AbacatePay** alternativa. Isolar tudo atrás de uma
interface `BillingProvider` desde o dia 1 para que troca de gateway seja adapter, não cirurgia.

**Duas incertezas que podem inverter a decisão e ainda estão abertas:**
1. Taxa real do Pagar.me — não é publicada, exige proposta comercial. Se vier acima de ~3,5%,
   inverte para AbacatePay.
2. AbacatePay não tem evento de webhook para falha de cobrança na lista oficial — bloquearia o
   aviso "atualize seu cartão". Exige teste em sandbox.

Ver também [[trifold-brand]].
