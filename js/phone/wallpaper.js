/* iOS 桌面动态壁纸
 * 数据源（均为免费公开 API，图片走 <img> 预加载，不受 CORS 限制）：
 *   必应每日一图  https://peapix.com/bing/feed?country=cn   （JSON 带 CORS，含近 7 天）
 *   随机风景      https://picsum.photos/seed/{seed}/1920/1080
 *   随机二次元    https://t.alcy.cc/ycy（备用 https://www.dmoe.cc/random.php）
 *   默认壁纸      /assets/images/wallpaper.jpg（深色主题 /assets/images/wallpaper-dark.jpg）
 * 默认动态壁纸    Sintel 预告（首次访问且未选择过壁纸时播放）
 * 选择缓存于 localStorage；必应模式每次进首页静默刷新当天图，随机模式超 12 小时自动换新。
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var layer = $('ph-wallpaper');
  var widget = document.querySelector('.ph-widget--wallpaper');
  var thumb = $('ph-wall-thumb');
  var nameEl = $('ph-wall-name');
  var pop = $('ph-wallpaper-pop');
  var bingGrid = $('ph-wall-grid');
  if (!layer || !widget) return;

  var KEY = 'ph_wallpaper';
  var RANDOM_TTL = 12 * 3600 * 1000;
  /* 无本地选择时的默认动态壁纸 */
  var DEFAULT_VIDEO = { name: 'Sintel 预告', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4' };
  var bingItems = [];
  var bingLoaded = false;

  function readStore() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function writeStore(v) {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
      return true;
    } catch (e) {
      // 参考站这里是静默忽略。但上传大图时超配额的表现是「本次生效、刷新就没了」，
      // 用户只会觉得是 bug，所以这里加一句提示。正常路径行为与参考站一致。
      if (window.Phone && window.Phone.toast) window.Phone.toast('图片较大，未能保存，本次仍会生效', 3200);
      return false;
    }
  }

  /* 预加载成功才切换，避免闪半张图；失败走 onerror 回退 */
  function apply(url, meta) {
    meta = meta || {};
    clearVideos();
    var probe = new Image();
    probe.onload = function () {
      layer.style.backgroundImage = 'url("' + url + '")';
      layer.classList.add('is-ready');
      // 兜底：任何路径都没置 is-ready 的话壁纸层会一直透明，3 秒后强制显示
      setTimeout(function () { layer.classList.add('is-ready'); }, 3000);
      var lk = document.getElementById('ph-lock');
      if (lk) lk.style.backgroundImage = 'url("' + url + '")';
      if (thumb) thumb.style.backgroundImage = 'url("' + (meta.thumb || url) + '")';
      if (nameEl) {
        var t = meta.title || '今日壁纸';
        var cut = t.indexOf('，');
        if (cut > 0) t = t.slice(0, cut);
        nameEl.textContent = t;
      }
    };
    probe.onerror = function () { if (meta.onerror) meta.onerror(); };
    probe.src = url;
  }

  /* 视频壁纸层：清空/应用；页面隐藏时自动暂停省电 */
  function clearVideos() {
    Array.prototype.forEach.call(layer.querySelectorAll('video'), function (v) { v.remove(); });
    layer.classList.remove('has-video');
  }
  function onVisChange() {
    var v = layer.querySelector('video');
    if (!v) { document.removeEventListener('visibilitychange', onVisChange); return; }
    if (document.hidden) v.pause();
    else v.play().catch(function () {});
  }
  function applyVideo(url, opts) {
    opts = opts || {};
    layer.classList.remove('is-ready');
    clearVideos();
    var v = document.createElement('video');
    v.className = 'ph-wallpaper-video';
    v.src = url;
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.addEventListener('canplay', function () { layer.classList.add('is-ready'); }, { once: true });
    v.addEventListener('error', function () {
      v.remove();
      layer.classList.remove('has-video');
      applyStatic();
    });
    layer.appendChild(v);
    layer.classList.add('has-video');
    if (thumb) thumb.style.backgroundImage = 'url("' + (opts.thumb || url) + '")';
    if (nameEl) nameEl.textContent = opts.title || '视频壁纸';
    document.addEventListener('visibilitychange', onVisChange);
  }

  /* 自定义图片：canvas 压到 1920 宽 JPEG，控制 localStorage 体积 */
  function customImage(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1920 / img.width);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', 0.85);
        apply(data, { title: '自定义壁纸', thumb: data });
        saveMode('custom', data, { title: '自定义壁纸' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  /* 本地视频：体积太大不持久化，仅本次会话有效 */
  function customVideo(file) {
    if (!file || !/^video\//.test(file.type)) return;
    applyVideo(URL.createObjectURL(file), { title: '本地视频（本次会话）' });
    writeStore({ mode: 'video-custom', ts: Date.now(), title: '本地视频（本次会话）' });
  }

  // 本站没有壁纸图片资源，静态壁纸用签名渐变代替（与整站配色一致）
  var GRADIENT = 'linear-gradient(135deg, #4c8bf5 0%, #9a6cf5 50%, #f56ec6 100%)';
  function applyStatic(keepStore) {
    clearVideos();
    layer.classList.remove('is-ready');
    layer.style.backgroundImage = GRADIENT;
    layer.classList.add('is-ready');
    var lk = document.getElementById('ph-lock');
    if (lk) lk.style.backgroundImage = GRADIENT;
    if (thumb) thumb.style.backgroundImage = '';
    if (nameEl) nameEl.textContent = '签名渐变';
    if (!keepStore) writeStore({ mode: 'static', ts: Date.now() });
  }

  function saveMode(mode, url, meta) {
    var prev = readStore() || {};
    var v = { mode: mode, url: url, ts: Date.now(), auto: !!prev.auto };
    for (var k in (meta || {})) v[k] = meta[k];
    writeStore(v);
  }

  /* ---- 必应每日一图 ---- */
  function fetchBing(cb) {
    fetch('https://peapix.com/bing/feed?country=cn')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (list) { if (list && list.length) { bingItems = list; cb(list); } else cb(null); })
      .catch(function () { cb(null); });
  }
  function applyBing(item, silent) {
    var meta = { title: item.title || '今日壁纸', sub: '必应每日 · ' + item.date, thumb: item.thumbUrl };
    apply(item.fullUrl, {
      title: meta.title, thumb: meta.thumb,
      onerror: silent ? null : applyStatic
    });
    saveMode('bing', item.fullUrl, meta);
  }
  function bootBing() {
    fetchBing(function (list) {
      if (list) { applyBing(list[0], true); return; }
      var saved = readStore();
      if (saved && saved.url && saved.mode === 'bing') apply(saved.url, saved);
      else applyStatic(true);
    });
  }

  /* ---- 随机壁纸 ---- */
  function newRandom(mode, silent) {
    if (mode === 'scenic') {
      var seed = Math.random().toString(36).slice(2, 10);
      var url = 'https://picsum.photos/seed/' + seed + '/1920/1080';
      apply(url, {
        title: '随机风景', thumb: 'https://picsum.photos/seed/' + seed + '/320/180',
        onerror: silent ? applyStatic : null
      });
      saveMode('scenic', url, { title: '随机风景' });
    } else {
      var u = 'https://t.alcy.cc/ycy?t=' + Date.now();
      apply(u, {
        title: '随机二次元', thumb: u,
        onerror: function () {
          var fallback = 'https://www.dmoe.cc/random.php?t=' + Date.now();
          apply(fallback, { title: '随机二次元', onerror: silent ? applyStatic : null });
          saveMode('acg', fallback, { title: '随机二次元' });
        }
      });
      saveMode('acg', u, { title: '随机二次元' });
    }
  }

  /* ---- 启动 ----
   * 默认：必应每日一图；开了「每天自动换」时，必应每次刷新当日图，
   * 随机模式超过 24 小时自动换新；未开自动则保持用户上次选择。
   */
  (function boot() {
    var saved = readStore();
    if (!saved) {
      applyVideo(DEFAULT_VIDEO.url, { title: DEFAULT_VIDEO.name });
      saveMode('video', DEFAULT_VIDEO.url, { title: DEFAULT_VIDEO.name });
      return;
    }
    if (saved && saved.mode === 'video' && saved.url) { applyVideo(saved.url, saved); return; }
    if (saved && saved.url && saved.mode !== 'static' && saved.mode !== 'video' && saved.mode !== 'video-custom') apply(saved.url, saved);
    if (!saved || saved.mode === 'static') bootBing();
    else if (saved.mode === 'bing' && (saved.auto || !saved.url)) bootBing();
    else if (saved.mode === 'video-custom') bootBing();
    else if (saved.auto && Date.now() - (saved.ts || 0) > 24 * 3600 * 1000) newRandom(saved.mode, true);
  })();

  /* ---- 自动更换开关 ---- */
  var autoCb = document.getElementById('ph-wall-auto');
  if (autoCb) {
    autoCb.checked = !!(readStore() || {}).auto;
    autoCb.addEventListener('change', function () {
      var v = readStore() || { mode: 'static' };
      v.auto = autoCb.checked;
      v.ts = Date.now();
      writeStore(v);
    });
  }

  /* ---- 供控制中心 / 桌面右键菜单调用 ---- */
  window.Phone = window.Phone || {};
  window.Phone.wall = {
    random: newRandom,
    static: function () { applyStatic(); },
    video: function (url, name) {
      applyVideo(url, { title: name });
      saveMode('video', url, { title: name });
    },
    customImage: customImage,
    customVideo: customVideo,
    openPicker: function () { if (widget) widget.click(); },
    current: function () { return readStore(); },
    setOpacity: function (n) {
      var st = readStore() || {};
      st.ccOp = applyOpacity(n);
      writeStore(st);
      return st.ccOp;
    }
  };

  /* ---- 弹窗 ---- */
  function closePop() {
    if (window.Phone && window.Phone.closeOverlay) window.Phone.closeOverlay(pop);
    else pop.hidden = true;
  }
  // 组件本身带 data-overlay，由 shell.js 的动作路由负责打开；
  // 这里只挂「打开后首次拉必应列表」这件事
  if (pop) {
    pop.addEventListener('ph:overlay-open', function () {
      if (!bingLoaded) { bingLoaded = true; fetchBing(renderBingGrid); }
    });
  }

  function renderBingGrid() {
    if (!bingGrid) return;
    if (!bingItems.length) {
      bingGrid.textContent = '';
      var hint = document.createElement('div');
      hint.className = 'ph-wall__hint';
      hint.textContent = '必应壁纸加载失败，试试下面的随机壁纸～';
      bingGrid.appendChild(hint);
      return;
    }
    bingGrid.textContent = '';
    var saved = readStore();
    bingItems.slice(0, 8).forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ph-bing-item' + (saved && saved.url === it.fullUrl ? ' is-active' : '');
      b.title = it.title || '';
      var img = document.createElement('span');
      img.className = 'ph-bing-item__img';
      img.style.backgroundImage = 'url("' + it.thumbUrl + '")';
      var cap = document.createElement('span');
      cap.className = 'ph-bing-item__cap';
      cap.textContent = (it.date || '').slice(5);
      b.appendChild(img);
      b.appendChild(cap);
      b.addEventListener('click', function () {
        applyBing(it, false);
        var cur = bingGrid.querySelector('.ph-bing-item.is-active');
        if (cur) cur.classList.remove('is-active');
        b.classList.add('is-active');
      });
      bingGrid.appendChild(b);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.ph-wall__source'), function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-mode');
      if (mode === 'static') { applyStatic(); closePop(); return; }
      newRandom(mode, false);
      closePop();
    });
  });

  /* ---- 视频壁纸预设 + 本地自定义上传 ---- */
  var VIDEOS = [
    { name: '花开', url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
    { name: '海洋', url: 'https://vjs.zencdn.net/v/oceans.mp4' },
    { name: DEFAULT_VIDEO.name, url: DEFAULT_VIDEO.url }
  ];
  var vlist = document.getElementById('ph-wall-video-list');
  if (vlist) {
    VIDEOS.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ph-wall__source';
      b.innerHTML = '<i class="fas fa-film"></i> ' + v.name;
      b.addEventListener('click', function () {
        window.iosWallpaper.video(v.url, v.name);
        closePop();
      });
      vlist.appendChild(b);
    });
  }
  function bindUpload(btnId, inputId, fn) {
    var btn = document.getElementById(btnId), input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) {
        fn(input.files[0]);
        closePop();
        input.value = '';
      }
    });
  }
  bindUpload('ph-wall-img-btn', 'ph-wall-file-img', customImage);
  bindUpload('ph-wall-video-btn', 'ph-wall-file-video', customVideo);

  /* ---- 组件透明度（0% 完全隐藏桌面组件） ---- */
  function applyOpacity(n) {
    n = Math.max(0, Math.min(100, Number(n) || 0));
    document.documentElement.style.setProperty('--ph-op', String(n / 100));
    var val = document.getElementById('ph-wall-op-val');
    if (val) val.textContent = n + '%';
    return n;
  }

  (function () {
    var slider = document.getElementById('ph-wall-op');
    var val = document.getElementById('ph-wall-op-val');
    var saved = readStore();
    var init = applyOpacity(saved && saved.ccOp != null ? saved.ccOp : 100);
    if (slider) {
      slider.value = init;
      slider.addEventListener('input', function () {
        var st = readStore() || {};
        st.ccOp = applyOpacity(slider.value);
        writeStore(st);
      });
    }
    var reset = document.getElementById('ph-wall-op-reset');
    if (reset) reset.addEventListener('click', function () {
      var st = readStore() || {};
      st.ccOp = applyOpacity(100);
      writeStore(st);
      if (slider) slider.value = 100;
    });
  })();
})();
