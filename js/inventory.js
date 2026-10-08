// 库存：背包(9格)、保险箱(0-4格)、仓库(珍贵展示柜3×3最多9格 + 普通仓库最多400格=10页×40)、局内哈基币 / 元点数、localStorage 统计
const INVENTORY = (function () {
  const BACKPACK_SIZE = 9;       // 默认/基准（买票进入）
  const BACKPACK_MAX = 15;       // 上限：买票 9 + 重甲 6
  const SAFE_MAX = 4;            // 保险箱最多 4 格
  const SAFE_UNLOCK_COST = 10000; // 累计消费点数每满 10000 自动解锁 1 格
  const PRECIOUS_MAX = 9;     // 珍贵展示柜：3×3 最多 9 格（开局 1 格）
  const WAREHOUSE_MAX = 400;  // 普通仓库：最多 400 格（10 页 × 每页 5×8=40 格；开局 3×5=15 格）
  const WAREHOUSE_PER_PAGE = 40; // 每页 8 行 × 5 列
  const WAREHOUSE_SIZE = PRECIOUS_MAX + WAREHOUSE_MAX;
  const INIT_PRECIOUS = 1;
  const INIT_WAREHOUSE = 15;
  const PRECIOUS_SLOT_PRICE = 5000;
  const WAREHOUSE_SLOT_PRICE = 500;
  const KEY = 'sdfc_stats_v1';

  // 物品改名迁移表：旧名 → 新名（兼容历史存档，避免仓库/图鉴出现旧名）
  const NAME_RENAMES = { '金色硬币': '金币', '金条': '金砖', '银砖条': '银锭' };

  // 珍贵展示柜皮肤（20 款，价格/风格自行设计）
  const SKINS = [
    { id: 'default',  name: '原木',     price: 0 },
    { id: 'ruby',     name: '红宝石',   price: 2000 },
    { id: 'sapphire', name: '蓝宝石',   price: 2000 },
    { id: 'emerald',  name: '翡翠',     price: 2000 },
    { id: 'amethyst', name: '紫水晶',   price: 2000 },
    { id: 'gold',     name: '鎏金',     price: 3000 },
    { id: 'obsidian', name: '黑曜石',   price: 3000 },
    { id: 'ivory',    name: '象牙白',   price: 3000 },
    { id: 'candy',    name: '糖果条纹', price: 4000 },
    { id: 'polka',    name: '波点',     price: 4000 },
    { id: 'checker',  name: '棋盘格',   price: 4000 },
    { id: 'zigzag',   name: '之字纹',   price: 4000 },
    { id: 'neongrid', name: '霓虹网格', price: 5000 },
    { id: 'starry',   name: '星夜',     price: 5000 },
    { id: 'flame',    name: '烈焰',     price: 6000 },
    { id: 'ocean',    name: '深海',     price: 6000 },
    { id: 'sunset',   name: '落日',     price: 6000 },
    { id: 'aurora',   name: '极光',     price: 7000 },
    { id: 'rgb',      name: 'RGB 流光', price: 8000 },
    { id: 'neon',     name: '霓虹脉冲', price: 8000 },
  ];

  let backpack = new Array(BACKPACK_SIZE).fill(null);
  let backpackSize = BACKPACK_SIZE;   // 当前局背包格数（eco 6 / 买票 9 + 护甲加成）
  let safeBox = new Array(0).fill(null); // 每局重置，容量 = 当前保险箱格数
  let gold = 0;                 // 局内哈基币（购买武器），每局重置、不持久
  let stats = load();

  function isPrecious(item) {
    return item && (item.rarityId === 'legendary' || item.rarityId === 'mythic');
  }

  function defaults() {
    return {
      totalRuns: 0, survivedRuns: 0, totalValue: 0, totalKills: 0,
      points: 0,       // 元货币：点数（持久化，仓库格子 / 皮肤 / 开局进入用）
      totalSpent: 0,   // 累计消费点数（用于保险箱解锁）
      cracked: false,  // 兑换码解锁的破解版（全解锁）
      preciousSlots: INIT_PRECIOUS,
      warehouseSlots: INIT_WAREHOUSE,
      preciousSkin: 'default',
      ownedSkins: ['default'],
      warehouse: new Array(WAREHOUSE_SIZE).fill(null),
      codex: {}, // 图鉴：物品名 -> 首次带出时间戳
    };
  }

  function clampInt(v, min, max, dflt) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeStats(s) {
    const base = Object.assign(defaults(), s || {});
    // 兼容「统一货币」期间的存档：哈基币(gold) → 点数(points)
    if (typeof base.gold === 'number' && typeof base.points !== 'number') base.points = base.gold;
    delete base.gold;
    base.totalRuns = clampInt(base.totalRuns, 0, Number.MAX_SAFE_INTEGER, 0);
    base.survivedRuns = clampInt(base.survivedRuns, 0, Number.MAX_SAFE_INTEGER, 0);
    base.totalValue = clampInt(base.totalValue, 0, Number.MAX_SAFE_INTEGER, 0);
    base.totalKills = clampInt(base.totalKills, 0, Number.MAX_SAFE_INTEGER, 0);
    base.points = clampInt(base.points, 0, Number.MAX_SAFE_INTEGER, 0);
    base.totalSpent = clampInt(base.totalSpent, 0, Number.MAX_SAFE_INTEGER, 0);
    base.preciousSlots = clampInt(base.preciousSlots, INIT_PRECIOUS, PRECIOUS_MAX, INIT_PRECIOUS);
    base.warehouseSlots = clampInt(base.warehouseSlots, INIT_WAREHOUSE, WAREHOUSE_MAX, INIT_WAREHOUSE);
    base.warehouse = normalizeWarehouse(base.warehouse);
    base.codex = (base.codex && typeof base.codex === 'object' && !Array.isArray(base.codex)) ? base.codex : {};
    // 图鉴键也做改名迁移（旧名 → 新名）
    for (const k of Object.keys(base.codex)) {
      const nk = NAME_RENAMES[k];
      if (nk && nk !== k) { if (base.codex[nk] == null) base.codex[nk] = base.codex[k]; delete base.codex[k]; }
    }

    // 已解锁格数至少要覆盖已有物品（兼容旧存档 / 手改存档）
    let needPrecious = 0, needWh = 0;
    for (let i = 0; i < PRECIOUS_MAX; i++) if (base.warehouse[i]) needPrecious = i + 1;
    for (let i = PRECIOUS_MAX; i < WAREHOUSE_SIZE; i++) if (base.warehouse[i]) needWh = i - PRECIOUS_MAX + 1;
    if (needPrecious > base.preciousSlots) base.preciousSlots = needPrecious;
    if (needWh > base.warehouseSlots) base.warehouseSlots = needWh;

    if (!SKINS.some(sk => sk.id === base.preciousSkin)) base.preciousSkin = 'default';
    const owned = Array.isArray(base.ownedSkins)
      ? base.ownedSkins.filter(id => SKINS.some(sk => sk.id === id))
      : [];
    if (!owned.includes('default')) owned.unshift('default');
    if (!owned.includes(base.preciousSkin)) base.preciousSkin = 'default';
    base.ownedSkins = owned;

    // 破解版：全解锁（所有格子 / 皮肤 / 保险箱）
    if (base.cracked) {
      base.preciousSlots = PRECIOUS_MAX;
      base.warehouseSlots = WAREHOUSE_MAX;
      base.ownedSkins = SKINS.map(sk => sk.id);
      base.totalSpent = Math.max(base.totalSpent, SAFE_UNLOCK_COST * SAFE_MAX);
    }

    return base;
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s || typeof s !== 'object') return normalizeStats(null);
      return normalizeStats(s);
    } catch (e) { return normalizeStats(null); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (e) {} }

  // 崭新度：0-1 五位小数；越大越新（1 = 崭新，0 = 完全磨损）
  function rollWear() { return Math.floor(Math.random() * 100000) / 100000; }
  function wearOpacity(item) {
    const w = (typeof item.wear === 'number' && Number.isFinite(item.wear)) ? Math.min(1, Math.max(0, item.wear)) : 0;
    return 0.2 + w * 0.8; // 崭新(w=1)→100%，完全磨损(w=0)→20%
  }
  // 物品进入仓库：记录带出的北京时间 + 随机磨损
  function stampItem(item) {
    if (item && typeof item === 'object') {
      if (item.foundAt == null) item.foundAt = Date.now();
      if (item.wear == null) item.wear = rollWear();
    }
    return item;
  }

  // 兼容旧存档：把旧的「名称+稀有度堆叠(qty)」格式展开为单个占格
  function normalizeWarehouse(raw) {
    const out = new Array(WAREHOUSE_SIZE).fill(null);
    if (!Array.isArray(raw)) return out;
    let li = 0, ri = 0;
    for (const w of raw) {
      if (!w || typeof w !== 'object' || typeof w.name !== 'string') continue;
      const item = { name: NAME_RENAMES[w.name] || w.name, rarityId: w.rarityId, rarityName: w.rarityName, color: w.color, value: w.value, kind: w.kind };
      if (typeof w.foundAt === 'number') item.foundAt = w.foundAt;
      if (typeof w.wear === 'number') item.wear = w.wear;
      const qty = Math.max(1, Math.floor(Number(w.qty)) || 1);
      for (let k = 0; k < qty; k++) {
        if (isPrecious(item)) {
          if (li < PRECIOUS_MAX) out[li++] = item;
          else if (ri < WAREHOUSE_MAX) out[PRECIOUS_MAX + ri++] = item;
        } else {
          if (ri < WAREHOUSE_MAX) out[PRECIOUS_MAX + ri++] = item;
          else if (li < PRECIOUS_MAX) out[li++] = item;
        }
      }
    }
    return out;
  }

  function newRun(size) {
    backpackSize = clampInt(size, 1, BACKPACK_MAX, BACKPACK_SIZE);
    backpack = new Array(backpackSize).fill(null);
    safeBox = new Array(safeSlots()).fill(null);
    gold = 0;
  }
  function getBackpackSize() { return backpackSize; }

  // —— 背包（9 格，不堆叠）——
  function backpackCount() { return backpack.filter(Boolean).length; }
  function isBackpackFull() { return backpackCount() >= backpackSize; }
  function addToBackpack(item) {
    const i = backpack.indexOf(null);
    if (i < 0) return false;
    backpack[i] = item; return true;
  }
  function removeFromBackpack(i) { if (i >= 0 && i < backpackSize) backpack[i] = null; }
  function consumeMedkit() {
    const i = backpack.findIndex(it => it && it.kind === 'medkit');
    if (i < 0) return false;
    backpack[i] = null;
    return true;
  }
  function backpackItems() { return backpack.slice(); }
  function clearBackpack() { backpack = new Array(backpackSize).fill(null); }

  // —— 局内哈基币（不持久，购买武器 / 拾取）——
  function addGold(n) { gold += Math.floor(Number(n)) || 0; }
  function spendGold(n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 0) return false;
    if (gold < n) return false;
    gold -= n;
    return true;
  }
  function getGold() { return gold; }

  // —— 元点数（持久，仓库格子 / 皮肤 / 开局进入；累计消费用于保险箱解锁）——
  function getPoints() { return stats.points; }
  function spendPoints(n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 0) return false;
    if (stats.points < n) return false;
    stats.points -= n;
    stats.totalSpent += n;
    save();
    return true;
  }

  // —— 保险箱（累计消费点数解锁格子，最多 4；局内物品放入后死亡也可带出）——
  function safeSlots() { return stats.cracked ? SAFE_MAX : Math.min(SAFE_MAX, Math.floor(stats.totalSpent / SAFE_UNLOCK_COST)); }
  function safeBoxItems() { return safeBox.slice(); }

  // —— 兑换码（破解版：全解锁）——
  // 兑换码以编码形式存储（不写明文），比对时解码；输入仍用原码。
  function redeemSecret() {
    return String.fromCharCode(119, 104, 122);
  }
  function enterCode(code) {
    if (String(code || '').trim().toLowerCase() === redeemSecret()) {
      stats.cracked = true;
      stats = normalizeStats(stats);
      fillCrackedCollection();
      save();
      return true;
    }
    return false;
  }

  // 破解版：把全部传说/史诗物品铺满展示柜 + 仓库（崭新 1.0，价值取上限；幂等，已存在则跳过）
  function fillCrackedCollection() {
    const precious = ITEMS.catalog()
      .filter(c => c.rarityId === 'legendary' || c.rarityId === 'mythic')
      .sort((a, b) => {
        const ra = a.rarityId === 'mythic' ? 0 : 1;   // 传说优先进展示柜
        const rb = b.rarityId === 'mythic' ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (b.max || 0) - (a.max || 0);           // 同档按价值从高到低
      });
    const existing = new Set();
    for (const it of stats.warehouse) if (it && typeof it.name === 'string') existing.add(it.name);
    for (const c of precious) {
      if (existing.has(c.name)) continue;
      placeItem({
        kind: 'loot', name: c.name,
        rarityId: c.rarityId, rarityName: c.rarityName, color: c.color,
        wear: 1.0, value: c.max || 0,
      });
    }
  }
  function isCracked() { return !!stats.cracked; }
  function moveBackpackToSafe(bpi, sbi) {
    if (sbi < 0 || sbi >= safeBox.length) return false;
    const item = backpack[bpi];
    if (!item) return false;
    const target = safeBox[sbi];
    safeBox[sbi] = item;
    backpack[bpi] = target; // target 可能为 null（腾空背包）
    return true;
  }
  function moveSafeToBackpack(sbi, bpi) {
    if (sbi < 0 || sbi >= safeBox.length || bpi < 0 || bpi >= backpackSize) return false;
    const item = safeBox[sbi];
    if (!item) return false;
    const target = backpack[bpi];
    backpack[bpi] = item;
    safeBox[sbi] = target;
    return true;
  }
  function depositSafeBox() {
    let value = 0, overflowValue = 0, overflowed = false;
    for (let i = 0; i < safeBox.length; i++) {
      const item = safeBox[i];
      if (!item) continue;
      value += item.value || 0;
      if (!placeItem(item)) { overflowed = true; overflowValue += item.value || 0; }
      safeBox[i] = null;
    }
    stats.totalValue += value;
    save();
    return { value, overflowed, overflowValue };
  }

  // —— 统计 + 仓库 ——
  function recordKill() { stats.totalKills++; }
  function finishRun(survived) { stats.totalRuns++; if (survived) stats.survivedRuns++; save(); }

  function firstEmpty(from, to) {
    for (let i = from; i < to; i++) if (!stats.warehouse[i]) return i;
    return -1;
  }
  function placeItem(item) {
    stampItem(item); // 进入仓库：记录带出时间 + 随机磨损
    // 图鉴：记录首次带出时间（含保险箱带出，depositSafeBox 也走这里）
    if (item && typeof item.name === 'string') {
      const ts = item.foundAt || Date.now();
      if (stats.codex[item.name] == null) stats.codex[item.name] = ts;
    }
    const pFrom = 0, pTo = stats.preciousSlots;
    const wFrom = PRECIOUS_MAX, wTo = PRECIOUS_MAX + stats.warehouseSlots;
    if (isPrecious(item)) {
      let i = firstEmpty(pFrom, pTo);
      if (i >= 0) { stats.warehouse[i] = item; return true; }
      let j = firstEmpty(wFrom, wTo);
      if (j >= 0) { stats.warehouse[j] = item; return true; }
    } else {
      let j = firstEmpty(wFrom, wTo);
      if (j >= 0) { stats.warehouse[j] = item; return true; }
      let i = firstEmpty(pFrom, pTo);
      if (i >= 0) { stats.warehouse[i] = item; return true; }
    }
    return false;
  }

  function depositBackpack() {
    let value = 0, overflowValue = 0, overflowed = false;
    for (const item of backpack) {
      if (!item) continue;
      value += item.value || 0;
      if (!placeItem(item)) { overflowed = true; overflowValue += item.value || 0; }
    }
    stats.totalValue += value;
    save();
    clearBackpack();
    return { value, overflowed, overflowValue };
  }

  // —— 付费撤离：按品质低→高挑选价值 fee 的物品从背包删除，超出部分转为点数 ——
  function payExtractionFee(fee) {
    fee = Math.floor(Number(fee));
    if (!Number.isFinite(fee) || fee <= 0) return { points: 0, removed: 0 };
    const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    const rank = (it) => { const i = ORDER.indexOf(it && it.rarityId); return i < 0 ? 99 : i; };
    const entries = [];
    for (let i = 0; i < backpack.length; i++) if (backpack[i]) entries.push({ it: backpack[i], i });
    entries.sort((a, b) => {
      const ra = rank(a.it) - rank(b.it);
      if (ra !== 0) return ra;
      return (a.it.value || 0) - (b.it.value || 0);
    });
    let acc = 0, removed = [];
    for (const e of entries) {
      if (acc >= fee) break;
      acc += e.it.value || 0;
      removed.push(e.i);
    }
    if (acc < fee) return null; // 背包价值不足，无法支付撤离费
    for (const i of removed) backpack[i] = null;
    const points = acc - fee;
    if (points > 0) stats.points += points;
    save();
    return { points, removed: removed.length };
  }

  // —— 一键丢弃：蓝色（精良）以下的战利品直接删除，不折点 ——
  function discardBackpackBelow(tier) {
    let n = 0;
    for (let i = 0; i < backpack.length; i++) {
      const it = backpack[i];
      if (it && it.kind === 'loot' && ITEMS.tierOf(it.rarityId) < tier) { backpack[i] = null; n++; }
    }
    return n;
  }
  function discardWarehouseBelow(tier) {
    let n = 0;
    for (let i = 0; i < WAREHOUSE_SIZE; i++) {
      const it = stats.warehouse[i];
      if (it && it.kind === 'loot' && ITEMS.tierOf(it.rarityId) < tier) { stats.warehouse[i] = null; n++; }
    }
    if (n) save();
    return n;
  }

  function getStats() { return stats; }
  function surviveRate() { return stats.totalRuns ? Math.round(stats.survivedRuns / stats.totalRuns * 100) : 0; }

  // 售出：按物品价值折算成点数（1 价值 = 1 点数）
  function sellItem(i) {
    if (i < 0 || i >= WAREHOUSE_SIZE) return null;
    const it = stats.warehouse[i];
    if (!it) return null;
    stats.warehouse[i] = null;
    const g = clampInt(it.value, 0, Number.MAX_SAFE_INTEGER, 0);
    stats.points += g;
    save();
    return { item: it, points: g };
  }

  // 批量售出：多选后一次性折算点数（只卖有效格，一次存档）
  function sellItems(indices) {
    let count = 0, points = 0;
    for (const i of indices) {
      if (i < 0 || i >= WAREHOUSE_SIZE) continue;
      const it = stats.warehouse[i];
      if (!it) continue;
      stats.warehouse[i] = null;
      const g = clampInt(it.value, 0, Number.MAX_SAFE_INTEGER, 0);
      stats.points += g;
      points += g;
      count++;
    }
    if (count) save();
    return count ? { count, points } : null;
  }

  function buyPreciousSlot() {
    if (stats.preciousSlots >= PRECIOUS_MAX) return { ok: false, reason: 'full' };
    if (!spendPoints(PRECIOUS_SLOT_PRICE)) return { ok: false, reason: 'poor' };
    stats.preciousSlots++;
    save();
    return { ok: true };
  }
  function buyWarehouseSlot() {
    if (stats.warehouseSlots >= WAREHOUSE_MAX) return { ok: false, reason: 'full' };
    if (!spendPoints(WAREHOUSE_SLOT_PRICE)) return { ok: false, reason: 'poor' };
    stats.warehouseSlots++;
    save();
    return { ok: true };
  }

  function buySkin(id) {
    const def = SKINS.find(sk => sk.id === id);
    if (!def) return { ok: false, reason: 'bad' };
    if (stats.ownedSkins.includes(id)) return { ok: false, reason: 'owned' };
    if (!spendPoints(def.price)) return { ok: false, reason: 'poor' };
    stats.ownedSkins.push(id);
    save();
    return { ok: true };
  }
  function applySkin(id) {
    if (!stats.ownedSkins.includes(id)) return false;
    stats.preciousSkin = id;
    save();
    return true;
  }
  function getSkins() { return SKINS; }

  function swapSlots(a, b) {
    if (a === b || a < 0 || b < 0 || a >= WAREHOUSE_SIZE || b >= WAREHOUSE_SIZE) return;
    const t = stats.warehouse[a];
    stats.warehouse[a] = stats.warehouse[b];
    stats.warehouse[b] = t;
    save();
  }

  // —— 存档导出 / 导入 / 删除 ——
  function exportData() { return JSON.stringify(stats); }

  function importData(json) {
    try {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      stats = normalizeStats(obj);
      save();
      return true;
    } catch (e) { return false; }
  }

  function clearSave() { stats = normalizeStats(null); save(); }

  return {
    newRun, backpackCount, isBackpackFull, addToBackpack, removeFromBackpack, consumeMedkit, backpackItems, clearBackpack, getBackpackSize,
    addGold, spendGold, getGold, getPoints, spendPoints,
    safeSlots, safeBoxItems, moveBackpackToSafe, moveSafeToBackpack, depositSafeBox,
    enterCode, isCracked,
    recordKill, finishRun, depositBackpack, payExtractionFee, discardBackpackBelow, discardWarehouseBelow, getStats, surviveRate, swapSlots, sellItem, sellItems,
    buyPreciousSlot, buyWarehouseSlot, buySkin, applySkin, getSkins,
    wearOpacity,
    exportData, importData, clearSave,
    BACKPACK_SIZE, SAFE_MAX, SAFE_UNLOCK_COST, PRECIOUS_MAX, WAREHOUSE_MAX, WAREHOUSE_PER_PAGE, WAREHOUSE_SIZE,
    INIT_PRECIOUS, INIT_WAREHOUSE, PRECIOUS_SLOT_PRICE, WAREHOUSE_SLOT_PRICE,
  };
})();
