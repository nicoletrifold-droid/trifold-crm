"use client"

export interface TemplateVariable {
  key: string
  label: string
  type: "text" | "url" | "date"
  required: boolean
}

interface Props {
  variables: TemplateVariable[]
  onChange: (vars: TemplateVariable[]) => void
}

export function VariableEditor({ variables, onChange }: Props) {
  const update = (key: string, field: keyof TemplateVariable, value: string | boolean) => {
    onChange(variables.map((v) => (v.key === key ? { ...v, [field]: value } : v)))
  }

  if (variables.length === 0) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800">
        <p className="text-xs text-stone-400">
          Nenhuma variável detectada. Use{" "}
          <code className="rounded bg-stone-200 px-1 text-stone-600">{"{{nome}}"}</code> no assunto
          ou corpo.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {variables.map((v) => (
        <div
          key={v.key}
          className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900"
        >
          <code className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-mono text-indigo-600">
            {`{{${v.key}}}`}
          </code>
          <input
            type="text"
            value={v.label}
            onChange={(e) => update(v.key, "label", e.target.value)}
            placeholder="Label (ex: Nome do destinatário)"
            className="block w-full rounded border border-stone-200 px-2 py-1 text-xs text-stone-700 placeholder-stone-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:placeholder-stone-500"
          />
          <select
            value={v.type}
            onChange={(e) => update(v.key, "type", e.target.value)}
            className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-600 focus:border-indigo-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
          >
            <option value="text">Texto</option>
            <option value="url">URL</option>
            <option value="date">Data</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={v.required}
              onChange={(e) => update(v.key, "required", e.target.checked)}
              className="rounded border-stone-300"
            />
            Obrigatório
          </label>
        </div>
      ))}
    </div>
  )
}
