// 每日一句：hitokoto 接口，按天缓存，接口挂了用内置句子兜底。
//
// 按天缓存而不是每次刷新都拉：这句话一天之内不应该变，而且能省掉绝大多数请求。
// 接口是第三方的，失败是常态，所以必须有本地兜底，否则组件会一直空着。
'use strict';

(function () {
  var Phone = window.Phone || {};
  var store = Phone.store;

  var CACHE_KEY = 'ph_quote';
  var API = 'https://v1.hitokoto.cn/?c=d&c=i&c=k&encode=json';
  var TIMEOUT_MS = 8000;

  // 兜底句子：接口不可用时也要让组件有内容
  var FALLBACKS = [
    '故不积跬步，无以至千里。',
    '能用工具解决的事情，坚决不用人工。',
    '写作即发布，思源笔记驱动。',
    '保持热爱，奔赴山海。',
    '不积小流，无以成江海。',
    '纸上得来终觉浅，绝知此事要躬行。',
    '路虽远行则将至，事虽难做则必成。',
    '把复杂留给自己，把简单留给用户。'
  ];

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function readCache() {
    try {
      var c = JSON.parse(store.get(CACHE_KEY) || 'null');
      return c && c.day === today() && c.text ? c : null;
    } catch (e) { return null; }
  }

  function writeCache(text, from) {
    try { store.set(CACHE_KEY, JSON.stringify({ day: today(), text: text, from: from || '' })); } catch (e) {}
  }

  function paint(text, from) {
    var el = document.getElementById('ph-quote');
    if (!el) return;
    el.textContent = from ? text + ' —— ' + from : text;
  }

  function fallbackForToday() {
    // 按日期取模选，同一天内保持一致
    var d = new Date();
    var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    return FALLBACKS[seed % FALLBACKS.length];
  }

  function fetchQuote() {
    // 接口挂起时不能一直等
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(API, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function boot() {
    var cached = readCache();
    if (cached) { paint(cached.text, cached.from); return; }

    fetchQuote()
      .then(function (j) {
        var text = j && j.hitokoto;
        if (!text) throw new Error('empty');
        var from = j.from || '';
        writeCache(text, from);
        paint(text, from);
      })
      .catch(function () {
        paint(fallbackForToday(), '');
      });
  }

  Phone.quote = { boot: boot, fallbackForToday: fallbackForToday };

  window.Phone = Phone;
  boot();
})();
