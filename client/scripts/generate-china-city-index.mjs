import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import cityTimezones from "city-timezones";
import cityRows from "province-city-china/dist/city.json" with { type: "json" };
import provinceRows from "province-city-china/dist/province.json" with { type: "json" };
import { pinyin } from "pinyin-pro";
import { topology } from "topojson-server";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
const stripSuffix = (value) =>
  String(value || "").replace(/(特别行政区|自治州|地区|盟|省|市)$/u, "");
const administrativeRows = new Map();
for (const row of [
  ...cityRows,
  ...provinceRows.filter((row) =>
    ["11", "12", "31", "50", "81", "82"].includes(String(row.province)),
  ),
]) {
  const key = normalize(
    pinyin(stripSuffix(row.name), { toneType: "none", type: "array" }).join(""),
  );
  if (key) administrativeRows.set(key, [...(administrativeRows.get(key) || []), row]);
}
const provinceCodes = new Map(provinceRows.map((row) => [String(row.province), row]));
const timezoneProvinceCodes = {
  Anhui: "34", Beijing: "11", Chongqing: "50", Fujian: "35", Gansu: "62",
  Guangdong: "44", Guangxi: "45", Guizhou: "52", Hainan: "46", Hebei: "13",
  Heilongjiang: "23", Henan: "41", Hubei: "42", Hunan: "43", Jiangsu: "32",
  Jiangxi: "36", Jilin: "22", Liaoning: "21", "Nei Mongol": "15", Ningxia: "64",
  "Ningxia Hui": "64", Qinghai: "63", Shaanxi: "61", Shandong: "37", Shanghai: "31",
  Shanxi: "14", Sichuan: "51", Tianjin: "12", Taiwan: "71", "Xinjiang Uygur": "65",
  Xizang: "54", Yunnan: "53", Zhejiang: "33", Hongkong: "81", Macau: "82",
};
const byName = new Map();
for (const row of cityTimezones.cityMapping) {
  const key = normalize(row.city_ascii || row.city);
  if (!key || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
  const lookupKey = `${row.iso2}:${key}`,
    current = byName.get(lookupKey);
  if (current && Number(current.population || 0) >= Number(row.pop || 0)) continue;
  const isChina = row.iso2 === "CN",
    expectedProvinceCode = isChina ? String(timezoneProvinceCodes[row.province] || "") : "",
    administrative = isChina ? (administrativeRows.get(key) || []).find((item) => String(item.province) === expectedProvinceCode)
      || (administrativeRows.get(key) || [])[0] : null,
    provinceCode = String(administrative?.province || expectedProvinceCode);
  byName.set(lookupKey, {
    name: row.city_ascii || row.city,
    label: administrative?.name || row.city || row.city_ascii,
    countryCode: row.iso2,
    province: row.province || "",
    provinceCode,
    provinceLabel: provinceCodes.get(provinceCode)?.name || row.province || "",
    cityCode: administrative?.code || (provinceCode && ["11", "12", "31", "50", "81", "82"].includes(provinceCode) ? `${provinceCode}0000` : ""),
    latitude: Number(Number(row.lat).toFixed(5)),
    longitude: Number(Number(row.lng).toFixed(5)),
    population: Math.round(Number(row.pop) || 0),
  });
}
const rows = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
const output = `// Generated from city-timezones 1.3.4 and province-city-china 8.5.8.\n// Both source packages are MIT licensed; see THIRD_PARTY_NOTICES.md.\nexport default ${JSON.stringify(rows, null, 2)};\n`;
fs.mkdirSync(path.join(root, "src", "data"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "data", "worldCityIndex.js"), output);

const china = require("china-map-geojson/lib/china.js");
const provinceMaps = require("china-map-geojson/lib/province/index.js");
const provinceModuleCodes = {
  Anhui:"34", Aomen:"82", Beijing:"11", Chongqing:"50", Fujian:"35", Gansu:"62",
  Guangdong:"44", Guangxi:"45", Guizhou:"52", Hainan:"46", Hebei:"13", Henan:"41",
  Heilongjiang:"23", Hubei:"42", Hunan:"43", Jilin:"22", Jiangsu:"32", Jiangxi:"36",
  Liaoning:"21", Neimenggu:"15", Ningxia:"64", Qinghai:"63", Shandong:"37", Shanxi_1:"14",
  Shanxi_3:"61", Shanghai:"31", Sichuan:"51", Taiwan:"71", Tianjin:"12", Xianggang:"81",
  Xinjiang:"65", Xizang:"54", Yunnan:"53", Zhejiang:"33",
};
const cityByChineseName = new Map(cityRows.map((row) => [row.name, row]));
const stripAdministrativeSuffix = (value) => String(value || "").replace(/(特别行政区|蒙古族藏族自治州|藏族羌族自治州|哈尼族彝族自治州|土家族苗族自治州|朝鲜族自治州|苗族侗族自治州|蒙古族藏族自治州|哈萨克自治州|回族自治州|彝族自治州|藏族自治州|自治州|地区|盟|省|市)$/u, "");
const cityByShortName = new Map(cityRows.map((row) => [stripAdministrativeSuffix(row.name), row]));
const provinceFeatures = china.features.map((feature) => {
  const code = String(feature.properties?.id || feature.id || "").padStart(2, "0");
  return {
    ...feature,
    properties: {
      ...feature.properties,
      code,
      name: provinceCodes.get(code)?.name || feature.properties?.name || code,
    },
  };
});
const topologyObjects = {
  provinces: { type: "FeatureCollection", features: provinceFeatures },
};
for (const [moduleName, collection] of Object.entries(provinceMaps)) {
  const provinceCode = provinceModuleCodes[moduleName];
  if (!provinceCode) continue;
  const isMunicipality = ["11", "12", "31", "50"].includes(provinceCode),
    sourceFeatures = isMunicipality
      ? provinceFeatures.filter((feature) => feature.properties.code === provinceCode)
      : collection.features;
  topologyObjects[`province_${provinceCode}`] = {
    type: "FeatureCollection",
    features: sourceFeatures.map((feature) => {
      const name = feature.properties?.name || "",
        row = isMunicipality
          ? { code:`${provinceCode}0000` }
          : cityByChineseName.get(name) || cityByShortName.get(stripAdministrativeSuffix(name));
      return {
        ...feature,
        properties: {
          ...feature.properties,
          name,
          code: row?.code || "",
          provinceCode,
        },
      };
    }),
  };
}
const administrativeTopology = topology(topologyObjects, 1e5);
const administrativeOutput = `// Generated from china-map-geojson 1.0.4 (ISC).\n// See THIRD_PARTY_NOTICES.md for source and accuracy limitations.\nexport default ${JSON.stringify(administrativeTopology)};\n`;
fs.writeFileSync(path.join(root, "src", "data", "chinaAdministrativeMap.js"), administrativeOutput);
console.log(`Generated ${rows.length} world city centers and ${Object.keys(topologyObjects).length - 1} Chinese provincial boundary layers.`);
