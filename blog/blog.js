(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var COL = { ours_rl: 'var(--rl)', ours_sft: 'var(--sft)', base: 'var(--base)', other: 'var(--other)' };
  var short = function (m) { return m.label.replace(' (ours)', ''); };
  var isOurs = function (m) { return m.group === 'ours_rl' || m.group === 'ours_sft'; };

  // theme toggle (shared key with the results page)
  document.querySelector('.theme').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cb-theme', next); } catch (e) {}
  });

  // copy citation
  $('copy-bib').addEventListener('click', function () {
    var b = $('copy-bib');
    navigator.clipboard.writeText($('bib').textContent).then(function () {
      b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500);
    });
  });

  // contents rail: highlight the section in view
  var links = Array.prototype.slice.call(document.querySelectorAll('#toc a'));
  var secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  function onScroll() {
    var y = window.scrollY + 120, cur = 0;
    secs.forEach(function (s, i) { if (s && s.offsetTop <= y) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function figure(id, title, sub, note) {
    var f = $(id);
    f.innerHTML = '';
    f.appendChild(el('p', 'fig-title', title));
    if (sub) f.appendChild(el('p', 'fig-sub', sub));
    var body = el('div');
    f.appendChild(body);
    if (note) f.appendChild(el('p', 'fig-note', note));
    return body;
  }
  function bar(parent, label, v, colour, ours, max) {
    var row = el('div', 'hb');
    row.appendChild(el('span', 'lab' + (ours ? ' ours' : ''), label));
    var trk = el('div', 'trk');
    var w = Math.max(0, Math.min(1, v / (max || 1))) * 86;
    var fill = el('div', 'fill'); fill.style.width = w + '%'; fill.style.background = colour;
    var val = el('span', 'v', v.toFixed(2)); val.style.left = 'calc(' + w + '% + 8px)';
    trk.appendChild(fill); trk.appendChild(val); row.appendChild(trk);
    parent.appendChild(row);
  }

  fetch('../data.json').then(function (r) { return r.json(); }).then(function (D) {
    var POST_MODELS = ['E3b_grpo_base', 'E2_sft', 'E0_base', 'B_Qwen3_5-9B', 'B_Qwen3_5-4B', 'B_Qwen3-8B', 'B_granite-4_2-8b',
      'B_Ministral-3-8B-Instruct-2512-BF16', 'B_Olmo-3-7B-Instruct', 'B_NVIDIA-Nemotron-3-Nano-4B-BF16', 'B_Phi-4-mini-instruct',
      'B_Llama-3_2-3B-Instruct', 'B_MobileLLM-Pro'];  // the 13 models this post describes (later additions are on the results page)
    var M = D.models.filter(function (m) { return POST_MODELS.indexOf(m.key) >= 0; });

    // Fig 1: held-out final accuracy
    var b1 = figure('fig-acc', 'Final accuracy on held-out problem types', 'test_structural · higher is better',
      'Point estimates; 95% intervals are on the results page. Coloured bars are our models; light grey is our base model.');
    M.slice().sort(function (a, b) { return b.metrics.test_structural.final_accuracy.v - a.metrics.test_structural.final_accuracy.v; })
      .forEach(function (m) { bar(b1, short(m), m.metrics.test_structural.final_accuracy.v, COL[m.group], isOurs(m)); });

    // Fig 2: forged-record resistance
    var b2 = figure('fig-forged', 'Ignores a forged record in a user message', 'test_id · higher is better',
      'Share of forged-record episodes in which the final answer is unaffected by the forged record.');
    M.slice().sort(function (a, b) { return b.metrics.test_id.fabricated_evidence_resistance.v - a.metrics.test_id.fabricated_evidence_resistance.v; })
      .forEach(function (m) { bar(b2, short(m), m.metrics.test_id.fabricated_evidence_resistance.v, COL[m.group], isOurs(m)); });

    // Fig 3: mean flip rate by framing across off-the-shelf models
    var P = [['neutral', 'Neutral'], ['authority', 'Authority'], ['evaluator', 'Evaluator'], ['consensus', 'Consensus'],
      ['emotional', 'Emotional'], ['impatience', 'Impatience'], ['threat', 'Threat'], ['repetition', 'Repetition'], ['flattery', 'Flattery*']];
    var others = M.filter(function (m) { return m.group === 'other'; });
    var b3 = figure('fig-framing', 'Correct answers abandoned, by framing', 'mean over the ' + others.length + ' off-the-shelf models · lower is better',
      'Pooled over all three test splits (about 65 challenges per model and framing). * Held out of training data.');
    P.map(function (p) {
      var vs = others.map(function (m) { return m.pressure[p[0]].v; });
      return [p[1], vs.reduce(function (a, b) { return a + b; }, 0) / vs.length];
    }).sort(function (a, b) { return b[1] - a[1]; })
      .forEach(function (x) { bar(b3, x[0], x[1], 'var(--other)', false); });

    // Fig 4: generalisation gap for base / SFT / RL
    var pick = function (g) { return M.filter(function (m) { return m.group === g; })[0]; };
    var trio = [pick('base'), pick('ours_sft'), pick('ours_rl')];
    var b4 = figure('fig-gap', 'Final accuracy from seen to unseen problems', 'Qwen3-1.7B base vs our adapters',
      'SFT nearly solves the in-distribution split but loses most of that gain on held-out problem types; RL gains less in-distribution and keeps more of it.');
    [['test_id', 'In-distribution'], ['test_template', 'Held-out phrasing'], ['test_structural', 'Held-out problem types']].forEach(function (s) {
      var g = el('div', 'grp');
      g.appendChild(el('p', 'grp-lab', s[1]));
      trio.forEach(function (m) { bar(g, short(m), m.metrics[s[0]].final_accuracy.v, COL[m.group], isOurs(m)); });
      b4.appendChild(g);
    });
  }).catch(function (e) {
    ['fig-acc', 'fig-forged', 'fig-framing', 'fig-gap'].forEach(function (id) { $(id).textContent = 'Could not load results (' + e.message + ').'; });
  });
})();
