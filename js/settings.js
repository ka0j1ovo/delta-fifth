// 设置：开镜方式（点击/长按）+ 鼠标灵敏度（0~1，默认 0.5，精度 0.01），localStorage 持久化
const SETTINGS = (function () {
  const KEY = 'sdfc_settings_v1';
  let data = { adsMode: 'hold', sensitivity: 0.5 };

  function clampSens(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
  }
  function normalize(d) {
    const o = (d && typeof d === 'object') ? d : {};
    return {
      adsMode: o.adsMode === 'toggle' ? 'toggle' : 'hold',
      sensitivity: clampSens(o.sensitivity),
    };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  function getAdsMode() { return data.adsMode; }
  function getSensitivity() { return data.sensitivity; }
  function setAdsMode(m) { data.adsMode = m === 'toggle' ? 'toggle' : 'hold'; save(); }
  function setSensitivity(v) { data.sensitivity = clampSens(v); save(); }

  try { data = normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { data = normalize(null); }

  return { getAdsMode, getSensitivity, setAdsMode, setSensitivity };
})();
