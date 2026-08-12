import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_TREND_TICK_POSITIONS,
  adminTrendPointY,
  clampMapViewport,
  fitMapBounds,
  isSmallMapLocation,
  localizedRegionName,
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

  it("aligns trend points and zero values to the same plot grid", () => {
    expect(adminTrendPointY(0, 20)).toBe(ADMIN_TREND_TICK_POSITIONS.at(-1));
    expect(adminTrendPointY(20, 20)).toBe(ADMIN_TREND_TICK_POSITIONS[0]);
  });
});
