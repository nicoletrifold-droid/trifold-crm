# Story 75-264 — O motivo de perda deixa de ser texto livre

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Qualidade de dado + alimentar o agente de análise
**Executar:** 2026-08-04, a partir das 07:30 (combinado com o Marcos)

---

## Story

**Como** quem decide onde investir em mídia e como cobrar o time comercial,
**Quero** que o motivo de perda de um lead seja um dado, não uma frase digitada com pressa,
**Para que** "por que perdemos" pare de ser uma estimativa reconstruída por regex e passe a ser resposta confiável — inclusive para o agente de análise.

---

## Context — o número que motivou a story

Levantei o funil dos leads de Meta (90 dias, 1.004 leads) para responder "qual campanha traz lead que **avança**":

| etapa | leads | % |
|---|---|---|
| **Perdido** | **668** | 66,5% |
| Represamento | 117 | 11,7% |
| SDR | 93 | 9,3% |
| Atendimento | 65 | 6,5% |
| 1º Contato | 27 | 2,7% |
| Não Qualificado | 17 | 1,7% |
| **Visitou** | **10** | 1,0% |
| **Visita Agendada** | **1** | 0,1% |

**Primeira conclusão, que derrubou o plano original:** visita agendada **não tem volume** para ser
métrica de comparação. 11 leads chegaram a visita ou além; distribuir 11 eventos entre 8 campanhas
não sustenta nada. O sinal com volume está nos **668 perdidos**.

### O problema: 448 variantes de texto para 668 perdas

`leads.lost_reason` é texto livre. Medido: **448 valores distintos** em 668 registros. "Sem
interesse", "sem interesse", "nao tem interesse", "Cliente não tem interesse" e "sem interresse"
são a mesma coisa em cinco grafias.

Construí um classificador por palavra-chave e cheguei a **82% classificado**, em três iterações:

| iteração | não classificado |
|---|---|
| 1ª | 31,9% |
| 2ª | 25,1% |
| 3ª | **18,0%** |

🔥 **E entre a 2ª e a 3ª eu perdi a palavra `contato` do regex sem notar — o grupo "não
conseguimos falar" saltou de 239 para 285 leads quando devolvi.** Um relatório de negócio cuja
resposta muda 46 leads porque alguém editou uma expressão regular não é um dado; é uma opinião com
aparência de número.

### O resultado atual, que já vale como taxonomia

| grupo | leads | % dos perdidos |
|---|---|---|
| **1. Não conseguimos falar** | **285** | **42,7%** |
| 2. Sem interesse | 113 | 16,9% |
| 3. Não qualifica / preço | 86 | 12,9% |
| 5. Foi para outro | 23 | 3,4% |
| 4. Fora do perfil / região | 13 | 1,9% |
| 6. Clicou sem intenção | 10 | 1,5% |
| 8. Duplicado / teste / corretor | 4 | 0,6% |
| 9. Sem motivo registrado | 14 | 2,1% |
| 7. Não classificado | 120 | 18,0% |

**O achado de negócio:** o maior motivo de perda **não é o lead, é não conseguirmos falar com
ele** — 285 de 668. Isso não se resolve com criativo melhor. E o grupo 6, pequeno mas literal
("cliente clicou por curiosidade", "disse que nunca entrou em nossos anúncios"), confirma
qualitativamente o que o CTR×CPL já indicava: clique não é intenção.

**Estes 6 grupos são a taxonomia da story — não foram inventados, foram destilados de 668 casos
reais.**

---

## Os três itens

### Item 1 — `lost_reason` vira campo estruturado (a correção da causa)

Enquanto for texto livre, todo relatório de motivo de perda é reconstrução. O corretor escolhe da
lista **e** pode comentar.

- Enum/tabela com os 6 grupos + `outro`.
- Campo de observação livre **permanece**, ao lado — é onde mora o contexto que a lista não captura
  ("cliente é de Londrina", "comprou terreno"). Tirar o texto livre perderia informação.
- Onde a UI pede motivo hoje: mapear todos os pontos (marcar perdido no drawer, no Kanban, na
  ação em massa se houver).
- **Não migrar o histórico automaticamente** — ver item 2.

### Item 2 — a classificação do histórico vira uma `VIEW`, não uma consulta perdida

Os 668 registros antigos continuam texto livre. A classificação precisa existir **no banco**, não
numa conversa:

- `v_lead_lost_reason_grupo` (ou função) com a normalização (unaccent + lower) e os 6 grupos.
- Comentário na view dizendo que ela é **heurística sobre dado legado**, com a cobertura medida
  (82%) — para ninguém tratar como verdade absoluta.
- A view é a ponte: dado novo vem estruturado do item 1; dado antigo é classificado por ela.

### Item 3 — alimentar o agente de análise, sem lhe dar confiança falsa

🔴 **Aqui eu discordo do pedido original de "gravar a tabela no agente".** Congelar um
classificador de 82% como verdade dentro do agente lhe dá confiança que o dado não sustenta — ele
responderia "42,7% perdemos por não conseguir falar" como fato, quando 18% está sem classificar e
o número já se mexeu 46 leads por uma edição de regex.

**O desenho correto:** o contexto do agente recebe

1. os grupos **com a cobertura declarada** ("82% classificado; 18% não classificado"),
2. o **texto cru** dos não classificados (são 120 — cabe no contexto),
3. e o funil por etapa.

Assim ele acerta o que é claro, raciocina sobre o ambíguo, e **diz que não sabe** quando não sabe.

- Ponto de entrada: `packages/web/src/app/api/agent/context-meta/route.ts`.
- Hoje o agente vê só dado do Meta (gasto, CPL). Passar a ver o **desfecho no CRM** é o que o
  deixa responder *por que* uma campanha é ruim, não só *que* ela é ruim.

---

## Acceptance Criteria

- [ ] **AC1** — motivo de perda é selecionável entre os 6 grupos + `outro`, em **todos** os pontos
      da UI que marcam lead como perdido (enumerar no PR).
- [ ] **AC2** — o campo de observação livre continua existindo e é gravado junto.
- [ ] **AC3** — `v_lead_lost_reason_grupo` classifica o histórico, com a heurística e a cobertura
      medida documentadas na própria view.
- [ ] **AC4** — a cobertura da view é **medida no PR**, não estimada: contagem por grupo e % de
      não classificados, com a query.
- [ ] **AC5** — o contexto do agente inclui: grupos, **cobertura declarada**, texto cru dos não
      classificados, e o funil por etapa.
- [ ] **AC6** — o agente, perguntado "por que perdemos os leads da campanha X", cita a cobertura e
      **não** apresenta 82% como 100%. Verificar com pergunta real.
- [ ] **AC7** — dado novo não passa pela heurística: lead marcado como perdido depois desta story
      tem grupo estruturado, e a view respeita isso em vez de reclassificar por texto.
- [ ] **AC8 — sem regressão** — marcar lead como perdido continua funcionando em todos os pontos;
      as convenções do `PERDIDO_STAGE_IDS` (motivo ≠ etapa) seguem valendo.

---

## Dev Notes

- 🔴 **CONVENÇÃO EXISTENTE que não pode ser quebrada:** "perdido" é **ETAPA**
  (`PERDIDO_STAGE_IDS`), nunca `lost_reason`. Esta story mexe no MOTIVO, não no que define perda.
- A taxonomia veio de 668 casos; os regexes da 3ª iteração estão no histórico desta conversa e
  devem ir para a view **com os grupos na mesma ordem**.
- Cuidado com a ordem do `CASE`: mover a checagem de "qualifica/preço" para antes de "sem
  interesse" muda a atribuição de dezenas de leads. A ordem é parte da definição, não detalhe.

---

## Fora de escopo

- Recontagem histórica com o campo novo (o passado fica com a view).
- Custo por lead atendido/por visita por campanha — depende deste dado ser confiável; é a story
  seguinte, e é o "passo 2" combinado com o Marcos.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada. Taxonomia destilada de 668 perdas reais em 3 iterações de classificador (31,9% → 18,0% não classificado). O item 3 divergiu do pedido original ("gravar a tabela no agente") porque congelar 82% como verdade daria confiança falsa. Execução combinada para 04/08 07:30. | @sm (River) |
