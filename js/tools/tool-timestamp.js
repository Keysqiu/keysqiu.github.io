/**
 * 工具：时间戳转换（双向：时间戳 ⇄ 日期时间）
 */
(function () {
  'use strict';

  var B = window.ToolsBox;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  B.register({
    id: 'timestamp',
    name: '时间戳转换',
    icon: '⏱',
    desc: 'Unix 时间戳与日期时间互转，支持秒/毫秒',
    group: '文本与格式',
    render: function (body) {
      /* --- 时间戳 → 日期 --- */
      var row1 = B.el('div', 'tools-row');
      var tsInput = B.el('input', 'tools-input tools-inline');
      tsInput.type = 'text';
      tsInput.placeholder = '输入时间戳（10 位秒 或 13 位毫秒，自动识别）';
      var nowBtn = B.el('button', 'tools-btn', '当前时间');
      nowBtn.type = 'button';
      var tsCopy = B.el('button', 'tools-btn', '复制日期');
      tsCopy.type = 'button';
      row1.appendChild(tsInput); row1.appendChild(nowBtn); row1.appendChild(tsCopy);

      var tsOut = B.el('div', 'tools-result tools-hidden');

      function convertTs() {
        var v = tsInput.value.trim();
        if (!/^\d{10,13}$/.test(v)) {
          tsOut.textContent = '请输入 10 位（秒）或 13 位（毫秒）数字时间戳';
          tsOut.className = 'tools-result err';
          return;
        }
        var ms = v.length >= 13 ? +v : +v * 1000;
        var d = new Date(ms);
        if (isNaN(d.getTime())) {
          tsOut.textContent = '无效的时间戳';
          tsOut.className = 'tools-result err';
          return;
        }
        var local = formatDate(d);
        var utc = d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
        tsOut.textContent = '本地时间：' + local + '\nUTC 时间：' + utc;
        tsOut.className = 'tools-result ok';
        tsOut.dataset.copy = local;
      }

      tsInput.addEventListener('input', convertTs);
      nowBtn.addEventListener('click', function () {
        tsInput.value = String(Date.now());
        convertTs();
      });
      tsCopy.addEventListener('click', function () {
        if (!tsOut.dataset.copy) { B.toast('请先转换'); return; }
        B.copyText(tsOut.dataset.copy, '日期已复制');
      });

      /* --- 日期 → 时间戳 --- */
      var row2 = B.el('div', 'tools-row');
      var dtInput = B.el('input', 'tools-input tools-inline');
      dtInput.type = 'datetime-local';
      dtInput.step = '1';
      var unitSel = B.el('select', 'tools-input tools-inline tools-select');
      var optS = B.el('option', '', '秒'); optS.value = 's';
      var optMs = B.el('option', '', '毫秒'); optMs.value = 'ms';
      unitSel.appendChild(optS); unitSel.appendChild(optMs);
      var dtCopy = B.el('button', 'tools-btn', '复制时间戳');
      dtCopy.type = 'button';
      row2.appendChild(dtInput); row2.appendChild(unitSel); row2.appendChild(dtCopy);

      var dtOut = B.el('div', 'tools-result tools-hidden');

      function convertDt() {
        if (!dtInput.value) { dtOut.className = 'tools-result tools-hidden'; return; }
        var t = new Date(dtInput.value).getTime();
        if (isNaN(t)) {
          dtOut.textContent = '无效的日期时间';
          dtOut.className = 'tools-result err';
          return;
        }
        dtOut.textContent = unitSel.value === 's'
          ? String(Math.floor(t / 1000))
          : String(t);
        dtOut.className = 'tools-result ok';
      }

      dtInput.addEventListener('input', convertDt);
      unitSel.addEventListener('change', convertDt);
      dtCopy.addEventListener('click', function () {
        if (!dtOut.textContent || dtOut.className.indexOf('ok') < 0) { B.toast('请先选择日期'); return; }
        B.copyText(dtOut.textContent, '时间戳已复制');
      });

      body.appendChild(row1);
      body.appendChild(tsOut);
      body.appendChild(row2);
      body.appendChild(dtOut);
    }
  });
})();
