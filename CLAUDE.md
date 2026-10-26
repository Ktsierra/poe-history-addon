# PoE2 Trade History: project notes

Browser extension (plus a userscript build) that restores the **Merchant History** tab GGG removed from the PoE2 trade site (`pathofexile.com/trade2`). Owner: Jose (GitHub `Ktsierra`). Distributed via GitHub releases; Firefox build goes to Firefox Add-ons (AMO).

Current version: **0.3.3** (`extension/manifest.json` is the single source of the version). Repo: `Ktsierra/poe-history-addon` (public, MIT). Published as GitHub releases (latest v0.3.3); AMO submission in progress.

## Layout

```
extension/manifest.json   MV3 manifest, shared by Firefox and Chromium browsers
extension/content.js      all the logic; also becomes the userscript body
extension/icons/          16/32/48/128 PNGs (generated)
scripts/build.sh          -> dist/poe2-trade-history-<ver>.zip + dist/poe2-trade-history.user.js (needs jq, zip)
scripts/make-icons.py     regenerates icons (Pillow)
test/mock.html            stand-in trade page (same nav markup, float-right account tabs, boot config)
test/render.py            Playwright: loads the unpacked extension, mocks the API, screenshots the panel
README.md                 user-facing install instructions per browser
.github/workflows/release.yml  builds and publishes dist/ as release v<manifest version> (manual run or v* tag)
.github/release-notes.md  release body; __VERSION__ is substituted
```

## How the site and API work (verified against the live site, Oct 2026)

- `/trade2/history` still serves the normal trade page, but it boots with `"tab":"search"` and the current trade JS bundle has no history code. The SPA then rewrites the URL to `/trade2/search/...`. The script captures `location.pathname` at `document_start` before that happens, so direct links to `/trade2/history` open the panel.
- **Endpoint:** `GET /api/trade2/history/poe2/<league>` (URL-encoded league, e.g. `Forbidden%20Rites`). `/api/trade2/history/<league>` also returns 200. `/api/trade2/history?league=` is 404.
- **Auth:** the user's `POESESSID` session cookie, same-origin only. That's why this has to run on pathofexile.com (extension/userscript) and not as a hosted site. Never collect or store the session cookie.
- **Response:** `{ result: [ { time, item_id, item, price: { amount, currency } } ] }`. `currency` is an id like `chaos` / `exalted`.
- **Item keys seen in real data:** baseType, corrupted, descrText, desecrated, enchantMods, explicitMods, flavourText, fractured, frameType, frameTypeId, grantedSkills, h, icon, iconTierText, id, identified, ilvl, implicitMods, isRelic, league, name, properties, rarity, realm, requirements, runeMods, socketedItems, sockets, typeLine, veiledMods, verified, w.
- **Mods** are objects `{ description, flags: { desecrated: true, ... } }`, not strings. There is **no tier/affix data** (no `extended`, no `tier`). Text uses markup `[Tag|Display]` and `[Tag]`; `clean()` strips it.
- Shapes **not yet confirmed with real data:** `veiledMods`, `grantedSkills`, `iconTierText`, `flavourText`, `descrText`, `craftedMods`/`fracturedMods`. The code handles strings or objects defensively.
- Currency names/icons: `GET /api/trade2/data/static` -> `result[].entries[] { id, text, image }`.
- League list: parsed from the inline boot script `app.mount({... "leagues": [...] ...})`, filtered to realm `poe2`. Standard can come first, so the default is the first league `isChallenge()` accepts (not Standard/Hardcore/HC/SSF/Ruthless/private), unless the user picked one in the dropdown.
- **Rate limit (seen Oct 26 2026):** policy `trade-history-request-limit`, per account. `X-Rate-Limit-Account: 5:60:60,10:600:120,15:10800:3600` (max:period:penalty, seconds), state in `X-Rate-Limit-Account-State` (hits:period:active penalty), `Retry-After` on 429. Requests made during a lockout still count toward the windows, so a client that keeps retrying stays locked out. The old auto-fetch-on-every-open burned 20 requests in 3 hours of testing and got a 1h lockout.
- **Nav:** the account tabs (`ul.nav.account`, About/Settings) float right, so DOM order is reversed on screen. Appending the tab puts it leftmost, before Settings, which is where the original sat. `placeTab()` also checks positions and prepends if the layout changes.
- The site's CSS still styles `li.menu-history` and draws the original coins icon, so the tab has no icon of its own.
- The trade app is Vue and re-renders the nav, so a MutationObserver re-injects the tab/panel if they disappear.

## Implementation notes

- **Firefox:** content-script `fetch()` runs with the extension's principal; `content.fetch()` runs as the page so the session cookie is sent. `pageFetch()` uses `content.fetch` when available and parses `text()` itself to avoid Xray wrappers on page objects. This path has only been reasoned about, not tested in a real Firefox yet.
- **Storage:** page `localStorage` (same origin for extension and userscript), keys `poeh:sales:<league>` (merged by `item_id|time`, newest first), `poeh:checked:<league>`, `poeh:fetched:<league>` (last fetch time), `poeh:picked-league` (only written when the user picks one; the old `poeh:league` key was written on every load and is ignored now), `poeh:limit` (rate limit rules, request log, lockout end). Sales accumulate so history outlives what the API returns.
- **Rate limiting:** opening the tab only fetches if that league's data is older than `AUTO_REFRESH_MS` (15 min); the refresh button forces it. Every history request is logged; `limitWaitMs()` blocks any request that would break a rule, and `noteLimits()` syncs with the server's state header (if the server counted more than the log, the extra hits are assumed to be from just now) and `Retry-After`. Blocked requests are never sent; the panel shows a notice with the wait.
- All API strings go through `esc()`. Markup is inserted with `setHtml()` (DOMParser + `replaceChildren`), not `innerHTML`, so `web-ext lint` stays clean. The only `innerHTML` left is the tab's static literal.
- Constants at the top of `content.js`: `SHOW_ICONS`, `ICON_SIZE` (48).

## Decisions made with the owner

- Match the original page's look: "Merchant History" title with underline, dark league dropdown, circular refresh icon, rows `Sold: <item> For: <n>x <Currency>` in small caps with `fromNow` times ("3 hours ago", "a day ago"), currency name in currency color. The original had no item icons; the owner wants them kept, at 48px.
- Checkbox = "mark as reviewed" (dims row, saved per league). It's our own feature; what the original checkbox did is unknown.
- Mod badges: **flag badges only** (`C` crafted, `F` fractured, `D` desecrated). Prefix/suffix tiers aren't in the data. Inferring tiers from bundled game data (RePoE PoE2 export at repoe-fork.github.io/poe2) was offered and **declined**; don't add it unless asked.
- Filter box was removed for fidelity; CSV export and the saved-count live in a small footer.
- No Chrome Web Store (fee). Chromium users "Load unpacked". Safari users run the userscript in the free Userscripts app; a real Safari extension needs Xcode plus the paid Apple Developer Program.
- Distribution: Firefox via AMO, Chrome/Edge via the GitHub release zip (Load unpacked), Safari via the userscript. README only offers the userscript for Safari; don't pitch it for Firefox or other browsers.

## Firefox / AMO

- `browser_specific_settings.gecko`: id `poe2-trade-history@ktsierra`, `strict_min_version` 140.0, `data_collection_permissions.required: ["none"]` (required for new AMO extensions since Nov 3, 2025); `gecko_android.strict_min_version` 142.0.
- `npx web-ext lint --source-dir extension`: 0 errors, 0 warnings (since 0.3.2). Keep it that way: insert markup with `setHtml()`, never a dynamic `innerHTML`.

## Testing

```bash
pip install playwright pillow && playwright install chromium
python3 test/render.py            # writes test/render.png, prints tab/panel checks
```

Must use `channel="chromium"` (full headless Chromium); the default headless shell doesn't load extensions. The real site can't be reached from the cloud sandbox, so real-site checks are done by the owner in their browser.

## Open items

- Owner to test 0.3.3 on the live site in Firefox (content.fetch path) and Chrome.
- Check real shapes of `veiledMods`, `grantedSkills`, `iconTierText` once a sale with them shows up.
- AMO submission, then put the listing link in README (placeholder text is there now). Release Firefox only installs signed add-ons, so the plain zip isn't enough for Firefox users. Unlisted AMO submission returns a signed `.xpi` that could go in the GitHub release instead.
- Repo URLs live in manifest `homepage_url`, the `build.sh` userscript header, README and `.github/release-notes.md`. Update all of them if the repo is renamed. The userscript `@updateURL` expects the release asset name `poe2-trade-history.user.js`.

## Writing style for docs and replies

Owner prefers concise, casual, practical text and no em dashes.
