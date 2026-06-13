import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Identifica o build pelo commit hash do Vercel (facilita rastrear qual versão está em produção).
  // Em desenvolvimento, usa 'dev'.
  generateBuildId: async () => process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",

  // Permite acesso ao dev server pela rede LAN local (workstation de dev).
  // PRESERVADO da configuração original — não remover.
  allowedDevOrigins: ["192.168.15.64"],

  // Tree-shaking agressivo para pacotes com barrel imports pesados.
  // - lucide-react: usado em 12+ client components
  // - recharts: usado em /dashboard/analytics
  // - @dnd-kit/*: pipeline + kanban
  // - @trifold/shared: workspace pkg, evita inflar bundle por re-exports
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@trifold/shared",
    ],
    // Permite uploads de foto/áudio em obra-mensagens sem bater no default de 1 MB.
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Tempos de revalidação do client-side router cache (Next 16).
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  // Mantém estes pacotes externos ao bundle do server lambda — resolução em runtime.
  // googleapis (~194 MB), google-auth-library, web-push e resend não devem ir para o bundle:
  // reduz cold-start em 30-50% nas rotas que os usam.
  serverExternalPackages: [
    "googleapis",
    "google-auth-library",
    "web-push",
    "resend",
    "@react-pdf/renderer",
  ],

  // next/image: habilita AVIF/WebP e whitelist de domínios remotos usados pelo app.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "scontent.fwhatsapp.net",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
      // Story 50-2 (Epic 50): permite thumbnails de criativos Meta servidos pelo CDN do Instagram
      {
        protocol: "https",
        hostname: "*.cdninstagram.com",
      },
    ],
    minimumCacheTTL: 60 * 60 * 24, // 24h
  },

  // Compressão gzip/brotli na resposta HTTP do server.
  compress: true,
  // Source maps de produção desligados — reduz tamanho do deploy e evita expor source.
  productionBrowserSourceMaps: false,
  // Remove header `X-Powered-By: Next.js`.
  poweredByHeader: false,

  // Remove console.log/info/debug em produção; preserva error/warn para observabilidade.
  compiler: {
    removeConsole: { exclude: ["error", "warn"] },
  },

  // Headers de cache:
  // - /_next/static/*: imutável por 1 ano (Next.js hasha nomes de chunks)
  // - /sw.js: nunca cache, escopo /cliente/
  async headers() {
    return [
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/cliente/",
          },
        ],
      },
    ];
  },

  // Erros de TS sempre bloqueiam build (default mas explicitado).
  // Nota: campo `eslint` foi removido do `NextConfig` no Next.js 16 — controle de
  // ESLint em build agora é feito via `next.config` ESLint plugin externo / CLI.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
