import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";

export const metadata: Metadata = {
  title: "Seite nicht gefunden",
  description: "Die angeforderte Seite existiert nicht. Zurück zur Startseite von Tretu.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-center justify-center px-4 py-16 text-center">
      <PageTitle title="404" />
      <p className="mt-2 text-muted-foreground">
        Die angeforderte Seite wurde nicht gefunden.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded px-4 py-2 text-foreground underline hover:text-[var(--tretu-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)]"
      >
        Zur Startseite
      </Link>
    </div>
  );
}
