#!/usr/bin/env bash
set -euo pipefail
"$(dirname "$0")/build.sh"
source "$(dirname "$0")/scripts/runtime.sh"
exec node scripts/server.mjs "$@"
