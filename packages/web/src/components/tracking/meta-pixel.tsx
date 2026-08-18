"use client"

import Script from "next/script"
import { PIXEL_ID, novoEventId } from "@web/lib/meta/pixel-events"

// Story 86-9 (AC1) — o Meta Pixel na página PÚBLICA do formulário.
//
// Montado SOMENTE em /formulario/[token]. O layout raiz não é tocado: o CRM
// autenticado não carrega Pixel — não há por que mandar ao Meta a navegação
// interna do corretor.
//
// Carregar cedo não é detalhe de performance: é o que faz o cookie `_fbp`
// existir a tempo de ser lido no primeiro POST do formulário. No baseline de
// 17/08/2026 o `fbp` aparecia em 9,2% dos eventos do dataset — a maior lacuna
// isolada da nota de correspondência.

/**
 * Pixel Base Code oficial do Meta, com o `init`/`PageView` já embutidos.
 *
 * Fica em `strategy="afterInteractive"`: o script é externo (`fbevents.js`) e
 * não pode competir com a renderização do formulário, que é o que o lead de
 * tráfego pago veio ver.
 */
export function MetaPixel() {
  // Sem env configurada, o componente simplesmente não existe. Nada de log:
  // ambiente de dev sem a variável é estado normal, não incidente.
  if (!PIXEL_ID) return null

  const pageViewEventId = novoEventId()

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView', {}, {eventID: '${pageViewEventId}'});
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
