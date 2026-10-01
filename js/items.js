// 物品系统：稀有度表、物品池、随机战利品生成、程序化 Canvas 图标
const ITEMS = (function () {
  const RARITIES = [
    { id: 'common', name: '普通', color: '#e6e6e6', min: 40,   max: 90  },
    { id: 'fine',   name: '精良', color: '#4bd97a', min: 100,  max: 180 },
    { id: 'rare',   name: '稀有', color: '#4b9de0', min: 250,  max: 400 },
    { id: 'epic',   name: '史诗', color: '#a95ce0', min: 700,  max: 1000 },
    { id: 'legend', name: '传说', color: '#e0b84b', min: 1800, max: 2600 },
  ];
  const NAMES = ['电路板', '显卡', '硬盘', '加密U盘', '作战地图情报', '金条', '手表', '现金捆'];

  // 战利品稀有度概率（普通 bot / 精英 bot 各一套）
  const NORMAL_PROBS = [0.60, 0.30, 0.09, 0.008, 0.002];
  const ELITE_PROBS = [0.20, 0.20, 0.56, 0.03, 0.01];

  function rollRarity(probs) {
    let r = Math.random(), acc = 0;
    for (let i = 0; i < RARITIES.length; i++) { acc += probs[i]; if (r < acc) return RARITIES[i]; }
    return RARITIES[0];
  }

  function makeLoot(probs) {
    const r = rollRarity(probs);
    return {
      kind: 'loot',
      name: NAMES[Math.floor(Math.random() * NAMES.length)],
      rarityId: r.id, rarityName: r.name, color: r.color,
      value: Math.round(r.min + Math.random() * (r.max - r.min)),
    };
  }
  function generateLoot() { return makeLoot(NORMAL_PROBS); }
  function generateEliteLoot() { return makeLoot(ELITE_PROBS); }

  function medkit() {
    return { kind: 'medkit', name: '血包', rarityId: 'common', rarityName: '普通', color: '#e04b4b', value: 50 };
  }

  function gold(value) {
    return { kind: 'gold', name: '金币', rarityId: 'common', rarityName: '普通', color: '#ffd23f', value: value || 100 };
  }

  // ================= 程序化图标 =================
  const texCache = new Map(), urlCache = new Map();

  function tierOf(id) { const i = RARITIES.findIndex(r => r.id === id); return i < 0 ? 0 : i; }
  function rarColor(id) { const r = RARITIES.find(x => x.id === id); return r ? r.color : '#e6e6e6'; }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function star4(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r * 0.28, y - r * 0.28);
    g.lineTo(x + r, y);
    g.lineTo(x + r * 0.28, y + r * 0.28);
    g.lineTo(x, y + r);
    g.lineTo(x - r * 0.28, y + r * 0.28);
    g.lineTo(x - r, y);
    g.lineTo(x - r * 0.28, y - r * 0.28);
    g.closePath();
    g.fill();
  }

  // —— 物品图形（x,y 为中心，s 为半尺寸）——
  function glyphPcb(g, x, y, s) {
    roundRect(g, x - s, y - s * 0.7, s * 2, s * 1.4, s * 0.18);
    g.fillStyle = '#1f7a3d'; g.fill();
    g.lineWidth = s * 0.1; g.strokeStyle = '#0e3f1f'; g.stroke();
    g.strokeStyle = '#6fe09a'; g.lineWidth = s * 0.08; g.lineCap = 'round';
    const L = [[-0.72, -0.36, 0.72, -0.36], [-0.72, 0.36, 0.72, 0.36], [-0.32, -0.58, -0.32, 0.58], [0.34, -0.58, 0.34, 0.58]];
    for (const [a, b, c, d] of L) { g.beginPath(); g.moveTo(x + a * s, y + b * s); g.lineTo(x + c * s, y + d * s); g.stroke(); }
    g.fillStyle = '#dff0ff';
    for (const [a, b] of [[-0.72, -0.36], [0.72, -0.36], [-0.72, 0.36], [0.72, 0.36], [-0.32, -0.58], [0.34, 0.58]]) {
      g.beginPath(); g.arc(x + a * s, y + b * s, s * 0.1, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#0a0a0d'; g.fillRect(x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44);
    g.fillStyle = '#6fe09a'; g.fillRect(x - s * 0.09, y - s * 0.09, s * 0.18, s * 0.18);
  }

  function glyphGpu(g, x, y, s) {
    roundRect(g, x - s, y - s * 0.62, s * 2, s * 1.24, s * 0.14);
    g.fillStyle = '#2a2f3a'; g.fill();
    g.lineWidth = s * 0.08; g.strokeStyle = '#0d1016'; g.stroke();
    const fx = x - s * 0.42, fy = y, fr = s * 0.4;
    g.fillStyle = '#0d0f13'; g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#39414f'; g.lineWidth = s * 0.06; g.stroke();
    g.strokeStyle = '#9aa5b5'; g.lineWidth = s * 0.06;
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(a) * fr * 0.82, fy + Math.sin(a) * fr * 0.82); g.stroke();
    }
    g.fillStyle = '#c4ccd6'; g.beginPath(); g.arc(fx, fy, fr * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3c4350';
    for (let i = 0; i < 3; i++) g.fillRect(x + s * 0.18 + i * s * 0.2, y - s * 0.42, s * 0.12, s * 0.5);
    g.fillStyle = '#e0b84b'; g.fillRect(x - s, y + s * 0.62 - s * 0.16, s * 2, s * 0.16);
  }

  function glyphHdd(g, x, y, s) {
    roundRect(g, x - s, y - s * 0.7, s * 2, s * 1.4, s * 0.16);
    g.fillStyle = '#8a929e'; g.fill();
    g.lineWidth = s * 0.08; g.strokeStyle = '#4a5058'; g.stroke();
    g.fillStyle = '#2b2f36'; g.beginPath(); g.arc(x, y, s * 0.42, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5c646e'; g.lineWidth = s * 0.05; g.stroke();
    g.strokeStyle = '#c4ccd6'; g.lineWidth = s * 0.06;
    g.beginPath(); g.arc(x, y, s * 0.42, -Math.PI * 0.7, -Math.PI * 0.1); g.stroke();
    g.strokeStyle = '#c4ccd6'; g.lineWidth = s * 0.1;
    g.beginPath(); g.moveTo(x + s * 0.75, y - s * 0.45); g.lineTo(x + s * 0.1, y - s * 0.05); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + s * 0.1, y - s * 0.05, s * 0.08, 0, Math.PI * 2); g.fill();
  }

  function glyphUsb(g, x, y, s) {
    roundRect(g, x - s * 0.55, y - s * 0.7, s * 1.1, s * 1.0, s * 0.16);
    g.fillStyle = '#1c7f8a'; g.fill();
    g.lineWidth = s * 0.07; g.strokeStyle = '#0d4a52'; g.stroke();
    g.fillStyle = '#cfeef2';
    g.beginPath(); g.moveTo(x, y - s * 0.42); g.lineTo(x + s * 0.26, y - s * 0.24); g.lineTo(x + s * 0.26, y + s * 0.05);
    g.lineTo(x, y + s * 0.24); g.lineTo(x - s * 0.26, y + s * 0.05); g.lineTo(x - s * 0.26, y - s * 0.24); g.closePath(); g.fill();
    g.fillStyle = '#1c7f8a'; g.fillRect(x - s * 0.09, y - s * 0.06, s * 0.18, s * 0.18);
    g.fillStyle = '#c4ccd6'; g.fillRect(x - s * 0.4, y + s * 0.28, s * 0.8, s * 0.32);
    g.fillStyle = '#1a1c20'; g.fillRect(x - s * 0.28, y + s * 0.36, s * 0.14, s * 0.14);
    g.fillRect(x + s * 0.14, y + s * 0.36, s * 0.14, s * 0.14);
  }

  function glyphMap(g, x, y, s) {
    g.fillStyle = '#e8d8b0';
    g.beginPath(); g.moveTo(x - s * 0.8, y - s * 0.55); g.lineTo(x + s * 0.3, y - s * 0.55); g.lineTo(x + s * 0.8, y - s * 0.1); g.lineTo(x + s * 0.8, y + s * 0.6); g.lineTo(x - s * 0.8, y + s * 0.6); g.closePath(); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#a88e5f'; g.stroke();
    g.strokeStyle = '#b89e70';
    g.beginPath(); g.moveTo(x - s * 0.8, y); g.lineTo(x + s * 0.8, y); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.55); g.lineTo(x - s * 0.3, y + s * 0.6); g.stroke();
    g.fillStyle = '#d9c493';
    g.beginPath(); g.moveTo(x + s * 0.3, y - s * 0.55); g.lineTo(x + s * 0.8, y - s * 0.1); g.lineTo(x + s * 0.3, y - s * 0.1); g.closePath(); g.fill();
    g.fillStyle = '#d64545';
    g.beginPath(); g.arc(x - s * 0.55, y - s * 0.25, s * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - s * 0.55, y - s * 0.25, s * 0.05, 0, Math.PI * 2); g.fill();
  }

  function glyphGoldBar(g, x, y, s) {
    g.fillStyle = '#e0b84b';
    g.beginPath(); g.moveTo(x - s * 0.75, y - s * 0.28); g.lineTo(x - s * 0.55, y - s * 0.5); g.lineTo(x + s * 0.55, y - s * 0.5); g.lineTo(x + s * 0.75, y - s * 0.28); g.lineTo(x + s * 0.55, y + s * 0.5); g.lineTo(x - s * 0.55, y + s * 0.5); g.closePath(); g.fill();
    g.lineWidth = s * 0.06; g.strokeStyle = '#8a6a1f'; g.stroke();
    g.fillStyle = '#f7d97a';
    g.beginPath(); g.moveTo(x - s * 0.55, y - s * 0.5); g.lineTo(x + s * 0.55, y - s * 0.5); g.lineTo(x + s * 0.75, y - s * 0.28); g.lineTo(x - s * 0.75, y - s * 0.28); g.closePath(); g.fill();
    g.strokeStyle = '#fff3c0'; g.lineWidth = s * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.05); g.lineTo(x + s * 0.5, y - s * 0.05); g.stroke();
  }

  function glyphWatch(g, x, y, s) {
    g.fillStyle = '#3a2f23'; g.fillRect(x - s * 0.34, y - s * 0.9, s * 0.68, s * 0.4);
    g.fillRect(x - s * 0.34, y + s * 0.5, s * 0.68, s * 0.4);
    g.fillStyle = '#e8e4da'; g.beginPath(); g.arc(x, y, s * 0.6, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.1; g.strokeStyle = '#b8a16a'; g.stroke();
    g.fillStyle = '#22252a'; g.beginPath(); g.arc(x, y, s * 0.44, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8e4da'; g.lineWidth = s * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.28); g.stroke();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.2, y + s * 0.08); g.stroke();
    g.fillStyle = '#e8e4da'; g.beginPath(); g.arc(x, y, s * 0.05, 0, Math.PI * 2); g.fill();
  }

  function glyphCash(g, x, y, s) {
    roundRect(g, x - s * 0.8, y - s * 0.55, s * 1.6, s * 1.1, s * 0.1);
    g.fillStyle = '#3f8f4f'; g.fill();
    g.lineWidth = s * 0.06; g.strokeStyle = '#1f5228'; g.stroke();
    g.strokeStyle = '#dff0e0'; g.lineWidth = s * 0.04;
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(x - s * 0.62, y + i * s * 0.16); g.lineTo(x + s * 0.62, y + i * s * 0.16); g.stroke();
    }
    g.fillStyle = '#e0b84b'; g.fillRect(x - s * 0.8, y - s * 0.14, s * 1.6, s * 0.28);
    g.strokeStyle = '#8a6a1f'; g.lineWidth = s * 0.03; g.strokeRect(x - s * 0.8, y - s * 0.14, s * 1.6, s * 0.28);
  }

  function glyphMedkit(g, x, y, s) {
    roundRect(g, x - s * 0.8, y - s * 0.7, s * 1.6, s * 1.4, s * 0.2);
    g.fillStyle = '#f2f4f6'; g.fill();
    g.lineWidth = s * 0.08; g.strokeStyle = '#aab0b6'; g.stroke();
    g.fillStyle = '#d64545';
    g.fillRect(x - s * 0.18, y - s * 0.5, s * 0.36, s * 1.0);
    g.fillRect(x - s * 0.5, y - s * 0.18, s * 1.0, s * 0.36);
  }

  function glyphCoin(g, x, y, s) {
    g.fillStyle = '#e0b84b'; g.beginPath(); g.arc(x, y, s * 0.72, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.06; g.strokeStyle = '#8a6a1f'; g.stroke();
    g.strokeStyle = '#f7d97a'; g.lineWidth = s * 0.05;
    g.beginPath(); g.arc(x, y, s * 0.5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8a6a1f'; g.font = 'bold ' + Math.round(s * 0.72) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', x, y + s * 0.02);
  }

  function glyphGem(g, x, y, s) {
    g.fillStyle = '#4bc0e0';
    g.beginPath(); g.moveTo(x, y - s * 0.8); g.lineTo(x + s * 0.7, y - s * 0.1); g.lineTo(x, y + s * 0.8); g.lineTo(x - s * 0.7, y - s * 0.1); g.closePath(); g.fill();
    g.lineWidth = s * 0.06; g.strokeStyle = '#1d6f8a'; g.stroke();
    g.strokeStyle = '#bfeeff'; g.lineWidth = s * 0.05;
    g.beginPath(); g.moveTo(x - s * 0.7, y - s * 0.1); g.lineTo(x, y - s * 0.8); g.lineTo(x + s * 0.7, y - s * 0.1); g.lineTo(x, y + s * 0.8); g.closePath(); g.stroke();
  }

  const GLYPHS = {
    '电路板': glyphPcb, '显卡': glyphGpu, '硬盘': glyphHdd, '加密U盘': glyphUsb,
    '作战地图情报': glyphMap, '金条': glyphGoldBar, '手表': glyphWatch, '现金捆': glyphCash,
  };

  function drawGlyph(g, item, cx, cy, s) {
    if (item.kind === 'medkit') return glyphMedkit(g, cx, cy, s);
    if (item.kind === 'gold') return glyphCoin(g, cx, cy, s);
    (GLYPHS[item.name] || glyphGem)(g, cx, cy, s);
  }

  function drawItemIcon(item, px) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d');
    const tier = tierOf(item.rarityId);
    const rcol = rarColor(item.rarityId);
    const m = px * 0.08, x = m, y = m, w = px - m * 2, h = px - m * 2, rad = px * 0.18;

    g.save();
    if (tier >= 1) { g.shadowColor = rcol; g.shadowBlur = px * (0.05 + tier * 0.04); }
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#2c2f38'); grad.addColorStop(1, '#14161c');
    roundRect(g, x, y, w, h, rad);
    g.fillStyle = grad; g.fill();
    g.restore();

    const lw = px * (0.018 + tier * 0.008);
    g.lineWidth = lw; g.strokeStyle = rcol;
    roundRect(g, x + lw / 2, y + lw / 2, w - lw, h - lw, rad - lw / 2);
    g.stroke();

    if (tier === 4) {
      g.fillStyle = '#fff7d6';
      const o = px * 0.1;
      for (const [sx, sy] of [[x + o, y + o], [x + w - o, y + o], [x + o, y + h - o], [x + w - o, y + h - o]]) star4(g, sx, sy, px * 0.05);
    }

    drawGlyph(g, item, px / 2, px / 2, px * 0.36);
    return cv;
  }

  function iconTexture(item) {
    const key = item.kind + '|' + item.name + '|' + item.rarityId;
    let t = texCache.get(key);
    if (!t) { t = new THREE.CanvasTexture(drawItemIcon(item, 128)); texCache.set(key, t); }
    return t;
  }

  function itemSprite(item, scale) {
    const mat = new THREE.SpriteMaterial({ map: iconTexture(item), transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  function itemIconURL(item, px) {
    px = px || 64;
    const key = item.kind + '|' + item.name + '|' + item.rarityId + '@' + px;
    let u = urlCache.get(key);
    if (!u) { u = drawItemIcon(item, px).toDataURL(); urlCache.set(key, u); }
    return u;
  }

  return { RARITIES, generateLoot, generateEliteLoot, medkit, gold, itemSprite, itemIconURL };
})();
