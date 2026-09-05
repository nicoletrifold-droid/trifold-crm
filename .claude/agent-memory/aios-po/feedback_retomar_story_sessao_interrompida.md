---
name: feedback-retomar-story-sessao-interrompida
description: Ao retomar uma story cujo trabalho anterior foi interrompido, o cabeçalho (Status/Estimativa) é a parte que mente — auditar corpo dos ACs, Change Log e checklist antes de confiar
metadata:
  type: feedback
---

Quando uma sessão anterior foi interrompida no meio de uma edição de story,
**o cabeçalho é a primeira coisa que foi editada e a única que ficou pronta.**
Nunca tratar `Status: Ready` / estimativa nova como evidência de que o trabalho
foi feito — auditar, na ordem: (1) o Change Log tem a entrada que o cabeçalho
cita? (2) os ACs afetados já têm texto definitivo ou ainda dizem "em aberto /
ver decisão D*"? (3) existe blockquote/aviso no topo dizendo o contrário do
Status? (4) o checklist de tasks (T0) está marcado?

**Why:** Na 86-13 (Epic 86, landing Yarden) duas tentativas morreram por
instabilidade de sessão. A que chegou mais longe editou o cabeçalho para
`Ready`, 9 pontos, "ver Change Log 0.3" — e a 0.3 não existia, os 6 ACs ainda
estavam com "decisão aberta / não decidir sozinho em modo YOLO", e havia um
blockquote gigante logo abaixo do Status dizendo "⛔ Não iniciar implementação
ainda / está em `Draft` por decisão explícita". Um @dev que lesse só o
cabeçalho começaria a implementar sem conteúdo travado; um que lesse o
blockquote pararia. Os dois estariam "certos" pelo arquivo.

**How to apply:**
- Ler a story **inteira** (não grep pontual) antes de qualquer edição de
  retomada. Grep depois, como conferência: `em aberto|decisão aberta|não
  decidir sozinho|Opção A ou B|Draft|PLACEHOLDER`.
- Caçar contradições cabeçalho↔corpo explicitamente: avisos no topo, Riscos
  que pressupõem o gate ainda aberto, DoD que pede o que já foi feito,
  referências cruzadas a seções renomeadas.
- Ao travar decisões de curadoria: manter a seção de perguntas como
  **registro/insumo** (candidatos, citações da fonte, inventário), mas declarar
  por escrito que **a AC vence** se divergir. Senão o @dev implementa pela
  tabela de candidatos.
- Separar o que foi *decidido* do que foi *delegado ao @dev* — delegação
  explícita do stakeholder precisa estar escrita como autorização, ou o @dev
  volta pedindo permissão.
- ⚠️ Story ainda **untracked** em git não tem diff para conferir alegações do
  tipo "era 8 na 0.2". Registrar a limitação no Change Log em vez de afirmar
  como fato verificado.

Ver também [[feedback-validation-post-pm-review]] (auditar com evidência de
arquivo, não pelo Change Log).
