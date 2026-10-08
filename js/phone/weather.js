// 天气组件：Open-Meteo 免费接口 + 浏览器定位。
//
// 关键约束是「不能无限转圈」：接口正常失败会很快返回，但网络被劫持或接口挂起时请求会一直吊着，
// 组件就永远停在加载态。所以 fetch 必须带 AbortController 超时，超时按失败降级处理。
'use strict';

(function () {
  var Phone = window.Phone || {};
  var store = Phone.store;

  var CACHE_KEY = 'ph_wx_cache';
  var CACHE_TTL = 30 * 60 * 1000;
  var FETCH_TIMEOUT_MS = 8000;
  var GEO_TIMEOUT_MS = 5000;
  var FALLBACK = { lat: 30.2741, lon: 120.1551, city: '杭州' };

  // WMO weather code -> emoji 与中文描述
  var CODES = [
    [[0], '☀️', '晴'],
    [[1, 2], '🌤️', '少云'],
    [[3], '☁️', '阴'],
    [[45, 48], '🌫️', '雾'],
    [[51, 53, 55, 56, 57], '🌦️', '毛毛雨'],
    [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', '雨'],
    [[71, 73, 75, 77, 85, 86], '🌨️', '雪'],
    [[95, 96, 99], '⛈️', '雷雨']
  ];

  function describe(code) {
    for (var i = 0; i < CODES.length; i++) {
      if (CODES[i][0].indexOf(code) >= 0) return { icon: CODES[i][1], text: CODES[i][2] };
    }
    return { icon: '🌡️', text: '—' };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function readCache() {
    try {
      var raw = store.get(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.data || typeof c.t !== 'number') return null;
      if (Date.now() - c.t > CACHE_TTL) return null;
      return c.data;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { store.set(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  }

  function fetchJson(url) {
    // 接口挂起时不能一直等：超时即 abort，走降级
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT_MS);
    var opts = ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' };
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function locate() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(FALLBACK); return; }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(FALLBACK);
      }, GEO_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: '' });
        },
        function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(FALLBACK);
        },
        { timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  function load(loc) {
    // 必须带 timezone=auto：不带时接口按 UTC 返回 hourly.time，
    // 显示出来的小时会整体偏移（实测相差 8 小时）
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat.toFixed(4) +
      '&longitude=' + loc.lon.toFixed(4) +
      '&current=temperature_2m,weather_code' +
      '&hourly=temperature_2m,weather_code&forecast_hours=4' +
      '&timezone=auto';
    return fetchJson(url).then(function (j) {
      return { loc: loc, raw: j };
    });
  }

  function paint(data) {
    var raw = data.raw || {};
    var cur = raw.current || {};
    var d = describe(cur.weather_code);

    setText('ph-wx-icon', d.icon);
    setText('ph-wx-temp', cur.temperature_2m == null ? '—' : Math.round(cur.temperature_2m) + '°');
    setText('ph-wx-city', (data.loc && data.loc.city) || '当前位置');

    var hours = document.getElementById('ph-wx-hours');
    if (hours) {
      hours.textContent = '';
      var times = (raw.hourly && raw.hourly.time) || [];
      var temps = (raw.hourly && raw.hourly.temperature_2m) || [];
      var codes = (raw.hourly && raw.hourly.weather_code) || [];
      for (var i = 0; i < times.length && i < 4; i++) {
        var cell = document.createElement('span');
        var h = String(times[i]).slice(11, 13);
        cell.textContent = h + '时 ' + Math.round(temps[i]) + '°' + describe(codes[i]).icon;
        hours.appendChild(cell);
      }
    }
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function hide() {
    var box = document.querySelector('.ph-widget--weather');
    // 宁可整块隐藏也不留一个空壳占位
    if (box) box.hidden = true;
  }

  function boot() {
    var cached = readCache();
    if (cached) { paint(cached); return; }

    locate()
      .then(function (loc) {
        // 定位到具体坐标时反向补城市名成本高，直接用「当前位置」；兜底才有城市名
        return load(loc);
      })
      .then(function (data) {
        writeCache(data);
        paint(data);
      })
      .catch(function () {
        // 失败可能只是没网，保留组件但显示不可用；只有完全没数据才隐藏
        hide();
      });
  }

  Phone.weather = { boot: boot, describe: describe, readCache: readCache };

  window.Phone = Phone;
  boot();
})();
