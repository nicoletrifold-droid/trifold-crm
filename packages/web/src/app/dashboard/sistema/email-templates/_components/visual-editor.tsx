"use client"

import { useRef, forwardRef, useImperativeHandle, useCallback } from "react"
import EmailEditor from "react-email-editor"
import type { EditorRef, EmailEditorProps } from "react-email-editor"

// ─── Trifold Brand Tokens ──────────────────────────────────────────────────

const SPACE_GROTESK_URL =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap"

const EDITOR_OPTIONS: EmailEditorProps["options"] = {
  appearance: {
    theme: "modern_light",
    panels: {
      tools: { dock: "right" },
    },
  },
  fonts: {
    showDefaultFonts: false,
    customFonts: [
      {
        label: "Space Grotesk",
        value: "'Space Grotesk', Arial, Helvetica, sans-serif",
        url: SPACE_GROTESK_URL,
      },
      { label: "Arial", value: "Arial, Helvetica, sans-serif", url: "" },
      { label: "Georgia", value: "Georgia, 'Times New Roman', serif", url: "" },
    ],
  },
  mergeTags: {
    nome: {
      name: "Nome do lead",
      value: "{{nome}}",
      sample: "João Silva",
    },
    email: {
      name: "Email",
      value: "{{email}}",
      sample: "joao@exemplo.com",
    },
    telefone: {
      name: "Telefone",
      value: "{{telefone}}",
      sample: "(44) 9 9999-9999",
    },
  },
  customCSS: [
    `@import url('${SPACE_GROTESK_URL}');`,
  ],
}

// ─── Default Trifold design ────────────────────────────────────────────────

const DEFAULT_DESIGN = {
  counters: { u_column: 5, u_row: 5 },
  body: {
    rows: [
      // Header
      {
        cells: [1],
        columns: [
          {
            contents: [
              {
                type: "image",
                values: {
                  src: {
                    url: "https://trifold.eng.br/wp-content/uploads/2025/07/logo-Trifold-laranja.webp",
                    width: 150,
                    height: 18,
                  },
                  altText: "Trifold Engenharia",
                  textAlign: "center",
                  action: {
                    name: "web",
                    values: { href: "https://trifold.eng.br", target: "_blank" },
                  },
                  containerPadding: "28px 24px 28px 24px",
                },
              },
            ],
            values: {
              backgroundColor: "#000000",
              padding: "0px",
              border: {},
              _meta: { htmlID: "u_column_1" },
            },
          },
        ],
        values: {
          displayCondition: null,
          columns: false,
          backgroundColor: "#000000",
          columnsBackgroundColor: "#000000",
          padding: "0px",
          hideDesktop: false,
          deletable: false,
          _meta: { htmlID: "u_row_1" },
        },
      },
      // Divider laranja
      {
        cells: [1],
        columns: [
          {
            contents: [
              {
                type: "divider",
                values: {
                  width: "100%",
                  border: {
                    borderTopWidth: "2px",
                    borderTopStyle: "solid",
                    borderTopColor: "#F27A5E",
                  },
                  containerPadding: "0px",
                },
              },
            ],
            values: {
              backgroundColor: "#000000",
              padding: "0px",
              border: {},
              _meta: { htmlID: "u_column_2" },
            },
          },
        ],
        values: {
          displayCondition: null,
          columns: false,
          backgroundColor: "#000000",
          columnsBackgroundColor: "#000000",
          padding: "0px",
          hideDesktop: false,
          deletable: false,
          _meta: { htmlID: "u_row_2" },
        },
      },
      // Conteúdo principal
      {
        cells: [1],
        columns: [
          {
            contents: [
              {
                type: "text",
                values: {
                  containerPadding: "48px 40px 12px 40px",
                  textAlign: "left",
                  lineHeight: "140%",
                  text:
                    "<p style=\"font-family:'Space Grotesk',Arial,sans-serif;font-size:11px;" +
                    "font-weight:600;color:#F27A5E;text-transform:uppercase;letter-spacing:2px;" +
                    "margin:0 0 16px 0;\">MENSAGEM EXCLUSIVA</p>" +
                    "<h1 style=\"font-family:'Space Grotesk',Arial,sans-serif;font-size:32px;" +
                    "font-weight:600;color:#FFFFFF;line-height:1.2;margin:0 0 20px 0;\">" +
                    "Olá, {{nome}}!</h1>" +
                    "<p style=\"font-family:'Space Grotesk',Arial,sans-serif;font-size:15px;" +
                    "font-weight:400;color:#BEBEBE;line-height:1.7;margin:0;\">" +
                    "Adicione aqui o conteúdo do seu email. " +
                    "Use a barra lateral para inserir blocos, imagens e botões de ação.</p>",
                },
              },
            ],
            values: {
              backgroundColor: "#000000",
              padding: "0px",
              border: {},
              _meta: { htmlID: "u_column_3" },
            },
          },
        ],
        values: {
          displayCondition: null,
          columns: false,
          backgroundColor: "#000000",
          columnsBackgroundColor: "#000000",
          padding: "0px",
          hideDesktop: false,
          _meta: { htmlID: "u_row_3" },
        },
      },
      // CTA
      {
        cells: [1],
        columns: [
          {
            contents: [
              {
                type: "button",
                values: {
                  containerPadding: "32px 40px 48px 40px",
                  href: {
                    name: "web",
                    values: { href: "https://trifold.eng.br", target: "_blank" },
                  },
                  buttonColors: {
                    color: "#000000",
                    backgroundColor: "#F27A5E",
                    hoverColor: "#000000",
                    hoverBackgroundColor: "#FFBC7D",
                  },
                  size: { autoWidth: true },
                  textAlign: "left",
                  lineHeight: "120%",
                  padding: "15px 32px",
                  borderRadius: "4px",
                  border: {},
                  text:
                    "<strong><span style=\"font-family:'Space Grotesk',Arial,sans-serif;" +
                    "font-size:13px;font-weight:600;text-transform:uppercase;" +
                    "letter-spacing:1px;\">SAIBA MAIS</span></strong>",
                },
              },
            ],
            values: {
              backgroundColor: "#000000",
              padding: "0px",
              border: {},
              _meta: { htmlID: "u_column_4" },
            },
          },
        ],
        values: {
          displayCondition: null,
          columns: false,
          backgroundColor: "#000000",
          columnsBackgroundColor: "#000000",
          padding: "0px",
          hideDesktop: false,
          _meta: { htmlID: "u_row_4" },
        },
      },
      // Footer
      {
        cells: [1],
        columns: [
          {
            contents: [
              {
                type: "divider",
                values: {
                  width: "100%",
                  border: {
                    borderTopWidth: "1px",
                    borderTopStyle: "solid",
                    borderTopColor: "#474747",
                  },
                  containerPadding: "0px",
                },
              },
              {
                type: "text",
                values: {
                  containerPadding: "24px 32px 32px 32px",
                  textAlign: "center",
                  lineHeight: "170%",
                  text:
                    "<p style=\"font-family:'Space Grotesk',Arial,sans-serif;font-size:11px;" +
                    "font-weight:400;color:#B4B4B4;margin:0 0 6px 0;\">" +
                    "Av. Arq. Nildo Ribeiro da Rocha, 1337 – Vila Marumby, Maringá – PR</p>" +
                    "<p style=\"font-family:'Space Grotesk',Arial,sans-serif;font-size:11px;" +
                    "font-weight:400;color:#B4B4B4;margin:0 0 12px 0;\">" +
                    "+55 (44) 3222-9698 · contato@trifold.eng.br</p>" +
                    "<p style=\"font-family:'Space Grotesk',Arial,sans-serif;font-size:10px;" +
                    "font-weight:400;color:#474747;margin:0;\">" +
                    "©2026 TRIFOLD Engenharia – Todos os direitos reservados.</p>",
                },
              },
            ],
            values: {
              backgroundColor: "#111111",
              padding: "0px",
              border: {},
              _meta: { htmlID: "u_column_5" },
            },
          },
        ],
        values: {
          displayCondition: null,
          columns: false,
          backgroundColor: "#111111",
          columnsBackgroundColor: "#111111",
          padding: "0px",
          hideDesktop: false,
          deletable: false,
          _meta: { htmlID: "u_row_5" },
        },
      },
    ],
    values: {
      textColor: "#FFFFFF",
      backgroundColor: "#000000",
      backgroundImage: {
        url: "",
        fullWidth: true,
        repeat: false,
        center: true,
        cover: false,
      },
      contentWidth: "600px",
      contentAlign: "center",
      fontFamily: {
        label: "Space Grotesk",
        value: "'Space Grotesk', Arial, Helvetica, sans-serif",
        url: SPACE_GROTESK_URL,
      },
      preheaderText: "",
      linkStyle: {
        body: true,
        linkColor: "#F27A5E",
        linkHoverColor: "#FFBC7D",
        linkUnderline: false,
        linkHoverUnderline: false,
        inherit: false,
      },
      _meta: { htmlID: "u_body" },
    },
  },
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface VisualEditorRef {
  exportHtml: () => Promise<{ html: string; design: object }>
}

interface Props {
  initialDesign?: object | null
  onReady?: () => void
  onHtmlChange?: (html: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────

export const VisualEditor = forwardRef<VisualEditorRef, Props>(
  function VisualEditor({ initialDesign, onReady, onHtmlChange }, ref) {
    const editorRef = useRef<EditorRef>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debounceRef = useRef<any>(null)

    useImperativeHandle(ref, () => ({
      exportHtml: () =>
        new Promise((resolve, reject) => {
          const editor = editorRef.current?.editor
          if (!editor) {
            reject(new Error("Editor não iniciado"))
            return
          }
          editor.exportHtml((data) => {
            resolve({ html: data.html, design: data.design as object })
          })
        }),
    }))

    const handleReady = useCallback(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (unlayer: any) => {
        const design = initialDesign ?? DEFAULT_DESIGN
        unlayer.loadDesign(design)

        if (onHtmlChange) {
          // Exporta HTML inicial após carregar o design
          unlayer.exportHtml((data: { html: string }) => onHtmlChange(data.html))

          // Atualiza preview a cada alteração (debounce 600ms)
          unlayer.addEventListener("design:updated", () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              unlayer.exportHtml((data: { html: string }) => onHtmlChange(data.html))
            }, 600)
          })
        }

        onReady?.()
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [initialDesign, onReady, onHtmlChange]
    )

    // flex-col faz o wrapper interno do react-email-editor (flex:1 1 0%)
    // crescer e o iframe preencher 100% da altura — sem isso o editor
    // trava em ~500px e o fundo do modal vaza como faixa escura
    return (
      <div className="flex h-full flex-col" style={{ minHeight: 640 }}>
        <EmailEditor
          ref={editorRef}
          onReady={handleReady}
          options={EDITOR_OPTIONS}
          style={{ height: "100%", minHeight: 640 }}
        />
      </div>
    )
  }
)
