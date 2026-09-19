/* ============================================================
 * keyboard.js — 键道助记键盘
 *  - 每键显示: 韵母(或形码字根) / 字母 / 一简字·笔画 / 双码字根·飞键声母
 *  - 长按任意键弹出该键完整助记
 * 依赖: KEYMAP / ROOTS / CHARS / JD
 * ============================================================ */
(function (global) {
  'use strict';

  const ROWS = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ];
  const SHAPE_KEYS = { a: 1, i: 1, o: 1, u: 1, v: 1 };

  let keyData = null;

  function oneSimples() {
    const map = {};
    for (const ch in CHARS) {
      const it = CHARS[ch];
      if (it.c[0].length !== 1) continue;
      const k = it.c[0];
      if (!map[k] || it.r < map[k].r) map[k] = ch;
    }
    return map;
  }

  function build() {
    if (keyData) return keyData;
    const simp = oneSimples();
    keyData = {};
    for (let r = 0; r < ROWS.length; r++) {
      for (const k of ROWS[r]) {
        const duals = (ROOTS.dual_root || []).filter(function (d) { return d[0][0] === k; });
        const root = ROOTS.key_root[k];
        keyData[k] = {
          letter: k,
          finals: KEYMAP.key_finals[k] || [],
          initials: KEYMAP.key_initials[k] || [],
          root: root ? root[0] : '',
          rootAlts: root ? root[1] : [],
          stroke: JD.STROKE_CHAR[k] || '',
          duals: duals,
          simple: simp[k] || '',
          shape: !!SHAPE_KEYS[k]
        };
      }
    }
    return keyData;
  }

  function keyHTML(k) {
    const d = keyData[k];
    let m, s;
    if (d.shape) { m = d.root; s = d.stroke; }
    else {
      m = d.finals.join('/');
      s = d.simple || '';
    }
    let dual = '';
    if (d.duals.length) {
      dual = d.duals.slice(0, 2).map(function (x) {
        return x[1] + (x[0][1] === k ? '' : '<sup>' + x[0][1] + '</sup>');
      }).join('');
      if (d.duals.length > 2) dual += '…';
    }
    let ini = '';
    if (d.initials.length && d.initials[0] !== k) ini = d.initials.join('');
    return '<div class="key' + (d.shape ? ' shape' : '') + '" data-key="' + k + '">' +
      (ini ? '<span class="ini">' + ini + '</span>' : '') +
      (dual ? '<span class="dual">' + dual + '</span>' : '') +
      '<span class="m">' + m + '</span>' +
      '<span class="l">' + k + '</span>' +
      '<span class="s">' + s + '</span>' +
      '</div>';
  }

  function render(el, big) {
    build();
    el.innerHTML = '';
    ROWS.forEach(function (row, idx) {
      const div = document.createElement('div');
      div.className = 'kb-row';
      div.innerHTML = row.map(keyHTML).join('');
      el.appendChild(div);
      if (idx === ROWS.length - 1 && !big) {
        const fn = document.createElement('div');
        fn.className = 'kb-row';
        fn.innerHTML =
          '<div class="key fn wide" data-key="ESC">清空</div>' +
          '<div class="key fn wide2" data-key="SPACE">空格 · 上屏</div>' +
          '<div class="key fn wide" data-key="BS">⌫ 退格</div>';
        el.appendChild(fn);
      }
    });
  }

  /* ── 按键事件 ── */
  let handler = null, longTimer = null;
  function emit(k) { if (handler) handler(k); }

  function bind(el) {
    el.addEventListener('pointerdown', function (e) {
      const key = e.target.closest('.key');
      if (!key) return;
      key.classList.add('press');
      emit(key.getAttribute('data-key'));
      const k = key.getAttribute('data-key');
      if (k.length === 1) longTimer = setTimeout(function () { showPopup(k); }, 500);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(function (ev) {
      el.addEventListener(ev, function (e) {
        const key = e.target.closest('.key');
        if (key) key.classList.remove('press');
        clearTimeout(longTimer);
      });
    });
  }

  /* ── 长按助记弹窗 ── */
  function showPopup(k) {
    const d = keyData[k];
    if (!d) return;
    let html = '<div class="pk-h">' + k.toUpperCase() + ' 键助记</div>';
    if (d.shape) {
      html += '<div class="pk-r"><span>键名字根</span><b>' + d.root + '</b></div>';
      html += '<div class="pk-r"><span>笔画字根</span><b>' + d.stroke + '（' + JD.STROKE_NAME[k] + '）</b></div>';
      if (d.duals.length)
        html += '<div class="pk-r"><span>双编码字根</span><b>' +
          d.duals.map(function (x) { return x[1] + '（' + x[0] + '）'; }).join('、') + '</b></div>';
      html += '<div class="pk-r"><span>字根例</span><b>' + d.rootAlts.join('　') + '</b></div>';
    } else {
      html += '<div class="pk-r"><span>声母</span><b>' + k + '</b></div>';
      const ini = d.initials.filter(function (x) { return x !== k; });
      if (ini.length) html += '<div class="pk-r"><span>飞键声母</span><b>' + ini.join(' / ') + '</b></div>';
      html += '<div class="pk-r"><span>韵母</span><b>' + d.finals.join(' / ') + '</b></div>';
    }
    if (d.simple) html += '<div class="pk-r"><span>一级简码</span><b>' + d.simple + '</b></div>';
    let pop = document.getElementById('kb-pop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'kb-pop';
      document.body.appendChild(pop);
    }
    pop.innerHTML = html;
    pop.classList.add('show');
    setTimeout(function () {
      document.addEventListener('pointerdown', function h(e) {
        pop.classList.remove('show');
      }, { once: true });
    }, 80);
  }

  global.KB = {
    ROWS: ROWS, SHAPE_KEYS: SHAPE_KEYS,
    build: build,
    render: function (el, big) { render(el, big); bind(el); },
    onKey: function (fn) { handler = fn; },
    data: build,
    keyEl: function (root, k) { return root.querySelector('.key[data-key="' + k + '"]'); },
    flash: function (el, cls) {
      if (!el) return;
      el.classList.remove('hit', 'miss');
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(function () { el.classList.remove(cls); }, 280);
    },
    hintKey: function (root, keys) {           // 给提示涉及到的键加高亮边框
      root.querySelectorAll('.key.hintable').forEach(function (x) { x.classList.remove('hintable'); });
      (keys || []).forEach(function (k) {
        const el = KB.keyEl(root, k);
        if (el) el.classList.add('hintable');
      });
    }
  };
})(window);
