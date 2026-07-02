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
