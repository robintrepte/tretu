import type { Metadata } from "next";

import { TrtAvatarGenerator } from "@/components/trt-avatar-generator";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "TRT Avatar Generator",
  description: "Erstelle dein eigenes TRT-Clan-Avatar: weißes TRT-Logo auf einem Farbverlauf deiner Wahl – als PNG zum Download.",
  path: "/trt",
  keywords: ["TRT", "Clan", "Avatar", "Generator", "Tretu", "Profilbild"],
});

export default function TrtAvatarPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <div className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">TRT Avatar Generator</h1>
        <p className="mt-3 text-muted-foreground">
          Vorlage wählen oder eigene Farben mischen – das Avatar wird direkt in deinem Browser erzeugt und lässt sich als PNG
          speichern, kopieren oder per Link teilen.
        </p>
      </div>
      <TrtAvatarGenerator />
    </div>
  );
}
