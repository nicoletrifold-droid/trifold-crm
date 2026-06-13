"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Share, Plus, MoreVertical, Download, Globe } from "lucide-react"

type Platform = "ios" | "android"

export default function InstalarPWAPage() {
  const [platform, setPlatform] = useState<Platform>("ios")

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mx-auto max-w-md space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/broker"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-stone-100">Instalar o app</h1>
            <p className="text-xs text-gray-500 dark:text-stone-500">Adicionar à tela inicial</p>
          </div>
        </div>

        {/* App card */}
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
          <Image
            src="/icon-crm-192.png"
            alt="Trifold"
            width={56}
            height={56}
            className="rounded-2xl"
          />
          <div>
            <p className="font-semibold text-gray-900 dark:text-stone-100">Trifold CRM</p>
            <p className="text-xs text-gray-500 dark:text-stone-400">crm.trifold.eng.br</p>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-stone-600">Acesso rápido · Funciona offline · Notificações</p>
          </div>
        </div>

        {/* Platform tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-stone-900">
          <button
            onClick={() => setPlatform("ios")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              platform === "ios"
                ? "bg-white text-gray-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                : "text-gray-500 hover:text-gray-700 dark:text-stone-500 dark:hover:text-stone-300"
            }`}
          >
            iPhone / iPad
          </button>
          <button
            onClick={() => setPlatform("android")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              platform === "android"
                ? "bg-white text-gray-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                : "text-gray-500 hover:text-gray-700 dark:text-stone-500 dark:hover:text-stone-300"
            }`}
          >
            Android
          </button>
        </div>

        {/* Steps */}
        {platform === "ios" ? <IOSSteps /> : <AndroidSteps />}

        {/* Tips */}
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 space-y-2 dark:border-stone-800 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">Dicas</p>
          <ul className="space-y-1.5 text-sm text-gray-600 dark:text-stone-400">
            <li>• Após instalar, abra sempre pelo ícone na tela inicial para usar no modo app</li>
            <li>• Ative as notificações quando solicitado para receber alertas de novos leads</li>
            <li>• O app funciona mesmo sem conexão — exibe a última versão carregada</li>
          </ul>
        </div>

      </div>
    </div>
  )
}

function Step({ number, icon, title, description }: {
  number: number
  icon: React.ReactNode
  title: string
  description: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-bold text-orange-400">
          {number}
        </div>
        <div className="mt-1 w-px flex-1 bg-gray-200 dark:bg-stone-800" />
      </div>
      <div className="pb-6 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-stone-400">{icon}</span>
          <p className="font-semibold text-gray-900 dark:text-stone-100">{title}</p>
        </div>
        <div className="mt-1 text-sm text-gray-600 dark:text-stone-400">{description}</div>
      </div>
    </div>
  )
}

function IOSSteps() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-5 dark:border-stone-800 dark:bg-stone-900">
      <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">
        Safari — iPhone ou iPad
      </p>
      <div>
        <Step
          number={1}
          icon={<Globe className="h-4 w-4" />}
          title="Abra no Safari"
          description={
            <>
              Acesse <span className="font-medium text-gray-700 dark:text-stone-200">crm.trifold.eng.br</span> pelo Safari.
              Não funciona pelo Globe ou outros navegadores no iOS.
            </>
          }
        />
        <Step
          number={2}
          icon={<Share className="h-4 w-4" />}
          title="Toque em Compartilhar"
          description={
            <>
              Toque no ícone de compartilhar{" "}
              <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-stone-800 dark:text-stone-300">
                <Share className="h-3 w-3" /> Compartilhar
              </span>{" "}
              na barra inferior do Safari.
            </>
          }
        />
        <Step
          number={3}
          icon={<Plus className="h-4 w-4" />}
          title="Adicionar à Tela de Início"
          description={
            <>
              Role a lista e toque em{" "}
              <span className="font-medium text-gray-700 dark:text-stone-200">&ldquo;Adicionar à Tela de Início&rdquo;</span>.
              Confirme o nome e toque em <span className="font-medium text-gray-700 dark:text-stone-200">Adicionar</span>.
            </>
          }
        />
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-sm font-bold text-green-400">
              ✓
            </div>
          </div>
          <div className="pb-2">
            <p className="font-semibold text-gray-900 dark:text-stone-100">Pronto!</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-stone-400">
              O ícone do Trifold aparece na sua tela inicial. Abra por ele para ter a experiência completa de app.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AndroidSteps() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-5 dark:border-stone-800 dark:bg-stone-900">
      <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-stone-500">
        Globe — Android
      </p>
      <div>
        <Step
          number={1}
          icon={<Globe className="h-4 w-4" />}
          title="Abra no Globe"
          description={
            <>
              Acesse <span className="font-medium text-gray-700 dark:text-stone-200">crm.trifold.eng.br</span> pelo Globe.
            </>
          }
        />
        <Step
          number={2}
          icon={<MoreVertical className="h-4 w-4" />}
          title="Abra o menu do Globe"
          description={
            <>
              Toque nos três pontos{" "}
              <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-stone-800 dark:text-stone-300">
                <MoreVertical className="h-3 w-3" />
              </span>{" "}
              no canto superior direito do Globe.
            </>
          }
        />
        <Step
          number={3}
          icon={<Download className="h-4 w-4" />}
          title="Adicionar à tela inicial"
          description={
            <>
              Toque em{" "}
              <span className="font-medium text-gray-700 dark:text-stone-200">&ldquo;Adicionar à tela inicial&rdquo;</span>{" "}
              ou em <span className="font-medium text-gray-700 dark:text-stone-200">&ldquo;Instalar app&rdquo;</span> se aparecer um banner.
              Confirme tocando em <span className="font-medium text-gray-700 dark:text-stone-200">Adicionar</span>.
            </>
          }
        />
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-sm font-bold text-green-400">
              ✓
            </div>
          </div>
          <div className="pb-2">
            <p className="font-semibold text-gray-900 dark:text-stone-100">Pronto!</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-stone-400">
              O ícone do Trifold aparece na gaveta de apps e na tela inicial. Abra por ele para usar como app nativo.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
