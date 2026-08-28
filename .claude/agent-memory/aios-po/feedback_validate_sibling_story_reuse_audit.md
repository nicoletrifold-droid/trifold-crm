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

## Corolário quando a story CLONA um arquivo inteiro (não só importa um módulo)

Quando o padrão é "clonar o arquivo X da story-irmã e trocar N coisas", a lista de "N coisas"
do @sm é sistematicamente incompleta em um ponto específico: **identificadores da entidade
antiga que vivem FORA do subsistema que a story está discutindo**. O @sm audita bem o bloco
que ele está mexendo e não vê os literais vizinhos.

**Why:** Na 86-12 (clone da landing do Vind Residence para o Yarden), o AC8 dizia "com estas
mudanças (e só estas)" e cobria `ALLOWED_ORIGINS` + o campo novo de tracking. Faltou
`page: "vind-residence"` no payload do `api/lead.js` — um campo que **não é de tracking Meta**,
mas que é achatado no CRM e persistido em 4 lugares (`webhook_logs.payload.page`,
`leads.metadata.landing_page`, `leads.metadata.page`, descrição da activity). Clonar sem trocar
faria todo lead da landing nova entrar no CRM rotulado como a landing antiga — e **nenhum teste
de CAPI pegaria**, porque o defeito é de dado do CRM, não do Meta.

**How to apply:** ler o arquivo-fonte a ser clonado **inteiro** (não `grep` pelos campos que a
story cita) e caçar todo literal com o nome da entidade antiga. Depois checar se cada um também
exige um teste explícito de assert positivo (`toBe("novo")`, não só `not.toBe("antigo")`).
Segundo item do corolário: conferir os **QA issues OPEN da story-irmã** — herdar um defeito
conhecido num arquivo novo é regressão *introduzida*, não herdada, e o AC deve proibir a
clonagem dele nominalmente.
