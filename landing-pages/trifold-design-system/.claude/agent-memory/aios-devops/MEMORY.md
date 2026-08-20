# Memory Index — trifold-design-system (aios-devops)

- [Validar deploy por diff vs live](feedback_validate_deploy_diff_vs_live.md) — pasta tem deploys concorrentes; diff byte a byte antes/depois + `vercel ls`, não contagem de texto
- [CSP precisa de frame-src p/ Google Maps](project_csp_frame_src_google_maps.md) — sem `frame-src https://www.google.com` o mapa de "Sobre Nós" é bloqueado sem aviso visível
- [Vercel static deploy: cache de edge stale](project_vercel_static_deploy_cdn_stale.md) — asset removido pode dar 200 logo após o deploy; revalidar antes de reportar falha
- [LCP: auto-hospedar terceiros](project_lcp_self_hosting_third_party.md) — React e Google Fonts já saíram do caminho crítico; não reintroduzir CDNs no `<head>`
- [Form de contato + Resend sandbox](project_resend_contact_form_sandbox.md) — `api/contact.js` dá 502 esperado: domínio trifold.eng.br não verificado no Resend
- [Domínio trifold.eng.br exige TXT](project_trifold_domain_vercel_txt_verification.md) — apex é de outra conta Vercel; todo hostname novo precisa de TXT em `_vercel`, e o DNS (Cloudflare) é de terceiro
- [Verificar env var da Vercel](reference_vercel_env_verify_plaintext.md) — `decrypt=true` na listagem não decripta; use `GET /v1/.../env/{envId}`
- [Âncoras cross-page nas .dc.html](project_home_dc_hash_anchor_client_render.md) — `#contato` falha silenciosamente (render client-side); scroll tem que ser refeito no `componentDidMount`
- [Render headless p/ validar deploy](reference_headless_render_validation.md) — Chrome `--dump-dom` trava; usar Playwright com `NODE_PATH=.../playwright@1.60.0/...`
- [View Transitions: at-rule, não meta tag](project_view_transitions_optin_atrule.md) — `@view-transition{navigation:auto}` ativo em prod; opt-in vale por par de docs, toda página nova precisa dele
