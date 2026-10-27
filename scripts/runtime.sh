#!/usr/bin/env bash
# Shared runtime selection. A local install never changes your system Node.
SITE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$SITE_ROOT/.tools/node/bin/node" ]; then
  export PATH="$SITE_ROOT/.tools/node/bin:$PATH"
fi
export npm_config_cache="$SITE_ROOT/.cache/npm"
cd "$SITE_ROOT"
