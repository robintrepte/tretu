"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `datetime-local` input (the admin's own time) plus a hidden `untilIso` field with the same moment as ISO 8601,
 * so the server never has to guess the browser's time zone.
 */
export function UntilField({ label }: { label: string }) {
  const id = useId();
  const [iso, setIso] = useState("");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="datetime-local"
        data-testid="admin-lock-until"
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : null;
          setIso(d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
        }}
      />
      <input type="hidden" name="untilIso" value={iso} />
    </div>
  );
}

export function TextField({
  name,
  label,
  placeholder,
  defaultValue,
  required = true,
  type = "text",
  pattern,
  testId,
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  type?: "text" | "number";
  pattern?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        pattern={pattern}
        step={type === "number" ? 1 : undefined}
        data-testid={testId}
        autoComplete="off"
      />
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  testId,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        data-testid={testId}
        className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
