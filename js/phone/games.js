// 游戏中心：用 iframe 打开第三方 H5 小游戏。
//
// 游戏站点全是第三方的，随时可能拒绝被嵌入、改地址或直接下线。所以加载超时（10 秒）
// 就给「不支持内嵌」提示 + 外链按钮，不留一个白屏 iframe。
// 注意：跨域 iframe 的 load 事件即使被拒绝嵌入也会触发，所以只能靠超时兜底，
// 没法精确区分「加载慢」和「被拒绝」。
'use strict';

(function () {
  var Phone = window.Phone || {};
  var LOAD_TIMEOUT_MS = 10000;

  function showGrid() {
    var grid = document.getElementById('ph-games-grid');
    var stage = document.getElementById('ph-games-stage');
    if (grid) grid.hidden = false;
    if (stage) stage.hidden = true;
    var frame = document.getElementById('ph-games-frame');
    if (frame) frame.src = 'about:blank';
    var tip = document.getElementById('ph-games-fallback');
    if (tip) tip.hidden = true;
  }

  function showFallback(url, name) {
    var tip = document.getElementById('ph-games-fallback');
    var link = document.getElementById('ph-games-open');
    if (link) {
      link.href = url;
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    }
    if (tip) {
      tip.hidden = false;
      var nameEl = document.getElementById('ph-games-fallback-name');
      if (nameEl) nameEl.textContent = name || '该游戏';
    }
  }

  function openGame(btn) {
    var url = btn.getAttribute('data-url');
    var name = btn.getAttribute('data-name') || '';
    if (!url) return;

    var grid = document.getElementById('ph-games-grid');
    var stage = document.getElementById('ph-games-stage');
    var frame = document.getElementById('ph-games-frame');
    var title = document.getElementById('ph-games-title');
    if (!frame || !stage) return;

    if (grid) grid.hidden = true;
    stage.hidden = false;
    if (title) title.textContent = name;
    var tip = document.getElementById('ph-games-fallback');
    if (tip) tip.hidden = true;

    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      showFallback(url, name);
    }, LOAD_TIMEOUT_MS);

    frame.addEventListener('load', function onLoad() {
      frame.removeEventListener('load', onLoad);
      if (settled) return;
      settled = true;
      clearTimeout(timer);
    });

    frame.src = url;

    // 把运行中的游戏固定到 Dock，点击可切回
    var slot = document.getElementById('ph-dock-dynamic');
    if (slot) {
      slot.textContent = '';
      var icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'ph-app';
      icon.setAttribute('aria-label', name || '游戏');
      var box = document.createElement('span');
      box.className = 'ph-app__icon';
      box.style.background = btn.getAttribute('data-bg') || '#4cd964';
      box.textContent = btn.getAttribute('data-letter') || '游';
      icon.appendChild(box);
      icon.addEventListener('click', function () {
        Phone.openOverlay(document.getElementById('ph-games'), icon);
      });
      slot.appendChild(icon);
    }
  }

  function boot() {
    var grid = document.getElementById('ph-games-grid');
    if (!grid) return;

    grid.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.ph-game') : null;
      if (btn) openGame(btn);
    });

    var back = document.getElementById('ph-games-back');
    if (back) back.addEventListener('click', showGrid);

    // 关闭整个游戏 App 时把 iframe 停掉，否则游戏会在后台继续跑
    var pop = document.getElementById('ph-games');
    if (pop) {
      pop.addEventListener('ph:overlay-close', function () {
        var frame = document.getElementById('ph-games-frame');
        if (frame) frame.src = 'about:blank';
        showGrid();
      });
    }
  }

  Phone.games = { openGame: openGame, showGrid: showGrid };

  window.Phone = Phone;
  boot();
})();
