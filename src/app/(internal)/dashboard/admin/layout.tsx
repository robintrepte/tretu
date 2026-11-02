import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin/admin-nav";
import { getAccountAdmin } from "@/lib/admin/access";

// Personal data: always rendered per request, never cached or indexed.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("metaTitle"), robots: { index: false, follow: false, nocache: true } };
}

/** The central admin: only for the Tretu `admin` role (see src/lib/admin/access.ts). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getAccountAdmin())) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
