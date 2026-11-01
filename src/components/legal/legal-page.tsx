import type { ReactNode } from "react";

import { JsonLdWebPage } from "@/components/json-ld-webpage";
import { PageTitle, type PageIconName } from "@/components/page-title";

export type TocEntry = { id: string; title: string };

/** Frame of the legal pages: title, "Stand:" line, optional translation notice and table of contents. */
export function LegalPage({
  title,
  icon,
  path,
  description,
  updated,
  notice,
  toc,
  tocTitle,
  lang,
  children,
}: {
  title: string;
  icon: PageIconName;
  path: string;
  description: string;
  updated: string;
  notice?: ReactNode;
  toc?: TocEntry[];
  tocTitle?: string;
  lang: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <JsonLdWebPage name={title} description={description} path={path} lang={lang} />
      <PageTitle title={title} icon={icon} />
      <div className="max-w-3xl space-y-8" lang={lang}>
        <p className="text-sm font-medium text-muted-foreground">{updated}</p>
        {notice ? (
          <p className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            {notice}
          </p>
        ) : null}
        {toc?.length ? (
          <nav aria-label={tocTitle} className="rounded-xl border border-border/70 px-5 py-4">
            {tocTitle ? <p className="mb-2 text-sm font-semibold text-foreground">{tocTitle}</p> : null}
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground marker:text-muted-foreground/70">
              {toc.map((entry) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`} className="hover:text-[var(--tretu-accent)] hover:underline">
                    {entry.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 pt-1">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5">{children}</ol>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-[var(--tretu-accent)] underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}

/** Highlighted box, e.g. for the right to object (Art. 21 GDPR) that must be presented separately. */
export function Box({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--tretu-accent)]/40 bg-[var(--tretu-accent)]/5 px-4 py-3 text-foreground">
      {children}
    </div>
  );
}

/** Two-column overview table (purpose → legal basis etc.). */
export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-muted/50 text-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 align-top">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
