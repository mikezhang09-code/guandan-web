/* 主题(毡影/墨玉)读取 · 切换 · 持久化。与 Sound 的 game_sound_muted 是同一惯例的 localStorage key。
   放在 <head> 最前且不加 async/defer, 在首次绘制前同步生效, 避免"先出现错误主题再跳变"的闪烁。 */
(function (root) {
  var KEY = 'game_theme_dir';
  function get() { var v = null; try { v = localStorage.getItem(KEY); } catch (e) {} return (v === 'A' || v === 'B') ? v : 'A'; }
  function apply(dir) { document.documentElement.setAttribute('data-theme', dir); }
  function set(dir) { if (dir !== 'A' && dir !== 'B') return; try { localStorage.setItem(KEY, dir); } catch (e) {} apply(dir); }
  function toggle() { set(get() === 'A' ? 'B' : 'A'); return get(); }
  apply(get());
  root.Theme = { get: get, set: set, toggle: toggle };
})(typeof window !== 'undefined' ? window : this);

/* 横竖屏: 默认 auto(跟随实际设备/视口朝向, 手动转动手机即可切换); 表头 ⟳ 按钮可强制固定为
   横屏或竖屏(桌面浏览器没有"转动"这回事, 需要一个入口才能预览/使用横屏布局), 再按一次回到 auto。 */
(function (root) {
  var KEY = 'game_orient_pref';
  function pref() { var v = null; try { v = localStorage.getItem(KEY); } catch (e) {} return (v === 'portrait' || v === 'landscape') ? v : 'auto'; }
  function resolved() {
    var p = pref(); if (p !== 'auto') return p;
    return (root.matchMedia && root.matchMedia('(orientation: landscape)').matches) ? 'landscape' : 'portrait';
  }
  function apply() { document.documentElement.setAttribute('data-orient', resolved()); }
  function cycle() {
    var p = pref(), next = p === 'auto' ? 'landscape' : (p === 'landscape' ? 'portrait' : 'auto');
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(); return pref();
  }
  apply();
  root.addEventListener('resize', function () { if (pref() === 'auto') apply(); });
  root.Orient = { pref: pref, resolved: resolved, cycle: cycle };
})(typeof window !== 'undefined' ? window : this);
