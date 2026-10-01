// 撤离点：地图中心圈，站满 10s 成功撤离
const EXTRACT = (function () {
  let scene = null, playerObj = null;
  const pos = { x: 0, z: 0 };
  const RADIUS = 3.5, TIME = 10;
  let progress = 0, inZone = false, sprite = null, bob = 0;

  function init(sc, player) {
    scene = sc; playerObj = player;
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS, RADIUS, 0.06, 40),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.32 })
    );
    disc.position.y = 0.03;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS - 0.12, RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: 0x9ff3ff, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a3a4a }));
    pole.position.y = 1.7;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 2 }));
    light.position.y = 3.5;
    sprite = MAP.sprite('🚁', 2.0); sprite.position.y = 4.6;
    group.add(disc, ring, pole, light, sprite);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
  }

  function inRadius() {
    if (!playerObj || !playerObj.alive) return false;
    const dx = playerObj.pos.x - pos.x, dz = playerObj.pos.z - pos.z;
    return dx * dx + dz * dz <= RADIUS * RADIUS;
  }

  function reset() { progress = 0; inZone = false; }

  // 返回 'done' 表示撤离完成
  function update(dt) {
    inZone = inRadius();
    if (inZone) {
      progress += dt / TIME;
      if (progress >= 1) { progress = 1; return 'done'; }
    } else {
      progress = 0;
    }
    bob += dt;
    if (sprite) sprite.position.y = 4.6 + Math.sin(bob * 2) * 0.15;
    return null;
  }

  function getProgress() { return progress; }
  function isInZone() { return inZone; }

  return { init, update, reset, getProgress, isInZone, pos, RADIUS, TIME };
})();
