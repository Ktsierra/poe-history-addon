// PoE2 Trade History: restores the Merchant History tab on the PoE2 trade site.
// Shared by the browser extension (content script) and the userscript build.
// This product isn't affiliated with or endorsed by Grinding Gear Games in any way.

(() => {
  'use strict';

  const SHOW_ICONS = true; // item icon in each row (the original had none)
  const ICON_SIZE = 48;    // px

  const API = '/api/trade2';
  const REALM = 'poe2';
  const CDN = 'https://web.poecdn.com';
  const LS_SALES = 'poeh:sales:';
  const LS_CHECK = 'poeh:checked:';
  const LS_LEAGUE = 'poeh:league';

  // Capture before the trade app rewrites /trade2/history to /trade2/search
  const openOnLoad = /^\/trade2\/history/.test(location.pathname);

  const state = {
    league: null,
    leagues: [],
    sales: [],
    checked: new Set(),
    currencyIcons: {},
    currencyNames: {},
    open: false,
    loading: false,
    error: '',
  };

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const modText = m => {
    if (m == null || typeof m !== 'object') return m;
    const t = m.description ?? m.text ?? m.mod ?? m.value ?? m.name;
    return typeof t === 'string' ? t : JSON.stringify(m);
  };
  // PoE2 text uses [Tag|Display] and [Tag] markup
  const clean = s => String(modText(s) ?? '').replace(/\[([^|\]]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1');
  const rarityClass = r => ({ Normal: 'n', Magic: 'm', Rare: 'r', Unique: 'u', Currency: 'c', Gem: 'g' }[r] || 'n');
  const keyOf = s => `${s.item_id}|${s.time}`;
  const titleCase = s => String(s).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Same thresholds as moment.js fromNow(), which the original used
  function fromNow(iso) {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    const m = Math.round(s / 60), h = Math.round(m / 60), d = Math.round(h / 24);
    if (s < 45) return 'a few seconds ago';
    if (s < 90) return 'a minute ago';
    if (m < 45) return `${m} minutes ago`;
    if (m < 90) return 'an hour ago';
    if (h < 22) return `${h} hours ago`;
    if (h < 36) return 'a day ago';
    if (d < 26) return `${d} days ago`;
    if (d < 45) return 'a month ago';
    if (d < 320) return `${Math.round(d / 30.4)} months ago`;
    if (d < 548) return 'a year ago';
    return `${Math.round(d / 365)} years ago`;
  }

  const priceOf = s => {
    const p = s.price || {};
    return { amount: p.amount ?? '', cur: p.currency ?? '' };
  };
  const currencyName = id => state.currencyNames[id] || titleCase(id);

  // Firefox content scripts run fetch() with the extension's principal; content.fetch()
  // runs it as the page, so the trade site session cookie is sent. Parse text ourselves
  // to avoid Xray wrappers on page-compartment JSON.
  const hasPageFetch = typeof browser !== 'undefined' && !!browser.runtime?.id
    && typeof content !== 'undefined' && typeof content?.fetch === 'function';
  async function getJson(url) {
    const r = hasPageFetch ? await content.fetch(url, { credentials: 'include' }) : await fetch(url, { credentials: 'include' });
    if (r.status === 429) throw new Error(`Rate limited. Try again in ${r.headers.get('Retry-After') || 'a few'} seconds.`);
    return JSON.parse(await r.text());
  }

  const lsGet = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked or full */ } };

  function mergeSales(league, fresh) {
    const map = new Map(lsGet(LS_SALES + league, []).map(s => [keyOf(s), s]));
    for (const s of fresh) map.set(keyOf(s), s);
    const all = [...map.values()].sort((a, b) => new Date(b.time) - new Date(a.time));
    lsSet(LS_SALES + league, all);
    return all;
  }

  function selectLeague(id) {
    state.league = id;
    lsSet(LS_LEAGUE, id);
    state.sales = lsGet(LS_SALES + id, []);
    state.checked = new Set(lsGet(LS_CHECK + id, []));
  }

  // ---------- data ----------
  function readBootLeagues() {
    for (const sc of document.querySelectorAll('script')) {
      const m = sc.textContent.match(/app\.mount\((\{[\s\S]*\})\);\s*\}\)/);
      if (!m) continue;
      try {
        return (JSON.parse(m[1]).leagues || []).filter(l => !l.realm || l.realm === REALM);
      } catch { /* try next */ }
    }
    return [];
  }

  async function loadCurrencyData() {
    try {
      const j = await getJson(`${API}/data/static`);
      for (const g of j.result || []) {
        for (const e of g.entries || []) {
          if (!e.id) continue;
          if (e.image) state.currencyIcons[e.id] = e.image.startsWith('http') ? e.image : CDN + e.image;
          if (e.text) state.currencyNames[e.id] = e.text;
        }
      }
    } catch { /* names fall back to the id */ }
  }

  async function fetchHistory() {
    if (state.loading) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const j = await getJson(`${API}/history/${REALM}/${encodeURIComponent(state.league)}`);
      if (j.error) throw new Error(j.error.message || `Error ${j.error.code}`);
      state.sales = mergeSales(state.league, j.result || []);
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.loading = false;
      render();
    }
  }

  // ---------- UI ----------
  const ICON_REFRESH = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4L15 9h2.2A6 6 0 0 0 6.3 10.1L4.4 9.4A8 8 0 0 1 12 4zm-7.5 7L8 15H5.8a6 6 0 0 0 10.9-1.1l1.9.7A8 8 0 0 1 4.6 15H2z"/></svg>`;

  const css = `
  .poeh-panel{display:none;background:#000;min-height:420px;padding:8px 16px 24px;font-family:FontinSmallCaps,FontinRegular,serif;font-variant:small-caps}
  body.poeh-on .poeh-panel{display:block}
  body.poeh-on #trade > :not(.navigation):not(.poeh-panel){display:none!important}
  .poeh-col{max-width:732px}
  .poeh-head{display:flex;align-items:flex-end;gap:4px;margin-bottom:6px}
  .poeh-title{flex:1;color:#e2e2e2;font-size:14px;padding:6px 0 5px;border-bottom:1px solid #6b6b6b}
  .poeh-league{appearance:none;-moz-appearance:none;width:272px;background:#2b2b2b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='%23bbb'/%3E%3C/svg%3E") no-repeat right 12px center/9px 6px;color:#e2e2e2;border:0;padding:7px 30px 7px 12px;font:inherit;font-size:13px;font-variant:small-caps;cursor:pointer}
  .poeh-league option{background:#1b1b1b}
  .poeh-refresh{width:30px;height:30px;background:transparent;border:0;padding:4px;cursor:pointer}
  .poeh-refresh svg{width:22px;height:22px;fill:#e2e2e2}
  .poeh-refresh:hover svg{fill:#fff}
  .poeh-refresh:disabled{cursor:default}
  .poeh-refresh:disabled svg{animation:poeh-spin 1s linear infinite;opacity:.7}
  @keyframes poeh-spin{to{transform:rotate(360deg)}}
  .poeh-row{display:flex;align-items:center;gap:10px;min-height:31px;background:#171717;border-bottom:2px solid #0b0b0b;padding:0 12px 0 10px;cursor:default}
  .poeh-row:hover{background:#1e1e1e}
  .poeh-row.done{opacity:.45}
  .poeh-cb{appearance:none;-moz-appearance:none;flex:none;width:15px;height:15px;margin:0 4px 0 2px;background:#1f1f1f;border:1px solid #3a3a3a;cursor:pointer;position:relative}
  .poeh-cb:checked::after{content:'';position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid #e2c38a;border-width:0 2px 2px 0;transform:rotate(45deg)}
  .poeh-icow{flex:none;position:relative;line-height:0}
  .poeh-itier{position:absolute;right:0;bottom:2px;font:bold 11px/1 Verdana,sans-serif;color:#fff;text-shadow:0 0 2px #000,0 0 2px #000;font-variant:normal}
  .poeh-ico{flex:none;width:${ICON_SIZE}px;height:${ICON_SIZE}px;object-fit:contain;margin:3px 0}
  .poeh-txt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;color:#e2e2e2}
  .poeh-txt .l{color:#f0f0f0}
  .poeh-txt .nm{color:#e2e2e2}
  .poeh-txt .nm.m{color:#8888ff}.poeh-txt .nm.r{color:#ffff77}.poeh-txt .nm.u{color:#af6025}.poeh-txt .nm.g{color:#1ba29b}.poeh-txt .nm.c{color:#aa9e82}.poeh-txt .nm.relic{color:#82ad6a}
  .poeh-txt .amt{color:#fff}
  .poeh-txt .cur{color:#aa9e82}
  .poeh-ago{flex:none;font-size:12px;color:#e2e2e2;letter-spacing:.3px}
  .poeh-msg{padding:10px 12px;background:#171717;color:#aaa;font-size:14px}
  .poeh-msg.err{color:#d26a6a}
  .poeh-foot{display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#777}
  .poeh-foot a{color:#aa9e82;cursor:pointer;text-decoration:none}
  .poeh-foot a:hover{color:#e2c38a}
  .poeh-tip{position:fixed;z-index:99999;pointer-events:none;display:none;max-width:440px;min-width:240px;background:rgba(0,0,0,.94);border:1px solid #4a3f2c;text-align:center;font-family:FontinSmallCaps,FontinRegular,serif;font-size:14px}
  .poeh-tip .h{padding:5px 14px;background:#1a160e;border-bottom:1px solid #4a3f2c;color:#c8c8c8;font-size:16px;line-height:1.25}
  .poeh-tip .h.r{color:#ffff77}.poeh-tip .h.u{color:#af6025}.poeh-tip .h.m{color:#8888ff}.poeh-tip .h.c{color:#aa9e82}.poeh-tip .h.g{color:#1ba29b}.poeh-tip .h.relic{color:#82ad6a}
  .poeh-tip .sec{padding:4px 14px}
  .poeh-tip .sec + .sec{border-top:1px solid #2e281d}
  .poeh-tip .p{color:#7f7f7f}.poeh-tip .p b{color:#fff;font-weight:normal}
  .poeh-tip .mod{color:#8888ff}
  .poeh-tip .bm .mod{position:relative;padding-left:var(--g);text-align:left}
  .poeh-tip .bdgs{position:absolute;left:0;top:1px;display:flex;gap:2px}
  .poeh-tip .bdg{display:inline-block;min-width:22px;padding:0 3px;font:11px/16px Verdana,sans-serif;font-variant:normal;text-align:center;border:1px solid #4a3f2c;background:#14110b;color:#e2c38a}
  .poeh-tip .f-veiled{font-style:italic}
  .poeh-tip .fl{color:#af6025;font-style:italic}
  .poeh-tip .ds{color:#7f7f7f;font-style:italic;font-size:13px}
  .poeh-tip .f-fractured{color:#a29162}
  .poeh-tip .f-crafted{color:#b4b4ff}
  .poeh-tip .f-desecrated{color:#c6a6e8}
  .poeh-tip .cor{color:#d20000}
  `;

  let panel, tab, tip;

  function ensureNav() {
    const acct = document.querySelector('#trade .navigation ul.nav.account');
    if (!acct) return false;
    if (!acct.querySelector('.poeh-tab')) {
      tab = document.createElement('li');
      tab.className = 'poeh-tab menu-history';
      tab.setAttribute('role', 'presentation');
      // The site still styles .menu-history (it draws the coins icon), so no icon of our own
      tab.innerHTML = `<a href="/trade2/history" data-target="history"><span>History</span></a>`;
      tab.querySelector('a').addEventListener('click', e => { e.preventDefault(); openPanel(); });
      placeTab(acct);
      if (state.open) tab.classList.add('active');
    }
    if (!document.querySelector('#trade .poeh-panel')) {
      panel = document.createElement('div');
      panel.className = 'poeh-panel';
      document.querySelector('#trade .navigation').after(panel);
      panel.addEventListener('change', onChange);
      panel.addEventListener('click', onClick);
      panel.addEventListener('mousemove', onHover);
      panel.addEventListener('mouseleave', () => (tip.style.display = 'none'));
      render();
    }
    return true;
  }

  // The account tabs float right, so DOM order is reversed on screen. Append (shows
  // leftmost, before Settings); if the layout ever changes and that isn't leftmost, prepend.
  function placeTab(acct) {
    const others = [...acct.children].filter(li => li !== tab);
    acct.appendChild(tab);
    const lefts = others.map(li => li.getBoundingClientRect()).filter(r => r.width).map(r => r.left);
    const mine = tab.getBoundingClientRect();
    if (lefts.length && mine.width && mine.left > Math.min(...lefts)) acct.prepend(tab);
  }

  function openPanel() {
    state.open = true;
    document.body.classList.add('poeh-on');
    document.querySelectorAll('#trade .navigation li.active').forEach(li => li.classList.remove('active'));
    tab?.classList.add('active');
    if (location.pathname !== '/trade2/history') history.pushState({ poeh: 1 }, '', '/trade2/history');
    fetchHistory();
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;
    document.body.classList.remove('poeh-on');
    tab?.classList.remove('active');
    if (tip) tip.style.display = 'none';
  }

  function rowHtml(s, i) {
    const it = s.item || {};
    const full = [it.name, it.typeLine].filter(Boolean).map(clean).join(' ') || 'Unknown';
    const stack = it.stackSize > 1 ? `${it.stackSize}x ` : '';
    const { amount, cur } = priceOf(s);
    const done = state.checked.has(keyOf(s));
    return `<div class="poeh-row${done ? ' done' : ''}" data-i="${i}">
      <input type="checkbox" class="poeh-cb" ${done ? 'checked' : ''} title="Mark as reviewed">
      ${SHOW_ICONS && it.icon ? `<span class="poeh-icow"><img class="poeh-ico" src="${esc(it.icon)}" loading="lazy" alt="">${it.iconTierText ? `<span class="poeh-itier">${esc(clean(it.iconTierText))}</span>` : ''}</span>` : ''}
      <div class="poeh-txt"><span class="l">Sold:</span> <span class="nm ${it.isRelic ? 'relic' : rarityClass(it.rarity)}">${esc(stack + full)}</span> <span class="l">For:</span> ${amount !== '' ? `<span class="amt">${esc(amount)}x</span> <span class="cur">${esc(currencyName(cur))}</span>` : '<span class="cur">Unknown</span>'}</div>
      <div class="poeh-ago" title="${esc(new Date(s.time).toLocaleString())}">${fromNow(s.time)}</div>
    </div>`;
  }

  function render() {
    if (!panel) return;
    const opts = state.leagues.map(l => `<option value="${esc(l.id)}" ${l.id === state.league ? 'selected' : ''}>${esc(l.text || l.id)}</option>`).join('');
    let body = '';
    if (state.error) body += `<div class="poeh-msg err">${esc(state.error)}</div>`;
    if (state.sales.length) body += state.sales.map(rowHtml).join('');
    else if (!state.error) body += `<div class="poeh-msg">${state.loading ? 'Loading...' : 'No items sold.'}</div>`;

    panel.innerHTML = `<div class="poeh-col">
      <div class="poeh-head">
        <div class="poeh-title">Merchant History</div>
        <select class="poeh-league">${opts}</select>
        <button class="poeh-refresh" title="Refresh" ${state.loading ? 'disabled' : ''}>${ICON_REFRESH}</button>
      </div>
      <div class="poeh-list">${body}</div>
      ${state.sales.length ? `<div class="poeh-foot"><span>${state.sales.length} sales saved locally</span><a class="poeh-csv">Export CSV</a></div>` : ''}
    </div>`;
  }

  function onChange(e) {
    if (e.target.classList.contains('poeh-league')) {
      selectLeague(e.target.value);
      render();
      fetchHistory();
    } else if (e.target.classList.contains('poeh-cb')) {
      const row = e.target.closest('.poeh-row');
      const k = keyOf(state.sales[+row.dataset.i]);
      if (e.target.checked) state.checked.add(k); else state.checked.delete(k);
      row.classList.toggle('done', e.target.checked);
      lsSet(LS_CHECK + state.league, [...state.checked]);
    }
  }

  function onClick(e) {
    if (e.target.closest('.poeh-refresh')) fetchHistory();
    if (e.target.closest('.poeh-csv')) exportCsv();
  }

  function onHover(e) {
    const row = e.target.closest('.poeh-row');
    if (!row || e.target.classList.contains('poeh-cb')) { tip.style.display = 'none'; return; }
    const s = state.sales[+row.dataset.i];
    if (!s) return;
    if (tip.dataset.k !== keyOf(s)) {
      tip.dataset.k = keyOf(s);
      tip.innerHTML = tipHtml(s.item || {});
    }
    tip.style.display = 'block';
    const pad = 16, r = tip.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight) y = Math.max(4, innerHeight - r.height - 4);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function tipHtml(it) {
    // Mods are {description, flags:{desecrated, fractured, ...}}. Flags become color classes
    // and trade-site style badges: C crafted, F fractured, D desecrated.
    const FLAG_BADGE = { crafted: 'C', fractured: 'F', desecrated: 'D' };
    let maxBadges = 0;
    const modLine = (text, flags) => {
      const badges = flags.map(f => FLAG_BADGE[f]).filter(Boolean);
      maxBadges = Math.max(maxBadges, badges.length);
      const b = badges.map(x => `<span class="bdg">${x}</span>`).join('');
      return `<div class="mod ${esc(flags.map(f => 'f-' + f).join(' '))}">${b ? `<span class="bdgs">${b}</span>` : ''}${esc(text)}</div>`;
    };
    const mods = (arr, extraFlag) => (arr || []).map(m => {
      const flags = Object.keys(m?.flags || {}).filter(k => m.flags[k]);
      if (extraFlag && !flags.includes(extraFlag)) flags.push(extraFlag);
      return modLine(clean(m), flags);
    }).join('');
    // Unrevealed desecrated mods; the API may give a token like "DesecratedPrefix" or plain text
    const veiled = (it.veiledMods || []).map(v => {
      const t = clean(v);
      const label = /prefix/i.test(t) ? 'Unrevealed Prefix' : /suffix/i.test(t) ? 'Unrevealed Suffix' : (t || 'Unrevealed Modifier');
      return modLine(label, ['desecrated', 'veiled']);
    }).join('');

    const sec = html => (html ? `<div class="sec">${html}</div>` : '');
    const vals = p => (p?.values || []).map(v => (Array.isArray(v) ? v[0] : v)).join(', ');
    const propLine = p => {
      if (!p || typeof p !== 'object') return `<div class="p">${esc(clean(p))}</div>`;
      const name = clean(p.name ?? modText(p));
      return `<div class="p">${esc(name)}${vals(p) ? `: <b>${esc(clean(vals(p)))}</b>` : ''}</div>`;
    };
    const props = (it.properties || []).map(propLine).join('');
    const skills = (it.grantedSkills || []).map(propLine).join('');
    const reqs = (it.requirements || []).map(r => `${esc(clean(r.name))} <b>${esc(vals(r))}</b>`).join(', ');
    const runes = (it.sockets || []).filter(s => s.type === 'rune').length;
    const meta = (it.ilvl ? `<div class="p">Item Level: <b>${esc(it.ilvl)}</b></div>` : '')
      + (reqs ? `<div class="p">Requires: ${reqs}</div>` : '')
      + (runes ? `<div class="p">Rune Sockets: <b>${runes}</b></div>` : '');

    const enchants = mods(it.enchantMods) + mods(it.runeMods);
    const implicits = mods(it.implicitMods);
    const explicits = mods(it.fracturedMods, 'fractured') + mods(it.explicitMods)
      + mods(it.craftedMods, 'crafted') + mods(it.desecratedMods, 'desecrated') + veiled;
    const status = (it.identified === false ? '<div class="cor">Unidentified</div>' : '')
      + (it.corrupted ? '<div class="cor">Corrupted</div>' : '');
    const lines = v => (Array.isArray(v) ? v : v ? [v] : []).map(clean).filter(Boolean);
    const flavour = lines(it.flavourText).map(t => `<div class="fl">${esc(t)}</div>`).join('');
    const descr = lines(it.descrText).map(t => `<div class="ds">${esc(t)}</div>`).join('');

    const cls = it.isRelic ? 'relic' : rarityClass(it.rarity);
    // Badged items switch mod lines to left-aligned with a gutter sized to the most badges on a line
    const gutter = maxBadges ? 10 + maxBadges * 26 : 0;
    return `<div class="${gutter ? 'bm' : ''}" style="${gutter ? `--g:${gutter}px` : ''}">`
      + `<div class="h ${cls}">${it.name ? `${esc(clean(it.name))}<br>` : ''}${esc(clean(it.typeLine || 'Unknown'))}</div>`
      + sec(props) + sec(meta) + sec(skills)
      + sec(enchants) + sec(implicits) + sec(explicits)
      + sec(status) + sec(flavour) + sec(descr)
      + '</div>';
  }

  function exportCsv() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['time', 'name', 'type', 'rarity', 'stack', 'amount', 'currency', 'item_id'].join(',')];
    for (const s of state.sales) {
      const it = s.item || {};
      const { amount, cur } = priceOf(s);
      lines.push([s.time, clean(it.name), clean(it.typeLine), it.rarity, it.stackSize, amount, cur, s.item_id].map(q).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `poe2-sales-${state.league.replace(/\s+/g, '-')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- boot ----------
  function boot() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    tip = document.createElement('div');
    tip.className = 'poeh-tip';
    document.body.appendChild(tip);

    state.leagues = readBootLeagues();
    const saved = lsGet(LS_LEAGUE, null);
    const first = state.leagues.find(l => l.id === saved)?.id || state.leagues[0]?.id || 'Standard';
    if (!state.leagues.length) state.leagues = [{ id: first, text: first }];
    selectLeague(first);

    loadCurrencyData().then(render);

    // Close the panel when a native tab is clicked
    document.addEventListener('click', e => {
      const li = e.target.closest('#trade .navigation li');
      if (li && !li.classList.contains('poeh-tab')) closePanel();
    }, true);
    window.addEventListener('popstate', () => {
      if (location.pathname.startsWith('/trade2/history')) openPanel(); else closePanel();
    });

    // The trade app renders async and can re-render the nav, so keep re-injecting
    let opened = false;
    const tick = () => {
      if (ensureNav() && openOnLoad && !opened) { opened = true; openPanel(); }
    };
    new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
