// 手机横屏 · 手游键位
// 自动检测手机 / 触屏设备；横屏进入手游键位，支持拖动、捏合缩放、持久化布局。
const TOUCH = (function () {
  'use strict';

  const LAYOUT_KEY = 'sdfc_touch_layout_v2';
  const DEFAULT_LAYOUT = {
    move:     { x: 13.5, y: 69.5, s: 1 },
    fire:     { x: 84.5, y: 69.5, s: 1 },
    ads:      { x: 70,   y: 52.5, s: 1 },
    reload:   { x: 63,   y: 71,   s: 1 },
    jump:     { x: 90.5, y: 40,   s: 1 },
    walk:     { x: 6.5,  y: 41.5, s: 1 },
    interact: { x: 57,   y: 51,   s: 1 },
    weapons:  { x: 50,   y: 88.5, s: 1 },
  };
  const META = {
    move: { name: '移动摇杆' },
    fire: { name: '开火' },
    ads: { name: '开镜' },
    reload: { name: '换弹' },
    jump: { name: '跳跃' },
    walk: { name: '静步' },
    interact: { name: '开箱 / 补给' },
    weapons: { name: '武器快捷栏' },
  };
  const WEAPON_SHORT = ['标配', '鬼魅', '蜂刺', '狂徒', '奥丁'];
  const WEAPON_ICON = ['#ticon-pistol', '#ticon-pistol2', '#ticon-smg', '#ticon-rifle', '#ticon-lmg'];
  const MIN_SCALE = 0.55;
  const MAX_SCALE = 1.8;
  const SLOT_SIZE = 42; // 摇杆内部最大位移（未缩放 px）

  let els = {};
  let layout = {};
  let slots = [];
  let weaponSignature = '';
  let bagPick = null;
  let bagDiscardBtn = null;

  const state = {
    enabled: false,
    ready: false,
    gameActive: false,
    paused: false,
    editing: false,
    backpack: false,
    portrait: false,
    lookPointer: null,
    lookX: 0,
    lookY: 0,
    joyPointer: null,
    joyX: 0,
    joyY: 0,
    walk: false,
    interactHolding: false,
    selectedKey: 'fire',
  };

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const holdReleases = [];

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function round(v, digits) { const p = Math.pow(10, digits || 0); return Math.round(v * p) / p; }
  function hasPlayer() { return typeof Player !== 'undefined'; }
  function hasHud() { return typeof HUD !== 'undefined'; }

  // ---------- 设备检测 ----------
  function detectMobile() {
    try {
      const forced = new URLSearchParams(window.location.search).get('touch');
      if (forced === '1') return true;
      if (forced === '0') return false;
    } catch (e) {}

    const ua = navigator.userAgent || '';
    const phoneUa = /iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini|Android.+Mobile|Mobile.+Safari|HarmonyOS.+Mobile/i.test(ua);
    const mobileClientHint = !!(navigator.userAgentData && navigator.userAgentData.mobile);
    const touchPoints = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    const shortSide = Math.min(window.screen && window.screen.width || window.innerWidth, window.screen && window.screen.height || window.innerHeight);
    return phoneUa || mobileClientHint || (coarse && touchPoints && shortSide <= 900);
  }

  // ---------- 布局存储 ----------
  function defaults() {
    const o = {};
    for (const k in DEFAULT_LAYOUT) o[k] = { x: DEFAULT_LAYOUT[k].x, y: DEFAULT_LAYOUT[k].y, s: DEFAULT_LAYOUT[k].s };
    return o;
  }

  function normalizeLayout(raw) {
    const o = defaults();
    if (!raw || typeof raw !== 'object') return o;
    for (const k in DEFAULT_LAYOUT) {
      const src = raw[k];
      if (!src || typeof src !== 'object') continue;
      const x = Number(src.x), y = Number(src.y), s = Number(src.s);
      if (Number.isFinite(x)) o[k].x = clamp(round(x, 2), 2, 98);
      if (Number.isFinite(y)) o[k].y = clamp(round(y, 2), 2, 98);
      if (Number.isFinite(s)) o[k].s = clamp(round(s, 2), MIN_SCALE, MAX_SCALE);
    }
    return o;
  }

  function loadLayout() {
    try {
      return normalizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'));
    } catch (e) {
      return defaults();
    }
  }

  function saveLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (e) {}
  }

  function controlEl(key) {
    return els.controls ? els.controls.querySelector('.tkey[data-key="' + key + '"]') : null;
  }

  function applyLayout(key) {
    const node = controlEl(key);
    const item = layout[key];
    if (!node || !item) return;
    node.style.setProperty('--x', item.x + '%');
    node.style.setProperty('--y', item.y + '%');
    node.style.setProperty('--s', String(item.s));
  }

  function applyAllLayout() {
    for (const k in DEFAULT_LAYOUT) applyLayout(k);
  }

  function safeAreaSize() {
    if (els.safe) {
      const r = els.safe.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
    }
    return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  }

  // 确保键位（含缩放后的实际尺寸）始终留在安全区内，防止拖出可视区域
  function positionLimits(key) {
    const node = controlEl(key);
    if (!node || !layout[key]) return null;
    const w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) return null;
    const s = layout[key].s;
    const caption = key === 'move' ? 18 * s : 0;
    const margin = 5;
    const halfW = w * s / 2 + margin;
    const halfH = h * s / 2 + margin + caption;
    const area = safeAreaSize();
    const minX = Math.min(50, halfW / area.w * 100);
    const maxX = 100 - minX;
    const minY = Math.min(50, halfH / area.h * 100);
    const maxY = 100 - minY;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function clampKeyToViewport(key) {
    const lim = positionLimits(key);
    if (!lim) return false;
    const oldX = layout[key].x, oldY = layout[key].y;
    layout[key].x = clamp(round(layout[key].x, 2), round(lim.minX, 2), round(lim.maxX, 2));
    layout[key].y = clamp(round(layout[key].y, 2), round(lim.minY, 2), round(lim.maxY, 2));
    return layout[key].x !== oldX || layout[key].y !== oldY;
  }

  function ensureLayoutInViewport(shouldSave) {
    let changed = false;
    for (const k in DEFAULT_LAYOUT) {
      if (clampKeyToViewport(k)) {
        applyLayout(k);
        changed = true;
      }
    }
    if (changed && shouldSave) saveLayout();
    return changed;
  }

  function setScale(key, value, shouldSave) {
    if (!layout[key]) return;
    layout[key].s = clamp(round(value, 2), MIN_SCALE, MAX_SCALE);
    clampKeyToViewport(key);
    applyLayout(key);
    if (key === state.selectedKey) renderScaleReadout();
    if (shouldSave) saveLayout();
  }

  function renderScaleReadout() {
    const key = state.selectedKey;
    if (!layout[key]) return;
    if (els.tlSelectedName) els.tlSelectedName.textContent = (META[key] && META[key].name) || key;
    if (els.tlScaleVal) els.tlScaleVal.textContent = Math.round(layout[key].s * 100) + '%';
    for (const k in DEFAULT_LAYOUT) {
      const node = controlEl(k);
      if (node) node.classList.toggle('selected', k === key);
    }
  }

  function selectKey(key) {
    if (!META[key]) return;
    state.selectedKey = key;
    renderScaleReadout();
  }

  // ---------- UI 构建 ----------
  function cacheEls() {
    els.controls = $('mobile-controls');
    els.safe = $('touch-safe');
    els.aim = $('touch-aimzone');
    els.joystick = $('touch-joystick');
    els.joyKnob = $('joy-knob');
    els.fire = $('touch-fire');
    els.ads = $('touch-ads');
    els.reload = $('touch-reload');
    els.jump = $('touch-jump');
    els.walk = $('touch-walk');
    els.interact = $('touch-interact');
    els.interactLabel = $('touch-interact-label');
    els.interactSub = $('touch-interact-sub');
    els.interactProgress = $('touch-interact-progress');
    els.weaponbar = $('touch-weaponbar');
    els.twSlots = $('tw-slots');
    els.twCaption = $('tw-caption');
    els.bagBtn = $('touch-bag-btn');
    els.pauseBtn = $('touch-pause-btn');
    els.pause = $('touch-pause');
    els.pauseClose = $('touch-pause-close');
    els.tpResume = $('tp-resume');
    els.tpLayout = $('tp-layout');
    els.tpSens = $('tp-sens-slider');
    els.tpSensValue = $('tp-sens-value');
    els.layoutUi = $('touch-layout-ui');
    els.tlDone = $('tl-done');
    els.tlShrink = $('tl-shrink');
    els.tlGrow = $('tl-grow');
    els.tlReset = $('tl-reset');
    els.tlSelectedName = $('tl-selected-name');
    els.tlScaleVal = $('tl-scale-val');
    els.orientation = $('mobile-orientation');
    els.backpackPanel = $('backpack-panel');
    els.bpClose = $('bp-close-btn');
    bagDiscardBtn = $('bp-touch-discard');
  }

  function buildWeaponBar() {
    if (!els.twSlots || typeof WEAPONS === 'undefined') return;
    els.twSlots.innerHTML = '';
    slots = [];
    WEAPONS.DEFS.forEach(function (w, i) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tw-slot';
      btn.dataset.slot = String(i);
      btn.innerHTML =
        '<span class="tw-key">' + (i + 1) + '</span>' +
        '<svg class="tw-icon" viewBox="0 0 64 28" aria-hidden="true"><use href="' + WEAPON_ICON[i] + '"></use></svg>' +
        '<span class="tw-label">' + WEAPON_SHORT[i] + '</span>' +
        '<span class="tw-cost"></span>';
      btn.setAttribute('aria-label', (i + 1) + ' · ' + w.name);
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!canAct()) return;
        Audio.resume();
        Player.touchUseWeapon(i);
        updateWeaponBar(true);
      });
      els.twSlots.appendChild(btn);
      slots.push({
        btn: btn,
        cost: btn.querySelector('.tw-cost'),
        label: btn.querySelector('.tw-label'),
      });
    });
  }

  // ---------- 状态 / 可见性 ----------
  function canAct() {
    if (!state.enabled || !state.ready || !state.gameActive) return false;
    if (state.paused || state.editing || state.portrait || state.backpack) return false;
    if (!hasPlayer() || !Player.getActive() || !Player.alive) return false;
    if (hasHud() && HUD.isOverlayVisible()) return false;
    return true;
  }

  function updateBodyClasses() {
    document.body.classList.toggle('touch-ui', state.enabled);
    document.body.classList.toggle('touch-playing', state.enabled && state.gameActive);
    document.body.classList.toggle('touch-paused', state.enabled && state.paused);
    document.body.classList.toggle('touch-backpack', state.enabled && state.backpack);
    document.body.classList.toggle('layout-editing', state.enabled && state.editing);
    document.body.classList.toggle('portrait', state.enabled && state.portrait);
    if (els.controls) {
      const shown = state.gameActive && (!state.paused || state.editing) && !state.backpack;
      els.controls.setAttribute('aria-hidden', shown ? 'false' : 'true');
    }
  }

  function updateOrientation() {
    if (!state.enabled) return;
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait !== state.portrait) {
      state.portrait = portrait;
      if (portrait) releaseAll();
      updateBodyClasses();
    }
    if (!portrait && state.gameActive) {
      requestAnimationFrame(function () {
        if (state.gameActive && !state.portrait) ensureLayoutInViewport(true);
      });
    }
  }

  function isGamePaused() {
    return !!state.enabled && state.gameActive && (state.paused || state.editing || state.portrait);
  }

  // ---------- 输入释放 ----------
  function resetJoystick() {
    state.joyPointer = null;
    state.joyX = 0;
    state.joyY = 0;
    if (els.joyKnob) els.joyKnob.style.transform = 'translate(0px, 0px)';
    if (els.joystick) els.joystick.classList.remove('active');
    if (hasPlayer() && Player.setTouchMove) Player.setTouchMove(0, 0);
  }

  function releaseAll() {
    state.lookPointer = null;
    resetJoystick();
    for (let i = 0; i < holdReleases.length; i++) {
      try { holdReleases[i](); } catch (e) {}
    }
    state.interactHolding = false;
    if (els.interact) els.interact.classList.remove('holding');
    if (hasPlayer()) {
      if (Player.setTouchFire) Player.setTouchFire(false);
      if (Player.setTouchAds) Player.setTouchAds(false);
      if (Player.touchInteractEnd) Player.touchInteractEnd();
    }
    if (els.fire) els.fire.classList.remove('pressed', 'active');
    if (els.ads) els.ads.classList.remove('pressed', 'active');
  }

  // ---------- 准星拖动 ----------
  function bindAim() {
    if (!els.aim) return;
    els.aim.addEventListener('pointerdown', function (e) {
      if (!canAct()) return;
      if (state.lookPointer !== null) return;
      e.preventDefault();
      state.lookPointer = e.pointerId;
      state.lookX = e.clientX;
      state.lookY = e.clientY;
      try { els.aim.setPointerCapture(e.pointerId); } catch (err) {}
      Audio.resume();
    }, { passive: false });

    els.aim.addEventListener('pointermove', function (e) {
      if (e.pointerId !== state.lookPointer) return;
      if (!canAct()) return;
      e.preventDefault();
      const dx = e.clientX - state.lookX;
      const dy = e.clientY - state.lookY;
      state.lookX = e.clientX;
      state.lookY = e.clientY;
      if (dx === 0 && dy === 0) return;
      if (hasPlayer()) Player.touchLook(dx, dy);
    }, { passive: false });

    function endLook(e) {
      if (e.pointerId !== state.lookPointer) return;
      state.lookPointer = null;
    }
    els.aim.addEventListener('pointerup', endLook);
    els.aim.addEventListener('pointercancel', endLook);
    els.aim.addEventListener('lostpointercapture', endLook);
    els.aim.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---------- 摇杆 ----------
  function joystickMetrics() {
    const rect = els.joystick.getBoundingClientRect();
    return { rect: rect, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, max: Math.max(18, rect.width * 0.28) };
  }

  function moveStick(clientX, clientY) {
    if (!els.joystick) return;
    const m = joystickMetrics();
    let dx = clientX - m.cx;
    let dy = clientY - m.cy;
    const len = Math.hypot(dx, dy);
    if (len > m.max) {
      dx = dx / len * m.max;
      dy = dy / len * m.max;
    }
    const nx = dx / m.max;
    const ny = dy / m.max;
    state.joyX = nx;
    state.joyY = ny;
    if (els.joyKnob) els.joyKnob.style.transform = 'translate(' + (nx * SLOT_SIZE).toFixed(1) + 'px,' + (ny * SLOT_SIZE).toFixed(1) + 'px)';
    if (hasPlayer()) Player.setTouchMove(nx, -ny);
  }

  function bindJoystick() {
    if (!els.joystick) return;
    els.joystick.addEventListener('pointerdown', function (e) {
      if (!canAct()) return;
      if (state.joyPointer !== null) return;
      e.preventDefault();
      e.stopPropagation();
      state.joyPointer = e.pointerId;
      els.joystick.classList.add('active');
      try { els.joystick.setPointerCapture(e.pointerId); } catch (err) {}
      moveStick(e.clientX, e.clientY);
      Audio.resume();
    }, { passive: false });

    els.joystick.addEventListener('pointermove', function (e) {
      if (e.pointerId !== state.joyPointer) return;
      if (!canAct()) return;
      e.preventDefault();
      moveStick(e.clientX, e.clientY);
    }, { passive: false });

    function endStick(e) {
      if (e.pointerId !== state.joyPointer) return;
      resetJoystick();
    }
    els.joystick.addEventListener('pointerup', endStick);
    els.joystick.addEventListener('pointercancel', endStick);
    els.joystick.addEventListener('lostpointercapture', endStick);
  }

  // ---------- 通用按键交互 ----------
  function bindHold(btn, onDown, onUp) {
    if (!btn) return;
    let activeId = null;

    function release() {
      if (activeId === null) return;
      activeId = null;
      btn.classList.remove('pressed');
      if (onUp) onUp();
    }

    btn.addEventListener('pointerdown', function (e) {
      if (!canAct()) return;
      e.preventDefault();
      e.stopPropagation();
      if (activeId !== null) return;
      activeId = e.pointerId;
      btn.classList.add('pressed');
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      Audio.resume();
      onDown(e);
    }, { passive: false });

    function end(e) {
      if (e.pointerId !== activeId) return;
      release();
    }
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    holdReleases.push(release);
  }

  function bindTap(btn, onDown) {
    if (!btn) return;
    let activeId = null;
    btn.addEventListener('pointerdown', function (e) {
      if (!canAct()) return;
      e.preventDefault();
      e.stopPropagation();
      if (activeId !== null) return;
      activeId = e.pointerId;
      btn.classList.add('pressed');
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      Audio.resume();
      onDown(e);
    }, { passive: false });
    function end(e) {
      if (e.pointerId !== activeId) return;
      activeId = null;
      btn.classList.remove('pressed');
    }
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
  }

  function bindActionButtons() {
    // 开火：按下即射，全自动武器由 Player.update 持续连发
    bindHold(els.fire,
      function () { if (hasPlayer()) Player.setTouchFire(true); },
      function () { if (hasPlayer()) Player.setTouchFire(false); }
    );

    // 开镜：跟随设置中的长按 / 点击模式
    bindHold(els.ads,
      function () {
        if (!hasPlayer()) return;
        if (SETTINGS.getAdsMode() === 'toggle') {
          const on = Player.toggleTouchAds();
          els.ads.classList.toggle('active', !!on);
        } else {
          Player.setTouchAds(true);
          els.ads.classList.add('active');
        }
      },
      function () {
        if (!hasPlayer()) return;
        if (SETTINGS.getAdsMode() !== 'toggle') {
          Player.setTouchAds(false);
          els.ads.classList.remove('active');
        }
      }
    );

    bindTap(els.reload, function () { if (hasPlayer()) Player.touchReload(); });
    bindTap(els.jump, function () { if (hasPlayer()) Player.touchJump(); });
    bindTap(els.walk, function () {
      state.walk = !state.walk;
      els.walk.classList.toggle('active', state.walk);
      if (hasPlayer()) Player.setTouchWalking(state.walk);
    });

    // 交互：靠近箱子时按住开箱；商店范围内点击购买血包
    bindHold(els.interact,
      function () {
        const ctx = getInteractContext();
        if (ctx.type === 'box') {
          state.interactHolding = true;
          if (hasPlayer()) Player.touchInteractStart();
        } else if (ctx.type === 'shop') {
          state.interactHolding = true;
          if (typeof SHOP !== 'undefined') SHOP.tryBuyMedkit();
        }
      },
      function () {
        state.interactHolding = false;
        if (els.interact) els.interact.classList.remove('holding');
        if (hasPlayer()) Player.touchInteractEnd();
      }
    );
  }

  // ---------- 快捷按钮 / 暂停 ----------
  function updateSensUI() {
    const v = SETTINGS.getSensitivity();
    if (els.tpSens) els.tpSens.value = String(v);
    if (els.tpSensValue) els.tpSensValue.textContent = v.toFixed(2);
  }

  function setPauseOpen(open) {
    state.paused = !!open;
    if (els.pause) els.pause.classList.toggle('open', state.paused && !state.editing);
    if (state.paused) releaseAll();
    updateBodyClasses();
  }

  function openPause() {
    if (!state.gameActive || state.editing || state.backpack || state.portrait) return;
    if (state.paused) return;
    if (hasPlayer()) {
      if (Player.setTouchFire) Player.setTouchFire(false);
      if (Player.setTouchAds) Player.setTouchAds(false);
    }
    updateSensUI();
    setPauseOpen(true);
  }

  function resumeGame() {
    if (!state.gameActive || state.editing) return;
    setPauseOpen(false);
    if (els.pause) els.pause.classList.remove('open');
    releaseAll();
    requestAnimationFrame(function () {
      if (state.gameActive && !state.paused) ensureLayoutInViewport(true);
    });
  }

  function bindQuickAndPause() {
    if (els.bagBtn) {
      els.bagBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!canAct()) return;
        Audio.resume();
        if (hasPlayer()) Player.openBackpack();
      });
    }
    if (els.pauseBtn) {
      els.pauseBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openPause();
      });
    }
    if (els.pauseClose) els.pauseClose.addEventListener('click', resumeGame);
    if (els.tpResume) els.tpResume.addEventListener('click', resumeGame);
    if (els.tpLayout) els.tpLayout.addEventListener('click', enterLayoutMode);
    if (els.tpSens) {
      els.tpSens.addEventListener('input', function () {
        SETTINGS.setSensitivity(els.tpSens.value);
        updateSensUI();
      });
    }
  }

  // ---------- 键位编辑 ----------
  function showEditor(show) {
    state.editing = !!show;
    if (els.layoutUi) els.layoutUi.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
      if (els.pause) els.pause.classList.remove('open');
    }
    updateBodyClasses();
    if (show) renderScaleReadout();
  }

  function enterLayoutMode() {
    if (!state.gameActive || state.portrait) return;
    releaseAll();
    state.paused = true;
    state.editing = true;
    if (els.pause) els.pause.classList.remove('open');
    applyAllLayout();
    requestAnimationFrame(function () {
      if (state.editing) ensureLayoutInViewport(true);
    });
    selectKey(state.selectedKey || 'fire');
    showEditor(true);
  }

  function leaveLayoutMode(resume) {
    if (!state.editing) return;
    saveLayout();
    showEditor(false);
    if (els.layoutUi) els.layoutUi.setAttribute('aria-hidden', 'true');
    pointers.clear();
    drag = null;
    pinch = null;
    state.paused = false;
    if (els.pause) els.pause.classList.remove('open');
    updateBodyClasses();
    releaseAll();
    if (resume !== false && hasHud()) HUD.prompt('手游键位已保存');
  }

  function setSelectedScaleBy(delta) {
    if (!layout[state.selectedKey]) return;
    setScale(state.selectedKey, layout[state.selectedKey].s + delta, true);
  }

  function bindEditor() {
    if (els.tlDone) els.tlDone.addEventListener('click', function () { leaveLayoutMode(true); });
    if (els.tlShrink) els.tlShrink.addEventListener('click', function () { setSelectedScaleBy(-0.08); });
    if (els.tlGrow) els.tlGrow.addEventListener('click', function () { setSelectedScaleBy(0.08); });
    if (els.tlReset) {
      els.tlReset.addEventListener('click', function () {
        layout = defaults();
        applyAllLayout();
        selectKey('fire');
        saveLayout();
        if (hasHud()) HUD.prompt('键位布局已恢复默认');
      });
    }

    if (!els.controls) return;
    els.controls.addEventListener('pointerdown', onEditDown, true);
    window.addEventListener('pointermove', onEditMove, { passive: false });
    window.addEventListener('pointerup', onEditUp, true);
    window.addEventListener('pointercancel', onEditUp, true);
  }

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onEditDown(e) {
    if (!state.editing) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();

    const keyNode = e.target.closest ? e.target.closest('.tkey') : null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (keyNode) {
      const key = keyNode.dataset.key;
      if (key && layout[key]) {
        selectKey(key);
        if (pointers.size === 1) {
          drag = {
            key: key,
            pointerId: e.pointerId,
            startPointerX: e.clientX,
            startPointerY: e.clientY,
            startX: layout[key].x,
            startY: layout[key].y,
          };
        }
      }
    }

    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      drag = null;
      pinch = {
        key: state.selectedKey,
        startDist: Math.max(1, pointerDistance(pts[0], pts[1])),
        startScale: layout[state.selectedKey] ? layout[state.selectedKey].s : 1,
      };
    }
  }

  function onEditMove(e) {
    if (!state.editing) return;
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinch) {
      const pts = Array.from(pointers.values());
      const dist = Math.max(1, pointerDistance(pts[0], pts[1]));
      const ratio = dist / Math.max(1, pinch.startDist);
      setScale(pinch.key, pinch.startScale * ratio, false);
      return;
    }

    if (drag && drag.pointerId === e.pointerId && layout[drag.key]) {
      const area = safeAreaSize();
      const dx = (e.clientX - drag.startPointerX) / Math.max(1, area.w) * 100;
      const dy = (e.clientY - drag.startPointerY) / Math.max(1, area.h) * 100;
      const lim = positionLimits(drag.key);
      layout[drag.key].x = lim
        ? clamp(round(drag.startX + dx, 2), round(lim.minX, 2), round(lim.maxX, 2))
        : clamp(round(drag.startX + dx, 2), 2, 98);
      layout[drag.key].y = lim
        ? clamp(round(drag.startY + dy, 2), round(lim.minY, 2), round(lim.maxY, 2))
        : clamp(round(drag.startY + dy, 2), 2, 98);
      applyLayout(drag.key);
    }
  }

  function onEditUp(e) {
    if (!state.editing) return;
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      drag = null;
      saveLayout();
    }
  }

  // ---------- 武器栏 / 场景交互刷新 ----------
  function getInteractContext() {
    if (typeof BOXES === 'undefined' || typeof SHOP === 'undefined') return { type: 'none' };
    let nearest = null;
    try { nearest = BOXES.getNearestBox(); } catch (e) {}
    if (nearest) return { type: 'box' };
    if (SHOP.isInZone()) return { type: 'shop' };
    return { type: 'none' };
  }

  function updateInteractButton() {
    if (!els.interact) return;
    const ctx = getInteractContext();
    const available = ctx.type !== 'none';
    els.interact.classList.toggle('is-unavailable', !available);
    if (ctx.type === 'box') {
      const opening = typeof BOXES !== 'undefined' && BOXES.isOpening();
      if (els.interactLabel) els.interactLabel.textContent = opening ? '开启中' : '开箱';
      if (els.interactSub) els.interactSub.textContent = opening ? Math.round(BOXES.getProgress() * 100) + '%' : '长按';
      const p = opening ? BOXES.getProgress() : 0;
      if (els.interactProgress) els.interactProgress.style.setProperty('--p', String(clamp(p, 0, 1)));
      els.interact.classList.toggle('holding', opening || state.interactHolding);
    } else if (ctx.type === 'shop') {
      if (els.interactLabel) els.interactLabel.textContent = '血包';
      if (els.interactSub) els.interactSub.textContent = '$300';
      if (els.interactProgress) els.interactProgress.style.setProperty('--p', '0');
      els.interact.classList.toggle('holding', state.interactHolding);
    } else {
      if (els.interactProgress) els.interactProgress.style.setProperty('--p', '0');
      els.interact.classList.remove('holding');
    }
    if (hasPlayer()) els.ads.classList.toggle('active', !!Player.ads);
    if (hasPlayer() && Player.getTouchWalking !== undefined) {
      const walking = Player.getTouchWalking();
      if (walking !== state.walk) {
        state.walk = walking;
        els.walk.classList.toggle('active', walking);
      }
    }
  }

  function updateWeaponBar(force) {
    if (!slots.length || typeof WEAPONS === 'undefined') return;
    let inShop = false;
    try { inShop = !!SHOP.isInZone(); } catch (e) {}
    const current = WEAPONS.getCurrentIndex();
    const gold = typeof INVENTORY !== 'undefined' ? INVENTORY.getGold() : 0;
    const ownedSig = WEAPONS.DEFS.map(function (_, i) { return WEAPONS.isOwned(i) ? '1' : '0'; }).join('');
    const sig = current + '|' + gold + '|' + (inShop ? '1' : '0') + '|' + ownedSig;
    if (!force && sig === weaponSignature) return;
    weaponSignature = sig;
    if (els.weaponbar) els.weaponbar.classList.toggle('in-shop', inShop);
    if (els.twCaption) {
      els.twCaption.innerHTML = inShop
        ? '商店范围内 · 点击购买 <b>SHOP</b>'
        : '武器快捷栏 <b>WEAPONS</b>';
    }

    WEAPONS.DEFS.forEach(function (w, i) {
      const row = slots[i];
      if (!row) return;
      const owned = WEAPONS.isOwned(i);
      const active = i === current;
      row.btn.classList.toggle('active', active);
      row.btn.classList.toggle('unowned', !owned);
      row.btn.classList.toggle('shop', inShop && !owned);
      row.btn.classList.toggle('poor', inShop && !owned && gold < w.price);
      row.btn.disabled = !owned && !inShop;
      row.btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (row.cost) {
        if (!owned && inShop) row.cost.textContent = i === 0 ? '自带' : '$' + w.price;
        else row.cost.textContent = '';
      }
      row.btn.title = owned
        ? w.name + (active ? ' · 当前武器' : ' · 点击切换')
        : (inShop ? w.name + ' · $' + w.price + ' · 点击购买' : w.name + ' · 未拥有');
    });
  }

  function tick() {
    if (!state.enabled || !state.gameActive) return;
    updateInteractButton();
    updateWeaponBar(false);
  }

  // ---------- 背包触屏操作 ----------
  function clearBagPick() {
    bagPick = null;
    const selected = els.backpackPanel ? els.backpackPanel.querySelectorAll('.mobile-selected') : [];
    for (let i = 0; i < selected.length; i++) selected[i].classList.remove('mobile-selected');
    if (bagDiscardBtn) bagDiscardBtn.disabled = true;
  }

  function onBagCellClick(e) {
    if (!state.enabled || !state.backpack || !state.gameActive) return;
    if (e.target.closest && e.target.closest('button')) return;
    const cell = e.target.closest ? e.target.closest('.bp-cell, .sb-cell') : null;
    if (!cell || !els.backpackPanel.contains(cell)) return;
    e.preventDefault();
    const src = cell.classList.contains('bp-cell') ? 'bp' : 'sb';
    const idx = parseInt(cell.dataset.i, 10);
    if (!Number.isFinite(idx)) return;
    const empty = cell.classList.contains('empty');

    if (!bagPick) {
      if (empty) return;
      bagPick = { src: src, i: idx, el: cell };
      cell.classList.add('mobile-selected');
      if (bagDiscardBtn) bagDiscardBtn.disabled = src !== 'bp';
      return;
    }

    if (bagPick.src === src && bagPick.i === idx) {
      clearBagPick();
      return;
    }

    let moved = false;
    if (bagPick.src === 'bp' && src === 'bp') moved = INVENTORY.moveBackpackToBackpack(bagPick.i, idx);
    else if (bagPick.src === 'bp' && src === 'sb') moved = INVENTORY.moveBackpackToSafe(bagPick.i, idx);
    else if (bagPick.src === 'sb' && src === 'bp') moved = INVENTORY.moveSafeToBackpack(bagPick.i, idx);
    else if (bagPick.src === 'sb' && src === 'sb') {
      // 保险箱内部没有交换接口：改选目标格
      clearBagPick();
      if (!empty) {
        bagPick = { src: 'sb', i: idx, el: cell };
        cell.classList.add('mobile-selected');
      }
      return;
    }

    if (moved) {
      clearBagPick();
      HUD.setBackpackPanel(true);
    } else {
      clearBagPick();
    }
  }

  function bindBackpack() {
    if (els.bpClose) {
      els.bpClose.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearBagPick();
        if (hasPlayer()) Player.closeBackpack();
      });
    }
    if (bagDiscardBtn) {
      bagDiscardBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!bagPick || bagPick.src !== 'bp') return;
        if (typeof BOXES !== 'undefined') BOXES.discardBackpackItem(bagPick.i);
        clearBagPick();
        HUD.setBackpackPanel(true);
      });
    }
    if (els.backpackPanel) {
      els.backpackPanel.addEventListener('click', onBagCellClick);
      // 手机上使用「点选 -> 点目标格」，关闭 HTML5 原生拖拽避免长按冲突
      els.backpackPanel.addEventListener('dragstart', function (e) {
        if (state.enabled) e.preventDefault();
      });
    }
  }

  function onBackpackPanel(open) {
    if (!state.enabled) return;
    state.backpack = !!open;
    if (open) {
      clearBagPick();
      releaseAll();
    }
    updateBodyClasses();
  }

  // ---------- 生命周期 ----------
  function startGame() {
    if (!state.enabled) return;
    state.gameActive = true;
    state.paused = false;
    state.editing = false;
    state.backpack = false;
    state.walk = false;
    state.interactHolding = false;
    state.selectedKey = state.selectedKey || 'fire';
    weaponSignature = '';
    if (els.pause) els.pause.classList.remove('open');
    if (els.layoutUi) els.layoutUi.setAttribute('aria-hidden', 'true');
    if (els.walk) els.walk.classList.remove('active');
    releaseAll();
    updateOrientation();
    updateBodyClasses();
    updateSensUI();
    applyAllLayout();
    requestAnimationFrame(function () {
      if (state.gameActive) ensureLayoutInViewport(true);
    });
    try { requestLandscapeLock(); } catch (e) {}
  }

  function endGame() {
    if (!state.enabled) return;
    state.gameActive = false;
    state.paused = false;
    state.editing = false;
    state.backpack = false;
    releaseAll();
    clearBagPick();
    if (els.pause) els.pause.classList.remove('open');
    if (els.layoutUi) els.layoutUi.setAttribute('aria-hidden', 'true');
    updateBodyClasses();
  }

  function requestLandscapeLock() {
    if (!state.enabled) return;
    const so = window.screen && window.screen.orientation;
    if (!so || typeof so.lock !== 'function') return;
    const tryLock = function () {
      try {
        const p = so.lock('landscape');
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    };
    if (document.fullscreenElement) tryLock();
    else setTimeout(tryLock, 800);
  }

  // ---------- 初始化 ----------
  function bindGlobalEvents() {
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', function () {
      setTimeout(updateOrientation, 120);
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updateOrientation);
    document.addEventListener('fullscreenchange', function () {
      if (document.fullscreenElement) requestLandscapeLock();
      setTimeout(updateOrientation, 120);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        releaseAll();
      } else {
        updateOrientation();
      }
    });
    if (els.controls) {
      els.controls.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      els.controls.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    }
    window.addEventListener('keydown', function (e) {
      if (!state.enabled) return;
      if (e.key === 'Escape' && !state.editing) {
        if (state.paused) resumeGame();
        else if (state.gameActive && !state.backpack) openPause();
      }
    });
  }

  function init() {
    state.enabled = detectMobile();
    if (!state.enabled) {
      updateBodyClasses();
      return;
    }
    document.body.classList.add('touch-ui');
    cacheEls();
    if (!els.controls) return;
    layout = loadLayout();
    applyAllLayout();
    buildWeaponBar();
    bindAim();
    bindJoystick();
    bindActionButtons();
    bindQuickAndPause();
    bindEditor();
    bindBackpack();
    bindGlobalEvents();
    updateSensUI();
    state.ready = true;
    state.portrait = window.innerHeight > window.innerWidth;
    updateBodyClasses();
    updateOrientation();
  }

  return {
    init, startGame, endGame, tick,
    onBackpackPanel, isGamePaused, isEditing: function () { return state.editing; },
    isEnabled: function () { return state.enabled; },
    getState: function () { return state; },
  };
})();
