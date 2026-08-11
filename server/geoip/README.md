# GeoIP runtime data

This directory is a runtime mount point for an optional MaxMind
`GeoLite2-Country.mmdb` or compatible GeoIP2 Country database.

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
