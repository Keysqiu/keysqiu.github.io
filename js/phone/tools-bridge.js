// 把工具箱挂进手机里的「工具 App」窗口。
//
// 工具本身不在这里实现——复用 /tools/ 页那 6 个工具（source/js/tools/*），
// 只改挂载点：工具页挂到 #tools-app 并操作浏览器历史，手机窗口挂到 #ph-tools-app
// 且必须关掉历史操作，否则会把首页 URL 冲成 ?tool=xxx。
'use strict';

(function () {
  var Phone = window.Phone || {};

  function mountOnce() {
    var host = document.getElementById('ph-tools-app');
    if (!host || host.__phMounted) return;
    if (!window.ToolsBox || !window.ToolsBox.mount) {
      host.textContent = '';
      var p = document.createElement('p');
      p.className = 'ph-tools__error';
      p.textContent = '工具加载失败，请刷新重试。';
      host.appendChild(p);
      return;
    }
    host.__phMounted = true;
    window.ToolsBox.mount(host, { history: false });
  }

  function boot() {
    var pop = document.getElementById('ph-tools');
    if (!pop) return;
    // 打开时才挂载：工具页的脚本本来就会在 DOMContentLoaded 时跑一遍，
    // 提前挂载会白做一次渲染
    pop.addEventListener('ph:overlay-open', mountOnce);
  }

  Phone.toolsBridge = { mountOnce: mountOnce };

  window.Phone = Phone;
  boot();
})();
