# Runbook de baseline — taxa de lastro da agenda da Nicole (`W0-3` · M1 · `PM2` do Epic 88)

**Instrumento:** `GET /api/cron/nicole-agenda-reconcile?days=60&dry=1` (Story 87-3)
**Módulo:** `packages/ai/src/flows/agenda-reconcile.ts`
**Medido por:** @dev (Dex) em **2026-08-07**, contra produção `dsopqkqjkmhytudaaolv`
**Janela:** `2026-06-08T23:13:21Z` → `2026-08-07T23:13:21Z` (60 dias) · **somente leitura**

---

## ⏳ VALIDADE DATADA — leia antes de usar este número

Este baseline vale contra o **`HEAD` de 07/08/2026**.

> **Quando a guarda de interrogação do Epic 88 (condição nº 7 do @architect) subir, o conjunto E o
> denominador mudam, e este baseline deixa de valer.** A `detectAffirmedSlot` tem hoje ~79 % de
> precisão: **5 dos 30 disparos** da janela são pergunta ou oferta (Sueli 03/08, Adriele 29/06,
> Célia 28/06 10:36 BRT, Sandra 05/08, Ailton 30/07 22:05 BRT). Com a guarda, esses disparos somem —
> a **Sueli sai do relatório inteiro**, e o denominador cai.
>
> **Quem subir aquela guarda TEM de republicar este baseline antes de usar o número para dimensionar
> o Epic 88.** Comparar um número pós-guarda com este aqui é comparar duas réguas diferentes com o
> mesmo nome — que é exatamente a causa (a) da divergência contra o baseline manual de 31 %.

---

## O número

```
unidade: fala (message_id)          janela: 60 dias        mensagens role='assistant' lidas: 1.157

total_disparos       30
descartes            { ligacao: 1, transicao_humana: 0, data_invalida: 0 }
lembrete              5     ← FORA do numerador E do denominador
denominador          24     ( = 30 − 1 − 5 )
com_lastro            3
reparo_humano         9
sem_lastro           12

lastro_pct           12,5 %
lastro_frouxo_pct    50,0 %   ← NÃO é lastro: inclui conserto humano posterior
alertas (lead+dia)      8     = 0,13 alerta/dia
```

### A sensibilidade, publicada — não é opcional

A régua tem **uma** ambiguidade estrutural, e ela move o número de ponta a ponta. O relatório publica
as duas leituras lado a lado **por AC** (AC3-i-b-c), porque o modo de falha aqui é publicar um número
falso com todas as outras verificações verdes:

| leitura | `com_lastro` | `lembrete` | denominador | **`lastro_pct`** |
|---|---|---|---|---|
| **`com_lastro` primeiro (NORMATIVA)** | 3 | 5 | 24 | **12,5 %** |
| `lembrete` primeiro | 0 | 8 | 21 | **0,0 %** |

A causa é estrutural: o `INSERT` do appointment **precede** a persistência da fala em 0,09 a 0,87 s
nos 6 appointments `created_by='nicole'` do projeto. Com `lembrete` avaliado primeiro, `com_lastro`
é **inalcançável por construção** e o instrumento publicaria `0 %` para sempre — com um JSON bem
formado, 30 disparos e nada de anômalo para alguém estranhar.

---

## Reconciliação linha a linha com o baseline manual de `5/16 = 31 %`

**O `31 %` / `81 %` fica registrado como `baseline manual, superado`.** O número oficial é o que o
instrumento publica. A diferença **não é ruído** — são quatro causas, todas medidas:

| # | Causa | Medido |
|---|---|---|
| **(a)** | **Denominador diferente.** O `31 %` é `5/16`, um conjunto **curado à mão**. O instrumento conta **todo disparo da `detectAffirmedSlot`** | **30 disparos**, em **18 leads** — não 16 falas |
| **(b)** | **A unidade nunca foi declarada.** A auditoria manual contou **casos**; o instrumento conta **falas** | 11 dos 18 leads têm ≥ 2 falas: Ailton ×3; Adriele, Célia, Edicleia, Helena, Maria Oliveira, Marlene, Miriam, Sandra, Valnira e Wilson ×2 |
| **(c)** | **Filtro de `status`.** A v0.1 excluía `cancelled`/`no_show`; esta régua os **conta** (Desenho §2.1) | **8 linhas mudam de balde** se excluídos, e o lastro cai **12,5 % → 8,0 %** (frouxo **50 % → 20 %**). Derruba para `sem_lastro` Helena ×2, Miriam, Andréia, Valnira ×2, André — e até o **Ailton, que é `com_lastro`** |
| **(d)** | **Faltava o balde `lembrete`.** O par (`created_by` + janela) não pega o appointment criado **ANTES** da fala | **5 linhas** (Marlene ×2, Edicleia ×2, André) sairiam como *"um humano consertou"*. Sem o balde: `reparo_humano` 9 → **14**, denominador 24 → **29**, lastro **12,5 % → 10,3 %** |

**Nenhuma das quatro é arredondamento, e nenhuma foi ajustada para o número bater.** A régua não foi
afrouxada em nenhum ponto: a janela de classificação continua em ±30 min, o filtro de autor e a
janela de mesmo turno continuam sendo uma conjunção, e o discriminador de ligação continua fora da
`detectAffirmedSlot`.

---

## Como reproduzir

```bash
# Em produção, depois do deploy (não escreve nada: `dry=1` não emite evento nem alerta)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<app>/api/cron/nicole-agenda-reconcile?days=60&dry=1" | jq '{
    unidade, total_disparos, descartes, lembrete, denominador,
    com_lastro, reparo_humano, sem_lastro, lastro_pct, lastro_frouxo_pct, sensibilidade }'
```

**Conferências obrigatórias de montagem** (se qualquer uma falhar, o instrumento está errado — não é
o número que mudou):

1. A rodada lista os **8 leads da AC1**, em **16 falas**: Célia ×2, Helena ×2, Miriam ×2, Ailton ×3,
   Sandra ×2, Sueli ×1, Valnira ×2, Maria Oliveira ×2.
2. A **Silvana não aparece em balde nenhum e não gera alerta** — ela pediu ligação, e a ligação
   aconteceu. Ela aparece no relatório apenas como `descarte: "ligacao"`, e `descartes.ligacao ≥ 1`.
3. A linha do **Ailton de 30/07 22:17 BRT** sai como `sem_lastro` com **`divergencia_min: 60`** (ele
   **tem** appointment, às 10h; ela afirmou 9h) e com `alerta_suprimido: true`.
4. `denominador === total_disparos − descartes − lembrete`.
5. `sensibilidade.lembrete_primeiro.lastro_pct` **tem de ser menor** que `lastro_pct`. Se os dois
   forem iguais a zero, a precedência foi invertida em algum lugar.

---

## Consumidores deste número

| Onde | O que muda |
|---|---|
| **`PM2` do Epic 88** | Deixa de citar `31 %`. Passa a citar **12,5 % (07/08/2026)**, com a validade datada acima |
| **§3 do Epic 87 (M1)** | Idem — @po/@pm propagam |
| **Epic 88 — sequenciamento e dimensionamento** | O gate de existência foi **revogado**: o número não aprova nem reprova o epic, ele decide **quando** sobe, **com que escopo** e **quantas tools na v1** |

> ⚠️ **Um número falsamente baixo encolhe a v1 errado, e v1 subdimensionada é falha silenciosa** —
> ninguém reclama do escopo que nunca foi escrito. É por isso que a sensibilidade vai publicada e
> por isso que a validade é datada.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-07 | 1.0 | Primeiro baseline do instrumento (Story 87-3, T6/T7). `lastro_pct = 12,5 %`, `lastro_frouxo_pct = 50,0 %`, sobre `total_disparos = 30` e `denominador = 24`. Bate **exatamente** com a previsão do @po (`po-validation-87-3-87-4-87-5.md` §1.4). Reconciliação linha a linha contra o baseline manual de `5/16 = 31 %` com as quatro causas medidas. Sensibilidade da precedência publicada: **12,5 % × 0,0 %**. Linha de validade datada escrita. | @dev (Dex) |
