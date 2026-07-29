# Story 75-232 — Kit de Marcas: escolher arquivos já na criação da marca

**Status:** Done
**Tipo:** UX
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** S

## Contexto
Feedback do Marcos (29/07): "senti falta de algum lugar para subir as imagens" no
modal Nova marca. O upload existia, mas só aparecia após "Criar marca" (asset
precisa do id). Agora os controles aparecem desde o início: arquivos escolhidos
na criação entram numa FILA local (com tipo e variação capturados por item) e
sobem automaticamente após o POST criar a marca.

## Entrega
- Controles de upload visíveis no modo criação; fila "Aguardando criação da
  marca (N)" com remoção item a item; hint explicando o fluxo.
- `uploadOne(brandId, file, tipo, label)` extraído (mesmo sign→upload→registro).
- Pós-create: fila sobe em sequência; falhas parciais alertam COM o motivo e a
  marca segue criada com o que subiu.
- QA minors corrigidos: 10MB validado no enqueue; Cancelar/✕ desabilitados
  durante o save (janela agora inclui a fila); comentário atualizado.
- Cancelar o modal descarta a fila (zero rede antes do create — nada órfão).

## QA Results
Quinn: PASS c/ 2 minors + 1 trivial — todos corrigidos no mesmo ciclo. JSX
íntegro, modo edição intacto (uploadOne idêntico campo a campo ao código
anterior), suíte 1270/1270, tsc/eslint/build limpos.
