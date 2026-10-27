#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/scripts/runtime.sh"

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  echo "Using installed Node $(node --version)."
else
  case "$(uname -s)" in
    Darwin) site_os=darwin ;;
    Linux) site_os=linux ;;
    *) echo "Use macOS, Linux, or Windows via WSL. See README.md." >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) site_arch=arm64 ;;
    x86_64|amd64) site_arch=x64 ;;
    *) echo "Unsupported CPU. Install Node.js 22 or newer, then rerun." >&2; exit 1 ;;
  esac
  for site_cmd in curl tar awk; do
    command -v "$site_cmd" >/dev/null || { echo "Please install $site_cmd first." >&2; exit 1; }
  done
  site_tmp="$(mktemp -d)"
  trap 'rm -rf "$site_tmp"' EXIT
  site_url="https://nodejs.org/dist/latest-v24.x"
  echo "Installing Node.js 24 LTS in .tools/node (no administrator access needed)…"
  curl --fail --silent --show-error --location --retry 3 "$site_url/SHASUMS256.txt" -o "$site_tmp/checksums"
  site_archive="$(awk -v suffix="-$site_os-$site_arch.tar.gz" 'length($2) >= length(suffix) && substr($2, length($2) - length(suffix) + 1) == suffix {print $2}' "$site_tmp/checksums")"
  [ -n "$site_archive" ] || { echo "No compatible Node release found." >&2; exit 1; }
  curl --fail --silent --show-error --location --retry 3 "$site_url/$site_archive" -o "$site_tmp/$site_archive"
  site_expected="$(awk -v name="$site_archive" '$2 == name {print $1}' "$site_tmp/checksums")"
  if command -v shasum >/dev/null 2>&1; then
    site_actual="$(shasum -a 256 "$site_tmp/$site_archive" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    site_actual="$(sha256sum "$site_tmp/$site_archive" | awk '{print $1}')"
  else
    echo "A SHA-256 verifier (shasum or sha256sum) is required." >&2; exit 1
  fi
  [ "$site_actual" = "$site_expected" ] || { echo "Node download checksum mismatch." >&2; exit 1; }
  mkdir -p "$site_tmp/node" .tools
  tar -xzf "$site_tmp/$site_archive" -C "$site_tmp/node" --strip-components=1
  rm -rf .tools/node
  mv "$site_tmp/node" .tools/node
  export PATH="$SITE_ROOT/.tools/node/bin:$PATH"
fi

site_fingerprint="$(node --input-type=module -e 'import fs from "node:fs"; import {createHash} from "node:crypto"; const h=createHash("sha256"); for (const f of ["package.json", "package-lock.json"]) if(fs.existsSync(f)) h.update(fs.readFileSync(f)); h.update(process.versions.node.split(".")[0]); console.log(h.digest("hex"))')"
if [ -d node_modules ] && { [ ! -f node_modules/.site-dependencies ] || [ "$(cat node_modules/.site-dependencies)" = "$site_fingerprint" ]; } && npm ls --omit=dev --depth=0 >/dev/null 2>&1 && node --input-type=module -e 'await import("marked"); await import("yaml")' >/dev/null 2>&1; then
  printf '%s\n' "$site_fingerprint" > node_modules/.site-dependencies
  echo "Dependencies already installed and up to date; skipping installation."
else
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
  site_fingerprint="$(node --input-type=module -e 'import fs from "node:fs"; import {createHash} from "node:crypto"; const h=createHash("sha256"); for (const f of ["package.json", "package-lock.json"]) if(fs.existsSync(f)) h.update(fs.readFileSync(f)); h.update(process.versions.node.split(".")[0]); console.log(h.digest("hex"))')"
  printf '%s\n' "$site_fingerprint" > node_modules/.site-dependencies
fi
echo "Ready. Run ./edit.sh to edit, or ./build.sh to compile."
