# Validação @po — Story 75-330 (*motor do formulário público de qualificação*)

**Validador:** @po (Pax) · **Data:** 2026-08-17 · **Story:** `docs/stories/75-330-formulario-qualificacao-motor.story.md`
**Epic:** 89 · `docs/stories/epics/epic-89-formulario-qualificacao-trafego-pago.md`
**Base:** branch `story/75-330-formulario-qualificacao-publico`, saída de `origin/main` = `220f0231` (0 ahead / 0 behind, conferido). Nenhum acesso a produção nesta validação — tudo verificado na árvore.

---

## VEREDITO: 🟢 **GO condicional** — `Draft` → **`Ready`**

**Placar: 8 / 10.** Quatro defeitos encontrados, **todos corrigidos por mim no corpo da story** e marcados `[@po 17/08]`. Nenhum devolve a story para o @sm: são de precisão técnica, não de intenção.

Um deles não é teoria — é a **repetição literal de um incidente de produção** que já aconteceu neste mesmo caminho de código, e a story como estava caminhava direto para ele.

---

## 1. 🔴 DEFEITO CRÍTICO — a AC4 reproduziria o incidente da migration 181

**O que a story dizia (AC4):** *"o lead nasce com `source` vindo da constante compartilhada de origens — importada, nunca uma string literal"*.

Está certo no espírito e **inviável na prática**. `SOURCE_OPTIONS` (`lib/constants.ts:102`) tem sete valores e **nenhum serve**:

```
referral · broker_sponsored · other · website · whatsapp_organic · meta_ads · google_ads
```

E o problema é maior do que "falta um rótulo": `leads.source` **não é texto, é um ENUM do Postgres** — `lead_source`, criado em `001_base_schema.sql:22`. Gravar um valor que não está no enum não degrada: **explode no INSERT com `22P02`**.

Isso não é hipótese minha. Está escrito no cabeçalho da própria migration que consertou o caso idêntico:

```
-- 181_lead_source_imob_link.sql — Story 75-190
-- O link público de agendamento da imobiliária (Epic 81, /api/agendar/[token])
-- cria o lead com source='imob_link', mas o valor nunca foi adicionado ao enum
-- lead_source → INSERT falhava (22P02) e o parceiro via "Não foi possível
-- registrar o cliente" no formulário.
```

**O mesmo epic, a mesma rota pública, o mesmo sintoma.** A 75-330 é a terceira porta pública a criar lead e seria a segunda a esquecer o enum.

### Consequência que ninguém veria de imediato

Se, para escapar do erro, o @dev carimbar `meta_ads`, o lead do formulário fica **indistinguível** do lead que já entra pelo webhook do Meta Lead Forms (`app/api/webhooks/meta-ads/route.ts:53` grava exatamente `source: "meta_ads"`). O `/api/analytics/sources/route.ts` agrupa por `source` cru — e a partir daí **é impossível medir se o formulário funciona**, que é a razão de existir do epic. Falha silenciosa, do tipo que só aparece três meses depois numa reunião.

### Correção aplicada

- Migration **231** isolada: `ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'form_qualificacao'` — mesma forma da 181, mesma idempotência.
- Tabelas novas movidas para a migration **232** (separar não é preciosismo: `ADD VALUE` e uso do valor não convivem bem na mesma transação, e a 231 assim fica verificável sozinha).
- AC4 reescrita exigindo a **varredura**. O valor de `source` está enumerado à mão em pelo menos cinco lugares independentes, e três deles quebram calados com um valor novo:

| Onde | O que é | Se esquecer |
|------|---------|-------------|
| `lib/constants.ts:102` | `SOURCE_OPTIONS` (canônica) | não aparece em nenhum seletor |
| `app/dashboard/leads/new/page.tsx:44` | **union de tipos escrita à mão** | `tsc` reprova ou o cast mente |
| `app/dashboard/leads/page.tsx:28` | lista de filtro | lead some do filtro |
| `app/dashboard/sistema/webhooks/page.tsx:17,130` | mapa de rótulo + `<option>` | rótulo em branco na tela |
| `app/dashboard/sistema/email-blasts/novo/_components/step-audience.tsx:9` | **cópia local de `SOURCE_OPTIONS`** | público do blast fica incompleto |

> Nota de dívida, fora do escopo desta story: a linha do `step-audience.tsx` é uma constante duplicada em vez de importada — exatamente o erro que já custou uma sessão inteira antes. Não conserto aqui (não é o assunto), mas fica registrado.

---

## 2. 🔴 DEFEITO — a AC6 mandava gravar UTM no lugar errado

**O que dizia:** *"`utm_source`, `utm_medium`, … são gravados em `leads.metadata`"*.

`leads` **já tem colunas dedicadas** para isso desde o schema base (`001_base_schema.sql:129-133`):

```
utm_source varchar(255) · utm_medium · utm_campaign · utm_content · utm_term
```

Enterrar UTM em `metadata` jsonb criaria uma segunda verdade ao lado de colunas que já existem, já são indexáveis e já são o que qualquer query de atribuição vai procurar primeiro.

**Correção aplicada:** AC6 passa a exigir as colunas dedicadas. `metadata` fica só para o que não tem coluna (id do formulário, token de origem).

---

## 3. 🟡 DEFEITO — a AC5 criava um segundo score sem dizer o que fazer com o primeiro

`leads.qualification_score` **existe e está vivo**. Não é coluna morta: é lida em `broker/pipeline`, na lista de leads e renderizada na ficha com faixa de cor (`app/broker/leads/[id]/page.tsx:200-210`, verde ≥ 70, amarelo ≥ 40). Ou seja, **o corretor já vê um número chamado "Score" numa escala 0–100**.

A story mandava gravar o score do formulário em `lead_form_responses.score` sem uma palavra sobre o outro. Resultado previsível: dois números com o mesmo nome, escalas possivelmente diferentes, e o corretor sem saber qual olhar.

**Correção aplicada:** AC5 agora obriga uma decisão explícita e a escala 0–100 para compatibilidade. A recomendação — que o @dev pode contrariar com justificativa na story — é **escrever nos dois**: `lead_form_responses.score` como histórico imutável da resposta, e `leads.qualification_score` para o corretor ver na tela onde ele já olha. O que **não** pode é a story sair daqui omissa.

---

## 4. 🟡 DEFEITO — "rate limit por IP" sem dono

A nota técnica pedia rate limit no POST público sem dizer com o quê. Não existe helper compartilhado no projeto: o que há é um `Map` em memória de módulo (`app/api/agent/chat/route.ts:60`), que na Vercel vale **por instância de lambda** e não é defesa real contra abuso distribuído.

Deixar assim convida o @dev a inventar Redis dentro de uma story de formulário.

**Correção aplicada:** a story agora manda **reusar o padrão existente** e **declarar a limitação em comentário**. Defesa séria de endpoint público, se for necessária, é story própria — não passageira desta.

---

## 5. Achado colateral (não bloqueia, mas alguém precisa saber)

**Existem duas migrations com o número 230:**

```
230_appointment_status_closed.sql
230_f4_rpcs_views_unificacao.sql
```

Não afeta a 75-330 (231/232 seguem livres) e o `CLAUDE.md` já registra um conflito histórico parecido em 074/075. Mas é colisão nova, e a ordem de aplicação entre as duas fica indefinida por nome. Registrado aqui para virar decisão de alguém — não desta story.

---

## 6. Checklist de 10 pontos

| # | Item | Nota | Observação |
|---|------|------|------------|
| 1 | Título claro e objetivo | ✅ | |
| 2 | Descrição completa | ✅ | O "porquê" do score inerte está explícito — era o que mais correria risco de ser "limpo" por alguém depois |
| 3 | ACs testáveis | ⚠️→✅ | AC4/AC5/AC6 eram testáveis mas **erradas**; corrigidas |
| 4 | Escopo IN/OUT definido | ✅ | |
| 5 | Dependências mapeadas | ⚠️→✅ | Faltava a dependência do enum `lead_source`; incluída |
| 6 | Estimativa | ✅ | M (~5 pts) segue válido: +1 migration e a varredura de `source` cabem no tamanho |
| 7 | Valor de negócio | ✅ | Epic §1/§3 |
| 8 | Riscos documentados | ✅ | Epic §6, com a mitigação do score gravado |
| 9 | Definition of Done | ✅ | Reforçada com a varredura e o `curl` anônimo |
| 10 | Alinhamento com o epic | ✅ | D1/D2/D3 preservadas |

**8 / 10** — acima do corte de 7. GO.

---

## 7. O que o @dev NÃO pode fazer sem voltar aqui

1. Mudar a D2 (todos veem a agenda) — é decisão do diretor, não de implementação.
2. Usar o score para esconder pergunta ou desviar lead — a inércia é o ponto.
3. Escolher um `source` já existente para "não precisar de migration". É o defeito §1 se disfarçando de atalho.

**Status da story:** `Draft` → **`Ready`**.

— Pax, @po
