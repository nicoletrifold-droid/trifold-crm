import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Política de Privacidade — Trifold Engenharia",
  description:
    "Saiba como a Trifold Engenharia coleta, usa e protege seus dados pessoais conforme a LGPD.",
}

export default function PoliticaDePrivacidadePage() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <header className="border-b border-stone-800/50 px-6 py-5">
        <Link href="/cliente" className="inline-flex items-center gap-3">
          <Image
            src="/logo-trifold.webp"
            alt="Trifold"
            width={36}
            height={36}
            className="rounded-sm"
          />
          <span className="text-[16px] font-bold uppercase tracking-widest text-white">
            Trifold
          </span>
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#F27A5E]">
          Trifold Engenharia
        </p>
        <h1 className="mb-2 text-4xl font-bold text-white">
          Política de Privacidade
        </h1>
        <p className="mb-10 text-sm text-stone-500">
          Última atualização: 04/05/2026
        </p>

        <div className="space-y-8 text-[15px] leading-relaxed text-stone-300">
          <p>
            A <strong className="text-white">Trifold Engenharia LTDA</strong>, CNPJ
            35.814.530/0001-58, leva a sério a privacidade dos seus dados e está comprometida com
            o cumprimento da Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).
          </p>
          <p>
            Esta política explica como coletamos, usamos, armazenamos e protegemos seus dados
            pessoais quando você utiliza o{" "}
            <strong className="text-white">Portal do Cliente</strong>.
          </p>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">
              1. Quem é o Controlador dos Dados
            </h2>
            <p>
              O controlador dos seus dados é a{" "}
              <strong className="text-white">Trifold Engenharia LTDA</strong>, com sede em Avenida
              Nildo Ribeiro da Rocha, 1337, Vila Marumby, Maringá/PR.
            </p>
            <ul className="mt-4 space-y-1 text-stone-300">
              <li>
                <strong className="text-stone-200">
                  Encarregado de Proteção de Dados (DPO):
                </strong>{" "}
                Alexandre Guimarães Nicolau
              </li>
              <li>
                <strong className="text-stone-200">
                  E-mail para questões sobre privacidade:
                </strong>{" "}
                contato@trifold.eng.br
              </li>
            </ul>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">2. Quais dados coletamos</h2>
            <p>
              Coletamos apenas os dados estritamente necessários para que você acompanhe sua obra:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-stone-200">Identificação:</strong> nome completo, e-mail,
                telefone
              </li>
              <li>
                <strong className="text-stone-200">Dados da obra:</strong> endereço da obra, dados
                técnicos do projeto, fases, fotos, documentos, mensagens trocadas com a equipe
              </li>
              <li>
                <strong className="text-stone-200">Dados de uso do portal:</strong> registros de
                acesso (data/hora de login)
              </li>
            </ul>
            <p className="mt-4 text-stone-400">
              Não coletamos dados sensíveis (saúde, religião, orientação política, biometria etc.).
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">
              3. Por que coletamos (finalidades)
            </h2>
            <p>Tratamos seus dados pessoais para:</p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>Permitir seu acesso ao portal e identificá-lo como cliente da obra</li>
              <li>
                Compartilhar com você o andamento da obra: fotos, fases, documentos e cronograma
              </li>
              <li>
                Manter comunicação sobre a obra (mensagens, atualizações, esclarecimentos)
              </li>
              <li>
                Cumprir obrigações contratuais decorrentes do contrato de prestação de serviços de
                engenharia
              </li>
              <li>
                Cumprir obrigações legais (ex: armazenamento de documentos técnicos pelo prazo
                legal)
              </li>
            </ul>
            <p className="mt-4 text-sm text-stone-400">
              A base legal para o tratamento é a execução do contrato firmado entre você e a
              Trifold Engenharia (art. 7º, V da LGPD), além de eventuais obrigações legais (art.
              7º, II) e o legítimo interesse (art. 7º, IX) para fins de melhoria do serviço.
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">4. Com quem compartilhamos</h2>
            <p>
              Seus dados não são vendidos nem comercializados. Compartilhamos apenas com:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                Equipe interna da Trifold Engenharia (engenheiros, arquitetos, administrativo) na
                medida necessária para a execução da obra
              </li>
              <li>
                Prestadores de serviço técnicos que sustentam o portal:
                <ul className="mt-2 list-[circle] space-y-1 pl-5 text-stone-400">
                  <li>Supabase (banco de dados e autenticação) — servidores na América do Sul/EUA</li>
                  <li>Vercel (hospedagem do portal) — servidores globais</li>
                </ul>
              </li>
              <li>Autoridades públicas quando exigido por lei ou determinação judicial</li>
            </ul>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">5. Por quanto tempo guardamos</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-stone-200">Durante a execução da obra:</strong> enquanto
                durar o contrato e o relacionamento
              </li>
              <li>
                <strong className="text-stone-200">Após o término da obra:</strong> por até 5
                anos, em razão de prazos legais (Código de Defesa do Consumidor, prescrição de
                ações cíveis)
              </li>
              <li>
                <strong className="text-stone-200">Documentos técnicos</strong> (ART, projetos,
                memoriais): pelo prazo de 20 anos, conforme normas do CREA/CAU
              </li>
            </ul>
            <p className="mt-4 text-stone-400">
              Após esses prazos, os dados são excluídos ou anonimizados.
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">
              6. Seus direitos como titular
            </h2>
            <p>Você pode, a qualquer momento:</p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>Confirmar a existência de tratamento dos seus dados</li>
              <li>Acessar os dados que temos sobre você</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar exclusão dos dados desnecessários ou tratados irregularmente</li>
              <li>Solicitar portabilidade dos dados a outro fornecedor</li>
              <li>Revogar o consentimento dado para tratamentos baseados em consentimento</li>
              <li>
                Reclamar à ANPD (Autoridade Nacional de Proteção de Dados) —{" "}
                <a
                  href="https://www.gov.br/anpd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F27A5E] underline underline-offset-2"
                >
                  anpd.gov.br
                </a>
              </li>
            </ul>
            <p className="mt-4 text-stone-400">
              Para exercer qualquer desses direitos, envie e-mail para{" "}
              <a
                href="mailto:contato@trifold.eng.br"
                className="text-[#F27A5E] underline underline-offset-2"
              >
                contato@trifold.eng.br
              </a>
              . Responderemos em até 15 dias.
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">7. Segurança</h2>
            <p>Adotamos medidas técnicas e organizacionais para proteger seus dados:</p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>Acesso ao portal protegido por senha individual</li>
              <li>
                Cada cliente vê apenas os dados da sua própria obra (isolamento de dados)
              </li>
              <li>Armazenamento em servidores seguros com criptografia em trânsito</li>
              <li>Backups regulares</li>
              <li>Acesso restrito aos dados apenas para colaboradores autorizados</li>
            </ul>
            <p className="mt-4 text-stone-400">
              Apesar dessas medidas, nenhum sistema é 100% imune a falhas. Em caso de incidente
              que possa afetar seus dados, comunicaremos você e a ANPD, conforme exige a LGPD.
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">8. Cookies</h2>
            <p>
              O portal utiliza cookies estritamente necessários para o funcionamento
              (autenticação, manutenção da sessão). Não usamos cookies de publicidade nem de
              rastreamento.
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">
              9. Alterações nesta Política
            </h2>
            <p>
              Esta política pode ser atualizada periodicamente. A versão vigente será sempre a
              publicada nesta página, com a data da última atualização no topo. Mudanças
              significativas serão comunicadas por e-mail.
            </p>
          </section>

          <hr className="border-stone-800" />

          <section>
            <h2 className="mb-4 text-xl font-bold text-white">10. Como nos contatar</h2>
            <address className="not-italic space-y-1 text-stone-300">
              <p>
                <strong className="text-white">Trifold Engenharia LTDA</strong>
              </p>
              <p>CNPJ: 35.814.530/0001-58</p>
              <p>Endereço: Avenida Nildo Ribeiro da Rocha, 1337 — Vila Marumby, Maringá/PR</p>
              <p>
                E-mail:{" "}
                <a
                  href="mailto:contato@trifold.eng.br"
                  className="text-[#F27A5E] underline underline-offset-2"
                >
                  contato@trifold.eng.br
                </a>
              </p>
              <p>Telefone: (44) 3222-9698</p>
            </address>
          </section>
        </div>
      </main>

      <footer className="mt-16 border-t border-stone-800/50 px-6 py-6 text-center text-xs text-stone-600">
        © {new Date().getFullYear()} Trifold Engenharia LTDA. Todos os direitos reservados.
      </footer>
    </div>
  )
}
