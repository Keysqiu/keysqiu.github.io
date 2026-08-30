/**
 * 工具：HTML 预览 / 分享
 * 编辑模式：textarea + sandbox iframe 实时渲染，可生成内嵌内容的分享链接
 * 分享模式：链接带 #c=payload 时直接渲染
 */
(function () {
  'use strict';

  var B = window.ToolsBox;
  var URL_LIMIT = 30000;

  B.register({
    id: 'html-preview',
    name: 'HTML 预览',
    icon: '🖥️',
    desc: '实时预览 HTML 页面，支持生成分享链接',
    group: '分享与预览',
    render: function (body, ctx) {
      if (ctx.payload != null && ctx.payload.trim()) {
        renderViewer(body, ctx.payload);
      } else {
        renderEditor(body);
      }
    }
  });

  /* ---------- 分享查看模式 ---------- */

  function renderViewer(body, html) {
    var actions = B.el('div', 'tools-actions');
    var frame = B.el('iframe', 'tools-frame tools-grow');
    frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-popups');
    frame.className = 'tools-frame tools-grow';

    function btn(label, fn, primary) {
      var b = B.el('button', 'tools-btn' + (primary ? ' primary' : ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    }

    btn('复制 HTML', function () { B.copyText(html, 'HTML 已复制'); });
    btn('编辑此 HTML', function () {
      history.replaceState({}, '', location.pathname);
      body.innerHTML = '';
      renderEditor(body, html);
    });
    btn('重新运行', function () { frame.srcdoc = html; }, true);

    frame.srcdoc = html;
    body.appendChild(actions);
    body.appendChild(frame);
  }

  /* ---------- 编辑模式 ---------- */

  function renderEditor(body, initial) {
    var actions = B.el('div', 'tools-actions');
    var wrap = B.el('div', 'tools-split');
    var left = B.el('div', 'tools-split-pane');
    var frame = B.el('iframe', 'tools-frame tools-grow');
    frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-popups');

    var input = B.el('textarea', 'tools-input tools-grow');
    input.rows = 14;
    input.spellcheck = false;
    if (initial != null) input.value = initial;
    else {
      input.value = '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>预览</title>\n</head>\n<body>\n  <h1>Hello!</h1>\n</body>\n</html>';
    }

    function btn(label, fn, primary) {
      var b = B.el('button', 'tools-btn' + (primary ? ' primary' : ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    }

    function run() { frame.srcdoc = input.value; }

    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(run, 400);
    });

    btn('复制分享链接', async function () {
      if (!input.value.trim()) { B.toast('请先输入 HTML 内容'); return; }
      await B.shareLink('html-preview', input.value, URL_LIMIT);
    }, true);
    btn('重新运行', run);
    btn('清空', function () { input.value = ''; run(); });

    left.appendChild(input);
    wrap.appendChild(left);
    wrap.appendChild(frame);
    body.appendChild(actions);
    body.appendChild(wrap);
    run();
  }
})();
