"use client";

import { Check, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { meApi, MeApiError } from "./api";
import { useT } from "./i18n-provider";

export function AddFriendButton({ username }: { username: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "friends">("idle");
  if (state === "sent" || state === "friends") {
    return (
      <Button variant="outline" disabled>
        <Check aria-hidden />
        {state === "friends" ? t("profile.friendBadge") : t("profile.requestSent")}
      </Button>
    );
  }
  return (
    <Button
      className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const res = await meApi<{ status: string }>("/friends", { method: "POST", body: { to: username } });
          setState(res.status === "accepted" ? "friends" : "sent");
        } catch (error) {
          setState("idle");
          const code = error instanceof MeApiError ? error.code : "error";
          toast.error(t(`friends.errors.${code}`) === `friends.errors.${code}` ? t("common.error") : t(`friends.errors.${code}`));
        }
      }}
    >
      <UserPlus aria-hidden />
      {t("profile.addFriend")}
    </Button>
  );
}
