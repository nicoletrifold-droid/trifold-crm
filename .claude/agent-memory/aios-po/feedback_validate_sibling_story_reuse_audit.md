---
name: validate-sibling-story-reuse-audit
description: Ao validar uma story "irmã" de outra já implementada, sempre listar os módulos que a irmã criou e conferir AC por AC se a nova os reusa ou os contradiz
metadata:
  type: feedback
---

Quando uma story é explicitamente a "irmã"/port de outra já implementada, **não basta
validar a story contra si mesma**: rodar um `ls` no diretório de módulos que a story-mãe
criou e conferir, AC por AC, se a nova story (a) cita cada módulo reusável, (b) não pede
algo que o módulo existente faz de forma incompatível.

**Why:** Na validação da 86-11 (irmã da 86-9), a story citava `packages/shared/src/meta/*`
mas nunca mencionava `packages/web/src/lib/meta/form-capi.ts`, que a 86-9 criou e que já
resolvia metade dos ACs. Três incompatibilidades reais só apareceram por leitura do código:
o helper enviava 1 evento por chamada (a story pedia batch), injetava `st`/`ufFromDDD`
incondicionalmente (a story punha `st` **fora de escopo**), e não repassava `contentCategory`.
Nenhuma delas era visível na story — @dev descobriria só no meio da implementação, ou pior,
reusaria o helper e entregaria escopo excluído sem perceber.

**How to apply:** Em `*validate-story-draft` de qualquer story que referencie outra como
padrão/precedente: (1) localizar os arquivos que a precedente criou (git log ou `ls` do
diretório de libs); (2) ler as assinaturas exportadas; (3) montar uma tabela
REUSE / ADAPT / Referência por arquivo dentro das Dev Notes. A tabela é entregável do @po,
não do @sm — é a forma concreta do gate G3 (detectar duplicação e verificar que os artefatos
referenciados existem). Ver [[feedback-validation-post-pm-review]] para o princípio geral de
auditar com evidência de arquivo.
