---
name: corte-de-escopo-exige-reescrever-comentarios
description: Quando o usuário corta escopo, os comentários que prometiam a garantia cortada têm de ser reescritos como limitação conhecida — comentário que promete garantia inexistente é pior que nenhum
metadata:
  type: feedback
---

Quando o usuário corta escopo de uma story, não basta remover o código: **todo comentário,
cabeçalho e docblock que citava o artefato cortado tem de ser reescrito** para declarar a ausência
como *limitação conhecida*, sem inventar garantia substituta. E a story registra o corte como
corte (com o motivo), nunca apaga o histórico do que foi feito e depois retirado.

**Why:** na Story 900-14b o usuário reduziu o escopo ao mínimo que destravava o deploy da Vercel.
Ficaram comentários citando `pnpm check:org-scoped-tables-sync` como verificação bloqueante do CI —
script que havia sido apagado. Um comentário que promete garantia inexistente faz a próxima pessoa
confiar no que não está lá; é pior que nenhum comentário.

**How to apply:**
- Depois de qualquer reversão/corte, `grep` pelo nome do artefato removido em todo o repo e limpar
  cada ocorrência (código primeiro; seções alheias da story ficam como registro histórico).
- Não editar AC/Dev Notes de @po/@sm: marcar os checkboxes como fora de escopo e apontar para o
  registro do corte no Dev Agent Record.
- Manter a evidência do que foi cortado, retitulada como HISTÓRICO, com aviso de que o artefato
  medido não existe mais.

**Armadilha de arquivo gerado.** Se o cabeçalho vive num template dentro do gerador, a mudança tem
de ser aplicada nos dois (template + arquivo commitado) e a equivalência **provada renderizando o
template** e comparando bytes com o commitado — regerar de verdade pode exigir credencial que não
se tem (`SUPABASE_MANAGEMENT_PAT`) e reescrever artefatos que estão fora de escopo.
Ver [[prova-vale-no-deploy]].
