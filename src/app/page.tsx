import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { pageMetadata } from "@/lib/metadata";

const HomeShaderBg = dynamic(
  () => import("@/components/home-shader-bg").then((m) => ({ default: m.HomeShaderBg }))
);

export const metadata: Metadata = pageMetadata({
  title: "Tretu Gaming Community",
  description:
    "Willkommen bei Tretu – deine Gaming-Community. Teamspeak, Discord, Livestreams auf Twitch, YouTube-Videos, Minecraft-Map und Rankings. Von Gamern, für Gamer.",
  path: "/",
  keywords: ["Tretu", "Gaming Community", "Teamspeak", "Discord", "Twitch", "YouTube", "Minecraft"],
});

export default function Home() {
  return (
    <div className="relative">
      <section
        className="relative w-full overflow-visible"
        style={{
          minHeight: "calc(100vh - var(--header-height) - var(--footer-height))",
        }}
      >
        <HomeShaderBg />
        <div
          className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col items-center justify-center px-4 py-16 md:px-6"
          style={{
            minHeight: "calc(100vh - var(--header-height) - var(--footer-height))",
          }}
        >
          <PageTitle title="Tretu Gaming Community" variant="hero" />
          <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-12">
            <Link
              href="/teamspeak/"
              className="group flex flex-col items-center gap-3 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--tretu-accent)]"
            >
              <span className="flex h-[50px] w-[50px] items-center justify-center transition-transform duration-200 group-hover:scale-110">
                <Image src="/teamspeak.svg" alt="" width={50} height={50} className="h-full w-auto" priority />
              </span>
              <h2 className="text-lg font-semibold uppercase tracking-wide transition-all duration-200 group-hover:scale-105 group-hover:drop-shadow-md">
                TEAMSPEAK
              </h2>
            </Link>
            <Link
              href="/discord/"
              className="group flex flex-col items-center gap-3 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--tretu-accent)]"
            >
              <span className="flex h-[50px] w-[50px] items-center justify-center transition-transform duration-200 group-hover:scale-110">
                <Image src="/discord.svg" alt="" width={50} height={50} className="h-full w-auto" priority />
              </span>
              <h2 className="text-lg font-semibold uppercase tracking-wide transition-all duration-200 group-hover:scale-105 group-hover:drop-shadow-md">
                DISCORD
              </h2>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
