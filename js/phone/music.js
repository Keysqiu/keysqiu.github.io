// 全站音乐播放器：首页是音乐 App + 组件，其他页面是右下角迷你播放条。
//
// 为什么要全站加载：跨页续播。播放状态存在 localStorage，翻页后按曲目 id 在歌单里重新定位，
// 再 seek 回原进度。只在首页加载的话点开文章音乐就断了。
//
// 其他设计要点：
// - 歌单走免费 Meting 代理（网易云），第三方接口随时可能失效，所以拉取带超时、
//   失败显示「暂不可用」，单曲播不出来自动跳下一首但最多 3 次。
// - 进度存档节流 3 秒一次，并在 pagehide 时强制存一次（关标签页时最后一次 timeupdate 可能没赶上）。
// - 首页才有的部分（组件、App 窗口）靠 DOM 是否存在来判断，缺了自动跳过。
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var CHARTS = [
    { id: '3778678', name: '热歌榜', desc: '每天更新' },
    { id: '3779629', name: '新歌榜', desc: '抢先听' },
    { id: '19723756', name: '飙升榜', desc: '热度飙升' },
    { id: '2884035', name: '原创榜', desc: '华语原创' }
  ];
  var API = 'https://api.injahow.cn/meting/?server=netease&type=playlist&id=';
  var LRC_TIMEOUT_MS = 8000;
  var LIST_TIMEOUT_MS = 8000;
  var MAX_AUTO_SKIP = 3;
  var STATE_KEY = 'global_music_v1';
  var FAV_KEY = 'music_favs';
  var RECENT_KEY = 'music_recent';

  var IS_HOME = document.body.classList.contains('phone-home');

  var widget = {
    name: $('ph-music-name'), artist: $('ph-music-artist'), cover: $('ph-music-cover'),
    bar: $('ph-music-bar'), toggle: $('ph-music-toggle'), next: $('ph-music-next'),
    card: document.querySelector('.ph-widget--music')
  };

  // App 内部的 DOM 由 JS 建（见 buildApp），所以这里先留空，建好后填充
  var app = {};

  var charts = {};
  var queue = [];
  var cur = 0;
  var playing = false;
  var activeChartId = CHARTS[0].id;
  var skips = 0;

  var audio = new Audio();
  audio.preload = 'none';

  function readLS(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pad2(n) { n = Math.floor(n || 0); return (n < 10 ? '0' : '') + n; }
  function trackId(t) { var m = (t.url || '').match(/id=(\d+)/); return m ? m[1] : (t.name || ''); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 歌词 ---------- */

  var lrcCache = {};
  var lrcLines = [];
  var lrcIdx = -1;
  var lrcKey = '';

  function parseLrc(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var stamps = line.match(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g);
      if (!stamps) return;
      var txt = line.replace(/\[[^\]]*\]/g, '').trim();
      if (!txt) return;
      stamps.forEach(function (s) {
        var m = s.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/);
        out.push({ t: (+m[1]) * 60 + (+m[2]) + (m[3] ? +('0.' + m[3]) : 0), x: txt });
      });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  function renderLrc(lines) {
    if (!app.lyrList) return;
    lrcLines = lines;
    lrcIdx = -1;
    app.lyrList.textContent = '';
    if (!lines.length) {
      app.lyrList.appendChild(el('div', 'ph-music__loading', '暂无歌词，纯音乐请欣赏'));
      return;
    }
    var frag = document.createDocumentFragment();
    lines.forEach(function (L) {
      var d = el('div', 'ph-music__lrc-line', L.x);
      d.setAttribute('data-t', L.t);
      frag.appendChild(d);
    });
    app.lyrList.appendChild(frag);
    lrcSync();
  }

  function loadLyrics(t) {
    if (!app.lyrList || !app.lyrSong) return;
    var key = trackId(t);
    app.lyrSong.textContent = t.name + ' · ' + (t.artist || '');
    if (lrcKey === key && lrcLines.length) { lrcSync(); return; }
    lrcKey = key;
    lrcLines = [];
    lrcIdx = -1;
    if (!t.lrc) {
      app.lyrList.textContent = '';
      app.lyrList.appendChild(el('div', 'ph-music__loading', '暂无歌词'));
      return;
    }
    if (lrcCache[key]) { renderLrc(lrcCache[key]); return; }
    app.lyrList.textContent = '';
    app.lyrList.appendChild(el('div', 'ph-music__loading', '歌词加载中…'));

    // 歌词接口返回纯文本 LRC，不是 JSON；且可能挂起，必须带超时
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, LRC_TIMEOUT_MS);
    var opts = ctrl ? { signal: ctrl.signal } : {};
    fetch(t.lrc, opts).then(function (r) {
      clearTimeout(timer);
      return r.ok ? r.text() : '';
    }).then(function (txt) {
      var lines = parseLrc(txt);
      lrcCache[key] = lines;
      if (lrcKey === key) renderLrc(lines);
    }).catch(function () {
      clearTimeout(timer);
      if (lrcKey !== key || !app.lyrList) return;
      app.lyrList.textContent = '';
      app.lyrList.appendChild(el('div', 'ph-music__loading', '歌词加载失败'));
    });
  }

  function lrcSync() {
    if (!app.lyrList) return;
    var t = audio.currentTime || 0;
    var i = 0;
    while (i < lrcLines.length && lrcLines[i].t <= t) i++;
    i -= 1;
    if (i === lrcIdx) return;
    lrcIdx = i;
    var rows = app.lyrList.children;
    for (var k = 0; k < rows.length; k++) rows[k].classList.toggle('is-active', k === i);
    if (i >= 0 && rows[i]) {
      var target = rows[i].offsetTop - app.lyrList.clientHeight / 2 + rows[i].clientHeight / 2;
      app.lyrList.scrollTop = Math.max(0, target);
    }
  }

  /* ---------- mini 播放条（非首页）---------- */

  var mini = { root: null };

  function ensureMini() {
    if (IS_HOME) return null;
    if (mini.root) return mini;

    var root = el('div', 'ph-mini');
    root.id = 'ph-mini-player';
    root.hidden = true;

    mini.cover = el('img', 'ph-mini__cover');
    mini.cover.alt = '';
    var info = el('div', 'ph-mini__info');
    mini.name = el('b', 'ph-mini__name');
    mini.artist = el('span', 'ph-mini__artist');
    info.appendChild(mini.name);
    info.appendChild(mini.artist);

    mini.toggle = el('button', 'ph-mini__btn');
    mini.toggle.type = 'button';
    mini.toggle.title = '播放/暂停';
    mini.next = el('button', 'ph-mini__btn');
    mini.next.type = 'button';
    mini.next.title = '下一首';
    mini.next.innerHTML = '<i class="fas fa-forward-step"></i>';
    mini.close = el('button', 'ph-mini__btn');
    mini.close.type = 'button';
    mini.close.title = '停止并关闭';
    mini.close.innerHTML = '<i class="fas fa-xmark"></i>';

    var barWrap = el('span', 'ph-mini__bar');
    mini.bar = el('span', 'ph-mini__bar-fill');
    barWrap.appendChild(mini.bar);

    root.appendChild(mini.cover);
    root.appendChild(info);
    root.appendChild(mini.toggle);
    root.appendChild(mini.next);
    root.appendChild(mini.close);
    root.appendChild(barWrap);
    document.body.appendChild(root);

    mini.toggle.addEventListener('click', function () { togglePlay(); });
    mini.next.addEventListener('click', function () { next(); });
    mini.close.addEventListener('click', function () {
      audio.pause();
      playing = false;
      queue = [];
      cur = 0;
      try { localStorage.removeItem(STATE_KEY); } catch (e) {}
      root.hidden = true;
    });

    mini.root = root;
    return mini;
  }

  function updateMini(t) {
    var m = ensureMini();
    if (!m || !t) return;
    m.root.hidden = false;
    m.name.textContent = t.name || '';
    m.artist.textContent = t.artist || '';
    if (t.pic) m.cover.src = t.pic;
  }

  /* ---------- 播放核心 ---------- */

  function setIcons() {
    var icon = playing ? 'fas fa-pause' : 'fas fa-play';
    if (widget.toggle) widget.toggle.innerHTML = '<i class="' + icon + '"></i>';
    if (app.play) app.play.innerHTML = '<i class="' + icon + '"></i>';
    if (mini.toggle) mini.toggle.innerHTML = '<i class="' + icon + '"></i>';
  }

  function highlight() {
    var tid = queue[cur] ? trackId(queue[cur]) : null;
    [app.songs, app.recentSongs, app.favSongs].forEach(function (host) {
      if (!host) return;
      Array.prototype.forEach.call(host.querySelectorAll('.ph-song-row'), function (row) {
        row.classList.toggle('is-playing', row.getAttribute('data-tid') === tid);
      });
    });
  }

  function updateTrackUI(t) {
    if (!t) return;
    if (widget.name) widget.name.textContent = t.name || '';
    if (widget.artist) widget.artist.textContent = t.artist || '';
    if (app.name) app.name.textContent = t.name || '';
    if (app.artist) app.artist.textContent = t.artist || '';
    if (t.pic) {
      if (widget.cover) widget.cover.src = t.pic;
      if (app.cover) app.cover.src = t.pic;
    }
    if (widget.bar) widget.bar.style.width = '0%';
    if (app.bar) app.bar.style.width = '0%';
    if (app.time) app.time.textContent = '00:00 / 00:00';
    updateFavIcon(t);
    if (app.lyrPanel && !app.lyrPanel.hidden) loadLyrics(t);
    highlight();
    updateMini(t);
  }

  function getRecent() { return readLS(RECENT_KEY, []); }

  function saveRecent(t) {
    var rec = getRecent().filter(function (x) { return trackId(x) !== trackId(t); });
    rec.unshift(t);
    writeLS(RECENT_KEY, rec.slice(0, 30));
  }

  function playFrom(tracks, i, opts) {
    if (!tracks || !tracks.length) return;
    opts = opts || {};
    queue = tracks;
    cur = (i + queue.length) % queue.length;
    var t = queue[cur];
    audio.src = t.url;
    updateTrackUI(t);
    saveRecent(t);
    playing = true;
    setIcons();
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function () {
        // 恢复播放时被自动播放策略拦下是正常的，静默置为暂停；用户点播失败才跳下一首
        if (opts.resume) { playing = false; setIcons(); }
        else autoSkip();
      });
    }
    saveState(true);
  }

  function togglePlay() {
    if (!queue.length) return;
    if (playing) { audio.pause(); playing = false; }
    else { playing = true; audio.play().catch(function () {}); }
    setIcons();
    saveState(true);
  }

  function autoSkip() {
    if (skips >= MAX_AUTO_SKIP) {
      skips = 0;
      playing = false;
      setIcons();
      if (window.Phone && window.Phone.toast) window.Phone.toast('这首暂时播放不了');
      return;
    }
    skips++;
    next();
  }

  function next() { skips = 0; playFrom(queue, cur + 1); }
  function prev() { skips = 0; playFrom(queue, cur - 1); }

  /* ---------- 跨页续播 ---------- */

  var lastSave = 0;

  function saveState(force) {
    if (!queue.length || !queue[cur]) return;
    var now = Date.now();
    if (!force && now - lastSave < 3000) return;
    lastSave = now;
    writeLS(STATE_KEY, {
      tid: trackId(queue[cur]),
      chartId: activeChartId,
      time: audio.currentTime || 0,
      playing: playing
    });
  }

  window.addEventListener('pagehide', function () { saveState(true); });

  function restore() {
    var s = readLS(STATE_KEY, null);
    if (!s || !s.tid || !s.chartId) return;
    loadChart(s.chartId, function (tracks) {
      if (!tracks.length) return;
      var idx = -1;
      tracks.forEach(function (t, i) { if (idx < 0 && trackId(t) === s.tid) idx = i; });
      if (idx < 0) return;

      queue = tracks;
      cur = idx;
      activeChartId = s.chartId;
      var t = queue[cur];
      audio.src = t.url;
      updateTrackUI(t);

      audio.addEventListener('loadedmetadata', function () {
        // 留 2 秒余量，避免恢复到接近结尾的位置直接触发下一首
        try {
          if (s.time > 1 && isFinite(audio.duration)) {
            audio.currentTime = Math.min(s.time, Math.max(1, audio.duration - 2));
          }
        } catch (e) {}
      }, { once: true });

      if (s.playing) {
        playing = true;
        audio.play().catch(function () { playing = false; setIcons(); });
      } else {
        playing = false;
      }
      setIcons();
      saveState(true);
    });
  }

  /* ---------- 数据 ---------- */

  function request(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, LIST_TIMEOUT_MS);
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function loadChart(id, done) {
    if (charts[id]) { done(charts[id]); return; }
    request(API + id)
      .then(function (r) { return r.json(); })
      .then(function (list) {
        charts[id] = (list || []).filter(function (t) { return t && t.url; });
        done(charts[id]);
      })
      .catch(function () { done([]); });
  }

  function getFavMap() { return readLS(FAV_KEY, {}); }
  function favList() {
    var m = getFavMap();
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  /* ---------- App 视图 ---------- */

  function songRow(t, i) {
    var tid = trackId(t);
    var isCur = queue[cur] && tid === trackId(queue[cur]);
    var li = el('li', 'ph-song-row' + (isCur ? ' is-playing' : ''));
    li.setAttribute('data-i', i);
    li.setAttribute('data-tid', tid);
    li.appendChild(el('span', 'ph-song-row__idx', String(i + 1)));
    li.appendChild(el('span', 'ph-song-row__name', t.name || '未知曲目'));
    li.appendChild(el('span', 'ph-song-row__artist', t.artist || ''));
    return li;
  }

  function showView(name) {
    if (!app.views || !app.views.discover) return;
    Object.keys(app.views).forEach(function (k) {
      if (app.views[k]) app.views[k].hidden = (k !== name);
    });
    if (app.nav) {
      Array.prototype.forEach.call(app.nav.querySelectorAll('li'), function (li) {
        li.classList.toggle('is-active', li.getAttribute('data-view') === name);
      });
    }
  }

  function renderDiscover() {
    if (!app.grid) return;
    if (app.grid.children.length) { showView('discover'); return; }
    CHARTS.forEach(function (c) {
      loadChart(c.id, function (tracks) {
        if (!tracks.length || !app.grid) return;
        var card = el('button', 'ph-playlist');
        card.type = 'button';
        var cover = el('span', 'ph-playlist__cover');
        if (tracks[0].pic) cover.style.backgroundImage = 'url("' + tracks[0].pic + '")';
        cover.appendChild(el('i', 'fas fa-play ph-playlist__play'));
        cover.appendChild(el('span', 'ph-playlist__count', c.desc));
        card.appendChild(cover);
        card.appendChild(el('b', 'ph-playlist__name', c.name));
        card.appendChild(el('span', 'ph-playlist__desc', tracks.length + '首 · ' + c.desc));
        card.addEventListener('click', function () { openChart(c.id, c.name); });
        app.grid.appendChild(card);
      });
    });
    loadChart(CHARTS[0].id, function (tracks) {
      if (tracks.length && app.banner && tracks[0].pic) {
        app.banner.style.backgroundImage = 'url("' + tracks[0].pic + '")';
      }
    });
  }

  function openChart(id, name) {
    activeChartId = id;
    showView('chart');
    if (app.listTitle) app.listTitle.textContent = name || '';
    if (app.songs) {
      app.songs.textContent = '';
      app.songs.appendChild(el('li', 'ph-music__loading', '加载中…'));
    }
    loadChart(id, function (tracks) {
      if (!app.songs) return;
      app.songs.textContent = '';
      if (!tracks.length) {
        app.songs.appendChild(el('li', 'ph-music__loading', '暂不可用'));
        return;
      }
      tracks.forEach(function (t, i) { app.songs.appendChild(songRow(t, i)); });
      highlight();
    });
  }

  function renderRecent() {
    if (!app.recentSongs) return;
    var rec = getRecent();
    app.recentSongs.textContent = '';
    if (!rec.length) {
      app.recentSongs.appendChild(el('li', 'ph-music__loading', '还没有播放记录，去发现页听听吧'));
      return;
    }
    rec.forEach(function (t, i) { app.recentSongs.appendChild(songRow(t, i)); });
    highlight();
  }

  function renderFavs() {
    if (!app.favSongs) return;
    var fl = favList();
    app.favSongs.textContent = '';
    if (!fl.length) {
      app.favSongs.appendChild(el('li', 'ph-music__loading', '点播放条上的 ♥ 收藏喜欢的歌'));
      return;
    }
    fl.forEach(function (t, i) { app.favSongs.appendChild(songRow(t, i)); });
    highlight();
  }

  /* ---------- 收藏 ---------- */

  function updateFavIcon(t) {
    if (!app.fav) return;
    var liked = !!(t && getFavMap()[trackId(t)]);
    app.fav.innerHTML = liked ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
    app.fav.classList.toggle('is-liked', liked);
  }

  /* ---------- App DOM ---------- */

  function buildApp() {
    var root = $('ph-music-app');
    if (!root || root.__phBuilt) return !!root;
    root.__phBuilt = true;
    root.textContent = '';

    app.root = root;

    var wrap = el('div', 'ph-music-app');

    // 左栏：导航
    app.nav = el('ul', 'ph-music__nav');
    [['discover', '发现', 'fas fa-compass'], ['recent', '最近', 'fas fa-clock-rotate-left'], ['favs', '收藏', 'fas fa-heart']]
      .forEach(function (row) {
        var li = el('li', 'ph-music__nav-item');
        var i = el('i', row[2]);
        li.appendChild(i);
        li.appendChild(document.createTextNode(' ' + row[1]));
        li.setAttribute('data-view', row[0]);
        app.nav.appendChild(li);
      });

    // 主区：四个视图
    app.views = {};

    var discover = el('div', 'ph-music__view');
    app.banner = el('div', 'ph-music__banner');
    app.bannerPlay = el('button', 'ph-music__banner-play');
    app.bannerPlay.type = 'button';
    app.bannerPlay.innerHTML = '<i class="fas fa-play"></i> 随便听听';
    app.banner.appendChild(app.bannerPlay);
    app.grid = el('div', 'ph-music__grid');
    discover.appendChild(app.banner);
    discover.appendChild(app.grid);
    app.views.discover = discover;

    var chart = el('div', 'ph-music__view');
    var chartHead = el('div', 'ph-music__view-head');
    app.back = el('button', 'ph-music__back');
    app.back.type = 'button';
    app.back.innerHTML = '<i class="fas fa-chevron-left"></i> 发现';
    app.listTitle = el('span', 'ph-music__view-title');
    chartHead.appendChild(app.back);
    chartHead.appendChild(app.listTitle);
    app.songs = el('ul', 'ph-music__songs');
    chart.appendChild(chartHead);
    chart.appendChild(app.songs);
    app.views.chart = chart;

    var recent = el('div', 'ph-music__view');
    recent.appendChild(el('div', 'ph-music__view-title ph-music__view-title--only', '最近播放'));
    app.recentSongs = el('ul', 'ph-music__songs');
    recent.appendChild(app.recentSongs);
    app.views.recent = recent;

    var favs = el('div', 'ph-music__view');
    favs.appendChild(el('div', 'ph-music__view-title ph-music__view-title--only', '我的收藏'));
    app.favSongs = el('ul', 'ph-music__songs');
    favs.appendChild(app.favSongs);
    app.views.favs = favs;

    var main = el('div', 'ph-music__main');
    Object.keys(app.views).forEach(function (k) { main.appendChild(app.views[k]); });

    // 歌词面板
    app.lyrPanel = el('div', 'ph-music__lyrics');
    app.lyrPanel.hidden = true;
    var lyrHead = el('div', 'ph-music__lyrics-head');
    app.lyrSong = el('span', 'ph-music__lyrics-song');
    var lyrClose = el('button', 'ph-music__lyrics-close');
    lyrClose.type = 'button';
    lyrClose.innerHTML = '<i class="fas fa-xmark"></i>';
    lyrHead.appendChild(app.lyrSong);
    lyrHead.appendChild(lyrClose);
    app.lyrList = el('div', 'ph-music__lrc');
    app.lyrPanel.appendChild(lyrHead);
    app.lyrPanel.appendChild(app.lyrList);
    lyrClose.addEventListener('click', function () { app.lyrPanel.hidden = true; });

    // 底部播放条
    var player = el('div', 'ph-music__player');
    app.cover = el('img', 'ph-music__pcover');
    app.cover.alt = '';
    var pInfo = el('div', 'ph-music__pinfo');
    app.name = el('b', 'ph-music__pname');
    app.artist = el('span', 'ph-music__partist');
    pInfo.appendChild(app.name);
    pInfo.appendChild(app.artist);

    app.progress = el('div', 'ph-music__progress');
    app.bar = el('span', 'ph-music__progress-fill');
    app.progress.appendChild(app.bar);
    app.time = el('span', 'ph-music__time', '00:00 / 00:00');

    app.fav = el('button', 'ph-music__pbtn');
    app.fav.type = 'button';
    app.fav.title = '收藏';
    // 必须在这里就给图标：updateFavIcon 只在有曲目播放时才被调用，
    // 不初始化的话没播歌时这个按钮是空的
    app.fav.innerHTML = '<i class="far fa-heart"></i>';
    app.prev = el('button', 'ph-music__pbtn');
    app.prev.type = 'button';
    app.prev.innerHTML = '<i class="fas fa-backward-step"></i>';
    app.play = el('button', 'ph-music__pbtn ph-music__pbtn--main');
    app.play.type = 'button';
    app.play.innerHTML = '<i class="fas fa-play"></i>';
    app.next = el('button', 'ph-music__pbtn');
    app.next.type = 'button';
    app.next.innerHTML = '<i class="fas fa-forward-step"></i>';
    var lyrBtn = el('button', 'ph-music__pbtn');
    lyrBtn.type = 'button';
    lyrBtn.title = '歌词';
    lyrBtn.innerHTML = '<i class="fas fa-align-left"></i>';

    player.appendChild(app.cover);
    player.appendChild(pInfo);
    player.appendChild(app.progress);
    player.appendChild(app.time);
    player.appendChild(app.fav);
    player.appendChild(app.prev);
    player.appendChild(app.play);
    player.appendChild(app.next);
    player.appendChild(lyrBtn);

    wrap.appendChild(app.nav);
    wrap.appendChild(main);
    wrap.appendChild(app.lyrPanel);
    wrap.appendChild(player);
    root.appendChild(wrap);

    /* 事件 */

    app.back.addEventListener('click', function () { showView('discover'); });
    app.nav.addEventListener('click', function (ev) {
      var li = ev.target.closest ? ev.target.closest('li[data-view]') : null;
      if (!li) return;
      var v = li.getAttribute('data-view');
      if (v === 'discover') { renderDiscover(); showView('discover'); }
      if (v === 'recent') { renderRecent(); showView('recent'); }
      if (v === 'favs') { renderFavs(); showView('favs'); }
    });

    app.songs.addEventListener('click', function (ev) {
      var row = ev.target.closest ? ev.target.closest('.ph-song-row') : null;
      if (!row) return;
      var i = Number(row.getAttribute('data-i'));
      loadChart(activeChartId, function (tracks) {
        // 点当前正在播的那首是切播放/暂停，不是重头播
        if (queue[cur] && trackId(queue[cur]) === trackId(tracks[i])) togglePlay();
        else playFrom(tracks, i);
      });
    });
    app.recentSongs.addEventListener('click', function (ev) {
      var row = ev.target.closest ? ev.target.closest('.ph-song-row') : null;
      if (row) playFrom(getRecent(), Number(row.getAttribute('data-i')));
    });
    app.favSongs.addEventListener('click', function (ev) {
      var row = ev.target.closest ? ev.target.closest('.ph-song-row') : null;
      if (row) playFrom(favList(), Number(row.getAttribute('data-i')));
    });

    app.bannerPlay.addEventListener('click', function () {
      loadChart(CHARTS[0].id, function (tracks) {
        if (tracks.length) playFrom(tracks, Math.floor(Math.random() * tracks.length));
      });
    });

    app.play.addEventListener('click', togglePlay);
    app.next.addEventListener('click', next);
    app.prev.addEventListener('click', prev);

    app.fav.addEventListener('click', function () {
      var t = queue[cur];
      if (!t) return;
      var m = getFavMap();
      var id = trackId(t);
      if (m[id]) delete m[id];
      else m[id] = t;
      writeLS(FAV_KEY, m);
      updateFavIcon(t);
      if (app.views.favs && !app.views.favs.hidden) renderFavs();
    });

    app.progress.addEventListener('click', function (ev) {
      if (!audio.duration) return;
      var rect = app.progress.getBoundingClientRect();
      audio.currentTime = ((ev.clientX - rect.left) / rect.width) * audio.duration;
    });

    lyrBtn.addEventListener('click', function () {
      app.lyrPanel.hidden = !app.lyrPanel.hidden;
      if (!app.lyrPanel.hidden && queue[cur]) loadLyrics(queue[cur]);
    });

    // 点歌词行跳转到该时间；暂停状态点歌词直接开始播
    app.lyrList.addEventListener('click', function (ev) {
      var line = ev.target.closest ? ev.target.closest('.ph-music__lrc-line') : null;
      if (!line || !audio.duration) return;
      var t = parseFloat(line.getAttribute('data-t'));
      if (isFinite(t)) {
        audio.currentTime = t;
        if (!playing) togglePlay();
      }
    });

    return true;
  }

  function openApp() {
    var pop = $('ph-music');
    if (!pop) return;
    if (window.Phone && window.Phone.openOverlay) window.Phone.openOverlay(pop, null);
    else pop.hidden = false;
  }

  /* ---------- 启动 ---------- */

  function boot() {
    if (widget.card) {
      widget.card.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('.ph-music__btn')) return;
        openApp();
      });
    }
    if (widget.toggle) {
      widget.toggle.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!queue.length) { openApp(); return; }
        togglePlay();
      });
    }
    if (widget.next) {
      widget.next.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!queue.length) { openApp(); return; }
        next();
      });
    }

    if (IS_HOME) {
      buildApp();
      var pop = $('ph-music');
      if (pop) {
        pop.addEventListener('ph:overlay-open', function () {
          renderDiscover();
          showView('discover');
          if (!queue.length) loadChart(activeChartId, function () {});
        });
      }
    }

    audio.addEventListener('timeupdate', function () {
      if (!audio.duration) return;
      var p = (audio.currentTime / audio.duration) * 100 + '%';
      if (widget.bar) widget.bar.style.width = p;
      if (app.bar) app.bar.style.width = p;
      if (mini.bar) mini.bar.style.width = p;
      if (app.time) {
        app.time.textContent = pad2(audio.currentTime / 60) + ':' + pad2(audio.currentTime % 60) +
          ' / ' + pad2(audio.duration / 60) + ':' + pad2(audio.duration % 60);
      }
      if (app.lyrPanel && !app.lyrPanel.hidden) lrcSync();
      saveState();
    });

    audio.addEventListener('ended', function () { next(); });
    audio.addEventListener('error', function () { if (queue.length && audio.src) autoSkip(); });

    setIcons();
    restore();
  }

  window.Phone = window.Phone || {};
  window.Phone.music = {
    playFrom: playFrom,
    togglePlay: togglePlay,
    next: next,
    prev: prev,
    openApp: openApp,
    charts: CHARTS,
    state: function () { return { queue: queue, cur: cur, playing: playing, chartId: activeChartId }; }
  };

  boot();
})();
