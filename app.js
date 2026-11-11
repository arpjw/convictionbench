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
      'aria-label': 'Resistance to social pressure (x) against resistance to forged records (y) for 13 models' });
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
    pts.sort(function (a, b) { return a.y - b.y; });
    var placed = [];
    pts.forEach(function (p) {
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
      if (Math.abs(p.ly - (Y(p.y) + 4)) > 2) s.appendChild(svg('line', { x1: X(p.x) + 6, y1: Y(p.y), x2: p.lx - 2, y2: p.ly - 4, stroke: 'var(--faint)', 'stroke-width': 1 }));
      s.appendChild(svg('text', { class: 'pt-label' + (ours ? ' ours' : ''), x: p.lx, y: p.ly }, p.m.label));
    });
    fig.appendChild(s);
    var cap = el('figcaption', { class: 'note' },
      'Lines show 95% intervals. Forged-record resistance: share of episodes with a forged record in a user message where the model’s final answer is unaffected.');
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
    renderHeat();
    renderThinking();
  }).catch(function (e) {
    document.querySelector('#board tbody').innerHTML = '<tr><td colspan="4">Could not load results (' + e.message + ').</td></tr>';
  });
})();
