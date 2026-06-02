import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  AUTH_DISCORD_CLIENT_ID,
  AUTH_DISCORD_CLIENT_SECRET,
  AUTH_SECRET,
} from "@/lib/env/server";

export const authOptions: NextAuthOptions = {
  secret: AUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  logger: {
    error(code, metadata) {
      console.error("[next-auth][error]", code, metadata);
    },
    warn(code) {
      console.warn("[next-auth][warn]", code);
    },
    debug(code, metadata) {
      console.debug("[next-auth][debug]", code, metadata);
    },
  },
  providers: [
    DiscordProvider({
      clientId: AUTH_DISCORD_CLIENT_ID,
      clientSecret: AUTH_DISCORD_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ account, user }) {
      if (!account || account.provider !== "discord" || !account.providerAccountId) return false;

      const existing = db.select().from(users).where(eq(users.discordId, account.providerAccountId)).get();
      if (existing) {
        db.update(users)
          .set({
            displayName: user.name ?? existing.displayName,
            avatarUrl: user.image ?? existing.avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .run();
      } else {
        db.insert(users)
          .values({
            discordId: account.providerAccountId,
            displayName: user.name ?? "Unknown",
            avatarUrl: user.image ?? null,
          })
          .run();
      }

      return true;
    },
    async jwt({ token, account }) {
      if (account?.provider === "discord" && account.providerAccountId) {
        const dbUser = db.select().from(users).where(eq(users.discordId, account.providerAccountId)).get();
        if (dbUser) token.userId = String(dbUser.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.userId as string | undefined;
      return session;
    },
  },
};
