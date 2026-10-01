// 音效：Web Audio 程序化合成（无需外部音频文件）
const Audio = (function () {
  let ctx = null, master = null, noiseBuf = null;
  let streak = 0, streakTimer = null;
  let killEls = {}, preloaded = false; // 击杀音效（原版 mp3，<audio> 元素）

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noise() {
    const c = ensure(); if (!c) return null;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function noiseBurst(duration, freq, gain, type) {
    const c = ensure(); if (!c) return;
    const buf = noise(); if (!buf) return;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + duration + 0.02);
  }

  function tone(freq, duration, gain, type) {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + duration + 0.02);
  }

  function shoot(kind) {
    if (kind === 'pistol') { noiseBurst(0.12, 2200, 0.5); tone(170, 0.08, 0.28); }
    else if (kind === 'rifle') { noiseBurst(0.10, 1800, 0.5); tone(130, 0.07, 0.28); }
    else if (kind === 'smg') { noiseBurst(0.07, 2600, 0.4); tone(230, 0.05, 0.2); }
    else if (kind === 'sniper') { noiseBurst(0.22, 800, 0.6); tone(70, 0.18, 0.42, 'sawtooth'); }
    else if (kind === 'odin') { noiseBurst(0.14, 900, 0.55); tone(90, 0.1, 0.32, 'sawtooth'); }
    else { noiseBurst(0.05, 3000, 0.2); }
  }

  // 预加载击杀音效（原版 mp3）。用 <audio> 元素而非 fetch，
  // 这样本地直接 file:// 打开也能播放（fetch 在 file:// 下会被浏览器拦截）。
  function preload() {
    if (preloaded) return;
    preloaded = true;
    for (let i = 1; i <= 6; i++) {
      const a = document.createElement('audio');
      a.src = 'audio/kill-' + i + '.mp3';
      a.preload = 'auto';
      a.volume = 0.5; // 与程序化音效的 master 音量保持一致
      a.addEventListener('error', () => console.warn('[audio] 击杀音效加载失败 kill-' + i + '.mp3'));
      killEls[i] = a;
    }
  }

  function kill() {
    streak++;
    clearTimeout(streakTimer);
    streakTimer = setTimeout(() => { streak = 0; }, 10000); // 10 秒内无击杀则连杀清零
    const n = Math.min(streak, 6);
    const a = killEls[n];
    if (a) {
      try { a.currentTime = 0; } catch (e) { /* 忽略 */ }
      a.play().catch(() => {});
    } else {
      tone([330, 392, 494, 587, 659, 784][n - 1], 0.16, 0.35, 'triangle'); // 回退：程序化合成升调
    }
  }

  function resetStreak() {
    streak = 0;
    clearTimeout(streakTimer);
  }

  return {
    resume: ensure,
    preload,
    shoot,
    kill,
    resetStreak,
    enemyShot() { noiseBurst(0.08, 1500, 0.25); tone(150, 0.06, 0.15); },
    dryfire() { tone(700, 0.05, 0.15); },
    reload() { tone(300, 0.05, 0.2); setTimeout(() => tone(500, 0.05, 0.2), 160); },
    hit() { tone(1200, 0.05, 0.22); },
    headshot() { tone(1800, 0.08, 0.28); },
    enemyDie() { tone(120, 0.4, 0.4, 'sawtooth'); },
    hurt() { noiseBurst(0.2, 800, 0.5); tone(100, 0.2, 0.3, 'sawtooth'); },
    footstep() { noiseBurst(0.06, 500, 0.1); },
    enemyFootstep() { noiseBurst(0.05, 400, 0.05); }, // 敌人脚步（低音量）
    jump() { tone(400, 0.1, 0.1, 'sine'); },
    pickup() { tone(880, 0.06, 0.2, 'sine'); tone(1320, 0.08, 0.15, 'sine'); },
    open() { tone(440, 0.08, 0.22, 'triangle'); setTimeout(() => tone(660, 0.1, 0.22, 'triangle'), 90); },
    buy() { tone(520, 0.08, 0.25, 'triangle'); setTimeout(() => tone(780, 0.12, 0.25, 'triangle'), 100); },
    extract() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.3, 'triangle'), i * 120)); },
    win() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.3, 'triangle'), i * 150)); },
    lose() { [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.3, 'sawtooth'), i * 200)); },
  };
})();
