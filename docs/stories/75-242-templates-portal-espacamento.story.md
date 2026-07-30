# Story 75-242 — Templates do Portal do Cliente: espaçamento da assinatura (v2)

**Status:** Done
**Tipo:** Fix (conteúdo de template Meta)
**Epic:** Portal do Cliente / Notificações
**Complexidade:** XS

## Contexto
Marcos (30/07) notou "problema de espaçamento" nos templates de notificação do
Portal do Cliente. Auditoria via Graph API (fonte da verdade) mostrou: em
`novo_boleto_cliente` e `atualizacao_obra_cliente`, a assinatura `*Trifold*`
vinha COLADA na linha anterior (sem linha em branco), destoando do resto do
corpo. `boleto_vence_hoje`/`boleto_em_atraso` estavam corretos (sem assinatura).
Parâmetros enviados pelo código estavam limpos — o problema era só o corpo
cadastrado na Meta.

## Entrega
- **`novo_boleto_cliente_v2` e `atualizacao_obra_cliente_v2`** criados na Meta
  via Graph API (clones exatos + linha em branco antes de `*Trifold*`, mesmos
  botões URL dinâmicos), **APROVADOS** em ~9 min (30/07).
- Código trocado para os v2 em `lib/notificacoes.ts` (envio + logs
  `logWhatsappSend` + comentários). Caminho SEM janela de falha: v2 aprovado
  ANTES do swap — convenção "editar template aprovado volta pra revisão e
  quebra o envio; criar v2 e trocar o nome depois".
- v1 ficam aposentados na Meta (não deletados — histórico).

## Arquivos
- `packages/web/src/lib/notificacoes.ts`

## Validação
- Suíte 1318/1318 · tsc/eslint/build limpos.
- Status APPROVED dos v2 confirmado via Graph API antes do swap.
- ✅ LIVE: PR #318 squash-merged, deploy de produção concluído.
