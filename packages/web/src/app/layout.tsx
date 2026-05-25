import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@web/components/theme-provider";
import { PwaInit } from "@web/components/pwa-init";
import { OfflineBadge } from "@web/components/offline-badge";
import { PwaUpdateToast } from "@web/components/pwa-update-toast";
import { IosInstallPrompt } from "@web/components/ios-install-prompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trifold CRM",
  description: "CRM imobiliário com agente IA Nicole",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Trifold CRM",
  },
  icons: {
    apple: [
      { url: "/icon-crm-192.png", sizes: "192x192" },
    ],
    other: [
      { rel: "apple-touch-startup-image", url: "/splash/crm-iphone-se-portrait.png",        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/splash/crm-iphone-14-portrait.png",        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/splash/crm-iphone-14-pro-portrait.png",    media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/splash/crm-iphone-15-portrait.png",        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/splash/crm-iphone-15-pro-max-portrait.png",media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", url: "/splash/crm-ipad-pro-11-portrait.png",      media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ea580c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} h-full min-h-full flex flex-col antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <OfflineBadge />
        <PwaUpdateToast />
        <IosInstallPrompt variant="crm" />
        <PwaInit />
      </body>
    </html>
  );
}
