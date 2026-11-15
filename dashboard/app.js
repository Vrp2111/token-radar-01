// Token Radar dashboard: renders the board from window.RADAR (data.js), no network,
// no fetch. Filters and sorts are local; the detail view reads the row's own farm
// plan. Hash routing: #slug=<slug> opens a detail, #cat= / #chain= / #q= / #wl=1 /
// #sort= apply a filter on load, so each view has a shareable link.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.body.innerHTML = '<p style="padding:40px">Token Radar: no data loaded.</p>';
    return;
  }

  // ---- formatting -----------------------------------------------------------
  function money(v) {
    if (v === null || v === undefined) return '—';
    var a = Math.abs(v);
    if (a >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function age(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 365) return (v / 365).toFixed(1) + 'y';
    if (v >= 30) return Math.round(v / 30) + 'mo';
    return v + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  // ---- header stats --------------------------------------------------------
  $('as-of').textContent = D.as_of;
  $('source').textContent = D.source;
  $('board-count').textContent = String(D.board_size);
  var maxBase = 0;
  rows.forEach(function (r) { if (r.base_usd > maxBase) maxBase = r.base_usd; });
  var stats = [
    [D.board_size + '', 'protocols ranked'],
    [D.watchlist_size + '', 'on the watchlist'],
    [rows.filter(function (r) { return !r.watchlist; }).length + '', 'beyond the watchlist'],
    [money(D.total_implied_usd), 'total implied value'],
  ];
  $('stats').innerHTML = stats.map(function (s) {
    return '<div><dt>' + esc(s[1]) + '</dt><dd>' + esc(s[0]) + '</dd></div>';
  }).join('');

  // ---- category multiples table --------------------------------------------
  var multRows = Object.keys(D.multiples).map(function (cat) {
    return { cat: cat, multiple: D.multiples[cat].multiple, samples: D.multiples[cat].samples };
  }).sort(function (a, b) { return b.multiple - a.multiple; });
  $('multiples').innerHTML =
    '<thead><tr><th>Category</th><th class="num">Multiple</th><th class="num">Live protocols measured</th></tr></thead><tbody>' +
    multRows.map(function (m) {
      return '<tr><td>' + esc(m.cat) + '</td><td class="num">×' + m.multiple.toFixed(2) + '</td><td class="num">' + m.samples + '</td></tr>';
    }).join('') +
    '<tr><td>Other categories (global fallback)</td><td class="num">×' + D.global_multiple.toFixed(2) + '</td><td class="num">—</td></tr></tbody>';

  // ---- filter controls -----------------------------------------------------
  function counts(list, key) {
    var c = {};
    list.forEach(function (r) {
      var vals = key === 'chains' ? r.chains : [r.category || 'Uncategorized'];
      vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
    });
    return Object.keys(c).map(function (k) { return { k: k, n: c[k] }; }).sort(function (a, b) { return b.n - a.n; });
  }
  counts(rows, 'category').forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.k; o.textContent = c.k + ' (' + c.n + ')';
    $('cat').appendChild(o);
  });
  counts(rows, 'chains').forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.k; o.textContent = c.k + ' (' + c.n + ')';
    $('chain').appendChild(o);
  });

  var state = { q: '', cat: '', chain: '', wl: false, sort: 'value', slug: null, view: null };

  function readHash() {
    // A fresh read: reset first, so a hash change never inherits stale filters.
    state = { q: '', cat: '', chain: '', wl: false, sort: 'value', slug: null, view: null };
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || ''), v = decodeURIComponent(kv[1] || '');
      if (k === 'slug' && bySlug[v]) state.slug = v;
      else if (k === 'cat') state.cat = v;
      else if (k === 'chain') state.chain = v;
      else if (k === 'q') state.q = v;
      else if (k === 'wl') state.wl = v === '1';
      else if (k === 'view' && v === 'board') state.view = 'board';
      else if (k === 'sort' && ['value', 'tvl', 'growth', 'age', 'name'].indexOf(v) >= 0) state.sort = v;
    });
  }

  function writeHash() {
    var parts = [];
    if (state.slug) parts.push('slug=' + encodeURIComponent(state.slug));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.wl) parts.push('wl=1');
    if (state.sort !== 'value') parts.push('sort=' + state.sort);
    var h = parts.length ? '#' + parts.join('&') : '#';
    if (window.location.hash !== h) history.replaceState(null, '', h);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1); },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1); },
      growth: function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
      name: function (a, b) { return a.name.localeCompare(b.name); },
    }[state.sort];
    return list.sort(by);
  }

  function signalBadge(r) {
    return '<span class="badge ' + r.signal.toLowerCase() + '">' + esc(r.signal) + '</span>';
  }
  function growthCell(v) {
    if (v === null) return '<td class="num flat">—</td>';
    var cls = v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat';
    return '<td class="num ' + cls + '">' + pct(v) + '</td>';
  }

  // ---- board ---------------------------------------------------------------
  function renderBoard() {
    var list = filtered();
    var html = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.slug === r.slug ? ' class="active"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + (r.watchlist ? '<span class="wl-dot" title="Watchlist"></span>' : '') + esc(r.name) + '</span>' +
        '<span class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        growthCell(r.change_7d) +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
        '<td>' + signalBadge(r) + '</td></tr>';
    }).join('');
    $('rows').innerHTML = html;
    $('empty').hidden = list.length > 0;
    var shown = list.length;
    $('showing').textContent = 'Showing ' + shown + ' of ' + rows.length + ' protocols' +
      (state.cat ? ' in ' + state.cat : '') + (state.chain ? ' on ' + state.chain : '') +
      (state.wl ? ' (watchlist only)' : '') + ' · ' + money(list.reduce(function (n, r) { return n + r.implied_value_usd; }, 0)) + ' combined implied value.';
  }

  // ---- detail --------------------------------------------------------------
  function splitStep(s) {
    var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/s);
    if (!m) return { text: s, cost: '', time: '' };
    return { text: m[1], cost: m[2], time: m[3] };
  }
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    state.slug = slug;
    var mult = D.multiples[r.category || 'Uncategorized'];
    $('detail-kicker').textContent = (r.watchlist ? 'Watchlist · rank #' + r.rank : 'Early find · rank #' + r.rank) + ' · ' + r.signal;
    $('detail-h').textContent = r.name;
    $('detail-sub').textContent = r.slug + ' · ' + (r.category || 'Uncategorized') + ' · ' + r.chains.join(', ') +
      (r.listed_at ? ' · tracked since ' + r.listed_at : '');
    $('detail-stats').innerHTML = [
      ['Implied value', money(r.implied_value_usd)],
      ['TVL', money(r.tvl_usd)],
      ['7-day growth', pct(r.change_7d)],
      ['Age with no token', age(r.age_days)],
      ['Category multiple', '×' + r.multiple.toFixed(2) + (mult ? ' (' + mult.samples + ' live)' : ' (global)')],
    ].map(function (s) { return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('');
    var bars = [
      ['TVL × multiple', '$' + r.base_usd.toLocaleString('en-US'), Math.sqrt(r.base_usd / maxBase) * 100],
      ['Growth ×' + r.growth_multiplier.toFixed(2), '7d ' + pct(r.change_7d), Math.max(0, Math.min(100, (r.growth_multiplier - 0.8) / 1.25 * 100))],
      ['Maturity ×' + r.maturity_multiplier.toFixed(2), age(r.age_days) + ' old', (r.maturity_multiplier - 0.7) / 0.3 * 100],
      ['Momentum ×' + r.momentum_multiplier.toFixed(2), r.momentum_multiplier > 1 ? 'growing fast' : 'no bonus', r.momentum_multiplier > 1 ? 100 : 4],
    ];
    $('breakdown').innerHTML = bars.map(function (b) {
      return '<div class="bd-row"><span class="lbl">' + esc(b[0]) + '</span><span class="bar"><i style="width:' + Math.round(b[2]) + '%"></i></span><span class="val">' + esc(b[1]) + '</span></div>';
    }).join('');
    $('steps').innerHTML = r.farm_steps.map(function (s) {
      var p = splitStep(s);
      return '<li><div><p>' + esc(p.text) + '</p><p class="meta"><b>Cost:</b> ' + esc(p.cost) + ' · <b>Time:</b> ' + esc(p.time) + '</p></div></li>';
    }).join('');
    $('detail-note').textContent = (r.watchlist
      ? r.name + ' is on the watchlist: at or above $50M of TVL, recording no token, and not a wrapped, staked or bridged product of a token that trades.'
      : r.name + ' is below the watchlist floor — an early find the radar surfaced from the snapshot, not from the watchlist.') +
      ' It records no token in this snapshot; that is the record, not proof it has none. Never pay anyone to claim an airdrop for you.';
    $('detail').hidden = false;
    renderBoard();
    writeHash();
    $('detail').scrollIntoView({ block: 'start' });
  }
  function closeDetail() {
    state.slug = null;
    $('detail').hidden = true;
    renderBoard();
    writeHash();
  }

  // ---- live table ----------------------------------------------------------
  $('live-rows').innerHTML = D.live.map(function (p) {
    return '<tr><td><span class="name">' + esc(p.name) + '</span><span class="sub">' + esc(p.slug) + ' · ' + esc(p.category || 'Uncategorized') + '</span></td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.ratio === null ? '—' : '×' + p.ratio.toFixed(2)) + '</td>' +
      growthCell(p.change_7d) + '</tr>';
  }).join('');

  // ---- events --------------------------------------------------------------
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('detail-close').addEventListener('click', closeDetail);
  function syncFromControls() {
    state.q = $('q').value;
    state.cat = $('cat').value;
    state.chain = $('chain').value;
    state.wl = $('wl').checked;
    state.sort = $('sort').value;
    renderBoard();
    writeHash();
  }
  ['q', 'cat', 'chain', 'wl', 'sort'].forEach(function (id) {
    $(id).addEventListener(id === 'q' ? 'input' : 'change', syncFromControls);
  });
  $('reset').addEventListener('click', function () {
    state = { q: '', cat: '', chain: '', wl: false, sort: 'value', slug: null };
    $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('wl').checked = false; $('sort').value = 'value';
    closeDetail();
    renderBoard();
    writeHash();
  });
  window.addEventListener('hashchange', function () {
    var keep = state.slug;
    readHash();
    $('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain;
    $('wl').checked = state.wl; $('sort').value = state.sort;
    if (state.slug) openDetail(state.slug);
    else if (keep) closeDetail();
    else renderBoard();
    if (state.view === 'board') $('board').scrollIntoView({ block: 'start' });
  });

  // ---- init ----------------------------------------------------------------
  readHash();
  $('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain;
  $('wl').checked = state.wl; $('sort').value = state.sort;
  if (state.slug) openDetail(state.slug);
  else renderBoard();
  if (state.view === 'board') $('board').scrollIntoView({ block: 'start' });
})();
