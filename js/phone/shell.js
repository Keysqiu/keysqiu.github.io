// 手机桌面的功能脚本：存储封装、轻提示、动作路由。
// 浮层动画、多任务注册表、控制中心等由后续任务往这个文件追加。
//
// 存储封装存在的意义：隐私模式/禁用站点数据时，访问 localStorage/sessionStorage 会直接抛异常，
// 连读取 window.localStorage 这个属性本身都可能抛。所有读写都必须兜住，否则一处抛异常会让
// 整段脚本中断，后面的功能全部失效。
'use strict';

(function () {
  var Phone = window.Phone || {};

  /* ---------- 存储封装 ---------- */

  function ls() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function ss() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function read(api, key) {
    try { return api ? api.getItem(key) : null; } catch (e) { return null; }
  }

  function write(api, key, val) {
    try { if (api) api.setItem(key, val); } catch (e) {}
  }

  function drop(api, key) {
    try { if (api) api.removeItem(key); } catch (e) {}
  }

  function withFallback(v, fallback) {
    if (v != null) return v;
    return fallback === undefined ? null : fallback;
  }

  Phone.store = {
    get: function (key, fallback) { return withFallback(read(ls(), key), fallback); },
    set: function (key, val) { write(ls(), key, val); },
    sessionGet: function (key, fallback) { return withFallback(read(ss(), key), fallback); },
    sessionSet: function (key, val) { write(ss(), key, val); },
    sessionRemove: function (key) { drop(ss(), key); }
  };

  /* ---------- 轻提示 ---------- */

  var toastTimer = null;

  Phone.toast = function (msg, ms) {
    var el = document.querySelector('.ph-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ph-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, ms || 2000);
  };

  /* ---------- 多任务注册表 ---------- */
  // 每个应用打开时登记、关闭时注销，控制中心的「正在运行」读的就是它。
  // 这张表是让一堆链接看起来像「应用」而不是「跳转」的关键。

  Phone.apps = {};

  Phone.registerApp = function (id, app) {
    if (id && app) Phone.apps[id] = app;
  };

  Phone.unregisterApp = function (id) {
    delete Phone.apps[id];
  };

  /* ---------- 浮层开合 ----------
     所有浮层的显示/隐藏都必须走这两个函数：动画类、多任务登记、焦点归还都挂在这里，
     任何地方直接改 hidden 都会绕开这些副作用。 */

  // 浮层里装的是什么应用。放一张表比在每个浮层上挂 data-app-* 属性好维护。
  // control 是系统界面不是应用，不进多任务列表。
  var APP_META = {
    music: { name: '音乐', icon: 'fas fa-music', color: '#fa586a' },
    games: { name: '游戏中心', icon: 'fas fa-gamepad', color: '#4cd964' },
    tools: { name: '工具箱', icon: 'fas fa-toolbox', color: '#a86cf5' },
    wallpaper: { name: '壁纸', icon: 'fas fa-image', color: '#4c8bf5' },
    qrcode: { name: '分享二维码', icon: 'fas fa-qrcode', color: '#5856d6' },
    control: { name: '控制中心', icon: 'fas fa-sliders', color: '#8e8e93', system: true }
  };

  // 关闭动画 240ms，留一点余量；reduced-motion 下不会有 animationend，全靠这个兜底
  var CLOSE_FALLBACK_MS = 260;

  function overlayOf(el) {
    if (!el) return null;
    if (el.classList && el.classList.contains('ph-overlay')) return el;
    return el.closest ? el.closest('.ph-overlay') : null;
  }

  function metaOf(box) {
    var id = box.getAttribute('data-app-id');
    return id ? { id: id, info: APP_META[id] || { name: id, icon: 'fas fa-window-maximize', color: '#4c8bf5' } } : null;
  }

  Phone.openOverlay = function (el, trigger) {
    var box = overlayOf(el);
    if (!box) return;

    // 必须先取消 hidden 再量尺寸：display:none 的元素 getBoundingClientRect 全是 0
    box.hidden = false;
    box.removeAttribute('inert');

    // 从被点击图标的中心放大展开，看起来像从图标里长出来。
    // transform-origin 必须设在真正承载动画的那个元素上——动画加在 .ph-overlay__panel，
    // 设到外层浮层上是无效的（实测计算值仍是默认中心）。
    // 触发图标可能在面板之外（Dock 在下方），所以百分比允许超出 0-100。
    var panel = box.querySelector('.ph-overlay__panel') || box;
    if (trigger && trigger.getBoundingClientRect) {
      var t = trigger.getBoundingClientRect();
      var b = panel.getBoundingClientRect();
      if (b.width && b.height) {
        var ox = ((t.left + t.width / 2 - b.left) / b.width) * 100;
        var oy = ((t.top + t.height / 2 - b.top) / b.height) * 100;
        panel.style.transformOrigin = ox.toFixed(1) + '% ' + oy.toFixed(1) + '%';
      } else {
        panel.style.transformOrigin = 'center';
      }
    } else {
      panel.style.transformOrigin = 'center';
    }

    box.classList.remove('is-closing');
    box.classList.add('is-launching');
    box.__phTrigger = trigger || null;
    Phone.__openEl = box;

    // 各应用靠这个事件刷新自己的内容（如壁纸选择器重算选中态），
    // 免得 openOverlay 反过来认识每一个应用
    try { box.dispatchEvent(new CustomEvent('ph:overlay-open')); } catch (e) {}

    var meta = metaOf(box);
    if (meta && !meta.info.system) {
      Phone.registerApp(meta.id, {
        name: meta.info.name,
        icon: meta.info.icon,
        color: meta.info.color,
        focus: function () { Phone.openOverlay(box, box.__phTrigger); },
        close: function () { Phone.closeOverlay(box); }
      });
    }
  };

  Phone.closeOverlay = function (el) {
    var box = overlayOf(el);
    if (!box || box.hidden) return;

    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      box.hidden = true;
      box.setAttribute('inert', '');
      box.classList.remove('is-launching', 'is-closing');
      if (Phone.__openEl === box) Phone.__openEl = null;

      // 让应用自己收尾（游戏要停掉 iframe，否则会在后台继续跑）
      try { box.dispatchEvent(new CustomEvent('ph:overlay-close')); } catch (e) {}

      var meta = metaOf(box);
      if (meta && !meta.info.system) Phone.unregisterApp(meta.id);

      // 焦点还给触发的图标，否则键盘用户关掉浮层后会落回文档开头
      var trigger = box.__phTrigger;
      box.__phTrigger = null;
      if (trigger && trigger.focus) {
        try { trigger.focus(); } catch (e) {}
      }
    }

    var timer = setTimeout(finish, CLOSE_FALLBACK_MS);
    box.classList.remove('is-launching');
    box.classList.add('is-closing');
    // 只认关闭动画自己结束：浮层内子元素的动画也会冒泡上来，不加名字判断会提前收尾
    box.addEventListener('animationend', function onEnd(ev) {
      if (ev.animationName !== 'ph-close') return;
      box.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
      finish();
    });
  };

  /* ---------- 时钟与问候语 ---------- */

  var WEEK = '日一二三四五六';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function tickClock() {
    var d = new Date();
    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    setText('ph-clock', hm);
    setText('ph-widget-time', hm);
    setText('ph-widget-date', (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK.charAt(d.getDay()));
  }

  function greetWord(h) {
    if (h < 5) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function tickGreeting() {
    setText('ph-greet', greetWord(new Date().getHours()));
  }

  tickClock();
  tickGreeting();
  // 锁屏时钟由内联 bootstrap 以 10 秒周期负责，这里只管桌面上的那几处
  setInterval(tickClock, 15000);
  setInterval(tickGreeting, 60000);

  /* ---------- 第二屏 ---------- */

  function scrollToPosts() {
    var posts = document.getElementById('ph-posts');
    if (!posts) return;
    posts.scrollIntoView({ behavior: 'smooth', block: 'start' });
    markPostsSeen();
  }

  /* ---------- 新文章红点 ---------- */

  var badgeEl = null;

  function showBadge() {
    var host = document.querySelector('.ph-app[data-badge="posts"] .ph-app__icon');
    if (!host || badgeEl) return;
    badgeEl = document.createElement('span');
    badgeEl.className = 'ph-badge';
    badgeEl.textContent = '新';
    host.appendChild(badgeEl);
  }

  function hideBadge() {
    if (badgeEl && badgeEl.parentNode) badgeEl.parentNode.removeChild(badgeEl);
    badgeEl = null;
  }

  function markPostsSeen() {
    if (window.phNewest) Phone.store.set('ph_posts_seen', window.phNewest);
    hideBadge();
  }

  function initBadge() {
    var newest = window.phNewest;
    if (!newest) return;
    var seen = Phone.store.get('ph_posts_seen');
    // 首次访问只记录基线、不显示红点——老访客一进来就看到「新」会很困惑
    if (!seen) {
      Phone.store.set('ph_posts_seen', newest);
      return;
    }
    if (seen !== newest) showBadge();
  }

  initBadge();

  /* ---------- 控制中心 ---------- */

  var THEME_KEY = 'ph_theme_mode';   // 'auto' | 'light' | 'dark'
  var SOUND_KEY = 'ph_sound';        // '0' 表示静音
  var THEME_ORDER = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };

  function themeMode() {
    var m = Phone.store.get(THEME_KEY, 'auto');
    return THEME_ORDER.indexOf(m) >= 0 ? m : 'auto';
  }

  function applyTheme(mode) {
    var dark;
    if (mode === 'dark') dark = true;
    else if (mode === 'light') dark = false;
    else dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  // 必须在 Butterfly 的 head 脚本之后执行，否则会被它按自己的存储重置成 light。
  // --ph-op 不在这里初始化：它归壁纸引擎所有（存在壁纸那份配置里），本文件只负责控制中心。
  applyTheme(themeMode());

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSchemeChange = function () { if (themeMode() === 'auto') applyTheme('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', onSchemeChange);
    else if (mq.addListener) mq.addListener(onSchemeChange);
  }

  function makeTile(icon, name, value, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ph-cc__tile';

    var i = document.createElement('i');
    i.className = icon;
    var nm = document.createElement('span');
    nm.className = 'ph-cc__tile-name';
    nm.textContent = name;
    var val = document.createElement('span');
    val.className = 'ph-cc__tile-value';
    val.textContent = value;

    btn.appendChild(i);
    btn.appendChild(nm);
    btn.appendChild(val);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderRunning() {
    var host = document.getElementById('ph-cc-running');
    if (!host) return;
    host.textContent = '';

    var ids = Object.keys(Phone.apps);
    var head = document.createElement('div');
    head.className = 'ph-cc__section-title';
    head.textContent = ids.length ? '正在运行' : '没有正在运行的应用';
    host.appendChild(head);

    ids.forEach(function (id) {
      var app = Phone.apps[id];
      var row = document.createElement('div');
      row.className = 'ph-cc__running-row';

      var icon = document.createElement('i');
      icon.className = app.icon || 'fas fa-window-maximize';
      icon.style.color = app.color || '#4c8bf5';

      var name = document.createElement('span');
      name.className = 'ph-cc__running-name';
      name.textContent = app.name || id;

      var focusBtn = document.createElement('button');
      focusBtn.type = 'button';
      focusBtn.className = 'ph-cc__mini-btn';
      focusBtn.textContent = '切换';
      focusBtn.addEventListener('click', function () {
        Phone.closeOverlay(document.getElementById('ph-control'));
        if (app.focus) app.focus();
      });

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ph-cc__mini-btn';
      closeBtn.textContent = '关闭';
      closeBtn.addEventListener('click', function () {
        if (app.close) app.close();
        renderRunning();
      });

      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(focusBtn);
      row.appendChild(closeBtn);
      host.appendChild(row);
    });
  }

  function renderQuick() {
    var host = document.getElementById('ph-cc-quick');
    if (!host) return;
    host.textContent = '';

    var title = document.createElement('div');
    title.className = 'ph-cc__section-title';
    title.textContent = '快捷操作';
    host.appendChild(title);

    var wrap = document.createElement('div');
    wrap.className = 'ph-cc__quick-row';

    [
      { label: '随机文章', icon: 'fas fa-shuffle', run: function () { runAction('random'); } },
      { label: '文章列表', icon: 'fas fa-list', run: function () {
        Phone.closeOverlay(document.getElementById('ph-control'));
        scrollToPosts();
      } }
    ].forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ph-cc__quick-btn';
      var i = document.createElement('i');
      i.className = item.icon;
      var span = document.createElement('span');
      span.textContent = item.label;
      btn.appendChild(i);
      btn.appendChild(span);
      btn.addEventListener('click', item.run);
      wrap.appendChild(btn);
    });

    host.appendChild(wrap);
  }

  function renderTiles() {
    var host = document.getElementById('ph-cc-tiles');
    if (!host) return;
    host.textContent = '';

    var mode = themeMode();
    host.appendChild(makeTile('fas fa-circle-half-stroke', '主题', THEME_LABEL[mode], function () {
      var next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
      Phone.store.set(THEME_KEY, next);
      applyTheme(next);
      renderTiles();
    }));

    var muted = Phone.store.get(SOUND_KEY) === '0';
    host.appendChild(makeTile('fas fa-volume-high', '音效', muted ? '已静音' : '开启', function () {
      Phone.store.set(SOUND_KEY, muted ? '1' : '0');
      renderTiles();
    }));

    host.appendChild(makeTile('fas fa-lock', '锁屏', '立即锁屏', function () {
      Phone.closeOverlay(document.getElementById('ph-control'));
      if (Phone.lock) Phone.lock();
    }));

    host.appendChild(makeTile('fas fa-image', '壁纸', '更换', function () {
      Phone.closeOverlay(document.getElementById('ph-control'));
      Phone.openOverlay(document.getElementById('ph-wallpaper-pop'), null);
    }));
  }

  function bindOpacitySlider() {
    var slider = document.getElementById('ph-cc-op');
    if (!slider || slider.__phBound) return;
    slider.__phBound = true;

    var wall = Phone.wall || {};
    var saved = (wall.current && wall.current()) || {};
    slider.value = String(saved.ccOp != null ? saved.ccOp : 100);

    slider.addEventListener('input', function () {
      var n = Number(slider.value) || 100;
      // 交给壁纸引擎写：--ph-op 只能有一个写入方，否则两处状态会打架
      if (wall.setOpacity) wall.setOpacity(n);
      else document.documentElement.style.setProperty('--ph-op', (n / 100).toFixed(2));
    });
  }

  // 每次打开控制中心都重渲染：多任务列表在关闭期间会变
  function renderControlCenter() {
    renderTiles();
    bindOpacitySlider();
    renderRunning();
    renderQuick();
  }

  /* ---------- 动作路由 ---------- */

  var QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=';

  var ACTIONS = {
    search: function () {
      // 复用 Butterfly 主题自带的本地搜索弹窗，不自己再实现一套
      var btn = document.querySelector('#search-button .search');
      if (btn) btn.click();
      else Phone.toast('搜索暂不可用');
    },

    random: function () {
      var list = window.phPosts;
      if (!list || !list.length) { Phone.toast('没有可跳转的文章'); return; }
      location.href = list[Math.floor(Math.random() * list.length)];
    },

    qrcode: function (trigger) {
      var img = document.getElementById('ph-qrcode-img');
      if (img) img.src = QR_API + encodeURIComponent(location.origin + '/');
      // 必须把触发元素传下去，否则浮层退化成从屏幕中心展开，而不是从被点的图标长出来
      Phone.openOverlay(document.getElementById('ph-qrcode'), trigger);
    },

    cc: function (trigger) {
      renderControlCenter();
      Phone.openOverlay(document.getElementById('ph-control'), trigger);
    }
  };

  function runAction(name, el) {
    var fn = ACTIONS[name];
    if (fn) fn(el);
  }

  // 事件委托：图标网格、Dock、组件、控制中心按钮、滚动提示共用一套路由
  var ROUTABLE = '.ph-app[data-overlay], .ph-app[data-action], .ph-widget[data-overlay], ' +
    '.ph-cc-btn[data-action], .ph-scroll-hint, .ph-app[href^="#"]';

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest(ROUTABLE) : null;
    if (!el) return;

    var overlaySel = el.getAttribute('data-overlay');
    if (overlaySel) {
      var target = document.querySelector(overlaySel);
      if (!target) return;
      ev.preventDefault();
      Phone.openOverlay(target, el);
      return;
    }

    var action = el.getAttribute('data-action');
    if (action) {
      ev.preventDefault();
      runAction(action, el);
      return;
    }

    // 页内锚点（第二屏）：平滑滚动，不用原生跳转——原生跳转会往地址栏塞 # 且没有过渡
    var href = el.getAttribute('href') || '';
    if (href.charAt(0) === '#') {
      ev.preventDefault();
      scrollToPosts();
      return;
    }
    // 其余交给浏览器按 href 原生跳转，不拦截
  });

  // 点浮层遮罩空白处关闭
  document.addEventListener('click', function (ev) {
    if (ev.target && ev.target.classList && ev.target.classList.contains('ph-overlay')) {
      Phone.closeOverlay(ev.target);
    }
  });

  // 点浮层右上角的关闭按钮
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('.ph-overlay__close') : null;
    if (!btn) return;
    Phone.closeOverlay(btn.closest('.ph-overlay'));
  });

/* ---------- Dock 菜单（右键 / 长按）---------- */

  var DOCK_KEY = 'ph_dock';
  var LONG_PRESS_MS = 500;
  var LONG_PRESS_MOVE_TOL = 10;

  function dockExtra() {
    try {
      var list = JSON.parse(Phone.store.get(DOCK_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function pinToDock(el) {
    var href = el.getAttribute('href') || '';
    var label = el.getAttribute('aria-label') || el.textContent.trim();
    if (!href || href.charAt(0) === '#') { Phone.toast('这一项不能固定'); return; }
    var list = dockExtra();
    if (list.some(function (x) { return x.href === href; })) { Phone.toast('已在 Dock 中'); return; }
    list.push({
      href: href,
      name: label,
      icon: (el.querySelector('.ph-app__icon i') || {}).className || 'fas fa-link',
      bg: (el.querySelector('.ph-app__icon') || {}).style ? el.querySelector('.ph-app__icon').style.background : ''
    });
    try { Phone.store.set(DOCK_KEY, JSON.stringify(list)); } catch (e) {}
    renderDockExtra();
    Phone.toast('已固定到 Dock');
  }

  function renderDockExtra() {
    var slot = document.getElementById('ph-dock-dynamic');
    if (!slot) return;
    slot.textContent = '';
    dockExtra().forEach(function (item) {
      var a = document.createElement('a');
      a.className = 'ph-app';
      a.href = item.href;
      a.setAttribute('aria-label', item.name);
      var box = document.createElement('span');
      box.className = 'ph-app__icon';
      if (item.bg) box.style.background = item.bg;
      var i = document.createElement('i');
      i.className = item.icon;
      box.appendChild(i);
      a.appendChild(box);
      slot.appendChild(a);
    });
  }

  function closeMenu() {
    var m = document.querySelector('.ph-dock-menu');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    document.removeEventListener('click', closeMenu, true);
    window.removeEventListener('blur', closeMenu);
    document.removeEventListener('keydown', onMenuKey);
  }

  function onMenuKey(ev) { if (ev.key === 'Escape') closeMenu(); }

  function menuItems(el) {
    var inDock = !!(el.closest && el.closest('.ph-dock'));
    var items = [];
    if (inDock) {
      items.push({ label: '打开', run: function () { el.click(); } });
      var href = el.getAttribute('href') || '';
      if (href && href.charAt(0) !== '#') {
        items.push({ label: '在新窗口打开', run: function () { window.open(href, '_blank', 'noopener'); } });
      }
      var appId = (el.closest('.ph-overlay') || {}).id;
      if (appId && Phone.apps[appId]) {
        items.push({ label: '关闭', run: function () { Phone.apps[appId].close(); } });
      }
    } else {
      items.push({ label: '固定到 Dock', run: function () { pinToDock(el); } });
      items.push({ label: '打开', run: function () { el.click(); } });
    }
    return items;
  }

  Phone.dockMenu = {
    show: function (x, y, title, items) {
      closeMenu();
      var menu = document.createElement('div');
      menu.className = 'ph-dock-menu';

      if (title) {
        var h = document.createElement('div');
        h.className = 'ph-dock-menu__title';
        h.textContent = title;
        menu.appendChild(h);
      }

      items.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ph-dock-menu__item';
        b.textContent = item.label;
        b.addEventListener('click', function () { closeMenu(); item.run(); });
        menu.appendChild(b);
      });

      document.body.appendChild(menu);

      // 先插入再量尺寸，然后按视口边界收敛，避免被裁掉
      var r = menu.getBoundingClientRect();
      var left = Math.min(x, window.innerWidth - r.width - 8);
      var top = Math.min(y, window.innerHeight - r.height - 8);
      menu.style.left = Math.max(8, left) + 'px';
      menu.style.top = Math.max(8, top) + 'px';

      setTimeout(function () {
        document.addEventListener('click', closeMenu, true);
        window.addEventListener('blur', closeMenu);
        document.addEventListener('keydown', onMenuKey);
      }, 0);
    },
    close: closeMenu
  };

  function openMenuFor(el, x, y) {
    var label = el.getAttribute('aria-label') || '';
    Phone.dockMenu.show(x, y, label, menuItems(el));
  }

  // 桌面端右键
  document.addEventListener('contextmenu', function (ev) {
    var el = ev.target.closest ? ev.target.closest('.ph-app, .ph-widget[data-overlay]') : null;
    if (!el) return;
    ev.preventDefault();
    openMenuFor(el, ev.clientX, ev.clientY);
  });

  // 触屏长按：移动超过阈值就取消，否则滚动列表会误触发
  var pressTimer = null;
  var pressStart = null;
  var suppressClickUntil = 0;

  document.addEventListener('touchstart', function (ev) {
    var el = ev.target.closest ? ev.target.closest('.ph-app, .ph-widget[data-overlay]') : null;
    if (!el || ev.touches.length !== 1) return;
    pressStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    pressTimer = setTimeout(function () {
      pressTimer = null;
      // 长按结束后浏览器还会补一次 click，会把菜单立刻关掉，需要抑制
      suppressClickUntil = Date.now() + 700;
      openMenuFor(el, pressStart.x, pressStart.y);
    }, LONG_PRESS_MS);
  }, { passive: true });

  document.addEventListener('touchmove', function (ev) {
    if (!pressTimer || !pressStart) return;
    var t = ev.touches[0];
    if (Math.abs(t.clientX - pressStart.x) > LONG_PRESS_MOVE_TOL ||
        Math.abs(t.clientY - pressStart.y) > LONG_PRESS_MOVE_TOL) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  }, { passive: true });

  document.addEventListener('click', function (ev) {
    if (Date.now() < suppressClickUntil) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  renderDockExtra();

  // Escape 关闭当前浮层。只关窗口不动播放状态——音乐 App 里按 Escape 不应该把歌暂停掉。
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!Phone.__openEl) return;
    ev.preventDefault();
    Phone.closeOverlay(Phone.__openEl);
  });

  // Ctrl+K / Cmd+K 打开搜索，与 Dock 的搜索按钮走同一条动作。
  // 锁屏未解开时不响应，否则按键会被「任意键解锁」和这里同时处理，一次按键触发两件事。
  document.addEventListener('keydown', function (ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (ev.key !== 'k' && ev.key !== 'K') return;
    var lock = document.getElementById('ph-lock');
    if (lock && !lock.hidden) return;
    ev.preventDefault();
    runAction('search');
  });

  window.Phone = Phone;
})();
