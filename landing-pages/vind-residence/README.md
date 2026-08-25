# Landing Page — Vind Residence

Réplica standalone (HTML/CSS/JS puro, sem build) da landing de lançamento imobiliário.
Reconstruída a partir de https://vindresidence.com.br (que roda na plataforma GreatPages),
com o mesmo conteúdo, paleta e assets da Trifold.

## Estrutura

```
vind-residence/
├── index.html        # página completa (CSS + JS inline)
├── assets/           # imagens (renders, logo, favicon)
└── README.md
```

## Como visualizar

Abra `index.html` direto no navegador, ou sirva a pasta:

```bash
cd landing-pages/vind-residence
python3 -m http.server 8080
# http://localhost:8080
```

## Seções (na ordem)

1. **Header fixo** — logo + navegação + CTA (vira verde ao rolar)
2. **Hero** — render do prédio + headline + formulário de captação de lead
3. **O Empreendimento** — nome, status "em obras" e 4 stats (66,91 m², 2 suítes, tecnológico, entrada R$68mil)
4. **Lazer** — refúgio com chips de amenidades (piscina aquecida, pet place, pilates, spots bar, coworking)
5. **Galeria** — grid de renders com lightbox
6. **Localização** — foto de Maringá + endereço + pontos de interesse próximos
7. **Decorado** — banda CTA "agende sua visita"
8. **Sobre a Trifold** — texto institucional
9. **Footer** — navegação + copyright

## Reaproveitar para outro empreendimento

O tema e os comportamentos são parametrizados. Para clonar:

1. **Cores/fontes:** edite o bloco `:root` no topo do `<style>` em `index.html`.
2. **Textos:** todo o conteúdo está no HTML, marcado por comentários de seção (`<!-- ===== ... ===== -->`).
3. **Imagens:** substitua os arquivos em `assets/` mantendo os nomes semânticos
   (`hero-predio.jpg`, `amenidade-piscina.jpg`, `galeria-01..09`, `localizacao-*.jpg`, `logo-branco.png`, `favicon.png`).
4. **WhatsApp e captura de lead:** ajuste o objeto `CONFIG` no `<script>` no fim do arquivo:
   - `whatsapp` — número no formato DDI+DDD+telefone (só dígitos)
   - `leadEndpoint` — URL do webhook/CRM. Vazio = o form só simula sucesso e loga no console.

## Integração com o CRM

O formulário envia para `CONFIG.leadEndpoint` (POST JSON) → `api/lead.js` (proxy, guarda o
token fora do browser) → `POST /api/webhooks/landing-page` no trifold-crm, que cria o lead.

## Tracking Meta — Pixel + CAPI (Story 86-11)

| Onde | O quê |
|---|---|
| `index.html` `<head>` | Pixel base code + helpers vanilla de `visitor_id`, `fbc`/`fbp`/`fbclid`; dispara `PageView` (só browser) e `ViewContent` (browser + servidor) |
| `index.html` fim da página | `InitiateCheckout` no primeiro `focus` em `#nome`/`#whats`; no envio do form, gera dois `event_id` e dispara `Lead` + `CompleteRegistration` no Pixel quando o proxy confirma sucesso |
| `api/track.js` | Proxy de `ViewContent`/`InitiateCheckout` → `POST /api/webhooks/landing-page/track` |
| `api/lead.js` | Além do lead, repassa o bloco `tracking` e **preenche `client_ip`/`client_ua`** com os headers que só ele enxerga |

Pontos que não podem regredir:

- **IP e UA do visitante vêm dos headers do PROXY, nunca do CRM.** O CRM é chamado
  servidor-a-servidor e só veria o IP do datacenter da Vercel. Por isso os dois viajam no
  corpo, e o CRM dá precedência ao corpo sobre os próprios headers.
- **`TRACK_ENDPOINT` (no `<head>`) e `CONFIG.leadEndpoint` (no fim) apontam para o mesmo
  projeto Vercel.** Ao trocar o domínio, atualizar os dois.
- **A CSP vive em outro projeto** (`landing-pages/trifold-design-system/vercel.json`, que
  serve `trifold.eng.br/vindresidence/`). Sem `connect.facebook.net` em `script-src`,
  `www.facebook.com` em `img-src` e ambos em `connect-src`, o Pixel é bloqueado em silêncio.
- Nada de tracking pode derrubar o formulário: bloqueador de anúncios, `localStorage`
  bloqueado ou `/api/track` fora do ar são estados normais.

Testes: `landing-pages/vind-residence/api-proxy.test.ts` (roda com `pnpm vitest run` na raiz).
O arquivo fica fora de `api/` de propósito — tudo dentro de `api/` vira função serverless.

## Origem dos assets

Imagens baixadas de `pages.greatpages.com.br/www.vindresidence.com.br/` (assets da própria Trifold)
e renomeadas com nomes semânticos em `assets/`. Os nomes originais foram preservados na mesma pasta.
