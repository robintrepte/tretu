/**
 * Who may use the central admin (tretu.de/dashboard/admin): the Tretu `admin` role only (central admin spec,
 * "Roles"). That means a Tretu-Konto (`tretu_sub`) whose last seen `roles` claim contains `admin` **and** the
 * local `admin` role (granted from that claim by default, `TRETU_ADMIN_FROM_ROLES`). The game-server roles
 * (operator, manager) and local admins without the Tretu role never get the account admin.
 */
import { redirect } from "next/navigation";

import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { TRETU_ADMIN_ROLE } from "@/lib/auth/tretu-account";

/** The admin acting in the hub; `sub` is sent to auth as `actorSub` and stored in the audit log. */
export type AdminActor = { userId: number; sub: string; name: string };

export function isAccountAdmin(user: Pick<CurrentUser, "tretuSub" | "tretuRoles" | "roles"> | null | undefined): boolean {
  return Boolean(
    user?.tretuSub && user.tretuRoles.includes(TRETU_ADMIN_ROLE) && user.roles.includes(TRETU_ADMIN_ROLE)
  );
}

export function toActor(user: CurrentUser): AdminActor {
  return { userId: Number(user.id), sub: user.tretuSub as string, name: user.name };
}

/** The signed-in account admin, or null (anonymous, no Tretu admin role). */
export async function getAccountAdmin(): Promise<AdminActor | null> {
  const user = await getCurrentUser();
  return user && isAccountAdmin(user) ? toActor(user) : null;
}

/**
 * For every admin page (not only the layout: layouts are not re-rendered on client navigation, pages are).
 * Redirects everybody else to the dashboard.
 */
export async function requireAccountAdminPage(): Promise<AdminActor> {
  const actor = await getAccountAdmin();
  if (!actor) redirect("/dashboard");
  return actor;
}
