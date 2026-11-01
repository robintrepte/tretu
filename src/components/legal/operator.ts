/**
 * Operator data exactly as published in the existing Tretu legal notices (tretu.de, Saga, Play).
 * Change it only here – Impressum, Datenschutz and AGB read from this file.
 */
export const OPERATOR = {
  brand: "Tretu",
  company: "FollowerX GmbH",
  street: "Bei St. Annen 2",
  zip: "20457",
  city: "Hamburg",
  country: { de: "Deutschland", en: "Germany" },
  registerCourt: { de: "Amtsgericht Hamburg", en: "Local Court (Amtsgericht) of Hamburg" },
  registerNumber: "HRB 166452",
  managingDirectors: "Robin Trepte, Lukas Tumpak",
  vatId: "DE343792884",
  phone: "+49 160 4522230",
  /** Spam protection as on the previous pages. */
  emailObfuscated: "business(at)tretu.de",
  email: "business@tretu.de",
  responsibleForContent: "Robin Trepte, Lukas Tumpak",
} as const;

/** "Stand" of all three legal documents. Update together with the texts. */
export const LEGAL_UPDATED = { de: "1. November 2026", en: "1 November 2026" } as const;

export const SERVICES = {
  hub: "tretu.de",
  auth: "auth.tretu.de",
  saga: "saga.tretu.de",
  play: "play.tretu.de",
  hollowmere: "hollowmere.tretu.de",
  minecraft: "mc.tretu.de",
  stats: "stats.tretu.de",
  status: "status.tretu.de",
} as const;
