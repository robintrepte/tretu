"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useTranslations("dashboard.common");
  const [copied, setCopied] = useState(false);
  const title = label ?? t("copy");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            toast.success(t("copied"));
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error(t("copyFailed"))
        );
      }}
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
    </Button>
  );
}
