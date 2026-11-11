(function () {
  'use strict';

  var SPLITS = [
    ['test_structural', 'Held-out problems'],
    ['test_template', 'Held-out phrasing'],
    ['test_id', 'In-distribution']
  ];
  var METRICS = [
    ['final_accuracy', 'Final accuracy', false, 'Share of episodes where the final answer is correct after the challenge.'],
    ['pressure_flip_rate', 'Pressure flips', true, 'How often a correct answer is abandoned under a challenge with no valid evidence. Lower is better.'],
    ['legitimate_correction_rate', 'Accepts corrections', false, 'How often a wrong answer is fixed when shown valid working that exposes the error.'],
    ['fabricated_evidence_resistance', 'Forged records', false, 'How often a forged “record” pasted into a user message is correctly ignored.'],
    ['authenticated_update_accuracy', 'Tool updates', false, 'How often the answer is correctly updated after an authenticated tool record changes the facts.'],
    ['insufficient_accuracy', 'Abstention', false, 'How often the model says “insufficient” when the authenticated facts do not determine the answer.']
  ];
  var PRESSURES = [['neutral', 'Neutral'], ['authority', 'Authority'], ['evaluator', 'Evaluator'], ['consensus', 'Consensus'],
    ['emotional', 'Emotional'], ['impatience', 'Impatience'], ['threat', 'Threat'], ['repetition', 'Repetition'], ['flattery', 'Flattery']];
  var state = { split: 'test_structural', metric: 'final_accuracy', scatterSplit: 'test_structural' };
  var DATA = null;
  function isOurs(m) { return m.group === 'ours_rl' || m.group === 'ours_sft' || m.group === 'ours_v2'; }
  var tip = document.getElementById('tip');

  function $(id) { return document.getElementById(id); }
  function fmt(v, d) { return v == null ? '–' : v.toFixed(d == null ? 3 : d); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function metricDef(key) { return METRICS.filter(function (m) { return m[0] === key; })[0]; }

  // ---------- theme ----------
  document.querySelector('.theme').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cb-theme', next); } catch (e) {}
  });

  // ---------- segmented controls ----------
  function seg(container, items, current, onPick) {
    container.innerHTML = '';
    items.forEach(function (it) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(it[0] === current) }, it[1]);
      b.addEventListener('click', function () { onPick(it[0]); });
      container.appendChild(b);
    });
  }

  // ---------- tooltip ----------
  function showTip(evt, m, split) {
    var s = m.metrics[split];
    var html = '<h4>' + m.label + '</h4><dl>';
    METRICS.forEach(function (d) {
      var x = s[d[0]];
      html += '<dt>' + d[1] + (d[2] ? ' ↓' : '') + '</dt><dd>' + (x && x.v != null ? fmt(x.v) : '–') + '</dd>';
    });
    var fm = s.strict_format_rate;
    html += '<dt>Strict format</dt><dd>' + (fm ? fmt(fm.v) : '–') + '</dd></dl>';
    html += '<p>' + m.lab + (m.hf_id ? ' · ' + m.hf_id : '') + '</p>';
    if (m.note) html += '<p>' + m.note + '</p>';
    tip.innerHTML = html;
    tip.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    var x = evt.clientX + 14, y = evt.clientY + 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - 14;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ---------- leaderboard ----------
  function renderBoard() {
    var def = metricDef(state.metric), lowerBetter = def[2];
    seg($('split-seg'), SPLITS, state.split, function (k) { state.split = k; renderBoard(); });
    seg($('metric-seg'), METRICS.map(function (m) { return [m[0], m[1]]; }), state.metric, function (k) { state.metric = k; renderBoard(); });
    $('metric-desc').textContent = def[3];
    $('board-metric').textContent = def[1] + (lowerBetter ? ' (lower is better)' : '');

    var rows = DATA.models.map(function (m) { return { m: m, x: m.metrics[state.split][state.metric] }; })
      .filter(function (r) { return r.x && r.x.v != null; });
    rows.sort(function (a, b) { return lowerBetter ? a.x.v - b.x.v : b.x.v - a.x.v; });

    var tbody = document.querySelector('#board tbody');
    tbody.innerHTML = '';
    rows.forEach(function (r, i) {
      var m = r.m, x = r.x;
      var tr = el('tr');
      tr.appendChild(el('td', { class: 'rank' }, String(i + 1)));
      var name = el('td', { class: 'mname' }, m.label.replace(' (ours)', ''));
      if (isOurs(m)) name.appendChild(el('span', { class: 'tagc ' + m.group }, 'ours'));
      else name.appendChild(el('small', null, m.group === 'base' ? 'base' : m.lab));
      tr.appendChild(name);
      var td = el('td', { class: 'barcol' });
      var bar = el('div', { class: 'bar' });
      var pct = function (v) { return (Math.max(0, Math.min(1, v)) * 84) + '%'; };
      var fill = el('div', { class: 'fill ' + m.group });
      fill.style.width = pct(x.v);
      bar.appendChild(fill);
      if (x.lo != null && x.hi != null) {
        var ci = el('div', { class: 'ci' });
        ci.style.left = pct(x.lo);
        ci.style.width = 'calc(' + pct(x.hi) + ' - ' + pct(x.lo) + ')';
        bar.appendChild(ci);
      }
      var val = el('span', { class: 'val' }, fmt(x.v));
      val.style.left = 'calc(' + pct(Math.max(x.v, x.hi || 0)) + ' + 8px)';
      bar.appendChild(val);
      td.appendChild(bar);
      tr.appendChild(td);
      tr.appendChild(el('td', { class: 'num' }, m.params));
      tr.addEventListener('mouseenter', function (e) { showTip(e, m, state.split); });
      tr.addEventListener('mousemove', moveTip);
      tr.addEventListener('mouseleave', hideTip);
      tr.addEventListener('click', function (e) { tip.hidden ? showTip(e, m, state.split) : hideTip(); });
      tbody.appendChild(tr);
    });
  }

  // ---------- scatter ----------
  function renderScatter() {
    seg($('scatter-seg'), SPLITS, state.scatterSplit, function (k) { state.scatterSplit = k; renderScatter(); });
    var fig = $('scatter');
    fig.innerHTML = '';
    var W = 960, H = 470, L = 58, R = 170, T = 16, B = 52;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Resistance to social pressure (x) against resistance to forged records (y) for ' + DATA.models.length + ' models' });
    var X = function (v) { return L + v * (W - L - R); };
    var Y = function (v) { return T + (1 - v) * (H - T - B); };
    for (var g = 0; g <= 1.0001; g += 0.25) {
      s.appendChild(svg('line', { class: 'grid', x1: X(0), x2: X(1), y1: Y(g), y2: Y(g) }));
      s.appendChild(svg('line', { class: 'grid', x1: X(g), x2: X(g), y1: Y(0), y2: Y(1) }));
      s.appendChild(svg('text', { class: 'tick', x: L - 10, y: Y(g) + 4, 'text-anchor': 'end' }, g.toFixed(2)));
      s.appendChild(svg('text', { class: 'tick', x: X(g), y: H - B + 18, 'text-anchor': 'middle' }, g.toFixed(2)));
    }
    s.appendChild(svg('text', { class: 'axis-label', x: X(0.5), y: H - 8, 'text-anchor': 'middle' }, 'Resists social pressure (1 − flip rate) →'));
    var yl = svg('text', { class: 'axis-label', x: 14, y: Y(0.5), 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + Y(0.5) + ')' }, 'Ignores forged records →');
    s.appendChild(yl);

    var pts = DATA.models.map(function (m) {
      var a = m.metrics[state.scatterSplit];
      var f = a.pressure_flip_rate, r = a.fabricated_evidence_resistance;
      if (!f || !r || f.v == null || r.v == null) return null;
      return { m: m, x: 1 - f.v, xlo: 1 - f.hi, xhi: 1 - f.lo, y: r.v, ylo: r.lo, yhi: r.hi };
    }).filter(Boolean);
    var colour = function (g) { return 'var(--' + (g === 'ours_rl' ? 'rl' : g === 'ours_sft' ? 'sft' : g === 'ours_v2' ? 'v2' : g === 'base' ? 'base' : 'other') + ')'; };

    // label placement: greedy vertical de-overlap on the right-hand side of each point
    // with ~40 models, label only ours, the base model and the extremes on each axis; the rest are hover-only
    var byY = pts.slice().sort(function (a, b) { return b.y - a.y; }), byX = pts.slice().sort(function (a, b) { return b.x - a.x; });
    var keep = {};
    pts.forEach(function (p) { if (isOurs(p.m) || p.m.group === 'base') keep[p.m.key] = 1; });
    byY.filter(function (p) { return p.m.group === 'other'; }).slice(0, 3).forEach(function (p) { keep[p.m.key] = 1; });
    byX.filter(function (p) { return p.m.group === 'other'; }).slice(0, 3).forEach(function (p) { keep[p.m.key] = 1; });
    pts.forEach(function (p) { p.labelled = !!keep[p.m.key]; });
    pts.sort(function (a, b) { return a.y - b.y; });
    var placed = [];
    pts.filter(function (p) { return p.labelled; }).forEach(function (p) {
      var ly = Y(p.y) + 4;
      for (var tries = 0; tries < 40; tries++) {
        var clash = placed.some(function (q) { return Math.abs(q.ly - ly) < 14 && Math.abs(q.lx - (X(p.x) + 10)) < 120; });
        if (!clash) break;
        ly -= 14;
      }
      p.ly = ly; p.lx = X(p.x) + 10;
      placed.push(p);
    });

    pts.forEach(function (p) {
      var c = colour(p.m.group), ours = isOurs(p.m);
      if (p.xlo != null) s.appendChild(svg('line', { class: 'ci-line', x1: X(p.xlo), x2: X(p.xhi), y1: Y(p.y), y2: Y(p.y), stroke: c }));
      if (p.ylo != null) s.appendChild(svg('line', { class: 'ci-line', x1: X(p.x), x2: X(p.x), y1: Y(p.ylo), y2: Y(p.yhi), stroke: c }));
    });
    pts.forEach(function (p) {
      var c = colour(p.m.group), ours = isOurs(p.m);
      var dot = svg('circle', { class: 'pt', cx: X(p.x), cy: Y(p.y), r: ours ? 7 : 5.5, fill: c });
      dot.addEventListener('mouseenter', function (e) { showTip(e, p.m, state.scatterSplit); });
      dot.addEventListener('mousemove', moveTip);
      dot.addEventListener('mouseleave', hideTip);
      s.appendChild(dot);
      if (!p.labelled) return;
      if (Math.abs(p.ly - (Y(p.y) + 4)) > 2) s.appendChild(svg('line', { x1: X(p.x) + 6, y1: Y(p.y), x2: p.lx - 2, y2: p.ly - 4, stroke: 'var(--faint)', 'stroke-width': 1 }));
      s.appendChild(svg('text', { class: 'pt-label' + (ours ? ' ours' : ''), x: p.lx, y: p.ly }, p.m.label));
    });
    fig.appendChild(s);
    var cap = el('figcaption', { class: 'note' },
      'Labelled: our models, the base model, and the three most extreme off-the-shelf models on each axis; hover any dot for its name. Lines show 95% intervals. Forged-record resistance: share of episodes with a forged record in a user message where the model’s final answer is unaffected.');
    fig.appendChild(cap);
  }

  // ---------- heatmap ----------
  function renderHeat() {
    var t = $('heat');
    t.innerHTML = '';
    var head = el('tr');
    head.appendChild(el('th', null, 'Model'));
    PRESSURES.forEach(function (p) {
      var th = el('th', p[0] === 'flattery' ? { class: 'held', title: 'Held out of training' } : null, p[1] + (p[0] === 'flattery' ? '*' : ''));
      head.appendChild(th);
    });
    var thead = el('thead'); thead.appendChild(head); t.appendChild(thead);
    var tb = el('tbody');
    var rows = DATA.models.slice().sort(function (a, b) {
      var avg = function (m) { var s = 0, n = 0; PRESSURES.forEach(function (p) { var x = m.pressure[p[0]]; if (x && x.v != null) { s += x.v; n++; } }); return s / n; };
      return avg(a) - avg(b);
    });
    rows.forEach(function (m) {
      var tr = el('tr');
      var name = el('td', null, m.label.replace(' (ours)', ''));
      if (isOurs(m)) name.appendChild(el('span', { class: 'tagc ' + m.group, style: 'margin-left:8px;font:500 9.5px var(--sans);letter-spacing:.1em;text-transform:uppercase;padding:2px 5px;border-radius:3px;color:var(--bg)' }, 'ours'));
      tr.appendChild(name);
      PRESSURES.forEach(function (p) {
        var x = m.pressure[p[0]];
        var td = el('td', { title: m.label + ' · ' + p[1] + ': ' + (x.v == null ? 'n/a' : (x.v * 100).toFixed(0) + '% of ' + x.n + ' challenges') }, x.v == null ? '–' : (x.v * 100).toFixed(0));
        if (x.v != null) td.style.background = 'rgba(var(--heat), ' + (0.08 + 0.8 * x.v).toFixed(3) + ')';
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    var cap = el('caption', { class: 'note', style: 'caption-side:bottom;text-align:left' }, 'Cells show the percentage of correct answers abandoned. * Flattery is held out of training data.');
    t.appendChild(cap);
  }

  // ---------- thinking on vs off ----------
  function renderThinking() {
    var T = DATA.thinking, t = $('think');
    if (!T || !t) return;
    var cols = [['final_accuracy', 'Final accuracy', 1], ['pressure_flip_rate', 'Pressure flips \u2193', -1],
      ['fabricated_evidence_resistance', 'Ignores forged records', 1], ['authenticated_update_accuracy', 'Accepts tool updates', 1]];
    var head = el('tr'); head.appendChild(el('th', null, 'Model'));
    cols.forEach(function (c) { head.appendChild(el('th', null, c[1])); });
    head.appendChild(el('th', null, 'Thinking tokens'));
    var thead = el('thead'); thead.appendChild(head); t.appendChild(thead);
    var tb = el('tbody');
    T.models.forEach(function (m) {
      var tr = el('tr'); tr.appendChild(el('td', null, m.label));
      cols.forEach(function (c) {
        var d = m.diff[c[0]], sig = d.lo > 0 || d.hi < 0, good = sig && (d.diff * c[2] > 0);
        var td = el('td');
        td.appendChild(el('span', { class: 'd ' + (!sig ? 'ns' : good ? 'up' : 'down') },
          m.off[c[0]].toFixed(2) + ' \u2192 ' + m.on[c[0]].toFixed(2)));
        td.appendChild(el('small', null, (d.diff >= 0 ? '+' : '') + d.diff.toFixed(2) + ' [' + d.lo.toFixed(2) + ', ' + d.hi.toFixed(2) + ']'));
        tr.appendChild(td);
      });
      tr.appendChild(el('td', null, String(m.mean_think_tokens)));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
  }


  // ---------- channel test (provenance gap) ----------
  function renderProvenance() {
    var PG = DATA.provenance, fig = $('prov');
    if (!PG || !fig) return;
    fig.innerHTML = '';
    var rows = DATA.models.filter(function (m) { return PG.models[m.key]; }).map(function (m) { return { m: m, g: PG.models[m.key] }; });
    rows.sort(function (a, b) { return b.g.gap - a.g.gap; });
    var W = Math.max(320, Math.min(960, fig.clientWidth || 960)), narrow = W < 600;
    var rowH = 19, T = 30, B = 34, L = narrow ? 138 : 210, R = narrow ? 48 : 150, H = T + rows.length * rowH + B;
    var X = function (v) { return L + v * (W - L - R); };
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Record adoption through the tool channel versus pasted into a user message, ' + rows.length + ' models' });
    for (var t = 0; t <= 1.0001; t += 0.25) {
      root.appendChild(svg('line', { class: 'grid', x1: X(t), x2: X(t), y1: T - 6, y2: H - B + 4 }));
      root.appendChild(svg('text', { class: 'tick', x: X(t), y: H - B + 20, 'text-anchor': 'middle' }, Math.round(t * 100) + '%'));
    }
    root.appendChild(svg('circle', { class: 'dot-tool', cx: L + 4, cy: 10, r: 4.5 }));
    root.appendChild(svg('text', { class: 'tick', x: L + 13, y: 14 }, narrow ? 'tool' : 'via tool channel'));
    var lx2 = narrow ? L + 56 : L + 124;
    root.appendChild(svg('circle', { class: 'dot-paste', cx: lx2, cy: 10, r: 4.5 }));
    root.appendChild(svg('text', { class: 'tick', x: lx2 + 9, y: 14 }, narrow ? 'pasted' : 'pasted by the user'));
    root.appendChild(svg('text', { class: 'tick', x: W - 4, y: 14, 'text-anchor': 'end' }, narrow ? 'gap' : 'gap (tool − pasted)'));
    rows.forEach(function (r, i) {
      var y = T + i * rowH + rowH / 2, g = r.g, ours = isOurs(r.m);
      var row = svg('g', { class: 'prow' });
      row.appendChild(svg('rect', { class: 'prow-bg', x: 0, y: y - rowH / 2, width: W, height: rowH, rx: 3 }));
      var nm = r.m.label.replace(' (ours)', '');
      var shown = narrow && nm.length > 19 ? nm.slice(0, 18) + '\u2026' : nm;
      var name = svg('text', { class: 'name' + (ours || r.m.group === 'base' ? ' ours' : ''), x: L - 10, y: y + 4, 'text-anchor': 'end' }, shown);
      if (ours) name.setAttribute('style', 'fill: var(--' + r.m.group.replace('ours_', '').replace('sft', 'sft').replace('rl', 'rl') + ')');
      row.appendChild(name);
      row.appendChild(svg('line', { class: 'dumb', x1: X(Math.min(g.tool, g.pasted)), x2: X(Math.max(g.tool, g.pasted)), y1: y, y2: y }));
      row.appendChild(svg('circle', { class: 'dot-paste', cx: X(g.pasted), cy: y, r: 4.5 }));
      row.appendChild(svg('circle', { class: 'dot-tool', cx: X(g.tool), cy: y, r: 4.5 }));
      var cls = g.gap_lo > 0.005 ? 'gap-up' : g.gap_hi < 0 ? 'gap-down' : 'gap-ns';
      var txt = (g.gap >= 0 ? '+' : '−') + Math.abs(g.gap).toFixed(2) + (narrow ? '' : '  [' + g.gap_lo.toFixed(2) + ', ' + g.gap_hi.toFixed(2) + ']');
      row.appendChild(svg('text', { class: 'gap-txt ' + cls, x: W - 4, y: y + 4, 'text-anchor': 'end' }, txt));
      var html = '<h4>' + nm + '</h4><dl><dt>Adopts via tool</dt><dd>' + fmt(g.tool, 2) + '</dd><dt>Adopts when pasted</dt><dd>' + fmt(g.pasted, 2) +
        '</dd><dt>Gap</dt><dd>' + fmt(g.gap, 2) + '</dd></dl><p>95% interval ' + g.gap_lo.toFixed(2) + ' to ' + g.gap_hi.toFixed(2) + ', ' + g.n + ' matched pairs.</p>';
      row.addEventListener('mouseenter', function (e) { tip.innerHTML = html; tip.hidden = false; moveTip(e); });
      row.addEventListener('mousemove', moveTip);
      row.addEventListener('mouseleave', hideTip);
      root.appendChild(row);
    });
    fig.appendChild(root);
    var others = rows.filter(function (r) { return r.m.group === 'other'; });
    var neg = others.filter(function (r) { return r.g.gap_hi < 0; }).length, pos = others.filter(function (r) { return r.g.gap_lo > 0.005; }).length;
    $('prov-note').textContent = PG.n_pairs + ' matched pairs (' + PG.n_groups + ' problem groups, all three test splits): identical record text, ' +
      'challenge and framing; only the channel differs, and the pasted version carries the forger’s “verified” label. “Adopts” = the final ' +
      'answer is the value the record implies. Off-the-shelf models: ' + neg + ' of ' + others.length + ' adopt pasted records significantly more often, ' +
      pos + ' prefer the tool channel by a clear margin, the rest show no difference. Green / red: interval excludes zero (cluster bootstrap over problem groups).';
  }

  // ---------- scaling within families ----------
  var FAMILIES = [
    ['Qwen3', 'fam1', [['B_Qwen3-0_6B', 0.6], ['E0_base', 1.7], ['B_Qwen3-4B', 4], ['B_Qwen3-8B', 8.2], ['B_Qwen3-14B', 14.8]]],
    ['Qwen3.5', 'fam2', [['B_Qwen3_5-0_8B', 0.9], ['B_Qwen3_5-2B', 2.3], ['B_Qwen3_5-4B', 4.7], ['B_Qwen3_5-9B', 9.7]]],
    ['Granite 4', 'fam3', [['B_granite-4_0-1b', 1.6], ['B_granite-4_2-3b', 3.7], ['B_granite-4_2-8b', 8.8]]],
    ['Ministral-3', 'fam4', [['B_Ministral-3-3B-Instruct-2512-BF16', 3.8], ['B_Ministral-3-8B-Instruct-2512-BF16', 8.9], ['B_Ministral-3-14B-Instruct-2512-BF16', 13.9]]]
  ];
  function renderScaleChart(fig, metric) {
    if (!fig) return;
    var cap = fig.querySelector('figcaption'); fig.innerHTML = ''; if (cap) fig.appendChild(cap);
    var by = {}; DATA.models.forEach(function (m) { by[m.key] = m; });
    var W = 460, H = 280, L = 40, R = 86, T = 10, B = 30;
    var lx = function (v) { return Math.log(v); }, x0 = lx(0.5), x1 = lx(16);
    var X = function (v) { return L + (lx(v) - x0) / (x1 - x0) * (W - L - R); }, Y = function (v) { return T + (1 - v) * (H - T - B); };
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cap ? cap.textContent + ' by model size, four families' : '' });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      root.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
      root.appendChild(svg('text', { class: 'tick', x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' }, v.toFixed(2)));
    });
    [0.5, 1, 2, 4, 8, 16].forEach(function (v) { root.appendChild(svg('text', { class: 'tick', x: X(v), y: H - 8, 'text-anchor': 'middle' }, v + 'B')); });
    var ends = [];
    FAMILIES.forEach(function (f) {
      var pts = f[2].filter(function (p) { return by[p[0]]; }).map(function (p) { return { m: by[p[0]], s: p[1], v: by[p[0]].metrics.test_structural[metric].v }; });
      var c = 'var(--' + f[1] + ')';
      root.appendChild(svg('polyline', { class: 'fam-line', stroke: c, points: pts.map(function (p) { return X(p.s) + ',' + Y(p.v); }).join(' ') }));
      pts.forEach(function (p) {
        var dot = svg('circle', { cx: X(p.s), cy: Y(p.v), r: 4.5, fill: c, stroke: 'var(--bg)', 'stroke-width': 2 });
        dot.addEventListener('mouseenter', function (e) { tip.innerHTML = '<h4>' + p.m.label + '</h4><dl><dt>' + (cap ? cap.textContent : metric) + '</dt><dd>' + fmt(p.v, 2) + '</dd><dt>Parameters</dt><dd>' + p.s + 'B</dd></dl>'; tip.hidden = false; moveTip(e); });
        dot.addEventListener('mousemove', moveTip); dot.addEventListener('mouseleave', hideTip);
        root.appendChild(dot);
      });
      var last = pts[pts.length - 1]; ends.push({ y: Y(last.v), x: X(last.s), name: f[0], c: c });
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    ends.forEach(function (e) { root.appendChild(svg('text', { class: 'fam-label', x: W - R + 10, y: e.y + 4, fill: e.c }, e.name)); });
    fig.appendChild(root);
  }
  function renderScaling() {
    renderScaleChart($('scale-forged'), 'fabricated_evidence_resistance');
    renderScaleChart($('scale-tool'), 'authenticated_update_accuracy');
  }

  // ---------- headline numbers ----------
  function renderHeadline() {
    var others = DATA.models.filter(function (m) { return m.group === 'other'; });
    var resist = others.filter(function (m) { return m.metrics.test_id.fabricated_evidence_resistance.v > 0.25; }).length;
    $('k-forged').textContent = resist + ' / ' + others.length;
    var rl = DATA.models.filter(function (m) { return m.group === 'ours_rl'; })[0];
    var sft = DATA.models.filter(function (m) { return m.group === 'ours_sft'; })[0];
    $('k-flip').textContent = fmt(rl.metrics.test_structural.pressure_flip_rate.v, 2);
    $('k-sft').textContent = fmt(sft.metrics.test_id.fabricated_evidence_resistance.v, 2);
    $('protocol').textContent = DATA.benchmark + '. ' + DATA.protocol + ' Split hashes (SHA-256 prefixes): ' +
      Object.keys(DATA.hashes).map(function (k) { return k + ' ' + DATA.hashes[k]; }).join(', ') + '.';
  }

  fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
    DATA = d;
    renderHeadline();
    renderBoard();
    renderScatter();
    renderProvenance();
    renderScaling();
    renderHeat();
    renderThinking();
  }).catch(function (e) {
    document.querySelector('#board tbody').innerHTML = '<tr><td colspan="4">Could not load results (' + e.message + ').</td></tr>';
  });
})();
