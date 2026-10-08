// 敌人：AI 机器人（巡逻/战斗状态机、寻路、射击、死亡掉落、补刷）
const ENEMIES = (function () {
  let scene = null, camera = null, playerObj = null;
  const list = [];
  let spawnPoints = [];
  let kills = 0;
  let reinforceTimer = 0, eliteTimer = 0, nextEliteAt = 0;
  let lastNoise = { x: 0, z: 0, t: -999 }; // 玩家最近一次开枪的位置与时间

  const MAX_ALIVE = 8;
  const SIGHT = 20, HEAR = 35, PATROL_RADIUS = 8, BOT_HP = 100;
  const ELITE_INTERVAL = 90, ELITE_FIRST = 300;

  function init(sc, cam, player) { scene = sc; camera = cam; playerObj = player; }
  function setSpawnPoints(p) { spawnPoints = p; }

  function clear() {
    list.forEach(e => e.dispose());
    list.length = 0;
    kills = 0;
    reinforceTimer = 0;
    eliteTimer = 0;
    nextEliteAt = ELITE_FIRST;
    lastNoise = { x: 0, z: 0, t: -999 };
  }

  function spawnMany(count) {
    const pool = spawnPoints.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const sp = pool[i % pool.length];
      list.push(new Enemy(sp.x, sp.z));
    }
  }

  function resetAndSpawn(count) { clear(); spawnMany(count); }

  function getMeshes() {
    const out = [];
    for (const e of list) if (e.alive) out.push(e.body, e.neck, e.head, e.gun);
    return out;
  }

  function aliveCount() { return list.filter(e => e.alive && !e.elite).length; }
  function getKills() { return kills; }

  function onPlayerShoot() {
    if (playerObj) { lastNoise.x = playerObj.pos.x; lastNoise.z = playerObj.pos.z; lastNoise.t = performance.now() / 1000; }
  }

  function onKill(dead) {
    if (dead.elite) { // 精英：掉 3 个黄箱，不计入击杀、不补刷
      spawnDeathDrop(dead.pos.x, dead.pos.z, true);
      return false;
    }
    kills++;
    INVENTORY.recordKill();
    HUD.setKills(kills);
    spawnDeathDrop(dead.pos.x, dead.pos.z, false);
    respawnAtFarthest();
    return true;
  }

  // 掉落：敌人不再直接掉物品，改为掉「黄色箱子」（开启 1s，60s 未开启即消失；箱内按概率出 1 件战利品）
  function spawnDeathDrop(x, z, elite) {
    if (elite) {
      BOXES.spawnYellowBox(x, z);
      BOXES.spawnYellowBox(x + 0.7, z);
      BOXES.spawnYellowBox(x - 0.7, z);
      return;
    }
    BOXES.spawnYellowBox(x, z);
  }

  function respawnAtFarthest() {
    let best = null, bd = -Infinity;
    for (const sp of spawnPoints) {
      if (isOccupied(sp)) continue;
      const dx = sp.x - playerObj.pos.x, dz = sp.z - playerObj.pos.z;
      const d = dx * dx + dz * dz;
      if (d > bd) { bd = d; best = sp; }
    }
    if (best) list.push(new Enemy(best.x, best.z));
  }

  function spawnReinforcement() {
    let best = null, bd = -Infinity;
    for (const sp of spawnPoints) {
      if (isOccupied(sp)) continue;
      const dx = sp.x - playerObj.pos.x, dz = sp.z - playerObj.pos.z;
      const d = dx * dx + dz * dz;
      if (d > bd) { bd = d; best = sp; }
    }
    if (best) list.push(new Enemy(best.x, best.z));
  }

  function spawnElite() {
    let best = null, bd = -Infinity;
    for (const sp of spawnPoints) {
      if (isOccupied(sp)) continue;
      const dx = sp.x - playerObj.pos.x, dz = sp.z - playerObj.pos.z;
      const d = dx * dx + dz * dz;
      if (d > bd) { bd = d; best = sp; }
    }
    if (best) {
      list.push(new Enemy(best.x, best.z, true));
      HUD.showEliteBanner();
    }
  }

  function isOccupied(sp) {
    for (const e of list) {
      if (!e.alive) continue;
      const dx = e.pos.x - sp.x, dz = e.pos.z - sp.z;
      if (dx * dx + dz * dz < 9) return true;
    }
    return false;
  }

  function update(dt) {
    const now = performance.now() / 1000;
    list.forEach(e => e.update(dt, now));

    reinforceTimer += dt;
    if (reinforceTimer >= 60) {
      reinforceTimer = 0;
      if (aliveCount() < MAX_ALIVE) spawnReinforcement();
    }

    eliteTimer += dt;
    if (eliteTimer >= nextEliteAt) { // 游戏 5 分钟后才开始刷新精英
      spawnElite();
      nextEliteAt += ELITE_INTERVAL;
    }
  }

  class Enemy {
    constructor(x, z, elite) {
      this.pos = new THREE.Vector3(x, 0, z);
      this.home = { x, z };
      this.elite = !!elite;
      this.hp = this.elite ? 1000 : BOT_HP;
      this.alive = true;
      this.radius = 0.4;
      this.speed = 3.0;
      this.state = 'patrol';
      this.patrolTarget = null;
      this.patrolTimer = 0;
      this.fireCooldown = Math.random() * 0.5;
      this.reaction = 1;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 0;
      this.lastKnown = null;
      this.deathTimer = 0;
      this.footstepTimer = 0;
      this.buildMesh();
    }

    buildMesh() {
      this.group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: this.elite ? 0xff2a2a : 0xffd900, roughness: 0.5 });
      const headMat = new THREE.MeshStandardMaterial({ color: this.elite ? 0xff5a5a : 0xffee33, roughness: 0.5 });
      const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000 });

      // 命中盒稍放大，并新增「脖子」mesh 补齐身体与头部之间的虚空（命中按身体计）
      this.body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.84, 0.36), bodyMat);
      this.body.position.y = 0.9;
      this.body.castShadow = true;
      this.body.userData = { type: 'body', enemy: this };
      this.body.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.body.geometry), edgeMat));

      this.neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), bodyMat);
      this.neck.position.y = 1.37;
      this.neck.userData = { type: 'body', enemy: this };
      this.neck.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.neck.geometry), edgeMat));

      this.head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), headMat);
      this.head.position.y = 1.58;
      this.head.castShadow = true;
      this.head.userData = { type: 'head', enemy: this };
      this.head.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.head.geometry), edgeMat));

      this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.5), gunMat);
      this.gun.position.set(0.28, 0.95, 0.15);
      this.gun.userData = { type: 'body', enemy: this };

      this.group.add(this.body, this.neck, this.head, this.gun);
      if (this.elite) {
        this.group.scale.setScalar(1.5); // 体积更大 50%
        const shield = MAP.sprite('🛡️', 0.8); shield.position.set(0, 1.1, 0.55);
        this.group.add(shield); // 身前盾牌标记
      }
      scene.add(this.group);
    }

    dispose() {
      scene.remove(this.group);
      this.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }

    takeDamage(dmg, isHead, dir) {
      if (!this.alive) return false;
      this.hp -= dmg;
      if (this.hp <= 0) {
        this.alive = false;
        this.deathTimer = 1.3;
        this.group.rotation.x = -Math.PI / 2;
        return true;
      }
      // 受击即警觉，奔向玩家大致方向
      this.state = 'combat';
      if (playerObj) this.lastKnown = { x: playerObj.pos.x, z: playerObj.pos.z };
      return false;
    }

    update(dt, now) {
      if (!this.alive) {
        if (this.deathTimer > 0) {
          this.deathTimer -= dt;
          this.group.position.y -= dt * 0.5;
          if (this.deathTimer <= 0) this.group.visible = false;
        }
        return;
      }
      if (!playerObj.alive) return;

      const dx = playerObj.pos.x - this.pos.x, dz = playerObj.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const hasLOS = dist < SIGHT && hasLineOfSight(this, playerObj);

      // 听枪声：1 秒内、35 单位内 → 警觉并调查
      if (now - lastNoise.t < 1.0) {
        const ndx = lastNoise.x - this.pos.x, ndz = lastNoise.z - this.pos.z;
        if (ndx * ndx + ndz * ndz < HEAR * HEAR) {
          this.state = 'combat';
          this.lastKnown = { x: lastNoise.x, z: lastNoise.z };
        }
      }

      // 状态机
      if (hasLOS) {
        this.state = 'combat';
        this.lastKnown = { x: playerObj.pos.x, z: playerObj.pos.z };
      } else if (this.state === 'combat' && this.lastKnown) {
        const kdx = this.lastKnown.x - this.pos.x, kdz = this.lastKnown.z - this.pos.z;
        if (kdx * kdx + kdz * kdz < 1.5) { this.state = 'patrol'; this.lastKnown = null; }
      } else if (dist < 12) {
        this.state = 'combat';
        this.lastKnown = { x: playerObj.pos.x, z: playerObj.pos.z };
      }

      let moveDir;
      if (this.state === 'combat') {
        const tx = this.lastKnown ? this.lastKnown.x : playerObj.pos.x;
        const tz = this.lastKnown ? this.lastKnown.z : playerObj.pos.z;
        const tdx = tx - this.pos.x, tdz = tz - this.pos.z;
        const tlen = Math.hypot(tdx, tdz) || 1;
        const toT = new THREE.Vector3(tdx / tlen, 0, tdz / tlen);
        this.group.rotation.y = Math.atan2(toT.x, toT.z);

        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 0.3 + Math.random() * 0.4; }
        const strafe = new THREE.Vector3(-toT.z, 0, toT.x).multiplyScalar(this.strafeDir);

        const strafeScale = dist < 8 ? 0.5 : 1.0; // 接近玩家时横向随机移动减半
        if (hasLOS && dist > 4) {
          moveDir = this.navigate(toT).addScaledVector(strafe, 0.2 * strafeScale);
        } else if (dist > 2.5) {
          moveDir = this.navigate(toT).addScaledVector(strafe, 0.25 * strafeScale);
        } else {
          // 贴脸：横向移动随距离进一步减小，避免贴脸左右横跳
          const closeScale = Math.max(0.06, (dist / 2.5) * 0.25);
          moveDir = strafe.clone().multiplyScalar(closeScale * 0.5);
        }
        this.move(moveDir.normalize(), dt * 1.0);
      } else {
        // patrol：在家点附近随机游走
        this.patrolTimer -= dt;
        if (!this.patrolTarget || this.patrolTimer <= 0 || this.reachedTarget()) {
          const ang = Math.random() * Math.PI * 2, r = Math.random() * PATROL_RADIUS;
          this.patrolTarget = { x: this.home.x + Math.cos(ang) * r, z: this.home.z + Math.sin(ang) * r };
          this.patrolTimer = 3 + Math.random() * 3;
        }
        const pdx = this.patrolTarget.x - this.pos.x, pdz = this.patrolTarget.z - this.pos.z;
        const plen = Math.hypot(pdx, pdz);
        if (plen > 0.3) {
          const dir = new THREE.Vector3(pdx / plen, 0, pdz / plen);
          this.group.rotation.y = Math.atan2(dir.x, dir.z);
          this.move(this.navigate(dir), dt * 0.7);
        }
      }

      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0 && dist < 35) {
        this.footstepTimer = 0.35 + Math.random() * 0.3;
        Audio.enemyFootstep();
      }

      if (this.state === 'combat') {
        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (hasLOS) {
          if (this.reaction > 0) this.reaction -= dt;
          else if (this.fireCooldown <= 0 && dist < 30) this.shoot();
        } else {
          this.reaction = 1;
        }
      }

      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    }

    reachedTarget() {
      if (!this.patrolTarget) return true;
      const dx = this.patrolTarget.x - this.pos.x, dz = this.patrolTarget.z - this.pos.z;
      return dx * dx + dz * dz < 0.6;
    }

    move(dir, dt) {
      const nx = this.pos.x + dir.x * this.speed * dt;
      const nz = this.pos.z + dir.z * this.speed * dt;
      const r = MAP.resolve(nx, nz, this.radius);
      this.pos.x = r.x; this.pos.z = r.z;
    }

    probeBlocked(dir) {
      let total = 0;
      for (const d of [0.8, 1.8, 2.8]) {
        const tx = this.pos.x + dir.x * d;
        const tz = this.pos.z + dir.z * d;
        const r = MAP.resolve(tx, tz, this.radius);
        total += (tx - r.x) * (tx - r.x) + (tz - r.z) * (tz - r.z);
      }
      return total;
    }

    navigate(toward) {
      const baseAngle = Math.atan2(toward.x, toward.z);
      const samples = [0, 18, -18, 36, -36, 54, -54, 72, -72, 90, -90, 110, -110, 130, -130];
      let bestDir = toward, bestScore = -Infinity;
      for (const ang of samples) {
        const a = baseAngle + ang * Math.PI / 180;
        const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const blocked = this.probeBlocked(dir);
        const score = dir.dot(toward) * 3 - blocked;
        if (score > bestScore) { bestScore = score; bestDir = dir; }
      }
      return bestDir;
    }

    shoot() {
      this.fireCooldown = 0.6 + Math.random() * 0.5;
      this.group.updateMatrixWorld(true);
      const muzzle = new THREE.Vector3(0.2, 1.5, 0.2).applyMatrix4(this.group.matrixWorld);
      const target = playerObj.pos.clone();
      const dist = muzzle.distanceTo(target);
      const dir = target.sub(muzzle).normalize();
      const errDeg = Math.max(0.6, (3.2 - dist * 0.07) * 1.1);
      const err = errDeg * Math.PI / 180;
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, (Math.random() * 2 - 1) * err)
         .addScaledVector(up, (Math.random() * 2 - 1) * err)
         .normalize();

      const raycaster = new THREE.Raycaster(muzzle, dir, 0.01, 200);
      const hits = raycaster.intersectObjects(MAP.world.shootables.concat([playerObj.hitbox]), false);
      if (hits.length) {
        const h = hits[0];
        if (h.object === playerObj.hitbox) {
          const dmg = 5 + Math.random() * 3;
          playerObj.takeDamage(this.elite ? dmg * 2 : dmg); // 精英伤害 200%
        } else {
          Effects.spark(h.point, h.face ? h.face.normal : null);
        }
        Effects.tracer(muzzle, h.point);
      } else {
        Effects.tracer(muzzle, muzzle.clone().add(dir.clone().multiplyScalar(200)));
      }
      Effects.muzzleFlash(muzzle);
      Audio.enemyShot();
    }
  }

  function hasLineOfSight(enemy, player) {
    const from = enemy.pos.clone(); from.y = 1.5;
    const to = player.pos.clone(); to.y = 1.5;
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist > 60) return false;
    dir.normalize();
    const raycaster = new THREE.Raycaster(from, dir, 0.1, dist - 0.2);
    return raycaster.intersectObjects(MAP.world.shootables, false).length === 0;
  }

  return { init, setSpawnPoints, resetAndSpawn, clear, getMeshes, aliveCount, getKills, onPlayerShoot, onKill, update, getList: () => list };
})();
