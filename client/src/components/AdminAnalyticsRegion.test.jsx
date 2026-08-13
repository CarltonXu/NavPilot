import { describe, expect, it, vi } from "vitest";
import { feature } from "topojson-client";
import chinaAdministrativeMap from "../data/chinaAdministrativeMap.js";
import worldCityIndex from "../data/worldCityIndex.js";
import {
  ADMIN_TREND_TICK_POSITIONS,
  adminTrendPointY,
  clampMapViewport,
  cityMarkerColor,
  fitMapBounds,
  isSmallMapLocation,
  localizedRegionName,
  mapZoomLimit,
  mapMarkerRadius,
  normalizeCityKey,
  zoomMapViewport,
} from "./AdminAnalytics.jsx";

describe("analytics region labels", () => {
  it("does not call Intl.DisplayNames for non-ISO map areas", () => {
    const displayNames = {
      of: vi.fn(() => {
        throw new RangeError("invalid_argument");
      }),
    };
    expect(localizedRegionName(displayNames, "-99", "Antarctica")).toBe(
      "Antarctica",
    );
    expect(displayNames.of).not.toHaveBeenCalled();
  });

  it("falls back safely when the runtime rejects a region code", () => {
    const displayNames = {
      of: vi.fn(() => {
        throw new RangeError("invalid_argument");
      }),
    };
    expect(localizedRegionName(displayNames, "CN", "China")).toBe("China");
  });

  it("keeps zoom and pan inside the map viewport", () => {
    expect(clampMapViewport({ scale: 20, x: 500, y: -9999 })).toEqual({
      scale: 8,
      x: 0,
      y: -3640,
    });
    expect(clampMapViewport({ scale: 0.2, x: -100, y: -100 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    expect(clampMapViewport({ scale: 30, x: -99999, y: -99999 }, 20)).toEqual({
      scale: 20,
      x: -18240,
      y: -9880,
    });
    expect(mapZoomLimit("world")).toBe(8);
    expect(mapZoomLimit("provinces")).toBe(12);
    expect(mapZoomLimit("cities")).toBe(20);
  });

  it("zooms around the pointer and fits selected country bounds", () => {
    expect(
      zoomMapViewport({ scale: 1, x: 0, y: 0 }, 2, { x: 240, y: 130 }),
    ).toEqual({ scale: 2, x: -240, y: -130 });
    const fitted = fitMapBounds(
      [
        [400, 180],
        [520, 320],
      ],
      6,
    );
    expect(fitted.scale).toBeGreaterThan(1);
    expect(fitted.scale).toBeLessThanOrEqual(6);
    const cityFitted = fitMapBounds(
      [
        [766.4, 138.2],
        [783.9, 150.1],
      ],
      14,
    );
    expect(cityFitted.scale).toBe(14);
  });

  it("adds readable markers for tiny map regions and scales them by traffic", () => {
    expect(
      isSmallMapLocation([
        [755.1, 251.7],
        [756, 252.3],
      ]),
    ).toBe(true);
    expect(
      isSmallMapLocation([
        [100, 100],
        [150, 140],
      ]),
    ).toBe(false);
    expect(mapMarkerRadius(100, 100)).toBeGreaterThan(mapMarkerRadius(1, 100));
  });

  it("normalizes city database names for the city-center index", () => {
    expect(normalizeCityKey("Xi’an")).toBe("xian");
    expect(normalizeCityKey("Jinan ")).toBe("jinan");
  });

  it("keeps city hotspot colors stable and differentiates city markers", () => {
    expect(cityMarkerColor("Jinan")).toBe(cityMarkerColor("Jinan "));
    expect(cityMarkerColor("Jinan")).not.toBe(cityMarkerColor("Beijing"));
  });

  it("maps GeoIP city names through province and prefecture boundaries", () => {
    const zibo = worldCityIndex.find((city) => city.countryCode === "CN" && city.name === "Zibo");
    expect(zibo).toMatchObject({
      label: "淄博市",
      provinceCode: "37",
      provinceLabel: "山东省",
      cityCode: "370300",
    });
    const provinces = feature(
      chinaAdministrativeMap,
      chinaAdministrativeMap.objects.provinces,
    ).features;
    const shandongCities = feature(
      chinaAdministrativeMap,
      chinaAdministrativeMap.objects.province_37,
    ).features;
    const beijing = feature(
      chinaAdministrativeMap,
      chinaAdministrativeMap.objects.province_11,
    ).features;
    expect(provinces.find((area) => area.properties.code === "37")?.properties.name).toBe("山东省");
    expect(shandongCities.find((area) => area.properties.code === "370300")?.properties.name).toBe("淄博市");
    expect(beijing).toHaveLength(1);
    expect(beijing[0].properties).toMatchObject({ code: "110000", name: "北京市" });
  });

  it("aligns trend points and zero values to the same plot grid", () => {
    expect(adminTrendPointY(0, 20)).toBe(ADMIN_TREND_TICK_POSITIONS.at(-1));
    expect(adminTrendPointY(20, 20)).toBe(ADMIN_TREND_TICK_POSITIONS[0]);
  });
});
