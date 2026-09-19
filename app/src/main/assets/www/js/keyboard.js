/* ============================================================
 * keyboard.js — 键道助记键盘
 *  - 小键盘：每键显示 韵母 / 键名字根(含变体) / 笔画 / 双编码字根 / 一简字
 *  - 长按任意键：弹出该键【完整】助记（含全部笔画变体与例字）
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
        const duals = (ROOTS.dual_root || []).filter(function (d) { return d.code[0] === k; });
        const root = ROOTS.key_root[k];
        const st = ROOTS.strokes[k];
        keyData[k] = {
          letter: k,
          finals: KEYMAP.key_finals[k] || [],
          initials: KEYMAP.key_initials[k] || [],
          root: root || null,
          stroke: st || null,
          duals: duals,
          simple: simp[k] || '',
          shape: !!SHAPE_KEYS[k]
        };
      }
    }
    return keyData;
  }

  /** 键名字根的全部写法（含变体），如 氵水氺 / 亻人 / 木朩 */
  function rootChars(d) {
    if (!d.root) return '';
    const out = [];
    d.root.variants.forEach(function (v) { if (out.indexOf(v[0]) < 0) out.push(v[0]); });
    if (out.indexOf(d.root.char) < 0) out.unshift(d.root.char);
    return out.join('');
  }

  /** 韵母太长就折成两行（键面只有 ~30px 宽） */
  function finalsHTML(finals) {
    const s = finals.join('/');
    if (s.length <= 5) return s;
    const i = s.indexOf('/');
    if (i < 0) return s;
    return s.slice(0, i) + '<br>' + s.slice(i + 1);
  }

  function keyHTML(k, big) {
    const d = keyData[k];
    let m, s;
    if (d.shape) {
      m = rootChars(d);
      s = d.stroke ? d.stroke.char : '';
    } else {
      m = big ? d.finals.join('/') : finalsHTML(d.finals);
      s = d.simple || '';
    }
    let dual = '';
    if (d.duals.length) {
      dual = d.duals.map(function (x) {
        return big ? x.char + '<sup>' + x.code[1] + '</sup>' : x.char;
      }).join('');
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
      div.innerHTML = row.map(function (k) { return keyHTML(k, big); }).join('');
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

  /* ── 长按：完整助记 ── */
  function sec(title, body) {
    return body ? '<div class="pk-s"><div class="pk-t">' + title + '</div>' + body + '</div>' : '';
  }

  function showPopup(k) {
    const d = keyData[k];
    if (!d) return;
    let html = '<div class="pk-h">' + k.toUpperCase() + ' 键助记</div>';
    if (d.shape) {
      // 键名字根（含变体）
      if (d.root && d.root.variants.length) {
        html += sec('键名字根', d.root.variants.map(function (v) {
          return '<div class="pk-r"><b>' + v[0] + '</b><span>' + v[1] + '</span></div>';
        }).join(''));
      }
      // 笔画字根（全部变体）
      if (d.stroke) {
        html += sec('笔画字根 ' + d.stroke.char + '（' + d.stroke.name + '）',
          '<div class="pk-vars">' + d.stroke.variants.map(function (v) {
            return '<span class="pk-var"><b>' + v[0] + '</b><i>' +
              ((ROOTS.stroke_cn || {})[v[0]] || '') + '</i><em>' + v[1] + '</em></span>';
          }).join('') + '</div>');
      }
      // 双编码字根（含变体）
      if (d.duals.length) {
        html += sec('双编码字根', d.duals.map(function (x) {
          return '<div class="pk-r"><b class="rc">' + x.code + '</b><span>' +
            x.variants.map(function (v) { return v[0] + '（' + v[1] + '）'; }).join('　') + '</span></div>';
        }).join(''));
      }
    } else {
      html += sec('声母', '<div class="pk-r"><b>' + k + '</b><span>' +
        (d.initials.filter(function (x) { return x !== k; }).join(' / ') || '—') + '</span></div>');
      html += sec('韵母', '<div class="pk-r"><b>' + d.finals.join(' / ') + '</b></div>');
    }
    if (d.simple) html += sec('一级简码', '<div class="pk-r"><b>' + d.simple + '</b></div>');
    let pop = document.getElementById('kb-pop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'kb-pop';
      document.body.appendChild(pop);
    }
    pop.innerHTML = html;
    pop.classList.add('show');
    setTimeout(function () {
      document.addEventListener('pointerdown', function () {
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
    rootChars: rootChars,
    keyEl: function (root, k) { return root.querySelector('.key[data-key="' + k + '"]'); },
    flash: function (el, cls) {
      if (!el) return;
      el.classList.remove('hit', 'miss');
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(function () { el.classList.remove(cls); }, 280);
    },
    hintKey: function (root, keys) {
      root.querySelectorAll('.key.hintable').forEach(function (x) { x.classList.remove('hintable'); });
      (keys || []).forEach(function (k) {
        const el = KB.keyEl(root, k);
        if (el) el.classList.add('hintable');
      });
    }
  };
})(window);
