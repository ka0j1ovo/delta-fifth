// 检视 3D 预览：独立小渲染器（拖拽旋转 + 惯性 + 待机自动转 + 滚轮缩放）
// 形状按物品近似：史诗/传说物品逐件做真 3D 造型；其余物品用「带厚度卡片」兜底
const INSPECT = (function () {
  let renderer = null, scene = null, camera = null, group = null;
  let envTex = null, container = null;
  let raf = 0;

  let target = { x: 0, y: 0 };      // 俯仰 / 水平旋转角（弧度）
  let vel = { x: 0, y: 0 };         // 惯性角速度
  let dist = 3.3;                   // 相机距离
  let dragging = false, lastX = 0, lastY = 0, idle = 0;

  const MIN_DIST = 1.9, MAX_DIST = 6.5;
  const PITCH_MAX = 1.35;           // ~±77°
  const TARGET_SIZE = 1.15;         // 归一化后的最大边长（整体缩小为原 50%）

  // —— 程序化环境贴图：渐变天空 + 几处亮斑，让切面有反光火彩 ——
  function makeEnv() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, '#9fb0c0');
    grad.addColorStop(0.75, '#3a4350');
    grad.addColorStop(1, '#14161c');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
    const blobs = [
      [40, 26, 16, 'rgba(255,255,255,0.95)'],
      [116, 18, 12, 'rgba(255,255,255,0.85)'],
      [200, 34, 14, 'rgba(200,230,255,0.9)'],
      [78, 92, 12, 'rgba(255,240,200,0.7)'],
      [180, 100, 10, 'rgba(255,255,255,0.7)'],
    ];
    for (const [bx, by, br, bc] of blobs) {
      const rg = g.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, bc); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const sph = new THREE.Mesh(
      new THREE.SphereGeometry(30, 32, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })
    );
    envScene.add(sph);
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    tex.dispose();
    return rt.texture;
  }

  function wearOf(item) {
    const w = (item && typeof item.wear === 'number' && Number.isFinite(item.wear)) ? item.wear : 0.8;
    return Math.min(1, Math.max(0, w));
  }

  // ================= 材质（崭新度联动：越旧越粗糙 / 越浑浊） =================
  function matMetal(color, wear, rough) {
    rough = rough == null ? 0.25 : rough;
    return new THREE.MeshPhysicalMaterial({
      color, metalness: 1.0, roughness: rough + (1 - wear) * 0.45,
      clearcoat: 0.4, clearcoatRoughness: 0.25,
      envMap: envTex, envMapIntensity: 1.25,
    });
  }
  function matGlass(color, wear) {   // 通透（钻石 / 珍珠 / 玻璃瓶 / 花瓶）
    return new THREE.MeshPhysicalMaterial({
      color, metalness: 0.05, roughness: 0.02 + (1 - wear) * 0.35,
      clearcoat: 1, clearcoatRoughness: 0.03,
      envMap: envTex, envMapIntensity: 1.4,
      transparent: true, opacity: 0.68 + wear * 0.32,
    });
  }
  function matGloss(color, wear, rough) { // 亮面（屏幕 / 塑料）
    rough = rough == null ? 0.2 : rough;
    return new THREE.MeshPhysicalMaterial({
      color, metalness: 0.25, roughness: rough + (1 - wear) * 0.35,
      clearcoat: 1, clearcoatRoughness: 0.08,
      envMap: envTex, envMapIntensity: 0.9,
    });
  }
  function matMatte(color, wear, rough) { // 亚光（石材 / 布料 / 机身）
    rough = rough == null ? 0.5 : rough;
    return new THREE.MeshPhysicalMaterial({
      color, metalness: 0.15, roughness: rough + (1 - wear) * 0.3,
      clearcoat: 0.25, clearcoatRoughness: 0.3,
      envMap: envTex, envMapIntensity: 0.5,
    });
  }

  // 圆盘（轴向 Z，正对镜头）：用于硬币 / 勋章 / 表盘 / 光盘 / 镜头
  function discMesh(r, thickness, mat, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thickness, seg || 48), mat);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  // 金砖/银锭的梯形锭几何（上窄下宽的经典锭形）
  function ingotGeometry(w, h, d, k) {
    const hw = w / 2, hh = h / 2, hd = d / 2, htw = w * k / 2, htd = d * k / 2;
    const b0 = [-hw, -hh, -hd], b1 = [hw, -hh, -hd], b2 = [hw, -hh, hd], b3 = [-hw, -hh, hd];
    const t0 = [-htw, hh, -htd], t1 = [htw, hh, -htd], t2 = [htw, hh, htd], t3 = [-htw, hh, htd];
    const v = [];
    const tri = (a, b, c) => { v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    tri(t0, t2, t1); tri(t0, t3, t2);   // 顶
    tri(b0, b1, b2); tri(b0, b2, b3);   // 底
    tri(b0, t1, b1); tri(b0, t0, t1);   // 前
    tri(b1, t2, b2); tri(b1, t1, t2);   // 右
    tri(b2, t3, b3); tri(b2, t2, t3);   // 后
    tri(b3, t0, b0); tri(b3, t3, t0);   // 左
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // 光盘彩虹纹理（同心色环，映射到圆盘面）
  function rainbowTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const bands = ['#14161c', '#3a4350', '#8a92c0', '#c9d2ec', '#d8a0e0', '#8ab0e0', '#a0e0c0', '#e0d8a0', '#e0a0a0', '#8a92c0'];
    const n = bands.length;
    for (let i = n - 1; i >= 0; i--) {
      g.beginPath(); g.arc(128, 128, (i + 1) / n * 128, 0, Math.PI * 2);
      g.fillStyle = bands[i]; g.fill();
    }
    g.beginPath(); g.arc(128, 128, 14, 0, Math.PI * 2);
    g.fillStyle = '#0d0f13'; g.fill();
    return new THREE.CanvasTexture(cv);
  }

  // ================= 各物品造型 =================

  // —— 钻石：8 折明亮式切工 ——
  function buildDiamond() {
    const N = 8, tableR = 0.42, girdleR = 1.0, crownH = 0.34, pavH = 0.78;
    const verts = [];
    const tri = (a, b, c) => { verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    const tableV = [], girdleV = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2 + Math.PI / N;
      tableV.push([Math.cos(a) * tableR, crownH, Math.sin(a) * tableR]);
    }
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      girdleV.push([Math.cos(a) * girdleR, 0, Math.sin(a) * girdleR]);
    }
    const culet = [0, -pavH, 0], tc = [0, crownH, 0];
    for (let i = 0; i < N; i++) tri(tc, tableV[i], tableV[(i + 1) % N]);
    for (let i = 0; i < N; i++) {
      tri(tableV[i], girdleV[i], girdleV[(i + 1) % N]);
      tri(tableV[i], girdleV[(i + 1) % N], tableV[(i + 1) % N]);
    }
    for (let i = 0; i < N; i++) tri(girdleV[i], culet, girdleV[(i + 1) % N]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }
  function buildDiamondMesh(wear) {
    const mesh = new THREE.Mesh(buildDiamond(), matGlass(0xdff3ff, wear));
    const girdle = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    girdle.rotation.x = Math.PI / 2;
    mesh.add(girdle);
    return mesh;
  }

  // —— 珍珠（上下两片贝壳夹珍珠） ——
  function buildPearl(wear) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 32), matGlass(0xf2e8e0, wear)));
    const shellMat = matGloss(0xcdb7a0, wear, 0.24);
    shellMat.side = THREE.DoubleSide;
    const shellGeo = new THREE.SphereGeometry(0.38, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const top = new THREE.Mesh(shellGeo, shellMat);
    top.scale.set(1, 0.5, 1); top.position.y = 0.42; g.add(top);
    const bottom = new THREE.Mesh(shellGeo, shellMat);
    bottom.scale.set(1, 0.5, 1); bottom.rotation.x = Math.PI; bottom.position.y = -0.42; g.add(bottom);
    return g;
  }

  // —— 电脑（显示器 + 底座） ——
  function buildComputer(wear) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.08), matMatte(0x14171c, wear, 0.4));
    g.add(frame);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.76, 0.02), matGloss(0x1d4f8a, wear, 0.15));
    screen.position.z = 0.045; g.add(screen);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.1), matMetal(0x3a3f46, wear, 0.3));
    stand.position.set(0, -0.62, -0.02); g.add(stand);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.4), matMetal(0x3a3f46, wear, 0.3));
    base.position.set(0, -0.84, 0); g.add(base);
    return g;
  }

  // —— 显卡（双风扇 + 金手指） ——
  function buildGpu(wear) {
    const g = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.12), matMatte(0x2a2f3a, wear, 0.4));
    g.add(card);
    for (const dx of [-0.42, 0.42]) {
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 28), matMatte(0x0d0f13, wear, 0.3));
      fan.rotation.x = Math.PI / 2; fan.position.set(dx, 0.08, 0.07); g.add(fan);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 8, 28), matMetal(0x55606e, wear, 0.2));
      ring.position.set(dx, 0.08, 0.1); g.add(ring);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.05), matMetal(0xe0b84b, wear, 0.15));
    strip.position.set(0, -0.38, 0.02); g.add(strip);
    return g;
  }

  // —— 坦克模型 ——
  function buildTank(wear) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.9), matMatte(0x5a6a44, wear, 0.4));
    hull.position.y = 0.02; g.add(hull);
    for (const sx of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 1.0), matMatte(0x2a2f3a, wear, 0.5));
      track.position.set(sx * 0.66, -0.1, 0); g.add(track);
    }
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.24, 32), matMatte(0x4a5535, wear, 0.4));
    turret.position.y = 0.3; g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 20), matMatte(0x3a4530, wear, 0.4));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.34, 0.55); g.add(barrel);
    return g;
  }

  // —— 雕像（简易金色人体） ——
  function buildStatue(wear) {
    const g = new THREE.Group();
    const gold = matMetal(0xe0b84b, wear, 0.16);
    const goldD = matMetal(0xc9a03a, wear, 0.22);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 32), goldD);
    base.position.y = -0.92; g.add(base);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.52, 20), gold);
      leg.position.set(sx * 0.11, -0.56, 0); g.add(leg);
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.62, 28), gold);
    torso.position.y = -0.04; g.add(torso);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.52, 18), gold);
      arm.position.set(sx * 0.27, -0.06, 0);
      arm.rotation.z = sx * 0.28;
      g.add(arm);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 20), gold);
    head.position.y = 0.4; g.add(head);
    return g;
  }

  // —— 实验数据光盘 ——
  function buildDisc(wear) {
    const g = new THREE.Group();
    const body = discMesh(1.0, 0.06, new THREE.MeshStandardMaterial({
      map: rainbowTex(), metalness: 0.4, roughness: 0.2 + (1 - wear) * 0.3,
      envMap: envTex, envMapIntensity: 0.35,
    }), 48);
    g.add(body);
    const hole = discMesh(0.14, 0.08, matMatte(0x0d0f13, wear, 0.3), 24);
    g.add(hole);
    return g;
  }

  // —— 金表 ——
  function buildWatch(wear) {
    const g = new THREE.Group();
    g.add(discMesh(0.52, 0.14, matMetal(0xe0b84b, wear, 0.15), 48));
    const dial = discMesh(0.4, 0.02, matMatte(0xfdf6e0, wear, 0.2), 48);
    dial.position.z = 0.08; g.add(dial);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 20), matMetal(0xe0b84b, wear, 0.15));
    crown.rotation.z = Math.PI / 2; crown.position.set(0.56, 0, 0); g.add(crown);
    for (const sy of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.1), matMatte(0x8a6a1f, wear, 0.5));
      strap.position.set(0, sy * 0.62, -0.02); g.add(strap);
    }
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), matMetal(0x3a2f23, wear, 0.3));
    hand.position.set(0, 0.1, 0.1); g.add(hand);
    return g;
  }

  // —— 名窑瓷器花瓶（车床旋转成型） ——
  function buildVase(wear) {
    const profile = [
      [0.08, -0.85], [0.12, -0.8], [0.26, -0.6], [0.36, -0.25], [0.38, 0.05],
      [0.3, 0.35], [0.18, 0.55], [0.14, 0.66], [0.18, 0.72],
    ];
    const pts = profile.map(p => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 48), matGloss(0xeef4f8, wear, 0.15)));
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 10, 48), matMatte(0x3a6fb8, wear, 0.3));
    band.rotation.x = Math.PI / 2; band.position.y = -0.05; g.add(band);
    return g;
  }

  // —— 金砖 / 银锭（共用锭形） ——
  function buildIngot(color, wear) {
    return new THREE.Mesh(ingotGeometry(1.3, 0.5, 0.7, 0.8), matMetal(color, wear, 0.18));
  }

  // —— 金币 / 银币（一面字一面花：正面刻字、背面花卉） ——
  function coinFaceTex(design, tone) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const cx = 128, cy = 128, R = 122;
    const pal = tone === 'silver'
      ? { c0: '#f6f8fa', c1: '#c9d2dc', c2: '#8a929e', line: '#6d737b', ring: '#9aa5b5' }
      : { c0: '#fff3c0', c1: '#e0b84b', c2: '#a67c1f', line: '#8a6a1f', ring: '#c9a03a' };
    const bg = g.createRadialGradient(cx - 40, cy - 40, 10, cx, cy, R);
    bg.addColorStop(0, pal.c0); bg.addColorStop(0.6, pal.c1); bg.addColorStop(1, pal.c2);
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = 10; g.strokeStyle = pal.line; g.beginPath(); g.arc(cx, cy, R - 5, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.strokeStyle = pal.ring; g.beginPath(); g.arc(cx, cy, R - 26, 0, Math.PI * 2); g.stroke();
    if (design === 'char') {
      g.fillStyle = pal.line; g.font = 'bold 130px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tone === 'silver' ? '银' : '金', cx, cy + 6);
    } else {
      g.fillStyle = pal.line;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        g.beginPath(); g.ellipse(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42, 30, 15, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = pal.c0; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal.line; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
    }
    return new THREE.CanvasTexture(cv);
  }
  function buildCoinFaces(color, tone, wear) {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.1, 48);
    const side = matMetal(color, wear, 0.18);
    const rough = 0.28 + (1 - wear) * 0.3;
    const face = (design) => new THREE.MeshPhysicalMaterial({
      map: coinFaceTex(design, tone), metalness: 0.6, roughness: rough,
      clearcoat: 0.3, clearcoatRoughness: 0.3, envMap: envTex, envMapIntensity: 0.4,
    });
    const coin = new THREE.Mesh(geo, [side, face('char'), face('flower')]);
    coin.rotation.x = Math.PI / 2;   // 顶面(+Y)→正面(+Z)刻字、底面(-Y)→背面花卉
    g.add(coin);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 12, 48), side);
    rim.position.z = 0.05; g.add(rim);
    const rim2 = rim.clone(); rim2.position.z = -0.05; g.add(rim2);
    return g;
  }

  // —— 相机 ——
  function buildCamera(wear) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.5), matMatte(0x2a2f3a, wear, 0.4)));
    const lens = discMesh(0.3, 0.22, matMetal(0x14171c, wear, 0.15), 32);
    lens.position.z = 0.32; g.add(lens);
    const glass = discMesh(0.22, 0.03, matGloss(0x2a3a55, wear, 0.1), 32);
    glass.position.z = 0.44; g.add(glass);
    const bump = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.28), matMatte(0x3a3f46, wear, 0.4));
    bump.position.set(0, 0.46, 0); g.add(bump);
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.04), matMatte(0xe8e4da, wear, 0.3));
    flash.position.set(0.5, 0.1, 0.27); g.add(flash);
    return g;
  }

  // —— 无人机（四旋翼） ——
  function buildDrone(wear) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), matMatte(0x3a3f46, wear, 0.4)));
    const armMat = matMatte(0x2a2f3a, wear, 0.4), rotorMat = matMatte(0x1a1c20, wear, 0.3);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.9 : 0.14, 0.07, dz ? 0.9 : 0.14), armMat);
      arm.position.set(dx * 0.4, 0.06, dz * 0.4); g.add(arm);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20), rotorMat);
      hub.position.set(dx * 0.85, 0.16, dz * 0.85); g.add(hub);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 32), rotorMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(dx * 0.85, 0.18, dz * 0.85); g.add(ring);
    }
    return g;
  }

  // —— 香槟（细长玻璃瓶 + 金箔封口 + 标签） ——
  function buildChampagne(wear) {
    const g = new THREE.Group();
    const glass = matGlass(0x2e7a4f, wear);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.1, 40), glass);
    body.position.y = 0.05; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 32), glass);
    neck.position.y = 0.75; g.add(neck);
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 32), matMetal(0xe0b84b, wear, 0.2));
    foil.position.y = 1.0; g.add(foil);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 40), matMatte(0xf2e6c8, wear, 0.35));
    label.position.y = 0.05; g.add(label);
    return g;
  }

  // —— 勋章（绶带 + 圆盘 + 中心凸起） ——
  function buildMedal(wear) {
    const g = new THREE.Group();
    const ribMat = matMatte(0xc8322f, wear, 0.4);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.02), ribMat);
    r1.position.set(-0.16, 0.55, -0.03); r1.rotation.z = 0.25; g.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.02), ribMat);
    r2.position.set(0.16, 0.55, -0.03); r2.rotation.z = -0.25; g.add(r2);
    g.add(discMesh(0.55, 0.09, matMetal(0xe0b84b, wear, 0.18), 48));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.02, 10, 48), matMetal(0xffe9a8, wear, 0.2));
    ring.position.z = 0.05; g.add(ring);
    const dot = discMesh(0.12, 0.05, matMetal(0xffe9a8, wear, 0.2), 24);
    dot.position.z = 0.06; g.add(dot);
    return g;
  }

  // —— 手机 ——
  function buildPhone(wear) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.42, 0.08), matMetal(0x1a1c22, wear, 0.3)));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.24, 0.03), matGloss(0x1d4f8a, wear, 0.15));
    screen.position.z = 0.045; g.add(screen);
    const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), matMetal(0x0d0f13, wear, 0.2));
    cam.rotation.x = Math.PI / 2; cam.position.set(0, 0.6, 0.055); g.add(cam);
    return g;
  }

  // —— CPU ——
  function buildCpu(wear) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.08), matMatte(0x1f7a3d, wear, 0.4)));
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), matMetal(0x9aa5b5, wear, 0.15));
    die.position.z = 0.08; g.add(die);
    return g;
  }

  // —— 兜底：带厚度的卡片（正/背贴物品图标，四边用稀有度色） ——
  function buildSlabMesh(item, wear) {
    const rcol = (ITEMS.RARITIES.find(r => r.id === item.rarityId) || {}).color || item.color || '#9aa0a8';
    const op = 0.2 + wear * 0.8;
    const tex = ITEMS.iconTexture(item);
    const front = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op });
    const back = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op });
    const edge = new THREE.MeshBasicMaterial({ color: rcol });
    return new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.4), [edge, edge, edge, edge, front, back]);
  }

  const BUILDERS = {
    '钻石': buildDiamondMesh,
    '珍珠': buildPearl,
    '电脑': buildComputer,
    '显卡': buildGpu,
    '坦克模型': buildTank,
    '雕像': buildStatue,
    '实验数据光盘': buildDisc,
    '金表': buildWatch,
    '名窑瓷器花瓶': buildVase,
    '金砖': (wear) => buildIngot(0xe0b84b, wear),
    '金币': (wear) => buildCoinFaces(0xe0b84b, 'gold', wear),
    '相机': buildCamera,
    '无人机': buildDrone,
    '香槟': buildChampagne,
    '勋章': buildMedal,
    '手机': buildPhone,
    'CPU': buildCpu,
    '银锭': (wear) => buildIngot(0xc9d2dc, wear),
    '银币': (wear) => buildCoinFaces(0xc9d2dc, 'silver', wear),
  };

  function buildMesh(item) {
    const wear = wearOf(item);
    const b = BUILDERS[item.name];
    return b ? b(wear) : buildSlabMesh(item, wear);
  }

  // 归一化：居中并统一缩放，让不同形状都在同一视窗大小内
  function fitGroup(obj) {
    const g = new THREE.Group();
    g.add(obj);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z);
    if (max > 0.0001) g.scale.setScalar(TARGET_SIZE / max);
    return g;
  }

  function buildScene(item) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, dist);

    group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.add(fitGroup(buildMesh(item)));
    scene.add(group);

    scene.add(new THREE.AmbientLight(0x8899aa, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(2, 3, 4); scene.add(key);
    const cool = new THREE.PointLight(0xbfe6ff, 0.9); cool.position.set(-3, 2, 2); scene.add(cool);
    const warm = new THREE.PointLight(0xffe0b0, 0.6); warm.position.set(2, -1, -3); scene.add(warm);
  }

  function applyZoom() {
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
  }

  function resize() {
    if (!container || !renderer) return;
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!dragging) {
      target.x += vel.x; target.y += vel.y;
      vel.x *= 0.94; vel.y *= 0.94;
      if (Math.abs(vel.x) < 0.0004) vel.x = 0;
      if (Math.abs(vel.y) < 0.0004) vel.y = 0;
      if (vel.x === 0 && vel.y === 0) {
        idle += 0.016;
        if (idle > 1.4) target.y += 0.004;   // 待机自动缓慢旋转
      } else idle = 0;
    } else idle = 0;
    target.x = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, target.x));
    group.rotation.x = target.x;
    group.rotation.y = target.y;
    renderer.render(scene, camera);
  }

  function onDown(e) {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    vel.x = vel.y = 0;
    container.setPointerCapture && container.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    target.y += dx * 0.009;   // 向右拖 → 物体正面跟着向右（抓取手感）
    target.x += dy * 0.009;   // 向下拖 → 物体正面跟着向下
    vel.y = dx * 0.009;
    vel.x = dy * 0.009;
  }
  function onUp() {
    if (dragging) dragging = false;
  }
  function onWheel(e) {
    e.preventDefault();
    dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist * (e.deltaY > 0 ? 0.9 : 1.1)));
    applyZoom();
  }
  function onContext(e) { e.preventDefault(); }

  function open(el, item) {
    close();
    if (!el || !item) return;
    container = el;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    try { envTex = makeEnv(); } catch (e) { envTex = null; }
    buildScene(item);
    applyZoom();
    resize();
    target = { x: 0.34, y: -0.55 };
    vel = { x: 0, y: 0 }; dragging = false; idle = 0;

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('contextmenu', onContext);
    loop();
  }

  function close() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (container) {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('contextmenu', onContext);
      container = null;
    }
    if (renderer) {
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.remove();
      renderer = null;
    }
    if (envTex) { envTex.dispose(); envTex = null; }
    scene = null; camera = null; group = null;
  }

  return { open, close };
})();
