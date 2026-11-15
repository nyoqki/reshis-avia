import { describe, expect, it } from "vitest";
import routesCsv from "../../../../data/routes.csv?raw";
import forecastCsv from "../../../../data/seasonal_forecast.csv?raw";
import { DEPARTURES, FORECAST_PERIOD, ORIGIN, parseRoutesCsv } from "./departures";

describe("departures data", () => {
  it("TB-AC8: DEPARTURES equals parseRoutesCsv of data/routes.csv (route, code, city, base price, order)", () => {
    const parsed = parseRoutesCsv(routesCsv);
    expect(parsed).toHaveLength(5);
    expect(DEPARTURES).toEqual(parsed);
    expect(DEPARTURES[0]).toEqual({
      route: "MOW-AER",
      code: "AER",
      city: "Сочи",
      basePrice: 9000,
    });
    expect(DEPARTURES.map((d) => d.code)).toEqual(["AER", "LED", "KGD", "OVB", "MRV"]);
  });

  it("TB-AC8: FORECAST_PERIOD equals the min and max of the date column of data/seasonal_forecast.csv", () => {
    const [header, ...lines] = forecastCsv.trim().split(/\r?\n/);
    const col = header.split(",").indexOf("date");
    expect(col).toBeGreaterThanOrEqual(0);
    const dates = lines.map((line) => line.split(",")[col]).sort();
    expect(FORECAST_PERIOD).toEqual({ from: dates[0], to: dates[dates.length - 1] });
  });

  it("TB-AC8: ORIGIN is Москва MOW and every route starts with MOW-", () => {
    expect(ORIGIN).toEqual({ city: "Москва", code: "MOW" });
    for (const d of DEPARTURES) {
      expect(d.route.startsWith("MOW-")).toBe(true);
      expect(d.route).toBe(`${ORIGIN.code}-${d.code}`);
    }
  });
});
