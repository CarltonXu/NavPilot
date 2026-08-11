#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Download or update MaxMind GeoLite2 Country for NavPilot.

Usage:
  ./scripts/download-geoip.sh [--target DIR] [--restart]

Credentials are read from MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY. If the
license key is stored in a Docker/Kubernetes secret, set
MAXMIND_LICENSE_KEY_FILE instead. Missing values are prompted interactively.

Options:
  --target DIR  Destination directory (default: server/geoip)
  --restart     Restart the Docker Compose app after an atomic installation
  -h, --help    Show this help
EOF
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "${script_dir}/.." && pwd)"
target_dir="${project_dir}/server/geoip"
restart_app=false

while (($#)); do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || { echo "--target requires a directory" >&2; exit 2; }
      target_dir="$2"
      shift 2
      ;;
    --restart)
      restart_app=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for command_name in curl tar mktemp; do
  command -v "${command_name}" >/dev/null 2>&1 || { echo "Required command not found: ${command_name}" >&2; exit 2; }
done

account_id="${MAXMIND_ACCOUNT_ID:-}"
license_key="${MAXMIND_LICENSE_KEY:-}"
if [[ -z "${license_key}" && -n "${MAXMIND_LICENSE_KEY_FILE:-}" ]]; then
  [[ -r "${MAXMIND_LICENSE_KEY_FILE}" ]] || { echo "MAXMIND_LICENSE_KEY_FILE is not readable" >&2; exit 2; }
  license_key="$(<"${MAXMIND_LICENSE_KEY_FILE}")"
fi
if [[ -z "${account_id}" && -t 0 ]]; then
  read -r -p "MaxMind account ID: " account_id
fi
if [[ -z "${license_key}" && -t 0 ]]; then
  read -r -s -p "MaxMind license key: " license_key
  printf '\n'
fi
[[ "${account_id}" =~ ^[0-9]+$ ]] || { echo "MAXMIND_ACCOUNT_ID must be a numeric account ID" >&2; exit 2; }
[[ "${license_key}" =~ ^[A-Za-z0-9_-]{8,160}$ ]] || { echo "MAXMIND_LICENSE_KEY is missing or invalid" >&2; exit 2; }

mkdir -p -- "${target_dir}"
lock_dir="${target_dir}/.download.lock"
if ! mkdir -- "${lock_dir}" 2>/dev/null; then
  echo "Another GeoIP download is already running: ${lock_dir}" >&2
  exit 3
fi
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/navpilot-geoip.XXXXXX")"
cleanup() {
  rm -rf -- "${temp_dir}"
  rmdir -- "${lock_dir}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

archive="${temp_dir}/GeoLite2-Country.tar.gz"
checksum_file="${temp_dir}/GeoLite2-Country.tar.gz.sha256"
netrc_file="${temp_dir}/maxmind.netrc"
download_url="https://download.maxmind.com/geoip/databases/GeoLite2-Country/download"
printf 'machine download.maxmind.com\nlogin %s\npassword %s\n' "${account_id}" "${license_key}" >"${netrc_file}"
chmod 0600 "${netrc_file}"
unset license_key
curl_options=(--fail --location --silent --show-error --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 600 --netrc-file "${netrc_file}")

echo "Downloading GeoLite2 Country from MaxMind..."
curl "${curl_options[@]}" "${download_url}?suffix=tar.gz" --output "${archive}"
curl "${curl_options[@]}" "${download_url}?suffix=tar.gz.sha256" --output "${checksum_file}"

expected_checksum="$(awk 'NR==1 {print $1}' "${checksum_file}")"
[[ "${expected_checksum}" =~ ^[A-Fa-f0-9]{64}$ ]] || { echo "MaxMind returned an invalid SHA256 file" >&2; exit 4; }
if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "${archive}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum="$(shasum -a 256 "${archive}" | awk '{print $1}')"
else
  echo "sha256sum or shasum is required to verify the database archive" >&2
  exit 2
fi
[[ "${actual_checksum}" == "${expected_checksum}" ]] || { echo "GeoIP archive SHA256 verification failed" >&2; exit 4; }

mkdir -p -- "${temp_dir}/extract"
tar -xzf "${archive}" -C "${temp_dir}/extract"
database_file="$(find "${temp_dir}/extract" -type f -name 'GeoLite2-Country.mmdb' -print -quit)"
[[ -n "${database_file}" ]] || { echo "GeoLite2-Country.mmdb was not found in the archive" >&2; exit 4; }

pending_file="${target_dir}/.GeoLite2-Country.mmdb.new"
cp -- "${database_file}" "${pending_file}"
chmod 0644 "${pending_file}"
mv -f -- "${pending_file}" "${target_dir}/GeoLite2-Country.mmdb"
echo "Installed: ${target_dir}/GeoLite2-Country.mmdb"

if [[ "${restart_app}" == true ]]; then
  command -v docker >/dev/null 2>&1 || { echo "Docker is required for --restart" >&2; exit 2; }
  (cd -- "${project_dir}" && docker compose restart app)
fi

echo "GeoIP update completed. Verify with: curl -s http://127.0.0.1:8787/api/health"
