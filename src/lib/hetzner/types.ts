/** Client-safe shapes of the Hetzner catalog shown in the dashboard. */

export type ServerTypeOption = {
  name: string;
  description: string;
  cores: number;
  memoryGb: number;
  diskGb: number;
  dedicatedCpu: boolean;
  /** Gross prices (EUR) per location. */
  prices: Record<string, { hourly: number; monthly: number }>;
  availableIn: string[];
};

export type LocationOption = {
  name: string;
  city: string;
  country: string;
  networkZone: string;
};

export type HetznerOptions = {
  locations: LocationOption[];
  serverTypes: ServerTypeOption[];
  volumePricePerGbMonth: number | null;
};
