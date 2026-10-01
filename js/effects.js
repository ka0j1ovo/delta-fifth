// 特效：弹道、枪口火焰、血迹、火花
const Effects = (function () {
  let scene = null;
  const tracers = [], flashes = [], particles = [];

  function init(s) { scene = s; }

  function tracer(from, to) {
    const mat = new THREE.LineBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.9 });
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function muzzleFlash(pos, scale) {
    const s = scale || 1;
    const light = new THREE.PointLight(0xffdd88, 3 * s, 12, 2);
    light.position.copy(pos);
    scene.add(light);
    flashes.push({ light, life: 0.05, base: 3 * s });
  }

  function blood(pos, isHead) { burst(pos, isHead ? 0xff3b3b : 0xcc2222, isHead ? 14 : 8); }
  function spark(pos, normal) { burst(pos, 0xff9933, 6, normal); }

  function burst(pos, color, count, normal) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9, (Math.random() - 0.5))
        .normalize().multiplyScalar(2 + Math.random() * 3);
      if (normal) v.add(normal.clone().multiplyScalar(1.2));
      scene.add(m);
      particles.push({ m, vel: v, life: 0.5 });
    }
  }

  function update(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07);
      if (t.life <= 0) {
        scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= dt;
      f.light.intensity = f.base * Math.max(0, f.life / 0.05);
      if (f.life <= 0) { scene.remove(f.light); flashes.splice(i, 1); }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.vel.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.material.opacity = Math.max(0, p.life / 0.5);
      if (p.life <= 0) {
        scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose();
        particles.splice(i, 1);
      }
    }
  }

  return { init, tracer, muzzleFlash, blood, spark, update };
})();
