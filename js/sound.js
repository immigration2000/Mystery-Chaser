// WebAudio 합성 SFX (FEATURE_SPEC §11) — 외부 에셋 없음, 실패해도 게임 진행에 영향 없음
'use strict';

const Sound = (() => {
  const MUTE_KEY = 'mc-muted';
  let ctx = null;
  let muted = localStorage.getItem(MUTE_KEY) === '1';

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 단일 톤: 주파수(freq→slideTo), 길이(초), 파형, 음량, 시작 지연(초)
  function tone(freq, dur, type = 'square', gain = 0.05, delay = 0, slideTo = null) {
    const c = ensureCtx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function safe(fn) {
    return (...args) => {
      if (muted) return;
      try { fn(...args); } catch (e) { /* 사운드 실패는 무시 */ }
    };
  }

  return {
    hit: safe(() => tone(220, 0.09, 'square', 0.05, 0, 110)),
    dodge: safe(() => tone(700, 0.08, 'sine', 0.04, 0, 1200)),
    dark: safe(() => { tone(160, 0.35, 'sawtooth', 0.05, 0, 55); tone(90, 0.4, 'triangle', 0.04, 0.05, 40); }),
    card: safe(() => tone(520, 0.07, 'triangle', 0.045, 0, 660)),
    skill: safe(() => { tone(440, 0.1, 'sine', 0.05); tone(660, 0.12, 'sine', 0.05, 0.08); }),
    win: safe(() => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.05, i * 0.11)); }),
    lose: safe(() => { [330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.04, i * 0.16)); }),
    gacha: safe(() => { tone(392, 0.09, 'triangle', 0.05); tone(523, 0.11, 'triangle', 0.05, 0.07); }),
    legend: safe(() => { [523, 659, 784, 988, 1319].forEach((f, i) => tone(f, 0.2, 'sine', 0.055, i * 0.09)); }),
    levelup: safe(() => { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.14, 'triangle', 0.05, i * 0.09)); }),
    isMuted: () => muted,
    toggle: () => {
      muted = !muted;
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      return muted;
    },
  };
})();
