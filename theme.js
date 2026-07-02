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

/* 横竖屏: 默认 auto(跟随实际设备/视口朝向); 表头 ⟳ 按钮可强制固定为横屏或竖屏, 再按一次回到 auto。
   如果强制的朝向和设备实际朝向不一致(比如手机本身没转/系统开了旋转锁定, 但想强制看横屏), 光换
   CSS 尺寸没用——视口本身还是窄的。用整体 CSS 旋转把内容摆正撑满屏幕, 而不是干等设备物理转动:
   iOS Safari 不支持 screen.orientation.lock（非全屏网页里根本用不了), 这是唯一能跨浏览器生效、
   不需要全屏权限的办法。data-rotate-hack="cw"/"ccw"/"none" 由 theme.css 里对应的 #board 规则消费。 */
(function (root) {
  var KEY = 'game_orient_pref';
  function pref() { var v = null; try { v = localStorage.getItem(KEY); } catch (e) {} return (v === 'portrait' || v === 'landscape') ? v : 'auto'; }
  function physicalLandscape() { return !!(root.matchMedia && root.matchMedia('(orientation: landscape)').matches); }
  function resolved() {
    var p = pref(); if (p !== 'auto') return p;
    return physicalLandscape() ? 'landscape' : 'portrait';
  }
  function apply() {
    var want = resolved();
    document.documentElement.setAttribute('data-orient', want);
    var actual = physicalLandscape() ? 'landscape' : 'portrait';
    document.documentElement.setAttribute('data-rotate-hack', want === actual ? 'none' : (want === 'landscape' ? 'cw' : 'ccw'));
  }
  function cycle() {
    var p = pref(), next = p === 'auto' ? 'landscape' : (p === 'landscape' ? 'portrait' : 'auto');
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(); return pref();
  }
  apply();
  root.addEventListener('resize', apply);
  root.Orient = { pref: pref, resolved: resolved, cycle: cycle };
})(typeof window !== 'undefined' ? window : this);
