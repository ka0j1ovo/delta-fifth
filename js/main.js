// 主程序：初始化场景、单局循环（MENU/PLAYING/RESULT）、600s 撤离倒计时
const MAIN = (function () {
  let scene, camera, renderer, clock;
  let state = 'menu';
  let time = 0, timeLeft = 600, menuT = 0;
  let pendingEnd = null;
  let bannerShown = {};

  const RUN_TIME = 600, START_BOTS = 4;

  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 400);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'game-canvas';
    document.querySelector('#game-canvas').replaceWith(renderer.domElement);

    Effects.init(scene);
    MAP.build(scene);
    Player.init(scene, camera);
    WEAPONS.init(camera);
    WEAPONS.setPlayer(Player);
    WEAPONS.buildViewModel(camera);
    ENEMIES.init(scene, camera, Player);
    ENEMIES.setSpawnPoints([
      { x: 0, z: 24 }, { x: -10, z: 24 }, { x: 10, z: 24 },
      { x: -20, z: 20 }, { x: 20, z: 20 },
      { x: -16, z: 16 }, { x: 16, z: 16 },
      { x: -8, z: 16 }, { x: 8, z: 16 },
      { x: -20, z: 8 }, { x: 20, z: 8 },
      { x: -12, z: 12 }, { x: 12, z: 12 },
      { x: -24, z: 4 }, { x: 24, z: 4 },
      { x: -24, z: 12 }, { x: 0, z: 8 },
      { x: -8, z: -4 }, { x: 8, z: -4 }, { x: 0, z: -8 },
    ]);
    BOXES.init(scene, Player);
    EXTRACT.init(scene, Player);
    SHOP.init(scene, Player);
    HUD.init();

    document.getElementById('start-run-btn').addEventListener('click', () => { Audio.resume(); Audio.preload(); HUD.showLoadout(); });
    document.getElementById('result-menu-btn').addEventListener('click', () => { showMenu(); });
    document.getElementById('result-retry-btn').addEventListener('click', () => { Audio.resume(); HUD.showLoadout(); });

    clock = new THREE.Clock();
    window.addEventListener('resize', onResize);
    showMenu();
    animate();
  }

  function showMenu() {
    state = 'menu';
    pendingEnd = null;
    Player.setActive(false);
    ENEMIES.clear();
    BOXES.clear();
    HUD.hideOverlay();
    HUD.showMenu();
    HUD.showHint(false);
    HUD.updateShopPanel(false);
    HUD.setBackpackPanel(false);
  }

  function enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) return;
    try {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) {}
  }

  function startRun(loadout) {
    loadout = loadout || { maxHp: 50, cost: 0, weapons: [], medkit: false, backpackSize: 6 };
    if (!INVENTORY.spendPoints(loadout.cost)) { HUD.prompt('点数不足'); return false; }
    state = 'playing';
    pendingEnd = null;
    enterFullscreen();
    timeLeft = RUN_TIME;
    bannerShown = {};
    Audio.resetStreak();
    INVENTORY.newRun(loadout.backpackSize);
    WEAPONS.resetForRun();
    const weapons = loadout.weapons || [];
    for (const wi of weapons) WEAPONS.own(wi);
    if (weapons.length) WEAPONS.switchTo(Math.max.apply(null, weapons));
    if (loadout.medkit) INVENTORY.addToBackpack(ITEMS.medkit());
    ENEMIES.resetAndSpawn(START_BOTS);
    BOXES.spawnBoxes();
    EXTRACT.reset();
    Player.setMaxHp(loadout.maxHp);
    HUD.setMaxHealth(loadout.maxHp);
    Player.respawn();
    Player.setActive(true);
    HUD.hideOverlay();
    HUD.showHint(true);
    HUD.setKills(0);
    HUD.setGold(0);
    HUD.setBackpackCount(0);
    HUD.setTime(RUN_TIME);
    HUD.setAction('', -1);
    return true;
  }

  function requestEnd(won, reason) {
    if (pendingEnd) return;
    pendingEnd = { won, reason, t: won ? 0.4 : 0.9 };
    if (won) Audio.extract();
    else if (reason === 'timeout') Audio.lose();
  }

  function finishRun(won, reason) {
    state = 'result';
    pendingEnd = null;
    Player.setActive(false);
    if (document.pointerLockElement) document.exitPointerLock();
    HUD.setAction('', -1);
    HUD.updateShopPanel(false);
    HUD.setBackpackPanel(false);
    const kills = ENEMIES.getKills();
    INVENTORY.finishRun(won);
    let value = 0, overflow = 0, safeValue = 0;
    if (won) {
      const d = INVENTORY.depositBackpack(); value = d.value; overflow = d.overflowValue;
      const s = INVENTORY.depositSafeBox(); value += s.value; overflow += s.overflowValue;
    } else {
      INVENTORY.clearBackpack();
      const s = INVENTORY.depositSafeBox(); safeValue = s.value; overflow = s.overflowValue;
    }
    HUD.showResult({ won, reason, kills, value, overflow, safeValue });
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    if (state === 'menu') {
      menuT += dt;
      camera.position.set(Math.sin(menuT * 0.15) * 44, 32, Math.cos(menuT * 0.15) * 44);
      camera.lookAt(0, 0, 0);
      const vm = WEAPONS.viewmodel();
      if (vm) vm.visible = false;
      Effects.update(dt);
      renderer.render(scene, camera);
      return;
    }

    if (state === 'playing') {
      if (Player.backpackOpen) { // 背包打开：暂停整局
        renderer.render(scene, camera);
        return;
      }
      if (!pendingEnd) {
        timeLeft -= dt;
        HUD.setTime(Math.ceil(timeLeft));
        const elapsed = RUN_TIME - timeLeft;

        // 撤离阶段横幅：60s 付费 / 90s 免费 / 7 分钟提示 / 8 分钟付费
        if (elapsed >= 60 && !bannerShown.paid1) { bannerShown.paid1 = true; HUD.showPhaseBanner('🚁 开始付费撤离（需 500 哈基币）', 30); }
        if (elapsed >= 90 && !bannerShown.free) { bannerShown.free = true; HUD.showPhaseBanner('✅ 无条件撤离', 0); }
        if (elapsed >= 420 && !bannerShown.warn) { bannerShown.warn = true; HUD.showPhaseBanner('⚠️ 无条件撤离即将结束', 60); }
        if (elapsed >= 480 && !bannerShown.paid2) { bannerShown.paid2 = true; HUD.showPhaseBanner('🚁 开始付费撤离（需 500 哈基币）', 120); }
        HUD.tickPhaseBanner(dt);

        Player.update(dt);
        ENEMIES.update(dt);
        WEAPONS.update(dt);
        SHOP.update();
        BOXES.update(dt);
        Effects.update(dt);

        const ex = EXTRACT.update(dt, elapsed);
        if (ex === 'done') requestEnd(true, 'extract');
        else {
          if (ex === 'insufficient') HUD.prompt('撤离需 500 哈基币 · 背包价值不足');
          if (!Player.alive) requestEnd(false, 'death');
          else if (timeLeft <= 0) requestEnd(false, 'timeout');
        }

        const vm = WEAPONS.viewmodel();
        if (vm) {
          vm.visible = true;
          const kick = WEAPONS.getViewKick();
          WEAPONS.decayViewKick(dt * 4);
          const bob = (Player.isMoving && Player.grounded) ? Math.sin(time * 11) * 0.004 : 0;
          if (Player.ads) vm.position.set(0, -0.14 + bob, -0.35 + kick * 0.05);
          else vm.position.set(0.22, -0.18 + bob, -0.45 + kick * 0.06);
          vm.rotation.x = kick * 0.06;
        }

        HUD.setBloom((WEAPONS.getBloom() + (Player.isMoving ? 0.6 : 0)) * (Player.ads ? 0.3 : 1));
        HUD.setReload(WEAPONS.reloadProgress(), WEAPONS.reloadTimeLeft());
        HUD.setGold(INVENTORY.getGold());
        HUD.setBackpackCount(INVENTORY.backpackCount());
        HUD.updateShopPanel(SHOP.isInZone());

        let interact = '';
        if (SHOP.isInZone()) interact = '靠近武器商店 · 按 2/3/4/5 购买';
        else if (BOXES.getNearestBox()) interact = '按住 F 开箱';
        HUD.setInteract(interact);

        if (EXTRACT.isInZone()) {
          const ph = EXTRACT.phase(elapsed);
          const label = ph === 'locked' ? '撤离未开放 · 开局 60s 后开放'
            : ph === 'paid' ? '付费撤离中… 需 500 哈基币'
            : '撤离中… 请勿离开区域';
          HUD.setAction(label, EXTRACT.getProgress());
        }
        else if (BOXES.isOpening()) HUD.setAction('开箱中…', BOXES.getProgress());
        else HUD.setAction('', -1);
      } else {
        pendingEnd.t -= dt;
        Effects.update(dt);
        if (pendingEnd.t <= 0) finishRun(pendingEnd.won, pendingEnd.reason);
      }
    } else if (state === 'result') {
      const vm = WEAPONS.viewmodel();
      if (vm) vm.visible = false;
      Effects.update(dt);
    }

    renderer.render(scene, camera);
  }

  return { init, startRun, get state() { return state; } };
})();

MAIN.init();
