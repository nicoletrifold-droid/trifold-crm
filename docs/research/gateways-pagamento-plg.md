# Gateway de pagamento para o modelo PLG — comparação

**Contexto:** decisões D15/D16 (2026-08-24) trocaram venda assistida por signup público com
**trial de 3 dias e cartão vinculado no cadastro**. Isso torna o gateway fundação, não acessório.

**O requisito que decide:** conseguir **validar e guardar o cartão no cadastro** e **cobrar
automaticamente ao fim do trial**, sem nova ação do cliente. Gateway que só cobra na hora não serve.

---

## Os dois candidatos

| | **Asaas** | **Stripe** |
|---|---|---|
| Trial com cartão | ✅ cartão validado na criação da assinatura; `nextDueDate` define a 1ª cobrança | ✅ `trial_period_days` nativo na subscription |
| Taxa cartão (assinatura) | **R$ 0,49 + 1,99%** por cobrança | maior que a nacional; cobra em BRL |
| PIX | nativo, liquidação rápida | suportado, liquidação rápida |
| Liquidação cartão | — | D+2 (dos melhores do Brasil) |
| Força reconhecida | **faturamento recorrente e boleto**, com fluxo de *dunning* | **SaaS e faturamento internacional** |
| Extras | conta digital, antecipação de recebíveis, emissão de NF, score de crédito do cliente | ecossistema e SDK maduros, documentação forte |

## Leitura

**Os dois atendem ao requisito central.** Asaas valida o cartão no momento da criação e agenda a
primeira cobrança para a data que você definir — que é exatamente "3 dias grátis, depois cobra".
Stripe faz o mesmo com `trial_period_days`, que é o caminho mais batido do mercado SaaS.

**A diferença real não é técnica, é de perfil:**

- **Asaas** ganha em **custo** (R$ 0,49 + 1,99% é competitivo) e em **operação brasileira** —
  boleto, PIX, NF, dunning. Se a base de clientes é 100% Brasil e o ticket é mensal recorrente,
  a economia de taxa aparece rápido.
- **Stripe** ganha em **maturidade para SaaS**: o modelo de assinatura, trial, proration,
  cancelamento e webhooks é o mais bem documentado, e a chance de esbarrar num caso não previsto
  é menor. Custa mais caro por isso.

## Recomendação

**Asaas**, com uma condição: **validar o comportamento do trial antes de fechar o desenho**.

O raciocínio: o público é imobiliário brasileiro, o ticket é recorrente em BRL, não há venda
internacional no horizonte, e a diferença de taxa incide sobre **toda** cobrança, todo mês. Os
extras (NF, dunning, boleto/PIX) resolvem problemas que apareceriam de qualquer forma.

**A condição existe porque a documentação responde "dá para fazer" mas não responde os casos de
borda que este modelo vai encontrar:**

1. O que acontece se o cartão **falhar** na primeira cobrança pós-trial — retentativa? por
   quantos dias? webhook avisa?
2. O cliente cancela **durante** o trial: a assinatura é removida sem gerar cobrança?
3. Trocar de plano no meio do ciclo (upgrade de módulos) gera *proration* ou só vale no próximo?

Essas três decidem como o entitlement reage — e errar aqui significa cliente com módulo ligado
sem ter pago, ou desligado tendo pago.

## Alternativa

Se a prioridade for **velocidade e previsibilidade** em vez de custo, Stripe é a escolha de menor
risco de implementação: o caminho é mais trilhado e os casos de borda acima já estão documentados.

---

**Fontes**
- [Asaas — Criando assinatura com cartão de crédito](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito)
- [Asaas — Checkout com Assinatura (recorrente)](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente)
- [Asaas — Preços e taxas](https://www.asaas.com/precos-e-taxas)
- [Gateways de Pagamento no Brasil 2026 — comparativo](https://mindconsulting.com.br/2026/07/gateways-pagamento-online-brasil-comparativo-2026/)
- [Stripe vs Asaas — FindSaaS](https://www.findsaas.com.br/blog/stripe-vs-asaas)
