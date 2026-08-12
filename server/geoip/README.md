# GeoIP runtime data

This directory is a runtime mount point for an optional MaxMind-compatible
Country MMDB and City MMDB. The City database may use the standard GeoIP2
City object shape or return a top-level `city` string.

The database is intentionally excluded from Git and from NavPilot container
images. It is not part of NavPilot and remains subject to its provider's own
license and update terms. Each operator must obtain and maintain their own
copy.

Install or update it interactively from the repository root:

```bash
./scripts/download-geoip.sh --restart
```

NavPilot continues to work without this file and can still use country headers
from explicitly trusted reverse proxies.

Optional city-level analytics use `geolite2-city-ipv4.mmdb` by default. The
file is never included in Git or the Docker image. City databases that cover
IPv4 only automatically fall back to the Country database for IPv6 country
recognition. City values are stored as aggregate analytics dimensions; exact
coordinates and full client IP addresses are not stored.
