# PO Agent Memory Index

- [Validation post PM review](feedback_validation_post_pm_review.md) — Always audit each AI from a PM review with file evidence, not just the Change Log
- [Validar stories de "cron duplicado" (Epic 75)](project_cron_claim_validation.md) — caminho suprimido precisa de log; helper claim-run é fail-open de propósito
- [Close-story with CONCERNS](feedback_close_story_concerns_acceptance.md) — Closing InReview→Done on a CONCERNS gate when stakeholder accepts the gap; what the closure Change Log must capture
- [Epic 900 — numeração e o trap do .vercelignore](project_epic900_numbering_vercel_trap.md) — 900-15 é da migração das rotas; import de packages/web para docs/ falha só na Vercel
- [Sibling-story reuse audit](feedback_validate_sibling_story_reuse_audit.md) — Story portada de outra: listar módulos da irmã + caçar literais da entidade antiga em arquivos clonados
- [landing-pages deploy asymmetry](project_landing_pages_deploy_asymmetry.md) — vind-residence is git-tracked and goes via PR; trifold-design-system is untracked, deploy-only
- [Epic 87 — campos reservados da 87-10](project_epic87_campos_reservados.md) — ofertas_do_sistema é cercado: nada escreve, nada lê; recalcular antes de pedir o campo
- [Epic 87 — fila de deploy parada](project_epic87_fila_parada.md) — 87-11/87-12 existem como PR aberto, não como arquivo em main; conferir `gh pr list`
- [Validar o conserto no mundo pós-fix](feedback_validar_conserto_no_mundo_pos_fix.md) — story com 2 consertos: rodar a fixture no papel com o conserto A já aplicado
- [Mitigação delegada a ferramenta](feedback_mitigacao_delegada_a_ferramenta.md) — story diz que o tsc/lint "pega sozinho"? rode a ferramenta, com contraprova
- [PR #517 carrega duas stories](project_87_17_87_18_pr517.md) — 87-17 Fatia 1 + 87-18, deploy único; a base é a branch, não main; 87-19 é P1
- [Abrir a analogia do AC](feedback_abrir_a_analogia_do_ac.md) — "mesmo tratamento de X" tem que ser conferido no arquivo; pode ser span inline, não coluna
- [AC10 / RESIDUAL_DECLARADO (Epic 900)](project_ac10_residual_declarado.md) — arquivo novo com o host nu deixa main vermelha; declarar, medir com fonte-scan, não afrouxar
- [AC com decisão em aberto](feedback_ac_com_decisao_em_aberto.md) — "decisão do @dev" não é AC: eu decido na validação, com motivo medido
