// 武器商店：高亮区 + 近距购买面板
const SHOP = (function () {
  let scene = null, playerObj = null;
  const pos = { x: -18, z: -18 };
  const RADIUS = 4;
  let inZone = false;

  function init(sc, player) {
    scene = sc; playerObj = player;
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS, RADIUS, 0.06, 40),
      new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xffa500, emissiveIntensity: 0.4, transparent: true, opacity: 0.28 })
    );
    disc.position.y = 0.03;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS - 0.12, RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc34d, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    const stall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.6 }));
    stall.position.y = 0.8;
    const awning = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xd95d39 }));
    awning.position.y = 1.9;
    const spr = MAP.sprite('🏪', 2.2); spr.position.y = 3.2;
    group.add(disc, ring, stall, awning, spr);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
  }

  function inRadius() {
    if (!playerObj || !playerObj.alive) return false;
    const dx = playerObj.pos.x - pos.x, dz = playerObj.pos.z - pos.z;
    return dx * dx + dz * dz <= RADIUS * RADIUS;
  }

  function update() { inZone = inRadius(); }
  function isInZone() { return inZone; }

  // index：0=Classic(不可买) 1=Ghost 2=Spectre 3=Vandal 4=Odin
  function tryBuy(index) {
    const d = WEAPONS.DEFS[index];
    if (!d) return;
    if (index === 0) { HUD.prompt('经典 Classic 自带，无需购买'); return; }
    if (WEAPONS.isOwned(index)) { HUD.prompt('已拥有 ' + d.name); return; }
    if (INVENTORY.spendGold(d.price)) {
      WEAPONS.own(index);
      WEAPONS.switchTo(index);
      Audio.buy();
      HUD.prompt('购买成功：' + d.name);
    } else {
      HUD.prompt('金币不足（需 ' + d.price + '）');
    }
  }

  // 购买血包（300 金币）：血量不满回 30，满血存入背包
  function tryBuyMedkit() {
    if (playerObj.hp >= playerObj.maxHp && INVENTORY.isBackpackFull()) {
      HUD.prompt('血量与背包均已满，无法购买');
      return;
    }
    if (!INVENTORY.spendGold(300)) { HUD.prompt('金币不足（需 300）'); return; }
    if (playerObj.hp < playerObj.maxHp) { playerObj.heal(30); HUD.prompt('+30 HP'); }
    else { INVENTORY.addToBackpack(ITEMS.medkit()); HUD.prompt('血包已存入背包'); }
    Audio.buy();
  }

  return { init, update, isInZone, tryBuy, tryBuyMedkit, pos, RADIUS };
})();
