import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useI18n } from "../i18n/LocaleContext.jsx";
import Icon, { ContentIcon } from "./Icon.jsx";
import AdminPageHeader from "./AdminPageHeader.jsx";

function localizedDimension(t, group, value) {
  const key = `analytics.dimensions.${group}.${String(value || "other").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const translated = t(key);
  return translated === key ? value || t("analytics.unknown") : translated;
}

export function localizedRegionName(displayNames, code, fallback = "") {
  const normalized = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return fallback || normalized || "—";
  try {
    return displayNames?.of(normalized) || fallback || normalized;
  } catch {
    return fallback || normalized;
  }
}

const MAP_WIDTH = 960,
  MAP_HEIGHT = 520,
  MAP_MIN_SCALE = 1,
  MAP_MAX_SCALE = 8;
export function clampMapViewport(view) {
  const scale = Math.min(
    MAP_MAX_SCALE,
    Math.max(MAP_MIN_SCALE, Number(view?.scale) || 1),
  );
  return {
    scale,
    x: Math.min(
      0,
      Math.max(MAP_WIDTH - MAP_WIDTH * scale, Number(view?.x) || 0),
    ),
    y: Math.min(
      0,
      Math.max(MAP_HEIGHT - MAP_HEIGHT * scale, Number(view?.y) || 0),
    ),
  };
}
export function zoomMapViewport(
  view,
  nextScale,
  point = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
) {
  const current = clampMapViewport(view),
    scale = Math.min(MAP_MAX_SCALE, Math.max(MAP_MIN_SCALE, nextScale));
  const ratio = scale / current.scale;
  return clampMapViewport({
    scale,
    x: point.x - (point.x - current.x) * ratio,
    y: point.y - (point.y - current.y) * ratio,
  });
}
export function fitMapBounds(bounds, maxScale = MAP_MAX_SCALE) {
  if (!Array.isArray(bounds) || bounds.length !== 2)
    return clampMapViewport({ scale: 1, x: 0, y: 0 });
  const [[x0, y0], [x1, y1]] = bounds,
    width = Math.max(1, x1 - x0),
    height = Math.max(1, y1 - y0);
  const scale = Math.min(
    maxScale,
    Math.max(
      1,
      Math.min((MAP_WIDTH * 0.72) / width, (MAP_HEIGHT * 0.72) / height),
    ),
  );
  return clampMapViewport({
    scale,
    x: MAP_WIDTH / 2 - ((x0 + x1) / 2) * scale,
    y: MAP_HEIGHT / 2 - ((y0 + y1) / 2) * scale,
  });
}

export function isSmallMapLocation(bounds, threshold = 4) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return false;
  const [[x0, y0], [x1, y1]] = bounds;
  return Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) < threshold;
}

export function mapMarkerRadius(value, max) {
  const ratio = Math.max(0, Number(value) || 0) / Math.max(1, Number(max) || 1);
  return 4.5 + Math.sqrt(ratio) * 5.5;
}

const CITY_MARKER_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#22c55e",
  "#eab308",
  "#06b6d4",
];

export function cityMarkerColor(value) {
  const key = normalizeCityKey(value);
  let hash = 0;
  for (let index = 0; index < key.length; index += 1)
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return CITY_MARKER_COLORS[hash % CITY_MARKER_COLORS.length];
}

export function normalizeCityKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function detailAtPointer(detail, event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const pointerX =
    Number(event.clientX) > 0 ? event.clientX : rect.left + rect.width / 2;
  const pointerY = Number(event.clientY) > 0 ? event.clientY : rect.top;
  return { ...detail, pointerX, pointerY, below: pointerY < 150 };
}

function ChartTooltip({ active }) {
  if (!active) return null;
  return (
    <span
      className={`chart-hover-tooltip ${active.below ? "below" : ""}`}
      style={{
        "--tooltip-x": `${active.pointerX}px`,
        "--tooltip-y": `${active.pointerY}px`,
      }}
      role="tooltip"
    >
      <strong>{active.label}</strong>
      {active.metrics.map(([label, value]) => (
        <span key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
    </span>
  );
}

function niceAxisMax(value) {
  const raw = Math.max(1, Number(value) || 0),
    power = 10 ** Math.floor(Math.log10(raw)),
    normalized = raw / power;
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * power;
}

function formatAxisValue(value, locale, unit = "") {
  const number = Number(value) || 0;
  const compact =
    Math.abs(number) >= 1000
      ? new Intl.NumberFormat(locale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(number)
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
          number,
        );
  return `${compact}${unit ? ` ${unit}` : ""}`;
}

function axisDateLabels(data, locale) {
  if (!data.length) return [];
  const count = Math.min(5, data.length),
    indices = [
      ...new Set(
        Array.from({ length: count }, (_, index) =>
          Math.round((index * (data.length - 1)) / Math.max(1, count - 1)),
        ),
      ),
    ];
  return indices.map((index) => ({
    index,
    label: new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(`${data[index].day}T00:00:00`)),
  }));
}

function TimeBarChart({
  data,
  valueKey,
  unit = "",
  emptyLabel,
  metrics,
  color = "accent",
}) {
  const { locale } = useI18n(),
    [active, setActive] = useState(null),
    rawMax = Math.max(0, ...data.map((row) => Number(row[valueKey]) || 0)),
    axisMax = niceAxisMax(rawMax),
    ticks = [4, 3, 2, 1, 0].map((step) => (axisMax * step) / 4),
    dates = axisDateLabels(data, locale);
  const columns = Math.max(1, data.length),
    chartStyle = { "--time-columns": columns };
  return (
    <div className="interactive-chart time-chart-scroll">
      <div className="time-chart">
        <div className="time-chart-y-axis">
          {ticks.map((value) => (
            <span key={value}>{formatAxisValue(value, locale, unit)}</span>
          ))}
        </div>
        <div className="time-chart-main" style={chartStyle}>
          <div className="time-chart-plot">
            {ticks.map((value) => (
              <i className="time-chart-grid" key={value} />
            ))}
            <div
              className={`time-chart-bars ${color}`}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((row, index) => (
                <button
                  type="button"
                  key={row.day}
                  className={active?.key === row.day ? "active" : ""}
                  style={{
                    gridColumn: index + 1,
                    height: `${Math.max(row[valueKey] ? 3 : 0, ((Number(row[valueKey]) || 0) / axisMax) * 100)}%`,
                  }}
                  aria-label={`${row.day} · ${row[valueKey] || 0}`}
                  onPointerEnter={(event) =>
                    setActive(
                      detailAtPointer(
                        {
                          key: row.day,
                          label: new Intl.DateTimeFormat(locale, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }).format(new Date(`${row.day}T00:00:00`)),
                          metrics: metrics(row),
                        },
                        event,
                      ),
                    )
                  }
                  onPointerMove={(event) =>
                    active && setActive(detailAtPointer({ ...active }, event))
                  }
                  onFocus={(event) =>
                    setActive(
                      detailAtPointer(
                        { key: row.day, label: row.day, metrics: metrics(row) },
                        event,
                      ),
                    )
                  }
                  onBlur={() => setActive(null)}
                />
              ))}
            </div>
            {!rawMax && <span className="time-chart-empty">{emptyLabel}</span>}
          </div>
          <div className="time-chart-x-axis">
            {dates.map(({ index, label }) => (
              <span key={index} style={{ gridColumn: index + 1 }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ChartTooltip active={active} />
    </div>
  );
}

function Bars({ data, group }) {
  const { t, locale } = useI18n();
  const [active, setActive] = useState(null);
  const max = Math.max(...data.map((item) => item.value), 1);
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!data.length)
    return <div className="chart-empty">{t("analytics.noData")}</div>;
  return (
    <div className="interactive-chart">
      <div className="chart-bars" onMouseLeave={() => setActive(null)}>
        {data.map((item, index) => {
          const label = localizedDimension(t, group, item.name);
          const selected = {
            label,
            metrics: [
              [
                locale === "en" ? "Count" : "数量",
                Number(item.value).toLocaleString(locale),
              ],
              [
                locale === "en" ? "Share" : "占比",
                `${total ? ((item.value / total) * 100).toFixed(1) : 0}%`,
              ],
            ],
          };
          return (
            <div
              className={`chart-bar-row ${active?.key === item.name ? "active" : ""}`}
              key={`${item.name}-${item.value}`}
              role="img"
              aria-label={`${label} · ${item.value}`}
              tabIndex="0"
              onPointerEnter={(event) =>
                setActive(
                  detailAtPointer({ key: item.name, ...selected }, event),
                )
              }
              onPointerMove={(event) =>
                setActive(
                  detailAtPointer({ key: item.name, ...selected }, event),
                )
              }
              onFocus={(event) =>
                setActive(
                  detailAtPointer({ key: item.name, ...selected }, event),
                )
              }
              onBlur={() => setActive(null)}
            >
              <span>{label}</span>
              <div className="chart-bar-track">
                <i style={{ width: `${(item.value / max) * 100}%` }} />
              </div>
              <strong>{Number(item.value).toLocaleString(locale)}</strong>
            </div>
          );
        })}
      </div>
      <ChartTooltip active={active} />
    </div>
  );
}

function TopResources({ data, onSelect }) {
  const { locale } = useI18n();
  const text =
    locale === "en"
      ? {
          deleted: "Deleted",
          public: "Public",
          personal: "Personal",
          empty: "No description",
        }
      : {
          deleted: "已删除",
          public: "公共空间",
          personal: "个人空间",
          empty: "暂无描述",
        };
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="top-resource-list">
      {data.slice(0, 12).map((item, index) => (
        <div
          className="top-resource-row"
          key={`${item.id}-${index}`}
          tabIndex="0"
          role="button"
          onClick={() => onSelect?.(item)}
          onKeyDown={(event) =>
            (event.key === "Enter" || event.key === " ") && onSelect?.(item)
          }
        >
          <span className="top-resource-rank">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="top-resource-main">
            <strong>
              {item.name}
              {Boolean(item.deleted) && (
                <i className="deleted-resource-badge">
                  <Icon name="minus" size={10} />
                  {text.deleted}
                </i>
              )}
            </strong>
            <small>{item.url || text.empty}</small>
            <span>
              <i style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
          </span>
          <b>{item.value}</b>
          <div className="resource-hover-card">
            <header>
              <span>
                <ContentIcon value={item.icon} size={19} />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.scope === "personal" ? text.personal : text.public}
                </small>
              </div>
              {Boolean(item.deleted) && <i>{text.deleted}</i>}
            </header>
            <dl>
              <dt>URL</dt>
              <dd>{item.url || "—"}</dd>
              <dt>{locale === "en" ? "Description" : "描述"}</dt>
              <dd>{item.description || text.empty}</dd>
            </dl>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityHeatmap({ data }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const days =
    locale === "en"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const map = new Map(
    data.map((row) => [`${row.weekday}:${row.hour}`, row.value]),
  );
  const max = Math.max(...data.map((row) => row.value), 1);
  const total = data.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return (
    <div className="interactive-chart">
      <div className="activity-heatmap" onMouseLeave={() => setActive(null)}>
        <div className="heatmap-hours">
          <span />
          <div>
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </div>
        {days.map((day, weekday) => (
          <div className="heatmap-row" key={day}>
            <span>{day}</span>
            <div>
              {Array.from({ length: 24 }, (_, hour) => {
                const value = map.get(`${weekday}:${hour}`) || 0;
                const detail = {
                  key: `${weekday}:${hour}`,
                  label: `${day} ${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`,
                  metrics: [
                    [
                      locale === "en" ? "Visits" : "访问次数",
                      value.toLocaleString(locale),
                    ],
                    [
                      locale === "en" ? "Share" : "区间占比",
                      `${total ? ((value / total) * 100).toFixed(1) : 0}%`,
                    ],
                  ],
                };
                return (
                  <button
                    key={hour}
                    type="button"
                    aria-label={`${day} ${String(hour).padStart(2, "0")}:00 · ${value}`}
                    className={
                      active?.key === `${weekday}:${hour}` ? "active" : ""
                    }
                    onPointerEnter={(event) =>
                      setActive(detailAtPointer(detail, event))
                    }
                    onPointerMove={(event) =>
                      setActive(detailAtPointer(detail, event))
                    }
                    onFocus={(event) =>
                      setActive(detailAtPointer(detail, event))
                    }
                    onBlur={() => setActive(null)}
                    style={{
                      opacity: value ? 0.18 + (value / max) * 0.82 : 0.06,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <ChartTooltip active={active} />
    </div>
  );
}

function RegionMap({ data, cities = [], networks, coverage, cityCoverage, chinaCityCoverage }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState("world");
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [map, setMap] = useState({
    status: "loading",
    locations: [],
    cityLocations: [],
    provinceLocations: [],
    cityBoundaryGroups: {},
  });
  const [viewport, setViewportState] = useState({ scale: 1, x: 0, y: 0 }),
    [dragging, setDragging] = useState(false);
  const viewportRef = useRef(viewport),
    gestureRef = useRef({
      pointers: new Map(),
      centroid: null,
      distance: null,
    });
  const countries = data
    .filter((item) => item.name !== "unknown")
    .map((item) => ({ ...item, name: String(item.name || "").toUpperCase() }));
  const values = new Map(
    countries.map((item) => [item.name, Number(item.value || 0)]),
  );
  const cityValues = new Map(
    cities.map((item) => [`${item.countryCode}:${normalizeCityKey(item.name)}`, item]),
  );
  const chinaCities = cities.filter((item) => item.countryCode === "CN");
  const mappedCities = map.cityLocations
    .map((location) => ({
      ...location,
      data: cityValues.get(`${location.countryCode}:${normalizeCityKey(location.name)}`),
    }))
    .filter((location) => location.data);
  const provinceValues = new Map();
  for (const city of mappedCities) {
    if (!city.provinceCode) continue;
    const current = provinceValues.get(city.provinceCode) || {
      value: 0,
      uniqueVisitors: 0,
      cities: 0,
    };
    current.value += Number(city.data.value || 0);
    current.uniqueVisitors += Number(city.data.uniqueVisitors || 0);
    current.cities += 1;
    provinceValues.set(city.provinceCode, current);
  }
  const mappedProvinces = map.provinceLocations
    .map((location) => ({ ...location, data: provinceValues.get(location.code) }))
    .filter((location) => location.data);
  const selectedCityBoundaries = selectedProvince
    ? map.cityBoundaryGroups[selectedProvince.code] || []
    : [];
  const selectedMappedCities = selectedProvince
    ? mappedCities.filter((city) => city.provinceCode === selectedProvince.code)
    : selectedCountry ? mappedCities.filter((city) => city.countryCode === selectedCountry.code) : [];
  const selectedBoundaryCodes = new Set(selectedCityBoundaries.map((city) => city.code).filter(Boolean));
  const cityBoundaryValues = new Map(
    selectedMappedCities.map((city) => [city.cityCode, { ...city.data, location: city }]),
  );
  const max = Math.max(...countries.map((item) => Number(item.value || 0)), 1);
  const selectedCityMax = Math.max(
    ...selectedMappedCities.map((item) => Number(item.data.value || 0)),
    1,
  );
  const provinceMax = Math.max(...mappedProvinces.map((item) => Number(item.data.value || 0)), 1);
  const selectedCountryVisits = Number(values.get(selectedCountry?.code) || 0),
    selectedCountryKnownCities = selectedCountry
      ? cities.filter((item) => item.countryCode === selectedCountry.code)
        .reduce((total, item) => total + Number(item.value || 0), 0)
      : 0,
    selectedCountryCoverage = selectedCountry ? {
      known:selectedCountryKnownCities,
      unknown:Math.max(0, selectedCountryVisits - selectedCountryKnownCities),
      rate:selectedCountryVisits ? Math.round((selectedCountryKnownCities / selectedCountryVisits) * 1000) / 10 : 0,
    } : cityCoverage,
    activeCityCoverage = selectedCountry?.code === "CN"
      ? chinaCityCoverage || selectedCountryCoverage
      : selectedCountryCoverage,
    chinaVisits = Number(values.get("CN") || 0),
    mappedProvinceVisits = mappedProvinces.reduce((total,item)=>total+Number(item.data.value||0),0),
    provinceCoverage = {
      known:mappedProvinceVisits,
      unknown:Math.max(0,chinaVisits-mappedProvinceVisits),
      rate:chinaVisits ? Math.round((mappedProvinceVisits/chinaVisits)*1000)/10 : 0,
    },
    selectedCityShareTotal = selectedProvince
      ? Number(provinceValues.get(selectedProvince.code)?.value || 0)
      : Number(activeCityCoverage?.known || 0);
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const label = (code, fallback) => localizedRegionName(names, code, fallback);
  const select = (item, fallback) => ({
    key: item.name,
    label: `${label(item.name, fallback)} · ${item.name}`,
    metrics: [
      [
        locale === "en" ? "Visits" : "访问次数",
        Number(item.value).toLocaleString(locale),
      ],
      [
        locale === "en" ? "Known-region share" : "已识别地区占比",
        `${coverage?.known ? ((item.value / coverage.known) * 100).toFixed(1) : 0}%`,
      ],
    ],
  });
  const updateViewport = (next) => {
    const value = clampMapViewport(next);
    viewportRef.current = value;
    setViewportState(value);
  };
  const resetViewport = () => updateViewport({ scale: 1, x: 0, y: 0 });
  const elementPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * MAP_WIDTH) / rect.width,
      y: ((event.clientY - rect.top) * MAP_HEIGHT) / rect.height,
    };
  };
  const changeZoom = (
    factor,
    point = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
  ) =>
    updateViewport(
      zoomMapViewport(
        viewportRef.current,
        viewportRef.current.scale * factor,
        point,
      ),
    );
  const focusCountry = (code) => {
    const location = map.locations.find((item) => item.id === code);
    if (location?.bounds) updateViewport(fitMapBounds(location.bounds, 6));
  };
  const enterChinaCities = () => {
    if (!chinaCities.length) return;
    setMode("provinces");
    setSelectedCountry({ code:"CN", name:label("CN", "China") });
    setSelectedProvince(null);
    setActive(null);
    focusCountry("CN");
  };
  const enterCountryCities = (code, fallback) => {
    const countryCities = mappedCities.filter((city) => city.countryCode === code);
    if (!countryCities.length) return focusCountry(code);
    setMode("cities");
    setSelectedCountry({ code, name:label(code, fallback) });
    setSelectedProvince(null);
    setActive(null);
    focusCountry(code);
  };
  const enterProvinceCities = (location) => {
    setMode("cities");
    setSelectedProvince(location);
    setActive(null);
    if (location?.bounds) updateViewport(fitMapBounds(location.bounds, 7));
  };
  const returnToWorld = () => {
    setMode("world");
    setSelectedProvince(null);
    setSelectedCountry(null);
    setActive(null);
    resetViewport();
  };
  const goBack = () => {
    if (mode === "cities") {
      if (!selectedProvince) return returnToWorld();
      setMode("provinces");
      setSelectedProvince(null);
      setSelectedCountry({ code:"CN", name:label("CN", "China") });
      setActive(null);
      focusCountry("CN");
      return;
    }
    returnToWorld();
  };
  const focusCity = (location) => {
    const scale = Math.max(6, viewportRef.current.scale);
    updateViewport({
      scale,
      x: MAP_WIDTH / 2 - location.point[0] * scale,
      y: MAP_HEIGHT / 2 - location.point[1] * scale,
    });
  };
  const focusData = () => {
    if (mode === "cities") {
      if (!selectedMappedCities.length) return selectedProvince?.bounds && updateViewport(fitMapBounds(selectedProvince.bounds, 7));
      const xs = selectedMappedCities.map((item) => item.point[0]);
      const ys = selectedMappedCities.map((item) => item.point[1]);
      return updateViewport(
        fitMapBounds(
          [
            [Math.min(...xs) - 4, Math.min(...ys) - 4],
            [Math.max(...xs) + 4, Math.max(...ys) + 4],
          ],
          6,
        ),
      );
    }
    if (mode === "provinces") {
      if (!mappedProvinces.length) return focusCountry("CN");
      const bounds = mappedProvinces.reduce(
        (all, item) => [[Math.min(all[0][0], item.bounds[0][0]), Math.min(all[0][1], item.bounds[0][1])],[Math.max(all[1][0], item.bounds[1][0]), Math.max(all[1][1], item.bounds[1][1])]],
        [[...mappedProvinces[0].bounds[0]], [...mappedProvinces[0].bounds[1]]],
      );
      return updateViewport(fitMapBounds(bounds, 6));
    }
    const selected = map.locations.filter(
      (item) => item.id && values.get(item.id),
    );
    if (!selected.length) return resetViewport();
    const bounds = selected.reduce(
      (all, item) => [
        [
          Math.min(all[0][0], item.bounds[0][0]),
          Math.min(all[0][1], item.bounds[0][1]),
        ],
        [
          Math.max(all[1][0], item.bounds[1][0]),
          Math.max(all[1][1], item.bounds[1][1]),
        ],
      ],
      [[...selected[0].bounds[0]], [...selected[0].bounds[1]]],
    );
    updateViewport(fitMapBounds(bounds, 5));
  };
  useEffect(() => {
    resetViewport();
  }, [data]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("world-atlas/countries-50m.json"),
      import("topojson-client"),
      import("d3-geo"),
      import("country-code-lookup"),
      import("../data/worldCityIndex.js"),
      import("../data/chinaAdministrativeMap.js"),
    ])
      .then(([atlas, topo, d3, lookupModule, cityModule, administrativeModule]) => {
        if (cancelled) return;
        const topology = atlas.default || atlas;
        const lookup = lookupModule.default || lookupModule;
        const projection = d3.geoNaturalEarth1().fitExtent(
          [
            [8, 8],
            [952, 512],
          ],
          topo.feature(topology, topology.objects.countries),
        );
        const path = d3.geoPath(projection);
        const locations = topo
          .feature(topology, topology.objects.countries)
          .features.map((feature) => {
            const country = /^\d+$/.test(String(feature.id))
              ? lookup.byIso(Number(feature.id))
              : null;
            return {
              id: country?.iso2 || null,
              name:
                feature.properties?.name ||
                country?.country ||
                String(feature.id),
              path: path(feature),
              bounds: path.bounds(feature),
              centroid: path.centroid(feature),
            };
          })
          .filter((location) => location.path);
        const cityLocations = (cityModule.default || [])
          .map((city) => ({ ...city, point:projection([city.longitude, city.latitude]) }))
          .filter((city) => Array.isArray(city.point));
        const administrative = administrativeModule.default,
          featureLocations = (object) => topo.feature(administrative, object).features.map((feature) => ({
            code:String(feature.properties?.code || ""),
            name:feature.properties?.name || "",
            path:path(feature),
            bounds:path.bounds(feature),
            centroid:path.centroid(feature),
          })).filter((location) => location.path),
          provinceLocations = featureLocations(administrative.objects.provinces),
          cityBoundaryGroups = Object.fromEntries(
            Object.entries(administrative.objects)
              .filter(([key]) => key.startsWith("province_"))
              .map(([key, object]) => [key.slice("province_".length), featureLocations(object)]),
          );
        setMap({ status: "ready", locations, cityLocations, provinceLocations, cityBoundaryGroups });
      })
      .catch(() => !cancelled && setMap({ status: "error", locations: [], cityLocations: [], provinceLocations: [], cityBoundaryGroups: {} }));
    return () => {
      cancelled = true;
    };
  }, []);
  const pointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setActive(null);
    setDragging(true);
    const state = gestureRef.current,
      point = elementPoint(event);
    state.pointers.set(event.pointerId, point);
    const points = [...state.pointers.values()];
    state.centroid =
      points.length > 1
        ? {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
          }
        : point;
    state.distance =
      points.length > 1
        ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
        : null;
  };
  const pointerMove = (event) => {
    const state = gestureRef.current;
    if (!state.pointers.has(event.pointerId)) return;
    const point = elementPoint(event),
      previous = state.pointers.get(event.pointerId);
    state.pointers.set(event.pointerId, point);
    const points = [...state.pointers.values()],
      current = viewportRef.current;
    if (points.length === 1) {
      updateViewport({
        ...current,
        x: current.x + point.x - previous.x,
        y: current.y + point.y - previous.y,
      });
      state.centroid = point;
      return;
    }
    const centroid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      },
      distance = Math.max(
        1,
        Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
      );
    const ratio = state.distance ? distance / state.distance : 1,
      nextScale = Math.min(
        MAP_MAX_SCALE,
        Math.max(MAP_MIN_SCALE, current.scale * ratio),
      ),
      scaleRatio = nextScale / current.scale,
      previousCentroid = state.centroid || centroid;
    updateViewport({
      scale: nextScale,
      x: centroid.x - (previousCentroid.x - current.x) * scaleRatio,
      y: centroid.y - (previousCentroid.y - current.y) * scaleRatio,
    });
    state.centroid = centroid;
    state.distance = distance;
  };
  const pointerUp = (event) => {
    const state = gestureRef.current;
    state.pointers.delete(event.pointerId);
    const points = [...state.pointers.values()];
    state.centroid = points[0] || null;
    state.distance = null;
    if (!points.length) setDragging(false);
  };
  return (
    <div className="interactive-chart">
      <div className="region-map-summary">
        <span>
          <small>
            {mode === "cities"
              ? locale === "en"
                ? "Identified cities"
                : "已识别城市"
              : mode === "provinces"
                ? locale === "en" ? "Identified provinces" : "已识别省份"
              : locale === "en"
                ? "Identified regions"
                : "已识别国家/地区"}
          </small>
          <b>{mode === "cities" ? selectedMappedCities.length : mode === "provinces" ? mappedProvinces.length : countries.length}</b>
        </span>
        <span>
          <small>
            {mode === "cities"
              ? locale === "en" ? "City coverage" : "城市覆盖率"
              : mode === "provinces"
                ? locale === "en" ? "Province coverage" : "省份覆盖率"
              : locale === "en" ? "Region coverage" : "地区覆盖率"}
          </small>
          <b>{mode === "cities" ? activeCityCoverage?.rate || 0 : mode === "provinces" ? provinceCoverage.rate : coverage?.rate || 0}%</b>
        </span>
        <span>
          <small>
            {locale === "en" ? "Unidentified visits" : "未识别访问"}
          </small>
          <b>{Number((mode === "cities" ? activeCityCoverage : mode === "provinces" ? provinceCoverage : coverage)?.unknown || 0).toLocaleString(locale)}</b>
        </span>
      </div>
      <div className="region-map-wrap" onMouseLeave={() => setActive(null)}>
        <div
          className={`region-map ${dragging ? "dragging" : ""}`}
          aria-label={locale === "en" ? "Visitor source map" : "访问来源地图"}
        >
          <div
            className="region-map-controls"
            role="toolbar"
            aria-label={locale === "en" ? "Map controls" : "地图工具栏"}
          >
            {mode !== "world" && (
              <button type="button" className="map-back" onClick={goBack}>
                <Icon name="chevronLeft" size={13} />
                <span>{mode === "cities" && selectedProvince ? (locale === "en" ? "China" : "中国地图") : (locale === "en" ? "World" : "世界地图")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => changeZoom(1.35)}
              disabled={viewport.scale >= MAP_MAX_SCALE}
              aria-label={locale === "en" ? "Zoom in" : "放大地图"}
            >
              <Icon name="plus" size={13} />
            </button>
            <button
              type="button"
              onClick={() => changeZoom(1 / 1.35)}
              disabled={viewport.scale <= MAP_MIN_SCALE}
              aria-label={locale === "en" ? "Zoom out" : "缩小地图"}
            >
              <Icon name="minus" size={13} />
            </button>
            <button
              type="button"
              onClick={() => mode === "cities" ? (selectedProvince?.bounds ? updateViewport(fitMapBounds(selectedProvince.bounds, 7)) : focusCountry(selectedCountry?.code)) : mode === "provinces" ? focusCountry("CN") : resetViewport()}
              disabled={
                viewport.scale === 1 && viewport.x === 0 && viewport.y === 0
              }
              aria-label={locale === "en" ? "Reset map" : "恢复全球视图"}
            >
              <Icon name="refresh" size={13} />
            </button>
            <button
              type="button"
              className="fit-data"
              onClick={focusData}
              disabled={!countries.length || map.status !== "ready"}
            >
              <Icon name="target" size={13} />
              <span>
                {mode === "cities"
                  ? locale === "en" ? "Fit cities" : "聚焦城市"
                  : mode === "provinces"
                    ? locale === "en" ? "Fit provinces" : "聚焦省份"
                  : locale === "en" ? "Fit data" : "聚焦数据"}
              </span>
            </button>
            <b>{Math.round(viewport.scale * 100)}%</b>
          </div>
          {map.status === "ready" ? (
            <svg
              viewBox="0 0 960 520"
              role="img"
              aria-label={
                locale === "en"
                  ? "World map colored by visitor volume"
                  : "按访问量着色的世界地图"
              }
              onWheel={(event) => {
                event.preventDefault();
                changeZoom(
                  event.deltaY < 0 ? 1.18 : 1 / 1.18,
                  elementPoint(event),
                );
              }}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
              onDoubleClick={(event) => {
                if (event.target === event.currentTarget)
                  changeZoom(1.7, elementPoint(event));
              }}
            >
              <g
                transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
              >
                {map.locations.map((location) => {
                  const code = String(location.id || "").toUpperCase(),
                    value = code ? values.get(code) || 0 : 0,
                    item = { name: code, value };
                  const interactive = mode === "world" && Boolean(value);
                  const intensity = value
                    ? 0.28 + Math.sqrt(value / max) * 0.72
                    : 0;
                  const detail = select(item, location.name);
                  return (
                    <path
                      key={`${location.id || "area"}-${location.name}`}
                      d={location.path}
                      className={`${mode !== "world" ? (code === (selectedCountry?.code || "CN") ? "city-host" : "city-context") : value ? "has-data" : "no-data"} ${active?.key === code ? "active" : ""}`}
                      style={{ "--region-intensity": intensity }}
                      tabIndex={interactive ? 0 : undefined}
                      role={interactive ? "button" : undefined}
                      aria-hidden={interactive ? undefined : true}
                      aria-label={
                        interactive
                          ? `${label(code, location.name)} · ${value}`
                          : undefined
                      }
                      onClick={
                        mode === "world" && code === "CN" && value && chinaCities.length
                          ? (event) => {
                              event.stopPropagation();
                              enterChinaCities();
                            }
                          : mode === "world" && value && mappedCities.some((city) => city.countryCode === code)
                            ? (event) => { event.stopPropagation(); enterCountryCities(code, location.name); }
                          : undefined
                      }
                      onPointerEnter={
                        interactive && !dragging
                          ? (event) => setActive(detailAtPointer(detail, event))
                          : undefined
                      }
                      onPointerMove={
                        interactive && !dragging
                          ? (event) => setActive(detailAtPointer(detail, event))
                          : undefined
                      }
                      onPointerLeave={interactive ? () => setActive(null) : undefined}
                      onFocus={
                        interactive
                          ? (event) => setActive(detailAtPointer(detail, event))
                          : undefined
                      }
                      onBlur={interactive ? () => setActive(null) : undefined}
                      onDoubleClick={
                        interactive
                          ? (event) => {
                              event.stopPropagation();
                              focusCountry(code);
                            }
                          : undefined
                      }
                    />
                  );
                })}
                {mode === "provinces" && map.provinceLocations.map((location) => {
                  const value = Number(provinceValues.get(location.code)?.value || 0),
                    intensity = value ? 0.3 + Math.sqrt(value / provinceMax) * 0.7 : 0,
                    detail = {
                      key:`province-${location.code}`,
                      label:location.name,
                      metrics:[[locale === "en" ? "Visits" : "访问次数", value.toLocaleString(locale)],[locale === "en" ? "Cities" : "已识别城市", Number(provinceValues.get(location.code)?.cities || 0).toLocaleString(locale)]],
                    };
                  return <path
                    key={`province-${location.code}-${location.name}`}
                    d={location.path}
                    className={`province-area ${value ? "has-data" : "no-data"} ${active?.key === detail.key ? "active" : ""}`}
                    style={{ "--region-intensity":intensity, "--city-color":cityMarkerColor(location.code) }}
                    role={value ? "button" : undefined}
                    tabIndex={value ? 0 : undefined}
                    aria-label={value ? `${location.name} · ${value}` : undefined}
                    onClick={value ? (event) => { event.stopPropagation(); enterProvinceCities(location); } : undefined}
                    onPointerEnter={value && !dragging ? (event) => setActive(detailAtPointer(detail,event)) : undefined}
                    onPointerMove={value && !dragging ? (event) => setActive(detailAtPointer(detail,event)) : undefined}
                    onPointerLeave={value ? () => setActive(null) : undefined}
                    onFocus={value ? (event) => setActive(detailAtPointer(detail,event)) : undefined}
                    onBlur={value ? () => setActive(null) : undefined}
                  />;
                })}
                {mode === "cities" && selectedCityBoundaries.map((location) => {
                  const data = cityBoundaryValues.get(location.code),
                    value = Number(data?.value || 0),
                    intensity = value ? 0.34 + Math.sqrt(value / selectedCityMax) * 0.66 : 0,
                    color = cityMarkerColor(location.code || location.name),
                    detail = {
                      key:`boundary-${location.code || location.name}`,
                      label:location.name,
                      metrics:[[locale === "en" ? "Visits" : "访问次数",value.toLocaleString(locale)],[locale === "en" ? "Visitors" : "独立访客",Number(data?.uniqueVisitors || 0).toLocaleString(locale)],[locale === "en" ? "Current-level share" : "当前层级占比",`${selectedCityShareTotal ? ((value / selectedCityShareTotal) * 100).toFixed(1) : 0}%`]],
                    };
                  return <path
                    key={`boundary-${location.code || location.name}`}
                    d={location.path}
                    className={`city-boundary ${value ? "has-data" : "no-data"} ${active?.key === detail.key ? "active" : ""}`}
                    style={{ "--region-intensity":intensity, "--city-color":color }}
                    role={value ? "button" : undefined}
                    tabIndex={value ? 0 : undefined}
                    aria-label={value ? `${location.name} · ${value}` : undefined}
                    onClick={value ? (event) => { event.stopPropagation(); data?.location && focusCity(data.location); } : undefined}
                    onPointerEnter={value && !dragging ? (event) => setActive(detailAtPointer(detail,event)) : undefined}
                    onPointerMove={value && !dragging ? (event) => setActive(detailAtPointer(detail,event)) : undefined}
                    onPointerLeave={value ? () => setActive(null) : undefined}
                    onFocus={value ? (event) => setActive(detailAtPointer(detail,event)) : undefined}
                    onBlur={value ? () => setActive(null) : undefined}
                  />;
                })}
              </g>
              <g className="region-map-markers">
                {mode === "world" && map.locations.map((location) => {
                  const code = String(location.id || "").toUpperCase(),
                    value = code ? values.get(code) || 0 : 0;
                  if (
                    !value ||
                    !isSmallMapLocation(location.bounds) ||
                    !Array.isArray(location.centroid)
                  )
                    return null;
                  const item = { name: code, value },
                    detail = select(item, location.name),
                    cx = viewport.x + location.centroid[0] * viewport.scale,
                    cy = viewport.y + location.centroid[1] * viewport.scale;
                  return (
                    <circle
                      key={`marker-${code}`}
                      cx={cx}
                      cy={cy}
                      r={mapMarkerRadius(value, max)}
                      className={active?.key === code ? "active" : ""}
                      role="button"
                      tabIndex="0"
                      aria-label={`${label(code, location.name)} · ${value}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        mappedCities.some((city) => city.countryCode === code)
                          ? enterCountryCities(code, location.name)
                          : focusCountry(code);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerEnter={(event) =>
                        !dragging && setActive(detailAtPointer(detail, event))
                      }
                      onPointerMove={(event) =>
                        !dragging && setActive(detailAtPointer(detail, event))
                      }
                      onPointerLeave={() => setActive(null)}
                      onFocus={(event) =>
                        setActive(detailAtPointer(detail, event))
                      }
                      onBlur={() => setActive(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          mappedCities.some((city) => city.countryCode === code)
                            ? enterCountryCities(code, location.name)
                            : focusCountry(code);
                        }
                      }}
                    />
                  );
                })}
                {mode === "cities" && selectedMappedCities.filter((location) => !location.cityCode || !selectedBoundaryCodes.has(location.cityCode)).map((location) => {
                  const value = Number(location.data.value || 0);
                  const cx = viewport.x + location.point[0] * viewport.scale,
                    cy = viewport.y + location.point[1] * viewport.scale;
                  const radius = mapMarkerRadius(value, selectedCityMax) + 1,
                    color = cityMarkerColor(location.name),
                    intensity = 0.7 + Math.sqrt(value / selectedCityMax) * 0.3;
                  const detail = {
                    key:`city-${location.name}`,
                    label:locale === "en" ? location.name : location.label || location.name,
                    metrics:[
                      [locale === "en" ? "Visits" : "访问次数", value.toLocaleString(locale)],
                      [locale === "en" ? "Visitors" : "独立访客", Number(location.data.uniqueVisitors || 0).toLocaleString(locale)],
                      [locale === "en" ? "Current-level share" : "当前层级占比", `${selectedCityShareTotal ? ((value / selectedCityShareTotal) * 100).toFixed(1) : 0}%`],
                    ],
                  };
                  return (
                    <g
                      key={`city-${location.name}`}
                      className={`city-hotspot ${active?.key === detail.key ? "active" : ""}`}
                      style={{ "--city-color": color, "--city-intensity": intensity }}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius + 3.5}
                        className="city-marker-halo"
                        aria-hidden="true"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        className="city-marker"
                        role="button"
                        tabIndex="0"
                        aria-label={`${detail.label} · ${value}`}
                        onClick={(event) => { event.stopPropagation(); focusCity(location); }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerEnter={(event) => !dragging && setActive(detailAtPointer(detail, event))}
                        onPointerMove={(event) => !dragging && setActive(detailAtPointer(detail, event))}
                        onPointerLeave={() => setActive(null)}
                        onFocus={(event) => setActive(detailAtPointer(detail, event))}
                        onBlur={() => setActive(null)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div className={`region-map-loading ${map.status}`}>
              <Icon
                name={map.status === "error" ? "globe" : "refresh"}
                size={23}
              />
              <span>
                {map.status === "error"
                  ? locale === "en"
                    ? "Map failed to load"
                    : "地图加载失败"
                  : locale === "en"
                    ? "Loading world map…"
                    : "正在加载世界地图…"}
              </span>
            </div>
          )}
          <div className={`region-map-scale ${mode !== "world" ? "city-scale" : ""}`}>
            <span>{locale === "en" ? "Fewer" : "较少"}</span>
            <i />
            <i />
            <i />
            <i />
            <span>{locale === "en" ? "More" : "较多"}</span>
          </div>
        </div>
        <div className="region-legend">
          <header>
            <span>
              {mode === "cities"
                ? locale === "en" ? "City" : "城市"
                : mode === "provinces"
                  ? locale === "en" ? "Province" : "省份"
                : locale === "en" ? "Country / region" : "国家 / 地区"}
            </span>
            <b>{locale === "en" ? "Visits" : "访问"}</b>
          </header>
          {mode === "cities" ? (
            selectedMappedCities.length ? selectedMappedCities.slice().sort((a,b)=>Number(b.data.value||0)-Number(a.data.value||0)).slice(0, 10).map((location) => {
              const item = location.data;
              return (
                <button
                  type="button"
                  key={`${item.countryCode}-${location.name}`}
                  onClick={() => focusCity(location)}
                  onPointerEnter={(event) => setActive(detailAtPointer({
                    key:`city-${location.name}`,
                    label:locale === "en" ? location.name : location.label || location.name,
                    metrics:[[locale === "en" ? "Visits" : "访问次数", Number(item.value).toLocaleString(locale)],[locale === "en" ? "Visitors" : "独立访客", Number(item.uniqueVisitors || 0).toLocaleString(locale)]],
                  }, event))}
                  onPointerLeave={() => setActive(null)}
                >
                  <i style={{ "--city-color": cityMarkerColor(location.cityCode || location.name) }} />
                  <span><strong>{locale === "en" ? location.name : location.label || location.name}</strong><small>{location.name}</small></span>
                  <b>{Number(item.value).toLocaleString(locale)}</b>
                </button>
              );
            }) : <p>{locale === "en" ? "No city data for this province yet." : "该省份暂无城市访问数据。"}</p>
          ) : mode === "provinces" ? (
            mappedProvinces.length ? mappedProvinces.slice().sort((a,b)=>Number(b.data.value||0)-Number(a.data.value||0)).slice(0,10).map((location) => (
              <button type="button" key={location.code} onClick={() => enterProvinceCities(location)}>
                <i style={{ "--city-color":cityMarkerColor(location.code) }} />
                <span><strong>{location.name}</strong><small>{location.data.cities} {locale === "en" ? "cities" : "个城市"}</small></span>
                <b>{Number(location.data.value).toLocaleString(locale)}</b>
              </button>
            )) : <p>{locale === "en" ? "Province data will accumulate from new visits." : "省份数据将从新访问开始累计。"}</p>
          ) : countries.length ? (
            countries.slice(0, 6).map((item) => (
              <button
                type="button"
                key={item.name}
                className={active?.key === item.name ? "active" : ""}
                  onClick={() => item.name === "CN" && chinaCities.length ? enterChinaCities() : mappedCities.some((city) => city.countryCode === item.name) ? enterCountryCities(item.name) : focusCountry(item.name)}
                onPointerEnter={(event) =>
                  setActive(detailAtPointer(select(item), event))
                }
                onPointerMove={(event) =>
                  setActive(detailAtPointer(select(item), event))
                }
                onFocus={(event) =>
                  setActive(detailAtPointer(select(item), event))
                }
                onBlur={() => setActive(null)}
              >
                <i />
                <span>
                  <strong>{label(item.name)}</strong>
                  <small>{item.name}</small>
                </span>
                <b>{Number(item.value).toLocaleString(locale)}</b>
              </button>
            ))
          ) : (
            <p>
              {locale === "en"
                ? "No country data yet. Configure a trusted proxy country header or a GeoIP database."
                : "暂无国家/地区数据。配置可信代理国家头或 GeoIP 数据库后，地图会自动显示来源标记。"}
            </p>
          )}
          <small>
            {locale === "en"
              ? `${networks.length} network sources · ${coverage?.rate || 0}% region coverage`
              : `${networks.length} 个来源网段（已隐私化） · 地区覆盖率 ${coverage?.rate || 0}%`}
          </small>
          <a
            href="https://www.naturalearthdata.com/"
            target="_blank"
            rel="noreferrer"
          >
            {locale === "en"
              ? "Map data: Natural Earth"
              : "地图数据：Natural Earth"}
          </a>
        </div>
      </div>
      <ChartTooltip active={active} />
    </div>
  );
}

function OwnershipCard({ value }) {
  const { locale } = useI18n();
  const c =
    locale === "en"
      ? {
          public: "Public resources",
          personal: "Personal resources",
          owners: "Users with resources",
          average: "Average per user",
        }
      : {
          public: "公共资源",
          personal: "个人资源",
          owners: "拥有资源的用户",
          average: "个人用户平均资源",
        };
  return (
    <div className="ownership-grid">
      <div>
        <span>{c.public}</span>
        <strong>{value.publicResources || 0}</strong>
      </div>
      <div>
        <span>{c.personal}</span>
        <strong>{value.personalResources || 0}</strong>
      </div>
      <div>
        <span>{c.owners}</span>
        <strong>{value.usersWithResources || 0}</strong>
      </div>
      <div>
        <span>{c.average}</span>
        <strong>{value.averagePersonalResources || 0}</strong>
      </div>
    </div>
  );
}

export const ADMIN_TREND_TICK_POSITIONS = [10, 29.5, 49, 68.5, 88];
export function adminTrendPointY(value, max) {
  return 88 - (Number(value || 0) / Math.max(1, Number(max) || 1)) * 78;
}

function TrendChart({ data }) {
  const { t, locale } = useI18n();
  const gradientId = useId().replace(/:/g, "");
  const wrapRef = useRef(null);
  const [active, setActive] = useState(null);
  const max = niceAxisMax(Math.max(...data.map((item) => item.opens), 1));
  const ticks = [4, 3, 2, 1, 0].map((step) => (max * step) / 4),
    tickPositions = ADMIN_TREND_TICK_POSITIONS,
    dates = axisDateLabels(data, locale);
  const points = useMemo(
    () =>
      data.map((item, index) => ({
        ...item,
        x: data.length === 1 ? 50 : (index / (data.length - 1)) * 100,
        y: adminTrendPointY(item.opens, max),
      })),
    [data, max],
  );
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `M ${points[0].x} 88 L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points.at(-1).x} 88 Z`
    : "";
  function update(event) {
    if (!points.length) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const plotLeft = 42,
      plotWidth = Math.max(1, rect.width - plotLeft);
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left - plotLeft) / plotWidth),
    );
    setActive(points[Math.round(ratio * (points.length - 1))]);
  }
  if (!points.length)
    return <div className="chart-empty">{t("analytics.noData")}</div>;
  return (
    <div
      className="line-chart"
      ref={wrapRef}
      onPointerMove={update}
      onPointerLeave={() => setActive(null)}
    >
      <div className="line-chart-y-axis">
        {ticks.map((value, index) => (
          <span key={value} style={{ top: `${tickPositions[index]}%` }}>
            {formatAxisValue(value, locale)}
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={t("analytics.trend")}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".42" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {tickPositions.map((y) => (
          <line
            className="chart-grid-line"
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
          />
        ))}
        <path className="trend-area" d={area} fill={`url(#${gradientId})`} />
        <polyline className="trend-line" points={line} />
        {active && (
          <line
            className="trend-reference"
            x1={active.x}
            y1="8"
            x2={active.x}
            y2="88"
          />
        )}
      </svg>
      <div className="trend-markers" aria-hidden="true">
        {points.map((point) => (
          <i
            key={point.day}
            className={`trend-point ${active?.day === point.day ? "active" : ""}`}
            style={{
              left: `calc(42px + (100% - 42px) * ${point.x / 100})`,
              top: `${point.y}%`,
            }}
          />
        ))}
      </div>
      {active && (
        <div
          className="trend-tooltip"
          style={{ left: `calc(42px + (100% - 42px) * ${active.x / 100})` }}
        >
          <span>
            {new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
            }).format(new Date(`${active.day}T00:00:00`))}
          </span>
          <strong>
            <i />
            {t("analytics.opens")} <b>{active.opens}</b>
          </strong>
          <strong>
            <i className="secondary" />
            {t("analytics.activeUsers")} <b>{active.activeUsers}</b>
          </strong>
          <strong>
            <i className="resources" />
            {locale === "en" ? "Opened resources" : "被访问资源"}{" "}
            <b>{active.openedResources}</b>
          </strong>
        </div>
      )}
      <div className="chart-axis">
        {dates.map(({ index, label }) => (
          <span
            key={index}
            style={{
              left: `${data.length === 1 ? 50 : (index / (data.length - 1)) * 100}%`,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const pieColors = [
  "var(--accent)",
  "#22a06b",
  "#f59e0b",
  "#8b5cf6",
  "#0ea5e9",
  "#ef5b5b",
  "#64748b",
];

function DonutChart({ data, valueKey = "value", emptyLabel }) {
  const { locale } = useI18n();
  const [active, setActive] = useState(null);
  const visible =
    data.length > 7
      ? [
          ...data.slice(0, 6),
          {
            name: locale === "en" ? "Other" : "其他",
            [valueKey]: data
              .slice(6)
              .reduce((sum, item) => sum + (Number(item[valueKey]) || 0), 0),
          },
        ]
      : data.slice(0, 7);
  const total = visible.reduce(
    (sum, item) => sum + (Number(item[valueKey]) || 0),
    0,
  );
  let cursor = 0;
  const segments = visible.map((item, index) => {
    const start = cursor;
    cursor += total ? ((Number(item[valueKey]) || 0) / total) * 100 : 0;
    return { item, index, start, end: cursor, color: pieColors[index] };
  });
  const select = (item) => ({
    key: item.name,
    label: item.name,
    metrics: [
      [
        locale === "en" ? "Count" : "数量",
        Number(item[valueKey]).toLocaleString(locale),
      ],
      [
        locale === "en" ? "Share" : "占比",
        `${total ? ((item[valueKey] / total) * 100).toFixed(1) : 0}%`,
      ],
    ],
  });
  if (!total) return <div className="chart-empty">{emptyLabel}</div>;
  return (
    <div className="interactive-chart" onMouseLeave={() => setActive(null)}>
      <div className="donut-layout">
        <div className="donut-chart">
          <svg
            viewBox="0 0 140 140"
            role="img"
            aria-label={locale === "en" ? "Distribution chart" : "分布图表"}
          >
            <circle
              className="donut-track"
              cx="70"
              cy="70"
              r="49"
              pathLength="100"
            />
            {segments.map((segment) => (
              <circle
                key={`${segment.item.name}-${segment.index}`}
                className={`donut-segment ${active?.key === segment.item.name ? "active" : ""}`}
                cx="70"
                cy="70"
                r="49"
                pathLength="100"
                strokeDasharray={`${segment.end - segment.start} ${100 - (segment.end - segment.start)}`}
                strokeDashoffset={-segment.start}
                transform="rotate(-90 70 70)"
                style={{ "--segment-color": segment.color }}
                tabIndex="0"
                role="img"
                aria-label={`${segment.item.name} · ${segment.item[valueKey]}`}
                onPointerEnter={(event) =>
                  setActive(detailAtPointer(select(segment.item), event))
                }
                onPointerMove={(event) =>
                  setActive(detailAtPointer(select(segment.item), event))
                }
                onFocus={(event) =>
                  setActive(detailAtPointer(select(segment.item), event))
                }
                onBlur={() => setActive(null)}
              />
            ))}
          </svg>
          <span>
            <strong>
              {active
                ? Number(
                    visible.find((item) => item.name === active.key)?.[
                      valueKey
                    ] || 0,
                  ).toLocaleString(locale)
                : total.toLocaleString(locale)}
            </strong>
            <small>
              {active?.label || (locale === "en" ? "Total" : "总计")}
            </small>
          </span>
        </div>
        <div className="donut-legend">
          {visible.map((item, index) => (
            <div
              className={`donut-legend-row ${active?.key === item.name ? "active" : ""}`}
              key={`${item.name}-${index}`}
              tabIndex="0"
              role="img"
              aria-label={`${item.name} · ${item[valueKey]}`}
              onPointerEnter={(event) =>
                setActive(detailAtPointer(select(item), event))
              }
              onPointerMove={(event) =>
                setActive(detailAtPointer(select(item), event))
              }
              onFocus={(event) =>
                setActive(detailAtPointer(select(item), event))
              }
              onBlur={() => setActive(null)}
            >
              <i style={{ background: pieColors[index] }} />
              <span title={item.name}>{item.name}</span>
              <b>{item[valueKey]}</b>
              <small>{Math.round((item[valueKey] / total) * 100)}%</small>
            </div>
          ))}
        </div>
      </div>
      <ChartTooltip active={active} />
    </div>
  );
}

function TokenTrend({ data }) {
  const { locale } = useI18n();
  return (
    <TimeBarChart
      data={data}
      valueKey="totalTokens"
      emptyLabel={
        locale === "en"
          ? "No token data in this range"
          : "所选范围内暂无 Token 数据"
      }
      metrics={(row) => [
        [
          locale === "en" ? "Total tokens" : "Token 总量",
          Number(row.totalTokens).toLocaleString(locale),
        ],
        [
          locale === "en" ? "Input / output" : "输入 / 输出",
          `${Number(row.inputTokens).toLocaleString(locale)} / ${Number(row.outputTokens).toLocaleString(locale)}`,
        ],
        [
          locale === "en" ? "Requests" : "请求数",
          Number(row.requests).toLocaleString(locale),
        ],
      ]}
    />
  );
}

function MetricCards({ items, locale }) {
  return (
    <div className="analytics-metric-cards">
      {items.map(({ label, value, note, tone = "" }) => (
        <article className={tone} key={label}>
          <span>{label}</span>
          <strong>{value ?? "—"}</strong>
          {note && <small>{note}</small>}
        </article>
      ))}
    </div>
  );
}

function CohortTable({ data }) {
  const { locale } = useI18n(),
    zh = locale !== "en";
  return (
    <div className="cohort-table">
      <div className="cohort-row head">
        <span>{zh ? "首次活跃周" : "First active week"}</span>
        <b>{zh ? "用户" : "Users"}</b>
        {[0, 1, 2, 3].map((week) => (
          <b key={week}>W{week}</b>
        ))}
      </div>
      {data.map((row) => (
        <div className="cohort-row" key={row.week}>
          <span>{row.week}</span>
          <b>{row.users}</b>
          {row.retention.map((value, index) => (
            <i
              key={index}
              className={value == null ? "empty" : ""}
              style={{ "--retention": (value ?? 0) / 100 }}
            >
              {value == null ? "—" : `${value}%`}
            </i>
          ))}
        </div>
      ))}
      {!data.length && (
        <div className="chart-empty">
          {zh ? "暂无足够的活跃用户数据" : "Not enough activity data"}
        </div>
      )}
    </div>
  );
}

function ResourceMatrix({ data }) {
  const { locale } = useI18n(),
    zh = locale !== "en";
  const labels = zh
    ? {
        "high-online": ["高频 · 在线", "核心价值资源"],
        "high-risk": ["高频 · 风险", "优先修复"],
        "low-online": ["低频 · 在线", "考虑推广或整理"],
        "low-risk": ["低频 · 风险", "清理候选"],
      }
    : {
        "high-online": ["High use · Online", "Core value"],
        "high-risk": ["High use · At risk", "Fix first"],
        "low-online": ["Low use · Online", "Promote or organize"],
        "low-risk": ["Low use · At risk", "Cleanup candidate"],
      };
  return (
    <div className="resource-value-matrix">
      {data.map((row) => (
        <article className={row.name} key={row.name}>
          <span>{labels[row.name]?.[0]}</span>
          <strong>{row.value}</strong>
          <small>{labels[row.name]?.[1]}</small>
        </article>
      ))}
    </div>
  );
}

function HealthTrend({ data }) {
  const { locale } = useI18n();
  const visible = data.filter((row) => row.checks);
  if (!visible.length)
    return (
      <div className="analytics-history-empty">
        <Icon name="insights" size={22} />
        <strong>
          {locale === "en"
            ? "Health history starts now"
            : "探测历史从本次升级开始累计"}
        </strong>
        <span>
          {locale === "en"
            ? "Run scheduled or manual checks to build availability and latency trends."
            : "执行定时或手动探测后，这里会展示可用率与延迟趋势。"}
        </span>
      </div>
    );
  return (
    <TimeBarChart
      data={data}
      valueKey="checks"
      color="online"
      emptyLabel={locale === "en" ? "No check history" : "暂无探测历史"}
      metrics={(row) => [
        [locale === "en" ? "Checks" : "探测次数", row.checks],
        [
          locale === "en" ? "Availability" : "可用率",
          row.availability == null ? "—" : `${row.availability}%`,
        ],
        [
          locale === "en" ? "Average latency" : "平均延迟",
          row.averageLatencyMs ? `${row.averageLatencyMs} ms` : "—",
        ],
      ]}
    />
  );
}

function SearchTrend({ data }) {
  const { locale } = useI18n();
  return (
    <TimeBarChart
      data={data}
      valueKey="searches"
      emptyLabel={locale === "en" ? "No search data" : "暂无搜索数据"}
      metrics={(row) => [
        [locale === "en" ? "Searches" : "搜索次数", row.searches],
        [locale === "en" ? "Clicked searches" : "点击结果", row.clicks],
        [locale === "en" ? "No results" : "无结果", row.noResults],
      ]}
    />
  );
}

function DailyMetricTrend({
  data,
  valueKey,
  label,
  format = (value) => value,
  unit = "",
}) {
  const { locale } = useI18n();
  return (
    <TimeBarChart
      data={data}
      valueKey={valueKey}
      unit={unit}
      emptyLabel={
        locale === "en" ? "No data in this range" : "所选范围内暂无数据"
      }
      metrics={(row) => [[label, format(row[valueKey])]]}
    />
  );
}

function SlowResourceList({ data }) {
  const { locale } = useI18n();
  return (
    <div className="slow-resource-list">
      {data.map((row, index) => (
        <div key={row.id}>
          <span>{index + 1}</span>
          <div>
            <strong title={row.name}>{row.name}</strong>
            <small>
              {locale === "en"
                ? `${row.visits} visits · ${row.status}`
                : `访问 ${row.visits} 次 · ${row.status}`}
            </small>
          </div>
          <b>{row.latencyMs} ms</b>
        </div>
      ))}
      {!data.length && (
        <div className="chart-empty">
          {locale === "en" ? "No latency samples" : "暂无延迟样本"}
        </div>
      )}
    </div>
  );
}

function AnalyticsCard({
  icon,
  title,
  description,
  children,
  className = "",
  action = null,
}) {
  return (
    <figure className={`chart-card ${className}`}>
      <figcaption>
        <div className="chart-title-icon">
          <Icon name={icon} size={17} />
        </div>
        <div>
          <strong>{title}</strong>
          {description && <small>{description}</small>}
        </div>
        {action}
      </figcaption>
      {children}
    </figure>
  );
}

function AnalyticsDrawer({ detail, onClose, locale }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const isResource = detail.type === "resource";
  const value = detail.value;
  const rows = isResource
    ? [
        ["URL", value.url || "—"],
        [locale === "en" ? "Description" : "描述", value.description || "—"],
        [
          locale === "en" ? "Space" : "空间",
          value.scope === "personal"
            ? value.ownerName || "个人空间"
            : "公共空间",
        ],
        [locale === "en" ? "Category" : "分类", value.categoryName || "未分类"],
        [
          locale === "en" ? "Unique visitors" : "独立访问用户",
          value.uniqueVisitors,
        ],
        [
          locale === "en" ? "Last opened" : "最近访问",
          value.lastOpenedAt
            ? new Date(value.lastOpenedAt).toLocaleString()
            : "—",
        ],
      ]
    : [
        [locale === "en" ? "Username" : "用户名", value.username || "—"],
        [locale === "en" ? "Requests" : "请求次数", value.requests],
        ["Token", value.totalTokens],
        [
          locale === "en" ? "Success rate" : "成功率",
          `${value.successRate || 0}%`,
        ],
        [
          locale === "en" ? "Average latency" : "平均响应耗时",
          `${value.averageLatencyMs || 0} ms`,
        ],
        [
          "TTFT",
          value.averageFirstTokenMs == null
            ? locale === "en"
              ? "No streaming samples"
              : "暂无流式样本"
            : `${value.averageFirstTokenMs} ms`,
        ],
      ];
  return (
    <div
      className="analytics-drawer-mask"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="analytics-drawer" role="dialog" aria-modal="true">
        <header>
          <div className="chart-title-icon">
            <Icon name={isResource ? "link" : "assistant"} size={19} />
          </div>
          <div>
            <h2>{value.name}</h2>
            <p>
              {isResource
                ? locale === "en"
                  ? "Resource access drill-down"
                  : "资源访问下钻"
                : locale === "en"
                  ? "AI usage drill-down"
                  : "AI 使用下钻"}
            </p>
          </div>
          <button className="mini-btn" onClick={onClose}>
            ×
          </button>
        </header>
        {isResource && Boolean(value.deleted) && (
          <div className="analytics-detail-warning">
            该资源已删除，以下内容来自访问事件快照。
          </div>
        )}
        <dl>
          {rows.map(([label, content]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd>{content ?? "—"}</dd>
            </React.Fragment>
          ))}
        </dl>
        <section>
          <h3>{locale === "en" ? "Why this matters" : "指标用途"}</h3>
          <p>
            {isResource
              ? locale === "en"
                ? "Use visits and unique visitors together to distinguish repeated use from broad adoption."
                : "结合访问次数和独立用户数，区分高频重复使用与广泛使用。"
              : locale === "en"
                ? "Use requests, tokens and latency together to evaluate cost, adoption and experience."
                : "结合请求、Token 与延迟评估使用活跃度、成本和体验。"}
          </p>
        </section>
      </aside>
    </div>
  );
}

export default function AdminAnalytics() {
  const { t, errorMessage, locale } = useI18n();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState("all");
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState([]);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .getAnalyticsUsers()
      .then((result) => setOwners(result.items || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api
      .getAnalytics({
        days,
        scope,
        ownerId: scope === "personal" ? ownerId : "",
      })
      .then((result) => live && setData(result))
      .catch((err) => live && setError(errorMessage(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [days, scope, ownerId, errorMessage]);
  const zh = locale !== "en";
  const copy = zh
    ? {
        description: "按空间、资源和用户理解真实使用行为，并监控 AI 成本与体验",
        all: "全平台",
        public: "公共空间",
        personal: "个人空间",
        allOwners: "全部个人用户",
        overview: "使用概览",
        overviewDesc: "回答所选空间是否被使用，以及使用覆盖面如何",
        access: "访问表现",
        accessDesc: "观察访问变化，识别异常波动与持续活跃度",
        resource: "资源表现",
        resourceDesc: "判断哪些资源真正有价值，以及资源结构是否健康",
        behavior: "用户与使用习惯",
        behaviorDesc: "了解谁在使用、从哪里进入、何时最活跃",
        ai: "AI 使用与性能",
        aiDesc: "同时评估采用率、Token 成本、可靠性和响应体验",
      }
    : {
        description:
          "Understand real usage by space, resource and user, while monitoring AI cost and experience",
        all: "All platform",
        public: "Public Space",
        personal: "Personal Spaces",
        allOwners: "All personal owners",
        overview: "Usage overview",
        overviewDesc:
          "Is the selected space being used, and how broad is adoption?",
        access: "Access performance",
        accessDesc: "Track changes and identify unusual or sustained activity",
        resource: "Resource performance",
        resourceDesc: "Find useful resources and evaluate information health",
        behavior: "Users and habits",
        behaviorDesc:
          "Understand who uses resources, entry points and active time",
        ai: "AI usage and performance",
        aiDesc:
          "Evaluate adoption, token cost, reliability and response experience",
      };
  if (!data && loading)
    return <div className="admin-panel">{t("common.loading")}</div>;
  if (!data && error)
    return <div className="admin-panel error-text">{error}</div>;
  const summary = data.summary;
  const aiSummary = data.ai?.summary || {};
  const number = (value) => Number(value || 0).toLocaleString(locale);
  const filterActions = (
    <div className="analytics-filter-controls">
      <label>
        <span>{t("analytics.range")}</span>
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[7, 30, 90].map((value) => (
            <option value={value} key={value}>
              {t("analytics.days", { count: value })}
            </option>
          ))}
        </select>
      </label>
      <div className="analytics-scope-switch" role="group">
        {[
          ["all", copy.all],
          ["public", copy.public],
          ["personal", copy.personal],
        ].map(([value, label]) => (
          <button
            className={scope === value ? "active" : ""}
            key={value}
            onClick={() => {
              setScope(value);
              if (value !== "personal") setOwnerId("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {scope === "personal" && (
        <label>
          <span>{zh ? "空间所有者" : "Space owner"}</span>
          <select
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
          >
            <option value="">{copy.allOwners}</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.displayName} (@{owner.username}) · {owner.resourceCount}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
  const accessKpis = [
    [
      "opens",
      "grid",
      zh ? "资源访问" : "Resource opens",
      zh ? "实际打开资源的总次数" : "Actual resource opens",
    ],
    [
      "activeUsers",
      "user",
      zh ? "访问用户" : "Visitors",
      zh ? "产生访问的独立登录用户" : "Distinct signed-in visitors",
    ],
    [
      "openedResources",
      "link",
      zh ? "被访问资源" : "Opened resources",
      zh ? "至少被访问一次的资源" : "Resources opened at least once",
    ],
    [
      "resources",
      "folder",
      zh ? "现有资源" : "Current resources",
      zh ? "当前筛选空间的资源总数" : "Resources in selected spaces",
    ],
    [
      "averageOpensPerUser",
      "grid",
      zh ? "人均访问" : "Opens per visitor",
      zh ? "衡量使用深度，不代表用户规模" : "Usage depth, not audience size",
    ],
    [
      "newResources",
      "plus",
      zh ? "新增资源" : "New resources",
      zh
        ? "统计周期内当前仍存在的新增资源"
        : "Current resources created in range",
    ],
  ];
  const aiKpis = [
    ["requests", zh ? "AI 请求" : "AI requests"],
    ["users", zh ? "使用用户" : "AI users"],
    ["totalTokens", "Token"],
    ["successRate", zh ? "成功率" : "Success rate", "%"],
    ["averageLatencyMs", zh ? "平均响应耗时" : "Avg latency", " ms"],
    ["p95LatencyMs", zh ? "P95 响应耗时" : "P95 latency", " ms"],
    ["averageFirstTokenMs", zh ? "平均 TTFT" : "Average TTFT", " ms"],
    ["p95FirstTokenMs", zh ? "P95 TTFT" : "P95 TTFT", " ms"],
    ["peakRpm", "Peak RPM"],
    ["peakTpm", "Peak TPM"],
  ];
  const tabs = zh
    ? [
        ["overview", "总览"],
        ["adoption", "用户与留存"],
        ["resources", "资源与质量"],
        ["search", "搜索与发现"],
        ["collaboration", "共享与协作"],
        ["behavior", "地域与终端"],
        ["ai", "AI 使用分析"],
      ]
    : [
        ["overview", "Overview"],
        ["adoption", "Users & retention"],
        ["resources", "Resources & quality"],
        ["search", "Search & discovery"],
        ["collaboration", "Collaboration"],
        ["behavior", "Regions & clients"],
        ["ai", "AI analytics"],
      ];
  const adoption = data.adoption || { summary: {}, cohorts: [] },
    quality = data.resourceQuality || {
      health: { latency: {} },
      matrix: [],
      slowResources: [],
      categoryHealth: { tags: [] },
      healthTrend: [],
    },
    search = data.search || {
      summary: {},
      trend: [],
      terms: [],
      zeroResultTerms: [],
    },
    collaboration = data.collaboration || { summary: {}, statuses: [] };
  return (
    <div className={`analytics-dashboard ${loading ? "is-refreshing" : ""}`}>
      <AdminPageHeader
        icon="grid"
        title={t("analytics.title")}
        description={copy.description}
        actions={filterActions}
      />
      {error && (
        <div className="admin-inline-error">
          <Icon name="shield" size={15} />
          {error}
        </div>
      )}
      <nav
        className="analytics-tabs"
        aria-label={zh ? "分析维度" : "Analytics sections"}
      >
        {tabs.map(([value, label]) => (
          <button
            type="button"
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          <section className="analytics-section">
            <header>
              <div>
                <h3>{copy.overview}</h3>
                <p>{copy.overviewDesc}</p>
              </div>
              {loading && (
                <span className="analytics-refreshing">
                  {zh ? "正在静默更新…" : "Refreshing…"}
                </span>
              )}
            </header>
            <div className="kpi-grid analytics-kpi-grid">
              {accessKpis.map(([key, icon, label, note]) => (
                <article key={key} title={note}>
                  <span className="kpi-icon">
                    <Icon name={icon} size={17} />
                  </span>
                  <div>
                    <span>{label}</span>
                    <strong>{number(summary[key])}</strong>
                    <small>{note}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className="analytics-section">
            <header>
              <div>
                <h3>{copy.access}</h3>
                <p>{copy.accessDesc}</p>
              </div>
            </header>
            <AnalyticsCard
              icon="grid"
              title={t("analytics.trend")}
              description={
                zh
                  ? "访问次数、独立用户和被访问资源按日变化"
                  : "Daily opens, visitors and opened resources"
              }
              className="analytics-trend-card"
            >
              <TrendChart data={data.access.trend} />
            </AnalyticsCard>
          </section>
          <section className="analytics-section">
            <header>
              <div>
                <h3>{zh ? "需要关注" : "Needs attention"}</h3>
                <p>
                  {zh
                    ? "用真实访问与探测数据提示最值得处理的问题"
                    : "Prioritized from real usage and health data"}
                </p>
              </div>
            </header>
            <MetricCards
              locale={locale}
              items={[
                {
                  label: zh ? "高频失联资源" : "High-use offline",
                  value: number(quality.health.highUseOffline),
                  note: zh ? "应优先修复" : "Fix first",
                  tone: "danger",
                },
                {
                  label: zh ? "90 天未访问" : "Not used in 90 days",
                  value: number(quality.health.stale90Days),
                  note: zh ? "整理或归档候选" : "Cleanup candidates",
                },
                {
                  label: zh ? "探测覆盖率" : "Check coverage",
                  value: `${quality.health.checkCoverage || 0}%`,
                  note: zh ? "越高越可信" : "Higher is more reliable",
                },
                {
                  label: zh ? "搜索无结果率" : "No-result rate",
                  value: search.available
                    ? `${search.summary.noResultRate || 0}%`
                    : "—",
                  note: zh ? "用于发现内容缺口" : "Find content gaps",
                },
                {
                  label: zh ? "AI 成功率" : "AI success rate",
                  value: `${aiSummary.successRate || 0}%`,
                  note: zh ? "低于目标时检查模型" : "Check model if low",
                },
              ]}
            />
          </section>
        </>
      )}
      {tab === "adoption" && (
        <section className="analytics-section">
          <header>
            <div>
              <h3>{zh ? "用户采用与留存" : "Adoption and retention"}</h3>
              <p>
                {zh
                  ? "活跃口径为登录用户产生至少一次资源访问；不是单纯登录人数"
                  : "Active means a signed-in user opened at least one resource, not login-only activity"}
              </p>
            </div>
          </header>
          <MetricCards
            locale={locale}
            items={[
              {
                label: "DAU",
                value: number(adoption.summary.dau),
                note: zh ? "最近 24 小时" : "Last 24 hours",
              },
              {
                label: "WAU",
                value: number(adoption.summary.wau),
                note: zh ? "最近 7 天" : "Last 7 days",
              },
              {
                label: "MAU",
                value: number(adoption.summary.mau),
                note: zh ? "最近 30 天" : "Last 30 days",
              },
              {
                label: zh ? "回访用户" : "Returning users",
                value: number(adoption.summary.returningUsers),
                note: zh ? "首次活跃早于当前周期" : "First active before range",
              },
              {
                label: zh ? "首次活跃用户" : "Newly active users",
                value: number(adoption.summary.newlyActiveUsers),
                note: zh
                  ? "当前周期首次产生有效行为"
                  : "First activity in range",
              },
            ]}
          />
          {scope === "all" && (
            <AnalyticsCard
              icon="user"
              title={zh ? "用户增长趋势" : "User growth trend"}
              description={
                zh
                  ? "按日统计新注册的有效账户"
                  : "Daily newly registered active accounts"
              }
            >
              <DailyMetricTrend
                data={adoption.growth || []}
                valueKey="registrations"
                label={zh ? "新注册用户" : "New users"}
              />
            </AnalyticsCard>
          )}
          <div className="analytics-two-column adoption-layout">
            <AnalyticsCard
              icon="user"
              title={zh ? "周 Cohort 留存" : "Weekly cohort retention"}
              description={
                zh
                  ? "W0 为首次活跃周，后续列表示同批用户再次活跃比例"
                  : "W0 is first active week; later columns show returning activity"
              }
              className="cohort-card"
            >
              <CohortTable data={adoption.cohorts} />
            </AnalyticsCard>
            <AnalyticsCard
              icon="user"
              title={zh ? "活跃用户排行" : "Active user ranking"}
              description={
                zh
                  ? "用于识别核心使用者和推广样本"
                  : "Identify core users and adoption examples"
              }
            >
              <Bars
                data={(data.access.visitors || []).map((row) => ({
                  name: row.name,
                  value: row.value,
                }))}
                group="users"
              />
            </AnalyticsCard>
          </div>
        </section>
      )}
      {tab === "resources" && (
        <section className="analytics-section">
          <header>
            <div>
              <h3>{zh ? "资源价值与质量" : "Resource value and quality"}</h3>
              <p>
                {zh
                  ? "联合访问频次、可用状态和延迟，决定修复、推广或清理优先级"
                  : "Combine usage, availability, and latency to prioritize work"}
              </p>
            </div>
          </header>
          <MetricCards
            locale={locale}
            items={[
              {
                label: zh ? "探测覆盖率" : "Check coverage",
                value: `${quality.health.checkCoverage || 0}%`,
                note: `${number(quality.health.checked)} / ${number(quality.health.total)}`,
              },
              {
                label: zh ? "P50 延迟" : "P50 latency",
                value:
                  quality.health.latency?.p50 == null
                    ? "—"
                    : `${quality.health.latency.p50} ms`,
              },
              {
                label: zh ? "P95 延迟" : "P95 latency",
                value:
                  quality.health.latency?.p95 == null
                    ? "—"
                    : `${quality.health.latency.p95} ms`,
              },
              {
                label: zh ? "P99 延迟" : "P99 latency",
                value:
                  quality.health.latency?.p99 == null
                    ? "—"
                    : `${quality.health.latency.p99} ms`,
              },
              {
                label: zh ? "未访问资源" : "Never visited",
                value: number(quality.health.neverVisited),
                note: zh ? "当前无历史访问记录" : "No recorded visit",
              },
              {
                label: zh ? "无标签资源" : "Without tags",
                value: number(quality.categoryHealth.withoutTags),
                note: zh ? "影响搜索与治理" : "Affects discovery",
              },
            ]}
          />
          <div className="analytics-two-column">
            <AnalyticsCard
              icon="insights"
              title={zh ? "资源价值矩阵" : "Resource value matrix"}
              description={
                zh
                  ? `高频阈值为周期内访问 ${quality.health.highUseThreshold || 2} 次，风险包含离线和未知状态`
                  : `High-use threshold: ${quality.health.highUseThreshold || 2} visits; risk includes offline and unknown`
              }
            >
              <ResourceMatrix data={quality.matrix} />
            </AnalyticsCard>
            <AnalyticsCard
              icon="speed"
              title={zh ? "探测趋势" : "Health check trend"}
              description={
                zh
                  ? "从本次升级后累计可用率与延迟历史"
                  : "Availability and latency history accumulates after this upgrade"
              }
            >
              <HealthTrend data={quality.healthTrend} />
            </AnalyticsCard>
          </div>
          <div className="analytics-two-column align-start">
            <AnalyticsCard
              icon="link"
              title={zh ? "热门资源" : "Popular resources"}
              description={
                zh
                  ? "点击查看资源快照与访问明细"
                  : "Select a resource for details"
              }
              className="top-resources-card"
            >
              <TopResources
                data={data.access.topResources}
                onSelect={(value) => setDetail({ type: "resource", value })}
              />
            </AnalyticsCard>
            <AnalyticsCard
              icon="speed"
              title={zh ? "高延迟资源" : "Slowest resources"}
              description={
                zh
                  ? "按最新探测延迟排序，结合访问量判断优化优先级"
                  : "Latest latency ranked with usage context"
              }
            >
              <SlowResourceList data={quality.slowResources} />
            </AnalyticsCard>
          </div>
          <div className="analytics-two-column align-start">
            <AnalyticsCard
              icon="folder"
              title={zh ? "分类资源分布" : "Resources by category"}
              description={
                zh
                  ? "检查过度集中和未分类"
                  : "Find concentration and uncategorized content"
              }
            >
              <DonutChart
                data={data.resources.categories}
                emptyLabel={t("analytics.noData")}
              />
            </AnalyticsCard>
            <AnalyticsCard
              icon="tag"
              title={zh ? "标签覆盖" : "Tag coverage"}
              description={
                zh
                  ? "识别常用标签与无标签内容"
                  : "Review common tags and untagged content"
              }
            >
              <Bars data={quality.categoryHealth.tags} group="tags" />
            </AnalyticsCard>
          </div>
        </section>
      )}
      {tab === "search" && (
        <section className="analytics-section">
          <header>
            <div>
              <h3>{zh ? "搜索与发现" : "Search and discovery"}</h3>
              <p>
                {zh
                  ? "搜索指标从本次升级后开始累计；仅全平台口径可用，敏感形式的关键词不会保存"
                  : "Metrics start after this upgrade; platform-wide only, and sensitive-shaped terms are not retained"}
              </p>
            </div>
          </header>
          {search.available ? (
            <>
              <MetricCards
                locale={locale}
                items={[
                  {
                    label: zh ? "搜索次数" : "Searches",
                    value: number(search.summary.searches),
                  },
                  {
                    label: zh ? "搜索用户" : "Search users",
                    value: number(search.summary.users),
                  },
                  {
                    label: zh ? "结果点击率" : "Result CTR",
                    value: `${search.summary.clickThroughRate || 0}%`,
                    note: zh
                      ? "搜索后打开资源的比例"
                      : "Searches followed by an open",
                  },
                  {
                    label: zh ? "无结果率" : "No-result rate",
                    value: `${search.summary.noResultRate || 0}%`,
                    note: zh ? "衡量内容缺口" : "Measures content gaps",
                    tone:
                      (search.summary.noResultRate || 0) > 20 ? "danger" : "",
                  },
                  {
                    label: zh ? "P95 搜索耗时" : "P95 search latency",
                    value:
                      search.summary.p95LatencyMs == null
                        ? "—"
                        : `${search.summary.p95LatencyMs} ms`,
                  },
                  {
                    label: zh ? "平均点击位次" : "Average click rank",
                    value: search.summary.averageClickPosition ?? "—",
                  },
                ]}
              />
              <div className="analytics-two-column">
                <AnalyticsCard
                  icon="search"
                  title={zh ? "搜索趋势" : "Search trend"}
                  description={
                    zh
                      ? "悬停查看搜索、点击和无结果次数"
                      : "Hover for searches, clicks, and no-result counts"
                  }
                >
                  <SearchTrend data={search.trend} />
                </AnalyticsCard>
                <AnalyticsCard
                  icon="search"
                  title={zh ? "热门搜索词" : "Popular search terms"}
                  description={
                    zh ? "用于理解用户正在寻找什么" : "Understand user demand"
                  }
                >
                  <Bars data={search.terms} group="search" />
                </AnalyticsCard>
              </div>
              <AnalyticsCard
                icon="shield"
                title={zh ? "无结果关键词" : "No-result terms"}
                description={
                  zh
                    ? "优先补充高频缺失内容或优化同义词"
                    : "Fill content gaps or improve synonyms"
                }
              >
                <Bars
                  data={search.zeroResultTerms.map((row) => ({
                    name: row.name,
                    value: row.noResult,
                  }))}
                  group="search"
                />
              </AnalyticsCard>
            </>
          ) : (
            <div className="analytics-history-empty">
              <Icon name="shield" size={22} />
              <strong>
                {zh
                  ? "请切换到全平台查看搜索分析"
                  : "Switch to All platform for search analytics"}
              </strong>
              <span>
                {zh
                  ? "搜索可能同时返回公共与当前用户的个人资源，无法按单一资源空间准确拆分。"
                  : "A search can return public and personal results together, so it cannot be accurately split by one resource scope."}
              </span>
            </div>
          )}
        </section>
      )}
      {tab === "collaboration" && (
        <section className="analytics-section">
          <header>
            <div>
              <h3>{zh ? "共享与协作" : "Sharing and collaboration"}</h3>
              <p>
                {zh
                  ? "按共享发起者的个人空间统计接受率、响应速度和共享资源量"
                  : "Acceptance, response speed, and shared volume by sender's personal space"}
              </p>
            </div>
          </header>
          {collaboration.available ? (
            <>
              <MetricCards
                locale={locale}
                items={[
                  {
                    label: zh ? "发起共享" : "Shares sent",
                    value: number(collaboration.summary.shares),
                  },
                  {
                    label: zh ? "共享资源" : "Items shared",
                    value: number(collaboration.summary.items),
                  },
                  {
                    label: zh ? "接受率" : "Acceptance rate",
                    value: `${collaboration.summary.acceptanceRate || 0}%`,
                  },
                  {
                    label: zh ? "待处理" : "Pending",
                    value: number(collaboration.summary.pending),
                  },
                  {
                    label: zh ? "平均响应时间" : "Average response",
                    value:
                      collaboration.summary.averageResponseHours == null
                        ? "—"
                        : `${collaboration.summary.averageResponseHours} h`,
                  },
                ]}
              />
              <AnalyticsCard
                icon="user"
                title={zh ? "共享状态分布" : "Share status"}
                description={
                  zh
                    ? "仅统计所选周期内发起的共享"
                    : "Shares initiated in the selected range"
                }
              >
                <DonutChart
                  data={collaboration.statuses}
                  emptyLabel={t("analytics.noData")}
                />
              </AnalyticsCard>
            </>
          ) : (
            <div className="analytics-history-empty">
              <Icon name="user" size={22} />
              <strong>
                {zh
                  ? "共享分析仅适用于个人空间"
                  : "Collaboration analytics is for personal spaces"}
              </strong>
              <span>
                {zh
                  ? "切换到个人空间，可按全部用户或指定用户查看。"
                  : "Switch to Personal Spaces and optionally select an owner."}
              </span>
            </div>
          )}
        </section>
      )}
      {tab === "behavior" && (
        <section className="analytics-section">
          <header>
            <div>
              <h3>{copy.behavior}</h3>
              <p>{copy.behaviorDesc}</p>
            </div>
          </header>
          <div className="analytics-behavior-grid">
            <AnalyticsCard
              icon="grid"
              title={zh ? "访问时间热点" : "Activity heatmap"}
              description={
                zh
                  ? "星期 × 小时，用于判断高峰时段"
                  : "Weekday × hour for peak periods"
              }
              className="heatmap-card behavior-heatmap-card"
            >
              <ActivityHeatmap data={data.access.heatmap} />
            </AnalyticsCard>
            <AnalyticsCard
              icon="user"
              title={zh ? "访问用户排行" : "Visitor ranking"}
              description={
                zh
                  ? "用于识别活跃用户，不等同于资源所有者"
                  : "Active visitors, distinct from space owners"
              }
            >
              <Bars
                data={(data.access.visitors || []).map((row) => ({
                  name: row.name,
                  value: row.value,
                }))}
                group="users"
              />
            </AnalyticsCard>
            <AnalyticsCard
              icon="grid"
              title={t("analytics.sources")}
              description={
                zh
                  ? "资源从卡片、搜索或 AI 等入口被打开"
                  : "Where resource opens originate"
              }
            >
              <Bars data={data.access.sources} group="sources" />
            </AnalyticsCard>
            <AnalyticsCard
              icon="user"
              title={t("analytics.devices")}
              description={
                zh
                  ? "用于判断桌面端与移动端适配优先级"
                  : "Prioritize desktop or mobile experience"
              }
            >
              <Bars data={data.access.devices} group="devices" />
            </AnalyticsCard>
            <AnalyticsCard
              icon="globe"
              title={zh ? "浏览器环境" : "Browser environment"}
              description={
                zh
                  ? "用于识别兼容性验证和前端优化优先级"
                  : "Prioritize compatibility testing and frontend optimization"
              }
            >
              <Bars data={data.access.browsers} group="browsers" />
            </AnalyticsCard>
          </div>
          <AnalyticsCard
            icon="globe"
            title={zh ? "访问来源地区" : "Visitor regions"}
            description={
              zh
                ? "地区数据来自可信代理国家代码或本地 GeoIP 数据库，并展示当前覆盖率"
                : "Country data comes from trusted proxy headers or the local GeoIP database, with coverage shown explicitly"
            }
            className="region-card behavior-region-card"
          >
            <RegionMap
              data={data.access.regions}
              cities={data.access.cities}
              networks={data.access.networks}
              coverage={data.access.regionCoverage}
              cityCoverage={data.access.cityCoverage}
              chinaCityCoverage={data.access.chinaCityCoverage}
            />
          </AnalyticsCard>
        </section>
      )}
      {tab === "ai" && (
        <section className="analytics-section ai-analytics-section">
          <header>
            <div>
              <h3>{copy.ai}</h3>
              <p>{copy.aiDesc}</p>
            </div>
            <span className="chart-tag">
              {zh ? "TTFT 仅统计流式请求" : "TTFT: streaming only"}
            </span>
          </header>
          <div className="ai-kpi-grid">
            {aiKpis.map(([key, label, suffix = ""]) => (
              <article key={key}>
                <span>{label}</span>
                <strong>
                  {aiSummary[key] == null
                    ? "—"
                    : `${number(aiSummary[key])}${suffix}`}
                </strong>
                {key === "peakRpm" && (
                  <small>{zh ? "活跃分钟峰值" : "Peak active minute"}</small>
                )}
                {key === "peakTpm" && (
                  <small>{zh ? "活跃分钟峰值" : "Peak active minute"}</small>
                )}
              </article>
            ))}
          </div>
          <div className="analytics-two-column align-start">
            <AnalyticsCard
              icon="assistant"
              title={zh ? "Token 增长趋势" : "Token trend"}
              description={
                zh
                  ? "输入与输出 Token 的总量按日变化，用于成本趋势判断"
                  : "Daily token volume for cost trend"
              }
            >
              <TokenTrend data={data.ai.trend} />
              <div className="token-summary">
                <span>
                  {zh ? "输入" : "Input"} <b>{number(aiSummary.inputTokens)}</b>
                </span>
                <span>
                  {zh ? "输出" : "Output"}{" "}
                  <b>{number(aiSummary.outputTokens)}</b>
                </span>
                <span>
                  {zh ? "平均活跃分钟 TPM" : "Avg active-minute TPM"}{" "}
                  <b>{number(aiSummary.averageTpm)}</b>
                </span>
              </div>
            </AnalyticsCard>
            <AnalyticsCard
              icon="user"
              title={zh ? "用户 AI 用量" : "AI usage by user"}
              description={
                zh
                  ? "点击用户下钻，联合判断采用率、成本和响应体验"
                  : "Select a user to inspect adoption, cost and experience"
              }
            >
              <div className="analytics-entity-table">
                <div className="entity-table-head">
                  <span>{zh ? "用户" : "User"}</span>
                  <span>{zh ? "请求" : "Requests"}</span>
                  <span>Token</span>
                  <span>{zh ? "成功率" : "Success"}</span>
                </div>
                {data.ai.users.map((row) => (
                  <button
                    key={row.id || row.name}
                    onClick={() => setDetail({ type: "ai-user", value: row })}
                  >
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.username ? `@${row.username}` : "—"}</small>
                    </span>
                    <b>{row.requests}</b>
                    <b>{number(row.totalTokens)}</b>
                    <b>{row.successRate}%</b>
                  </button>
                ))}
                {!data.ai.users.length && (
                  <div className="chart-empty">{t("analytics.noData")}</div>
                )}
              </div>
            </AnalyticsCard>
          </div>
          <div className="analytics-three-column">
            <AnalyticsCard
              icon="speed"
              title={zh ? "AI 响应耗时趋势" : "AI latency trend"}
              description={
                zh
                  ? "每日平均响应耗时；上方 P95 用于判断长尾体验"
                  : "Daily average latency; use the P95 KPI for tail experience"
              }
            >
              <DailyMetricTrend
                data={data.ai.trend}
                valueKey="averageLatencyMs"
                unit="ms"
                label={zh ? "平均响应耗时" : "Average latency"}
                format={(value) => `${number(value)} ms`}
              />
            </AnalyticsCard>
            <AnalyticsCard
              icon="clock"
              title={zh ? "首 Token 时间趋势" : "TTFT trend"}
              description={
                zh
                  ? "仅包含支持流式返回且有首 Token 样本的请求"
                  : "Streaming requests with TTFT samples only"
              }
            >
              <DailyMetricTrend
                data={data.ai.trend}
                valueKey="averageFirstTokenMs"
                unit="ms"
                label="TTFT"
                format={(value) => (value ? `${number(value)} ms` : "—")}
              />
            </AnalyticsCard>
            <AnalyticsCard
              icon="shield"
              title={zh ? "AI 错误分布" : "AI errors"}
              description={
                zh
                  ? "用于定位失败最集中的错误类型"
                  : "Find the most common failure causes"
              }
            >
              <Bars data={data.ai.errors || []} group="errors" />
            </AnalyticsCard>
          </div>
          <div className="analytics-two-column align-start">
            <AnalyticsCard
              icon="assistant"
              title={zh ? "模型调用分布" : "Model usage"}
              description={
                zh
                  ? "对比模型调用量与 Token 消耗，辅助模型治理"
                  : "Compare calls and tokens for model governance"
              }
            >
              <DonutChart
                data={data.ai.models.map((row) => ({
                  ...row,
                  value: row.requests,
                }))}
                emptyLabel={t("analytics.noData")}
              />
            </AnalyticsCard>
            <AnalyticsCard
              icon="tools"
              title={zh ? "AI 功能使用分布" : "AI feature usage"}
              description={
                zh
                  ? "识别真正被使用的 AI 能力，避免维护低价值功能"
                  : "Identify useful capabilities and low-value features"
              }
            >
              <Bars
                data={data.ai.features.map((row) => ({
                  name: row.name,
                  value: row.requests,
                }))}
                group="features"
              />
            </AnalyticsCard>
          </div>
        </section>
      )}
      {detail && (
        <AnalyticsDrawer
          detail={detail}
          onClose={() => setDetail(null)}
          locale={locale}
        />
      )}
    </div>
  );
}

function EventTag({ type }) {
  const { auditEventLabel } = useI18n();
  return (
    <span className="audit-event-tag">
      <Icon
        name={
          type.startsWith("auth.")
            ? "user"
            : type.startsWith("settings.")
              ? "settings"
              : type.startsWith("category.")
                ? "folder"
                : type.startsWith("ai.")
                  ? "assistant"
                  : "link"
        }
        size={14}
      />
      {auditEventLabel(type)}
    </span>
  );
}

const FIELD_LABELS = {
  id: "ID",
  name: "名称",
  url: "URL",
  icon: "图标",
  description: "描述",
  categoryId: "分类 ID",
  categoryName: "分类",
  sortOrder: "顺序",
  checkMethod: "探测方式",
  checkTarget: "探测目标",
  checkEnabled: "启用探测",
  scope: "空间",
  status: "状态",
  version: "版本",
  orderedIds: "排序 ID",
  affectedCount: "影响数量",
  affectedIds: "影响对象",
  operationTypes: "操作类型",
  operationCount: "操作数量",
  changedFields: "变更字段",
  reason: "原因",
  inputHash: "指令摘要",
  displayName: "显示名",
  role: "角色",
};
function fieldLabel(key, locale) {
  if (locale === "en")
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return FIELD_LABELS[key] || key;
}
function DetailValue({ value, locale }) {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean")
    return locale === "en" ? (value ? "Yes" : "No") : value ? "是" : "否";
  if (Array.isArray(value))
    return (
      <div className="audit-value-list">
        {value.map((item, index) => (
          <span key={index}>
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="audit-nested">
        {Object.entries(value).map(([key, item]) => (
          <React.Fragment key={key}>
            <dt>{fieldLabel(key, locale)}</dt>
            <dd>
              <DetailValue value={item} locale={locale} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    );
  return String(value);
}
function DetailBlock({ title, value }) {
  const { locale } = useI18n();
  if (!value || (typeof value === "object" && !Object.keys(value).length))
    return null;
  return (
    <section className="audit-detail-block">
      <h3>{title}</h3>
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <React.Fragment key={key}>
            <dt>{fieldLabel(key, locale)}</dt>
            <dd>
              <DetailValue value={item} locale={locale} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

function AuditDrawer({ event, onClose }) {
  const { t } = useI18n();
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const { before, after, ...metadata } = event.metadata || {};
  return (
    <div
      className="audit-drawer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="audit-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
      >
        <header>
          <div>
            <span className={`outcome-tag ${event.outcome}`}>
              {t(`audit.outcomes.${event.outcome}`)}
            </span>
            <h2 id="audit-detail-title">{t("audit.detailTitle")}</h2>
            <EventTag type={event.eventType} />
          </div>
          <button
            ref={closeRef}
            className="mini-btn audit-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <div className="audit-drawer-body">
          <section className="audit-facts">
            <div>
              <span>{t("analytics.time")}</span>
              <strong>{new Date(event.occurredAt).toLocaleString()}</strong>
            </div>
            <div>
              <span>{t("analytics.actor")}</span>
              <strong>{event.actorUsername || t("audit.anonymous")}</strong>
              <small>{event.actorRole || "—"}</small>
            </div>
            <div>
              <span>{t("audit.target")}</span>
              <strong>
                {event.targetType || "—"} · {event.targetId || "—"}
              </strong>
            </div>
            <div>
              <span>IP</span>
              <strong>{event.ipPrefix || "—"}</strong>
              <small>
                {[event.browserFamily, event.osFamily, event.deviceClass]
                  .filter(Boolean)
                  .join(" / ") || "—"}
              </small>
            </div>
          </section>
          <DetailBlock title={t("audit.before")} value={before} />
          <DetailBlock title={t("audit.after")} value={after} />
          <DetailBlock title={t("audit.metadata")} value={metadata} />
        </div>
      </aside>
    </div>
  );
}

export function AuditTable() {
  const { t, errorMessage } = useI18n();
  const [rows, setRows] = useState([]),
    [pagination, setPagination] = useState({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    }),
    [pageSize, setPageSize] = useState(20),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const page = pagination.page;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api
      .getAuditEvents(page, pageSize)
      .then((result) => {
        if (live) {
          setRows(result.items);
          setPagination(result.pagination);
        }
      })
      .catch((err) => live && setError(errorMessage(err)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [page, pageSize, errorMessage]);
  const first = pagination.total
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0,
    last = Math.min(pagination.page * pagination.pageSize, pagination.total);
  function changePageSize(event) {
    const value = Number(event.target.value);
    setPageSize(value);
    setPagination((current) => ({ ...current, page: 1, pageSize: value }));
  }
  return (
    <div className="admin-panel audit-panel">
      <AdminPageHeader
        icon="shield"
        title={t("analytics.audit")}
        description={t("audit.description")}
        actions={
          <span className="chart-tag">
            {t("audit.records", { count: pagination.total })}
          </span>
        }
      />
      {error && <div className="error-text">{error}</div>}
      <div className={`audit-table ${loading ? "loading" : ""}`}>
        <table>
          <thead>
            <tr>
              <th>{t("analytics.time")}</th>
              <th>{t("analytics.event")}</th>
              <th>{t("analytics.actor")}</th>
              <th>{t("audit.target")}</th>
              <th>{t("analytics.outcome")}</th>
              <th aria-label={t("audit.view")}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex="0"
                onClick={() => setSelected(row)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && setSelected(row)
                }
              >
                <td>{new Date(row.occurredAt).toLocaleString()}</td>
                <td>
                  <EventTag type={row.eventType} />
                </td>
                <td>{row.actorUsername || t("audit.anonymous")}</td>
                <td>
                  {row.targetType
                    ? `${row.targetType} · ${row.targetId || "—"}`
                    : "—"}
                </td>
                <td>
                  <span className={`outcome-tag ${row.outcome}`}>
                    {t(`audit.outcomes.${row.outcome}`)}
                  </span>
                </td>
                <td>
                  <Icon name="link" size={14} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading && !error && (
          <div className="chart-empty">{t("analytics.noData")}</div>
        )}
        {loading && !rows.length && (
          <div className="chart-empty">{t("common.loading")}</div>
        )}
      </div>
      <div className="audit-pagination">
        <div className="audit-page-summary">
          <strong>
            {t("audit.rangeSummary", { first, last, total: pagination.total })}
          </strong>
          <span>
            {t("audit.pageSummary", {
              page: pagination.page,
              totalPages: pagination.totalPages,
            })}
          </span>
        </div>
        <div className="audit-page-controls">
          <label>
            <span>{t("audit.perPage")}</span>
            <select
              aria-label={t("audit.pageSize")}
              value={pageSize}
              disabled={loading}
              onChange={changePageSize}
            >
              {[10, 20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span>{t("audit.items")}</span>
          </label>
          <div className="audit-page-nav">
            <button
              className="pagination-btn"
              aria-label={t("audit.previous")}
              disabled={pagination.page <= 1 || loading}
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              <Icon name="chevronLeft" size={15} />
              <span>{t("audit.previous")}</span>
            </button>
            <span className="page-indicator">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              className="pagination-btn"
              aria-label={t("audit.next")}
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() =>
                setPagination((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              <span>{t("audit.next")}</span>
              <Icon name="chevronRight" size={15} />
            </button>
          </div>
        </div>
      </div>
      {selected && (
        <AuditDrawer event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
