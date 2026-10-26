# PoE2 Trade History

Brings back the **Merchant History** tab on the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2). GGG removed the tab from the site, but the data behind it still works. This extension adds the tab back so you can see what sold from your merchant tabs, for how much, and when.

- History tab in its original spot, before Settings
- League selector and refresh button, styled like the original page
- Item icons, rarity colors, and a hover tooltip with mods, properties and requirements
- Mod badges in the tooltip like the trade site: `C` crafted, `F` fractured, `D` desecrated
- Also shows unrevealed desecrated mods, granted skills, relics, unique flavour text and item descriptions
- Checkbox to mark a sale as reviewed (dims the row, saved per league)
- Keeps every sale it has seen, so your history outlives whatever the site still returns
- CSV export
- Opening `pathofexile.com/trade2/history` directly lands on the tab

## Privacy

Everything runs in your own browser, on pathofexile.com, using the session you're already logged in with. Nothing is sent anywhere else, and the extension never reads or stores your login. Sales are saved in the trade site's local storage on your machine.

## Install

Grab the files from the [latest release](https://github.com/Ktsierra/poe-history-addon/releases/latest).

### Firefox

Install it from Firefox Add-ons: _link coming once it's listed_.

### Chrome, Edge, Brave, Opera

Not on the Chrome Web Store, so it's installed manually:

1. Download `poe2-trade-history-<version>.zip` and unzip it somewhere you'll keep it. Don't delete the folder afterward; the browser loads it from there.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder (the one containing `manifest.json`).
5. Open the trade site and click **History**.

To update: download the new zip, replace the folder contents, then click the reload icon on the extension card.

### Safari (Mac, iPhone, iPad)

Use the free **Userscripts** app from the App Store:

1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) and enable it in Safari's extension settings, allowing it on pathofexile.com.
2. Download [`poe2-trade-history.user.js`](https://github.com/Ktsierra/poe-history-addon/releases/latest/download/poe2-trade-history.user.js) from the latest release.
3. In Userscripts, create a new script, paste the file's contents, and save.
4. Open the trade site and click **History**.

## Building

```bash
./scripts/build.sh
```

Outputs to `dist/`:

- `poe2-trade-history-<version>.zip`: the extension (Firefox and Chromium browsers)
- `poe2-trade-history.user.js`: the userscript (Safari)

The version comes from `extension/manifest.json`. Attach both files to a GitHub release; the userscript's update URL expects the asset name `poe2-trade-history.user.js`.

`scripts/make-icons.py` regenerates the icons (needs Pillow).

### Releasing

Bump `version` in `extension/manifest.json`, push, then run the **Release** workflow from the Actions tab (or push a `v<version>` tag). It runs `build.sh` and publishes both files to a GitHub release tagged `v<version>`.

## License

[MIT](LICENSE)

## Caveats

The history data comes from an internal trade site endpoint, the same one the original tab used. GGG can change or remove it at any time, and if they do, this breaks until it's updated.

---

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
