/* ============================================================
 * rules.js — “规则”页：从数据实时生成速查表
 * ============================================================ */
(function (global) {
  'use strict';

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function finalsTable() {
    const keys = Object.keys(KEYMAP.key_finals).sort();
    const rows = keys.map(function (k) {
      const fs = KEYMAP.key_finals[k].slice().sort();
      return '<tr><td class="rc">' + k + '</td><td>' + fs.map(function (f) {
        return '<code>' + f + '</code>';
      }).join(' ') + '</td><td>' + fs.map(function (f) {
        return f === 'v' ? 'ü' : '';
      }).join('') + '</td></tr>';
    }).join('');
    return '<table><tr><th>键</th><th>韵母</th><th>备注</th></tr>' + rows + '</table>';
  }

  function initialsTable() {
    const ini = KEYMAP.initials;
    const order = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x',
      'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
    const rows = order.filter(function (i) { return ini[i]; }).map(function (i) {
      const k = ini[i];
      let note = '';
      if (i === 'zh') note = 'F 键(内侧) 或 Q 键(外侧)，见飞键';
      if (i === 'ch') note = 'J 键(外侧) 或 W 键(内侧)，见飞键';
      if (i === 'sh') note = '在 E 键';
      return '<tr><td><code>' + i + '</code></td><td class="rc">' + k + '</td><td>' + note + '</td></tr>';
    }).join('');
    return '<table><tr><th>声母</th><th>键</th><th>说明</th></tr>' + rows + '</table>';
  }

  function flyTable() {
    const out = [];
    const tag = function (list) { return list.map(function (f) { return '<code>' + f + '</code>'; }).join(' '); };
    ['ch', 'zh'].forEach(function (ini) {
      const r = KEYMAP.fly[ini];
      const outer = ini === 'zh' ? 'Q' : 'J', inner = ini === 'zh' ? 'F' : 'W';
      const onlyOuter = r.only_q || r.only_j;
      const onlyInner = r.only_f || r.only_w;
      out.push('<tr><td><code>' + ini + '</code></td><td>仅 ' + outer + '（外侧）</td><td>' +
        tag(onlyOuter) + '</td></tr>');
      out.push('<tr><td></td><td>仅 ' + inner + '（内侧）</td><td>' + tag(onlyInner) + '</td></tr>');
      out.push('<tr><td></td><td>' + outer + '、' + inner + ' 均可</td><td>' + tag(r.both) + '</td></tr>');
    });
    return '<table><tr><th>声母</th><th>键位</th><th>可拼韵母</th></tr>' + out.join('') + '</table>';
  }

  function zeroTable() {
    return '<table><tr><th>全拼</th><th>键道</th></tr>' +
      Object.keys(KEYMAP.zero).sort().map(function (f) {
        return '<tr><td><code>' + f + '</code></td><td><code>x' + KEYMAP.zero[f] + '</code></td></tr>';
      }).join('') + '</table>';
  }

  function strokeTable() {
    return '<table><tr><th>键</th><th>笔形</th><th>名称</th><th>例</th></tr>' +
      ['v', 'i', 'u', 'o', 'a'].map(function (k) {
        const s = ROOTS.strokes[k];
        return '<tr><td class="rc">' + k + '</td><td style="font-size:19px">' + s[0] +
          '</td><td>' + s[1] + '</td><td>' + s[2].join('、') + '</td></tr>';
      }).join('') + '</table>';
  }

  function rootTable() {
    let h = '<table><tr><th>键</th><th>键名字根</th><th>变体 / 例</th></tr>';
    ['a', 'i', 'o', 'u', 'v'].forEach(function (k) {
      const r = ROOTS.key_root[k];
      if (!r) return;
      h += '<tr><td class="rc">' + k + '</td><td style="font-size:19px">' + r[0] + '</td><td>' +
        r[1].join('<br>') + '</td></tr>';
    });
    h += '</table>';
    h += '<table><tr><th>双码字根</th><th>字根</th><th>例</th></tr>' +
      ROOTS.dual_root.map(function (d) {
        return '<tr><td class="rc">' + d[0] + '</td><td style="font-size:19px">' + d[1] + '</td><td>' + d[2] + '</td></tr>';
      }).join('') + '</table>';
    return h;
  }

  const HTML = [
    '<h3>一、音码（双拼）</h3>',
    '<p>单字音码恒定为两码：<b>声母 + 韵母</b>。韵母键位按“声韵拼合规则”设计，不是简单映射拼音字母。</p>',
    '<p><b>声母表</b>（q/f 飞键 = zh，j/w 飞键 = ch，sh 在 e 键）：</p>', initialsTable(),
    '<h4>飞键规则</h4>',
    '<p>外侧的 zh(Q)、ch(J) 与 <code>a</code>、<code>e</code> 开头的韵母所在键的韵母拼合；内侧的 zh(F)、ch(W) 与其余键位的韵母拼合。</p>',
    flyTable(),
    '<h4>韵母键位</h4>', finalsTable(),
    '<p><b>零声母</b>：a / e / o 开头的音节由 X 键引导：</p>', zeroTable(),
    '<p><b>ü 的处理</b>：<code>ju/jv→jl</code>、<code>qu/qv→ql</code>、<code>xu/xv→xl</code>、<code>yu/yv→yl</code>（ü 韵母在 L 键）。' +
    '韵母合并：<code>e=ê</code>、<code>i=-i(前/后)</code>、<code>uan=üan</code>、<code>un=ün</code>、<code>eng=ueng/ng</code>。</p>',

    '<h3>二、形码（五笔画 + 少量字根）</h3>',
    '<p>形码只用到 <code>a i o u v</code> 五个键，是<b>笔画字根 + 键名字根 + 双编码字根</b>三种字根的组合。</p>',
    '<h4>笔画字根</h4>', strokeTable(),
    '<h4>键名字根 &amp; 双编码字根</h4>', rootTable(),
    '<h4>字根使用规则</h4>',
    '<table><tr><th>规则</th><th>例</th></tr>' +
    '<tr><td>无中断</td><td>国 <code>gliavv</code>：“国”在“玉”之前提前中断“口”的书写（全包围），不能用“口”作字根</td></tr>' +
    '<tr><td>无首笔</td><td>白 <code>bhuiav</code>：“白”在“日”之前有且仅有一笔，不能用“日”作字根</td></tr>' +
    '<tr><td>无交错</td><td>老 <code>lzuoua</code>：“土”后有一笔与之相交，退一步用“十”作字根</td></tr>' +
    '</table>',

    '<h3>三、拆字（二分法）</h3>',
    '<p>把字拆成<b>“分别具有最佳组字能力的”两个部件</b>，最多两个部件，故形码最多 4 码。</p>',
    '<table><tr><th>前提</th><th>例</th></tr>' +
    '<tr><td>书写顺序</td><td>过 <code>glvioa</code>：先写“寸”再写“辶”，拆解也按此顺序</td></tr>' +
    '<tr><td>取大优先</td><td>吉 <code>jkvooo</code>：首部件取到“士”而非“十”</td></tr>' +
    '</table>',
    '<p>多种拆法时的优先级（高→低）：<b>独立汉字 → 常用字形（含字根/部首）→ 键道字根 → 偏旁部首</b>。</p>',

    '<h3>四、单字编码</h3>',
    '<table><tr><th>情况</th><th>取码</th><th>例</th></tr>' +
    '<tr><td>独体字</td><td>按笔顺逐笔取笔画字根，取满 4 码；不足 4 笔则重复末码</td><td>羊 <code>ypouvv</code>、子 <code>zkaivv</code></td></tr>' +
    '<tr><td>独体字含字根</td><td>按笔顺取笔画字根与键道字根，取满 4 码</td><td>午 <code>wjuvuo</code></td></tr>' +
    '<tr><td>本身是键道字根</td><td>字根码 + 重复末码</td><td>贝 <code>bwaoo</code>、月 <code>yhuu</code></td></tr>' +
    '<tr><td>合体字</td><td>两个部件各取前两码（共 4 码）</td><td>码 <code>msvuaa</code>（石 vu + 马 aa）</td></tr>' +
    '<tr><td>首部件仅一码</td><td>末部件取 3 码</td><td>胖 <code>ppuouv</code>（月 u + 半 ouv）</td></tr>' +
    '</table>',
    '<p class="dim">注：日常输入几乎不会用到全码，1~2 码筛选后目标字通常已在首位。</p>',

    '<h3>五、词组编码</h3>',
    '<table><tr><th>词长</th><th>音码</th><th>形码（选重）</th><th>例</th></tr>' +
    '<tr><td>二字词</td><td>声+韵+声+韵（4 码）</td><td>每字形码首码</td><td>试试 <code>ekek</code>、史诗 <code>ekeki</code></td></tr>' +
    '<tr><td>三字词</td><td>声+声+声（3 码）</td><td>每字形码首码</td><td>是不是 <code>ebe</code></td></tr>' +
    '<tr><td>多字词</td><td>声+声+声+末字声（4 码）</td><td>前两字形码首码</td><td>引人入胜 <code>yrre</code></td></tr>' +
    '</table>',
    '<p class="dim">双编码字根在词组形码中只取首码。部分高频词有“声声”（ss）或三码简码。</p>',

    '<h3>关于</h3>',
    '<p class="dim">码表 / 词库 / 笔画表来自 <b>星猫键道 6.3</b>（xmjd6-rere，星空键道 6.2 正式授权续作）；' +
    '字根表、音码与拆字规则来自键道官方教程（rime-xkjd gitbook）；字频来自 rime-essay 八股文。<br>' +
    '键位表由码表反推 + 官方规则校对，非手抄。拆字为按码表推断，标注“部件名按笔画推断”时仅供参考。</p>'
  ].join('');

  global.RULES_HTML = HTML;
})(window);
