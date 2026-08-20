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

## Integração com o CRM (pendente / opcional)

O formulário hoje envia para `CONFIG.leadEndpoint` (POST JSON) se preenchido, senão apenas
registra no console. Para gravar em `leads` no trifold-crm, aponte `leadEndpoint` para um
endpoint/webhook que crie o lead com `source: "landing_vind_residence"`.

## Origem dos assets

Imagens baixadas de `pages.greatpages.com.br/www.vindresidence.com.br/` (assets da própria Trifold)
e renomeadas com nomes semânticos em `assets/`. Os nomes originais foram preservados na mesma pasta.
