# Story 75-319 — Analytics: régua do Pipeline segue o período (sincronizada com o Funil)

**Story ID:** 75-319 · **Status:** InReview · **Estimativa:** XS (~1 pt)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Decisão do Marcos (13/08, pergunta direta após os prints 7d×30d)

## O relato e o diagnóstico

Marcos comparou prints de 7d e 30d: régua mostrava Atendimento 116 nos dois; funil mostrava
70 (30d) e 31 (7d). **Não era bug** — eram recortes diferentes por design (régua = foto AGORA
de todos os ativos, como no Dashboard; funil = leads que ENTRARAM na janela, por etapa atual;
31 ⊂ 70 ⊂ 116). Mas a tela não deixava isso óbvio. Decisão dele entre 3 opções: **a régua
passa a seguir o período**.

## O que mudou

- Régua usa os MESMOS counts do Funil (`stages`, da RPC ranged/agregação filtrada) —
  sincronia por construção, e de brinde passa a respeitar os filtros da página.
- Título: "Pipeline · {período} · leads que entraram no período, por etapa atual".
- Fetch de contagens ao vivo removido (a foto "agora" continua no Dashboard).

## Evidências

Screenshot 7d: régua 31/4/1/0/0 = funil 31/4/1/0/0 ✓. Gates: tsc 0 · eslint 23 · build 0
(suíte inalterada — mudança de fonte de dados/rótulo, decisões puras já cobertas).
⚠️ Os ❌ do script de verificação eram do SELETOR (hasText "Atendimento" casa
"Aguardando atendimento") — a prova válida foi o screenshot; registrado p/ não re-tropeçar.

## QA — PASS (96)

Diagnóstico antes do conserto (não era o que parecia), decisão do dono do produto entre
opções honestas, e a correção elimina a classe do problema (mesma fonte = impossível
divergir). Sem concerns.
