"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SettingField, SettingValues } from "@/lib/games/catalog";

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Verbergen" : "Anzeigen"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function FieldLabel({ htmlFor, label, help }: { htmlFor?: string; label: string; help?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {help ? <p className="text-xs leading-relaxed text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function SettingsFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: SettingField[];
  values: SettingValues;
  onChange: (key: string, value: string | number | boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `setting-${field.key}`;
        const value = values[field.key] ?? field.default;

        if (field.type === "boolean") {
          return (
            <label
              key={field.key}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 dark:bg-muted/15"
            >
              <Checkbox
                id={id}
                checked={value === true}
                disabled={disabled}
                onCheckedChange={(checked) => onChange(field.key, checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium leading-none">{field.label}</span>
                {field.help ? <span className="block text-xs text-muted-foreground">{field.help}</span> : null}
              </span>
            </label>
          );
        }

        return (
          <div key={field.key} className={field.type === "list" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
            <FieldLabel htmlFor={id} label={`${field.label}${"required" in field && field.required ? " *" : ""}`} help={field.help} />
            {field.type === "select" ? (
              <Select value={String(value)} disabled={disabled} onValueChange={(v) => onChange(field.key, v)}>
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "number" ? (
              <Input
                id={id}
                type="number"
                min={field.min}
                max={field.max}
                value={String(value)}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value === "" ? "" : Number(e.target.value))}
              />
            ) : field.type === "password" ? (
              <PasswordInput
                id={id}
                value={String(value)}
                disabled={disabled}
                placeholder={field.generate ? "wird automatisch erzeugt" : undefined}
                onChange={(v) => onChange(field.key, v)}
              />
            ) : field.type === "list" ? (
              <Textarea
                id={id}
                rows={2}
                value={String(value)}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            ) : (
              <Input
                id={id}
                value={String(value)}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
