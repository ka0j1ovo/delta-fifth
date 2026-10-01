// 武器系统：定义、购买/拥有、射击、后坐力、换弹、切枪、枪械视模型
const WEAPONS = (function () {
  // index 0=Classic(自带) 1=Ghost 2=Spectre 3=Vandal 4=Odin
  const DEFS = [
    { id: 'classic', name: '经典 Classic', price: 0,    damage: 26, headMult: 3, mag: 12, reserve: Infinity,  rpm: 400, auto: false, spread: 0.9, moveSpread: 2.0, recoil: 0.5, bloomPerShot: 0.18, reload: 1.05, sound: 'pistol', color: 0x3f4a5a },
    { id: 'ghost',   name: '鬼魅 Ghost',  price: 300,  damage: 28, headMult: 3, mag: 15,  reserve: Infinity,  rpm: 360, auto: false, spread: 0.8, moveSpread: 2.0, recoil: 0.45, bloomPerShot: 0.15, reload: 1.2,  sound: 'pistol', color: 0x5a6a7a },
    { id: 'spectre', name: '蜂刺 Spectre', price: 500,  damage: 24, headMult: 3, mag: 30,  reserve: Infinity,  rpm: 720, auto: true,  spread: 1.5, moveSpread: 2.8, recoil: 0.35, bloomPerShot: 0.13, reload: 1.4,  sound: 'smg',   color: 0x2f4f6f },
    { id: 'vandal',  name: '狂徒 Vandal', price: 800,  damage: 40, headMult: 4, mag: 25,  reserve: Infinity,  rpm: 540, auto: true,  spread: 1.2, moveSpread: 3.2, recoil: 0.7,  bloomPerShot: 0.16, reload: 1.82, sound: 'rifle', color: 0x6b3a1f },
    { id: 'odin',    name: '奥丁 Odin',   price: 1500, damage: 30, headMult: 3, mag: 100, reserve: Infinity, rpm: 720, auto: true,  spread: 2.2, moveSpread: 4.2, recoil: 0.5,  bloomPerShot: 0.08, reload: 3.8,  sound: 'odin',  color: 0x4b5320 },
  ];

  let current = 0;
  let owned = DEFS.map((d, i) => i === 0); // 只有 Classic 默认拥有
  let mags = DEFS.map(d => d.mag);
  let reserves = DEFS.map(d => d.reserve);
  let lastShot = 0, reloading = false, reloadTimer = 0;
  let bloom = 0, recoilPitch = 0, viewKick = 0;
  let camera = null, player = null, vmGroup = null;

  function def() { return DEFS[current]; }
  function getCurrentIndex() { return current; }
  function isOwned(i) { return !!owned[i]; }
  function own(i) { owned[i] = true; }

  function init(cam) { camera = cam; }
  function setPlayer(p) { player = p; }

  function resetForRun() {
    current = 0;
    owned = DEFS.map((d, i) => i === 0);
    mags = DEFS.map(d => d.mag);
    reserves = DEFS.map(d => d.reserve);
    reloading = false; reloadTimer = 0; bloom = 0; recoilPitch = 0; viewKick = 0;
    HUD.refreshWeapon();
    HUD.refreshAmmo();
    updateViewModel();
  }

  function switchTo(index) {
    if (index === current || !owned[index]) return;
    reloading = false; reloadTimer = 0;
    current = index; lastShot = 0; bloom = 0; recoilPitch = 0;
    HUD.refreshWeapon();
    HUD.refreshAmmo();
    updateViewModel();
  }

  function cycle(delta) {
    let idx = current;
    for (let k = 0; k < DEFS.length; k++) {
      idx = (idx + delta + DEFS.length) % DEFS.length;
      if (owned[idx]) { switchTo(idx); return; }
    }
  }

  function startReload() {
    const w = def();
    if (reloading) return;
    if (mags[current] >= w.mag || reserves[current] <= 0) return;
    reloading = true; reloadTimer = w.reload;
    Audio.reload();
  }

  function update(dt) {
    bloom = Math.max(0, bloom - dt * 1.6);
    recoilPitch = Math.max(0, recoilPitch - dt * 7);
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        const w = def();
        const need = w.mag - mags[current];
        const take = Math.min(need, reserves[current]);
        mags[current] += take; reserves[current] -= take;
        reloading = false;
        HUD.refreshAmmo();
      }
    }
  }

  // 子弹耗尽（弹匣+备弹均为 0）且非 Classic → 移除该武器
  function dropWeapon() {
    if (current === 0) return;
    const dropped = DEFS[current].name;
    owned[current] = false;
    current = 0;
    HUD.prompt(dropped + ' 子弹耗尽，已丢失');
    HUD.refreshWeapon();
    HUD.refreshAmmo();
    updateViewModel();
  }

  function tryFire(now, isDown) {
    const w = def();
    if (reloading) return;
    if (now - lastShot < 60 / w.rpm) return;
    if (mags[current] <= 0) {
      if (isDown && now - lastShot > 0.35) { Audio.dryfire(); lastShot = now; }
      return;
    }
    lastShot = now;
    mags[current]--;
    bloom = Math.min(2.5, bloom + w.bloomPerShot);
    recoilPitch = Math.min(4, recoilPitch + w.recoil);
    viewKick = Math.min(1, viewKick + 0.5);
    Audio.shoot(w.sound);
    ENEMIES.onPlayerShoot();
    doHitscan(w);
    HUD.refreshAmmo();
    if (mags[current] <= 0) {
      if (reserves[current] > 0) startReload();
      else dropWeapon();
    }
  }

  function getAimDirection(w) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let sp = w.spread + (player && player.isMoving ? w.moveSpread : 0) + bloom;
    if (player && !player.grounded) sp += 2.5;
    if (player && player.ads) sp *= 0.2; // 开镜大幅提升精度
    const rad = sp * Math.PI / 180;
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir.addScaledVector(right, (Math.random() * 2 - 1) * rad)
       .addScaledVector(up, (Math.random() * 2 - 1) * rad)
       .normalize();
    return dir;
  }

  function getMuzzleWorldPos() {
    const p = new THREE.Vector3(0.22, -0.16, -0.5);
    p.applyQuaternion(camera.quaternion);
    p.add(camera.position);
    return p;
  }

  function doHitscan(w) {
    const origin = camera.position.clone();
    const dir = getAimDirection(w);
    const raycaster = new THREE.Raycaster(origin, dir, 0.01, 300);
    const targets = ENEMIES.getMeshes().concat(MAP.world.shootables);
    const hits = raycaster.intersectObjects(targets, false);
    let hitPoint = null;
    if (hits.length) {
      const h = hits[0];
      hitPoint = h.point.clone();
      const ud = h.object.userData;
      if (ud.enemy) {
        const isHead = ud.type === 'head';
        const dmg = w.damage * (isHead ? w.headMult : 1);
        const killed = ud.enemy.takeDamage(dmg, isHead, dir);
        HUD.hitmarker(isHead, killed);
        if (isHead) Audio.headshot(); else Audio.hit();
        Effects.blood(h.point, isHead);
        if (killed) {
          const counted = ENEMIES.onKill(ud.enemy);
          Audio.enemyDie();
          Audio.kill();
          if (counted) HUD.onKill();
        }
      } else {
        Effects.spark(h.point, h.face ? h.face.normal : null);
      }
    }
    const muzzle = getMuzzleWorldPos();
    const end = hitPoint || origin.clone().add(dir.clone().multiplyScalar(300));
    Effects.tracer(muzzle, end);
    Effects.muzzleFlash(muzzle, w.id === 'spectre' ? 0.5 : 1); // 冲锋枪枪口火焰减半
  }

  function buildViewModel(cam) {
    vmGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.46), new THREE.MeshBasicMaterial({ color: 0x2b2b2b }));
    vmGroup.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.32);
    vmGroup.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    grip.position.set(0, -0.12, 0.16); grip.rotation.x = 0.4;
    vmGroup.add(grip);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    accent.position.set(0, 0.0, -0.1);
    vmGroup.add(accent);
    vmGroup.position.set(0.22, -0.18, -0.45);
    cam.add(vmGroup);
    updateViewModel();
  }

  function updateViewModel() {
    if (!vmGroup) return;
    vmGroup.children[3].material.color.set(def().color);
  }

  return {
    DEFS, init, setPlayer, def, getCurrentIndex, isOwned, own, resetForRun,
    switchTo, cycle, startReload, update, tryFire,
    buildViewModel, updateViewModel,
    ammo: () => mags[current],
    reserve: () => reserves[current],
    getRecoilPitch: () => recoilPitch,
    getBloom: () => bloom,
    isReloading: () => reloading,
    reloadProgress: () => reloading ? 1 - reloadTimer / def().reload : 0,
    reloadTimeLeft: () => reloading ? reloadTimer : 0,
    viewmodel: () => vmGroup,
    getViewKick: () => viewKick,
    decayViewKick: d => { viewKick = Math.max(0, viewKick - d); },
  };
})();
