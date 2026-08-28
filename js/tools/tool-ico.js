/**
 * 工具：Windows ICO 图标生成器
 * 上传 JPG/PNG/WEBP/SVG → 自动裁为 1:1 → 按所选尺寸逐档缩放为 PNG →
 * 打包为单文件多尺寸 .ico（PNG 条目，Vista+ 标准）→ 预览 + 下载
 */
(function () {
  'use strict';

  var B = window.ToolsBox;
  var ALL_SIZES = [16, 24, 32, 48, 64, 128, 256];
  var DEFAULT_SIZES = ALL_SIZES; // 默认全部尺寸勾选

  B.register({
    id: 'ico-gen',
    name: 'ICO 图标生成',
    icon: '🎯',
    desc: '多尺寸 Windows ICO 图标生成器（16~256px）',
    group: '图片处理',
    render: function (body) {
      var drop = B.el('div', 'tools-dropzone', '点击选择图片（JPG / PNG / WEBP / SVG），或拖拽 / 粘贴到这里');
      var fileInput = B.el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/jpeg,image/png,image/webp,image/svg+xml';
      fileInput.style.display = 'none';

      var options = B.el('div', 'tools-actions tools-hidden');
      var status = B.el('div', 'tools-status');
      var previewRow = B.el('div', 'tools-ico-preview tools-hidden');
      var downloadActions = B.el('div', 'tools-actions tools-hidden');
      var source = null; // 正方形源 canvas
      var sourceName = 'icon';

      drop.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) load(fileInput.files[0]);
      });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('over');
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) load(f);
      });
      body.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) { load(items[i].getAsFile()); break; }
        }
      });

      function load(file) {
        if (file.type.indexOf('image/') !== 0) { B.toast('请选择图片文件'); return; }
        sourceName = file.name.replace(/\.[^.]+$/, '') || 'icon';
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            try {
              source = makeSquare(img);
              buildOptions();
              generate();
            } catch (err) {
              console.error('[tools] 图片处理失败', err);
              B.toast('图片处理失败：' + err.message);
            }
          };
          img.onerror = function () { B.toast('图片解析失败'); };
          img.src = String(reader.result);
        };
        reader.onerror = function () { B.toast('读取文件失败'); };
        reader.readAsDataURL(file);
      }

      // 居中裁剪为 1:1 正方形
      function makeSquare(img) {
        var w = img.naturalWidth || img.width || 256;
        var h = img.naturalHeight || img.height || 256;
        var side = Math.max(1, Math.min(w, h));
        var c = document.createElement('canvas');
        c.width = side; c.height = side;
        var g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
        return c;
      }

      function buildOptions() {
        options.innerHTML = '';
        ALL_SIZES.forEach(function (s) {
          var label = B.el('label', 'tools-check');
          var cb = B.el('input');
          cb.type = 'checkbox';
          cb.value = s;
          cb.checked = DEFAULT_SIZES.indexOf(s) >= 0;
          cb.addEventListener('change', generate);
          label.appendChild(cb);
          label.appendChild(document.createTextNode(s + 'px'));
          options.appendChild(label);
        });
        options.classList.remove('tools-hidden');
      }

      function canvasToBlob(canvas) {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(new Error('toBlob 失败'));
          }, 'image/png');
        });
      }

      // ICO 容器：ICONDIR + ICONDIRENTRY×N + 各尺寸 PNG 数据
      async function buildIco(items) {
        var headerSize = 6 + 16 * items.length;
        var total = headerSize;
        items.forEach(function (it) { total += it.blob.size; });
        var buf = new ArrayBuffer(total);
        var view = new DataView(buf);
        var bytes = new Uint8Array(buf);
        view.setUint16(0, 0, true);   // reserved
        view.setUint16(2, 1, true);   // type: icon
        view.setUint16(4, items.length, true);
        var offset = headerSize;
        for (var i = 0; i < items.length; i++) {
          var d = 6 + 16 * i;
          var s = items[i].size;
          view.setUint8(d, s >= 256 ? 0 : s);      // width，256 记为 0
          view.setUint8(d + 1, s >= 256 ? 0 : s);  // height
          view.setUint8(d + 2, 0);                 // 调色板色数
          view.setUint8(d + 3, 0);                 // 保留
          view.setUint16(d + 4, 1, true);          // planes
          view.setUint16(d + 6, 32, true);         // bpp
          view.setUint32(d + 8, items[i].blob.size, true);
          view.setUint32(d + 12, offset, true);
          bytes.set(new Uint8Array(await items[i].blob.arrayBuffer()), offset);
          offset += items[i].blob.size;
        }
        return new Blob([buf], { type: 'image/x-icon' });
      }

      async function generate() {
        if (!source) return;
        var sizes = [];
        options.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) {
          sizes.push(+cb.value);
        });
        sizes.sort(function (a, b) { return a - b; });
        if (!sizes.length) {
          status.textContent = '请至少勾选一个尺寸';
          status.className = 'tools-status err';
          previewRow.classList.add('tools-hidden');
          downloadActions.classList.add('tools-hidden');
          return;
        }
        status.textContent = '生成中…';
        status.className = 'tools-status';

        previewRow.innerHTML = '';
        var items = [];
        try {
          for (var i = 0; i < sizes.length; i++) {
            var s = sizes[i];
            var c = document.createElement('canvas');
            c.width = s; c.height = s;
            var g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(source, 0, 0, s, s);
            var cell = B.el('div', 'tools-ico-cell');
            var cap = B.el('div', 'tools-ico-cap', s + 'px');
            cell.appendChild(c);
            cell.appendChild(cap);
            previewRow.appendChild(cell);
            items.push({ size: s, blob: await canvasToBlob(c) });
          }
        } catch (err) {
          console.error('[tools] ICO 生成失败', err);
          status.textContent = '生成失败：' + err.message;
          status.className = 'tools-status err';
          return;
        }

        var icoBlob = await buildIco(items);
        status.textContent = '✓ 已生成 ' + items.length + ' 个尺寸，共 ' +
          (icoBlob.size / 1024).toFixed(1) + ' KB';
        status.className = 'tools-status ok';

        downloadActions.innerHTML = '';
        var dl = B.el('button', 'tools-btn primary', '下载 ICO 图标');
        dl.type = 'button';
        dl.addEventListener('click', function () {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(icoBlob);
          a.download = sourceName + '.ico';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        });
        downloadActions.appendChild(dl);
        previewRow.classList.remove('tools-hidden');
        downloadActions.classList.remove('tools-hidden');
      }

      body.appendChild(fileInput);
      body.appendChild(drop);
      body.appendChild(options);
      body.appendChild(status);
      body.appendChild(previewRow);
      body.appendChild(downloadActions);
    }
  });
})();
