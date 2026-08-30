/**
 * Story 900-51 — Camada B: os carrascos que só existem contra o Postgres de verdade.
 *
 * ## Por que estes testes não podem ser unitários
 *
 * As cinco propriedades desta story foram movidas da rota para o BANCO justamente porque a rota
 * não é a superfície que o cliente alcança. Testá-las com um duplo de Supabase provaria que a
 * rota chama a RPC — que é o que já estava certo nas duas versões reprovadas. O que precisa de
 * prova é o comportamento da FUNÇÃO: `REVOKE` contra `BYPASSRLS`, trigger em `TRUNCATE`,
 * `SELECT … INTO` que não levanta, `vault.create_secret` que roda antes do `UPDATE`. Nenhuma
 * dessas coisas existe fora de um Postgres.
 *
 * ## Config e comando (Task 11.2)
 *
 *     pnpm test:tenancy      (vitest.tenancy.config.ts — NUNCA o vitest.config.ts da raiz, que
 *                             não carrega `.env` nenhum: medido `TENANCY_TEST_SUPABASE_URL=undefined`)
 *
 * ## A catraca de aceitação é a CONTAGEM DE TESTES EXECUTADOS (R5)
 *
 * `expect.assertions(n)` fica — ele pega "o teste rodou e afirmou menos do que devia" — mas ele
 * **nunca executa dentro de um teste pulado**, e "suíte inteira em skip, exit 0" foi o defeito
 * real da 900-25. Por isso o critério colado no Dev Agent Record é `N passed`, e
 * `0 passed | N skipped` REPROVA.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { credenciaisPresentes } from "./support/ambiente"
import { exigir, rodarBlocoTransacional } from "./support/sql-transacional"

const d = credenciaisPresentes ? describe : describe.skip

/** Fixture com DUAS orgs e DOIS usuários — uma entidade só esconderia todo erro cross-org. */
const PREPARAR_FIXTURE = `
DO $$
DECLARE v_orgA uuid; v_orgB uuid;
BEGIN
  INSERT INTO organizations (name, slug) VALUES ('Org A 900-51','org-a-900-51') RETURNING id INTO v_orgA;
  INSERT INTO organizations (name, slug) VALUES ('Org B 900-51','org-b-900-51') RETURNING id INTO v_orgB;
  INSERT INTO users (org_id, name, email, role) VALUES (v_orgA, 'Ana da Org A', 'ana@a.test', 'admin');
  INSERT INTO users (org_id, name, email, role) VALUES (v_orgB, 'Bruno da Org B', 'bruno@b.test', 'admin');
  INSERT INTO org_integrations (org_id, provider, status, config)
  SELECT o.id, p.provider, 'disconnected',
         CASE WHEN p.provider='meta_ads' THEN '{"page_id": null}'::jsonb
              WHEN p.provider='meta_capi' THEN '{"dataset_id": null}'::jsonb
              ELSE '{}'::jsonb END
  FROM organizations o
  CROSS JOIN (VALUES ('whatsapp'),('meta_ads'),('meta_capi'),('sienge'),('telegram'),('google')) AS p(provider)
  WHERE o.id IN (v_orgA, v_orgB)
  ON CONFLICT (org_id, provider) DO NOTHING;
END $$;
`

/** `org_id`/`user_id` da Org A e da Org B, sempre lidos pelo slug — nunca por `LIMIT 1`. */
const IDS = `
  v_orgA uuid := (SELECT id FROM organizations WHERE slug='org-a-900-51');
  v_orgB uuid := (SELECT id FROM organizations WHERE slug='org-b-900-51');
  v_ana  uuid := (SELECT id FROM users WHERE email='ana@a.test');
  v_bruno uuid := (SELECT id FROM users WHERE email='bruno@b.test');
`

// ═══════════════════════════════════════════════════════════════════════════════════════════════
d("AC2 — `platform_audit_log` append-only nos QUATRO verbos (N1)", () => {
  let r: Record<string, string>

  beforeAll(async () => {
    r = await rodarBlocoTransacional(`
      -- ::text explícito em cada booleano: 'format('%s', true)' imprime 't', não 'true', e um
      -- esperado escrito como 'upd=false' passaria a nunca casar por um motivo que não é o do
      -- teste. Medido na primeira execução desta suíte.
      INSERT INTO _res
      SELECT 'privilegios_service_role', format('ins=%s upd=%s del=%s trunc=%s',
        has_table_privilege('service_role','platform_audit_log','INSERT')::text,
        has_table_privilege('service_role','platform_audit_log','UPDATE')::text,
        has_table_privilege('service_role','platform_audit_log','DELETE')::text,
        has_table_privilege('service_role','platform_audit_log','TRUNCATE')::text);

      -- Eixo 1: privilégio, com o role que BYPASSA RLS (é o cliente de toda rota /platform).
      DO $blk$
      DECLARE n int;
      BEGIN
        SET LOCAL ROLE service_role;
        INSERT INTO platform_audit_log (actor_type, action, target_table)
          VALUES ('platform_admin','carrasco-ac2','org_integrations');
        SELECT count(*) INTO n FROM platform_audit_log WHERE action='carrasco-ac2';
        INSERT INTO _res VALUES ('sr_INSERT', 'ok:'||n);
        BEGIN UPDATE platform_audit_log SET action='x' WHERE action='carrasco-ac2';
          INSERT INTO _res VALUES ('sr_UPDATE','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('sr_UPDATE', SQLSTATE); END;
        BEGIN DELETE FROM platform_audit_log WHERE action='carrasco-ac2';
          INSERT INTO _res VALUES ('sr_DELETE','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('sr_DELETE', SQLSTATE); END;
        BEGIN TRUNCATE platform_audit_log;
          INSERT INTO _res VALUES ('sr_TRUNCATE','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('sr_TRUNCATE', SQLSTATE); END;
        RESET ROLE;
      END $blk$;

      -- Eixo 2: o trigger, com o DONO da tabela — que passaria pelo REVOKE.
      DO $blk$
      DECLARE n int;
      BEGIN
        BEGIN UPDATE platform_audit_log SET action='x' WHERE action='carrasco-ac2';
          INSERT INTO _res VALUES ('dono_UPDATE','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('dono_UPDATE', SQLSTATE); END;
        BEGIN DELETE FROM platform_audit_log WHERE action='carrasco-ac2';
          INSERT INTO _res VALUES ('dono_DELETE','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('dono_DELETE', SQLSTATE); END;
        BEGIN TRUNCATE platform_audit_log;
          INSERT INTO _res VALUES ('dono_TRUNCATE','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('dono_TRUNCATE', SQLSTATE); END;
        SELECT count(*) INTO n FROM platform_audit_log WHERE action='carrasco-ac2';
        INSERT INTO _res VALUES ('linha_sobreviveu_aos_3_verbos', n::text);
      END $blk$;
    `)
  })

  it("o `INSERT` de `service_role` continua funcionando — o REVOKE não matou a trilha", () => {
    expect.assertions(2)
    expect(exigir(r, "sr_INSERT")).toBe("ok:1")
    expect(exigir(r, "privilegios_service_role")).toContain("ins=true")
  })

  it("`UPDATE`/`DELETE`/`TRUNCATE` de `service_role` são barrados por PRIVILÉGIO (42501)", () => {
    expect.assertions(4)
    expect(exigir(r, "privilegios_service_role")).toBe(
      "ins=true upd=false del=false trunc=false",
    )
    for (const verbo of ["sr_UPDATE", "sr_DELETE", "sr_TRUNCATE"]) {
      expect(exigir(r, verbo), verbo).toBe("42501")
    }
  })

  it("o QUARTO verbo (`TRUNCATE`) é o que a Rodada 2 mediu passando — e agora não passa", () => {
    // Este `it` existe separado dos outros dois de propósito: em `sr_UPDATE`/`sr_DELETE` a
    // rodada 2 já estava verde. O `TRUNCATE` apagou 2 linhas SEM exceção, e é o único verbo cujo
    // conserto precisou de DUAS coisas (o verbo no REVOKE e um trigger FOR EACH STATEMENT).
    expect.assertions(2)
    expect(exigir(r, "sr_TRUNCATE")).toBe("42501")
    expect(exigir(r, "dono_TRUNCATE")).toBe("P0020")
  })

  it("os TRÊS triggers barram até o DONO da tabela, com `P0020`", () => {
    expect.assertions(4)
    for (const verbo of ["dono_UPDATE", "dono_DELETE", "dono_TRUNCATE"]) {
      expect(exigir(r, verbo), verbo).toBe("P0020")
    }
    // Célula de vivacidade: "levantou" não basta — a linha precisa ter SOBREVIVIDO. Um trigger
    // AFTER, ou um RAISE depois do efeito, deixaria os 3 acima verdes com a trilha apagada.
    expect(exigir(r, "linha_sobreviveu_aos_3_verbos")).toBe("1")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
d("AC1 — os seis carrascos exigidos pelo `@po`", () => {
  let r: Record<string, string>

  beforeAll(async () => {
    r = await rodarBlocoTransacional(`
      ${PREPARAR_FIXTURE}
      DO $blk$
      DECLARE
        ${IDS}
        v_ref text; v_status text; v_n int;
      BEGIN
        -- (4) allowlist POSITIVA, os dois sentidos, chamando a RPC DIRETO (sem rota nenhuma)
        BEGIN PERFORM _org_integration_write_secret(v_orgA,'google','tok','{}',v_ana,'org_admin');
          INSERT INTO _res VALUES ('allowlist_google','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('allowlist_google', SQLSTATE); END;
        BEGIN PERFORM _org_integration_write_secret(v_orgA,'whatsapp','tok','{}',v_ana,'org_admin');
          INSERT INTO _res VALUES ('allowlist_whatsapp','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('allowlist_whatsapp', SQLSTATE); END;
        FOR v_status IN SELECT unnest(ARRAY['meta_capi','sienge','telegram']) LOOP
          BEGIN
            PERFORM _org_integration_write_secret(v_orgA, v_status, 'tok-'||v_status, '{}'::jsonb, v_ana, 'org_admin');
            INSERT INTO _res VALUES ('allowlist_'||v_status, 'gravou');
          EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('allowlist_'||v_status, 'ERRO '||SQLSTATE); END;
        END LOOP;

        -- (5) segredo vazio e só-espaços (N2a)
        BEGIN PERFORM _org_integration_write_secret(v_orgB,'sienge','','{}',v_bruno,'org_admin');
          INSERT INTO _res VALUES ('segredo_vazio','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('segredo_vazio', SQLSTATE); END;
        BEGIN PERFORM _org_integration_write_secret(v_orgB,'sienge','   ','{}',v_bruno,'org_admin');
          INSERT INTO _res VALUES ('segredo_espacos','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('segredo_espacos', SQLSTATE); END;
        -- célula de vivacidade do N2a: nenhuma linha connected com segredo de comprimento zero
        SELECT count(*) INTO v_n
          FROM org_integrations oi
          JOIN vault.decrypted_secrets ds ON ds.id = oi.secret_ref::uuid
         WHERE oi.status='connected' AND length(ds.decrypted_secret) = 0;
        INSERT INTO _res VALUES ('connected_com_segredo_vazio', v_n::text);

        -- (6) page_id: formato inválido recusado, formato válido aceito
        BEGIN PERFORM _org_integration_write_secret(v_orgA,'meta_ads','tok','{"page_id":"PAGINA-DE-OUTRA-EMPRESA-999"}',v_ana,'org_admin');
          INSERT INTO _res VALUES ('page_id_malformado','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('page_id_malformado', SQLSTATE); END;
        BEGIN PERFORM _org_integration_write_secret(v_orgA,'meta_ads','tok','{"page_id":"123456789"}',v_ana,'org_admin');
          INSERT INTO _res VALUES ('page_id_valido','gravou');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('page_id_valido','ERRO '||SQLSTATE); END;

        -- (3) guard de mark_connected, os dois sentidos
        BEGIN PERFORM _org_integration_mark_connected(v_orgB,'telegram',v_bruno,'org_admin');
          INSERT INTO _res VALUES ('mark_connected_sem_segredo','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('mark_connected_sem_segredo', SQLSTATE); END;
        BEGIN PERFORM _org_integration_mark_connected(v_orgA,'sienge',v_ana,'org_admin');
          SELECT status INTO v_status FROM org_integrations WHERE org_id=v_orgA AND provider='sienge';
          INSERT INTO _res VALUES ('mark_connected_com_segredo', v_status);
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('mark_connected_com_segredo','ERRO '||SQLSTATE); END;

        -- R4 — 'write_secret' NÃO promove status. Medido numa linha que só sofreu write.
        SELECT status INTO v_status FROM org_integrations WHERE org_id=v_orgA AND provider='meta_capi';
        INSERT INTO _res VALUES ('status_apos_write_puro', v_status);

        -- (2) caminho forçado de R2: a linha não existe
        DELETE FROM org_integrations WHERE org_id=v_orgB AND provider='meta_capi';
        BEGIN PERFORM _org_integration_write_secret(v_orgB,'meta_capi','tok','{}',v_bruno,'org_admin');
          INSERT INTO _res VALUES ('linha_ausente','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('linha_ausente', SQLSTATE); END;
        -- e não sobrou segredo órfão: o RAISE acontece ANTES do vault.create_secret
        SELECT count(*) INTO v_n FROM platform_audit_log
          WHERE org_id=v_orgB AND metadata->>'provider'='meta_capi';
        INSERT INTO _res VALUES ('auditoria_de_sucesso_sobre_linha_ausente', v_n::text);
      END $blk$;
    `)
  })

  it("(4) allowlist positiva: `google` → P0011 e `whatsapp` → P0010, pela RPC direta", () => {
    expect.assertions(2)
    expect(exigir(r, "allowlist_google")).toBe("P0011")
    expect(exigir(r, "allowlist_whatsapp")).toBe("P0010")
  })

  it("(4, sentido oposto) os providers da allowlist gravam — a régua discrimina, não recusa tudo", () => {
    expect.assertions(3)
    for (const p of ["meta_capi", "sienge", "telegram"]) {
      expect(exigir(r, `allowlist_${p}`), p).toBe("gravou")
    }
  })

  it("(5/N2a) segredo vazio E só-espaços levantam `P0017` — `btrim`, não `= ''`", () => {
    expect.assertions(2)
    expect(exigir(r, "segredo_vazio")).toBe("P0017")
    expect(exigir(r, "segredo_espacos")).toBe("P0017")
  })

  it("(5, vivacidade) nenhuma linha `connected` convive com segredo de comprimento zero", () => {
    expect.assertions(1)
    expect(exigir(r, "connected_com_segredo_vazio")).toBe("0")
  })

  it("(6/N2b) `page_id` malformado → `P0018`; numérico válido → grava", () => {
    expect.assertions(2)
    expect(exigir(r, "page_id_malformado")).toBe("P0018")
    expect(exigir(r, "page_id_valido")).toBe("gravou")
  })

  it("(3/R4) `mark_connected` sem `secret_ref` → `P0015`; com segredo → promove", () => {
    expect.assertions(2)
    expect(exigir(r, "mark_connected_sem_segredo")).toBe("P0015")
    expect(exigir(r, "mark_connected_com_segredo")).toBe("connected")
  })

  it("(R4) `write_secret` sozinho NÃO promove status — fica `disconnected`", () => {
    // Se `write_secret` voltasse a escrever `status`, o carrasco anterior continuaria verde (o
    // caminho feliz promove de qualquer jeito). É este `it` que reprova a fusão das duas
    // operações — a mutação exata que o R4 existe para impedir.
    expect.assertions(1)
    expect(exigir(r, "status_apos_write_puro")).toBe("disconnected")
  })

  it("(2/R2) linha ausente → `P0012`, e NENHUMA auditoria de sucesso é gravada", () => {
    expect.assertions(2)
    expect(exigir(r, "linha_ausente")).toBe("P0012")
    // A segunda asserção é o 14º instrumento cego em si: antes, a função voltava sem erro E
    // gravava uma linha de sucesso, e a rota devolvia 200.
    expect(exigir(r, "auditoria_de_sucesso_sobre_linha_ausente")).toBe("0")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
d("AC1 (1) — o UUID plantado, TRÊS asserções", () => {
  let r: Record<string, string>

  beforeAll(async () => {
    r = await rodarBlocoTransacional(`
      ${PREPARAR_FIXTURE}
      DO $blk$
      DECLARE
        ${IDS}
        v_ref text; v_n int; v_last4 text;
      BEGIN
        PERFORM _org_integration_write_secret(
          v_orgA,'sienge','UUID-PLANTADO-1234','{"subdomain":"acme"}',v_ana,'platform_admin');
        -- (a) o valor aparece no Vault
        SELECT count(*) INTO v_n FROM vault.decrypted_secrets WHERE decrypted_secret='UUID-PLANTADO-1234';
        INSERT INTO _res VALUES ('a_valor_no_vault', v_n::text);
        -- (c) 'org_integrations.secret_ref' APONTA para esse segredo — cast ::uuid explícito
        --     (m5/m6: 'secret_ref' é 'text'; sem o cast a comparação bate em 42883)
        SELECT secret_ref INTO v_ref FROM org_integrations WHERE org_id=v_orgA AND provider='sienge';
        SELECT count(*) INTO v_n FROM vault.decrypted_secrets ds
          WHERE ds.id = v_ref::uuid AND ds.decrypted_secret='UUID-PLANTADO-1234';
        INSERT INTO _res VALUES ('c_secret_ref_aponta_para_o_segredo', v_n::text);
        -- (b) o reveal devolve NO MÁXIMO os 4 últimos caracteres
        v_last4 := _org_integration_reveal_last4(v_orgA,'sienge',v_ana,'platform_admin');
        INSERT INTO _res VALUES ('b_reveal_devolve', v_last4);
        INSERT INTO _res VALUES ('b_reveal_tem_o_segredo_inteiro',
          (v_last4 = 'UUID-PLANTADO-1234')::text);
        -- o reveal audita ANTES de devolver
        SELECT count(*) INTO v_n FROM platform_audit_log
          WHERE action='org_integration.secret_last4_revealed' AND org_id=v_orgA;
        INSERT INTO _res VALUES ('reveal_auditado', v_n::text);
        -- o segredo em claro nunca vira coluna legível de org_integrations
        SELECT count(*) INTO v_n FROM org_integrations
          WHERE org_id=v_orgA AND config::text LIKE '%UUID-PLANTADO%';
        INSERT INTO _res VALUES ('segredo_vazou_para_config', v_n::text);
      END $blk$;
    `)
  })

  it("(a) o valor plantado está no Vault", () => {
    expect.assertions(1)
    expect(exigir(r, "a_valor_no_vault")).toBe("1")
  })

  it("(c) `secret_ref` aponta para AQUELE segredo — a asserção que o R2 tornou obrigatória", () => {
    // Sem esta, (a) e (b) ficam verdes com a linha nunca tendo sido tocada: o
    // `vault.create_secret` roda antes do `UPDATE`, então o segredo existe mesmo no cenário em
    // que a escrita afetou zero linhas.
    expect.assertions(1)
    expect(exigir(r, "c_secret_ref_aponta_para_o_segredo")).toBe("1")
  })

  it("(b) o reveal devolve só os 4 últimos, nunca o segredo inteiro", () => {
    expect.assertions(2)
    expect(exigir(r, "b_reveal_devolve")).toBe("1234")
    expect(exigir(r, "b_reveal_tem_o_segredo_inteiro")).toBe("false")
  })

  it("o reveal AUDITA antes de devolver, e o segredo não vaza para `config`", () => {
    expect.assertions(2)
    expect(exigir(r, "reveal_auditado")).toBe("1")
    expect(exigir(r, "segredo_vazou_para_config")).toBe("0")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
d("AC7 — discriminação por `actor_type`/`actor_label` congelados", () => {
  let r: Record<string, string>

  beforeAll(async () => {
    r = await rodarBlocoTransacional(`
      ${PREPARAR_FIXTURE}
      DO $blk$
      DECLARE ${IDS} v_n int; v_label text;
      BEGIN
        PERFORM _org_integration_write_secret(v_orgA,'sienge','s1','{}',v_ana,'org_admin');
        PERFORM _org_integration_write_secret(v_orgB,'sienge','s2','{}',v_bruno,'platform_admin');
        SELECT count(*) INTO v_n FROM platform_audit_log WHERE org_id=v_orgA AND actor_type='org_admin';
        INSERT INTO _res VALUES ('orgA_como_org_admin', v_n::text);
        SELECT count(*) INTO v_n FROM platform_audit_log WHERE org_id=v_orgA AND actor_type='platform_admin';
        INSERT INTO _res VALUES ('orgA_como_platform_admin', v_n::text);
        SELECT metadata->>'actor_label' INTO v_label FROM platform_audit_log WHERE org_id=v_orgA LIMIT 1;
        INSERT INTO _res VALUES ('actor_label_orgA', COALESCE(v_label,'<nulo>'));
        -- R7 — a trilha SOBREVIVE ao usuário que a originou (ON DELETE SET NULL + label congelado)
        DELETE FROM users WHERE id = v_ana;
        SELECT count(*) INTO v_n FROM platform_audit_log WHERE org_id=v_orgA;
        INSERT INTO _res VALUES ('linhas_apos_apagar_usuario', v_n::text);
        SELECT metadata->>'actor_label' INTO v_label FROM platform_audit_log WHERE org_id=v_orgA LIMIT 1;
        INSERT INTO _res VALUES ('actor_label_apos_apagar_usuario', COALESCE(v_label,'<nulo>'));
        SELECT count(*) INTO v_n FROM platform_audit_log WHERE org_id=v_orgA AND actor_user_id IS NULL;
        INSERT INTO _res VALUES ('actor_user_id_virou_nulo', v_n::text);

        -- A excecao do trigger e CIRURGICA: o dono pode nulificar atribuicao (e a acao
        -- referencial) e continua NAO podendo mexer no conteudo.
        BEGIN UPDATE platform_audit_log SET action='forjada' WHERE org_id=v_orgA;
          INSERT INTO _res VALUES ('dono_altera_action','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('dono_altera_action', SQLSTATE); END;
        BEGIN UPDATE platform_audit_log SET metadata='{"forjado":true}' WHERE org_id=v_orgA;
          INSERT INTO _res VALUES ('dono_altera_metadata','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('dono_altera_metadata', SQLSTATE); END;
        BEGIN UPDATE platform_audit_log SET actor_user_id=v_bruno WHERE org_id=v_orgA;
          INSERT INTO _res VALUES ('dono_reaponta_ator','PASSOU');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('dono_reaponta_ator', SQLSTATE); END;

        -- E o que a 900-25 precisa: apagar a ORG inteira, com trilha, nao pode ser bloqueado.
        BEGIN
          DELETE FROM org_integrations WHERE org_id=v_orgA;
          DELETE FROM whatsapp_config WHERE org_id=v_orgA;
          DELETE FROM users WHERE org_id=v_orgA;
          DELETE FROM organizations WHERE id=v_orgA;
          INSERT INTO _res VALUES ('delete_da_org','ok');
        EXCEPTION WHEN others THEN INSERT INTO _res VALUES ('delete_da_org', SQLSTATE); END;
        SELECT count(*) INTO v_n FROM platform_audit_log WHERE metadata->>'actor_label'='Ana da Org A';
        INSERT INTO _res VALUES ('trilha_sobreviveu_a_org', v_n::text);
      END $blk$;
    `)
  })

  it("`actor_type` é decidido pelo ponto de entrada, não por quem chama", () => {
    expect.assertions(2)
    expect(exigir(r, "orgA_como_org_admin")).toBe("1")
    expect(exigir(r, "orgA_como_platform_admin")).toBe("0")
  })

  it("`actor_label` é congelado no momento do ato", () => {
    expect.assertions(1)
    expect(exigir(r, "actor_label_orgA")).toBe("Ana da Org A")
  })

  it("(R7) apagar o usuário NÃO apaga a trilha, e o rótulo dele sobrevive", () => {
    // Sem `ON DELETE SET NULL`, este bloco teria estourado `23503` e nenhuma das 3 chaves
    // existiria — `exigir()` reprova nomeando, em vez de deixar `undefined` passar.
    expect.assertions(3)
    expect(exigir(r, "linhas_apos_apagar_usuario")).toBe("1")
    expect(exigir(r, "actor_label_apos_apagar_usuario")).toBe("Ana da Org A")
    expect(exigir(r, "actor_user_id_virou_nulo")).toBe("1")
  })

  it("a exceção do trigger é CIRÚRGICA — conteúdo continua imutável até para o dono", () => {
    // Contrapeso do `it` acima: sem estas três, a exceção poderia ter sido escrita como
    // "se TG_OP = UPDATE, deixa passar", e os testes de R7 ficariam verdes com a trilha
    // inteiramente forjável pelo dono. Reapontar o ator para OUTRO usuário também não é ação
    // referencial — só NULIFICAR é.
    expect.assertions(3)
    expect(exigir(r, "dono_altera_action")).toBe("P0020")
    expect(exigir(r, "dono_altera_metadata")).toBe("P0020")
    expect(exigir(r, "dono_reaponta_ator")).toBe("P0020")
  })

  it("apagar a ORG inteira não é bloqueado pela trilha — e a trilha sobrevive à org", () => {
    // É o que o teardown da 900-25 faz. Ele deriva as FKs bloqueantes de `pg_constraint`
    // EXCLUINDO as `SET NULL` (`confdeltype NOT IN ('c','n')`) — então, se esta FK bloqueasse,
    // ele nem saberia que precisava tratá-la, e a suíte dela quebraria sem diagnóstico.
    expect.assertions(2)
    expect(exigir(r, "delete_da_org")).toBe("ok")
    expect(exigir(r, "trilha_sobreviveu_a_org")).toBe("1")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
d("AC11 — detecção do risco aceito em C1", () => {
  let r: Record<string, string>

  beforeAll(async () => {
    r = await rodarBlocoTransacional(`
      ${PREPARAR_FIXTURE}
      DO $blk$
      DECLARE ${IDS} v_acao text; v_ant text; v_page text;
      BEGIN
        -- Pré-requisito estrutural: o page_id entra em metadata
        PERFORM _org_integration_write_secret(v_orgA,'meta_ads','tokA','{"page_id":"111111111"}',v_ana,'org_admin');
        SELECT metadata->>'page_id' INTO v_page FROM platform_audit_log
          WHERE org_id=v_orgA ORDER BY created_at DESC LIMIT 1;
        INSERT INTO _res VALUES ('page_id_em_metadata', COALESCE(v_page,'<ausente>'));

        -- Controle negativo do alerta 2: page_id NUNCA usado antes
        PERFORM _org_integration_write_secret(v_orgB,'meta_ads','tokB','{"page_id":"999999999"}',v_bruno,'org_admin');
        SELECT action INTO v_acao FROM platform_audit_log
          WHERE org_id=v_orgB AND metadata->>'page_id'='999999999' ORDER BY created_at DESC LIMIT 1;
        INSERT INTO _res VALUES ('controle_negativo_acao', COALESCE(v_acao,'<nenhuma>'));

        -- O cenário do sequestro: A libera o 111 trocando para 222, B reivindica o 111
        PERFORM _org_integration_write_secret(v_orgA,'meta_ads','tokA','{"page_id":"222222222"}',v_ana,'org_admin');
        PERFORM _org_integration_write_secret(v_orgB,'meta_ads','tokB','{"page_id":"111111111"}',v_bruno,'org_admin');
        SELECT action, metadata->>'org_id_anterior' INTO v_acao, v_ant FROM platform_audit_log
          WHERE org_id=v_orgB AND metadata->>'page_id'='111111111' ORDER BY created_at DESC LIMIT 1;
        INSERT INTO _res VALUES ('reatribuicao_acao', COALESCE(v_acao,'<nenhuma>'));
        INSERT INTO _res VALUES ('reatribuicao_org_anterior_eh_A', (v_ant = v_orgA::text)::text);

        -- actor_type distingue quem escreveu page_id (insumo do alerta 1)
        PERFORM _org_integration_write_secret(v_orgA,'meta_ads','tokA','{"page_id":"333333333"}',v_ana,'platform_admin');
        SELECT actor_type INTO v_acao FROM platform_audit_log
          WHERE metadata->>'page_id'='333333333' ORDER BY created_at DESC LIMIT 1;
        INSERT INTO _res VALUES ('actor_type_da_escrita_da_trifold', v_acao);
      END $blk$;
    `)
  })

  it("o `page_id` entra em `metadata` — sem isso nenhum dos dois alertas tem o que ler", () => {
    expect.assertions(1)
    expect(exigir(r, "page_id_em_metadata")).toBe("111111111")
  })

  it("Alerta 2: `page_id` que muda de org grava a ação distinta, com o `org_id` anterior", () => {
    expect.assertions(2)
    expect(exigir(r, "reatribuicao_acao")).toBe("org_integration.page_id_reassigned_cross_org")
    expect(exigir(r, "reatribuicao_org_anterior_eh_A")).toBe("true")
  })

  it("Alerta 2, controle negativo: `page_id` inédito NÃO grava reatribuição", () => {
    // O controle negativo é a metade que impede a detecção de ser um `true` constante — e ele é o
    // caso MAIS PRÓXIMO do positivo (mesma função, mesmo provider, só o valor é inédito).
    expect.assertions(1)
    expect(exigir(r, "controle_negativo_acao")).toBe("org_integration.secret_write")
  })

  it("Alerta 1: o `actor_type` gravado é o do ponto de entrada, e distingue os dois públicos", () => {
    expect.assertions(1)
    expect(exigir(r, "actor_type_da_escrita_da_trifold")).toBe("platform_admin")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
d("AC10 — `resolveOrgByMetaPage` contra o Postgres real", () => {
  let r: Record<string, string>

  beforeAll(async () => {
    // A régua da AC10 é sobre a CONSULTA, então este bloco reproduz o predicado exato do resolver
    // (`provider='meta_ads' AND config->>'page_id'=… AND status='connected'`) contra dados reais.
    r = await rodarBlocoTransacional(`
      ${PREPARAR_FIXTURE}
      DO $blk$
      DECLARE ${IDS} v_n int;
      BEGIN
        PERFORM _org_integration_write_secret(v_orgA,'meta_ads','tokA','{"page_id":"111111111"}',v_ana,'org_admin');
        -- escrita SEM promoção: é o ataque que a AC10 fecha
        SELECT count(*) INTO v_n FROM org_integrations
          WHERE provider='meta_ads' AND config->>'page_id'='111111111' AND status='connected';
        INSERT INTO _res VALUES ('resolve_sem_promover', v_n::text);
        SELECT count(*) INTO v_n FROM org_integrations
          WHERE provider='meta_ads' AND config->>'page_id'='111111111';
        INSERT INTO _res VALUES ('resolveria_sem_o_filtro', v_n::text);
        PERFORM _org_integration_mark_connected(v_orgA,'meta_ads',v_ana,'org_admin');
        SELECT count(*) INTO v_n FROM org_integrations
          WHERE provider='meta_ads' AND config->>'page_id'='111111111' AND status='connected';
        INSERT INTO _res VALUES ('resolve_depois_de_promover', v_n::text);
      END $blk$;
    `)
  })

  it("config escrito e NUNCA promovido não casa o predicado do resolver", () => {
    expect.assertions(1)
    expect(exigir(r, "resolve_sem_promover")).toBe("0")
  })

  it("a MESMA linha casaria sem o filtro — a diferença é o filtro, não a fixture", () => {
    // Controle que impede o teste acima de ficar verde por a fixture não ter page_id nenhum.
    expect.assertions(1)
    expect(exigir(r, "resolveria_sem_o_filtro")).toBe("1")
  })

  it("depois de `mark_connected` (que exige segredo gravado), a linha volta a resolver", () => {
    expect.assertions(1)
    expect(exigir(r, "resolve_depois_de_promover")).toBe("1")
  })
})
