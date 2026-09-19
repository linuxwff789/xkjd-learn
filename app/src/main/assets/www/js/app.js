/* ============================================================
 * app.js — 键道练习 App 主逻辑
 *  模式: free 自由打字 / target 看字打码 / code 看码选字
 * ============================================================ */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const S = {
    mode: 'free',
    pool: 'level2',
    input: '',
    committed: '',
    target: null,          // 目标文本(字/词)
    targetCodes: [],
    hint: 3,               // 0 关 1 音码 2 音形 3 全解（自由模式默认全开）
    ok: 0, bad: 0,
    qi: 0,
    cands: [],
    sel: 0,
    options: [],           // 看码选字选项
    committedOk: false,
    store: null,           // 持久化进度
    wrongPick: -1,
    answered: false
  };
  const KBEL = $('kb'), KBROOT = KBEL;
  let kbLocked = false;

  /* ────────── 键位图页说明 ────────── */
  function legendHTML() {
    const kf = KEYMAP.key_finals;
    let h = '<h3 style="font-size:14px;margin:14px 0 6px">韵母键位</h3><table><tr><th>键</th><th>韵母</th></tr>';
    Object.keys(kf).sort().forEach(function (k) {
      h += '<tr><td class="rc">' + k + '</td><td>' + kf[k].slice().sort().map(function (f) {
        return '<code>' + (f === 'v' ? 'ü' : f) + '</code>';
      }).join(' ') + '</td></tr>';
    });
    h += '</table>';
    h += '<h3 style="font-size:14px;margin:16px 0 6px">声母飞键</h3>' +
      '<p class="dim"><code>zh</code> → F（内侧）/ Q（外侧）　<code>ch</code> → W（内侧）/ J（外侧）　' +
      '<code>sh</code> → E　零声母 → X</p>';
    h += window.ROOT_TABLES_HTML || '';
    return h;
  }

  /* ────────── 进度存储（localStorage） ────────── */
  const LS_KEY = 'xkjd.progress.v1';

  function loadStore() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { d = {}; }
    if (!d.pools) d.pools = {};
    if (!d.last) d.last = {};
    return d;
  }

  function saveStore() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S.store)); } catch (e) { /* 隐私模式等忽略 */ }
  }

  /** 取某题库的进度记录（没有就新建） */
  function poolRec(name) {
    const d = S.store;
    let r = d.pools[name];
    if (!r) r = d.pools[name] = { qi: 0, ok: 0, bad: 0, shuffle: false, order: null };
    return r;
  }

  function shuffled(n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 当前题库的题目顺序（乱序时返回下标数组） */
  function currentOrder(name) {
    const r = poolRec(name);
    const n = pool().length;
    if (!r.shuffle) { r.order = null; return null; }
    if (!r.order || r.order.length !== n) { r.order = shuffled(n); saveStore(); }
    return r.order;
  }

  /** 题库第 i 题 */
  function itemAt(name, i) {
    const p = pool();
    if (!p.length) return null;
    const ord = currentOrder(name);
    return p[ord ? ord[i % ord.length] : (i % p.length)];
  }

  /* ────────── 启动 ────────── */
  function init() {
    JD.build();
    S.store = loadStore();
    // 恢复上次的模式 / 题库 / 提示等级
    if (S.store.last.mode) S.mode = S.store.last.mode;
    if (S.store.last.pool && LESSONS[S.store.last.pool]) S.pool = S.store.last.pool;
    if (typeof S.store.last.hint === 'number') S.hint = S.store.last.hint;
    const rec = poolRec(S.pool);
    S.ok = rec.ok || 0; S.bad = rec.bad || 0; S.qi = rec.qi || 0;
    S.shuffle = !!rec.shuffle;

    KB.render(KBROOT, false);
    KB.onKey(onKey);
    KB.render($('kb-full'), true);
    $('legend').innerHTML = legendHTML();
    $('rules-body').innerHTML = window.RULES_HTML || '';
    bindUI();
    syncToolbar();
    newRound('keep');
    update();
    // 空闲时补载扩展词表
    setTimeout(function () {
      const s = document.createElement('script');
      s.src = 'data/words_ext.js?v=' + (window.APP_V || '');
      s.onload = function () { JD.loadExtended(); };
      document.body.appendChild(s);
    }, 1500);
  }

  function bindUI() {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('.page').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        $('page-' + b.dataset.tab).classList.add('active');
        if (b.dataset.tab === 'layout') KB.render($('kb-full'), true);
      };
    });
    document.querySelectorAll('#mode-seg .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#mode-seg .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        S.mode = b.dataset.mode;
        S.hint = S.mode === 'free' ? 3 : 0;
        S.store.last.mode = S.mode;
        S.store.last.hint = S.hint;
        saveStore();
        S.committed = ''; S.committedOk = false;
        newRound('keep');
        update();
      };
    });
    document.querySelectorAll('#pool-seg .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#pool-seg .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        switchPool(b.dataset.pool);
        syncToolbar();
        newRound('keep');
        update();
      };
    });
    $('btn-hint').onclick = function () {
      S.hint = (S.hint + 1) % 4;
      S.store.last.hint = S.hint;
      saveStore();
      update();
    };
    $('btn-skip').onclick = function () { newRound('next'); update(); };

    $('btn-shuffle').onclick = function () {
      const r = poolRec(S.pool);
      r.shuffle = !r.shuffle;
      r.order = r.shuffle ? shuffled(pool().length) : null;
      r.qi = 0;
      saveStore();
      syncToolbar();
      newRound('reset');
      update();
    };
    $('btn-reset').onclick = function () {
      const name = POOL_NAME[S.pool] || S.pool;
      if (!confirm('重置「' + name + '」的练习进度？\n（进度、正确/错误数都会清零）')) return;
      const r = poolRec(S.pool);
      r.qi = 0; r.ok = 0; r.bad = 0;
      if (r.shuffle) r.order = shuffled(pool().length);
      S.qi = 0; S.ok = 0; S.bad = 0;
      saveStore();
      newRound('reset');
      update();
    };
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace') { onKey('BS'); e.preventDefault(); }
      else if (e.key === ' ') { onKey('SPACE'); e.preventDefault(); }
      else if (e.key === 'Escape') { onKey('ESC'); }
      else if (/^[a-zA-Z]$/.test(e.key)) { onKey(e.key.toLowerCase()); e.preventDefault(); }
      else if (e.key === "'" || e.key === ';') { onKey(e.key); e.preventDefault(); }
    });
  }

  /* ────────── 题目 ────────── */
  function pool() { return (window.LESSONS && LESSONS[S.pool]) || []; }

  /** mode: 'keep' 保持当前进度 | 'next' 下一题 | 'reset' 回到第一题 */
  function newRound(mode) {
    const p = pool();
    if (!p.length) return;
    const r = poolRec(S.pool);
    if (mode === 'reset') r.qi = 0;
    else if (mode === 'next') r.qi = (r.qi + 1) % p.length;
    S.qi = r.qi % p.length;
    S.input = ''; S.sel = 0; S.answered = false; S.cands = [];
    if (S.mode !== 'free') { S.committed = ''; S.committedOk = false; }   // 下一题：清空上屏区
    if (S.mode === 'free') { S.target = null; S.targetCodes = []; }
    else {
      S.target = itemAt(S.pool, S.qi);
      S.targetCodes = codesOf(S.target);
      if (S.mode === 'code') buildOptions();
    }
    saveStore();
  }

  function codesOf(t) {
    if (t.length === 1) {
      const it = CHARS[t];
      return it ? it.c.slice() : [];
    }
    const a = JD.analyzeWord(t);
    return a ? a.codes.slice() : [];
  }
  function buildOptions() {
    const t = S.target;
    const codes = S.targetCodes;
    const sound = codes[0].slice(0, 2);
    const set = [t];
    const cands = JD.query(sound, 30);
    for (let i = 0; i < cands.length && set.length < 6; i++) {
      const c = cands[i];
      if (c.type === 'char' && c.text !== t && set.indexOf(c.text) < 0) set.push(c.text);
    }
    const com = (LESSONS.common || []);
    let guard = 0;
    while (set.length < 6 && guard++ < 200) {
      const c = com[Math.floor(Math.random() * com.length)];
      if (set.indexOf(c) < 0) set.push(c);
    }
    S.options = set;
  }

  /* ────────── 按键 ────────── */
  function onKey(k) {
    if (kbLocked) return;
    if (S.mode === 'code') return;
    if (k === 'BS') { S.input = S.input.slice(0, -1); S.answered = false; update(); return; }
    if (k === 'ESC') {
      if (S.input) { S.input = ''; S.answered = false; }
      else { S.committed = ''; }
      update(); return;
    }
    if (k === 'SPACE') { commit(); return; }
    if (k.length !== 1) return;
    if (S.input.length >= 8) return;
    S.input += k;
    if (S.mode === 'target') checkTarget(k);
    update();
  }

  function checkTarget(lastKey) {
    const codes = S.targetCodes;
    const el = KB.keyEl(KBROOT, lastKey);
    if (codes.some(function (c) { return c === S.input; })) {
      KB.flash(el, 'hit');
      S.answered = true;
      kbLocked = true;
      S.input = '';                 // 答对立即清空本题输入，避免下一题残留
      S.cands = [];
      S.sel = 0;
      const t = S.target;
      S.committed = '✔ ' + t;       // 先给个正确反馈，下一题会清掉
      S.committedOk = true;
      bumpStat('ok');
      update();
      setTimeout(function () {
        newRound('next');
        update();
        setTimeout(function () { kbLocked = false; }, 250);   // 宽限期：吃掉手快多敲的键
      }, 320);
      return;
    }
    if (codes.some(function (c) { return c.indexOf(S.input) === 0; })) {
      KB.flash(el, 'hit');
    } else {
      KB.flash(el, 'miss');
      bumpStat('bad');
      S.input = S.input.slice(0, -1);
      S.shake = true;
    }
  }

  function commit(idx) {
    if (!S.input) return;
    const c = S.cands[idx == null ? S.sel : idx];
    if (!c) { S.input = ''; update(); return; }
    S.committed += c.text;
    S.committedOk = false;
    if (S.mode !== 'target') bumpStat('ok');
    S.input = '';
    S.cands = [];          // 上屏后清空候选栏
    S.sel = 0;
    update();
  }

  const POOL_NAME = { level1: '一级简码', level2: '二级简码', common: '常用字', words2: '词组' };

  /** 按钮/标签与状态同步（初始化 & 切换题库时调用） */
  function syncToolbar() {
    document.querySelectorAll('#mode-seg .seg-btn').forEach(function (x) {
      x.classList.toggle('active', x.dataset.mode === S.mode);
    });
    document.querySelectorAll('#pool-seg .seg-btn').forEach(function (x) {
      x.classList.toggle('active', x.dataset.pool === S.pool);
    });
    const r = poolRec(S.pool);
    const bs = $('btn-shuffle');
    bs.textContent = r.shuffle ? '乱序' : '顺序';
    bs.classList.toggle('on', !!r.shuffle);
  }

  /* ────────── 渲染 ────────── */
  function update() {
    renderTarget();
    renderCands();
    renderHints();
    renderComposer();
    renderStats();
  }

  function renderTarget() {
    const t = $('target'), sub = $('target-sub');
    if (S.mode === 'free') {
      t.textContent = '自由打字';
      t.className = 'target small';
      sub.textContent = '在下面键盘上敲键道编码，空格上屏；提示跟随首选字';
    } else if (S.mode === 'target') {
      t.textContent = S.target || '';
      t.className = 'target' + (S.target && S.target.length > 1 ? ' small' : '');
      const a = JD.analyze(S.target);
      const py = a && a.type === 'char' ? a.pyRaw : '';
      sub.textContent = (S.hint >= 1 && py ? py + '　' : '') +
        '输入编码后自动判对（提示等级 ' + S.hint + '）';
    } else {
      t.textContent = S.targetCodes[0] || '';
      t.className = 'target';
      sub.textContent = '这个编码对应下面哪一个？';
    }
  }

  function renderCands() {
    const box = $('cands');
    if (S.mode === 'code') {
      box.innerHTML = S.options.map(function (o, i) {
        let cls = 'cand opt';
        if (S.wrongPick === i) cls += ' miss';
        if (S.answered && o === S.target) cls += ' sel';
        return '<div class="' + cls + '" data-i="' + i + '"><div class="w">' + o + '</div>' +
          '<div class="c">' + (S.answered && o === S.target ? '✔' : '') + '</div></div>';
      }).join('');
      box.querySelectorAll('.opt').forEach(function (el) {
        el.onclick = function () { answerOption(parseInt(el.dataset.i, 10)); };
      });
      return;
    }
    S.cands = S.input ? JD.query(S.input, 30) : [];
    if (S.sel >= S.cands.length) S.sel = 0;
    if (!S.input) {
      box.innerHTML = '<div class="cands-empty">输入编码后候选显示在这里</div>';
      return;
    }
    box.innerHTML = S.cands.map(function (c, i) {
      return '<div class="cand' + (i === S.sel ? ' sel' : '') + '" data-i="' + i + '">' +
        (i < 9 ? '<span class="n">' + (i + 1) + '</span>' : '') +
        '<div class="w">' + c.text + '</div><div class="c">' + c.code + '</div></div>';
    }).join('');
    box.querySelectorAll('.cand').forEach(function (el) {
      el.onclick = function () { commit(parseInt(el.dataset.i, 10)); };   // 点候选=直接上屏
    });
  }

  function answerOption(i) {
    if (S.answered) return;
    const o = S.options[i];
    if (o === S.target) {
      S.answered = true; S.wrongPick = -1;
      bumpStat('ok');
      renderCands(); renderStats();
      setTimeout(function () { newRound('next'); update(); }, 450);
    } else {
      S.wrongPick = i;
      bumpStat('bad');
      renderCands(); renderStats();
      setTimeout(function () { S.wrongPick = -1; renderCands(); }, 500);
    }
  }

  function renderComposer() {
    const c = $('committed');
    c.textContent = S.committed;
    c.className = 'committed' + (S.committedOk ? ' okc' : '');
    $('preedit').textContent = S.input;
    const p = $('preedit');
    if (S.shake) { p.classList.add('shake'); setTimeout(function () { p.classList.remove('shake'); }, 200); S.shake = false; }
  }

  function renderStats() {
    $('st-ok').textContent = S.ok;
    $('st-bad').textContent = S.bad;
    $('st-prog').textContent = (S.qi + 1) + '/' + pool().length;
  }

  /** 切题库：把当前计数存回旧题库，载入新题库的计数 */
  function switchPool(name) {
    const old = poolRec(S.pool);
    old.ok = S.ok; old.bad = S.bad;
    S.pool = name;
    const r = poolRec(name);
    S.ok = r.ok || 0; S.bad = r.bad || 0;
    S.store.last.pool = name;
    saveStore();
  }

  function bumpStat(which) {
    const r = poolRec(S.pool);
    if (which === 'ok') { S.ok++; r.ok = S.ok; } else { S.bad++; r.bad = S.bad; }
    saveStore();
  }

  /* ────────── 提示 ────────── */
  function renderHints() {
    const box = $('hints');
    $('hint-level').textContent = ['关', '音码', '音形', '全解'][S.hint];
    let a = null;
    if (S.mode === 'free') a = S.cands.length ? JD.analyze(S.cands[S.sel] ? S.cands[S.sel].text : '') : null;
    else if (S.mode === 'target') a = S.target ? JD.analyze(S.target) : null;
    else a = S.target ? JD.analyze(S.target) : null;

    if (!a) {
      box.innerHTML = '<div class="hints-empty">' + (S.mode === 'free'
        ? '敲下第一键，这里会显示该字的音码 / 形码 / 拆字提示'
        : '输入编码后显示提示') + '</div>';
      KB.hintKey(KBROOT, []);
      return;
    }
    if (S.hint === 0) {
      box.innerHTML = '<div class="hints-empty">提示已关闭 — 点右上角「提示」查看</div>';
      KB.hintKey(KBROOT, []);
      return;
    }
    box.innerHTML = hintHTML(a, S.input, S.hint);
    highlightKeys(a);
  }

  function chip(l, cls, on) {
    return '<span class="code-chip ' + (cls || '') + (on ? ' on' : '') + '">' + l + '</span>';
  }

  function codeRow(code, input) {
    let h = '';
    for (let i = 0; i < code.length; i++) {
      const cls = i < 2 ? 'sound' : 'shape';
      const on = i < input.length;
      h += chip(code[i], cls, on);
    }
    return h;
  }

  function strokeNames(code) {
    let s = '';
    for (let i = 0; i < code.length; i++) s += (JD.STROKE_CHAR[code[i]] || '') + (JD.STROKE_NAME[code[i]] || '');
    return s;
  }

  /** 形码逐码说明：有拆字信息时按首/次部件说明，否则逐码列笔画与可能的字根 */
  function shapeDesc(a) {
    const root = JD.ROOT_BY_CODE;
    const part = function (code) {
      if (root[code]) return '<code>' + code + '</code>＝' + root[code] + '字根';
      return '<code>' + code + '</code>＝' + strokeNames(code);
    };
    if (a.parts) {
      return '<span class="dim">首</span> ' + part(a.parts.headCode) +
        '　<span class="dim">次</span> ' + part(a.parts.tailCode);
    }
    return a.letters.map(function (li) {
      let t = '<code>' + li.code + '</code>＝' + (li.stroke || '') + (li.name || '');
      if (li.root) t += '/' + li.root + '字根';
      return t;
    }).join('　');
  }

  function hintHTML(a, input, level) {
    const rows = [];
    if (a.type === 'char') {
      rows.push(row('字', '<span class="big">' + a.text + '</span> <span class="dim">' + (a.pyRaw || '') + '</span>'));
      rows.push(row('编码', codeRow(a.full, input) +
        '<div class="dim" style="margin-top:3px">简码 ' + a.shortCodes.join(' / ') + '　全码 ' + a.full + '</div>'));
      if (level >= 1 && a.py) {
        rows.push(row('音码', soundDesc(a.py, a.sound)));
      }
      if (level >= 2) {
        rows.push(row('形码', shapeDesc(a)));
      }
      if (level >= 3) {
        if (a.parts) {
          rows.push(row('拆字',
            '<span class="part">' + a.parts.head + '<small>' + a.parts.headCode + '</small></span>' +
            '<span class="dim">+</span>' +
            '<span class="part">' + a.parts.tail + '<small>' + a.parts.tailCode + '</small></span>' +
            (a.parts.guessed ? '<span class="dim" style="font-size:11px;margin-left:6px">（部件名按笔画推断）</span>' : '')));
        } else {
          rows.push(row('拆字', '<span class="dim">独体字 / 无推断（按笔顺取码）</span>'));
        }
        if (a.strokeChars) rows.push(row('笔画', '<span class="strokes">' + a.strokeChars + '</span>'));
      }
    } else {
      rows.push(row('词', '<span class="big">' + a.text + '</span> <span class="dim">' + a.codes.join(' / ') + '</span>'));
      const kindTxt = a.kind === 'sysy' ? '声+韵+声+韵' : a.kind === 'sss' ? '声+声+声' : '声+声+声+末声';
      const c = a.composed;
      rows.push(row('音码', kindTxt + '：' + (c ? soundPerChar(a) : '') +
        '<div style="margin-top:3px">' + codeRow(c ? c.sound : a.codes[0], input) + '</div>'));
      if (level >= 2) {
        rows.push(row('形码', (c ? c.infos.map(function (x) {
          return x.text + '首形 <code>' + (x.shape ? x.shape[0] : '?') + '</code>';
        }).join('　') + '<div class="dim" style="margin-top:3px">' + codeRow(c ? c.shape : '', input.slice(c ? c.sound.length : 0)) + '</div>'
          : '<span class="dim">—</span>')));
      }
      if (level >= 3) {
        rows.push(row('分解', a.infos.map(function (x) {
          const p = x.parts;
          return '<span class="part">' + x.text + (p ? '<small>' + p.head + '+' + p.tail + '</small>' : '') + '</span>';
        }).join('')));
      }
    }
    return rows.join('');
  }

  function row(k, v) { return '<div class="hrow"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  /** 逐字说明声/韵键位（词组用） */
  function soundPerChar(a) {
    return a.infos.map(function (x) {
      if (!x.py) return x.text;
      const p = x.py;
      return '<span class="dim">' + x.text + '</span>' +
        (p.zero ? '零声母x→<code>' + p.finKey + '</code>'
          : '<code>' + p.ini + '</code>→<code>' + p.iniKeys.join('/') + '</code>' +
            (p.fly ? '<span class="flytag">飞键</span>' : '') +
            ' <code>' + (p.fin === 'v' ? 'ü' : p.fin) + '</code>→<code>' + p.finKey + '</code>');
    }).join('　');
  }

  function soundDesc(py, sound) {
    if (!py) return '<span class="dim">—</span>';
    let h = '';
    if (py.zero) {
      h += '零声母 <code>x</code> + 韵母 <code>' + (py.fin === 'v' ? 'ü' : py.fin) + '</code>→<code>' + py.finKey + '</code>';
    } else {
      h += '声母 <code>' + py.ini + '</code>→<code>' + py.iniKeys.join('/') + '</code>' +
        (py.fly ? '<span class="flytag">飞键</span>' : '') +
        '　韵母 <code>' + (py.fin === 'v' ? 'ü' : py.fin) + '</code>→<code>' + py.finKey + '</code>';
    }
    h += '　→ 音码 <code>' + sound + '</code>';
    return h;
  }

  function highlightKeys(a) {
    const keys = [];
    if (S.hint >= 1) {
      if (a.type === 'char' && a.py) { keys.push.apply(keys, a.py.iniKeys); if (a.py.finKey) keys.push(a.py.finKey); }
      if (a.type === 'word') {
        a.infos.forEach(function (x) {
          if (x.py) { keys.push.apply(keys, x.py.iniKeys); if (x.py.finKey) keys.push(x.py.finKey); }
        });
      }
    }
    if (S.hint >= 2) {
      const shape = a.type === 'char' ? a.shape : '';
      for (let i = 0; i < shape.length; i++) keys.push(shape[i]);
    }
    KB.hintKey(KBROOT, keys);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
