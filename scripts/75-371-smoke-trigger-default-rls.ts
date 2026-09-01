/**
 * Story 75-371 (@qa R5 · CodeRabbit) — prova que o trigger `trg_kanban_stages_default_unico`
 * TRANSFERE o padrão sob RLS de `authenticated`, não só por service role.
 *
 * ## POR QUE ESTE SCRIPT EXISTE
 *
 * A migration 250 foi provada com a Management API, que roda como superusuário: RLS desligada.
 * Isso deixou uma lacuna de evidência real — o ramo de TRANSFERÊNCIA do trigger nunca havia
 * rodado como usuário logado, que é o único jeito que ele roda em produção. O @qa registrou
 * como resíduo R5.
 *
 * A impersonação é a mesma que o Postgres usa por baixo do PostgREST:
 *   SET LOCAL role authenticated;
 *   SET LOCAL request.jwt.claims = '{"sub":"<auth_id>","role":"authenticated"}';
 * `has_capability()` (migration 225:54) resolve o usuário por `u.auth_id = auth.uid()`, e
 * `auth.uid()` lê exatamente esse claim `sub`.
 *
 * ## É SEGURO RODAR EM PRODUÇÃO
 *
 * Tudo acontece dentro de `BEGIN … ROLLBACK`: o UPDATE é executado de verdade — o trigger
 * dispara de verdade — e nada persiste. É o mesmo padrão da prova da própria migration e da
 * Story 75-280. Ainda assim, o script NÃO pede `TRIFOLD_ALLOW_PROD`: ele não escreve fora da
 * transação revertida, e exigir a flag daria a impressão errada de que escreve.
 *
 * ## USO
 *
 *   SUPABASE_MANAGEMENT_PAT=… pnpm tsx scripts/75-371-smoke-trigger-default-rls.ts
 *   TRIFOLD_ENV=producao SUPABASE_MANAGEMENT_PAT=… pnpm tsx scripts/75-371-…   # padrão: teste
 */
import { runSqlBruto } from "./lib/management-api"
import { resolverAmbiente } from "./lib/db-env"

/** Etapa que recebe o posto na prova. Trocável: qualquer slug que não seja o padrão atual. */
const SLUG_ALVO = process.env.SLUG_ALVO?.trim() || "follow-up"

function pat(): string {
  const v = process.env.SUPABASE_MANAGEMENT_PAT?.trim()
  if (!v) {
    throw new Error(
      "Env SUPABASE_MANAGEMENT_PAT ausente ou vazia. É ela que autentica na Management API.",
    )
  }
  return v
}

interface Veredito {
  etapa: string
  valor: string
}

async function provarComo(ref: string, token: string, papel: string, authId: string) {
  const r = await runSqlBruto(
    ref,
    token,
    `
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"${authId}","role":"authenticated"}';

CREATE TEMP TABLE v(ordem int, etapa text, valor text);
INSERT INTO v SELECT 1, 'has_capability(pipeline_editar)',
  has_capability('configuracoes.pipeline_editar')::text;
INSERT INTO v SELECT 2, 'padrao ANTES', (SELECT name FROM kanban_stages WHERE is_default);

-- O ATO: transferir o padrão. É aqui que o trigger tem de disparar sob RLS.
UPDATE kanban_stages SET is_default = true WHERE slug = '${SLUG_ALVO}';

INSERT INTO v SELECT 3, 'linhas com is_default DEPOIS',
  (SELECT count(*) FROM kanban_stages WHERE is_default)::text;
INSERT INTO v SELECT 4, 'padrao DEPOIS', (SELECT name FROM kanban_stages WHERE is_default);
INSERT INTO v SELECT 5, 'padrao em etapa INATIVA',
  (SELECT count(*) FROM kanban_stages WHERE is_default AND NOT is_active)::text;

-- A Management API devolve só o resultado do ÚLTIMO statement — daí a temp table.
SELECT etapa, valor FROM v ORDER BY ordem;
ROLLBACK;`,
  )

  console.log(`\n=== ${papel} ===`)
  if (!r.ok) {
    console.error("FALHOU:", r.msg.slice(0, 400))
    return false
  }
  const vereditos = JSON.parse(r.msg) as Veredito[]
  for (const v of vereditos) console.log(`  ${v.etapa.padEnd(34)} ${v.valor}`)

  const valor = (etapa: string) => vereditos.find((v) => v.etapa === etapa)?.valor
  const ok =
    valor("has_capability(pipeline_editar)") === "true" &&
    valor("linhas com is_default DEPOIS") === "1" &&
    valor("padrao em etapa INATIVA") === "0"
  console.log(`  → ${ok ? "OK" : "REPROVOU"}`)
  return ok
}

async function main() {
  const alvo = resolverAmbiente({ escreve: false })
  const token = pat()

  const quem = await runSqlBruto(
    alvo.ref,
    token,
    `SELECT DISTINCT ON (role) role, auth_id
       FROM users
      WHERE is_active AND auth_id IS NOT NULL AND role IN ('admin','gerente-comercial')
      ORDER BY role, name;`,
  )
  if (!quem.ok) throw new Error("não consegui listar usuários: " + quem.msg.slice(0, 300))
  const usuarios = JSON.parse(quem.msg) as { role: string; auth_id: string }[]

  let tudoOk = true
  for (const u of usuarios) {
    tudoOk = (await provarComo(alvo.ref, token, u.role, u.auth_id)) && tudoOk
  }

  console.log(
    `\n${tudoOk ? "✅" : "❌"} ${usuarios.length} papel(éis) exercitado(s) em ${alvo.ambiente} ` +
      `(${alvo.ref}). Nada persistiu: cada prova roda em BEGIN … ROLLBACK.`,
  )
  process.exit(tudoOk ? 0 : 1)
}

main()
