"""Loads the unpacked extension in headless Chromium against test/mock.html with mocked
API responses, opens /trade2/history, hovers the first row and saves a screenshot.

Usage: python3 test/render.py [out.png]
Needs: pip install playwright pillow && playwright install chromium
"""
import io
import sys
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
MOCK = ROOT / "test" / "mock.html"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "test" / "render.png"

# First entry is a real history entry (icon swapped) plus a few test-only fields
# (craftedMods, veiledMods, grantedSkills, flavourText, iconTierText) whose real shape is unconfirmed.
REAL = {
    "time": "2026-10-26T17:51:14+00:00",
    "item_id": "3595fea0",
    "item": {
        "realm": "poe2", "verified": False, "w": 2, "h": 3, "icon": "https://example.test/focus.png",
        "league": "Forbidden Rites", "sockets": [{"group": 0, "type": "rune"}],
        "name": "Wrath Ward", "typeLine": "Sacred Focus", "baseType": "Sacred Focus", "rarity": "Rare",
        "ilvl": 80, "identified": True, "corrupted": True,
        "properties": [
            {"name": "[Focus]", "values": [], "displayMode": 0, "type": 109},
            {"name": "[Quality]", "values": [["+20%", 1]], "displayMode": 0, "type": 6},
            {"name": "[EnergyShield|Energy Shield]", "values": [["406", 1]], "displayMode": 0, "type": 18},
        ],
        "requirements": [
            {"name": "Level", "values": [["75", 0]], "displayMode": 0, "type": 62},
            {"name": "[Intelligence|Int]", "values": [["107", 0]], "displayMode": 1, "type": 65},
        ],
        "explicitMods": [
            {"description": "+77 to maximum [EnergyShield|Energy Shield]", "flags": {"desecrated": True}},
            {"description": "42% increased [Critical|Critical Hit Chance] for [Spell|Spells]", "flags": {"desecrated": True}},
            {"description": "23% increased Cast Speed", "flags": {}},
        ],
        "craftedMods": [{"description": "+29 to maximum Mana", "flags": {}}],
        "veiledMods": ["DesecratedSuffix"],
        "grantedSkills": [{"name": "Grants Skill", "values": [["Level 11 [Fireball|Fireball]", 0]]}],
        "flavourText": ["Test flavour text."],
        "iconTierText": "T5",
        "desecrated": True, "frameType": 2, "frameTypeId": "Rare", "socketedItems": [],
    },
    "price": {"amount": 2, "currency": "chaos"},
}
SALES = [REAL] + [
    {"time": f"2026-10-2{4 - i % 3}T1{i}:00:00+00:00", "item_id": f"x{i}",
     "item": {"typeLine": "Exalted Orb", "rarity": "Currency", "stackSize": 10, "icon": "https://example.test/ex.png"},
     "price": {"amount": 15 * i + 1, "currency": "exalted"}}
    for i in range(4)
]
STATIC = {"result": [{"entries": [{"id": "chaos", "text": "Chaos Orb"}, {"id": "exalted", "text": "Exalted Orb"}]}]}


def png(w, h, color):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def handle(route):
    url = route.request.url
    if "/api/trade2/history/" in url:
        route.fulfill(json={"result": SALES})
    elif "/api/trade2/data/static" in url:
        route.fulfill(json=STATIC)
    elif url.endswith("focus.png"):
        route.fulfill(body=png(40, 60, (90, 60, 140)), content_type="image/png")
    elif url.endswith("ex.png"):
        route.fulfill(body=png(47, 47, (200, 170, 90)), content_type="image/png")
    else:
        route.fulfill(path=str(MOCK), content_type="text/html")


with sync_playwright() as p:
    # channel="chromium" = full headless Chromium; the default headless shell can't load extensions
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(), channel="chromium", headless=True,
        args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"],
        viewport={"width": 1200, "height": 640},
    )
    ctx.route("**/*", handle)
    page = ctx.new_page()
    page.goto("https://www.pathofexile.com/trade2/history")
    page.wait_for_timeout(1500)
    order = page.evaluate(
        "[...document.querySelectorAll('.nav.account li')]"
        ".sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left)"
        ".map(l=>l.textContent.trim())"
    )
    print("tab injected:", page.locator(".poeh-tab").count() == 1)
    print("panel open on /trade2/history:", page.evaluate("document.body.classList.contains('poeh-on')"))
    print("account tabs on screen:", order)
    page.mouse.move(400, 145)
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT))
    print("screenshot:", OUT)
    ctx.close()
