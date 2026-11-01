"use client";

import { Check, ExternalLink, Send, UserMinus, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { FriendsList, UserRef } from "@/lib/platform/friends";
import { formatDate } from "@/lib/platform/format";
import { INVITE_TARGETS, type InviteTarget } from "@/lib/platform/invite-targets";
import { cn } from "@/lib/utils";

import { meApi, MeApiError } from "./api";
import { Avatar } from "./avatar";
import { useLocale, useT } from "./i18n-provider";

const nameOf = (u: UserRef) => u.name || u.username || "Tretu-Spieler";
const profileHref = (u: UserRef) => `/u/${encodeURIComponent(u.username ?? u.sub)}`;

export function FriendsClient({ initial }: { initial: FriendsList }) {
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState(initial);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<UserRef | null>(null);
  const [target, setTarget] = useState<InviteTarget>("play");
  const [removeFor, setRemoveFor] = useState<UserRef | null>(null);

  const errorText = useCallback(
    (error: unknown) => {
      const code = error instanceof MeApiError ? error.code : "error";
      const key = `friends.errors.${code}`;
      const text = t(key);
      return text === key ? t("common.error") : text;
    },
    [t]
  );

  const refresh = useCallback(async () => {
    setData(await meApi<FriendsList>("/friends"));
  }, []);

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    try {
      await work();
      await refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-semibold">{t("friends.addTitle")}</h2>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const to = username.trim();
            if (!to) return;
            void run("add", async () => {
              const res = await meApi<{ status: string }>("/friends", { method: "POST", body: { to } });
              setUsername("");
              toast.success(res.status === "accepted" ? t("friends.addAccepted") : t("friends.addSent", { name: to }));
            });
          }}
        >
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("friends.addPlaceholder")}
            aria-label={t("friends.addPlaceholder")}
            maxLength={64}
            autoComplete="off"
            className="h-10 sm:max-w-sm"
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy === "add" || !username.trim()}
            className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
          >
            <UserPlus aria-hidden />
            {t("friends.addButton")}
          </Button>
        </form>
      </section>

      {data.incoming.length > 0 || data.outgoing.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2">
          {data.incoming.length > 0 ? (
            <div className="rounded-2xl border border-[var(--tretu-accent)]/40 bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">{t("friends.incomingTitle")}</h2>
              <ul className="space-y-3">
                {data.incoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <Avatar name={nameOf(r.from)} src={r.from.picture} size="sm" />
                    <Link href={profileHref(r.from)} className="min-w-0 flex-1 truncate font-medium hover:text-[var(--tretu-accent)]">
                      {nameOf(r.from)}
                    </Link>
                    <Button
                      size="sm"
                      disabled={busy === r.id}
                      className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
                      onClick={() => run(r.id, () => meApi(`/friends/requests/${r.id}/accept`, { method: "POST", body: {} }).then(() => undefined))}
                    >
                      <Check aria-hidden />
                      {t("friends.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r.id}
                      onClick={() => run(r.id, () => meApi(`/friends/requests/${r.id}/decline`, { method: "POST", body: {} }).then(() => undefined))}
                    >
                      <X aria-hidden />
                      {t("friends.decline")}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.outgoing.length > 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">{t("friends.outgoingTitle")}</h2>
              <ul className="space-y-3">
                {data.outgoing.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <Avatar name={nameOf(r.to)} src={r.to.picture} size="sm" />
                    <Link href={profileHref(r.to)} className="min-w-0 flex-1 truncate font-medium hover:text-[var(--tretu-accent)]">
                      {nameOf(r.to)}
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === r.id}
                      onClick={() => run(r.id, () => meApi(`/friends/requests/${r.id}/decline`, { method: "POST", body: {} }).then(() => undefined))}
                    >
                      {t("friends.withdraw")}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("friends.listTitle")}</h2>
          <span className="text-sm text-muted-foreground">{t("friends.count", { count: data.friends.length })}</span>
        </div>
        {data.friends.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-muted-foreground">{t("friends.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {data.friends.map((f) => {
              const p = f.presence;
              const appName = p ? t(`apps.${p.app}`) : "";
              return (
                <li
                  key={f.sub}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-sm dark:bg-card/50",
                    p?.status === "playing" && "border-[var(--tretu-accent)]/40"
                  )}
                >
                  <Avatar name={nameOf(f)} src={f.picture} size="sm" online={p?.status ?? null} />
                  <div className="min-w-0 flex-1">
                    <Link href={profileHref(f)} className="block truncate font-medium hover:text-[var(--tretu-accent)]">
                      {nameOf(f)}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {p ? (
                        <span className={p.status === "playing" ? "text-[var(--tretu-accent)]" : "text-emerald-600 dark:text-emerald-400"}>
                          {p.status === "playing" ? t("friends.playingIn", { app: appName }) : t("friends.onlineIn", { app: appName })}
                          {p.activity ? ` · ${p.activity}` : ""}
                        </span>
                      ) : (
                        t("friends.friendsSince", { date: formatDate(locale, f.since) })
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p?.joinUrl ? (
                      <Button asChild size="sm" className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
                        <a href={p.joinUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink aria-hidden />
                          {t("friends.join")}
                        </a>
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setInviteFor(f)}>
                      <Send aria-hidden />
                      {t("friends.invite")}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t("friends.remove")} title={t("friends.remove")} onClick={() => setRemoveFor(f)}>
                      <UserMinus aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={Boolean(inviteFor)} onOpenChange={(open) => !open && setInviteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inviteFor ? t("friends.inviteTitle", { name: nameOf(inviteFor) }) : ""}</DialogTitle>
            <DialogDescription>{inviteFor ? t("friends.inviteText", { name: nameOf(inviteFor) }) : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(Object.keys(INVITE_TARGETS) as InviteTarget[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={target === key}
                onClick={() => setTarget(key)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors",
                  target === key
                    ? "border-[var(--tretu-accent)] bg-[var(--tretu-accent)]/10 text-[var(--tretu-accent)]"
                    : "border-border hover:border-[var(--tretu-accent)]/50"
                )}
              >
                {INVITE_TARGETS[key].label}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy === "invite"}
              className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
              onClick={() => {
                const friend = inviteFor;
                if (!friend) return;
                void run("invite", async () => {
                  await meApi("/invites", { method: "POST", body: { to: friend.sub, target } });
                  toast.success(t("friends.inviteSent", { name: nameOf(friend) }));
                  setInviteFor(null);
                });
              }}
            >
              <Send aria-hidden />
              {t("friends.inviteSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeFor)} onOpenChange={(open) => !open && setRemoveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("friends.remove")}</DialogTitle>
            <DialogDescription>{removeFor ? t("friends.removeConfirm", { name: nameOf(removeFor) }) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy === "remove"}
              onClick={() => {
                const friend = removeFor;
                if (!friend) return;
                void run("remove", async () => {
                  await meApi("/friends/remove", { method: "POST", body: { friendSub: friend.sub } });
                  toast.success(t("friends.removed", { name: nameOf(friend) }));
                  setRemoveFor(null);
                });
              }}
            >
              <UserMinus aria-hidden />
              {t("friends.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
