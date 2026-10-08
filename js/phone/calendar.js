// 农历日历组件：公历月历 + 农历日 + 节日标记。
//
// lunarInfo 是 1900-2100 年的农历编码表，每年一个 16 位十六进制数：
//   低 4 位 = 闰月月份（0 表示无闰月）
//   5-16 位 = 12 或 13 个月的大小月标记（1 为大月 30 天）
//   另需配合 lunarInfo 之外的闰月天数判断，见 leapDays()
// 这张表错一位整个日历就全错，所以用已知春节日期做了回归验证（见 tools/check-phone-home.js）。
'use strict';

(function () {
  var Phone = window.Phone || {};

  var lunarInfo = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
    0x0d520
  ];

  var BASE_YEAR = 1900;
  var BASE_DATE = Date.UTC(1900, 0, 31); // 1900-01-31 为农历 1900 年正月初一

  var LDAY = ['初', '十', '廿', '卅'];
  var LMONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
  var WEEK = '日一二三四五六';
  var DAY_MS = 86400000;

  function leapMonth(y) { return lunarInfo[y - BASE_YEAR] & 0xf; }

  function leapDays(y) {
    if (!leapMonth(y)) return 0;
    return (lunarInfo[y - BASE_YEAR] & 0x10000) ? 30 : 29;
  }

  function monthDays(y, m) {
    return (lunarInfo[y - BASE_YEAR] & (0x10000 >> m)) ? 30 : 29;
  }

  function yearDays(y) {
    var sum = 348;
    for (var i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - BASE_YEAR] & i) ? 1 : 0;
    return sum + leapDays(y);
  }

  function dayName(d) {
    if (d === 10) return '初十';
    if (d === 20) return '二十';
    if (d === 30) return '三十';
    return LDAY[Math.floor(d / 10)] + '一二三四五六七八九十'.charAt((d - 1) % 10);
  }

  function solar2lunar(y, m, d) {
    var offset = Math.floor((Date.UTC(y, m - 1, d) - BASE_DATE) / DAY_MS);
    if (offset < 0) return null;

    var i;
    var temp = 0;
    for (i = BASE_YEAR; i < 2101 && offset > 0; i++) {
      temp = yearDays(i);
      offset -= temp;
    }
    if (offset < 0) { offset += temp; i--; }

    var lYear = i;
    var leap = leapMonth(lYear);
    var isLeap = false;

    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === leap + 1 && !isLeap) {
        --i;
        isLeap = true;
        temp = leapDays(lYear);
      } else {
        temp = monthDays(lYear, i);
      }
      if (isLeap && i === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) isLeap = false;
      else { isLeap = true; --i; }
    }
    if (offset < 0) { offset += temp; --i; }

    return {
      lYear: lYear,
      lMonth: i,
      lDay: offset + 1,
      isLeap: isLeap,
      dayName: dayName(offset + 1),
      monthName: (isLeap ? '闰' : '') + LMONTH[i - 1] + '月'
    };
  }

  /* ---------- 节日 ---------- */

  var SOLAR_FEST = {
    '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '4-1': '愚人节',
    '5-1': '劳动节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节',
    '9-10': '教师节', '10-1': '国庆节', '12-25': '圣诞节'
  };

  var LUNAR_FEST = {
    '1-1': '春节', '1-15': '元宵', '2-2': '龙抬头', '5-5': '端午',
    '7-7': '七夕', '7-15': '中元', '8-15': '中秋', '9-9': '重阳', '12-8': '腊八'
  };

  function solarFest(m, d) { return SOLAR_FEST[m + '-' + d] || ''; }

  function lunarFest(l) {
    if (l.isLeap) return '';
    // 除夕：腊月的最后一天，需按当年腊月天数判断
    if (l.lMonth === 12) {
      var last = monthDays(l.lYear, 12);
      if (l.lDay === last) return '除夕';
    }
    return LUNAR_FEST[l.lMonth + '-' + l.lDay] || '';
  }

  /* ---------- 渲染 ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function render() {
    var head = document.getElementById('ph-cal-head');
    var lunarEl = document.getElementById('ph-cal-lunar');
    var daysEl = document.getElementById('ph-cal-days');
    if (!head || !lunarEl || !daysEl) return;

    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    var today = now.getDate();

    head.textContent = m + '月 · ' + y;

    var l = solar2lunar(y, m, today);
    if (l) {
      var fest = lunarFest(l) || solarFest(m, today);
      lunarEl.textContent = l.monthName + l.dayName + (fest ? ' · ' + fest : '');
    } else {
      lunarEl.textContent = '';
    }

    daysEl.textContent = '';
    var firstWeekday = new Date(y, m - 1, 1).getDay();
    var total = new Date(y, m, 0).getDate();

    for (var b = 0; b < firstWeekday; b++) daysEl.appendChild(document.createElement('span'));

    for (var d = 1; d <= total; d++) {
      var cell = document.createElement('span');
      cell.textContent = String(d);
      if (d === today) cell.className = 'today';
      else if (solarFest(m, d)) cell.className = 'fest';
      daysEl.appendChild(cell);
    }
  }

  // 导出给测试脚本核对农历换算
  Phone.lunar = { solar2lunar: solar2lunar, leapMonth: leapMonth, monthDays: monthDays, week: WEEK, pad2: pad2 };

  render();
  // 跨天时刷新（每小时查一次，成本可忽略）
  setInterval(render, 3600000);

  window.Phone = Phone;
})();
