/**
 * 工具：JSON 格式化 / 压缩 / 校验
 */
(function () {
  'use strict';

  var B = window.ToolsBox;

  B.register({
    id: 'json-format',
    name: 'JSON 格式化',
    icon: '{ }',
    desc: '格式化、压缩、校验 JSON，非法输入给出错误提示',
    group: '文本与格式',
    render: function (body) {
      var actions = B.el('div', 'tools-actions');
      var input = B.el('textarea', 'tools-input');
      input.rows = 10;
      input.spellcheck = false;
      input.placeholder = '在此粘贴 JSON…';

      var output = B.el('pre', 'tools-output tools-hidden');
      var status = B.el('div', 'tools-status');

      function setStatus(msg, ok) {
        status.textContent = msg;
        status.className = 'tools-status ' + (ok ? 'ok' : 'err');
      }

      function locateError(err) {
        var m = /position (\d+)/.exec(err.message);
        if (!m) return err.message;
        var pos = +m[1];
        var before = input.value.slice(0, pos);
        var line = before.split('\n').length;
        var col = pos - before.lastIndexOf('\n');
        return err.message.replace(/position \d+/, '第 ' + line + ' 行第 ' + col + ' 列附近');
      }

      function run(mode) {
        var text = input.value.trim();
        if (!text) { setStatus('请先输入 JSON', false); return; }
        try {
          var obj = JSON.parse(text);
          var out = mode === 'min' ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
          output.textContent = out;
          output.classList.remove('tools-hidden');
          setStatus(mode === 'min' ? '✓ 校验通过，已压缩' : '✓ 校验通过，已格式化', true);
        } catch (e) {
          output.classList.add('tools-hidden');
          setStatus('✗ ' + locateError(e), false);
        }
      }

      function btn(label, fn, primary) {
        var b = B.el('button', 'tools-btn' + (primary ? ' primary' : ''), label);
        b.type = 'button';
        b.addEventListener('click', fn);
        actions.appendChild(b);
        return b;
      }

      btn('格式化', function () { run('pretty'); }, true);
      btn('压缩', function () { run('min'); });
      btn('复制结果', function () {
        if (output.classList.contains('tools-hidden')) { B.toast('没有可复制的结果'); return; }
        B.copyText(output.textContent, '结果已复制');
      });
      btn('清空', function () {
        input.value = ''; output.textContent = '';
        output.classList.add('tools-hidden'); setStatus('', true);
      });

      var split = B.el('div', 'tools-split');
      var left = B.el('div', 'tools-split-pane');
      var right = B.el('div', 'tools-split-pane');
      input.classList.add('tools-grow');
      output.classList.add('tools-grow');
      left.appendChild(input);
      right.appendChild(output);
      split.appendChild(left);
      split.appendChild(right);

      body.appendChild(actions);
      body.appendChild(split);
      body.appendChild(status);
    }
  });
})();
