/**
 * 工具：Markdown 分享链接
 * 编辑模式：粘贴 MD → 实时预览 → 生成内嵌内容的分享链接
 * 查看模式：打开分享链接（#c=payload）时直接渲染文档
 */
(function () {
  'use strict';

  var B = window.ToolsBox;
  // 分享链接长度警戒值：超出后部分浏览器/聊天工具可能截断
  var URL_LIMIT = 30000;

  function renderMarkdown(md) {
    var html = marked.parse(md, { gfm: true, breaks: true });
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
  }

  B.register({
    id: 'md-share',
    name: 'MD 预览',
    icon: '📄',
    desc: '把 Markdown 变成一条可分享的预览链接（内容内嵌在链接里，本站不存储）',
    group: '分享与预览',
    render: function (body, ctx) {
      if (ctx.payload != null && ctx.payload.trim()) {
        renderViewer(body, ctx.payload);
      } else {
        renderEditor(body);
      }
    }
  });

  /* ---------- 查看模式 ---------- */

  function renderViewer(body, md) {
    var actions = B.el('div', 'tools-actions');
    var wrap = B.el('div', 'tools-md-view');

    function btn(label, fn, primary) {
      var b = B.el('button', 'tools-btn' + (primary ? ' primary' : ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    }

    var showSource = false;
    var srcView = B.el('pre', 'tools-output tools-hidden');
    srcView.textContent = md;

    function toggleSource() {
      showSource = !showSource;
      srcView.classList.toggle('tools-hidden', !showSource);
      wrap.classList.toggle('tools-hidden', showSource);
      toggleBtn.textContent = showSource ? '查看渲染' : '查看源码';
    }
    var toggleBtn = btn('查看源码', toggleSource);
    btn('复制 Markdown', function () { B.copyText(md, 'Markdown 已复制'); });
    btn('新建分享', function () {
      history.replaceState({}, '', location.pathname);
      body.innerHTML = '';
      renderEditor(body);
    }, true);

    wrap.innerHTML = renderMarkdown(md);
    body.appendChild(actions);
    body.appendChild(wrap);
    body.appendChild(srcView);
  }

  /* ---------- 编辑模式 ---------- */

  function renderEditor(body) {
    var actions = B.el('div', 'tools-actions');
    var cols = B.el('div', 'tools-split');
    var left = B.el('div', 'tools-split-pane');
    var right = B.el('div', 'tools-split-pane tools-md-view');
    var status = B.el('div', 'tools-status');

    var input = B.el('textarea', 'tools-input tools-grow');
    input.rows = 14;
    input.spellcheck = false;
    input.placeholder = '# 在此输入或粘贴 Markdown…\n\n点击"复制分享链接"，任何人在浏览器打开该链接即可直接阅读。';

    function btn(label, fn, primary) {
      var b = B.el('button', 'tools-btn' + (primary ? ' primary' : ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    }

    function preview() {
      right.innerHTML = renderMarkdown(input.value);
    }

    btn('复制分享链接', function () {
      if (!input.value.trim()) { B.toast('请先输入 Markdown 内容'); return; }
      B.shareLink('md-share', input.value, URL_LIMIT);
    }, true);
    btn('复制 Markdown', function () {
      if (!input.value.trim()) { B.toast('内容为空'); return; }
      B.copyText(input.value, 'Markdown 已复制');
    });
    btn('清空', function () { input.value = ''; preview(); status.textContent = ''; });

    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        preview();
        status.textContent = input.value.length ? input.value.length + ' 字符' : '';
      }, 200);
    });

    left.appendChild(input);
    cols.appendChild(left);
    cols.appendChild(right);
    body.appendChild(actions);
    body.appendChild(cols);
    body.appendChild(status);
    preview();
  }
})();
