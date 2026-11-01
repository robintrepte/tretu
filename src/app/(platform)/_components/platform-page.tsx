import { CloudOff, LogIn, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/platform/current-user";

import type { PageContext } from "./page-context";
import { PlatformNav } from "./platform-nav";

/** Page frame for every platform page: heading, platform sub-navigation, content. */
export function PlatformPage({
  ctx,
  title,
  icon: Icon,
  intro,
  children,
  wide = false,
}: {
  ctx: PageContext;
  title: string;
  icon: LucideIcon;
  intro?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const profileHref = ctx.directory ? `/u/${encodeURIComponent(ctx.directory.username ?? ctx.directory.sub)}` : null;
  return (
    <div className="w-full px-4 py-10 md:px-6 md:py-12 lg:px-8">
      <div className={`mx-auto space-y-8 ${wide ? "max-w-[1200px]" : "max-w-[1000px]"}`}>
        <header className="space-y-6">
          <div className="flex items-center gap-4 text-foreground">
            <Icon className="size-10 shrink-0 opacity-90 md:size-12" strokeWidth={1.5} aria-hidden />
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{title}</h1>
          </div>
          {intro ? <p className="max-w-2xl text-base text-muted-foreground md:text-lg">{intro}</p> : null}
          {ctx.user && ctx.available ? <PlatformNav profileHref={profileHref} unread={ctx.unread} /> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function LoginRequired({ ctx, feature, path }: { ctx: PageContext; feature: string; path: string }) {
  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-[var(--tretu-accent)]/15 text-[var(--tretu-accent)]">
        <LogIn className="size-7" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{ctx.t("common.loginTitle")}</h2>
        <p className="mx-auto max-w-md text-muted-foreground">{ctx.t("common.loginText", { feature })}</p>
      </div>
      <Button asChild size="lg" className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
        <a href={loginUrl(path)}>{ctx.t("common.loginButton")}</a>
      </Button>
    </section>
  );
}

export function Unavailable({ ctx }: { ctx: PageContext }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
      <CloudOff className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-2xl font-semibold">{ctx.t("common.unavailableTitle")}</h2>
      <p className="max-w-md text-muted-foreground">{ctx.t("common.unavailableText")}</p>
    </section>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:p-6 ${className}`}>
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-xl font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
