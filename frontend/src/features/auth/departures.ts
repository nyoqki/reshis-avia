export interface Departure {
  route: string;
  code: string;
  city: string;
  basePrice: number;
}

export const ORIGIN = { city: "Москва", code: "MOW" } as const;

/** The forecast window of data/seasonal_forecast.csv (min and max of its date column). */
export const FORECAST_PERIOD = { from: "2026-06-01", to: "2026-07-01" } as const;

/** Parses data/routes.csv: city is the part of `name` after " — ", code the part of `route` after "-". */
export function parseRoutesCsv(csv: string): Departure[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const cols = header.split(",");
  const at = (name: string) => cols.indexOf(name);
  const [iRoute, iName, iPrice] = [at("route"), at("name"), at("base_price")];
  return lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const f = line.split(",");
      const route = f[iRoute];
      return {
        route,
        code: route.slice(route.indexOf("-") + 1),
        city: f[iName].split(" — ").slice(1).join(" — "),
        basePrice: Number(f[iPrice]),
      };
    });
}

/** Kept in sync with data/routes.csv by departures.test.ts. */
export const DEPARTURES: readonly Departure[] = [
  { route: "MOW-AER", code: "AER", city: "Сочи", basePrice: 9000 },
  { route: "MOW-LED", code: "LED", city: "Санкт-Петербург", basePrice: 5500 },
  { route: "MOW-KGD", code: "KGD", city: "Калининград", basePrice: 7500 },
  { route: "MOW-OVB", code: "OVB", city: "Новосибирск", basePrice: 12000 },
  { route: "MOW-MRV", code: "MRV", city: "Минеральные Воды", basePrice: 8000 },
];
