# Third-party data notices

## World city center index

`client/src/data/worldCityIndex.js` is a generated, approximate world
city-center index used only to position aggregated city-level analytics
markers. It does not contain visitor coordinates or IP address data.

The generated index derives city coordinates from `city-timezones` 1.3.4 and,
for China, administrative display names and codes from
`province-city-china` 8.5.8. Both source packages are distributed under the
MIT License. Their upstream repositories are:

- https://github.com/kevinroberts/city-timezones
- https://github.com/uiwjs/province-city-china

The index provides approximate city-center positions for visualization only;
it must not be interpreted as precise visitor geolocation.

## Chinese administrative analytics map

`client/src/data/chinaAdministrativeMap.js` is generated at build time from
`china-map-geojson` 1.0.4, distributed under the ISC License:

- https://github.com/twobin/china-map-geojson

NavPilot uses these geometries only for aggregated province and prefecture
analytics. Administrative names and boundaries may be historical,
generalized, incomplete, or unsuitable for legal, surveying, navigation, or
official-map purposes. Deployers are responsible for confirming that their
chosen map data and presentation satisfy applicable local requirements.
