$(document).ready(function () {
  console.log('=== 页面初始化开始 ===');
  
  // 初始化 PrismJS 代码高亮
  if (typeof Prism !== 'undefined') {
    // 配置 PrismJS 自动加载插件
    Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
    Prism.highlightAll();
  }

  // 初始化代码块功能
  initCodeBlocks();

  clickTreeDirectory();
  serachTree();
  // pjaxLoad();
  showArticleIndex();
  switchTreeOrIndex();
  scrollToTop();
  pageScroll();
  wrapImageWithFancyBox();
  
  // 注意：scrollToActiveMenuItem 已经在 showArticleIndex 中调用，无需重复调用
  
  console.log('=== 页面初始化结束 ===');
});

// 页面滚动
function pageScroll() {
  var start_hight = 0;
  $(window).on('scroll', function () {
    var end_hight = $(window).scrollTop();
    var distance = end_hight - start_hight;
    start_hight = end_hight;
    var $header = $('#header');
    if (distance > 0 && end_hight > 50) {
      $header.hide();
    } else if (distance < 0) {
      $header.show();
    } else {
      return false;
    }
  })
}

// 回到顶部
function scrollToTop() {
  $("#totop-toggle").on("click", function (e) {
    $("html").animate({ scrollTop: 0 }, 200);
  });
}

// 侧面目录
function switchTreeOrIndex() {
  $('#sidebar-toggle').on('click', function () {
    if ($('#sidebar').hasClass('on')) {
      scrollOff();
    } else {
      scrollOn();
    }
  });
  $('body').click(function (e) {
    if (window.matchMedia("(max-width: 1100px)").matches) {
      var target = $(e.target);
      if (!target.is('#sidebar *')) {
        if ($('#sidebar').hasClass('on')) {
          scrollOff();
        }
      }
    }
  });
  if (window.matchMedia("(min-width: 1100px)").matches) {
    scrollOn();
  } else {
    scrollOff();
  }
  ;
}

//生成文章目录
function showArticleIndex() {
  console.log('=== showArticleIndex 开始执行 ===');
  
  $(".article-toc").empty();
  $(".article-toc").hide();
  $(".article-toc.active-toc").removeClass("active-toc");
  $("#tree .active").next().addClass('active-toc');
  
  console.log('active-toc 元素数量:', $(".article-toc.active-toc").length);

  var labelList = $("#article-content").children();
  var content = "<ul>";
  var max_level = 4;
  for (var i = 0; i < labelList.length; i++) {
    var level = 5;
    if ($(labelList[i]).is("h1")) {
      level = 1;
    } else if ($(labelList[i]).is("h2")) {
      level = 2;
    } else if ($(labelList[i]).is("h3")) {
      level = 3;
    } else if ($(labelList[i]).is("h4")) {
      level = 4;
    }
    if (level < max_level) {
      max_level = level;
    }
  }
  for (var i = 0; i < labelList.length; i++) {
    var level = 0;
    if ($(labelList[i]).is("h1")) {
      level = 1 - max_level + 1;
    } else if ($(labelList[i]).is("h2")) {
      level = 2 - max_level + 1;
    } else if ($(labelList[i]).is("h3")) {
      level = 3 - max_level + 1;
    } else if ($(labelList[i]).is("h4")) {
      level = 4 - max_level + 1;
    }
    if (level != 0) {
      $(labelList[i]).before(
        '<span class="anchor" id="_label' + i + '"></span>');
      content += '<li class="level_' + level
        + '"><i class="fa fa-circle" aria-hidden="true"></i><a href="#_label'
        + i + '"> ' + $(labelList[i]).text() + '</a></li>';
    }
  }
  content += "</ul>"

  $(".article-toc.active-toc").append(content);
  
  console.log('内容已添加到 article-toc');

  if (null != $(".article-toc a") && 0 != $(".article-toc a").length) {

    // 点击目录索引链接，动画跳转过去，不是默认闪现过去
    $(".article-toc a").on("click", function (e) {
      e.preventDefault();
      // 获取当前点击的 a 标签，并前触发滚动动画往对应的位置
      var target = $(this.hash);
      $("body, html").animate(
        { 'scrollTop': target.offset().top },
        500
      );
    });

    // 监听浏览器滚动条，当浏览过的标签，给他上色。
    var $articleToc = $(".article-toc.active-toc");
    var scrollTimeout = null; // 用于防抖
    
    $(window).on("scroll", function (e) {
      var anchorList = $(".anchor");
      var currentReadAnchor = null;
      
      // 找到当前阅读到的位置
      anchorList.each(function () {
        var tocLink = $('.article-toc a[href="#' + $(this).attr("id") + '"]');
        var anchorTop = $(this).offset().top;
        var windowTop = $(window).scrollTop();
        if (anchorTop <= windowTop + 100) {
          tocLink.addClass("read");
          currentReadAnchor = tocLink;
        } else {
          tocLink.removeClass("read");
        }
      });
      
      // 让目录同步滚动，确保当前阅读的章节在可视范围内
      if (currentReadAnchor && currentReadAnchor.length > 0) {
        // ========== 同步滚动 .article-toc ==========
        var $tocContainer = $articleToc;
        var containerTop = $tocContainer.offset().top;
        var containerHeight = $tocContainer.height();
        var linkTop = currentReadAnchor.offset().top;
        var linkHeight = currentReadAnchor.outerHeight();
        
        // 计算链接相对于容器的位置
        var relativeTop = linkTop - containerTop + $tocContainer.scrollTop();
        
        // 如果链接超出容器顶部，向上滚动
        if (linkTop < containerTop + 60) {
          $tocContainer.stop(true, true).animate({
            scrollTop: relativeTop - 60
          }, 300);
        }
        // 如果链接超出容器底部，向下滚动
        else if (linkTop + linkHeight > containerTop + containerHeight - 60) {
          $tocContainer.stop(true, true).animate({
            scrollTop: relativeTop - containerHeight + linkHeight + 60
          }, 300);
        }
        
        // ========== 同步滚动 #tree 左侧菜单 ==========
        // 使用防抖优化性能
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(function() {
          syncTreeScroll(currentReadAnchor);
        }, 100);
      }
    });
  }
  
  // 关键修改：先显示容器，再调用滚动函数
  $(".article-toc.active-toc").show();
  $(".article-toc.active-toc").children().show();
  
  console.log('article-toc 已显示');
  
  // 延迟一小段时间确保 DOM 完全渲染后再滚动
  setTimeout(function() {
    console.log('准备在 showArticleIndex 中调用 scrollToActiveMenuItem');
    scrollToActiveMenuItem();
  }, 100);
  
  console.log('=== showArticleIndex 结束执行 ===');
}

function pjaxLoad() {
  $(document).pjax('#menu a', '#content',
    { fragment: '#content', timeout: 8000 });
  $(document).pjax('#tree a', '#content',
    { fragment: '#content', timeout: 8000 });
  $(document).pjax('#index a', '#content',
    { fragment: '#content', timeout: 8000 });
  $(document).on({
    "pjax:complete": function (e) {
      console.log('=== PJAX 加载完成 ===');
      
      // 使用 PrismJS 进行代码高亮
      if (typeof Prism !== 'undefined') {
        Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
        Prism.highlightAll();
      }

      // 重新初始化代码块功能
      if (typeof initCodeBlocks !== 'undefined') {
        initCodeBlocks();
      }

      // 添加 active
      console.log('开始设置 active 状态');
      $("#tree .active").removeClass("active");
      var title = $("#article-title").text().trim();
      console.log('文章标题:', title);
      
      if (title.length) {
        var searchResult = $("#tree li.file").find(
          "a:contains('" + title + "')");
        console.log('搜索结果数量:', searchResult.length);
        
        if (searchResult.length) {
          $(".fa-minus-square-o").removeClass("fa-minus-square-o").addClass(
            "fa-plus-square-o");
          $("#tree ul").css("display", "none");
          if (searchResult.length > 1) {
            var categorie = $("#article-categories span:last a").html();
            if (typeof categorie != "undefined") {
              categorie = categorie.trim();
              searchResult = $("#tree li.directory a:contains('" + categorie
                + "')").siblings().find("a:contains('" + title + "')");
            }
          }
          searchResult[0].parentNode.classList.add("active");
          console.log('已设置 active 类');
          
          showActiveTree($("#tree .active"), true);
          console.log('已展开父目录');
          
          // 新增：让侧边栏目录滚动到 active 位置，确保用户可以看到
          console.log('准备调用 scrollToActiveMenuItem');
          scrollToActiveMenuItem();
        }
        showArticleIndex();
      }
      wrapImageWithFancyBox();
      
      console.log('=== PJAX 处理完成 ===');
    }
  });
}

// 搜索框输入事件
function serachTree() {
  // 解决搜索大小写问题
  jQuery.expr[':'].contains = function (a, i, m) {
    return jQuery(a).text().toUpperCase().indexOf(m[3].toUpperCase()) >= 0;
  };

  $("#search-input").on("input", function (e) {
    e.preventDefault();

    // 获取 inpiut 输入框的内容
    var inputContent = e.currentTarget.value;

    // 没值就收起父目录，但是得把 active 的父目录都展开
    if (inputContent.length === 0) {
      $(".fa-minus-square-o").removeClass("fa-minus-square-o").addClass(
        "fa-plus-square-o");
      $("#tree ul").css("display", "none");
      if ($("#tree .active").length) {
        showActiveTree($("#tree .active"), true);
      } else {
        $("#tree").children().css("display", "block");
      }
    }
    // 有值就搜索，并且展开父目录
    else {
      $(".fa-plus-square-o").removeClass("fa-plus-square-o").addClass(
        "fa-minus-square-o");
      $("#tree ul").css("display", "none");
      var searchResult = $("#tree li").find(
        "a:contains('" + inputContent + "')");
      if (searchResult.length) {
        showActiveTree(searchResult.parent(), false)
      }
    }
  });

  $("#search-input").on("keyup", function (e) {
    e.preventDefault();
    if (event.keyCode == 13) {
      var inputContent = e.currentTarget.value;

      if (inputContent.length === 0) {
      } else {
        window.open(searchEngine + inputContent,
          "_blank");
      }
    }
  });
}

// 点击目录事件
function clickTreeDirectory() {
  // 判断有 active 的话，就递归循环把它的父目录打开
  var treeActive = $("#tree .active");
  if (treeActive.length) {
    showActiveTree(treeActive, true);
  }

  // 点击目录，就触发折叠动画效果
  $(document).on("click", "#tree a[class='directory']", function (e) {
    // 用来清空所有绑定的其他事件
    e.preventDefault();

    var icon = $(this).children(".fa");
    var iconIsOpen = icon.hasClass("fa-minus-square-o");
    var subTree = $(this).siblings("ul");

    icon.removeClass("fa-minus-square-o").removeClass("fa-plus-square-o");

    if (iconIsOpen) {
      if (typeof subTree != "undefined") {
        subTree.slideUp({ duration: 100 });
      }
      icon.addClass("fa-plus-square-o");
    } else {
      if (typeof subTree != "undefined") {
        subTree.slideDown({ duration: 100 });
      }
      icon.addClass("fa-minus-square-o");
    }
  });
}

// 循环递归展开父节点
function showActiveTree(jqNode, isSiblings) {
  if (jqNode.attr("id") === "tree") {
    return;
  }
  if (jqNode.is("ul")) {
    jqNode.css("display", "block");

    // 这个 isSiblings 是给搜索用的
    // true 就显示开同级兄弟节点
    // false 就是给搜索用的，值需要展示它自己就好了，不展示兄弟节点
    if (isSiblings) {
      jqNode.siblings().css("display", "block");
      jqNode.siblings("a").css("display", "inline");
      jqNode.siblings("a").find(".fa-plus-square-o").removeClass(
        "fa-plus-square-o").addClass("fa-minus-square-o");
    }
  }
  jqNode.each(function () {
    showActiveTree($(this).parent(), isSiblings);
  });
}

// 同步 #tree 左侧菜单的滚动位置
function syncTreeScroll($currentReadAnchor) {
  var $treeContainer = $("#tree");
  
  if ($treeContainer.length === 0) {
    return;
  }
  
  // 检查容器是否有滚动能力
  var treeElement = $treeContainer[0];
  var treeScrollHeight = treeElement.scrollHeight;
  var treeClientHeight = treeElement.clientHeight;
  
  if (treeScrollHeight <= treeClientHeight) {
    // 内容未超出高度，无需滚动
    return;
  }
  
  // 从当前阅读的 anchor 找到对应的文章标题
  var articleTitle = $("#article-title").text().trim();
  
  if (!articleTitle) {
    return;
  }
  
  // 在 #tree 中查找匹配的菜单项
  var $treeMenuItem = $("#tree li.file").find("a:contains('" + articleTitle + "')");
  
  if ($treeMenuItem.length === 0) {
    console.log('未在 #tree 中找到匹配的菜单项');
    return;
  }
  
  // 获取菜单项相对于容器的位置
  var menuItemOffsetTop = $treeMenuItem.offset().top;
  var containerOffsetTop = $treeContainer.offset().top;
  var currentScrollTop = $treeContainer.scrollTop();
  
  // 计算菜单项相对于容器顶部的实际位置
  var itemRelativeTop = menuItemOffsetTop - containerOffsetTop + currentScrollTop;
  var itemHeight = $treeMenuItem.outerHeight();
  
  // 计算目标滚动位置，让菜单项居中显示
  var targetScrollTop = itemRelativeTop - treeClientHeight / 2 + itemHeight / 2;
  
  // 确保不超出边界
  targetScrollTop = Math.max(0, Math.min(targetScrollTop, treeScrollHeight - treeClientHeight));
  
  // 执行平滑滚动
  $treeContainer.stop(true, true).animate({
    scrollTop: targetScrollTop
  }, 300);
}

// 滚动侧边栏目录，确保 active 菜单项在可视范围内
function scrollToActiveMenuItem() {
  console.log('=== scrollToActiveMenuItem 开始执行 ===');
  
  var $activeItem = $("#tree .active");
  console.log('active 元素数量:', $activeItem.length);
  
  if ($activeItem.length === 0) {
    console.log('未找到 active 元素，直接返回');
    return;
  }
  
  // 获取 active 元素的文本内容（用于调试）
  console.log('active 元素文本:', $activeItem.text().trim());
  
  // ========== 处理 #tree 容器的滚动 ==========
  var $treeContainer = $("#tree");
  console.log('#tree 容器存在:', $treeContainer.length > 0);
  
  if ($treeContainer.length > 0) {
    var treeElement = $treeContainer[0];
    
    // 检查容器是否有滚动能力
    var treeScrollHeight = treeElement.scrollHeight;
    var treeClientHeight = treeElement.clientHeight;
    console.log('#tree 容器信息:');
    console.log('  - scrollHeight:', treeScrollHeight);
    console.log('  - clientHeight:', treeClientHeight);
    console.log('  - 可滚动:', treeScrollHeight > treeClientHeight);
    
    if (treeScrollHeight > treeClientHeight) {
      // 获取 active 项相对于 #tree 容器的位置
      var activeItemOffsetTop = $activeItem.offset().top;
      var containerOffsetTop = $treeContainer.offset().top;
      var currentScrollTop = $treeContainer.scrollTop();
      
      // 计算 active 项相对于容器顶部的实际位置
      var itemRelativeTop = activeItemOffsetTop - containerOffsetTop + currentScrollTop;
      var itemHeight = $activeItem.outerHeight();
      
      console.log('#tree active 项位置:');
      console.log('  - itemRelativeTop:', itemRelativeTop);
      console.log('  - itemHeight:', itemHeight);
      console.log('  - 当前 scrollTop:', currentScrollTop);
      
      // 计算目标滚动位置，让 active 项居中显示
      var targetScrollTop = itemRelativeTop - treeClientHeight / 2 + itemHeight / 2;
      
      // 确保不超出边界
      targetScrollTop = Math.max(0, Math.min(targetScrollTop, treeScrollHeight - treeClientHeight));
      
      console.log('  - 目标 scrollTop:', targetScrollTop);
      
      // 执行滚动
      $treeContainer.animate({
        scrollTop: targetScrollTop
      }, 300);
      
      console.log('#tree 滚动已触发');
    } else {
      console.log('#tree 容器内容未超出高度，无需滚动');
    }
  }
  
  // ========== 处理 .article-toc 容器的滚动（原有逻辑）==========
  var $tocContainer = $(".article-toc.active-toc");
  console.log('文章目录容器存在:', $tocContainer.length > 0);
  
  if ($tocContainer.length === 0) {
    console.log('未找到文章目录容器 .article-toc.active-toc，尝试使用第一个 .article-toc');
    $tocContainer = $(".article-toc").first();
    console.log('备用容器存在:', $tocContainer.length > 0);
  }
  
  if ($tocContainer.length > 0) {
    // 强制设置容器的滚动属性（使用原生 DOM）
    var tocElement = $tocContainer[0];
    tocElement.style.overflowY = 'auto';
    tocElement.style.maxHeight = 'calc(100vh - 250px)';
    tocElement.style.display = 'block';
    tocElement.style.height = 'auto';
    
    console.log('已强制设置 .article-toc 容器样式');
    
    // 获取容器的尺寸和滚动信息
    var containerHeight = $tocContainer.height();
    var containerScrollTop = $tocContainer.scrollTop();
    
    console.log('.article-toc 容器位置信息:');
    console.log('  - height:', containerHeight);
    console.log('  - scrollTop (设置前):', containerScrollTop);
    
    // 获取 active 项相对于容器的位置
    var activeItemPositionTop = $activeItem.position().top;
    var activeItemHeight = $activeItem.outerHeight();
    
    console.log('.article-toc active 元素位置信息:');
    console.log('  - position.top (相对于容器):', activeItemPositionTop);
    console.log('  - outerHeight:', activeItemHeight);
    
    // 计算 active 项的实际顶部位置（考虑当前滚动距离）
    var itemTop = activeItemPositionTop + containerScrollTop;
    var itemBottom = itemTop + activeItemHeight;
    
    console.log('.article-toc active 元素实际范围:');
    console.log('  - itemTop:', itemTop);
    console.log('  - itemBottom:', itemBottom);
    
    // 判断是否需要滚动
    var visibleTop = containerScrollTop;
    var visibleBottom = containerScrollTop + containerHeight;
    
    console.log('.article-toc 可视区域范围:');
    console.log('  - visibleTop:', visibleTop);
    console.log('  - visibleBottom:', visibleBottom);
    
    // 如果 active 项超出可视区域，则滚动到可视区域
    if (itemTop < visibleTop + 50 || itemBottom > visibleBottom - 50) {
      console.log('.article-toc active 元素超出可视区域，需要滚动');
      // 计算目标滚动位置，让 active 项居中显示
      var scrollToPosition = itemTop - containerHeight / 2 + activeItemHeight / 2;
      console.log('目标滚动位置:', scrollToPosition);
      
      // 使用 animate 平滑滚动
      $tocContainer.animate({
        scrollTop: scrollToPosition
      }, 300);
      
    } else {
      console.log('.article-toc active 元素已在可视区域内，无需滚动');
    }
  }
  
  console.log('=== scrollToActiveMenuItem 执行结束 ===');
}

function scrollOn() {
  var $sidebar = $('#sidebar'),
    $content = $('#content'),
    $header = $('#header'),
    $footer = $('#footer'),
    $togglei = $('#sidebar-toggle i');

  $togglei.addClass('fa-close');
  $togglei.removeClass('fa-arrow-right');
  $sidebar.addClass('on');
  $sidebar.removeClass('off');

  if (window.matchMedia("(min-width: 1100px)").matches) {
    $content.addClass('content-on');
    $content.removeClass('content-off');
    $header.addClass('header-on');
    $header.removeClass('off');
    $footer.addClass('header-on');
    $footer.removeClass('off');
  }
}

function scrollOff() {
  var $sidebar = $('#sidebar'),
    $content = $('#content'),
    $header = $('#header'),
    $footer = $('#footer'),
    $togglei = $('#sidebar-toggle i');

  $togglei.addClass('fa-arrow-right');
  $togglei.removeClass('fa-close');
  $sidebar.addClass('off');
  $sidebar.removeClass('on');

  $content.addClass('content-off');
  $content.removeClass('content-on');
  $header.addClass('off');
  $header.removeClass('header-on');
  $footer.addClass('off');
  $footer.removeClass('header-on');
}

/**
 * Wrap images with fancybox support.
 */
function wrapImageWithFancyBox() {
  $('img').not('#header img').each(function () {
    var $image = $(this);
    var imageCaption = $image.attr('alt');
    var $imageWrapLink = $image.parent('a');

    if ($imageWrapLink.length < 1) {
      var src = this.getAttribute('src');
      var idx = src.lastIndexOf('?');
      if (idx != -1) {
        src = src.substring(0, idx);
      }
      $imageWrapLink = $image.wrap('<a href="' + src + '"></a>').parent('a');
    }

    $imageWrapLink.attr('data-fancybox', 'images');
    if (imageCaption) {
      $imageWrapLink.attr('data-caption', imageCaption);
    }

  });

  $('[data-fancybox="images"]').fancybox({
    buttons: [
      'slideShow',
      'thumbs',
      'zoom',
      'fullScreen',
      'close'
    ],
    thumbs: {
      autoStart: false
    }
  });
}