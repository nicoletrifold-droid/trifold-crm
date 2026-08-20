# Story 75-361 — 134 leads pediram preço em 90 dias; 2 receberam um número

**Status:** Draft — **MEDIÇÃO FEITA, decisão de produto PENDENTE (Marcos)**
**Tipo:** Medição de comportamento da Nicole (nenhuma linha de código nesta story)
**Epic:** 75 — CRM Trifold
**Complexidade:** a definir — depende de qual caminho o Marcos escolher no fim
**Fluxo:** @sm → **@po (decisão)** → @dev → @qa → @devops

## De onde veio

Na varredura de 20/08 (75-358/359/360) eu anotei como suspeita que a Nicole *"repetiu 'morar ou
investimento?' 4× e desviou 3 pedidos de preço"* na conversa do Amauri. Convenção do projeto:
**anotação de backlog é hipótese, mede-se em prod antes de implementar.** Medi. A hipótese que eu
levantei estava **errada no alvo e certa no cheiro**.

## O que a hipótese errou

"Morar ou investimento" repetida **não é** um problema de escala: em 90 dias, 9 conversas com a
pergunta e **1 só** com repetição (a do Amauri). Caso isolado.

A pergunta que a Nicole realmente repete é **"Como posso te chamar?"** — até 5× na mesma conversa
(60 dias: 30 conversas com alguma pergunta repetida, 4 delas com a do nome 3×+). E a maior parte
disso é a **rajada da 75-359**: em 25/06, às 09:54:45 e 09:54:54, ela mandou "Como posso te chamar?"
e "Me conta seu nome…" nos dois pipelines abertos pelas duas mensagens do lead. Ou seja: **a #474 já
cobre o grosso** — vale remedir depois do merge antes de tratar como defeito próprio.

## O que a medição achou no lugar

**Em 90 dias, 134 conversas em que o lead perguntou valor/preço/"quanto custa". Em 2 delas saiu
algum número (`R$`).** Nas outras 132, a resposta foi variação de:

> "Os valores variam conforme o andar e a posição do apartamento — o corretor consegue montar uma
> simulação personalizada pra você."

E ela **repete a mesma frase** quando o lead insiste. Caso pior (Maria Inês, jun–jul):

```
09:54:34 lead  Valor do imóvel?
09:54:53 IA    Os valores variam conforme o andar e a posição…
17:45:10 lead  Valor do imóvel?
17:45:13 IA    Os valores variam conforme o andar e a posição, Maria Inês…
17:45:58 lead  Mais baixo kkk
17:46:04 IA    Os valores variam conforme o andar e a posição — o corretor consegue…
17:50:35 lead  Sim.
17:50:39 IA    Os valores variam conforme o andar e a posição do apartamento, Maria Inês…
17:51:23 lead  ?
17:51:27 IA    Os valores variam conforme o andar e a posição do apartamento, Maria Inês…
17:52:15 lead  0k
17:52:18 IA    Os valores variam conforme o andar e a posição do apartamento, Maria Inês…
```

**7 vezes a mesma frase.** Inclusive respondendo a "Sim.", "?" e "0k", que não são perguntas de
preço. Zero fala de corretor nessa conversa. Lead terminou em **Represamento**.

## O gradiente (90 dias, 360 conversas com resposta da Nicole)

| grupo | leads | perdidos | % perdido | com visita |
|---|---|---|---|---|
| sem o muro de preço | 265 | 104 | **39,2%** | 17 (6,4%) |
| muro 1× | 58 | 30 | **51,7%** | 12 (20,7%) |
| muro 2×+ | 37 | 22 | **59,5%** | 4 (10,8%) |

E os 8 piores (muro 3×+): **6 estão em Perdido/Represamento**, 4 nunca tiveram uma única fala de
corretor, e só 1 dos 8 chegou a ter visita.

⚠️ **É correlação, e tem um confundidor óbvio na direção contrária:** quem pergunta preço está mais
engajado, e a coluna "com visita" mostra isso (20,7% no muro 1× contra 6,4% sem muro). Ou seja,
pedir preço é **sinal de compra** — e é justamente esse grupo que se perde mais quando a frase
repete. Não afirmo causa. Afirmo que 132 sinais de compra em 90 dias receberam a mesma frase e
metade virou Perdido, e isso merece uma decisão em vez de um encolher de ombros.

## O que NÃO estou propondo por conta própria

Não cotar preço pode ser **política**, não bug: a Nicole é SDR, o corretor é closer
(`project-nicole-como-sdr`), e cotar errado num imóvel na planta tem consequência comercial e
jurídica. Não vou carimbar essa decisão — ela é sua. O que a medição sustenta é que o **defeito
independente da política** é a Nicole ficar em **disco riscado**: repetir a mesma recusa 7 vezes,
inclusive para "0k", sem nunca escalar para gente.

## Decisão pedida ao Marcos

Três caminhos, não exclusivos:

**A. Escalar na 2ª insistência (o mais barato e o que eu recomendaria).** Lead pediu preço duas
vezes → handoff para o corretor, do jeito que já existe para outros gatilhos. Não muda política de
preço nenhuma; só troca o disco riscado por uma pessoa. Cobre os 8 casos piores e não toca nos 132.

**B. Faixa de preço em vez de número.** "A partir de R$ X" / "entre X e Y", com a variação por andar
como hoje. Exige decidir a fonte do valor (Sienge? tabela por empreendimento no CRM?) e quem
mantém. É mudança de política — sua.

**C. Nunca repetir a mesma frase.** Guarda genérica: se a última fala da Nicole já disse isso, a
próxima não pode repetir literalmente — varia ou escala. Mais amplo que preço (pega "como posso te
chamar" e o resto), mas é o mais difícil de acertar sem piorar outras coisas.

**Fora de escopo em qualquer um dos três:** o Amauri de 20/08, que motivou a anotação. O caso dele
era rajada (#474) + a repetição isolada de "morar ou investimento", que a medição mostrou não ter
escala.

## Como refazer a medição

```sql
-- 1) quantos pediram preço × quantos receberam número
with pediu as (
  select distinct conversation_id from messages
  where role='user' and created_at >= now() - interval '90 days'
    and content ~* 'valor|pre[çc]o|quanto (custa|fica|sai)|quanto [ée]'
), com_numero as (
  select distinct conversation_id from messages
  where role='assistant' and created_at >= now() - interval '90 days'
    and content ~* 'R\$\s*[0-9]'
)
select (select count(*) from pediu) as pediram,
       (select count(*) from pediu p
          where exists (select 1 from com_numero n where n.conversation_id=p.conversation_id)) as receberam;

-- 2) o muro por conversa
select conversation_id, count(*) as muros
from messages
where role='assistant' and created_at >= now() - interval '90 days'
  and (content ~* 'valores? (variam|depende)'
       or content ~* 'não quero te passar'
       or content ~* 'corretor consegue (montar|te passar)')
group by 1 having count(*) >= 3 order by 2 desc;
```

## Stories irmãs (mesma varredura de 20/08)

- **75-358** (PR #472) — `no_show` era a etapa "Atendimento"
- **75-359** (PR #474) — rajada do lead abrindo um pipeline por webhook
- **75-360** (PR #475) — palpite apagando `leads.name` real
