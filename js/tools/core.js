/**
 * 工具箱核心框架：工具注册表、卡片网格、路由（?tool=xxx + 历史）、分享 payload 编解码
 * 各工具通过 ToolsBox.register({ id, name, icon, desc, group, render }) 注册
 */
(function () {
  'use strict';

  var app = {
    tools: [],
    byId: {},
    root: null,
    payload: null // 分享链接 #c=... 解码后的内容，仅在通过分享链接打开时存在
  };

  function register(tool) {
    if (!tool || !tool.id || !tool.render) return;
    if (app.byId[tool.id]) return; // 防止重复注册
    app.byId[tool.id] = tool;
    app.tools.push(tool);
  }

  /* ---------- 分享 payload：URL base64url <-> UTF-8 字符串 ---------- */

  function encodePayload(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodePayload(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function readHashPayload() {
    var m = /(?:^|&)c=([^&]+)/.exec(location.hash.replace(/^#/, ''));
    if (!m) return null;
    try {
      return decodePayload(m[1]);
    } catch (e) {
      console.error('[tools] payload 解码失败', e);
      return null;
    }
  }

  /* ---------- 通用 UI 工具 ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.querySelector('.tools-toast');
    if (!t) {
      t = el('div', 'tools-toast');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast(okMsg || '已复制');
      } catch (e) {
        toast('复制失败，请手动复制');
      }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(okMsg || '已复制');
      }, fallback);
    } else {
      fallback();
    }
  }

  function buildShareUrl(toolId, content) {
    var base = location.origin + location.pathname.replace(/index\.html$/, '');
    return base.replace(/\/tools\/$/, '/tools/') + '?tool=' + toolId + '#c=' + encodePayload(content);
  }

  /* ---------- 渲染 ---------- */

  var GROUPS = ['文本与格式', '分享与预览', '图片处理'];
  var GROUP_ICONS = { '文本与格式': '📝', '分享与预览': '🔗', '图片处理': '🖼️' };

  function renderGrid() {
    var root = app.root;
    root.innerHTML = '';
    var intro = el('p', 'tools-intro', '所有工具均在浏览器本地运行，数据不会上传到服务器。');
    root.appendChild(intro);

    GROUPS.forEach(function (g) {
      var items = app.tools.filter(function (t) { return t.group === g; });
      if (!items.length) return;
      var head = el('h2', 'tools-group-title');
      head.appendChild(el('span', 'tools-group-icon', GROUP_ICONS[g] || '🔧'));
      head.appendChild(document.createTextNode(g));
      root.appendChild(head);

      var grid = el('div', 'tools-grid');
      items.forEach(function (t) {
        var card = el('button', 'tool-card');
        card.type = 'button';
        card.appendChild(el('div', 'tool-card-icon', t.icon || '🔧'));
        card.appendChild(el('div', 'tool-card-name', t.name));
        card.appendChild(el('div', 'tool-card-desc', t.desc || ''));
        card.addEventListener('click', function () { openTool(t.id, true); });
        grid.appendChild(card);
      });
      root.appendChild(grid);
    });
  }

  function openTool(id, push) {
    var tool = app.byId[id];
    if (!tool) { renderGrid(); return; }
    var root = app.root;
    root.innerHTML = '';

    var bar = el('div', 'tools-toolbar');
    var back = el('button', 'tools-back', '← 返回工具箱');
    back.type = 'button';
    back.addEventListener('click', function () { history.pushState({}, '', location.pathname); renderGrid(); });
    bar.appendChild(back);
    root.appendChild(bar);

    var head = el('div', 'tools-head');
    head.appendChild(el('span', 'tools-head-icon', tool.icon || '🔧'));
    head.appendChild(el('h1', 'tools-head-name', tool.name));
    if (tool.desc) head.appendChild(el('p', 'tools-head-desc', tool.desc));
    root.appendChild(head);

    var body = el('div', 'tools-body tool-' + tool.id);
    root.appendChild(body);
    try {
      tool.render(body, { payload: app.payload });
    } catch (e) {
      console.error('[tools] 工具渲染失败: ' + tool.id, e);
      body.appendChild(el('p', 'tools-error', '该工具加载失败，请刷新重试。'));
    }

    if (push) {
      history.pushState({ tool: id }, '', location.pathname + '?tool=' + id);
    }
  }

  function init() {
    app.root = document.getElementById('tools-app');
    if (!app.root) return;

    var params = new URLSearchParams(location.search);
    var toolId = params.get('tool');
    app.payload = readHashPayload();

    if (toolId && app.byId[toolId]) {
      openTool(toolId, false);
    } else {
      renderGrid();
    }

    window.addEventListener('popstate', function () {
      var p = new URLSearchParams(location.search).get('tool');
      app.payload = readHashPayload();
      if (p && app.byId[p]) openTool(p, false);
      else renderGrid();
    });
  }

  window.ToolsBox = {
    register: register,
    encodePayload: encodePayload,
    decodePayload: decodePayload,
    copyText: copyText,
    toast: toast,
    el: el,
    buildShareUrl: buildShareUrl,
    /** 通用分享按钮：生成指向指定工具的内嵌内容链接并复制 */
    shareLink: function (toolId, content, sizeLimit) {
      var url = buildShareUrl(toolId, content);
      if (sizeLimit && url.length > sizeLimit) {
        toast('内容过长（' + url.length + ' 字符），链接可能在部分浏览器中无法打开');
      }
      copyText(url, '分享链接已复制（内容内嵌在链接中）');
      return url;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
