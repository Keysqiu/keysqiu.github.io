// 头部鼠标跟随光斑
// 抄自 WeGraduated 前端 Home.vue：mousemove + requestAnimationFrame 节流，
// 把鼠标相对 header 的坐标写入 --mx / --my，光斑在 #page-header::before 中跟随。
// full_page=首页，not-home-page=归档/标签/分类/关于
(function () {
  var header = document.getElementById('page-header')
  if (!header) return
  var isGlowPage = header.classList.contains('full_page') ||
    header.classList.contains('not-home-page')
  if (!isGlowPage) return

  var raf = 0
  header.addEventListener('mousemove', function (e) {
    if (raf) return
    raf = requestAnimationFrame(function () {
      var rect = header.getBoundingClientRect()
      header.style.setProperty('--mx', (e.clientX - rect.left) + 'px')
      header.style.setProperty('--my', (e.clientY - rect.top) + 'px')
      raf = 0
    })
  })

  header.addEventListener('mouseleave', function () {
    header.style.setProperty('--mx', '50%')
    header.style.setProperty('--my', '50%')
  })
})()
