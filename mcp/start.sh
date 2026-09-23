#!/usr/bin/env bash
# Lanza el servidor MCP del motor por stdio.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
exec node_modules/.bin/tsx server.ts
