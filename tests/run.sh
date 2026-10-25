#!/bin/zsh
# One command for all tests: tests/run.sh   (optional filter: tests/run.sh page)
# Uses Node from PATH, or the dev copy in ~/.local/node. Installs test-only packages on first run.
set -e
cd "${0:A:h}"
command -v node >/dev/null || export PATH="$HOME/.local/node/bin:$PATH"
if [ ! -d node_modules ]; then
  npm ci --ignore-scripts --no-audit --no-fund
  npx playwright install chromium
fi
node run-all.js "$@"
