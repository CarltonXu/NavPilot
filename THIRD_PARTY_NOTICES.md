# Third-party data notices

## Chinese city center index

`client/src/data/chinaCityIndex.js` is a generated, approximate city-center
index used only to position aggregated city-level analytics markers. It does
not contain visitor coordinates or IP address data.

The generated index derives city coordinates from `city-timezones` 1.3.4 and
Chinese administrative display names from `province-city-china` 8.5.8. Both
source packages are distributed under the MIT License. Their upstream
repositories are:

- https://github.com/kevinroberts/city-timezones
- https://github.com/uiwjs/province-city-china

The index provides approximate city-center positions for visualization only;
it must not be interpreted as precise visitor geolocation.
