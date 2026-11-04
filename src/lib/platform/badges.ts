/**
 * Badge catalog + rules. Badges are awarded exactly once per user (primary key), their XP and
 * credits are one-time rewards. Add badges here; keys are permanent (Discord/TS mappings use them).
 */
export type Locale = "de" | "en";
export type Localized = Record<Locale, string>;

export type BadgeRule =
  /** A single stat reaches `gte`. */
  | { type: "stat"; key: string; gte: number }
  /** Sum of all stats ending in `suffix` (e.g. `.games.won` across apps) reaches `gte`. */
  | { type: "statSuffixSum"; suffix: string; gte: number }
  /** Tretu-Konto created on or before TRETU_EARLY_SUPPORTER_UNTIL (default 2027-03-31). */
  | { type: "earlySupporter" };

export type BadgeCategory = "play" | "saga" | "hollowmere" | "minecraft" | "city" | "community";

export type BadgeDefinition = {
  key: string;
  category: BadgeCategory;
  title: Localized;
  description: Localized;
  /** lucide-react icon name. */
  icon: string;
  xp: number;
  credits: number;
  rule: BadgeRule;
};

export const BADGES: readonly BadgeDefinition[] = [
  // Play
  {
    key: "play.first-win",
    category: "play",
    title: { de: "Erster Sieg", en: "First Victory" },
    description: { de: "Gewinne dein erstes Spiel in Tretu Play.", en: "Win your first game in Tretu Play." },
    icon: "Trophy",
    xp: 50,
    credits: 20,
    rule: { type: "stat", key: "play.games.won", gte: 1 },
  },
  {
    key: "play.regular",
    category: "play",
    title: { de: "Stammgast", en: "Regular" },
    description: { de: "Spiele 50 Partien in Tretu Play.", en: "Play 50 games in Tretu Play." },
    icon: "Gamepad2",
    xp: 100,
    credits: 25,
    rule: { type: "stat", key: "play.games.played", gte: 50 },
  },
  // Saga
  {
    key: "saga.worldbuilder",
    category: "saga",
    title: { de: "Weltenbauer", en: "Worldbuilder" },
    description: { de: "Erschaffe deine erste Welt in Saga.", en: "Create your first world in Saga." },
    icon: "Globe",
    xp: 50,
    credits: 10,
    rule: { type: "stat", key: "saga.worlds.created", gte: 1 },
  },
  {
    key: "saga.storyteller",
    category: "saga",
    title: { de: "Geschichtenerzähler", en: "Storyteller" },
    description: { de: "Spiele 100 Züge in Saga.", en: "Play 100 turns in Saga." },
    icon: "ScrollText",
    xp: 75,
    credits: 20,
    rule: { type: "stat", key: "saga.turns", gte: 100 },
  },
  {
    key: "saga.master-storyteller",
    category: "saga",
    title: { de: "Meistererzähler", en: "Master Storyteller" },
    description: { de: "Spiele 1.000 Züge in Saga.", en: "Play 1,000 turns in Saga." },
    icon: "Feather",
    xp: 200,
    credits: 50,
    rule: { type: "stat", key: "saga.turns", gte: 1000 },
  },
  {
    key: "saga.campaign-finisher",
    category: "saga",
    title: { de: "Kampagne vollendet", en: "Campaign Finisher" },
    description: { de: "Schließe eine Kampagne in Saga ab.", en: "Finish a campaign in Saga." },
    icon: "BookCheck",
    xp: 100,
    credits: 30,
    rule: { type: "stat", key: "saga.campaign.played", gte: 1 },
  },
  {
    key: "saga.campaign-veteran",
    category: "saga",
    title: { de: "Sagenheld", en: "Hero of Legends" },
    description: { de: "Schließe 5 Kampagnen in Saga ab.", en: "Finish 5 campaigns in Saga." },
    icon: "Swords",
    xp: 250,
    credits: 60,
    rule: { type: "stat", key: "saga.campaign.played", gte: 5 },
  },
  // Hollowmere
  {
    key: "hollowmere.first-win",
    category: "hollowmere",
    title: { de: "Erster Kampfsieg", en: "First Battle Won" },
    description: { de: "Gewinne deinen ersten Kampf in Hollowmere.", en: "Win your first battle in Hollowmere." },
    icon: "Shield",
    xp: 50,
    credits: 20,
    rule: { type: "stat", key: "hollowmere.games.won", gte: 1 },
  },
  {
    key: "hollowmere.befriender-1",
    category: "hollowmere",
    title: { de: "Erste Freundschaft", en: "First Companion" },
    description: { de: "Freunde dich mit deiner ersten Kreatur an.", en: "Befriend your first creature." },
    icon: "HeartHandshake",
    xp: 25,
    credits: 10,
    rule: { type: "stat", key: "hollowmere.creatures.befriended", gte: 1 },
  },
  {
    key: "hollowmere.befriender-10",
    category: "hollowmere",
    title: { de: "Kreaturenfreund", en: "Creature Friend" },
    description: { de: "Freunde dich mit 10 Kreaturen an.", en: "Befriend 10 creatures." },
    icon: "PawPrint",
    xp: 100,
    credits: 25,
    rule: { type: "stat", key: "hollowmere.creatures.befriended", gte: 10 },
  },
  {
    key: "hollowmere.befriender-50",
    category: "hollowmere",
    title: { de: "Hüter von Hollowmere", en: "Warden of Hollowmere" },
    description: { de: "Freunde dich mit 50 Kreaturen an.", en: "Befriend 50 creatures." },
    icon: "Sparkles",
    xp: 250,
    credits: 50,
    rule: { type: "stat", key: "hollowmere.creatures.befriended", gte: 50 },
  },
  // Minecraft
  {
    key: "minecraft.playtime-1h",
    category: "minecraft",
    title: { de: "Erste Schicht", en: "First Shift" },
    description: { de: "Spiele 1 Stunde auf dem Tretu-Minecraft-Server.", en: "Play 1 hour on the Tretu Minecraft server." },
    icon: "Pickaxe",
    xp: 25,
    credits: 10,
    rule: { type: "stat", key: "minecraft.playtime.minutes", gte: 60 },
  },
  {
    key: "minecraft.playtime-10h",
    category: "minecraft",
    title: { de: "Baumeister", en: "Master Builder" },
    description: { de: "Spiele 10 Stunden auf dem Tretu-Minecraft-Server.", en: "Play 10 hours on the Tretu Minecraft server." },
    icon: "Hammer",
    xp: 100,
    credits: 25,
    rule: { type: "stat", key: "minecraft.playtime.minutes", gte: 600 },
  },
  {
    key: "minecraft.playtime-100h",
    category: "minecraft",
    title: { de: "Blockveteran", en: "Block Veteran" },
    description: { de: "Spiele 100 Stunden auf dem Tretu-Minecraft-Server.", en: "Play 100 hours on the Tretu Minecraft server." },
    icon: "Mountain",
    xp: 300,
    credits: 75,
    rule: { type: "stat", key: "minecraft.playtime.minutes", gte: 6000 },
  },
  // Tretu City
  {
    key: "city.village",
    category: "city",
    title: { de: "Dorfgründer", en: "Village Founder" },
    description: { de: "Lass eine Stadt in Tretu City auf 300 Einwohner wachsen (Dorf).", en: "Grow a city in Tretu City to 300 residents (village)." },
    icon: "House",
    xp: 25,
    credits: 10,
    rule: { type: "stat", key: "city.milestone.1", gte: 1 },
  },
  {
    key: "city.town",
    category: "city",
    title: { de: "Kleinstadt", en: "Small Town" },
    description: { de: "Lass eine Stadt in Tretu City auf 1.200 Einwohner wachsen.", en: "Grow a city in Tretu City to 1,200 residents." },
    icon: "Building",
    xp: 50,
    credits: 20,
    rule: { type: "stat", key: "city.milestone.2", gte: 1 },
  },
  {
    key: "city.metropolis",
    category: "city",
    title: { de: "Großstadt", en: "Big City" },
    description: { de: "Lass eine Stadt in Tretu City auf 10.000 Einwohner wachsen.", en: "Grow a city in Tretu City to 10,000 residents." },
    icon: "Building2",
    xp: 150,
    credits: 40,
    rule: { type: "stat", key: "city.milestone.4", gte: 1 },
  },
  {
    key: "city.world-city",
    category: "city",
    title: { de: "Weltstadt", en: "World City" },
    description: { de: "Lass eine Stadt in Tretu City auf 60.000 Einwohner wachsen.", en: "Grow a city in Tretu City to 60,000 residents." },
    icon: "Landmark",
    xp: 300,
    credits: 75,
    rule: { type: "stat", key: "city.milestone.6", gte: 1 },
  },
  {
    key: "city.together",
    category: "city",
    title: { de: "Gemeinsam gebaut", en: "Built Together" },
    description: { de: "Baue in Tretu City zusammen mit anderen an einer Stadt.", en: "Build a city together with others in Tretu City." },
    icon: "Handshake",
    xp: 50,
    credits: 20,
    rule: { type: "stat", key: "city.coop.sessions", gte: 1 },
  },
  {
    key: "city.planner-10h",
    category: "city",
    title: { de: "Stadtplaner", en: "City Planner" },
    description: { de: "Spiele 10 Stunden Tretu City.", en: "Play Tretu City for 10 hours." },
    icon: "DraftingCompass",
    xp: 100,
    credits: 25,
    rule: { type: "stat", key: "city.playtime.minutes", gte: 600 },
  },
  // Community (cross-app)
  {
    key: "wins-10",
    category: "community",
    title: { de: "Siegesserie", en: "Winning Streak" },
    description: { de: "Gewinne insgesamt 10 Spiele in allen Tretu-Apps.", en: "Win 10 games across all Tretu apps." },
    icon: "Medal",
    xp: 100,
    credits: 25,
    rule: { type: "statSuffixSum", suffix: ".games.won", gte: 10 },
  },
  {
    key: "wins-50",
    category: "community",
    title: { de: "Champion", en: "Champion" },
    description: { de: "Gewinne insgesamt 50 Spiele in allen Tretu-Apps.", en: "Win 50 games across all Tretu apps." },
    icon: "Crown",
    xp: 250,
    credits: 50,
    rule: { type: "statSuffixSum", suffix: ".games.won", gte: 50 },
  },
  {
    key: "wins-250",
    category: "community",
    title: { de: "Legende", en: "Legend" },
    description: { de: "Gewinne insgesamt 250 Spiele in allen Tretu-Apps.", en: "Win 250 games across all Tretu apps." },
    icon: "Gem",
    xp: 500,
    credits: 100,
    rule: { type: "statSuffixSum", suffix: ".games.won", gte: 250 },
  },
  {
    key: "allrounder",
    category: "community",
    title: { de: "Allrounder", en: "All-Rounder" },
    description: { de: "Nutze mindestens 3 verschiedene Tretu-Apps.", en: "Use at least 3 different Tretu apps." },
    icon: "Shapes",
    xp: 150,
    credits: 50,
    rule: { type: "stat", key: "tretu.apps.used", gte: 3 },
  },
  {
    key: "friends-1",
    category: "community",
    title: { de: "Neue Freunde", en: "New Friends" },
    description: { de: "Füge deinen ersten Freund hinzu.", en: "Add your first friend." },
    icon: "UserPlus",
    xp: 25,
    credits: 10,
    rule: { type: "stat", key: "tretu.friends", gte: 1 },
  },
  {
    key: "friends-10",
    category: "community",
    title: { de: "Gesellig", en: "Sociable" },
    description: { de: "Habe 10 Freunde auf Tretu.", en: "Have 10 friends on Tretu." },
    icon: "Users",
    xp: 100,
    credits: 25,
    rule: { type: "stat", key: "tretu.friends", gte: 10 },
  },
  {
    key: "friends-25",
    category: "community",
    title: { de: "Netzwerker", en: "Networker" },
    description: { de: "Habe 25 Freunde auf Tretu.", en: "Have 25 friends on Tretu." },
    icon: "Network",
    xp: 200,
    credits: 50,
    rule: { type: "stat", key: "tretu.friends", gte: 25 },
  },
  {
    key: "early-supporter",
    category: "community",
    title: { de: "Früher Unterstützer", en: "Early Supporter" },
    description: {
      de: "Du warst von Anfang an dabei: Tretu-Konto in der Startphase erstellt.",
      en: "You were there from the start: Tretu account created during the launch phase.",
    },
    icon: "Rocket",
    xp: 100,
    credits: 100,
    rule: { type: "earlySupporter" },
  },
];

const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

export function getBadge(key: string): BadgeDefinition | undefined {
  return BADGE_BY_KEY.get(key);
}

export function earlySupporterCutoff(): Date {
  const raw = process.env.TRETU_EARLY_SUPPORTER_UNTIL?.trim();
  const parsed = raw ? new Date(raw.length === 10 ? `${raw}T23:59:59.999+01:00` : raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date("2027-03-31T23:59:59.999+02:00");
}

export type BadgeContext = {
  stats: Record<string, number>;
  /** Tretu-Konto creation time from auth (null if unknown). */
  accountCreatedAt: Date | null;
};

export type BadgeProgress = { current: number; target: number; done: boolean };

export function badgeProgress(badge: BadgeDefinition, ctx: BadgeContext): BadgeProgress {
  const rule = badge.rule;
  switch (rule.type) {
    case "stat": {
      const current = ctx.stats[rule.key] ?? 0;
      return { current: Math.min(current, rule.gte), target: rule.gte, done: current >= rule.gte };
    }
    case "statSuffixSum": {
      let sum = 0;
      for (const [key, value] of Object.entries(ctx.stats)) {
        if (key.endsWith(rule.suffix) && key.split(".").length === rule.suffix.split(".").length) sum += value;
      }
      return { current: Math.min(sum, rule.gte), target: rule.gte, done: sum >= rule.gte };
    }
    case "earlySupporter": {
      const done = Boolean(ctx.accountCreatedAt && ctx.accountCreatedAt.getTime() <= earlySupporterCutoff().getTime());
      return { current: done ? 1 : 0, target: 1, done };
    }
  }
}

/** Badges whose rule is satisfied and that are not in `earned`. */
export function newlyEarnedBadges(ctx: BadgeContext, earned: ReadonlySet<string>): BadgeDefinition[] {
  return BADGES.filter((b) => !earned.has(b.key) && badgeProgress(b, ctx).done);
}

export function localizeBadge(badge: BadgeDefinition, locale: Locale) {
  return {
    key: badge.key,
    title: badge.title[locale],
    description: badge.description[locale],
    icon: badge.icon,
    xp: badge.xp,
    credits: badge.credits,
  };
}
