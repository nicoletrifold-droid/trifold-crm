---
name: reverificacao-focada
description: Como conduzir uma re-verificação de gate (iteração 2+) sem re-auditar tudo — e as 4 armadilhas que quase deixaram passar evidência falsa na 86-11
metadata:
  type: feedback
---

Numa re-verificação focada de gate, verificar por execução própria e não por
leitura do relato do @dev, mesmo quando o relato está detalhado e correto.

**Why:** na re-revisão da 86-11 (Epic 86) o relato do @dev estava certo em tudo,
mas quatro coisas só apareceram porque foram executadas/lidas de novo — e três
delas mudaram o conteúdo do gate.

**How to apply:** os 4 checks que valeram o tempo, em ordem de retorno:

1. **`turbo type-check` / `turbo lint` devolvem `FULL TURBO` (cache hit).**
   Um hit de cache NÃO é evidência de compilação — é evidência de que alguém já
   compilou aquele hash. Sempre `npx turbo type-check --force` e
   `npx turbo lint --force` num gate. Custo: ~45s e ~51s neste repo.

2. **"O arquivo X não foi tocado" se prova com `git diff -- X` vazio**, não com
   grep nem com a palavra do @dev. Na 86-11 a alegação era que a proteção veio só
   do default seguro de um parâmetro novo, sem editar as duas rotas de produção —
   `git diff` vazio nas duas confirmou literalmente.

3. **Teste de segurança pode passar por vacuidade.** Antes de aceitar "5 testes
   novos travam a regressão", conferir que cada um falharia se o código sumisse:
   o teste assere `toHaveLength(1)` antes de olhar o conteúdo? acessa
   `arr[0].campo` (que lança em lista vazia)? assere `JSON.stringify(x)`
   **não conter** o valor malicioso, e não só que o valor certo está presente?
   Rodar `npx vitest run -t "<ID-DO-ACHADO>"` isola e conta os testes do achado.

4. **Reler o código pode mostrar que o achado original subestimou o raio.**
   Na 86-11 eu havia descrito a forja de `client_ip` como afetando só o evento
   CAPI; ao reler, o mesmo objeto `sinais` também era persistido em
   `leads.metadata.meta_ad` e relido dias depois pelo cron do evento "Visitou".
   A correção cobria os dois (ponto de estrangulamento único), mas o gate estava
   registrando menos risco do que existia. Sempre perguntar "para onde MAIS vai
   esse objeto?" — grep pelo nome da variável, não só pelo campo.

**Metadata do gate (`branch:`/`commit:`) tem que sair de `git`, não do contexto
da sessão.** O `gitStatus` do system prompt é um snapshot que pode estar de outra
sessão/worktree. Na 86-11 ele dizia `feat/86-meta-capi-tracking @ 006d8868`
enquanto o worktree estava em `main @ 8dbc6000` com as mudanças NÃO commitadas —
um @devops que confiasse no gate commitaria no branch errado. Rodar
`git branch --show-current` + `git log -1` + `git worktree list`.

**Verdito:** não subir para PASS por pressão de fechamento; mas também não segurar
CONCERNS por uma premissa própria que já foi corrigida. Reler o arquivo alvo
ANTES de decidir — na 86-11 eu ia manter CONCERNS por documentação obsoleta que,
quando reli, já tinha sido corrigida na seção autoritativa. Sobrou só um resíduo
low (duas frases em outras seções), que virou achado novo em vez de bloquear.

Ver também [[epic-86-qa-patterns]].
