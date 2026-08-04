-- Story 75-268 — guardrail no prompt de PROD (agent_prompts).
--
-- Por que existe: o prompt do banco MASCARA o do código (ver memória
-- project-nicole-guardrails-db). Editar `packages/ai/src/prompts/visit-scheduling.ts`
-- não basta — sem este UPDATE o guardrail não vale em runtime.
--
-- O que corrige: em 03/08/2026 a Nicole disse a dois clientes "deixa eu confirmar a
-- disponibilidade com a equipe e já te retorno". Esse retorno não existe: ninguém a
-- lembra depois. Ela JÁ tem a agenda na mão no mesmo turno.
--
-- Como aplicar: Management API (PAT em ~/.config/supabase/pat), projeto de PROD
-- dsopqkqjkmhytudaaolv, arquivo inteiro num POST só. NUNCA `supabase db push`.
--
-- Idempotente: o WHERE checa "75-268"; rodar duas vezes não duplica o bloco.
-- Reversível: guarde o `content` anterior antes de aplicar (SELECT abaixo).

-- 1) BACKUP — rode e guarde a saída ANTES do UPDATE:
-- select content from agent_prompts where id = 'ae2255d2-d483-42c0-a22b-4cba790cd848';

-- 2) UPDATE:
UPDATE agent_prompts
SET content = content || E'\n\n### DISPONIBILIDADE NAO SE CONFIRMA "COM A EQUIPE" (Story 75-268):\nVoce ja tem a agenda na mao — a resposta sai AGORA, no mesmo turno.\n- NUNCA diga "deixa eu confirmar a disponibilidade com a equipe e ja te retorno" (nem as variacoes "vou confirmar e te aviso", "deixa eu ver com o time", "ja te retorno com a confirmacao"). Esse retorno nao existe: ninguem vai te lembrar depois, e o cliente fica esperando uma resposta que nunca chega.\n- A frase "deixa eu confirmar com a equipe" vale SO para o que voce realmente nao sabe (preco de unidade especifica, detalhe tecnico de obra) — NUNCA para dia, horario ou vaga na agenda.\n- Se o horario esta no bloco [SISTEMA] como LIVRE: confirme de uma vez.\n- Se nao esta: ofereca os horarios que o bloco listar, ou pergunte. Nunca empurre para depois.\n- NUNCA diga que um horario esta "fora do atendimento" e na mesma frase que ele esta disponivel. Se estiver em duvida sobre o expediente, use SO o que o bloco [SISTEMA] disser.',
    updated_at = now()
WHERE id = 'ae2255d2-d483-42c0-a22b-4cba790cd848'
  AND content NOT LIKE '%75-268%';

-- 3) CONFERIR (deve voltar 1 linha, com tem_268 > 0):
-- select name, length(content) as tam, position('75-268' in content) as tem_268
-- from agent_prompts where id = 'ae2255d2-d483-42c0-a22b-4cba790cd848';
