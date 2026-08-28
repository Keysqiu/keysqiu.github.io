/**
 * 工具：图片转 Base64（Data URL），附带 HTML/CSS 用法片段
 */
(function () {
  'use strict';

  var B = window.ToolsBox;

  B.register({
    id: 'img-base64',
    name: '图片转 Base64',
    icon: '🧬',
    desc: '上传 / 拖拽 / 粘贴图片，生成 Data URL 及用法片段',
    group: '图片处理',
    render: function (body) {
      var drop = B.el('div', 'tools-dropzone', '点击选择图片，或将图片拖拽 / 粘贴到这里');
      var fileInput = B.el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';

      var result = B.el('div', 'tools-result tools-hidden');
      var actions = B.el('div', 'tools-actions tools-hidden');
      var preview = B.el('img', 'tools-img-preview');
      var info = B.el('div', 'tools-status');
      var out = B.el('pre', 'tools-output');
      var snippet = B.el('pre', 'tools-output tools-hidden');

      drop.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handle(fileInput.files[0]);
      });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('over');
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handle(f);
      });
      body.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            handle(items[i].getAsFile());
            break;
          }
        }
      });

      function fmtSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
      }

      function handle(file) {
        if (file.type.indexOf('image/') !== 0) { B.toast('请选择图片文件'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = String(reader.result);
          preview.src = dataUrl;
          info.textContent = file.name + ' · ' + file.type + ' · 原始 ' + fmtSize(file.size) +
            ' · Base64 后 ' + fmtSize(dataUrl.length);
          out.textContent = dataUrl;
          result.classList.remove('tools-hidden');
          actions.classList.remove('tools-hidden');
          snippet.textContent = '';
          snippet.classList.add('tools-hidden');
          snippetWrap.classList.add('tools-hidden');
        };
        reader.onerror = function () { B.toast('读取文件失败'); };
        reader.readAsDataURL(file);
      }

      function btn(label, fn, primary) {
        var b = B.el('button', 'tools-btn' + (primary ? ' primary' : ''), label);
        b.type = 'button';
        b.addEventListener('click', fn);
        actions.appendChild(b);
        return b;
      }

      btn('复制 Base64', function () { B.copyText(out.textContent, 'Base64 已复制'); }, true);
      btn('HTML 片段', function () {
        snippet.textContent = '<img src="' + out.textContent + '" alt="">';
        snippetWrap.classList.remove('tools-hidden');
        snippet.classList.remove('tools-hidden');
      });
      btn('CSS 片段', function () {
        snippet.textContent = 'background-image: url(' + out.textContent + ');';
        snippetWrap.classList.remove('tools-hidden');
        snippet.classList.remove('tools-hidden');
      });

      // 片段区：显示当前片段并附带复制按钮
      var snippetWrap = B.el('div', 'tools-actions tools-hidden');
      var snippetCopy = B.el('button', 'tools-btn', '复制片段');
      snippetCopy.type = 'button';
      snippetCopy.addEventListener('click', function () {
        if (!snippet.textContent) { B.toast('请先选择片段类型'); return; }
        B.copyText(snippet.textContent, '片段已复制');
      });
      snippetWrap.appendChild(snippetCopy);

      body.appendChild(fileInput);
      body.appendChild(drop);
      body.appendChild(actions);
      body.appendChild(result);
      result.appendChild(preview);
      result.appendChild(info);
      result.appendChild(out);
      result.appendChild(snippetWrap);
      result.appendChild(snippet);
    }
  });
})();
