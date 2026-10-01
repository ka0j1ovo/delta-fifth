// 地面可开箱（开完 60s 后恢复）+ 掉落物 + 拾取
const BOXES = (function () {
  let scene = null, playerObj = null;
  const boxes = [];   // { group, x, z, opened, respawnAt }
  const drops = [];   // { group, item, x, z }
  let opening = null, progress = 0, elapsed = 0;

  const OPEN_TIME = 1.0, OPEN_RANGE = 3, PICK_RANGE = 1.5;
  const BOX_RESPAWN = 60;

  const BOX_POSITIONS = [
    { x: -16, z: -8 }, { x: 16, z: -8 }, { x: -16, z: 12 }, { x: 16, z: 12 }, { x: 0, z: -20 },
    { x: -20, z: 20 }, { x: 20, z: 20 }, { x: -20, z: -16 }, { x: 20, z: -16 }, { x: 0, z: 20 },
    { x: -8, z: 4 }, { x: 8, z: 4 }, { x: -8, z: -14 }, { x: 8, z: -14 }, { x: -24, z: 0 },
    { x: 24, z: 0 }, { x: 0, z: 4 }, { x: -12, z: -20 }, { x: 12, z: -20 }, { x: -4, z: 24 },
  ];

  function init(sc, player) { scene = sc; playerObj = player; }

  function buildBoxMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.6 })
    );
    body.position.y = 0.4; body.castShadow = true;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.1, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x6d542c, roughness: 0.6 })
    );
    lid.position.y = 0.85;
    const spr = MAP.sprite('📦', 1.1); spr.position.y = 1.6;
    group.add(body, lid, spr);
    return group;
  }

  function spawnBoxes() {
    clear();
    const pool = BOX_POSITIONS.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    for (const p of pool) {
      const group = buildBoxMesh();
      group.position.set(p.x, 0, p.z);
      scene.add(group);
      boxes.push({ group, x: p.x, z: p.z, opened: false, respawnAt: 0 });
    }
  }

  function clear() {
    for (const b of boxes) scene.remove(b.group);
    boxes.length = 0;
    for (const d of drops) scene.remove(d.group);
    drops.length = 0;
    opening = null; progress = 0; elapsed = 0;
  }

  // 掉落物：彩色方块 + 程序化图标
  function spawnDrop(item, x, z) {
    const group = new THREE.Group();
    const color = new THREE.Color(item.color);
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, emissive: color, emissiveIntensity: 0.35 })
    );
    cube.position.y = 0.3; cube.castShadow = true;
    const spr = ITEMS.itemSprite(item, 1.0); spr.position.y = 1.1;
    group.add(cube, spr);
    group.position.set(x, 0, z);
    scene.add(group);
    drops.push({ group, item, x, z });
  }

  // 从背包拖出丢弃：直接删除，不生成地面掉落物
  function discardBackpackItem(i) { INVENTORY.removeFromBackpack(i); }

  function getNearestBox() {
    if (!playerObj || !playerObj.alive) return null;
    let best = null, bd = Infinity;
    for (const b of boxes) {
      if (b.opened) continue;
      const dx = b.x - playerObj.pos.x, dz = b.z - playerObj.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd && d <= OPEN_RANGE * OPEN_RANGE) { bd = d; best = b; }
    }
    return best;
  }

  function startOpening() {
    if (opening) return; // 已在开箱：忽略按住 F 时的重复 keydown
    const b = getNearestBox();
    if (b) { opening = b; progress = 0; }
  }
  function cancelOpening() { if (opening) { opening = null; progress = 0; } }
  function isOpening() { return !!opening; }
  function getProgress() { return opening ? progress : 0; }

  function update(dt) {
    elapsed += dt;

    if (opening) {
      progress += dt / OPEN_TIME;
      if (progress >= 1) {
        const b = opening;
        const count = 1 + Math.floor(Math.random() * 3); // 产出 1~3 个
        for (let i = 0; i < count; i++) {
          const item = Math.random() < 0.85 ? ITEMS.generateLoot() : ITEMS.medkit();
          const ang = Math.random() * Math.PI * 2, r = Math.random() * 1.3;
          spawnDrop(item, b.x + Math.cos(ang) * r, b.z + Math.sin(ang) * r);
        }
        b.opened = true;
        b.respawnAt = elapsed + BOX_RESPAWN;
        scene.remove(b.group);
        opening = null; progress = 0;
        Audio.open();
        HUD.prompt('箱子已开启');
      }
    }

    // 开完的箱子 60s 后随机换一个出生点恢复
    for (const b of boxes) {
      if (b.opened && elapsed >= b.respawnAt) {
        b.opened = false; b.respawnAt = 0;
        const p = BOX_POSITIONS[Math.floor(Math.random() * BOX_POSITIONS.length)];
        b.x = p.x; b.z = p.z;
        b.group.position.set(p.x, 0, p.z);
        scene.add(b.group);
      }
    }

    // 掉落物：走近拾取
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (!playerObj || !playerObj.alive) continue;
      const dx = d.x - playerObj.pos.x, dz = d.z - playerObj.pos.z;
      if (dx * dx + dz * dz <= PICK_RANGE * PICK_RANGE) {
        if (tryPickup(d.item)) {
          scene.remove(d.group);
          drops.splice(i, 1);
        }
      }
    }
  }

  function tryPickup(item) {
    if (item.kind === 'gold') {
      INVENTORY.addGold(item.value);
      Audio.pickup();
      HUD.showPickup(item);
      return true;
    }
    if (item.kind === 'medkit') {
      if (playerObj.hp < playerObj.maxHp) {
        playerObj.heal(30);
        Audio.pickup();
        HUD.showPickup(item, '+30 HP');
        return true;
      }
      if (INVENTORY.addToBackpack(item)) { Audio.pickup(); HUD.showPickup(item, '已入背包'); return true; }
      HUD.prompt('背包已满'); return false;
    }
    // 普通战利品
    if (INVENTORY.addToBackpack(item)) {
      Audio.pickup();
      HUD.showPickup(item);
      return true;
    }
    HUD.prompt('背包已满'); return false;
  }

  return { init, spawnBoxes, spawnDrop, discardBackpackItem, update, getNearestBox, startOpening, cancelOpening, isOpening, getProgress, clear };
})();
