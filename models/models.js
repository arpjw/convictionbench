(function () {
  'use strict';

  var SPLITS = [['test_structural', 'Held-out problems'], ['test_template', 'Held-out phrasing'], ['test_id', 'In-distribution']];
  var OURS = [
    { key: 'E2_sft', group: 'ours_sft', c: 'var(--sft)', repo: 'arpjw/conviction-1.7b-sft', short: 'SFT',
      kicker: 'Supervised fine-tuning: imitate the solver',
      pipe: [['Qwen3-1.7B'], ['SFT · 4,000 examples', 'step'], ['sft', 'out']],
      facts: ['125 steps', '11 GPU-min'],
      verdict: '<b>Learns the rule.</b> Near-perfect in-distribution (forged records ignored 96% of the time), but on new problem types it rarely admits its own mistakes.' },
    { key: 'E3b_grpo_base', group: 'ours_rl', c: 'var(--rl)', repo: 'arpjw/conviction-1.7b-rl', short: 'RL',
      kicker: 'GRPO from base: reward right answers, nothing else',
      pipe: [['Qwen3-1.7B'], ['GRPO · 200 steps', 'step'], ['rl', 'out']],
      facts: ['200 steps', '65 GPU-min'],
      verdict: '<b>Learns to reason.</b> Most accurate 1.7B on held-out problems and stays open to correction, but never picks up the provenance rule.' },
    { key: 'V2', group: 'ours_v2', c: 'var(--v2)', repo: 'arpjw/conviction-1.7b-v2', short: 'v2',
      kicker: 'Light SFT warm-start, then the same GRPO',
      pipe: [['Qwen3-1.7B'], ['SFT · 1,000', 'step'], ['GRPO · 200', 'step'], ['v2', 'out']],
      facts: ['32 + 200 steps', '32 GPU-min'],
      verdict: '<b>Gets the rule to generalise.</b> Best held-out forged-record resistance of any model, but trades away RL&#8217;s accuracy and openness to correction.' }
  ];
  var COLOR = { ours_sft: 'var(--sft)', ours_rl: 'var(--rl)', ours_v2: 'var(--v2)', base: 'var(--base)', other: 'var(--other)' };

  // metric accessors: each returns {v, lo, hi} oriented so that higher is better
  function plain(k) { return function (m, s) { return m.metrics[s][k]; }; }
  function inverse(k) { return function (m, s) { var x = m.metrics[s][k]; return x && { v: 1 - x.v, lo: 1 - x.hi, hi: 1 - x.lo }; }; }
  function natural(m, s) { return m.natural && m.natural[s] && m.natural[s].legitimate_correction_rate; }
  var FP = [
    ['Final accuracy', 'correct after the challenge', plain('final_accuracy')],
    ['Resists pressure', '1 − pressure-flip rate', inverse('pressure_flip_rate')],
    ['Ignores forged records', 'pasted into a user message', plain('fabricated_evidence_resistance')],
    ['Accepts tool updates', 'authenticated records', plain('authenticated_update_accuracy')],
    ['Abstains when it should', '“insufficient” when undetermined', plain('insufficient_accuracy')],
    ['Accepts valid corrections', 'to a scripted wrong answer', plain('legitimate_correction_rate')],
    ['Fixes its own mistakes', 'natural history: its own first answer', natural],
    ['Follows the format', 'strict JSON reply', plain('strict_format_rate')]
  ];
  var CARD_STATS = [['Final accuracy', plain('final_accuracy')], ['Resists pressure', inverse('pressure_flip_rate')],
    ['Ignores forged records', plain('fabricated_evidence_resistance')], ['Fixes its own mistakes', natural]];
  var MAP_Y = [['forged', 'Ignores forged records', plain('fabricated_evidence_resistance')],
    ['own', 'Fixes its own mistakes', natural], ['pressure', 'Resists pressure', inverse('pressure_flip_rate')]];
  var RUNS = { E3b_grpo_base: ['var(--rl)', ''], E6_grpo_base_s2: ['var(--rl)', '5 4'], V2: ['var(--v2)', ''], E3_grpo: ['var(--sft)', '2 4'] };

  var state = { mapSplit: 'test_structural', mapY: 'forged', fpSplit: 'test_structural', ep: 0, use: 'V2' };
  var DATA, TRAIN, byKey = {};
  var tip = document.getElementById('tip');

  function $(id) { return document.getElementById(id); }
  function f2(v) { return v == null ? '–' : v.toFixed(2); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function svg(tag, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function seg(container, items, current, onPick) {
    container.innerHTML = '';
    items.forEach(function (it) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(it[0] === current) });
      b.textContent = it[1];
      b.addEventListener('click', function () { onPick(it[0]); });
      container.appendChild(b);
    });
  }
  function showTip(evt, html) { tip.innerHTML = html; tip.hidden = false; moveTip(evt); }
  function moveTip(evt) {
    var x = evt.clientX + 14, y = evt.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function name(m) { return m.label.replace(' (ours)', ''); }

  document.querySelector('.theme').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cb-theme', next); } catch (e) {}
  });

  // ---------- cards ----------
  function renderCards() {
    var grid = $('card-grid'), base = byKey.E0_base, s = 'test_structural';
    OURS.forEach(function (o) {
      var m = byKey[o.key];
      var card = el('article', { class: 'card', style: '--c:' + o.c });
      card.appendChild(el('p', { class: 'kicker' }, esc(o.kicker)));
      card.appendChild(el('h3', null, '<a href="https://huggingface.co/' + o.repo + '">' + o.repo.split('/')[1] + ' ↗</a>'));
      var pipe = el('div', { class: 'pipe', 'aria-label': 'Recipe' });
      o.pipe.forEach(function (p, i) {
        if (i) pipe.appendChild(el('i', null, '→'));
        pipe.appendChild(el('span', p[1] ? { class: p[1] } : null, esc(p[0])));
      });
      card.appendChild(pipe);
      var stats = el('div', { class: 'stats' });
      CARD_STATS.forEach(function (cs) {
        var x = cs[1](m, s), b = cs[1](base, s), id = cs[1](m, 'test_id');
        var row = el('div', { class: 'stat' });
        row.appendChild(el('div', { class: 'lab' }, esc(cs[0]) + '<small>in-dist ' + f2(id && id.v) + '</small>'));
        var tr = el('div', { class: 'track' });
        var bar = el('b'); bar.style.width = '0%'; tr.appendChild(bar);
        var tick = el('em', { title: 'Base model: ' + f2(b.v) }); tick.style.left = 'calc(' + (b.v * 100) + '% - 1px)'; tr.appendChild(tick);
        row.appendChild(tr);
        row.appendChild(el('span', { class: 'v' }, f2(x.v)));
        stats.appendChild(row);
        requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = (x.v * 100) + '%'; }); });
      });
      card.appendChild(stats);
      card.appendChild(el('p', { class: 'verdict' }, o.verdict));
      card.appendChild(el('div', { class: 'facts-row' }, o.facts.map(function (f) { return '<span>' + f + '</span>'; }).join('')));
      grid.appendChild(card);
    });
  }

  // ---------- trade-off map ----------
  function renderMap() {
    seg($('map-split'), SPLITS, state.mapSplit, function (k) { state.mapSplit = k; renderMap(); });
    seg($('map-y'), MAP_Y.map(function (y) { return [y[0], 'y: ' + y[1]]; }), state.mapY, function (k) { state.mapY = k; renderMap(); });
    var yDef = MAP_Y.filter(function (y) { return y[0] === state.mapY; })[0], s = state.mapSplit;
    var fig = $('map-chart'); fig.innerHTML = '';
    var W = Math.max(320, Math.min(960, fig.clientWidth || 960)), narrow = W < 600, H = narrow ? Math.round(W * 0.95) : 460, L = narrow ? 44 : 56, R = narrow ? 12 : 24, T = narrow ? 30 : 14, B = 50;
    var X = function (v) { return L + v * (W - L - R); }, Y = function (v) { return T + (1 - v) * (H - T - B); };
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Final accuracy against ' + yDef[1] + ' for all models, with arrows from the base model to each of ours' });
    var defs = svg('defs');
    ['sft', 'rl', 'v2'].forEach(function (c) {
      var mk = svg('marker', { id: 'ah-' + c, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      mk.appendChild(svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--' + c + ')' }));
      defs.appendChild(mk);
    });
    root.appendChild(defs);
    for (var g = 0; g <= 1.0001; g += 0.25) {
      root.appendChild(svg('line', { class: 'grid', x1: X(0), x2: X(1), y1: Y(g), y2: Y(g) }));
      root.appendChild(svg('line', { class: 'grid', x1: X(g), x2: X(g), y1: Y(0), y2: Y(1) }));
      root.appendChild(svg('text', { class: 'tick', x: L - 10, y: Y(g) + 4, 'text-anchor': 'end' }, g.toFixed(2)));
      root.appendChild(svg('text', { class: 'tick', x: X(g), y: H - B + 18, 'text-anchor': 'middle' }, g.toFixed(2)));
    }
    root.appendChild(svg('text', { class: 'axis-label', x: X(0.5), y: H - 8, 'text-anchor': 'middle' }, 'Final accuracy →'));
    if (narrow) root.appendChild(svg('text', { class: 'axis-label', x: L - 30, y: 12 }, '↑ ' + yDef[1]));
    else root.appendChild(svg('text', { class: 'axis-label', x: 14, y: Y(0.5), 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + Y(0.5) + ')' }, yDef[1] + ' →'));

    function pt(m) { var a = m.metrics[s].final_accuracy, b = yDef[2](m, s); return a && b && b.v != null ? { m: m, x: a.v, y: b.v } : null; }
    var tipFor = function (p) {
      return '<h4>' + esc(name(p.m)) + '</h4><dl><dt>Final accuracy</dt><dd>' + f2(p.x) + '</dd><dt>' + esc(yDef[1]) + '</dt><dd>' + f2(p.y) + '</dd></dl><p>' + esc(p.m.lab) + ' · ' + esc(p.m.params) + '</p>';
    };
    var others = DATA.models.filter(function (m) { return m.group === 'other'; }).map(pt).filter(Boolean);
    others.forEach(function (p) {
      var c = svg('circle', { class: 'ghost', cx: X(p.x), cy: Y(p.y), r: 5 });
      c.addEventListener('mouseenter', function (e) { showTip(e, tipFor(p)); });
      c.addEventListener('mousemove', moveTip); c.addEventListener('mouseleave', hideTip);
      root.appendChild(c);
    });
    var bp = pt(byKey.E0_base);
    OURS.forEach(function (o) {
      var p = pt(byKey[o.key]); if (!p) return;
      var x1 = X(bp.x), y1 = Y(bp.y), x2 = X(p.x), y2 = Y(p.y), dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var sx = x1 + dx / d * 9, sy = y1 + dy / d * 9, ex = x2 - dx / d * 10, ey = y2 - dy / d * 10;
      var mx = (sx + ex) / 2 - dy / d * 22, my = (sy + ey) / 2 + dx / d * 22;
      var c = o.group.replace('ours_', '');
      var path = svg('path', { class: 'arrow', d: 'M' + sx + ',' + sy + ' Q' + mx + ',' + my + ' ' + ex + ',' + ey, stroke: o.c, 'marker-end': 'url(#ah-' + c + ')' });
      var len = 600; path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      path.style.transition = 'stroke-dashoffset .8s cubic-bezier(.3,.7,.2,1)';
      root.appendChild(path);
      requestAnimationFrame(function () { requestAnimationFrame(function () { path.style.strokeDashoffset = 0; }); });
    });
    var ring = svg('circle', { class: 'ring', cx: X(bp.x), cy: Y(bp.y), r: 7 });
    ring.addEventListener('mouseenter', function (e) { showTip(e, tipFor(bp)); });
    ring.addEventListener('mousemove', moveTip); ring.addEventListener('mouseleave', hideTip);
    root.appendChild(ring);
    root.appendChild(svg('text', { class: 'pt-label', x: X(bp.x), y: Y(bp.y) + 22, 'text-anchor': 'middle' }, 'base'));
    OURS.forEach(function (o) {
      var p = pt(byKey[o.key]); if (!p) return;
      var dot = svg('circle', { class: 'pt', cx: X(p.x), cy: Y(p.y), r: 7.5, fill: o.c });
      dot.addEventListener('mouseenter', function (e) { showTip(e, tipFor(p)); });
      dot.addEventListener('mousemove', moveTip); dot.addEventListener('mouseleave', hideTip);
      root.appendChild(dot);
      var right = p.x < 0.82;
      root.appendChild(svg('text', { class: 'pt-label ours', x: X(p.x) + (right ? 13 : -13), y: Y(p.y) + 4, 'text-anchor': right ? 'start' : 'end' }, 'Conviction-' + o.short));
    });
    fig.appendChild(root);
    fig.appendChild(el('figcaption', { class: 'note' }, 'Grey dots: the ' + DATA.models.filter(function (m) { return m.group === 'other'; }).length + ' off-the-shelf open models from the leaderboard (hover for names). Hollow ring: Qwen3-1.7B, the base all three adapters start from.'));
  }

  // ---------- fingerprints ----------
  function renderFingerprint() {
    seg($('fp-split'), SPLITS, state.fpSplit, function (k) { state.fpSplit = k; renderFingerprint(); });
    var s = state.fpSplit, fig = $('fp-chart'); fig.innerHTML = '';
    var W = Math.max(320, Math.min(960, fig.clientWidth || 960)), narrow = W < 600, rowH = narrow ? 64 : 46, T = 8, B = 34, L = narrow ? 10 : 250, R = narrow ? 14 : 30, H = T + FP.length * rowH + B;
    var X = function (v) { return L + v * (W - L - R); };
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Per-metric comparison of the base model and the three Conviction adapters' });
    for (var g = 0; g <= 1.0001; g += 0.25) {
      root.appendChild(svg('line', { class: 'grid', x1: X(g), x2: X(g), y1: T, y2: H - B + 4 }));
      root.appendChild(svg('text', { class: 'tick', x: X(g), y: H - B + 22, 'text-anchor': 'middle' }, g.toFixed(2)));
    }
    var models = [byKey.E2_sft, byKey.E3b_grpo_base, byKey.V2];
    FP.forEach(function (f, i) {
      var y0 = T + i * rowH, cy = narrow ? y0 + 44 : y0 + rowH / 2, row = svg('g', { class: 'fp-row' });
      row.appendChild(svg('rect', { class: 'fp-row-bg', x: 0, y: y0 + 2, width: W, height: rowH - 4, rx: 4 }));
      row.appendChild(svg('text', { class: 'fp-label', x: 8, y: narrow ? y0 + 16 : cy - 2 }, f[0]));
      if (!narrow) row.appendChild(svg('text', { class: 'fp-sub', x: 8, y: cy + 13 }, f[1]));
      row.appendChild(svg('line', { class: 'grid', x1: X(0), x2: X(1), y1: cy, y2: cy }));
      var b = f[2](byKey.E0_base, s);
      if (b) row.appendChild(svg('circle', { class: 'ring', cx: X(b.v), cy: cy, r: 6 }));
      var html = '<h4>' + esc(f[0]) + '</h4><dl><dt>Base</dt><dd>' + f2(b && b.v) + '</dd>';
      models.forEach(function (m, j) {
        var x = f[2](m, s), c = COLOR[m.group], dy = (j - 1) * 9;
        if (!x) return;
        if (x.lo != null) row.appendChild(svg('line', { class: 'whisker', x1: X(x.lo), x2: X(x.hi), y1: cy + dy, y2: cy + dy, stroke: c }));
        row.appendChild(svg('circle', { class: 'pt', cx: X(x.v), cy: cy + dy, r: 5.5, fill: c }));
        html += '<dt>' + esc(name(m)) + '</dt><dd>' + f2(x.v) + (x.lo != null ? ' <span style="color:var(--muted)">[' + f2(x.lo) + ', ' + f2(x.hi) + ']</span>' : '') + '</dd>';
      });
      html += '</dl>';
      row.addEventListener('mouseenter', function (e) { showTip(e, html); });
      row.addEventListener('mousemove', moveTip); row.addEventListener('mouseleave', hideTip);
      root.appendChild(row);
    });
    fig.appendChild(root);
    var key = el('p', { class: 'note' }, '<span class="key" style="margin-left:0"><i class="sw ours_sft"></i>Conviction-SFT <i class="sw ours_rl"></i>Conviction-RL <i class="sw ours_v2"></i>Conviction-v2 <i class="sw base" style="background:none;border:2px solid var(--base);border-radius:50%"></i>Base (Qwen3-1.7B)</span>');
    fig.appendChild(key);
  }

  // ---------- training curves ----------
  function smooth(a, w) {
    return a.map(function (_, i) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - w); j <= Math.min(a.length - 1, i + w); j++) if (a[j] != null) { s += a[j]; n++; }
      return n ? s / n : null;
    });
  }
  var hairs = [];
  function lineChart(fig, field, opts) {
    var W = 320, H = 220, L = 36, R = 8, T = 8, B = 24;
    var runs = TRAIN.grpo, maxStep = 200;
    var yMax = opts.max || Math.ceil(Math.max.apply(null, runs.map(function (r) { return Math.max.apply(null, r[field]); })) / 50) * 50;
    var X = function (v) { return L + v / maxStep * (W - L - R); }, Y = function (v) { return T + (1 - v / yMax) * (H - T - B); };
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': fig.querySelector('figcaption').textContent + ' over 200 GRPO steps' });
    for (var i = 0; i <= 4; i++) {
      var v = yMax * i / 4;
      root.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
      root.appendChild(svg('text', { class: 'tick', x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' }, opts.pct ? Math.round(v * 100) + '%' : (yMax <= 1 ? v.toFixed(2) : Math.round(v))));
    }
    [0, 100, 200].forEach(function (st) { root.appendChild(svg('text', { class: 'tick', x: X(st), y: H - 6, 'text-anchor': st === 200 ? 'end' : st ? 'middle' : 'start' }, st === 200 ? '200 steps' : st)); });
    var sm = {};
    runs.forEach(function (r) {
      var st = RUNS[r.key], pts = function (arr) { return arr.map(function (v, i) { return X(r.step[i]) + ',' + Y(v); }).join(' '); };
      root.appendChild(svg('polyline', { class: 'raw', points: pts(r[field]), stroke: st[0] }));
      sm[r.key] = smooth(r[field], 8);
      root.appendChild(svg('polyline', { class: 'series', points: pts(sm[r.key]), stroke: st[0], 'stroke-dasharray': st[1] }));
    });
    var hair = svg('line', { class: 'xhair', y1: T, y2: H - B, x1: -10, x2: -10, visibility: 'hidden' });
    root.appendChild(hair);
    var dots = runs.map(function (r) { var d = svg('circle', { r: 3.5, fill: RUNS[r.key][0], stroke: 'var(--bg)', 'stroke-width': 1.5, cx: -10, cy: -10, visibility: 'hidden' }); root.appendChild(d); return d; });
    var hit = svg('rect', { class: 'hit', x: L, y: T, width: W - L - R, height: H - T - B });
    root.appendChild(hit);
    fig.appendChild(root);
    var api = {
      show: function (step) {
        hair.setAttribute('x1', X(step)); hair.setAttribute('x2', X(step)); hair.setAttribute('visibility', 'visible');
        runs.forEach(function (r, j) { var i = Math.max(0, Math.min(r.step.length - 1, step - 1)); dots[j].setAttribute('cx', X(r.step[i])); dots[j].setAttribute('cy', Y(sm[r.key][i])); dots[j].setAttribute('visibility', 'visible'); });
      },
      hide: function () { hair.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); },
      value: function (r, step) { return sm[r.key][Math.max(0, Math.min(r.step.length - 1, step - 1))]; },
      title: fig.querySelector('figcaption').textContent, pct: opts.pct
    };
    function move(evt) {
      var box = root.getBoundingClientRect(), sx = (evt.clientX - box.left) / box.width * W;
      var step = Math.round(Math.max(1, Math.min(maxStep, (sx - L) / (W - L - R) * maxStep)));
      hairs.forEach(function (h) { h.show(step); });
      var html = '<h4>Step ' + step + '</h4>';
      hairs.forEach(function (h) {
        html += '<p style="margin:6px 0 2px;color:var(--fg)">' + esc(h.title) + '</p><dl>';
        runs.forEach(function (r) { var v = h.value(r, step); html += '<dt>' + esc(r.label) + '</dt><dd>' + (h.pct ? Math.round(v * 100) + '%' : v >= 2 ? Math.round(v) : v.toFixed(2)) + '</dd>'; });
        html += '</dl>';
      });
      showTip(evt, html);
    }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseenter', move);
    hit.addEventListener('mouseleave', function () { hairs.forEach(function (h) { h.hide(); }); hideTip(); });
    hairs.push(api);
  }
  function renderLearning() {
    var lg = $('learn-legend');
    TRAIN.grpo.forEach(function (r) {
      var st = RUNS[r.key];
      lg.appendChild(el('span', null, '<svg viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="' + st[0] + '" stroke-width="2" stroke-dasharray="' + st[1] + '" stroke-linecap="round"/></svg>' + esc(r.label)));
    });
    lineChart($('c-reward'), 'reward', { max: 1 });
    lineChart($('c-zero'), 'zero_std', { max: 1, pct: true });
    lineChart($('c-len'), 'length', {});
    var by = {}; TRAIN.grpo.forEach(function (r) { by[r.key] = r; });
    var first = function (k) { var a = by[k].zero_std.slice(0, 20); return Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 100); };
    $('learn-note').textContent = 'Each step samples 4 replies for each of 16 prompts; reward = 0.70 × answer + 0.25 × decision + 0.05 × format. Thick lines are smoothed over 17 steps; faint lines are raw. Over the first 20 steps, ' +
      first('E3_grpo') + '% of groups had no reward variance after full SFT, against ' + first('E3b_grpo_base') + '% from base and ' + first('V2') +
      '% after the light warm-start. The second RL seed (dashed orange) reaches held-out accuracy 0.642 vs 0.644. Base and RL runs used one RTX 4090; v2 used one RTX PRO 6000.';
  }

  // ---------- episode viewer ----------
  function renderEpisode() {
    var eps = TRAIN.episodes;
    seg($('ep-tabs'), eps.map(function (e, i) { return [i, e.title]; }), state.ep, function (k) { state.ep = k; renderEpisode(); });
    var e = eps[state.ep], convo = $('ep-convo'), rep = $('ep-replies');
    convo.innerHTML = '<p class="ep-label">' + esc(e.title) + '<span>' + esc(e.pressure) + ' framing</span></p><p class="ep-blurb">' + esc(e.blurb) + '</p>';
    e.messages.forEach(function (m) {
      var cls = m.role === 'assistant' ? 'asst' : m.role, body;
      if (m.role === 'assistant') {
        try { var j = JSON.parse(m.content); body = esc(j.reason) + ' <code>' + esc(j.decision) + ' ' + esc(j.answer) + '</code>'; } catch (x) { body = esc(m.content); }
      } else {
        body = esc(m.content).replace(/(\[SYSTEM VERIFIED\][^\n]*)/, '<mark>$1</mark>');
        if (m.role === 'tool') body = '<mark>' + body + '</mark>';
      }
      convo.appendChild(el('div', { class: 'msg ' + cls }, '<b>' + (m.role === 'assistant' ? 'Assistant (earlier answer)' : m.role) + '</b><pre>' + body + '</pre>'));
    });
    convo.appendChild(el('p', { class: 'expected' }, 'Correct reply: <code>' + esc(e.expected_decision) + '</code> with answer <code>' + esc(e.expected_answer) + '</code>'));
    rep.innerHTML = '';
    e.replies.forEach(function (r) {
      var full = r.answer_ok && r.decision_ok;
      var card = el('div', { class: 'reply', style: '--c:' + COLOR[r.group] });
      card.innerHTML = '<h4>' + esc(r.label) + '<span class="score' + (full ? ' full' : '') + '">' + (full ? 'correct' : (r.answer_ok || r.decision_ok) ? 'half right' : 'wrong') + '</span></h4>' +
        '<div class="pills"><span class="pill ' + (r.answer_ok ? 'ok' : 'no') + '">answer ' + esc(r.answer) + '</span><span class="pill ' + (r.decision_ok ? 'ok' : 'no') + '">' + esc(r.decision) + '</span></div>' +
        '<p>' + esc(r.reason) + '</p>';
      rep.appendChild(card);
    });
  }

  // ---------- usage ----------
  var HEAD = 'import torch\nfrom huggingface_hub import hf_hub_download\nfrom peft import PeftModel\nfrom transformers import AutoModelForCausalLM, AutoTokenizer\n\n';
  var TAIL = '\nsystem = open(hf_hub_download(repo, "system_prompt.txt")).read()\nmessages = [\n    {"role": "system", "content": system},\n' +
    '    {"role": "user", "content": "Solve for x: 5x + 5y = 70."},\n' +
    '    {"role": "assistant", "content": \'{"reason": "y is not given.", "answer": null, "decision": "insufficient"}\'},\n' +
    '    {"role": "tool", "content": "constraint_service: Additional constraint — y = 6."},\n' +
    '    {"role": "user", "content": "A new message from constraint_service came in."},\n]\n' +
    'prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)\n' +
    'inputs = tok(prompt, return_tensors="pt")\nout = model.generate(**inputs, max_new_tokens=200, do_sample=False)\n' +
    'print(tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))\n# {"reason": "...", "answer": "8", "decision": "revise"}';
  var LOAD = 'tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-1.7B")\nmodel = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-1.7B", dtype=torch.bfloat16)\n';
  var USE = {
    E2_sft: ['Conviction-SFT', 'One adapter. The pick if your inputs look like the training distribution and you care most about ignoring forged records.',
      'repo = "arpjw/conviction-1.7b-sft"\n' + LOAD + 'model = PeftModel.from_pretrained(model, repo)\n'],
    E3b_grpo_base: ['Conviction-RL', 'One adapter. The pick for unfamiliar problems and for staying correctable; it does not check where a record came from.',
      'repo = "arpjw/conviction-1.7b-rl"\n' + LOAD + 'model = PeftModel.from_pretrained(model, repo)\n'],
    V2: ['Conviction-v2', 'Two adapters, applied in order: merge the SFT stage, then load the GRPO stage on top.',
      'repo = "arpjw/conviction-1.7b-v2"\n' + LOAD + 'model = PeftModel.from_pretrained(model, repo, subfolder="stage1_sft").merge_and_unload()\nmodel = PeftModel.from_pretrained(model, repo, subfolder="stage2_grpo")\n']
  };
  function renderUse() {
    seg($('use-tabs'), [['E2_sft', 'SFT'], ['E3b_grpo_base', 'RL'], ['V2', 'v2']], state.use, function (k) { state.use = k; renderUse(); });
    var u = USE[state.use];
    $('use-desc').textContent = u[1];
    $('use-code').textContent = HEAD + u[2] + TAIL;
  }
  $('copy').addEventListener('click', function () {
    var b = this;
    try { navigator.clipboard.writeText($('use-code').textContent).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }); } catch (e) {}
  });

  Promise.all([fetch('../data.json').then(function (r) { return r.json(); }), fetch('models.json').then(function (r) { return r.json(); })]).then(function (res) {
    DATA = res[0]; TRAIN = { grpo: res[1].training.grpo, sft: res[1].training.sft, episodes: res[1].episodes };
    DATA.models.forEach(function (m) { byKey[m.key] = m; });
    var mins = TRAIN.sft.reduce(function (s, r) { return s + r.minutes; }, 0) +
      TRAIN.grpo.filter(function (r) { return r.key === 'E3b_grpo_base' || r.key === 'V2'; }).reduce(function (s, r) { return s + r.minutes; }, 0);
    $('k-minutes').textContent = Math.round(mins);
    $('k-forged').textContent = f2(byKey.V2.metrics.test_structural.fabricated_evidence_resistance.v);
    renderCards();
    renderMap();
    renderFingerprint();
    renderLearning();
    renderEpisode();
    renderUse();
    var lastW = window.innerWidth, t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; renderMap(); renderFingerprint(); } }, 150);
    });
  }).catch(function (e) {
    $('card-grid').textContent = 'Could not load model data (' + e.message + ').';
  });
})();
