# Story 75-278 — PDF: comparativo zerava a coluna "Atual" em 30 e 90 dias

**Epic:** 75 (CRM Trifold) · **Status:** Done (aguardando push) · **Estimativa:** S (~2 pts)

**CodeRabbit Integration:** Disabled (`coderabbit_integration` ausente do `core-config.yaml`).

---

## Story

Como **gestor que baixa o PDF do Analytics**, quero o bloco "Comparativo" com os números do período
atual — hoje ele mostra **zero em todas as linhas** quando o período é 30 ou 90 dias, e um total
"anterior" travado em exatamente 1000.

---

## Context

Achado em 05/08 a partir de um PDF que o Marcos baixou (preset **Últimos 30 dias**, gerado 11:28).

O bloco **"DESTAQUE DO PERÍODO — Comparativo"** vinha assim:

| | PDF | Realidade (prod) |
|---|---|---|
| Novos leads · **Atual** | **0** | **459** |
| Novos leads · **Anterior** | **1000** | **1201** |

E não era só a linha Total: **toda** a coluna *Atual* zerada (empreendimento, corretor, origem), e
cada detalhamento de *Anterior* somando **exatamente 1000** — 166+47+787, 198+294+166+90+118+2+47+85,
344+589+24+4+16+15+8. Exatidão assim não é coincidência, é truncamento.

### Causa-raiz

A query do comparativo busca as **duas** janelas de uma vez (`compPrevStart` → `aggUntil`, o dobro
do período), vivia **dentro do `Promise.all` sem `.limit()` nem paginação**, e ordenava por
`created_at` **ascendente**. O PostgREST corta em 1000 linhas **em silêncio** — e com ordem do mais
antigo para o mais novo, as 1000 linhas eram consumidas **inteiramente pela janela anterior**: a
atual não recebia nenhuma linha. Um defeito, dois sintomas.

**Medido em prod (05/08) — linhas na janela por preset:**

| Preset | Janela | Linhas | Situação |
|---|---|---|---|
| 7 dias | 14d | 193 | ✅ passava |
| **30 dias** | 60d | **1.660** | ❌ zerava o Atual |
| **90 dias** | 180d | **1.666** | ❌ zerava o Atual |

### 🔥 Por que ninguém tinha visto — e por que minha suspeita estava no lugar errado

A anotação que abriu esta investigação dizia *"PDF sem filtro — cron de domingo!"*. **Errado.** O
cron semanal usa **7 dias** (193 linhas), passa longe do teto: ele está bem. Quem quebra é o **PDF
sob demanda com período longo** — e como quem baixa com 7 dias vê um PDF correto, o defeito ficava
invisível. Ver [[feedback-anotacao-backlog-e-hipotese]]: a anotação era hipótese, e medir inverteu
o alvo.

### O que NÃO era defeito (investigado e descartado)

- **Funil de Conversão.** Suspeitei de `Aguardando atendimento = 0` no PDF contra 21 no banco. Era
  **erro da minha medição**: a RPC filtra `is_active = true AND lost_reason IS NULL`, e eu havia
  somado sem essa régua. Com a régua certa: 0 = 0. As diferenças restantes (+1, +1, +3) são
  movimento real de 5 minutos entre a geração do PDF (11:28) e a consulta (11:33) — 5 leads foram
  para Represamento nesse intervalo — mais a fronteira do dia comercial (vira às 20:00), que eu
  aproximei por meia-noite. **Nenhuma mudança de código.**
- **Query do "Tempo médio de atendimento"**, que tem `.limit(1000)` explícito: medida em 46 / 286 /
  397 linhas nos presets de 7/30/90 dias. Folga confortável, não vale mexer agora.
- **PDF × mudanças de hoje (75-276/277).** O PDF nunca teve card de conversão (há comentário no
  código) e o "Funil de Conversão" dele é a lista de etapas, que continua igual na tela. A convenção
  "relatório segue a tela" segue respeitada.

---

## Acceptance Criteria

- [x] **AC1** — no PDF de **30 dias**, a coluna *Atual* do comparativo mostra os valores reais.
      Esperado (medido em prod, 05/08): **TOTAL 459** · Vind Residence 372 · Yarden 11 ·
      Sem empreendimento 76 — e 372+11+76 = 459.
- [x] **AC2** — a coluna *Anterior* deixa de travar em 1000. Esperado: **TOTAL 1201** ·
      Vind 290 · Yarden 55 · Sem empreendimento 856 — e 290+55+856 = 1201.
- [x] **AC3** — o TOTAL *Atual* do comparativo bate com o card de topo "Novos leads (entradas)"
      (que já mostrava 459 corretamente — só a tabela estava quebrada).
- [x] **AC4** — **90 dias** também correto (1.666 linhas na janela → 2 páginas de paginação).
- [x] **AC5** — **7 dias não muda** (já estava correto; é o caminho do cron semanal).
- [x] **AC6** — a paginação é determinística: ordem `created_at` **+ desempate por `id`**, porque
      `created_at` não é único (importação em lote grava vários leads no mesmo instante) e
      `.range()` sobre ordem com empate pula ou repete linha.
- [x] **AC7** — o ramo COM filtro continua funcionando: o `applyLeadFilters` segue aplicado dentro
      da query paginada, não depois.

---

## Dev Notes

Corrigido reusando **`fetchAllLeads`** (`lib/analytics/fetch-all-leads.ts`, nascido na 75-269) — e
aqui está o detalhe que mais diz sobre o defeito: **o import já existia neste arquivo**, trazido
pela Story 75-273 para paginar OUTRA query. Ou seja, o arquivo já sabia do teto de 1000; o
comparativo simplesmente **ficou de fora**. Não foi desconhecimento, foi omissão — e é o argumento
mais forte para paginar por helper compartilhado em vez de caso a caso.

A query saiu de dentro do `Promise.all` para uma função nomeada (`fetchComparativeLeads`), porque o
paginador recebe um **construtor** de query (builder do PostgREST não se reaproveita depois de
executado). O `Promise.all` passa a receber a promessa da função — a concorrência com as outras
chamadas é preservada.

**Desempate por `id` na ordem:** mesma lição que o gate da 75-276 pegou hoje na paginação de
`appointments`. `created_at` não é único; sem o desempate, a ordem entre páginas não é determinística
e o `.range()` pode pular linha. Ver [[project-analytics-visita-substitui-fechados]].

`RawLead` foi **reusado** para tipar o retorno (já existia no arquivo com exatamente essa forma) em
vez de criar um tipo gêmeo. O cast e o `?? []` no consumo saíram: `fetchAllLeads` já devolve array
tipado.

### File List
| Arquivo | Mudança |
|---|---|
| `lib/analytics-report-data.ts` | comparativo paginado via `fetchAllLeads` + desempate por `id`; query extraída para `fetchComparativeLeads()`; consumo sem cast |

## QA Results

Gate: **PASS com CONCERNS** — `docs/qa/gates/75.278-pdf-comparativo-paginacao.yml`

1.752 testes verdes, type-check limpo, lint 0 erros.

⚠️ **CONCERN — sem teste automatizado, e é dívida honesta.** `analytics-report-data.ts` tem **zero**
arquivo de teste. O que este defeito exigiria para ser pego por teste é um fake do PostgREST com
mais de 1000 linhas e cadeia completa (`rpc`, `from().select().eq()...`) — trabalho maior que a
correção, e sem infraestrutura existente para apoiar. O que reduz o risco: `fetchAllLeads` **já é
testado** (75-269) e a correção delega a ele. **A prova real é pós-deploy**, contra a tabela
esperada dos AC1/AC2 — que foi pré-calculada justamente para a conferência não ser "parece melhor".

## Change Log
| Data | Mudança |
|---|---|
| 2026-08-05 | Achado no PDF que o Marcos baixou. Medição em prod inverteu o alvo da suspeita (não era o cron de domingo) e descartou 2 falsos positivos |
