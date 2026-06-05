"use client";

import { Check } from "lucide-react";

type SelectionCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onClick?: (event: React.MouseEvent) => void;
};

export function SelectionCheckbox({ checked, onChange, label, onClick }: SelectionCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        onClick?.(event);
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition duration-200 ${
        checked
          ? "border-sky-400 bg-sky-500/25 shadow-[0_0_12px_rgba(56,189,248,0.45)]"
          : "border-slate-600 bg-[#0f141c] hover:border-sky-400/60 hover:shadow-[0_0_10px_rgba(56,189,248,0.2)]"
      }`}
    >
      {checked ? <Check className="h-3 w-3 text-sky-300" strokeWidth={3} /> : null}
    </button>
  );
}
