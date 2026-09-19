/* ============================================================
 * engine.js — 键道数据模型：拼音拆解、码表索引、编码/拆字分析
 * 依赖: data/keymap.js  KEYMAP
 *       data/roots.js   ROOTS
 *       data/chars.js   CHARS   { 字: {c:[码...], f:全码, p:拼音, r:常用度, s:笔画码, x:[k,a,b]} }
 *       data/words.js   WORDS_RAW  "code word\n"...
 * ============================================================ */
(function (global) {
  'use strict';

  const STROKE_CHAR = { v: '一', i: '丨', u: '丿', o: '丶', a: '乛' };
  const STROKE_NAME = { v: '横', i: '竖', u: '撇', o: '点', a: '折' };
  const STROKE_ORDER = ['v', 'i', 'u', 'o', 'a'];

  // 字根码 -> 字根字
  const ROOT_BY_CODE = {};
  (ROOTS.dual_root || []).forEach(function (r) { ROOT_BY_CODE[r[0]] = r[1]; });
  Object.keys(ROOTS.key_root || {}).forEach(function (k) { ROOT_BY_CODE[k] = ROOTS.key_root[k][0]; });

  const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
    'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
  const JQXY = { j: 1, q: 1, x: 1, y: 1 };
  const FIN_ALIAS = { ve: 'ue', van: 'uan', vn: 'un' };

  /* ── 拼音处理 ─────────────────────────────────────────── */

  // "bú_bù" -> 取第一个读音, 去声调, ü(含 ǚ ǜ 等) -> v
  function normalizePinyin(py) {
    const p = (py || '').split(/[_／\/]/)[0].toLowerCase();
    const d = p.normalize('NFD');
    let out = '';
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (c >= '\u0300' && c <= '\u036f') {                 // 组合记号（声调/两点）
        if (c === '\u0308' && out) {
          const last = out[out.length - 1];
          if (last === 'u') out = out.slice(0, -1) + 'v';
          else if (last === 'U') out = out.slice(0, -1) + 'V';
        }
        continue;
      }
      out += c;
    }
    return out.replace(/u:/g, 'v');
  }

  function splitPinyin(py) {
    const p = normalizePinyin(py);
    if (!p) return null;
    for (let i = 0; i < INITIALS.length; i++) {
      const ini = INITIALS[i];
      if (p.indexOf(ini) === 0) return { ini: ini, fin: p.slice(ini.length) };
    }
    return { ini: '', fin: p };
  }

  /**
   * 拼音 -> 键位信息
   * { py, ini, fin, iniKeys:[...], finKey, zero:bool, fly:'q/f'|null }
   */
  function pinyinInfo(py) {
    const s = splitPinyin(py);
    if (!s) return null;
    let ini = s.ini, fin = s.fin;
    const out = { py: normalizePinyin(py), ini: ini, fin: fin, iniKeys: [], finKey: '', zero: false, fly: null };

    // 零声母: a/e/o 开头 -> x + 韵母
    if (ini === '') {
      const zk = KEYMAP.zero[fin];
      if (zk) { out.zero = true; out.iniKeys = ['x']; out.finKey = zk; return out; }
      return null;                       // y/w 开头的音节拼音表里已含声母
    }
    // ju/qu/xu/yu -> 韵母按 ü 处理
    if (JQXY[ini] && (fin === 'u' || fin === 'v')) fin = 'v';
    fin = FIN_ALIAS[fin] || fin;          // üe/üan/ün 写成 ve/van/vn

    out.fin = fin;
    out.finKey = KEYMAP.finals[fin] || '';

    if (ini === 'zh' || ini === 'ch') {
      const rule = KEYMAP.fly[ini];
      const outer = ini === 'zh' ? 'q' : 'j';
      const inner = ini === 'zh' ? 'f' : 'w';
      if (rule.only_q && rule.only_q.indexOf(fin) >= 0) out.iniKeys = [outer];
      else if (rule.only_j && rule.only_j.indexOf(fin) >= 0) out.iniKeys = [outer];
      else if (rule.only_f && rule.only_f.indexOf(fin) >= 0) out.iniKeys = [inner];
      else if (rule.only_w && rule.only_w.indexOf(fin) >= 0) out.iniKeys = [inner];
      else { out.iniKeys = [outer, inner]; out.fly = outer + '/' + inner; }
    } else {
      out.iniKeys = [KEYMAP.initials[ini] || ini];
    }
    return out;
  }

  /* ── 索引 ─────────────────────────────────────────────── */

  let charIndex = [];        // [[code, char], ...] 按 code 排序
  let wordIndex = [];        // [[code, word], ...]
  let wordCodes = null;      // word -> [codes] (懒加载)
  const strokeIndex = {};    // 笔画码 -> 最常用字
  const tradChars = {};      // 繁体字集合（候选排序降权）
  const firstShape = {};     // 字 -> 首形码(1~2 码)
  let ready = false;

  function pushStroke(code, ch) {
    const cur = strokeIndex[code];
    if (!cur) { strokeIndex[code] = ch; return; }
    const a = CHARS[cur], b = CHARS[ch];
    if (b && (!a || b.r < a.r)) strokeIndex[code] = ch;
  }

  function build() {
    if (ready) return;
    const ci = [];
    for (const ch in CHARS) {
      const it = CHARS[ch];
      for (let i = 0; i < it.c.length; i++) ci.push([it.c[i], ch]);
      if (it.s) pushStroke(it.s, ch);
      if (it.t) tradChars[ch] = 1;
      const sh = it.f.slice(2);
      if (sh) {
        const two = sh.slice(0, 2);
        firstShape[ch] = ROOT_BY_CODE[two] ? two : sh[0];
      }
    }
    ci.sort(cmpPair);
    charIndex = ci;

    const wi = [];
    const raw = global.WORDS_RAW || '';
    if (raw) {
      const lines = raw.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const sp = lines[i].indexOf(' ');
        if (sp > 0) wi.push([lines[i].slice(0, sp), lines[i].slice(sp + 1)]);
      }
    }
    wordIndex = wi;
    ready = true;
  }

  function cmpPair(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); }

  // 追加扩展词表(5~6 码)
  function loadExtended() {
    if (!global.WORDS_EXT_RAW || global.__extLoaded) return;
    global.__extLoaded = true;
    const raw = global.WORDS_EXT_RAW;
    const lines = raw.split('\n');
    const add = [];
    for (let i = 0; i < lines.length; i++) {
      const sp = lines[i].indexOf(' ');
      if (sp > 0) add.push([lines[i].slice(0, sp), lines[i].slice(sp + 1)]);
    }
    wordIndex = wordIndex.concat(add);
    wordIndex.sort(cmpPair);
    wordCodes = null;
    global.WORDS_EXT_RAW = null;
  }

  function lowerBound(arr, prefix) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][0] < prefix) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /** 前缀查码 -> [{code, text, type:'char'|'word', rank}] */
  function query(prefix, limit) {
    build();
    limit = limit || 40;
    if (!prefix) return [];
    const out = [];
    const hi = prefix + '\uffff';
    let lo = lowerBound(charIndex, prefix), end = lowerBound(charIndex, hi);
    for (let i = lo; i < end && out.length < limit * 4; i++) {
      const ch = charIndex[i][1], it = CHARS[ch];
      out.push({ code: charIndex[i][0], text: ch, type: 'char',
                 rank: it.r + (it.t ? 20000 : 0) });
    }
    lo = lowerBound(wordIndex, prefix); end = lowerBound(wordIndex, hi);
    for (let i = lo; i < end && out.length < limit * 6; i++) {
      const w = wordIndex[i][1];
      let tw = 0;
      for (let j = 0; j < w.length; j++) { if (tradChars[w[j]]) { tw = 1; break; } }
      out.push({ code: wordIndex[i][0], text: w, type: 'word', rank: 900 + (tw ? 9000 : 0) });
    }
    const pl = prefix.length;
    out.sort(function (a, b) {
      const ea = a.code.length === pl ? 0 : 1, eb = b.code.length === pl ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if (a.code.length !== b.code.length) return a.code.length - b.code.length;
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.text.length !== b.text.length) return a.text.length - b.text.length;
      return a.text < b.text ? -1 : 1;
    });
    return out.slice(0, limit);
  }

  /** 该前缀下是否存在候选 */
  function hasPrefix(prefix) {
    build();
    if (!prefix) return true;
    const hi = prefix + '\uffff';
    return lowerBound(charIndex, hi) > lowerBound(charIndex, prefix) ||
      lowerBound(wordIndex, hi) > lowerBound(wordIndex, prefix);
  }

  /* ── 编码 / 拆字分析 ───────────────────────────────────── */

  function letterInfo(l) {
    const o = { code: l, stroke: STROKE_CHAR[l] || '', name: STROKE_NAME[l] || '', root: ROOT_BY_CODE[l] || '' };
    return o;
  }

  /** 形码串 -> 逐码信息，同时标注可能的双码字根 */
  function shapeLetters(shape) {
    const out = [];
    for (let i = 0; i < shape.length; i++) {
      const l = shape[i];
      const li = letterInfo(l);
      const two = shape.slice(i, i + 2);
      if (two.length === 2 && ROOT_BY_CODE[two]) li.dual = { code: two, ch: ROOT_BY_CODE[two] };
      out.push(li);
    }
    return out;
  }

  function strokeString(code) {
    let s = '';
    for (let i = 0; i < code.length; i++) s += STROKE_CHAR[code[i]] || '?';
    return s;
  }

  function lookupStrokes(code) {
    if (!code) return '';
    build();
    if (strokeIndex[code]) return strokeIndex[code];
    for (let n = code.length - 1; n >= 2; n--) {          // 尽量长的前缀匹配
      if (strokeIndex[code.slice(0, n)]) return strokeIndex[code.slice(0, n)];
    }
    return '';
  }

  /** 单字完整分析 */
  function analyzeChar(ch) {
    const it = CHARS[ch];
    if (!it) return null;
    const full = it.f;
    const sound = full.slice(0, 2);
    const shape = full.slice(2);
    const py = pinyinInfo(it.p);
    const res = {
      type: 'char', text: ch, codes: it.c, full: full,
      shortCodes: it.c.filter(function (c) { return c.indexOf(sound) === 0; }),
      sound: sound, shape: shape, letters: shapeLetters(shape),
      py: py, pyRaw: it.p, rank: it.r,
      strokes: it.s || '', strokeChars: it.s ? strokeString(it.s) : '',
      parts: null
    };
    if (it.x) {
      const k = it.x[0], a = it.x[1], b = it.x[2];
      const headChar = it.x[3] || '', tailChar = it.x[4] || '';
      const head = it.s.slice(0, k), tail = it.s.slice(k);
      res.parts = {
        headCode: a, tailCode: b,
        head: headChar || strokeString(head),
        headIsRoot: !!ROOT_BY_CODE[a],
        headStrokes: strokeString(head),
        tail: tailChar || strokeString(tail),
        tailStrokes: strokeString(tail),
        guessed: !headChar || !tailChar
      };
    }
    return res;
  }

  /** 按词组编码规则合成码（声韵声韵 / 声声声 / 声声声末声 + 形码首码） */
  function composeWord(word) {
    const cs = Array.prototype.slice.call(word).map(analyzeChar);
    if (cs.some(function (x) { return !x; })) return null;
    const n = cs.length;
    if (n < 2) return null;
    const snd = function (x) { return x.sound; };
    const sh = function (x) { return x.shape ? x.shape[0] : ''; };
    let sound = '', shape = '';
    if (n === 2) {
      sound = snd(cs[0]) + snd(cs[1]);
      shape = sh(cs[0]) + sh(cs[1]);
    } else if (n === 3) {
      sound = snd(cs[0])[0] + snd(cs[1])[0] + snd(cs[2])[0];
      shape = sh(cs[0]) + sh(cs[1]) + sh(cs[2]);
    } else {
      sound = snd(cs[0])[0] + snd(cs[1])[0] + snd(cs[2])[0] + snd(cs[n - 1])[0];
      shape = sh(cs[0]) + sh(cs[1]);
    }
    return { sound: sound, shape: shape, code: sound + shape, infos: cs };
  }

  /** 词组分析 */
  function analyzeWord(word) {
    const chars = Array.prototype.slice.call(word);
    const infos = chars.map(analyzeChar);
    if (infos.some(function (x) { return !x; })) return null;
    const n = chars.length;
    // 找出该词的最短码与最长码
    build();
    if (!wordCodes) {
      wordCodes = {};
      for (let i = 0; i < wordIndex.length; i++) {
        const w = wordIndex[i][1];
        (wordCodes[w] || (wordCodes[w] = [])).push(wordIndex[i][0]);
      }
    }
    let codes = (wordCodes[word] || []).slice();
    const composed = composeWord(word);
    if (composed && codes.indexOf(composed.code) < 0) codes.push(composed.code);
    if (!codes.length) return null;
    codes.sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });
    const kind = n === 2 ? 'sysy' : (n === 3 ? 'sss' : 'ssss');
    return {
      type: 'word', text: word, codes: codes, full: codes[codes.length - 1],
      chars: chars, infos: infos, kind: kind, composed: composed
    };
  }

  function analyze(text) {
    if (!text) return null;
    return text.length === 1 ? analyzeChar(text) : analyzeWord(text);
  }

  global.JD = {
    STROKE_CHAR: STROKE_CHAR, STROKE_NAME: STROKE_NAME, STROKE_ORDER: STROKE_ORDER,
    ROOT_BY_CODE: ROOT_BY_CODE,
    build: build, loadExtended: loadExtended,
    query: query, hasPrefix: hasPrefix,
    pinyinInfo: pinyinInfo, normalizePinyin: normalizePinyin, splitPinyin: splitPinyin,
    analyzeChar: analyzeChar, analyzeWord: analyzeWord, analyze: analyze,
    composeWord: composeWord,
    strokeString: strokeString, lookupStrokes: lookupStrokes,
    firstShape: function (ch) { build(); return firstShape[ch] || ''; },
    counts: function () { build(); return { chars: charIndex.length, words: wordIndex.length }; }
  };
})(window);
