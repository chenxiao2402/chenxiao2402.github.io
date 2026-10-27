#!/usr/bin/env bash
set -euo pipefail
"$(dirname "$0")/setup.sh"
source "$(dirname "$0")/scripts/runtime.sh"
exec node scripts/build.mjs
