---
name: meta-pixel-validation-two-channels
description: Validar Pixel+CAPI exige duas ferramentas — o painel Test Events do Meta e cego para eventos client-only (fbq nao carrega test_event_code)
metadata:
  type: feedback
---

Para provar que Pixel (browser) + CAPI (servidor) estao funcionando, precisa de **duas** fontes; nenhuma sozinha fecha a validacao.

| Metade | Ferramenta que prova | Nao prova |
|---|---|---|
| Servidor (CAPI) | Events Manager -> **Eventos de teste**, filtrado pelo `test_event_code` | qualquer evento client-only |
| Browser (`fbq`) | extensao oficial **Meta Pixel Helper** (lista os eventos como "Ativo") | recebimento pelo Meta |

**Why:** o SDK JS (`fbq()`) nao tem como carregar um `test_event_code` — o parametro so existe no payload da Conversions API. Logo o painel de Test Events filtrado por um codigo **jamais** exibe um evento disparado so pelo browser (ex.: `PageView`). Isso parece bug do codigo e nao e. Aconteceu na Story 86-11 (2026-08-26): 4 eventos apareceram no painel, `PageView` nunca — e estava perfeito.

**How to apply:**
- Antes de declarar "evento X nao esta disparando", confira se X tem metade servidor. Se for client-only, o painel de Test Events e a ferramenta errada; use o Pixel Helper (ou a aba Rede: `fbevents.js`, o arquivo de config do pixel, e requisicoes `tr` para `www.facebook.com`).
- O selo **"Desduplicado"** num evento do painel e a prova positiva de que o `event_id` do servidor casou com a copia do browser vinda pelo canal ao vivo (nao-teste). "Processado" = so a copia servidor chegou. Ler esse selo e mais forte do que contar eventos.
- O `test_event_code` **so** existe na UI do Events Manager; nao ha endpoint de Graph API que leia ou emita. Nao tem como automatizar essa etapa — sempre precisa de uma passada humana com login Meta. Nao inventar codigo (um codigo autogerado mantem os eventos fora do reporting, mas os torna invisiveis em qualquer painel — foi o que travou a primeira tentativa do T12).
- Depois da validacao, **sempre** remover a env de teste + redeploy e limpar os leads de teste. Ver [[epic86-capi-prod-state]] e [[landing-page-webhook]].
