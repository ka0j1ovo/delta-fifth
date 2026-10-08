// 物品系统：6 档稀有度、固定档位物品池、随机战利品生成、程序化 Canvas 图标（越稀有越精细）
const ITEMS = (function () {
  // —— 6 档稀有度（白/绿/蓝/紫/金/红）——
  const RARITIES = [
    { id: 'common',    name: '常见', color: '#9aa0a8' },
    { id: 'uncommon',  name: '普通', color: '#4bd97a' },
    { id: 'rare',      name: '精良', color: '#4b9de0' },
    { id: 'epic',      name: '稀有', color: '#a95ce0' },
    { id: 'legendary', name: '史诗', color: '#e0b84b' },
    { id: 'mythic',    name: '传说', color: '#ff4545' },
  ];

  // 战利品稀有度概率（普通来源 / 精英来源 各一套）
  const NORMAL_PROBS = [0.30, 0.30, 0.30, 0.09, 0.008, 0.002];
  const ELITE_PROBS  = [0.10, 0.10, 0.20, 0.56, 0.03, 0.01];

  // 各档位默认价值区间（史诗/传说逐项覆盖）
  const TIER_RANGE = {
    common:   [10, 50],
    uncommon: [50, 100],
    rare:     [100, 250],
    epic:     [300, 500],
  };

  // ================= 图形辅助 =================
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
  function star5(g, x, y, r, rot) {
    rot = rot || -Math.PI / 2;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.42;
      const a = rot + i * Math.PI / 5;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  }

  // —— 扑克牌（A/2-10/J/Q/K 共用一个绘制，牌面可见字样）——
  const CARD_RED = '#d03232', CARD_BLACK = '#1c1c22';
  function cardGlyph(rank, suit, col) {
    return function (g, x, y, s) {
      roundRect(g, x - s * 0.62, y - s * 0.9, s * 1.24, s * 1.8, s * 0.12);
      g.fillStyle = '#f7f4ee'; g.fill();
      g.lineWidth = s * 0.06; g.strokeStyle = '#b9b2a6'; g.stroke();
      g.fillStyle = col;
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.font = 'bold ' + Math.round(s * 0.62) + 'px sans-serif';
      g.fillText(rank, x - s * 0.5, y - s * 0.82);
      g.font = Math.round(s * 0.46) + 'px sans-serif';
      g.fillText(suit, x - s * 0.48, y - s * 0.42);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = Math.round(s * 1.0) + 'px sans-serif';
      g.fillText(suit, x, y + s * 0.18);
    };
  }
  function jokerGlyph(col) {
    return function (g, x, y, s) {
      roundRect(g, x - s * 0.62, y - s * 0.9, s * 1.24, s * 1.8, s * 0.12);
      g.fillStyle = '#f7f4ee'; g.fill();
      g.lineWidth = s * 0.06; g.strokeStyle = '#b9b2a6'; g.stroke();
      g.fillStyle = col;
      star5(g, x, y - s * 0.12, s * 0.5, -Math.PI / 2);
      g.font = 'bold ' + Math.round(s * 0.32) + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('JOKER', x, y + s * 0.56);
    };
  }

  // ================= 各物品图标（x,y 为中心，s 为半尺寸）================

  // —— 常见 ——
  function glyphMatch(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(-0.4);
    g.fillStyle = '#e8c98a'; roundRect(g, -s * 0.08, -s * 0.7, s * 0.16, s * 1.0, s * 0.08); g.fill();
    g.fillStyle = '#c8322f'; g.beginPath(); g.arc(0, -s * 0.72, s * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2dca6'; roundRect(g, -s * 0.03, -s * 0.55, s * 0.05, s * 0.5, s * 0.02); g.fill();
    g.restore();
  }
  function glyphBattery(g, x, y, s) {
    g.fillStyle = '#2a2f3a'; roundRect(g, x - s * 0.3, y - s * 0.5, s * 0.6, s * 1.0, s * 0.1); g.fill();
    g.fillStyle = '#9aa5b5'; roundRect(g, x - s * 0.12, y - s * 0.62, s * 0.24, s * 0.16, s * 0.04); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(s * 0.3) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', x, y - s * 0.62);
    g.fillStyle = '#ffd23f'; g.fillRect(x - s * 0.3, y - s * 0.1, s * 0.6, s * 0.18);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x - s * 0.24, y - s * 0.5, s * 0.08, s * 0.95);
  }
  function glyphBook(g, x, y, s) {
    g.fillStyle = '#8a4b3a'; roundRect(g, x - s * 0.7, y - s * 0.8, s * 1.4, s * 1.6, s * 0.08); g.fill();
    g.fillStyle = '#5e3227'; g.fillRect(x - s * 0.7, y - s * 0.8, s * 0.18, s * 1.6);
    g.fillStyle = '#f0e6d2'; g.fillRect(x + s * 0.42, y - s * 0.72, s * 0.12, s * 1.44);
    g.fillStyle = '#e8d8b0'; g.font = 'bold ' + Math.round(s * 0.3) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('书', x + s * 0.05, y);
    g.fillStyle = '#c9a06a'; g.fillRect(x + s * 0.05, y + s * 0.3, s * 0.5, s * 0.07);
  }
  function glyphCoinSimple(g, x, y, s) {
    g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.08; g.strokeStyle = '#6d737b'; g.stroke();
    g.fillStyle = '#7a8088'; g.beginPath(); g.arc(x, y, s * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#cfd4da'; g.font = 'bold ' + Math.round(s * 0.4) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1', x, y + s * 0.02);
  }
  function glyphCup(g, x, y, s) {
    g.fillStyle = '#e8e4da'; g.beginPath(); g.moveTo(x - s * 0.4, y - s * 0.5); g.lineTo(x + s * 0.4, y - s * 0.5); g.lineTo(x + s * 0.3, y + s * 0.4); g.lineTo(x - s * 0.3, y + s * 0.4); g.closePath(); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#b8b2a6'; g.stroke();
    g.strokeStyle = '#e8e4da'; g.lineWidth = s * 0.14; g.beginPath(); g.arc(x + s * 0.42, y, s * 0.28, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.fillStyle = '#b8783a'; g.beginPath(); g.ellipse(x, y - s * 0.5, s * 0.36, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = s * 0.06; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s * 0.15, y - s * 0.75); g.quadraticCurveTo(x - s * 0.05, y - s * 0.95, x - s * 0.2, y - s * 1.05); g.stroke();
    g.beginPath(); g.moveTo(x + s * 0.12, y - s * 0.8); g.quadraticCurveTo(x + s * 0.05, y - s * 1.0, x + s * 0.18, y - s * 1.1); g.stroke();
  }

  // —— 普通 ——
  function glyphCola(g, x, y, s) {
    const grad = g.createLinearGradient(x - s * 0.3, 0, x + s * 0.3, 0);
    grad.addColorStop(0, '#c8322f'); grad.addColorStop(0.5, '#e04b3f'); grad.addColorStop(1, '#a02420');
    g.fillStyle = grad; roundRect(g, x - s * 0.3, y - s * 0.6, s * 0.6, s * 1.2, s * 0.08); g.fill();
    g.fillStyle = '#d8d8d8'; g.fillRect(x - s * 0.3, y - s * 0.6, s * 0.6, s * 0.14);
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(s * 0.4) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('可', x, y + s * 0.1);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x - s * 0.2, y - s * 0.5, s * 0.06, s * 1.0);
  }
  function glyphThermo(g, x, y, s) {
    g.fillStyle = '#f2f4f6'; roundRect(g, x - s * 0.12, y - s * 0.7, s * 0.24, s * 1.2, s * 0.12); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#c4ccd6'; g.stroke();
    g.fillStyle = '#d03232'; roundRect(g, x - s * 0.05, y - s * 0.1, s * 0.1, s * 0.55, s * 0.05); g.fill();
    g.fillStyle = '#d03232'; g.beginPath(); g.arc(x, y + s * 0.6, s * 0.22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c4ccd6'; g.lineWidth = s * 0.04; g.stroke();
    g.strokeStyle = '#9aa5b5'; g.lineWidth = s * 0.04;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + s * 0.12, y - s * 0.5 + i * s * 0.2); g.lineTo(x + s * 0.2, y - s * 0.5 + i * s * 0.2); g.stroke(); }
  }
  function glyphUsbSimple(g, x, y, s) {
    g.fillStyle = '#9aa5b5'; roundRect(g, x - s * 0.14, y - s * 0.55, s * 0.28, s * 0.5, s * 0.04); g.fill();
    g.fillStyle = '#6d737b'; g.fillRect(x - s * 0.1, y - s * 0.55, s * 0.06, s * 0.5); g.fillRect(x + s * 0.04, y - s * 0.55, s * 0.06, s * 0.5);
    g.fillStyle = '#2a6fb8'; roundRect(g, x - s * 0.2, y - s * 0.05, s * 0.4, s * 0.7, s * 0.08); g.fill();
    g.fillStyle = '#1d5290'; g.fillRect(x - s * 0.2, y + s * 0.35, s * 0.4, s * 0.3);
    g.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(g, x - s * 0.14, y + s * 0.02, s * 0.08, s * 0.5, s * 0.03); g.fill();
  }
  function glyphOutlet(g, x, y, s) {
    g.fillStyle = '#e8e4da'; roundRect(g, x - s * 0.5, y - s * 0.5, s * 1.0, s * 1.0, s * 0.14); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#b8b2a6'; g.stroke();
    for (const dx of [-0.16, 0.16]) {
      g.fillStyle = '#3a3f46';
      g.beginPath(); g.arc(x + dx * s, y - s * 0.12, s * 0.07, 0, Math.PI * 2); g.fill();
      g.fillRect(x + dx * s - s * 0.06, y - s * 0.12, s * 0.12, s * 0.2);
      g.fillRect(x + dx * s - s * 0.06, y, s * 0.12, s * 0.14);
    }
  }
  function glyphApple(g, x, y, s) {
    g.fillStyle = '#d03232';
    g.beginPath(); g.arc(x - s * 0.28, y, s * 0.4, Math.PI * 0.4, Math.PI * 1.6); g.arc(x + s * 0.28, y, s * 0.4, -Math.PI * 0.4, Math.PI * 0.6); g.closePath(); g.fill();
    g.fillStyle = '#8a1f1f'; g.beginPath(); g.arc(x, y - s * 0.35, s * 0.12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6b4a2a'; g.lineWidth = s * 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - s * 0.5); g.quadraticCurveTo(x + s * 0.1, y - s * 0.8, x - s * 0.02, y - s * 0.9); g.stroke();
    g.fillStyle = '#3f9b4f'; g.beginPath(); g.ellipse(x + s * 0.22, y - s * 0.72, s * 0.2, s * 0.08, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x - s * 0.35, y - s * 0.05, s * 0.08, s * 0.16, -0.3, 0, Math.PI * 2); g.fill();
  }

  // —— 精良 ——
  function glyphFlashlight(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(-0.5);
    g.fillStyle = '#3a3f46'; roundRect(g, -s * 0.15, -s * 0.35, s * 0.34, s * 0.7, s * 0.06); g.fill();
    const lg = g.createLinearGradient(s * 0.2, 0, s * 0.9, 0); lg.addColorStop(0, 'rgba(255,240,160,0.9)'); lg.addColorStop(1, 'rgba(255,240,160,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(s * 0.18, -s * 0.3); g.lineTo(s * 0.9, 0); g.lineTo(s * 0.18, s * 0.3); g.closePath(); g.fill();
    g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(s * 0.16, 0, s * 0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#55606e'; roundRect(g, -s * 0.7, -s * 0.24, s * 0.56, s * 0.48, s * 0.08); g.fill();
    g.fillStyle = '#2a2f3a'; roundRect(g, -s * 0.82, -s * 0.2, s * 0.12, s * 0.4, s * 0.04); g.fill();
    g.restore();
  }
  function glyphRecorder(g, x, y, s) {
    g.fillStyle = '#2a2f3a'; roundRect(g, x - s * 0.18, y - s * 0.6, s * 0.36, s * 1.2, s * 0.08); g.fill();
    g.fillStyle = '#9fd6ff'; roundRect(g, x - s * 0.12, y - s * 0.4, s * 0.24, s * 0.4, s * 0.04); g.fill();
    g.fillStyle = '#e8e4da'; for (const dy of [-0.62, -0.52]) { g.beginPath(); g.arc(x, y + dy * s, s * 0.05, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#d03232'; g.beginPath(); g.arc(x, y + s * 0.5, s * 0.1, 0, Math.PI * 2); g.fill();
  }
  function glyphLamp(g, x, y, s) {
    g.fillStyle = '#e0b84b'; g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.4); g.lineTo(x + s * 0.5, y - s * 0.4); g.lineTo(x + s * 0.25, y); g.lineTo(x - s * 0.25, y); g.closePath(); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#8a6a1f'; g.stroke();
    g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(x, y + s * 0.12, s * 0.14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#55606e'; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(x - s * 0.15, y); g.lineTo(x - s * 0.15, y + s * 0.7); g.lineTo(x + s * 0.4, y + s * 0.7); g.stroke();
    g.fillStyle = '#3a3f46'; roundRect(g, x + s * 0.2, y + s * 0.68, s * 0.4, s * 0.12, s * 0.04); g.fill();
  }
  function glyphLantern(g, x, y, s) {
    g.strokeStyle = '#8a6a1f'; g.lineWidth = s * 0.07; g.beginPath(); g.arc(x, y - s * 0.55, s * 0.2, Math.PI, 0); g.stroke();
    g.fillStyle = '#55606e'; roundRect(g, x - s * 0.25, y - s * 0.55, s * 0.5, s * 0.12, s * 0.04); g.fill();
    g.fillStyle = 'rgba(255,220,130,0.85)'; roundRect(g, x - s * 0.3, y - s * 0.45, s * 0.6, s * 0.7, s * 0.1); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#8a6a1f'; g.stroke();
    g.fillStyle = '#ff8a3a'; g.beginPath(); g.ellipse(x, y - s * 0.05, s * 0.1, s * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffe08a'; g.beginPath(); g.ellipse(x, y - s * 0.1, s * 0.05, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#55606e'; roundRect(g, x - s * 0.25, y + s * 0.28, s * 0.5, s * 0.1, s * 0.04); g.fill();
  }
  function glyphDagger(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(0.5);
    const bg = g.createLinearGradient(-s * 0.2, 0, s * 0.4, 0); bg.addColorStop(0, '#eef2f6'); bg.addColorStop(1, '#9aa5b5');
    g.fillStyle = bg; g.beginPath(); g.moveTo(-s * 0.5, -s * 0.12); g.lineTo(s * 0.5, 0); g.lineTo(-s * 0.5, s * 0.12); g.closePath(); g.fill();
    g.strokeStyle = '#8a929e'; g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(-s * 0.35, 0); g.lineTo(s * 0.25, 0); g.stroke();
    g.fillStyle = '#6b4a2a'; roundRect(g, -s * 0.5, -s * 0.3, s * 0.12, s * 0.6, s * 0.03); g.fill();
    g.fillStyle = '#3a2f23'; roundRect(g, -s * 0.75, -s * 0.16, s * 0.25, s * 0.32, s * 0.05); g.fill();
    g.strokeStyle = '#5a4632'; g.lineWidth = s * 0.03; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.72 + i * s * 0.07, -s * 0.16); g.lineTo(-s * 0.64 + i * s * 0.07, s * 0.16); g.stroke(); }
    g.restore();
  }
  function glyphMachete(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(-0.15);
    g.fillStyle = '#c9d2dc'; g.beginPath(); g.moveTo(-s * 0.5, s * 0.1); g.quadraticCurveTo(-s * 0.1, -s * 0.45, s * 0.55, -s * 0.15); g.lineTo(s * 0.5, s * 0.05); g.quadraticCurveTo(0, 0, -s * 0.5, s * 0.3); g.closePath(); g.fill();
    g.strokeStyle = '#7a838e'; g.lineWidth = s * 0.04; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(-s * 0.45, 0); g.quadraticCurveTo(-s * 0.1, -s * 0.35, s * 0.45, -s * 0.1); g.stroke();
    g.fillStyle = '#6b4a2a'; roundRect(g, -s * 0.75, 0, s * 0.3, s * 0.22, s * 0.05); g.fill();
    g.restore();
  }
  function glyphCam(g, x, y, s) {
    g.strokeStyle = '#55606e'; g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(x, y + s * 0.5); g.lineTo(x, y + s * 0.1); g.stroke();
    g.fillStyle = '#3a3f46'; roundRect(g, x - s * 0.35, y + s * 0.5, s * 0.7, s * 0.1, s * 0.04); g.fill();
    g.fillStyle = '#e8e4da'; roundRect(g, x - s * 0.45, y - s * 0.25, s * 0.9, s * 0.5, s * 0.12); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#b8b2a6'; g.stroke();
    g.fillStyle = '#1a1c20'; g.beginPath(); g.arc(x, y, s * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a4a6b'; g.beginPath(); g.arc(x, y, s * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x - s * 0.04, y - s * 0.04, s * 0.04, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d03232'; g.beginPath(); g.arc(x + s * 0.32, y - s * 0.15, s * 0.05, 0, Math.PI * 2); g.fill();
  }
  function glyphButterfly(g, x, y, s) {
    const lg = g.createLinearGradient(x - s * 0.6, y, x, y); lg.addColorStop(0, '#4b9de0'); lg.addColorStop(1, '#2a6fb8');
    g.fillStyle = lg; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - s * 0.5, y - s * 0.6, x - s * 0.45, y - s * 0.1); g.quadraticCurveTo(x - s * 0.35, y + s * 0.4, x, y + s * 0.05); g.closePath(); g.fill();
    const rg = g.createLinearGradient(x, y, x + s * 0.6, y); rg.addColorStop(0, '#4b9de0'); rg.addColorStop(1, '#2a6fb8');
    g.fillStyle = rg; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.5, y - s * 0.6, x + s * 0.45, y - s * 0.1); g.quadraticCurveTo(x + s * 0.35, y + s * 0.4, x, y + s * 0.05); g.closePath(); g.fill();
    g.fillStyle = '#3a2f23'; g.beginPath(); g.ellipse(x, y, s * 0.06, s * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2f23'; g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(x, y - s * 0.28); g.quadraticCurveTo(x - s * 0.1, y - s * 0.5, x - s * 0.2, y - s * 0.55); g.moveTo(x, y - s * 0.28); g.quadraticCurveTo(x + s * 0.1, y - s * 0.5, x + s * 0.2, y - s * 0.55); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - s * 0.3, y - s * 0.1, s * 0.06, 0, Math.PI * 2); g.arc(x + s * 0.3, y - s * 0.1, s * 0.06, 0, Math.PI * 2); g.fill();
  }

  // —— 稀有 ——
  function glyphCan(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.35, 0, x + s * 0.35, 0); bg.addColorStop(0, '#9aa5b5'); bg.addColorStop(0.5, '#c9d2dc'); bg.addColorStop(1, '#7a838e');
    g.fillStyle = bg; roundRect(g, x - s * 0.35, y - s * 0.3, s * 0.7, s * 0.6, s * 0.06); g.fill();
    g.fillStyle = '#cfd6dd'; g.beginPath(); g.ellipse(x, y - s * 0.3, s * 0.35, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a929e'; g.lineWidth = s * 0.04; g.stroke();
    g.strokeStyle = '#6d737b'; g.lineWidth = s * 0.05; g.beginPath(); g.ellipse(x, y - s * 0.3, s * 0.1, s * 0.04, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2a6fb8'; g.fillRect(x - s * 0.35, y - s * 0.05, s * 0.7, s * 0.28);
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(s * 0.18) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('海鲜', x, y + s * 0.1);
    g.fillStyle = '#ffe08a'; g.beginPath(); g.ellipse(x, y - s * 0.02, s * 0.14, s * 0.06, 0, 0, Math.PI * 2); g.fill();
  }
  function glyphGoggles(g, x, y, s) {
    for (const dx of [-0.28, 0.28]) {
      g.fillStyle = '#8fd0e8'; g.beginPath(); g.arc(x + dx * s, y, s * 0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a2f23'; g.lineWidth = s * 0.07; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x + dx * s - s * 0.1, y - s * 0.1, s * 0.08, s * 0.12, -0.6, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#3a2f23'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(x - s * 0.02, y); g.quadraticCurveTo(x, y + s * 0.15, x + s * 0.02, y); g.stroke();
    g.strokeStyle = '#3a2f23'; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(x - s * 0.58, y - s * 0.05); g.lineTo(x - s * 0.75, y - s * 0.3); g.moveTo(x + s * 0.58, y - s * 0.05); g.lineTo(x + s * 0.75, y - s * 0.3); g.stroke();
  }
  function glyphSyringe(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(-0.4);
    g.fillStyle = '#9aa5b5'; roundRect(g, -s * 0.02, -s * 0.06, s * 0.5, s * 0.12, s * 0.03); g.fill();
    g.fillStyle = '#d0d7de'; g.beginPath(); g.moveTo(s * 0.48, -s * 0.04); g.lineTo(s * 0.62, 0); g.lineTo(s * 0.48, s * 0.04); g.closePath(); g.fill();
    const bg = g.createLinearGradient(-s * 0.2, 0, s * 0.2, 0); bg.addColorStop(0, '#eef4f8'); bg.addColorStop(1, '#b8c8d4');
    g.fillStyle = bg; roundRect(g, -s * 0.35, -s * 0.16, s * 0.4, s * 0.32, s * 0.06); g.fill();
    g.fillStyle = '#7fd4a0'; roundRect(g, -s * 0.3, -s * 0.1, s * 0.2, s * 0.2, s * 0.04); g.fill();
    g.fillStyle = '#55606e'; roundRect(g, -s * 0.75, -s * 0.08, s * 0.4, s * 0.16, s * 0.04); g.fill();
    g.strokeStyle = '#8a929e'; g.lineWidth = s * 0.025; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.3 + i * s * 0.12, -s * 0.16); g.lineTo(-s * 0.3 + i * s * 0.12, -s * 0.06); g.stroke(); }
    g.restore();
  }
  function glyphSight(g, x, y, s) {
    g.fillStyle = '#2a2f3a'; roundRect(g, x - s * 0.55, y - s * 0.2, s * 1.1, s * 0.4, s * 0.1); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#14171c'; g.stroke();
    g.fillStyle = '#d03232'; g.beginPath(); g.arc(x + s * 0.35, y, s * 0.16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#14171c'; g.lineWidth = s * 0.06; g.stroke();
    g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(x + s * 0.35, y, s * 0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.2)'; roundRect(g, x - s * 0.5, y - s * 0.14, s * 0.9, s * 0.08, s * 0.03); g.fill();
    g.fillStyle = '#55606e'; g.beginPath(); g.arc(x - s * 0.05, y + s * 0.22, s * 0.08, 0, Math.PI * 2); g.fill();
  }
  function glyphGrip(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(0.6);
    g.fillStyle = '#2a2f3a'; roundRect(g, -s * 0.2, -s * 0.5, s * 0.4, s * 1.0, s * 0.1); g.fill();
    g.strokeStyle = '#14171c'; g.lineWidth = s * 0.05; for (let i = 0; i < 4; i++) { const yy = -s * 0.38 + i * s * 0.22; g.beginPath(); g.moveTo(-s * 0.16, yy); g.lineTo(s * 0.16, yy); g.stroke(); }
    g.fillStyle = '#55606e'; roundRect(g, -s * 0.14, -s * 0.65, s * 0.28, s * 0.16, s * 0.03); g.fill();
    g.restore();
  }
  function glyphBarrel(g, x, y, s) {
    g.save(); g.translate(x, y); g.rotate(-0.1);
    const bg = g.createLinearGradient(0, -s * 0.16, 0, s * 0.16); bg.addColorStop(0, '#3a3f46'); bg.addColorStop(0.5, '#14171c'); bg.addColorStop(1, '#2a2f3a');
    g.fillStyle = bg; roundRect(g, -s * 0.7, -s * 0.14, s * 1.4, s * 0.28, s * 0.08); g.fill();
    g.fillStyle = '#0a0c10'; g.beginPath(); g.arc(x + s * 0.7, y, s * 0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#14171c'; g.beginPath(); g.arc(x + s * 0.7, y, s * 0.05, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#55606e'; g.lineWidth = s * 0.04; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - s * 0.3 + i * s * 0.24, -s * 0.14); g.lineTo(x - s * 0.3 + i * s * 0.24, s * 0.14); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x - s * 0.68, y - s * 0.14, s * 1.36, s * 0.05);
    g.restore();
  }
  function glyphEgg(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.3, y, x + s * 0.3, y); bg.addColorStop(0, '#d8d2c0'); bg.addColorStop(1, '#a89f88');
    g.fillStyle = bg; g.beginPath(); g.ellipse(x, y, s * 0.42, s * 0.55, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#8a8270'; g.stroke();
    g.fillStyle = 'rgba(90,80,60,0.4)';
    g.beginPath(); g.arc(x - s * 0.15, y - s * 0.15, s * 0.07, 0, Math.PI * 2); g.arc(x + s * 0.2, y - s * 0.05, s * 0.06, 0, Math.PI * 2); g.arc(x - s * 0.05, y + s * 0.3, s * 0.08, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.25, s * 0.1, s * 0.16, -0.5, 0, Math.PI * 2); g.fill();
  }

  // —— 史诗（细节、立体感）——
  function glyphCamera(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.55, y, x + s * 0.55, y); bg.addColorStop(0, '#2a2f3a'); bg.addColorStop(0.5, '#4a525e'); bg.addColorStop(1, '#2a2f3a');
    g.fillStyle = bg; roundRect(g, x - s * 0.55, y - s * 0.3, s * 1.1, s * 0.6, s * 0.1); g.fill();
    g.fillStyle = '#3a3f46'; roundRect(g, x - s * 0.2, y - s * 0.42, s * 0.4, s * 0.16, s * 0.05); g.fill();
    g.fillStyle = '#0d0f13'; g.beginPath(); g.arc(x, y, s * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1c22'; g.beginPath(); g.arc(x, y, s * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a3a55'; g.beginPath(); g.arc(x, y, s * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - s * 0.05, y - s * 0.05, s * 0.04, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.arc(x + s * 0.08, y + s * 0.06, s * 0.02, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8e4da'; roundRect(g, x - s * 0.5, y - s * 0.2, s * 0.18, s * 0.14, s * 0.04); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(g, x - s * 0.5, y - s * 0.28, s * 1.0, s * 0.06, s * 0.03); g.fill();
  }
  function glyphDrone(g, x, y, s) {
    g.strokeStyle = '#3a3f46'; g.lineWidth = s * 0.14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.6); g.lineTo(x + s * 0.6, y + s * 0.6); g.moveTo(x + s * 0.6, y - s * 0.6); g.lineTo(x - s * 0.6, y + s * 0.6); g.stroke();
    const bg = g.createLinearGradient(x, y - s * 0.25, x, y + s * 0.25); bg.addColorStop(0, '#e8e4da'); bg.addColorStop(1, '#9aa5b5');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#6d737b'; g.stroke();
    g.fillStyle = '#1a1c20'; g.beginPath(); g.arc(x, y + s * 0.06, s * 0.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a4a6b'; g.beginPath(); g.arc(x, y + s * 0.06, s * 0.07, 0, Math.PI * 2); g.fill();
    for (const [rx, ry] of [[-0.6, -0.6], [-0.6, 0.6], [0.6, -0.6], [0.6, 0.6]]) {
      g.fillStyle = 'rgba(120,130,145,0.6)'; g.beginPath(); g.ellipse(x + rx * s, y + ry * s, s * 0.16, s * 0.05, rx > 0 ? 0.6 : -0.6, 0, Math.PI * 2); g.fill();
    }
  }
  function glyphChampagne(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.22, 0, x + s * 0.22, 0); bg.addColorStop(0, '#1f4d33'); bg.addColorStop(0.5, '#2e7a4f'); bg.addColorStop(1, '#163824');
    g.fillStyle = bg; roundRect(g, x - s * 0.22, y - s * 0.1, s * 0.44, s * 0.6, s * 0.06); g.fill();
    g.fillStyle = '#2e7a4f'; roundRect(g, x - s * 0.1, y - s * 0.55, s * 0.2, s * 0.5, s * 0.04); g.fill();
    g.fillStyle = '#e0b84b'; roundRect(g, x - s * 0.12, y - s * 0.62, s * 0.24, s * 0.12, s * 0.03); g.fill();
    g.fillStyle = '#e8c86a'; g.fillRect(x - s * 0.18, y + s * 0.15, s * 0.36, s * 0.32);
    g.fillStyle = '#f2e6c8'; roundRect(g, x - s * 0.16, y - s * 0.05, s * 0.32, s * 0.28, s * 0.03); g.fill();
    g.fillStyle = '#b89e50'; g.font = 'bold ' + Math.round(s * 0.16) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('香槟', x, y + s * 0.1);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x - s * 0.16, y - s * 0.08, s * 0.06, s * 0.5);
  }
  function glyphMedal(g, x, y, s) {
    g.fillStyle = '#c8322f'; g.beginPath(); g.moveTo(x - s * 0.18, y - s * 0.7); g.lineTo(x - s * 0.4, y - s * 0.15); g.lineTo(x - s * 0.15, y - s * 0.15); g.closePath(); g.fill();
    g.fillStyle = '#8a1f1f'; g.beginPath(); g.moveTo(x + s * 0.18, y - s * 0.7); g.lineTo(x + s * 0.4, y - s * 0.15); g.lineTo(x + s * 0.15, y - s * 0.15); g.closePath(); g.fill();
    const bg = g.createRadialGradient(x - s * 0.05, y - s * 0.05, s * 0.05, x, y, s * 0.45);
    bg.addColorStop(0, '#ffe9a8'); bg.addColorStop(0.7, '#e0b84b'); bg.addColorStop(1, '#a67c1f');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a6a1f'; g.lineWidth = s * 0.06; g.stroke();
    g.fillStyle = '#fff3c0'; star5(g, x, y, s * 0.24, -Math.PI / 2);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(x - s * 0.14, y - s * 0.2, s * 0.1, s * 0.05, -0.6, 0, Math.PI * 2); g.fill();
  }
  function glyphPhone(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.3, 0, x + s * 0.3, 0); bg.addColorStop(0, '#14171c'); bg.addColorStop(0.5, '#3a3f46'); bg.addColorStop(1, '#14171c');
    g.fillStyle = bg; roundRect(g, x - s * 0.3, y - s * 0.55, s * 0.6, s * 1.1, s * 0.12); g.fill();
    const sg = g.createLinearGradient(x, y - s * 0.45, x, y + s * 0.45); sg.addColorStop(0, '#3a7fd4'); sg.addColorStop(1, '#1d4f8a');
    g.fillStyle = sg; roundRect(g, x - s * 0.24, y - s * 0.47, s * 0.48, s * 0.94, s * 0.08); g.fill();
    const cols = ['#4bd97a', '#e0b84b', '#d03232'];
    for (let i = 0; i < 3; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(x - s * 0.12 + i * s * 0.1, y - s * 0.18, s * 0.04, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.85)'; roundRect(g, x - s * 0.16, y + s * 0.05, s * 0.32, s * 0.06, s * 0.03); g.fill();
    g.fillStyle = '#0d0f13'; roundRect(g, x - s * 0.08, y - s * 0.5, s * 0.16, s * 0.05, s * 0.02); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(x - s * 0.2, y - s * 0.45); g.lineTo(x - s * 0.05, y - s * 0.45); g.lineTo(x - s * 0.2, y + s * 0.1); g.closePath(); g.fill();
  }
  function glyphCpu(g, x, y, s) {
    g.fillStyle = '#1f7a3d'; roundRect(g, x - s * 0.5, y - s * 0.5, s * 1.0, s * 1.0, s * 0.08); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#0e3f1f'; g.stroke();
    g.fillStyle = '#2a2f3a'; roundRect(g, x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44, s * 0.06); g.fill();
    g.strokeStyle = '#6fe09a'; g.lineWidth = s * 0.04; g.stroke();
    g.fillStyle = '#6fe09a'; g.font = 'bold ' + Math.round(s * 0.2) + 'px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CPU', x, y);
    g.strokeStyle = '#e0b84b'; g.lineWidth = s * 0.04;
    for (let i = 0; i < 5; i++) { const p = -s * 0.4 + i * s * 0.2;
      g.beginPath(); g.moveTo(x + p, y - s * 0.5); g.lineTo(x + p, y - s * 0.66); g.stroke();
      g.beginPath(); g.moveTo(x + p, y + s * 0.5); g.lineTo(x + p, y + s * 0.66); g.stroke();
      g.beginPath(); g.moveTo(x - s * 0.5, y + p); g.lineTo(x - s * 0.66, y + p); g.stroke();
      g.beginPath(); g.moveTo(x + s * 0.5, y + p); g.lineTo(x + s * 0.66, y + p); g.stroke();
    }
  }
  function glyphSilverBar(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.4, 0, x + s * 0.4, 0); bg.addColorStop(0, '#c9d2dc'); bg.addColorStop(0.4, '#f2f5f8'); bg.addColorStop(0.6, '#e8edf2'); bg.addColorStop(1, '#9aa5b5');
    g.fillStyle = bg; g.beginPath(); g.moveTo(x - s * 0.4, y - s * 0.25); g.lineTo(x - s * 0.28, y - s * 0.42); g.lineTo(x + s * 0.28, y - s * 0.42); g.lineTo(x + s * 0.4, y - s * 0.25); g.lineTo(x + s * 0.4, y + s * 0.25); g.lineTo(x + s * 0.28, y + s * 0.42); g.lineTo(x - s * 0.28, y + s * 0.42); g.lineTo(x - s * 0.4, y + s * 0.25); g.closePath(); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#8a929e'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(x - s * 0.28, y - s * 0.42); g.lineTo(x + s * 0.28, y - s * 0.42); g.lineTo(x + s * 0.4, y - s * 0.25); g.lineTo(x - s * 0.4, y - s * 0.25); g.closePath(); g.fill();
    g.fillStyle = '#8a929e'; g.font = 'bold ' + Math.round(s * 0.16) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Ag 999', x, y + s * 0.02);
  }
  function glyphSilverCoin(g, x, y, s) {
    const bg = g.createRadialGradient(x - s * 0.1, y - s * 0.1, s * 0.05, x, y, s * 0.55);
    bg.addColorStop(0, '#f2f5f8'); bg.addColorStop(0.6, '#c9d2dc'); bg.addColorStop(1, '#8a929e');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.52, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#6d737b'; g.stroke();
    g.strokeStyle = '#9aa5b5'; g.lineWidth = s * 0.04; g.beginPath(); g.arc(x, y, s * 0.38, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8a929e'; g.font = 'bold ' + Math.round(s * 0.28) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', x, y + s * 0.02);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.22, s * 0.08, s * 0.14, -0.5, 0, Math.PI * 2); g.fill();
  }

  // —— 传说（最精细：反光、立体感）——
  function glyphDiamond(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.35, y - s * 0.35, x + s * 0.3, y + s * 0.35);
    bg.addColorStop(0, '#dff0ff'); bg.addColorStop(0.5, '#7fd0f0'); bg.addColorStop(1, '#3a8fc0');
    g.fillStyle = bg; g.beginPath(); g.moveTo(x, y - s * 0.6); g.lineTo(x + s * 0.42, y - s * 0.1); g.lineTo(x, y + s * 0.55); g.lineTo(x - s * 0.42, y - s * 0.1); g.closePath(); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#2a6fb8'; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = s * 0.03;
    g.beginPath(); g.moveTo(x, y - s * 0.6); g.lineTo(x, y + s * 0.55); g.moveTo(x - s * 0.42, y - s * 0.1); g.lineTo(x + s * 0.42, y - s * 0.1); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.21, y - s * 0.35); g.lineTo(x + s * 0.21, y - s * 0.35); g.lineTo(x, y + s * 0.55); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(x - s * 0.05, y - s * 0.5); g.lineTo(x + s * 0.08, y - s * 0.42); g.lineTo(x - s * 0.08, y - s * 0.25); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = s * 0.04; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s * 0.55, y - s * 0.4); g.lineTo(x - s * 0.7, y - s * 0.5); g.moveTo(x + s * 0.55, y - s * 0.25); g.lineTo(x + s * 0.7, y - s * 0.3); g.stroke();
  }
  function glyphPearl(g, x, y, s) {
    const bg = g.createRadialGradient(x - s * 0.12, y - s * 0.12, s * 0.03, x, y, s * 0.5);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#f2e8e0'); bg.addColorStop(0.8, '#d8c8c0'); bg.addColorStop(1, '#b8a8a0');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.45, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(x - s * 0.16, y - s * 0.2, s * 0.12, s * 0.2, -0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,200,220,0.4)'; g.beginPath(); g.ellipse(x + s * 0.14, y + s * 0.16, s * 0.12, s * 0.1, 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e0b84b'; g.beginPath(); g.ellipse(x, y + s * 0.5, s * 0.3, s * 0.12, 0, 0, Math.PI); g.fill();
  }
  function glyphComputer(g, x, y, s) {
    g.fillStyle = '#14171c'; roundRect(g, x - s * 0.5, y - s * 0.5, s * 1.0, s * 0.62, s * 0.06); g.fill();
    const sg = g.createLinearGradient(x, y - s * 0.4, x, y); sg.addColorStop(0, '#3a7fd4'); sg.addColorStop(1, '#1d4f8a');
    g.fillStyle = sg; roundRect(g, x - s * 0.44, y - s * 0.44, s * 0.88, s * 0.5, s * 0.04); g.fill();
    g.fillStyle = '#4bd97a';
    g.fillRect(x - s * 0.34, y - s * 0.1, s * 0.1, s * 0.2);
    g.fillRect(x - s * 0.18, y - s * 0.25, s * 0.1, s * 0.35);
    g.fillRect(x - s * 0.02, y - s * 0.2, s * 0.1, s * 0.3);
    g.fillRect(x + s * 0.14, y - s * 0.3, s * 0.1, s * 0.4);
    g.fillStyle = '#3a3f46'; g.fillRect(x - s * 0.06, y + s * 0.12, s * 0.12, s * 0.16);
    g.fillStyle = '#2a2f3a'; roundRect(g, x - s * 0.22, y + s * 0.28, s * 0.44, s * 0.1, s * 0.04); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x - s * 0.44, y - s * 0.44); g.lineTo(x - s * 0.1, y - s * 0.44); g.lineTo(x - s * 0.44, y + s * 0.06); g.closePath(); g.fill();
  }
  function glyphGpu2(g, x, y, s) {
    g.fillStyle = '#2a2f3a'; roundRect(g, x - s * 0.55, y - s * 0.28, s * 1.1, s * 0.56, s * 0.08); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#0d1016'; g.stroke();
    for (const dx of [-0.3, 0.15]) {
      g.fillStyle = '#0d0f13'; g.beginPath(); g.arc(x + dx * s, y, s * 0.18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#55606e'; g.lineWidth = s * 0.05; g.stroke();
      g.fillStyle = '#9aa5b5'; for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; g.beginPath(); g.moveTo(x + dx * s, y); g.arc(x + dx * s, y, s * 0.14, a, a + 0.6); g.closePath(); g.fill(); }
      g.fillStyle = '#0d0f13'; g.beginPath(); g.arc(x + dx * s, y, s * 0.04, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#e0b84b'; g.fillRect(x - s * 0.2, y + s * 0.28, s * 0.4, s * 0.1);
    g.fillStyle = '#14171c'; roundRect(g, x + s * 0.42, y - s * 0.06, s * 0.1, s * 0.16, s * 0.03); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - s * 0.5, y - s * 0.24, s * 1.0, s * 0.05);
  }
  function glyphTank(g, x, y, s) {
    g.fillStyle = '#3a3f46'; roundRect(g, x - s * 0.6, y - s * 0.05, s * 1.2, s * 0.4, s * 0.15); g.fill();
    g.fillStyle = '#1a1c20'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(x + i * s * 0.2, y + s * 0.15, s * 0.1, 0, Math.PI * 2); g.fill(); }
    const bg = g.createLinearGradient(x, y - s * 0.4, x, y); bg.addColorStop(0, '#7a8a5a'); bg.addColorStop(1, '#4a5535');
    g.fillStyle = bg; g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.05); g.lineTo(x - s * 0.4, y - s * 0.3); g.lineTo(x + s * 0.4, y - s * 0.3); g.lineTo(x + s * 0.5, y - s * 0.05); g.closePath(); g.fill();
    g.fillStyle = '#5a6a44'; g.beginPath(); g.arc(x, y - s * 0.3, s * 0.2, Math.PI, 0); g.fill();
    g.strokeStyle = '#3a4530'; g.lineWidth = s * 0.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - s * 0.3); g.lineTo(x + s * 0.6, y - s * 0.38); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(x - s * 0.35, y - s * 0.28); g.lineTo(x - s * 0.05, y - s * 0.28); g.lineTo(x - s * 0.2, y - s * 0.05); g.closePath(); g.fill();
  }
  function glyphStatue(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.3, 0, x + s * 0.3, 0); bg.addColorStop(0, '#9aa5b5'); bg.addColorStop(0.5, '#c9d2dc'); bg.addColorStop(1, '#7a838e');
    g.fillStyle = bg;
    g.beginPath(); g.arc(x, y - s * 0.25, s * 0.28, Math.PI * 0.15, Math.PI * 0.85); g.closePath(); g.fill();
    g.fillRect(x - s * 0.28, y - s * 0.28, s * 0.56, s * 0.08);
    g.beginPath(); g.moveTo(x - s * 0.35, y - s * 0.15); g.lineTo(x + s * 0.35, y - s * 0.15); g.lineTo(x + s * 0.42, y + s * 0.5); g.lineTo(x - s * 0.42, y + s * 0.5); g.closePath(); g.fill();
    g.fillStyle = '#5a6570'; g.beginPath(); g.ellipse(x - s * 0.12, y - s * 0.28, s * 0.07, s * 0.1, 0, 0, Math.PI * 2); g.ellipse(x + s * 0.12, y - s * 0.28, s * 0.07, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a6570'; g.beginPath(); g.moveTo(x, y - s * 0.22); g.lineTo(x - s * 0.08, y - s * 0.05); g.lineTo(x + s * 0.08, y - s * 0.05); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x - s * 0.2, y - s * 0.4); g.lineTo(x - s * 0.05, y - s * 0.4); g.lineTo(x - s * 0.15, y - s * 0.1); g.closePath(); g.fill();
  }
  function glyphDisc(g, x, y, s) {
    const bg = g.createRadialGradient(x, y, s * 0.05, x, y, s * 0.5);
    bg.addColorStop(0, '#2a2f3a'); bg.addColorStop(0.35, '#8a92c0'); bg.addColorStop(0.6, '#c9d2ec'); bg.addColorStop(0.75, '#8a92c0'); bg.addColorStop(1, '#5a5f80');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.5, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#3a3f55'; g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x, y, s * 0.1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(x, y, s * 0.32, -1.2, -0.3); g.stroke();
    g.strokeStyle = 'rgba(255,180,220,0.5)'; g.beginPath(); g.arc(x, y, s * 0.26, -1.5, -0.5); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.22, s * 0.1, s * 0.04, -0.7, 0, Math.PI * 2); g.fill();
  }
  function glyphGoldWatch(g, x, y, s) {
    g.fillStyle = '#8a6a1f'; g.fillRect(x - s * 0.3, y - s * 0.8, s * 0.6, s * 0.3);
    g.fillRect(x - s * 0.3, y + s * 0.5, s * 0.6, s * 0.3);
    g.strokeStyle = '#6b5018'; g.lineWidth = s * 0.03; for (const yy of [-0.72, 0.6]) { g.beginPath(); g.moveTo(x - s * 0.3, y + yy * s); g.lineTo(x + s * 0.3, y + yy * s); g.stroke(); }
    const bg = g.createRadialGradient(x - s * 0.06, y - s * 0.06, s * 0.03, x, y, s * 0.45);
    bg.addColorStop(0, '#fff3c0'); bg.addColorStop(0.7, '#e0b84b'); bg.addColorStop(1, '#a67c1f');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a6a1f'; g.lineWidth = s * 0.08; g.stroke();
    g.fillStyle = '#fdf6e0'; g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a6a1f'; g.lineWidth = s * 0.03; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(x + Math.cos(a) * s * 0.26, y + Math.sin(a) * s * 0.26); g.lineTo(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3); g.stroke(); }
    g.strokeStyle = '#3a2f23'; g.lineWidth = s * 0.04; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.18); g.stroke();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.14, y); g.stroke();
    g.fillStyle = '#e0b84b'; g.beginPath(); g.arc(x + s * 0.44, y, s * 0.06, 0, Math.PI * 2); g.fill();
  }
  function glyphVase(g, x, y, s) {
    g.fillStyle = '#eef4f8'; g.beginPath(); g.moveTo(x - s * 0.1, y - s * 0.6); g.lineTo(x + s * 0.1, y - s * 0.6); g.bezierCurveTo(x + s * 0.4, y - s * 0.2, x + s * 0.34, y + s * 0.4, x + s * 0.12, y + s * 0.5); g.lineTo(x - s * 0.12, y + s * 0.5); g.bezierCurveTo(x - s * 0.34, y + s * 0.4, x - s * 0.4, y - s * 0.2, x - s * 0.1, y - s * 0.6); g.closePath(); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#c4ccd6'; g.stroke();
    g.strokeStyle = '#3a6fb8'; g.lineWidth = s * 0.04;
    g.beginPath(); g.arc(x, y - s * 0.25, s * 0.14, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x, y - s * 0.05); g.quadraticCurveTo(x + s * 0.1, y + s * 0.05, x + s * 0.05, y + s * 0.18); g.stroke();
    g.beginPath(); g.moveTo(x, y - s * 0.05); g.quadraticCurveTo(x - s * 0.1, y + s * 0.05, x - s * 0.05, y + s * 0.18); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(x - s * 0.16, y - s * 0.1, s * 0.05, s * 0.2, -0.3, 0, Math.PI * 2); g.fill();
  }
  function glyphGoldBar(g, x, y, s) {
    const bg = g.createLinearGradient(x - s * 0.4, 0, x + s * 0.4, 0); bg.addColorStop(0, '#a67c1f'); bg.addColorStop(0.35, '#ffe9a8'); bg.addColorStop(0.6, '#e0b84b'); bg.addColorStop(1, '#8a6a1f');
    g.fillStyle = bg; g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.22); g.lineTo(x - s * 0.3, y - s * 0.4); g.lineTo(x + s * 0.3, y - s * 0.4); g.lineTo(x + s * 0.42, y - s * 0.22); g.lineTo(x + s * 0.42, y + s * 0.22); g.lineTo(x + s * 0.3, y + s * 0.4); g.lineTo(x - s * 0.3, y + s * 0.4); g.lineTo(x - s * 0.42, y + s * 0.22); g.closePath(); g.fill();
    g.lineWidth = s * 0.04; g.strokeStyle = '#6b5018'; g.stroke();
    g.fillStyle = '#ffedb0'; g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.4); g.lineTo(x + s * 0.3, y - s * 0.4); g.lineTo(x + s * 0.42, y - s * 0.22); g.lineTo(x - s * 0.42, y - s * 0.22); g.closePath(); g.fill();
    g.fillStyle = '#8a6a1f'; g.font = 'bold ' + Math.round(s * 0.14) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Au 999', x, y + s * 0.04);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - s * 0.2, y - s * 0.25, s * 0.08, s * 0.04, -0.5, 0, Math.PI * 2); g.fill();
  }
  function glyphGoldCoin(g, x, y, s) {
    const bg = g.createRadialGradient(x - s * 0.1, y - s * 0.1, s * 0.05, x, y, s * 0.52);
    bg.addColorStop(0, '#fff3c0'); bg.addColorStop(0.6, '#e0b84b'); bg.addColorStop(1, '#a67c1f');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, s * 0.5, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.05; g.strokeStyle = '#8a6a1f'; g.stroke();
    g.strokeStyle = '#c9a03a'; g.lineWidth = s * 0.04; g.beginPath(); g.arc(x, y, s * 0.36, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8a6a1f'; g.font = 'bold ' + Math.round(s * 0.3) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', x, y + s * 0.02);
    g.strokeStyle = '#c9a03a'; g.lineWidth = s * 0.04; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; g.beginPath(); g.moveTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5); g.lineTo(x + Math.cos(a) * s * 0.44, y + Math.sin(a) * s * 0.44); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(x - s * 0.18, y - s * 0.22, s * 0.08, s * 0.14, -0.5, 0, Math.PI * 2); g.fill();
  }

  // —— 特殊类型（血包 / 局内哈基币）——
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
    g.strokeStyle = '#f7d97a'; g.lineWidth = s * 0.05; g.beginPath(); g.arc(x, y, s * 0.5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8a6a1f'; g.font = 'bold ' + Math.round(s * 0.72) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', x, y + s * 0.02);
  }
  function glyphGem(g, x, y, s) {
    g.fillStyle = '#4bc0e0';
    g.beginPath(); g.moveTo(x, y - s * 0.8); g.lineTo(x + s * 0.7, y - s * 0.1); g.lineTo(x, y + s * 0.8); g.lineTo(x - s * 0.7, y - s * 0.1); g.closePath(); g.fill();
    g.lineWidth = s * 0.06; g.strokeStyle = '#1d6f8a'; g.stroke();
  }

  // ================= 物品表（固定档位，一个物品只属于一个档位）================
  const CATALOG = [
    // 常见（白）
    { name: '火柴', r: 'common', g: glyphMatch },
    { name: '电池', r: 'common', g: glyphBattery },
    { name: '书本', r: 'common', g: glyphBook },
    { name: '普通硬币', r: 'common', g: glyphCoinSimple },
    { name: '茶杯', r: 'common', g: glyphCup },
    { name: '扑克牌A', r: 'common', g: cardGlyph('A', '♠', CARD_BLACK) },
    { name: '扑克牌2', r: 'common', g: cardGlyph('2', '♥', CARD_RED) },
    { name: '扑克牌3', r: 'common', g: cardGlyph('3', '♦', CARD_RED) },
    { name: '扑克牌4', r: 'common', g: cardGlyph('4', '♣', CARD_BLACK) },
    { name: '扑克牌5', r: 'common', g: cardGlyph('5', '♠', CARD_BLACK) },
    { name: '扑克牌6', r: 'common', g: cardGlyph('6', '♥', CARD_RED) },
    { name: '扑克牌7', r: 'common', g: cardGlyph('7', '♦', CARD_RED) },
    { name: '扑克牌8', r: 'common', g: cardGlyph('8', '♣', CARD_BLACK) },
    { name: '扑克牌9', r: 'common', g: cardGlyph('9', '♠', CARD_BLACK) },
    { name: '扑克牌10', r: 'common', g: cardGlyph('10', '♥', CARD_RED) },
    { name: '扑克牌J', r: 'common', g: cardGlyph('J', '♠', CARD_BLACK) },
    { name: '扑克牌Q', r: 'common', g: cardGlyph('Q', '♥', CARD_RED) },
    { name: '扑克牌K', r: 'common', g: cardGlyph('K', '♦', CARD_RED) },
    // 普通（绿）
    { name: '可乐', r: 'uncommon', g: glyphCola },
    { name: '温度计', r: 'uncommon', g: glyphThermo },
    { name: '普通U盘', r: 'uncommon', g: glyphUsbSimple },
    { name: '插座', r: 'uncommon', g: glyphOutlet },
    { name: '扑克牌大王', r: 'uncommon', g: jokerGlyph(CARD_RED) },
    { name: '扑克牌小王', r: 'uncommon', g: jokerGlyph('#4b6b8f') },
    { name: '苹果', r: 'uncommon', g: glyphApple },
    // 精良（蓝）
    { name: '手电', r: 'rare', g: glyphFlashlight },
    { name: '录音笔', r: 'rare', g: glyphRecorder },
    { name: '台灯', r: 'rare', g: glyphLamp },
    { name: '提灯', r: 'rare', g: glyphLantern },
    { name: '匕首', r: 'rare', g: glyphDagger },
    { name: '弯刀', r: 'rare', g: glyphMachete },
    { name: '摄像头', r: 'rare', g: glyphCam },
    { name: '蝴蝶标本', r: 'rare', g: glyphButterfly },
    // 稀有（紫）
    { name: '海鲜罐头', r: 'epic', g: glyphCan },
    { name: '飞行员眼镜', r: 'epic', g: glyphGoggles },
    { name: '强化剂', r: 'epic', g: glyphSyringe },
    { name: '瞄具', r: 'epic', g: glyphSight },
    { name: '握把', r: 'epic', g: glyphGrip },
    { name: '枪管', r: 'epic', g: glyphBarrel },
    { name: '鳄鱼蛋', r: 'epic', g: glyphEgg },
    // 史诗（金，逐项定值）
    { name: '相机', r: 'legendary', min: 1500, max: 2000, g: glyphCamera },
    { name: '无人机', r: 'legendary', min: 1500, max: 2000, g: glyphDrone },
    { name: '香槟', r: 'legendary', min: 1500, max: 2000, g: glyphChampagne },
    { name: '勋章', r: 'legendary', min: 1300, max: 1500, g: glyphMedal },
    { name: '手机', r: 'legendary', min: 1300, max: 2000, g: glyphPhone },
    { name: 'CPU', r: 'legendary', min: 1000, max: 1500, g: glyphCpu },
    { name: '银锭', r: 'legendary', min: 1000, max: 1500, g: glyphSilverBar },
    { name: '银币', r: 'legendary', min: 800, max: 1000, g: glyphSilverCoin },
    // 传说（红，逐项定值）
    { name: '钻石', r: 'mythic', min: 4000, max: 6000, g: glyphDiamond },
    { name: '珍珠', r: 'mythic', min: 4000, max: 6000, g: glyphPearl },
    { name: '电脑', r: 'mythic', min: 3000, max: 5000, g: glyphComputer },
    { name: '显卡', r: 'mythic', min: 2500, max: 4500, g: glyphGpu2 },
    { name: '坦克模型', r: 'mythic', min: 3000, max: 5000, g: glyphTank },
    { name: '雕像', r: 'mythic', min: 2000, max: 3000, g: glyphStatue },
    { name: '实验数据光盘', r: 'mythic', min: 2000, max: 3000, g: glyphDisc },
    { name: '金表', r: 'mythic', min: 2000, max: 3000, g: glyphGoldWatch },
    { name: '名窑瓷器花瓶', r: 'mythic', min: 1500, max: 2500, g: glyphVase },
    { name: '金砖', r: 'mythic', min: 1500, max: 2000, g: glyphGoldBar },
    { name: '金币', r: 'mythic', min: 1200, max: 1800, g: glyphGoldCoin },
  ];

  const BY_NAME = {};
  const POOLS = {};
  RARITIES.forEach(r => { POOLS[r.id] = []; });
  CATALOG.forEach(i => { BY_NAME[i.name] = i; POOLS[i.r].push(i); });

  function valueRange(def) {
    if (typeof def.min === 'number' && typeof def.max === 'number') return [def.min, def.max];
    return TIER_RANGE[def.r] || [10, 50];
  }

  function rollRarity(probs) {
    let r = Math.random(), acc = 0;
    for (let i = 0; i < RARITIES.length; i++) { acc += probs[i]; if (r < acc) return RARITIES[i]; }
    return RARITIES[0];
  }

  function makeLoot(probs) {
    const r = rollRarity(probs);
    const pool = POOLS[r.id];
    const def = pool[Math.floor(Math.random() * pool.length)];
    const rng = valueRange(def);
    // 崭新度 cond（0-1，越大越新）：价格与磨损用同一个随机数关联 —— 越新越贵、越旧越便宜
    const cond = Math.floor(Math.random() * 100000) / 100000;
    return {
      kind: 'loot',
      name: def.name,
      rarityId: r.id, rarityName: r.name, color: r.color,
      wear: cond,
      value: Math.round(rng[0] + cond * (rng[1] - rng[0])),
    };
  }
  function generateLoot() { return makeLoot(NORMAL_PROBS); }
  function generateEliteLoot() { return makeLoot(ELITE_PROBS); }

  function medkit() {
    return { kind: 'medkit', name: '血包', rarityId: 'common', rarityName: '常见', color: '#9aa0a8', value: 50 };
  }
  function gold(value) {
    return { kind: 'gold', name: '哈基币', rarityId: 'common', rarityName: '常见', color: '#ffd23f', value: value || 100 };
  }

  // —— 图鉴目录（供首页图鉴展示）——
  function catalog() {
    return CATALOG.map(d => {
      const r = RARITIES.find(x => x.id === d.r);
      const rng = valueRange(d);
      return { name: d.name, kind: 'loot', rarityId: r.id, rarityName: r.name, color: r.color, min: rng[0], max: rng[1] };
    });
  }

  // ================= 程序化图标 =================
  const texCache = new Map(), urlCache = new Map();

  function tierOf(id) { const i = RARITIES.findIndex(r => r.id === id); return i < 0 ? 0 : i; }
  function rarColor(id) { const r = RARITIES.find(x => x.id === id); return r ? r.color : '#9aa0a8'; }

  function drawGlyph(g, item, cx, cy, s) {
    if (item.kind === 'medkit') return glyphMedkit(g, cx, cy, s);
    if (item.kind === 'gold') return glyphCoin(g, cx, cy, s);
    const def = BY_NAME[item.name];
    if (def && def.g) return def.g(g, cx, cy, s);
    glyphGem(g, cx, cy, s);
  }

  function drawItemIcon(item, px) {
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d');
    const tier = tierOf(item.rarityId);
    const rcol = rarColor(item.rarityId);
    const m = px * 0.08, x = m, y = m, w = px - m * 2, h = px - m * 2, rad = px * 0.16;

    g.save();
    if (tier >= 1) { g.shadowColor = rcol; g.shadowBlur = px * (0.04 + tier * 0.045); }
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#2c2f38'); grad.addColorStop(1, '#14161c');
    roundRect(g, x, y, w, h, rad);
    g.fillStyle = grad; g.fill();
    g.restore();

    const lw = px * (0.016 + tier * 0.006);
    g.lineWidth = lw; g.strokeStyle = rcol;
    roundRect(g, x + lw / 2, y + lw / 2, w - lw, h - lw, rad - lw / 2);
    g.stroke();

    if (tier >= 4) { // 史诗/传说：四角星芒
      g.fillStyle = tier === 5 ? '#ffd9d9' : '#fff7d6';
      const o = px * 0.1;
      for (const [sx, sy] of [[x + o, y + o], [x + w - o, y + o], [x + o, y + h - o], [x + w - o, y + h - o]]) star4(g, sx, sy, px * 0.05);
    }
    if (tier >= 5) { // 传说：顶部镜面反光带
      const sheen = g.createLinearGradient(x, y, x + w, y);
      sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.18)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sheen; roundRect(g, x, y, w, h * 0.5, rad); g.fill();
    }

    drawGlyph(g, item, px / 2, px / 2, px * 0.38);
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

  return { RARITIES, generateLoot, generateEliteLoot, medkit, gold, itemSprite, itemIconURL, iconTexture, catalog, tierOf };
})();
