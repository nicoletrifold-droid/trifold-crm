# QA Gate — Story 75-331 (*agenda no fim do formulário*)

**Revisor:** @qa (Quinn) · **Data:** 2026-08-17 · **Story:** `docs/stories/75-331-formulario-agenda-no-fim.story.md`
**Base:** branch `story/75-331-formulario-agenda-no-fim` (empilhada sobre a 75-330, PR #437)
**Parecer @po:** `docs/qa/po-validation-75-331.md` (GO 9/10, após a revisão da D3)

---

## VEREDITO: 🟡 **CONCERNS** — 1 achado corrigido no gate, 2 ressalvas que o merge não resolve

Diferente da 75-330, esta story **não abriu em FAIL**: o teste de fluxo que aquele gate exigiu
foi escrito pelo @dev *antes* da revisão, e é o que segurou a barra. Vale registrar que a
recomendação funcionou.

---

## 1. 🟡 O achado — refatoração sem rede

O @dev extraiu a lógica da grade de `app/api/appointments/slots/route.ts` para
`lib/appointments/team-slots.ts` e reescreveu a rota autenticada para usá-la. Correto como
decisão (a alternativa era duas grades divergindo no primeiro ajuste).

**O problema: aquela rota não tinha teste nenhum.** É o endpoint que alimenta o modal interno
de agendamento — mexer nele às cegas e concluir "o shape está igual" é trocar código por
confiança.

Conferi o comportamento linha a linha e ele **está** preservado (inclusive o detalhe de
`payload.slots` ser atribuído mesmo quando a grade vem vazia, porque `[]` é truthy — o que
mantém a resposta idêntica em dia fechado). Mas conferência não é regressão.

**Correção aplicada no gate:** `team-slots.test.ts`, 7 casos sobre o helper compartilhado —
que agora protege **as duas** rotas. As regras cobertas são de negócio, não de aritmética:

- HOUSE não enxerga compromisso da IMOB (Story 81-1)
- `scheduled` ocupa igual a `confirmed` (D1 — é o que faz o "bloqueia na hora" ser verdade)
- `cancelled` / `no_show` / `completed` **não** ocupam: o horário volta a ser oferecido
- data malformada é ignorada em vez de quebrar a grade; dia fechado devolve `[]`, não erro

Dois desses casos falharam na primeira execução porque as linhas do fake não tinham `org_id`
— **o fake estava certo e o teste errado**. Registro isso de propósito: é a prova de que ele
aplica os filtros de verdade, ao contrário do fake que já deu confiança falsa neste projeto.

## 2. Os 7 checks

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Code review | ✅ A ordem crítica está certa: visita gravada → etapa avança → dono → espelho. Inverter deixaria lead com visita fantasma (75-196) |
| 2 | Testes | ✅ **2506 passed** (198 arquivos), +15 nesta story: 8 de fluxo do POST, 7 do helper |
| 3 | Critérios de aceite | ✅ AC1–AC8 cobertos; AC6 (o texto da tela) verificado por leitura |
| 4 | Sem regressão | ✅ baseline intacta |
| 5 | Performance | ✅ nenhuma query nova em caminho quente; a grade já existia |
| 6 | Segurança | ✅ token valida antes de tudo; agenda desligada responde como link inválido (não vaza que o formulário existe); sessão de outro formulário é recusada |
| 7 | Documentação | ✅ o "porquê" da D3 revisada está no código, onde alguém tentado a "consertar" vai ler |

**Gates:** `type-check` 8/8 · `lint` exit 0 · `build` 5/5 · `test` 2506 passed.

> Durante o desenvolvimento o lint **quebrou** (`prefer-const` no fake do teste) e foi
> corrigido antes do gate. Registrado porque exit 1 em lint é erro, não warning.

## 3. O que gostei de ver

**AC8 (idempotência) foi implementada como reuso, não como bloqueio.** Um segundo POST devolve
a visita que já existe em vez de erro. Num formulário de tráfego pago — onde duplo clique e
aba retomada são a norma — a alternativa seria o decorado perdendo dois horários para o mesmo
lead, ou o lead vendo um erro depois de já ter agendado.

**"Sem SDR ativo, a visita ainda é criada."** A escolha certa: perder a visita é pior que ficar
sem dono, e o lead sem responsável aparece nas telas de gestão.

## 4. Ressalvas que o merge NÃO resolve

1. ⛔ **Depende da 75-330 (PR #437), que ainda não foi mergeada.** Esta branch está empilhada.
   Mergear esta antes daquela quebra: os arquivos de `lib/forms/` não existiriam.
2. ⛔ **Nada verificado com banco real.** Diferente da 75-330 — cujas migrations eu vi
   aplicadas e provei com INSERT em transação revertida — aqui não há migration e nada foi
   exercitado contra produção. O espelho no Google, em particular, **só** foi testado com
   `mirrorCreate` mockado. A DoD pede conferir numa visita real, e isso continua aberto.
3. 🟡 **A capability `leads.transferir` foi ligada para o `sdr` direto em produção** (fora
   desta branch, a pedido do Marcos). O `seed: [A, S]` em `capabilities.ts:83` **não** foi
   alterado — divergência consciente: o seed é o padrão de uma org nova, a linha viva é por
   org. Vale saber que uma futura regeneração do seed não vai refletir isso.

**Decisão:** liberado para o @devops, **atrás da 75-330**.

— Quinn, @qa
