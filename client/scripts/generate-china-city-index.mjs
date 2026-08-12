import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cityTimezones from "city-timezones";
import cityRows from "province-city-china/dist/city.json" with { type: "json" };
import provinceRows from "province-city-china/dist/province.json" with { type: "json" };
import { pinyin } from "pinyin-pro";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
const stripSuffix = (value) =>
  String(value || "").replace(/(特别行政区|自治州|地区|盟|省|市)$/u, "");
const labels = new Map();
for (const row of [
  ...cityRows,
  ...provinceRows.filter((row) =>
    ["11", "12", "31", "50", "81", "82"].includes(String(row.province)),
  ),
]) {
  const key = normalize(
    pinyin(stripSuffix(row.name), { toneType: "none", type: "array" }).join(""),
  );
  if (key && !labels.has(key)) labels.set(key, row.name);
}
const byName = new Map();
for (const row of cityTimezones.cityMapping.filter((row) => row.iso2 === "CN")) {
  const key = normalize(row.city_ascii || row.city);
  if (!key || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
  const current = byName.get(key);
  if (current && Number(current.population || 0) >= Number(row.pop || 0)) continue;
  byName.set(key, {
    name: row.city_ascii || row.city,
    label: labels.get(key) || row.city,
    province: row.province || "",
    latitude: Number(Number(row.lat).toFixed(5)),
    longitude: Number(Number(row.lng).toFixed(5)),
    population: Math.round(Number(row.pop) || 0),
  });
}
const rows = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
const output = `// Generated from city-timezones 1.3.4 and province-city-china 8.5.8.\n// Both source packages are MIT licensed; see THIRD_PARTY_NOTICES.md.\nexport default ${JSON.stringify(rows, null, 2)};\n`;
fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "data", "chinaCityIndex.js"), output);
console.log(`Generated ${rows.length} Chinese city centers.`);
