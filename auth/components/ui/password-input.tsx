"use client"

import { Eye, EyeOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, type InputHTMLAttributes } from "react"
import { Input } from "@/components/ui/field"

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useTranslations("common")
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
