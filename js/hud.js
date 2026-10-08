// HUD：准星、血量、弹药、哈基币、倒计时、背包、开箱/撤离进度、仓库、结算
const HUD = (function () {
  const el = {};
  let overlayVisible = false;
  let maxHealth = 100;
  let promptTimer = null;
  let pickupTimer = null;
  let toastTimer = null;
  let whSelected = new Set();
  let phaseBannerTimer = 0, phaseBannerCountdown = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.healthFill = $('health-fill');
    el.healthText = $('health-text');
    el.ammoText = $('ammo-text');
    el.weaponName = $('weapon-name');
    el.reloadIndicator = $('reload-indicator');
    el.reloadRing = document.querySelector('#reload-indicator .reload-ring');
    el.reloadText = $('reload-text');
    el.crosshair = $('crosshair');
    el.hitmarker = $('hitmarker');
    el.damageFlash = $('damage-flash');
    el.hint = $('hint');
    el.killCount = $('kill-count');
    el.timeText = $('time-text');
    el.goldText = $('gold-text');
    el.backpackCount = $('backpack-count');
    el.actionBar = $('action-bar');
    el.actionLabel = $('action-label');
    el.actionFill = $('action-fill');
    el.prompt = $('prompt');
    el.pickupToast = $('pickup-toast');
    el.eliteBanner = $('elite-banner');
    el.interact = $('interact');
    el.shopPanel = $('shop-panel');
    el.shopItems = $('shop-items');
    el.backpackPanel = $('backpack-panel');
    el.backpackGrid = $('backpack-grid');
    el.bpDiscardLow = $('bp-discard-low');
    el.menuPanel = $('menu-panel');
    el.menuStats = $('menu-stats');
    el.warehouseLeft = $('warehouse-left');
    el.warehouseRight = $('warehouse-right');
    el.whSellSelected = $('wh-sell-selected');
    el.whDiscardLow = $('wh-discard-low');
    el.startRunBtn = $('start-run-btn');
    el.resultPanel = $('result-panel');
    el.resultTitle = $('result-title');
    el.resultStats = $('result-stats');
    el.resultMenuBtn = $('result-menu-btn');
    el.resultRetryBtn = $('result-retry-btn');
    el.exportSaveBtn = $('export-save-btn');
    el.importSaveBtn = $('import-save-btn');
    el.deleteSaveBtn = $('delete-save-btn');
    el.importFile = $('import-file');
    el.menuPointsNum = $('menu-points-num');
    el.openShopBtn = $('open-shop-btn');
    el.menuShop = $('menu-shop');
    el.msPointsNum = $('ms-points-num');
    el.msCloseBtn = $('ms-close-btn');
    el.msPreciousRow = $('ms-precious-row');
    el.msWarehouseRow = $('ms-warehouse-row');
    el.msSkins = $('ms-skins');
    el.menuToast = $('menu-toast');
    el.loadoutPanel = $('loadout-panel');
    el.loEntries = $('lo-entries');
    el.loArmor = $('lo-armor');
    el.loEquip = $('lo-equip');
    el.loWeapons = $('lo-weapons');
    el.loSummary = $('lo-summary');
    el.loPoints = $('lo-points');
    el.loConfirmBtn = $('lo-confirm-btn');
    el.loCancelBtn = $('lo-cancel-btn');
    el.bpGold = $('bp-gold');
    el.safeboxGrid = $('safebox-grid');
    el.sbSubtitle = $('sb-subtitle');
    el.detailPanel = $('item-detail');
    el.detailCloseBtn = $('detail-close-btn');
    el.detailBody = $('detail-body');
    el.msSafeRow = $('ms-safe-row');
    el.tutorialBtn = $('tutorial-btn');
    el.tutorialPanel = $('tutorial-panel');
    el.tutorialCloseBtn = $('tutorial-close-btn');
    el.redeemBtn = $('redeem-btn');
    el.redeemPanel = $('redeem-panel');
    el.redeemCloseBtn = $('redeem-close-btn');
    el.redeemInput = $('redeem-input');
    el.redeemCancelBtn = $('redeem-cancel-btn');
    el.redeemConfirmBtn = $('redeem-confirm-btn');
    el.codexBtn = $('codex-btn');
    el.codexPanel = $('codex-panel');
    el.codexCloseBtn = $('codex-close-btn');
    el.codexGrid = $('codex-grid');
    el.codexTitle = $('codex-title');
    el.importWarnPanel = $('import-warn-panel');
    el.importWarnOkBtn = $('import-warn-ok-btn');
    el.importWarnExportBtn = $('import-warn-export-btn');
    el.importWarnCloseBtn = $('import-warn-close-btn');
    el.phaseBanner = $('phase-banner');
    el.phaseBannerText = $('phase-banner-text');
    el.phaseBannerTime = $('phase-banner-time');

    // 仓库批量售出（多选 + 二次确认）
    el.whSellSelected.addEventListener('click', () => {
      const wh = INVENTORY.getStats().warehouse;
      const ids = [];
      let total = 0;
      for (const i of whSelected) { const it = wh[i]; if (it) { ids.push(i); total += it.value; } }
      if (!ids.length) return;
      if (!el.whSellSelected.classList.contains('confirm')) {
        el.whSellSelected.classList.add('confirm');
        el.whSellSelected.textContent = '确认售出 ' + ids.length + ' 件?  +' + total + ' 点';
        clearTimeout(el.whSellSelected._t);
        el.whSellSelected._t = setTimeout(resetWhSellSelected, 2500);
        return;
      }
      clearTimeout(el.whSellSelected._t);
      const res = INVENTORY.sellItems(ids);
      if (res) {
        toast('售出 ' + res.count + ' 件  +' + res.points + ' 点数');
        renderWarehouse();
        refreshPoints();
      }
    });

    setHealth(100);
    refreshWeapon();
    setAction('', -1);

    // 背包：一键丢弃蓝色以下（常见/普通）物品
    el.bpDiscardLow.addEventListener('click', () => {
      const n = INVENTORY.discardBackpackBelow(2);
      renderBackpack();
      toast(n ? '已丢弃 ' + n + ' 件蓝色以下物品' : '没有蓝色以下物品');
    });

    // 仓库：一键丢弃蓝色以下物品（二次确认，避免误删持久物品）
    el.whDiscardLow.addEventListener('click', () => {
      if (!el.whDiscardLow.classList.contains('confirm')) {
        el.whDiscardLow.classList.add('confirm');
        el.whDiscardLow.textContent = '确认丢弃?';
        clearTimeout(el.whDiscardLow._t);
        el.whDiscardLow._t = setTimeout(resetWhDiscardLow, 2500);
        return;
      }
      clearTimeout(el.whDiscardLow._t);
      const n = INVENTORY.discardWarehouseBelow(2);
      renderWarehouse();
      toast(n ? '已丢弃 ' + n + ' 件蓝色以下物品' : '没有蓝色以下物品');
      resetWhDiscardLow();
    });

    // 存档导出（下载 JSON，文件名：四角洲不动+导出时间+资产总值）/ 导入（读取 JSON）/ 删除
    function doExport() {
      const json = INVENTORY.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date(), pad = n => String(n).padStart(2, '0');
      const totalValue = INVENTORY.getStats().totalValue || 0;
      a.download = '四角洲不动-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '-资产' + totalValue + '.json';
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      el.exportSaveBtn.textContent = '已导出 ✓';
      setTimeout(() => { el.exportSaveBtn.textContent = '导出存档'; }, 1500);
    }

    el.exportSaveBtn.addEventListener('click', doExport);

    // 导入前二次确认：覆盖原存档不可恢复
    el.importSaveBtn.addEventListener('click', () => { el.importWarnPanel.classList.add('show'); });
    el.importWarnOkBtn.addEventListener('click', () => { el.importWarnPanel.classList.remove('show'); el.importFile.click(); });
    el.importWarnExportBtn.addEventListener('click', doExport);
    el.importWarnCloseBtn.addEventListener('click', () => el.importWarnPanel.classList.remove('show'));

    el.importFile.addEventListener('change', () => {
      const file = el.importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = INVENTORY.importData(reader.result);
        el.importSaveBtn.textContent = ok ? '已导入 ✓' : '导入失败';
        if (ok) showMenu();
        setTimeout(() => { el.importSaveBtn.textContent = '导入存档'; }, 1500);
        el.importFile.value = '';
      };
      reader.readAsText(file);
    });

    el.deleteSaveBtn.addEventListener('click', () => {
      if (!confirm('确定删除存档？仓库与统计将清空，且无法恢复。')) return;
      INVENTORY.clearSave();
      showMenu();
      el.deleteSaveBtn.textContent = '已删除 ✓';
      setTimeout(() => { el.deleteSaveBtn.textContent = '删除存档'; }, 1500);
    });

    el.openShopBtn.addEventListener('click', openShop);
    el.msCloseBtn.addEventListener('click', closeShop);

    el.loConfirmBtn.addEventListener('click', () => {
      const st = loState();
      Audio.resume();
      if (INVENTORY.getPoints() < st.cost) {
        toast('点数不足，还差 ' + (st.cost - INVENTORY.getPoints()) + ' 点');
        return;
      }
      hideLoadout();
      MAIN.startRun({ maxHp: st.maxHp, cost: st.cost, weapons: st.weapons, medkit: st.medkit, backpackSize: st.slots });
    });
    el.loCancelBtn.addEventListener('click', hideLoadout);
    el.detailCloseBtn.addEventListener('click', closeDetail);

    el.tutorialBtn.addEventListener('click', openTutorial);
    el.tutorialCloseBtn.addEventListener('click', closeTutorial);
    el.redeemBtn.addEventListener('click', openRedeem);
    el.redeemCloseBtn.addEventListener('click', closeRedeem);
    el.redeemCancelBtn.addEventListener('click', closeRedeem);
    el.redeemConfirmBtn.addEventListener('click', () => {
      const r = INVENTORY.enterCode(el.redeemInput.value);
      el.redeemInput.value = '';
      if (r) {
        closeRedeem();
        showMenu();
        toast(r === 'all' ? '兑换成功！已解锁全部内容' : '兑换成功！获得 10000 点数');
      } else {
        toast('兑换码无效');
      }
    });

    el.codexBtn.addEventListener('click', openCodex);
    el.codexCloseBtn.addEventListener('click', closeCodex);
  }

  // —— 基础战斗 HUD ——
  function setMaxHealth(n) { maxHealth = Math.max(1, Math.round(Number(n)) || 1); }
  function setHealth(hp) {
    const pct = Math.min(100, Math.max(0, hp / maxHealth * 100));
    el.healthFill.style.width = pct + '%';
    el.healthText.textContent = Math.max(0, Math.round(hp));
    el.healthFill.style.background = pct > 60 ? '#3ddc84' : (pct > 30 ? '#ffb020' : '#ff4444');
  }

  function refreshWeapon() {
    el.weaponName.textContent = WEAPONS.def().name;
    const r = WEAPONS.reserve();
    el.ammoText.textContent = WEAPONS.ammo() + ' / ' + (r === Infinity ? '∞' : r);
  }
  function refreshAmmo() { refreshWeapon(); }

  function setBloom(b) {
    el.crosshair.style.setProperty('--gap', Math.round(6 + b * 6) + 'px');
  }

  function setReload(progress, timeLeft) {
    const active = progress > 0 && progress < 1;
    el.reloadIndicator.classList.toggle('show', active);
    if (active) {
      const C = 175.93;
      el.reloadRing.style.strokeDashoffset = (C * (1 - progress)).toFixed(2);
      el.reloadText.textContent = timeLeft.toFixed(1);
    }
  }

  function hitmarker(isHead, killed) {
    el.hitmarker.classList.remove('show', 'head', 'kill');
    void el.hitmarker.offsetWidth;
    if (isHead) el.hitmarker.classList.add('head');
    if (killed) el.hitmarker.classList.add('kill');
    el.hitmarker.classList.add('show');
    setTimeout(() => el.hitmarker.classList.remove('show'), 120);
  }

  function flashDamage() {
    el.damageFlash.classList.remove('show');
    void el.damageFlash.offsetWidth;
    el.damageFlash.classList.add('show');
    setTimeout(() => el.damageFlash.classList.remove('show'), 180);
  }

  // —— 顶部信息 ——
  function setKills(n) { el.killCount.textContent = '击杀 ' + n; }
  function onKill() { prompt('击杀 +1'); }
  function setGold(n) { el.goldText.textContent = '💰 ' + n; }
  function setBackpackCount(n) { el.backpackCount.textContent = '背包 ' + n + '/' + INVENTORY.getBackpackSize(); }
  function setTime(seconds) {
    seconds = Math.max(0, seconds);
    const m = Math.floor(seconds / 60), s = seconds % 60;
    el.timeText.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    el.timeText.classList.toggle('low', seconds <= 60);
  }

  // —— 提示（1.2s 自动消失）——
  function prompt(msg) {
    el.prompt.textContent = msg;
    el.prompt.classList.add('show');
    clearTimeout(promptTimer);
    promptTimer = setTimeout(() => el.prompt.classList.remove('show'), 1200);
  }

  // —— 拾取播报（倒计时下方 3 秒：图标 + 品质 + 名称 + 价格）——
  function showPickup(item, note) {
    const rcol = (ITEMS.RARITIES.find(r => r.id === item.rarityId) || {}).color || item.color;
    el.pickupToast.innerHTML = '<img class="pt-icon" draggable="false" src="' + ITEMS.itemIconURL(item, 96) + '" alt="">'
      + '<span class="pt-rarity" style="color:' + rcol + '">' + item.rarityName + '</span>'
      + '<span class="pt-name">' + item.name + '</span>'
      + '<span class="pt-price">$ ' + item.value + '</span>'
      + (note ? '<span class="pt-note">' + note + '</span>' : '');
    el.pickupToast.classList.remove('show');
    void el.pickupToast.offsetWidth;
    el.pickupToast.classList.add('show');
    clearTimeout(pickupTimer);
    pickupTimer = setTimeout(() => el.pickupToast.classList.remove('show'), 3000);
  }

  // —— 精英刷新横幅（顶部飘过）——
  function showEliteBanner() {
    el.eliteBanner.classList.remove('show');
    void el.eliteBanner.offsetWidth;
    el.eliteBanner.classList.add('show');
  }

  // —— 撤离阶段横幅（顶部弹窗 + 倒计时） ——
  function showPhaseBanner(msg, countdown) {
    el.phaseBannerText.textContent = msg;
    phaseBannerCountdown = countdown || 0;
    if (phaseBannerCountdown > 0) {
      el.phaseBannerTime.textContent = phaseBannerCountdown + 's';
      phaseBannerTimer = phaseBannerCountdown;
    } else {
      el.phaseBannerTime.textContent = '';
      phaseBannerTimer = 4; // 无倒计时：显示 4s 后自动隐藏
    }
    el.phaseBanner.classList.remove('show');
    void el.phaseBanner.offsetWidth;
    el.phaseBanner.classList.add('show');
  }
  function tickPhaseBanner(dt) {
    if (phaseBannerTimer <= 0) return;
    phaseBannerTimer -= dt;
    if (phaseBannerCountdown > 0) el.phaseBannerTime.textContent = Math.max(0, Math.ceil(phaseBannerTimer)) + 's';
    if (phaseBannerTimer <= 0) el.phaseBanner.classList.remove('show');
  }

  // —— 交互提示（靠近箱子/商店时显示）——
  function setInteract(text) {
    el.interact.textContent = text;
    el.interact.classList.toggle('show', !!text);
  }

  // —— 开箱 / 撤离进度条 ——
  function setAction(label, p) {
    if (p < 0) { el.actionBar.classList.remove('show'); return; }
    el.actionBar.classList.add('show');
    el.actionLabel.textContent = label;
    el.actionFill.style.width = Math.round(Math.min(1, Math.max(0, p)) * 100) + '%';
  }

  // —— 商店面板 ——
  function updateShopPanel(show) {
    el.shopPanel.classList.toggle('show', show);
    if (!show) return;
    const gold = INVENTORY.getGold();
    let html = '<div class="shop-title">🏪 武器商店（哈基币 ' + gold + '）</div>';
    for (let i = 1; i <= 4; i++) {
      const d = WEAPONS.DEFS[i];
      const owned = WEAPONS.isOwned(i);
      const afford = gold >= d.price;
      const cls = owned ? 'owned' : (afford ? 'afford' : 'poor');
      const state = owned ? '已拥有' : ('$ ' + d.price);
      html += '<div class="shop-item ' + cls + '">'
        + '<span class="shop-key">' + (i + 1) + '</span>'
        + '<span class="shop-name">' + d.name + '</span>'
        + '<span class="shop-price">' + state + '</span>'
        + '</div>';
    }
    html += '<div class="shop-item ' + (gold >= 300 ? '' : 'poor') + '">'
      + '<span class="shop-key">6</span>'
      + '<span class="shop-name">🩹 血包（回 30 HP）</span>'
      + '<span class="shop-price">$ 300</span>'
      + '</div>';
    html += '<div class="shop-foot">按 2/3/4/5 买枪 · 6 买血包 · 1=标配</div>';
    el.shopItems.innerHTML = html;
  }

  // —— Tab 背包面板 ——
  function setBackpackPanel(open) {
    el.backpackPanel.classList.toggle('show', open);
    if (!open) return;
    renderBackpack();
  }

  function parseDrag(data) {
    const m = String(data || '').match(/^(bp|sb):(\d+)$/);
    return m ? { src: m[1], i: parseInt(m[2], 10) } : null;
  }

  function renderBackpack() {
    el.bpGold.textContent = '💰 哈基币 ' + INVENTORY.getGold();
    const items = INVENTORY.backpackItems();
    let html = '';
    for (let i = 0; i < INVENTORY.getBackpackSize(); i++) {
      const it = items[i];
      if (it) {
        const rcol = (ITEMS.RARITIES.find(r => r.id === it.rarityId) || {}).color || it.color;
        html += '<div class="bp-cell" draggable="true" data-i="' + i + '" style="--c:' + it.color + '">'
          + '<span class="bp-price">$ ' + it.value + '</span>'
          + '<img class="bp-emoji" draggable="false" src="' + ITEMS.itemIconURL(it) + '" alt="">'
          + '<div class="bp-info">'
            + '<span class="bp-rarity" style="color:' + rcol + '">' + it.rarityName + '</span>'
            + '<span class="bp-name">' + it.name + '</span>'
          + '</div>'
          + '</div>';
      } else {
        html += '<div class="bp-cell empty" data-i="' + i + '"></div>';
      }
    }
    el.backpackGrid.innerHTML = html;

    // 背包格子作为拖放目标：接收保险箱物品拖回
    el.backpackGrid.querySelectorAll('.bp-cell').forEach(cell => {
      cell.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('dragover'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('dragover');
        const d = parseDrag(e.dataTransfer.getData('text/plain'));
        if (!d || d.src !== 'sb') return;
        const bpi = parseInt(cell.dataset.i, 10);
        if (!Number.isFinite(bpi)) return;
        INVENTORY.moveSafeToBackpack(d.i, bpi);
        renderBackpack();
      });
    });

    // 背包格子作为拖放源（拖到保险箱）；拖出背包面板外则自动丢弃
    el.backpackGrid.querySelectorAll('.bp-cell[draggable]').forEach(cell => {
      cell.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', 'bp:' + cell.dataset.i);
        e.dataTransfer.effectAllowed = 'move';
      });
      cell.addEventListener('dragend', e => {
        if (e.dataTransfer.dropEffect === 'none') {
          BOXES.discardBackpackItem(parseInt(cell.dataset.i, 10));
          renderBackpack();
        }
      });
    });

    renderSafeBox();
  }

  function renderSafeBox() {
    const items = INVENTORY.safeBoxItems();
    const cap = items.length;
    if (cap === 0) {
      el.safeboxGrid.innerHTML = '<div class="sb-lock-tip">商店累计消费 10000 点自动解锁 1 格</div>';
      el.sbSubtitle.textContent = '🔒 保险箱（0/' + INVENTORY.SAFE_MAX + '）';
      return;
    }
    let html = '';
    for (let i = 0; i < cap; i++) {
      const it = items[i];
      if (it) {
        const rcol = (ITEMS.RARITIES.find(r => r.id === it.rarityId) || {}).color || it.color;
        html += '<div class="sb-cell" draggable="true" data-i="' + i + '" style="--c:' + it.color + '">'
          + '<img class="sb-emoji" draggable="false" src="' + ITEMS.itemIconURL(it) + '" alt="">'
          + '<span class="sb-rarity" style="color:' + rcol + '">' + it.rarityName + '</span>'
          + '<span class="sb-name">' + it.name + '</span>'
          + '<span class="sb-price">$ ' + it.value + '</span>'
          + '</div>';
      } else {
        html += '<div class="sb-cell empty" data-i="' + i + '"></div>';
      }
    }
    el.safeboxGrid.innerHTML = html;
    el.sbSubtitle.textContent = '🔒 保险箱（' + cap + '/' + INVENTORY.SAFE_MAX + ' · 死亡保留）';

    // 保险箱格子作为拖放目标：接收背包物品
    el.safeboxGrid.querySelectorAll('.sb-cell').forEach(cell => {
      cell.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('dragover'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('dragover');
        const d = parseDrag(e.dataTransfer.getData('text/plain'));
        if (!d || d.src !== 'bp') return;
        const sbi = parseInt(cell.dataset.i, 10);
        if (!Number.isFinite(sbi)) return;
        INVENTORY.moveBackpackToSafe(d.i, sbi);
        renderBackpack();
      });
    });

    // 保险箱格子作为拖放源：拖回背包
    el.safeboxGrid.querySelectorAll('.sb-cell[draggable]').forEach(cell => {
      cell.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', 'sb:' + cell.dataset.i);
        e.dataTransfer.effectAllowed = 'move';
      });
    });
  }

  function showHint(show) { el.hint.style.display = show ? 'block' : 'none'; }

  // —— 菜单（仓库 + 统计）——
  function showMenu() {
    const s = INVENTORY.getStats();
    const rate = INVENTORY.surviveRate();
    el.menuStats.innerHTML =
      '<div class="stat"><b>' + s.totalRuns + '</b><span>总局数</span></div>' +
      '<div class="stat"><b>' + s.survivedRuns + '</b><span>撤离成功</span></div>' +
      '<div class="stat"><b>' + rate + '%</b><span>存活率</span></div>' +
      '<div class="stat"><b>' + s.totalValue + '</b><span>资产总值</span></div>' +
      '<div class="stat"><b>' + s.totalKills + '</b><span>总击杀</span></div>';
    refreshPoints();
    renderWarehouse();
    el.menuPanel.classList.add('show');
    overlayVisible = true;
    if (s.totalRuns === 0) {
      el.tutorialBtn.classList.add('new');
      toast('👋 新手？点击「新手教程」了解玩法');
    } else {
      el.tutorialBtn.classList.remove('new');
    }
  }

  function renderWarehouse() {
    const s = INVENTORY.getStats();
    const wh = s.warehouse;
    whSelected.clear();
    updateWhSellSelected();
    el.warehouseLeft.dataset.skin = s.preciousSkin;
    el.warehouseLeft.innerHTML = renderPreciousGrid(wh, s.preciousSlots);
    el.warehouseRight.innerHTML = renderWhGrid(wh, s.warehouseSlots);
    wireWhGrid(el.warehouseLeft, true);
    wireWhGrid(el.warehouseRight, false);
  }

  function renderPreciousGrid(wh, slots) {
    let html = '';
    for (let i = 0; i < INVENTORY.PRECIOUS_MAX; i++) {
      html += i < slots ? renderWhCell(wh, i, true) : lockedCell(i, true);
    }
    return html;
  }

  function renderWhGrid(wh, slots) {
    const perPage = INVENTORY.WAREHOUSE_PER_PAGE;
    const pages = Math.max(1, Math.ceil(slots / perPage));
    const from = INVENTORY.PRECIOUS_MAX;
    let html = '';
    for (let p = 0; p < pages; p++) {
      if (p > 0) html += '<div class="wh-page-label">第 ' + (p + 1) + ' 页</div>';
      html += '<div class="wh-page">';
      for (let i = 0; i < perPage; i++) {
        const local = p * perPage + i;
        const idx = from + local;
        html += local < slots ? renderWhCell(wh, idx, false) : lockedCell(idx, false);
      }
      html += '</div>';
    }
    return html;
  }

  function renderWhCell(wh, i, big) {
    const it = wh[i];
    const cls = 'wh-cell' + (big ? ' big' : '');
    if (!it) return '<div class="' + cls + ' empty" data-i="' + i + '"></div>';
    const rcol = (ITEMS.RARITIES.find(r => r.id === it.rarityId) || {}).color || it.color;
    const tip = it.rarityName + ' · ' + it.name + ' · 单价 ' + it.value;
    const op = INVENTORY.wearOpacity(it).toFixed(4);
    return '<div class="' + cls + '" draggable="true" data-i="' + i + '" style="--c:' + it.color + '" title="' + tip + '">'
      + '<img class="wh-emoji" draggable="false" src="' + ITEMS.itemIconURL(it, big ? 128 : 64) + '" style="opacity:' + op + '" alt="">'
      + '<span class="wh-rarity" style="color:' + rcol + '">' + it.rarityName + '</span>'
      + '<span class="wh-name">' + it.name + '</span>'
      + '<span class="wh-price">$ ' + it.value + '</span>'
      + '<button class="wh-sell" data-i="' + i + '" title="售出（1 价值 = 1 点数）">售</button>'
      + '</div>';
  }

  function lockedCell(i, big) {
    const tip = big ? '5000 点解锁' : '500 点解锁';
    return '<div class="wh-cell locked' + (big ? ' big' : '') + '" data-i="' + i + '" title="未解锁 · ' + tip + '">'
      + '<span class="wh-lock">🔒</span>'
      + (big ? '<span class="wh-lock-tip">' + tip + '</span>' : '')
      + '</div>';
  }

  function wireWhGrid(grid, big) {
    grid.querySelectorAll('.wh-cell[draggable]').forEach(cell => {
      cell.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', cell.dataset.i);
        e.dataTransfer.effectAllowed = 'move';
      });
    });
    grid.querySelectorAll('.wh-cell:not(.locked)').forEach(cell => {
      cell.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('dragover');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('dragover');
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = parseInt(cell.dataset.i, 10);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
        INVENTORY.swapSlots(from, to);
        renderWarehouse();
      });
    });
    grid.querySelectorAll('.wh-cell.locked').forEach(cell => {
      cell.addEventListener('click', () => openShop());
    });
    if (big) {
      grid.querySelectorAll('.wh-cell.big:not(.locked):not(.empty)').forEach(cell => {
        cell.addEventListener('click', () => openDetail(parseInt(cell.dataset.i, 10)));
      });
    } else {
      grid.querySelectorAll('.wh-cell:not(.locked):not(.empty)').forEach(cell => {
        cell.addEventListener('click', () => {
          const i = parseInt(cell.dataset.i, 10);
          if (whSelected.has(i)) whSelected.delete(i); else whSelected.add(i);
          cell.classList.toggle('selected', whSelected.has(i));
          updateWhSellSelected();
        });
      });
    }
    grid.querySelectorAll('.wh-sell').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const i = parseInt(btn.dataset.i, 10);
        // 售出统一二次确认（doublecheck）
        if (!btn.classList.contains('confirm')) {
          btn.classList.add('confirm');
          btn.textContent = '确认?';
          clearTimeout(btn._t);
          btn._t = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = '售'; }, 2500);
          return;
        }
        clearTimeout(btn._t);
        const res = INVENTORY.sellItem(i);
        if (res) {
          toast('售出 ' + res.item.rarityName + '·' + res.item.name + '  +' + res.points + ' 点数');
          renderWarehouse();
          refreshPoints();
        }
      });
    });
  }

  // 仓库批量售出状态（多选）
  function updateWhSellSelected() {
    const wh = INVENTORY.getStats().warehouse;
    let count = 0, total = 0;
    for (const i of whSelected) {
      const it = wh[i];
      if (!it) { whSelected.delete(i); continue; }
      count++; total += it.value;
    }
    if (!count) {
      el.whSellSelected.hidden = true;
      el.whSellSelected.classList.remove('confirm');
      el.whSellSelected.textContent = '售出选中';
    } else {
      el.whSellSelected.hidden = false;
      el.whSellSelected.classList.remove('confirm');
      el.whSellSelected.textContent = '售出选中 (' + count + ')  +' + total + ' 点';
    }
  }
  function resetWhSellSelected() { el.whSellSelected.classList.remove('confirm'); updateWhSellSelected(); }
  function resetWhDiscardLow() { el.whDiscardLow.classList.remove('confirm'); el.whDiscardLow.textContent = '🗑️ 丢弃蓝色以下'; }

  // —— 仓库商店 + 点数 ——
  function refreshPoints() {
    const p = INVENTORY.getPoints();
    el.menuPointsNum.textContent = p;
    el.msPointsNum.textContent = p;
  }

  function toast(msg) {
    el.menuToast.textContent = msg;
    el.menuToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.menuToast.classList.remove('show'), 2200);
  }

  function openShop() { renderShop(); el.menuShop.classList.add('show'); }
  function closeShop() { el.menuShop.classList.remove('show'); }

  function openTutorial() { el.tutorialPanel.classList.add('show'); }
  function closeTutorial() { el.tutorialPanel.classList.remove('show'); }
  function openRedeem() { el.redeemInput.value = ''; el.redeemPanel.classList.add('show'); }
  function closeRedeem() { el.redeemPanel.classList.remove('show'); }

  // —— 图鉴（收集进度 + 分档位展示，带出过的高亮并标注日期）——
  function renderCodex() {
    const codex = INVENTORY.getStats().codex || {};
    const cat = ITEMS.catalog();
    let collected = 0;
    let html = '';
    for (const r of ITEMS.RARITIES) {
      const items = cat.filter(i => i.rarityId === r.id);
      if (!items.length) continue;
      let tierCollected = 0, cells = '';
      for (const it of items) {
        const ts = codex[it.name];
        const found = ts != null;
        if (found) { collected++; tierCollected++; }
        cells += '<div class="codex-cell' + (found ? ' found' : '') + '" style="--c:' + it.color + '" data-name="' + it.name + '" title="点击检视">'
          + '<img class="cx-icon' + (found ? '' : ' cx-dim') + '" draggable="false" src="' + ITEMS.itemIconURL(it, 64) + '" alt="">'
          + '<span class="cx-name">' + it.name + '</span>'
          + '<span class="cx-date">' + (found ? formatBeijing(ts).split(' ')[0] : '未收集') + '</span>'
          + '</div>';
      }
      html += '<div class="codex-tier"><div class="codex-tier-title" style="color:' + r.color + '">'
        + '<span class="cx-dot" style="background:' + r.color + '"></span>' + r.name
        + '<span class="cx-count">' + tierCollected + '/' + items.length + '</span></div>'
        + '<div class="codex-grid">' + cells + '</div></div>';
    }
    el.codexGrid.innerHTML = html;
    el.codexTitle.textContent = '📓 图鉴 · 已收集 ' + collected + '/' + cat.length;
    el.codexGrid.querySelectorAll('.codex-cell').forEach(c => {
      c.addEventListener('click', () => previewCodexItem(c.dataset.name));
    });
  }
  function openCodex() { renderCodex(); el.codexPanel.classList.add('show'); }
  function closeCodex() { el.codexPanel.classList.remove('show'); }

  // —— 开局进入方式选择（花费点数）——
  const LOADOUT_ENTRIES = [
    { id: 'eco',    name: 'eco 进入', hp: 50,  slots: 6, cost: 0,   desc: '50 血 · 背包 6 格 · 免费' },
    { id: 'ticket', name: '买票进入', hp: 100, slots: 9, cost: 200, desc: '100 血 · 背包 9 格 · 200 点' },
  ];
  const LOADOUT_ARMOR = [
    { id: 'half',  name: '半甲', hp: 25,  slots: 1, cost: 200, desc: '+25 血 · +1 格' },
    { id: 'full',  name: '全甲', hp: 50,  slots: 3, cost: 400, desc: '+50 血 · +3 格' },
    { id: 'heavy', name: '重甲', hp: 100, slots: 6, cost: 800, desc: '+100 血 · +6 格' },
  ];
  const LOADOUT_EQUIP = [
    { id: 'medkit', name: '血包', cost: 300, medkit: true, desc: '开局背包自带 1 个血包' },
  ];
  const LOADOUT_WEAPONS = [
    { id: 'ghost',   name: '鬼魅', weapon: 1, cost: 300, desc: '300 点' },
    { id: 'spectre', name: '蜂刺', weapon: 2, cost: 500, desc: '500 点' },
    { id: 'vandal',  name: '狂徒', weapon: 3, cost: 800, desc: '800 点' },
  ];
  let loEntry = 'eco';
  let loArmor = null;   // 护甲单选（最多一件）
  const loAddons = {};  // 装备 + 武器（可多选）

  function loState() {
    const entry = LOADOUT_ENTRIES.find(e => e.id === loEntry) || LOADOUT_ENTRIES[0];
    let cost = entry.cost, maxHp = entry.hp, slots = entry.slots, medkit = false;
    const weapons = [];
    const armor = LOADOUT_ARMOR.find(a => a.id === loArmor);
    if (armor) { cost += armor.cost; maxHp += armor.hp; slots += armor.slots; }
    for (const a of LOADOUT_EQUIP) if (loAddons[a.id]) { cost += a.cost; if (a.medkit) medkit = true; }
    for (const a of LOADOUT_WEAPONS) if (loAddons[a.id]) { cost += a.cost; weapons.push(a.weapon); }
    return { maxHp, slots, cost, weapons, medkit };
  }

  function showLoadout() {
    loEntry = 'eco';
    loArmor = null;
    for (const k in loAddons) delete loAddons[k];
    renderLoadout();
    el.loadoutPanel.classList.add('show');
    overlayVisible = true;
  }
  function hideLoadout() { el.loadoutPanel.classList.remove('show'); }

  function renderLoadout() {
    el.loPoints.textContent = INVENTORY.getPoints();
    let html = '';
    for (const e of LOADOUT_ENTRIES) {
      html += '<button class="lo-entry' + (e.id === loEntry ? ' on' : '') + '" data-entry="' + e.id + '">'
        + '<span class="lo-e-name">' + e.name + '</span>'
        + '<span class="lo-e-desc">' + e.desc + '</span>'
        + '</button>';
    }
    el.loEntries.innerHTML = html;

    html = '';
    for (const a of LOADOUT_ARMOR) {
      html += '<button class="lo-addon' + (loArmor === a.id ? ' on' : '') + '" data-armor="' + a.id + '">'
        + '<span class="lo-a-row"><span class="lo-a-name">' + a.name + '</span><span class="lo-a-cost">💎 ' + a.cost + '</span></span>'
        + '<span class="lo-a-desc">' + a.desc + '</span>'
        + '</button>';
    }
    el.loArmor.innerHTML = html;

    html = '';
    for (const a of LOADOUT_EQUIP) {
      html += '<button class="lo-addon' + (loAddons[a.id] ? ' on' : '') + '" data-addon="' + a.id + '">'
        + '<span class="lo-a-row"><span class="lo-a-name">' + a.name + '</span><span class="lo-a-cost">💎 ' + a.cost + '</span></span>'
        + '<span class="lo-a-desc">' + a.desc + '</span>'
        + '</button>';
    }
    el.loEquip.innerHTML = html;

    html = '';
    for (const a of LOADOUT_WEAPONS) {
      html += '<button class="lo-addon' + (loAddons[a.id] ? ' on' : '') + '" data-addon="' + a.id + '">'
        + '<span class="lo-a-row"><span class="lo-a-name">' + a.name + '</span><span class="lo-a-cost">💎 ' + a.cost + '</span></span>'
        + '<span class="lo-a-desc">' + a.desc + '</span>'
        + '</button>';
    }
    el.loWeapons.innerHTML = html;

    el.loEntries.querySelectorAll('[data-entry]').forEach(b => b.addEventListener('click', () => {
      loEntry = b.dataset.entry;
      renderLoadout();
    }));
    el.loArmor.querySelectorAll('[data-armor]').forEach(b => b.addEventListener('click', () => {
      loArmor = loArmor === b.dataset.armor ? null : b.dataset.armor; // 再点一次取消
      renderLoadout();
    }));
    el.loEquip.querySelectorAll('[data-addon]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.addon;
      if (loAddons[id]) delete loAddons[id]; else loAddons[id] = true;
      renderLoadout();
    }));
    el.loWeapons.querySelectorAll('[data-addon]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.addon;
      if (loAddons[id]) delete loAddons[id]; else loAddons[id] = true;
      renderLoadout();
    }));

    const st = loState();
    const p = INVENTORY.getPoints();
    el.loSummary.innerHTML =
      '<span class="lo-hp">❤️ ' + st.maxHp + ' 血 · 🎒 ' + st.slots + ' 格</span>'
      + '<span class="lo-cost' + (p < st.cost ? ' poor' : '') + '">💎 消耗 ' + st.cost + ' 点</span>';
  }

  function renderShop() {
    const s = INVENTORY.getStats();
    refreshPoints();

    const pFull = s.preciousSlots >= INVENTORY.PRECIOUS_MAX;
    el.msPreciousRow.innerHTML =
      '<div class="ms-row-info"><span class="ms-row-name">🗄️ 珍贵展示柜格子</span>'
      + '<span class="ms-row-count">' + s.preciousSlots + '/' + INVENTORY.PRECIOUS_MAX + '</span></div>'
      + (pFull ? '<span class="ms-soldout">售罄</span>'
        : '<button class="ms-buy" data-action="precious">💎 ' + INVENTORY.PRECIOUS_SLOT_PRICE + '</button>');

    const wFull = s.warehouseSlots >= INVENTORY.WAREHOUSE_MAX;
    el.msWarehouseRow.innerHTML =
      '<div class="ms-row-info"><span class="ms-row-name">📦 仓库格子</span>'
      + '<span class="ms-row-count">' + s.warehouseSlots + '/' + INVENTORY.WAREHOUSE_MAX + '</span></div>'
      + (wFull ? '<span class="ms-soldout">售罄</span>'
        : '<button class="ms-buy" data-action="warehouse">💎 ' + INVENTORY.WAREHOUSE_SLOT_PRICE + '</button>');

    // 保险箱：商店内累计消费满 10000 点自动 +1 格，最多 4 格
    const safe = INVENTORY.safeSlots();
    const spent = s.totalSpent;
    let safeHtml;
    if (safe >= INVENTORY.SAFE_MAX) {
      safeHtml = '<div class="ms-row-info"><span class="ms-row-name">🔒 保险箱格子</span>'
        + '<span class="ms-row-count">' + safe + '/' + INVENTORY.SAFE_MAX + '</span>'
        + '<div class="ms-progress"><div class="ms-progress-fill" style="width:100%"></div></div></div>'
        + '<span class="ms-soldout">已满</span>';
    } else {
      const next = (Math.floor(spent / INVENTORY.SAFE_UNLOCK_COST) + 1) * INVENTORY.SAFE_UNLOCK_COST;
      const prog = Math.round((spent % INVENTORY.SAFE_UNLOCK_COST) / INVENTORY.SAFE_UNLOCK_COST * 100);
      safeHtml = '<div class="ms-row-info"><span class="ms-row-name">🔒 保险箱格子</span>'
        + '<span class="ms-row-count">' + safe + '/' + INVENTORY.SAFE_MAX + '</span>'
        + '<div class="ms-progress"><div class="ms-progress-fill" style="width:' + prog + '%"></div></div>'
        + '<span class="ms-row-note">累计消费 ' + spent + ' / ' + next + ' 点自动 +1</span></div>';
    }
    el.msSafeRow.innerHTML = safeHtml;

    let skinHtml = '';
    for (const sk of INVENTORY.getSkins()) {
      const owned = s.ownedSkins.includes(sk.id);
      const active = s.preciousSkin === sk.id;
      let btn;
      if (active) btn = '<span class="ms-active">使用中</span>';
      else if (owned) btn = '<button class="ms-equip" data-skin="' + sk.id + '">装备</button>';
      else btn = '<button class="ms-buy' + (s.points >= sk.price ? '' : ' poor') + '" data-buy="' + sk.id + '">💎 ' + sk.price + '</button>';
      skinHtml += '<div class="ms-skin">'
        + '<span class="ms-swatch sw-' + sk.id + '"></span>'
        + '<span class="ms-skin-name">' + sk.name + '</span>'
        + btn
        + '</div>';
    }
    el.msSkins.innerHTML = skinHtml;

    const buyP = el.msPreciousRow.querySelector('.ms-buy');
    if (buyP) buyP.addEventListener('click', () => {
      const r = INVENTORY.buyPreciousSlot();
      if (r.ok) { toast('已解锁 1 个珍贵展示柜格子'); renderShop(); renderWarehouse(); }
      else toast(r.reason === 'poor' ? '点数不足' : '已达到上限');
    });
    const buyW = el.msWarehouseRow.querySelector('.ms-buy');
    if (buyW) buyW.addEventListener('click', () => {
      const r = INVENTORY.buyWarehouseSlot();
      if (r.ok) { toast('已解锁 1 个仓库格子'); renderShop(); renderWarehouse(); }
      else toast(r.reason === 'poor' ? '点数不足' : '已达到上限');
    });
    el.msSkins.querySelectorAll('.ms-equip').forEach(b => b.addEventListener('click', () => {
      if (INVENTORY.applySkin(b.dataset.skin)) { toast('已更换展示柜皮肤'); renderShop(); renderWarehouse(); }
    }));
    el.msSkins.querySelectorAll('.ms-buy[data-buy]').forEach(b => b.addEventListener('click', () => {
      const r = INVENTORY.buySkin(b.dataset.buy);
      if (r.ok) { INVENTORY.applySkin(b.dataset.buy); toast('已购买皮肤并装备'); renderShop(); renderWarehouse(); }
      else toast(r.reason === 'poor' ? '点数不足' : '已拥有');
    }));
  }

  function hideMenu() { el.menuPanel.classList.remove('show'); el.menuShop.classList.remove('show'); closeDetail(); }

  // —— 检视详情页（珍贵展示柜物品，放大至全屏）——
  function formatBeijing(ts) {
    try { return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }
    catch (e) { return '—'; }
  }

  function openDetail(i) { openDetailItem(INVENTORY.getStats().warehouse[i]); }

  function openDetailItem(item) {
    if (!item) return;
    const rcol = (ITEMS.RARITIES.find(r => r.id === item.rarityId) || {}).color || item.color;
    const wear = (typeof item.wear === 'number' && Number.isFinite(item.wear)) ? item.wear.toFixed(5) : '—';
    const time = item.foundAt ? formatBeijing(item.foundAt) : '—';
    el.detailBody.innerHTML =
      '<div class="detail-view" title="拖拽旋转 · 滚轮缩放"></div>'
      + '<div class="detail-info">'
      + '<div class="detail-name" style="color:' + rcol + '">' + item.name + '</div>'
      + '<div class="detail-line"><span>等级</span><b style="color:' + rcol + '">' + item.rarityName + '</b></div>'
      + '<div class="detail-line"><span>价格</span><b>$ ' + item.value + '</b></div>'
      + '<div class="detail-line"><span>崭新度</span><b>' + wear + '</b></div>'
      + '<div class="detail-line"><span>搜到时间</span><b>' + time + '</b></div>'
      + '</div>';
    el.detailPanel.classList.add('show');
    INSPECT.open(el.detailBody.querySelector('.detail-view'), item);
  }
  function closeDetail() { INSPECT.close(); el.detailPanel.classList.remove('show'); }

  // 图鉴点击：用默认崭新度预览物品 3D 检视（无需已收集）
  function previewCodexItem(name) {
    const def = ITEMS.catalog().find(c => c.name === name);
    if (!def) return;
    openDetailItem({ kind: 'loot', name: def.name, rarityId: def.rarityId, rarityName: def.rarityName, color: def.color, wear: 1.0, value: def.min });
  }

  // —— 结算 ——
  function showResult(data) {
    if (data.won) {
      el.resultTitle.textContent = '撤离成功！';
      el.resultTitle.style.color = '#4bd97a';
      let stats = '<div class="result-line">击杀 ' + data.kills + '</div>'
        + '<div class="result-line">带回资产 +' + data.value + '</div>';
      if (data.overflow > 0) stats += '<div class="result-line warn">仓库已满，溢出折算 +' + data.overflow + '</div>';
      el.resultStats.innerHTML = stats;
    } else {
      el.resultTitle.style.color = '#ff5555';
      el.resultTitle.textContent = data.reason === 'timeout' ? '时间耗尽' : '任务失败';
      let stats = '<div class="result-line">击杀 ' + data.kills + '</div>'
        + '<div class="result-line warn">本局背包物品已丢失</div>';
      if (data.safeValue > 0) stats += '<div class="result-line">保险箱带回 +' + data.safeValue + '</div>';
      if (data.overflow > 0) stats += '<div class="result-line warn">仓库已满，溢出折算 +' + data.overflow + '</div>';
      el.resultStats.innerHTML = stats;
    }
    el.resultPanel.classList.add('show');
    overlayVisible = true;
  }

  function hideResult() { el.resultPanel.classList.remove('show'); }

  function hideOverlay() {
    hideMenu();
    hideResult();
    hideLoadout();
    closeDetail();
    closeTutorial();
    closeRedeem();
    closeCodex();
    overlayVisible = false;
  }
  function isOverlayVisible() { return overlayVisible; }

  return {
    init,
    setHealth, setMaxHealth, refreshWeapon, refreshAmmo, setBloom, setReload, hitmarker, flashDamage,
    setKills, onKill, setGold, setBackpackCount, setTime, prompt, showPickup, showEliteBanner, showPhaseBanner, tickPhaseBanner, setAction, setInteract,
    updateShopPanel, setBackpackPanel, showHint,
    showMenu, hideMenu, showResult, hideResult, hideOverlay, isOverlayVisible, showLoadout,
  };
})();
