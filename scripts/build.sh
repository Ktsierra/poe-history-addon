#!/usr/bin/env bash
# Builds dist/: the extension zip (Firefox + Chrome/Edge) and the userscript (Safari, or any userscript manager).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(jq -r .version extension/manifest.json)
NAME=poe2-trade-history
mkdir -p dist
rm -f "dist/$NAME-$VERSION.zip" "dist/$NAME.user.js"

# Extension: zip the folder contents (manifest.json must be at the zip root for AMO)
(cd extension && zip -qr -X "../dist/$NAME-$VERSION.zip" manifest.json content.js icons)

# Userscript: metadata header + the same content script
{
  cat <<HDR
// ==UserScript==
// @name         PoE2 Trade History
// @namespace    https://github.com/Ktsierra/poe-history-addon
// @version      $VERSION
// @description  Restores the Merchant History tab on the PoE2 trade site.
// @homepageURL  https://github.com/Ktsierra/poe-history-addon
// @downloadURL  https://github.com/Ktsierra/poe-history-addon/releases/latest/download/$NAME.user.js
// @updateURL    https://github.com/Ktsierra/poe-history-addon/releases/latest/download/$NAME.user.js
// @match        https://www.pathofexile.com/trade2*
// @match        https://*.pathofexile.com/trade2*
// @run-at       document-start
// @grant        none
// ==/UserScript==

HDR
  cat extension/content.js
} > "dist/$NAME.user.js"

echo "Built v$VERSION:"
ls -1 dist
