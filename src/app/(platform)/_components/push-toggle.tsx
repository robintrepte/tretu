"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { meApi } from "./api";
import { useT } from "./i18n-provider";

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "unconfigured";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const SW_URL = "/platform-sw.js";

export function PushToggle({ configured }: { configured: boolean }) {
  const t = useT("notifications");
  const tc = useT();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) return setState("unconfigured");
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setState("unsupported");
    }
    if (Notification.permission === "denied") return setState("denied");
    void navigator.serviceWorker
      .getRegistration(SW_URL)
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, [configured]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = await meApi<{ publicKey: string | null }>("/push");
      if (!publicKey) return setState("unconfigured");
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await meApi("/push", { method: "POST", body: subscription.toJSON() });
      setState("on");
    } catch {
      toast.error(tc("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const subscription = await reg?.pushManager.getSubscription();
      if (subscription) {
        await meApi("/push", { method: "DELETE", body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      toast.error(tc("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const message =
    state === "unsupported"
      ? t("pushUnsupported")
      : state === "denied"
        ? t("pushDenied")
        : state === "unconfigured"
          ? t("pushNotConfigured")
          : state === "on"
            ? t("pushEnabled")
            : t("pushText");

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:flex-row md:items-center md:p-6">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--tretu-accent)]/15 text-[var(--tretu-accent)]">
        <BellRing className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-lg font-semibold">{t("pushTitle")}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          <Link href="/einstellungen" className="underline-offset-4 hover:text-[var(--tretu-accent)] hover:underline">
            {t("settingsLink")}
          </Link>
        </p>
      </div>
      {state === "off" ? (
        <Button disabled={busy} onClick={enable} className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
          {t("pushEnable")}
        </Button>
      ) : state === "on" ? (
        <Button variant="outline" disabled={busy} onClick={disable}>
          {t("pushDisable")}
        </Button>
      ) : null}
    </section>
  );
}
