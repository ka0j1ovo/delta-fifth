// 地面可开箱：棕色箱（固定点位，开完 60s 后换位恢复）+ 敌人箱（黄=普通bot / 红=精英bot，3 分钟未开启即消失）+ 掉落物 + 拾取
const BOXES = (function () {
  let scene = null, playerObj = null;
  const boxes = [];        // 棕色地面箱 { group, x, z, opened, respawnAt }
  const enemyBoxes = [];   // 敌人箱（黄/红）{ group, x, z, opened, expireAt }
  const drops = [];        // 掉落物 { group, item, x, z }
  let opening = null, progress = 0, elapsed = 0;

  const OPEN_TIME_BROWN = 1.0, OPEN_TIME_YELLOW = 1.0;
  const OPEN_RANGE = 3, PICK_RANGE = 1.5;
  const BOX_RESPAWN = 60, DROP_LIFETIME = 60, YELLOW_LIFETIME = 180;

  const BOX_POSITIONS = [
    { x: -16, z: -8 }, { x: 16, z: -8 }, { x: -16, z: 12 }, { x: 16, z: 12 }, { x: 0, z: -20 },
    { x: -20, z: 20 }, { x: 20, z: 20 }, { x: -20, z: -16 }, { x: 20, z: -16 }, { x: 0, z: 20 },
    { x: -8, z: 4 }, { x: 8, z: 4 }, { x: -8, z: -14 }, { x: 8, z: -14 }, { x: -24, z: 0 },
    { x: 24, z: 0 }, { x: 0, z: 4 }, { x: -12, z: -20 }, { x: 12, z: -20 }, { x: -4, z: 24 },
  ];

  function init(sc, player) { scene = sc; playerObj = player; }

  function buildBoxMesh(bodyColor, lidColor, emoji) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 })
    );
    body.position.y = 0.4; body.castShadow = true;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.1, 0.85),
      new THREE.MeshStandardMaterial({ color: lidColor, roughness: 0.6 })
    );
    lid.position.y = 0.85;
    const spr = MAP.sprite(emoji, 1.1); spr.position.y = 1.6;
    group.add(body, lid, spr);
    return group;
  }

  function spawnBoxes() {
    clear();
    const pool = BOX_POSITIONS.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    for (const p of pool) {
      const group = buildBoxMesh(0x8a6d3b, 0x6d542c, '📦');
      group.position.set(p.x, 0, p.z);
      scene.add(group);
      boxes.push({ group, x: p.x, z: p.z, opened: false, respawnAt: 0, kind: 'brown', openTime: OPEN_TIME_BROWN });
    }
  }

  // 敌人箱：黄箱=普通bot、红箱=精英bot；开启 1s，3 分钟未被开启即消失
  function spawnEnemyBox(x, z, kind) {
    const red = kind === 'red';
    const group = buildBoxMesh(red ? 0xd03232 : 0xf0c22e, red ? 0x8a1f1f : 0xb8920f, '📦');
    group.position.set(x, 0, z);
    scene.add(group);
    enemyBoxes.push({ group, x, z, opened: false, expireAt: elapsed + YELLOW_LIFETIME, kind, openTime: OPEN_TIME_YELLOW });
  }
  function spawnYellowBox(x, z) { spawnEnemyBox(x, z, 'yellow'); }
  function spawnRedBox(x, z) { spawnEnemyBox(x, z, 'red'); }

  // 黄箱内容：沿用旧掉落倍率 —— 10% 血包 / 50% 战利品 / 40% 100 哈基币
  function rollYellowContent() {
    const r = Math.random();
    return r < 0.1 ? ITEMS.medkit() : (r < 0.6 ? ITEMS.generateYellowLoot() : ITEMS.gold(100));
  }

  // 红箱内容：精英掉落，必出精英级战利品（稀有度更高）
  function rollRedContent() { return ITEMS.generateEliteLoot(); }

  // 按箱种取内容：棕=棕表战利品 / 黄=旧倍率 / 红=精英战利品
  function rollBoxContent(kind) {
    if (kind === 'red') return rollRedContent();
    if (kind === 'yellow') return rollYellowContent();
    return ITEMS.generateLoot();
  }

  function clear() {
    for (const b of boxes) scene.remove(b.group);
    boxes.length = 0;
    for (const b of enemyBoxes) scene.remove(b.group);
    enemyBoxes.length = 0;
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
    drops.push({ group, item, x, z, expireAt: elapsed + DROP_LIFETIME });
  }

  // 从背包拖出丢弃：金/红品质（史诗/传说）掉在地上 1 分钟后消失，其余品质直接删除
  function discardBackpackItem(i) {
    const item = INVENTORY.backpackItems()[i];
    if (item && (item.rarityId === 'legendary' || item.rarityId === 'mythic') && playerObj) {
      const ang = Math.random() * Math.PI * 2;
      spawnDrop(item, playerObj.pos.x + Math.cos(ang) * 2, playerObj.pos.z + Math.sin(ang) * 2);
    }
    INVENTORY.removeFromBackpack(i);
  }

  function getNearestBox() {
    if (!playerObj || !playerObj.alive) return null;
    let best = null, bd = Infinity;
    for (const b of boxes.concat(enemyBoxes)) {
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
      progress += dt / opening.openTime;
      if (progress >= 1) {
        const b = opening;
        const count = 1; // 每种箱子各掉 1 件
        for (let i = 0; i < count; i++) {
          const item = rollBoxContent(b.kind);
          const ang = Math.random() * Math.PI * 2, r = Math.random() * 1.3;
          spawnDrop(item, b.x + Math.cos(ang) * r, b.z + Math.sin(ang) * r);
        }
        if (b.kind === 'yellow' || b.kind === 'red') {
          const i = enemyBoxes.indexOf(b);
          if (i >= 0) enemyBoxes.splice(i, 1);
          scene.remove(b.group);
        } else {
          b.opened = true;
          b.respawnAt = elapsed + BOX_RESPAWN;
          scene.remove(b.group);
        }
        opening = null; progress = 0;
        Audio.open();
        HUD.prompt('箱子已开启');
      }
    }

    // 棕色箱：开完 60s 后随机换一个出生点恢复
    for (const b of boxes) {
      if (b.opened && elapsed >= b.respawnAt) {
        b.opened = false; b.respawnAt = 0;
        const p = BOX_POSITIONS[Math.floor(Math.random() * BOX_POSITIONS.length)];
        b.x = p.x; b.z = p.z;
        b.group.position.set(p.x, 0, p.z);
        scene.add(b.group);
      }
    }

    // 敌人箱（黄/红）：3 分钟未被开启即消失
    for (let i = enemyBoxes.length - 1; i >= 0; i--) {
      const b = enemyBoxes[i];
      if (!b.opened && opening !== b && elapsed >= b.expireAt) {
        scene.remove(b.group);
        enemyBoxes.splice(i, 1);
      }
    }

    // 掉落物：60 秒未被拾取则消失；走近拾取
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (elapsed >= d.expireAt) {
        scene.remove(d.group);
        drops.splice(i, 1);
        continue;
      }
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

  return { init, spawnBoxes, spawnYellowBox, spawnRedBox, spawnDrop, discardBackpackItem, update, getNearestBox, startOpening, cancelOpening, isOpening, getProgress, clear };
})();
