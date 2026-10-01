// 地图：地面、围墙、掩体箱；碰撞体 + emoji 精灵工具
const MAP = (function () {
  const world = { colliders: [], shootables: [] };

  function tex(draw, w, h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function floorTex() {
    return tex((g, w, h) => {
      g.fillStyle = '#ffd9e6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffbfd6'; g.lineWidth = 2;
      const step = 64;
      for (let i = 0; i <= w; i += step) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
      for (let i = 0; i <= h; i += step) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      for (let i = 0; i < 1200; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    }, 256, 256);
  }

  function wallTex(color) {
    return tex((g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, w, h * 0.18);
      g.strokeStyle = 'rgba(0,0,0,0.14)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    }, 128, 128);
  }

  function crateTex(color) {
    return tex((g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    }, 128, 128);
  }

  function build(scene) {
    scene.background = new THREE.Color(0xaeeeee);
    scene.fog = new THREE.Fog(0xaeeeee, 35, 140);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd5dae2, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(35, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.95 })
    );
    floor.material.map.repeat.set(12, 12);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData = { type: 'world' };
    scene.add(floor);
    world.shootables.push(floor);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex('#ffc4dd'), roughness: 0.9 });
    const wallMat2 = new THREE.MeshStandardMaterial({ map: wallTex('#ffaecf'), roughness: 0.9 });
    const crateBlueLight = new THREE.MeshStandardMaterial({ map: crateTex('#d3ebff'), roughness: 0.9, transparent: true, opacity: 0.97 });
    const crateBlue = new THREE.MeshStandardMaterial({ map: crateTex('#aad6ff'), roughness: 0.9, transparent: true, opacity: 0.97 });
    const crateBlueDeep = new THREE.MeshStandardMaterial({ map: crateTex('#86c4ff'), roughness: 0.9, transparent: true, opacity: 0.97 });

    function box(cx, cz, w, d, h, mat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(cx, h / 2, cz);
      m.castShadow = true; m.receiveShadow = true;
      m.userData = { type: 'world' };
      scene.add(m);
      world.shootables.push(m);
      world.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }

    const half = 28, T = 1;
    // 四周围墙
    box(0, -half - T / 2, half * 2 + T * 2, T, 6, wallMat);  // 南
    box(0, half + T / 2, half * 2 + T * 2, T, 6, wallMat);   // 北
    box(-half - T / 2, 0, T, half * 2, 6, wallMat);          // 西
    box(half + T / 2, 0, T, half * 2, 6, wallMat);           // 东

    // 中路隔断
    box(0, -12, 20, 2, 5, wallMat2);
    box(0, 12, 20, 2, 5, wallMat2);
    box(-14, 0, 2, 14, 5, wallMat2);
    box(14, 0, 2, 14, 5, wallMat2);

    // 掩体箱
    const crates = [
      [-8, -22, 2, 2, 3, crateBlueDeep], [8, -22, 2, 2, 3, crateBlue],
      [-8, 22, 2, 2, 3, crateBlue], [8, 22, 2, 2, 3, crateBlueDeep],
      [-6, 0, 1.6, 1.6, 1.6, crateBlueLight], [6, 0, 1.6, 1.6, 1.6, crateBlueLight],
      [-22, -6, 2, 2, 2, crateBlue], [22, -6, 2, 2, 2, crateBlue],
      [-22, 6, 2, 2, 2, crateBlue], [22, 6, 2, 2, 2, crateBlue],
      [-18, -18, 2.4, 2.4, 2.4, crateBlueDeep], [18, -18, 2.4, 2.4, 2.4, crateBlueDeep],
      [-18, 18, 2.4, 2.4, 2.4, crateBlueLight], [18, 18, 2.4, 2.4, 2.4, crateBlueLight],
    ];
    crates.forEach(c => box(c[0], c[1], c[2], c[3], c[4], c[5]));

    const crates2 = [
      [-12, 0, 2, 2, 2, crateBlue], [12, 0, 2, 2, 2, crateBlue],
      [-4, -4, 1.6, 1.6, 1.6, crateBlueLight], [4, -4, 1.6, 1.6, 1.6, crateBlueLight],
      [-4, 4, 1.6, 1.6, 1.6, crateBlueLight], [4, 4, 1.6, 1.6, 1.6, crateBlueLight],
      [-12, -4, 1.6, 1.6, 1.6, crateBlue], [12, -4, 1.6, 1.6, 1.6, crateBlue],
      [-12, 4, 1.6, 1.6, 1.6, crateBlue], [12, 4, 1.6, 1.6, 1.6, crateBlue],
      [-4, -10, 2, 2, 2, crateBlue], [4, -10, 2, 2, 2, crateBlue],
      [16, -6, 2, 2, 2, crateBlueDeep],
      [-20, -10, 2, 2, 2, crateBlue], [20, -10, 2, 2, 2, crateBlue],
      [-24, -14, 2, 2, 2.4, crateBlueDeep], [24, -14, 2, 2, 2.4, crateBlueDeep],
      [-20, -2, 1.6, 1.6, 1.6, crateBlueLight], [20, 2, 1.6, 1.6, 1.6, crateBlueLight],
    ];
    crates2.forEach(c => box(c[0], c[1], c[2], c[3], c[4], c[5]));

    return world;
  }

  // emoji 精灵（始终面向相机）
  function sprite(emoji, scale) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 64, 66);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  // 圆形碰撞体（半径 radius）对 AABB 的推挤解算
  function resolve(px, pz, radius) {
    for (let iter = 0; iter < 3; iter++) {
      for (const b of world.colliders) {
        const cx = Math.max(b.minX, Math.min(px, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
        const dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          const d = Math.sqrt(d2) || 0.0001;
          const push = radius - d;
          px += (dx / d) * push;
          pz += (dz / d) * push;
        }
      }
    }
    return { x: px, z: pz };
  }

  return { build, resolve, world, sprite };
})();
