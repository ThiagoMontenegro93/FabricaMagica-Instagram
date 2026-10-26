"use client";

import { useState } from "react";

/** Editor simples de lista de textos (itens inclusos, links de fotos). */
export function ListEditor({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <span className="label">{label}</span>
      <ul className="mb-2 space-y-1">
        {value.map((v, i) => (
          <li key={v} className="flex items-center justify-between gap-2 rounded-lg bg-field px-3 py-1.5 text-sm">
            <span className="truncate">{v}</span>
            {!disabled && (
              <button type="button" className="text-red-300 hover:text-red-200" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remover ${v}`}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex gap-2">
          <input
            className="field"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn-ghost px-4" onClick={add}>Adicionar</button>
        </div>
      )}
    </div>
  );
}
