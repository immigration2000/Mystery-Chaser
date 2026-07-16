// PvP(그림자 결투) 시뮬레이터 — 양측 모두 카드 정책/스킬/회피를 사용, 흑마법 없음
// 30라운드 초과는 무승부(도전자 패배 취급)
// 사용법: node tools/pvp-sim.js
// 리그 고스트(LADDER)를 바꾸면 반드시 재실행하고 docs/FEATURE_SPEC.md §7.7 표와
// js/data.js 의 GHOST_LADDER 를 함께 갱신할 것
'use strict';

const CHARACTERS = {
  edwin:  { hp: 90,  atk: 12, def: 6, agi: 8,  skill: 'enemyAtkDown' },
  gregor: { hp: 110, atk: 10, def: 8, agi: 6,  skill: 'heal40' },
  aria:   { hp: 85,  atk: 9,  def: 5, agi: 10, skill: 'draw2' },
  jack:   { hp: 85,  atk: 11, def: 5, agi: 12, skill: 'atkMul2t' },
  violeta:{ hp: 95,  atk: 11, def: 6, agi: 9,  skill: 'lifesteal' },
  margo:  { hp: 78,  atk: 13, def: 4, agi: 9,  skill: 'defCurse' },
};

const CARDS = {
  rusty_dagger: { type: 'weapon', value: 3 },
  old_coat:     { type: 'armor',  value: 3 },
  bandage:      { type: 'heal',   value: 15 },
  tonic:        { type: 'charm',  value: 2 },
  silver_knife: { type: 'weapon', value: 6 },
  hunter_mail:  { type: 'armor',  value: 6 },
  holy_water:   { type: 'heal',   value: 30 },
  pocket_watch: { type: 'charm',  value: 4 },
  headsman:     { type: 'weapon', value: 10 },
  abbey_plate:  { type: 'armor',  value: 10 },
  elixir:       { type: 'heal',   value: 50 },
  shadow_cloak: { type: 'charm',  value: 6 },
  whisper:      { type: 'weapon', value: 15 },
  martyr_relic: { type: 'armor',  value: 15 },
  life_potion:  { type: 'heal',   value: 9999 },
  time_watch:   { type: 'charm',  value: 10 },
};

const STARTER = ['rusty_dagger', 'rusty_dagger', 'old_coat', 'bandage', 'bandage'];
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

function effVal(id, ups) {
  const c = CARDS[id];
  if (c.value >= 9999) return c.value;
  return Math.round(c.value * (1 + 0.25 * ((ups && ups[id]) || 0)));
}

function makeSide(build) {
  const c = CHARACTERS[build.charId];
  const lv = build.level - 1;
  const base = { maxHp: c.hp + lv * 8, atk: c.atk + lv * 2, def: c.def + lv * 1, agi: c.agi + lv * 1 };
  return {
    charId: build.charId, skill: c.skill, ups: build.upgrades || {},
    base, hp: base.maxHp,
    atkB: 0, defB: 0, agiB: 0, atkMulTurns: 0, pierceNext: false, lifesteal: false,
    oppAtkMul: 1, oppDefMul: 1, // 상대가 나에게 건 디버프
    deck: shuffle(build.deck.slice()), hand: [], skillUsed: false,
  };
}

function draw(s) { if (s.hand.length < 5 && s.deck.length) s.hand.push(s.deck.pop()); }

function act(s, round) {
  // 카드 정책: HP 45% 미만 회복 우선, 아니면 무기 > 방어구 > 장신구
  let idx = -1;
  if (s.hp < s.base.maxHp * 0.45) idx = s.hand.findIndex(id => CARDS[id].type === 'heal');
  if (idx < 0) idx = s.hand.findIndex(id => CARDS[id].type === 'weapon');
  if (idx < 0) idx = s.hand.findIndex(id => CARDS[id].type === 'armor');
  if (idx < 0) idx = s.hand.findIndex(id => CARDS[id].type === 'charm');
  if (idx >= 0) {
    const id = s.hand.splice(idx, 1)[0];
    const t = CARDS[id].type, v = effVal(id, s.ups);
    if (t === 'weapon') s.atkB += v;
    else if (t === 'armor') s.defB += v;
    else if (t === 'charm') s.agiB += v;
    else s.hp = Math.min(s.base.maxHp, s.hp + v);
  }
  return idx >= 0;
}

function useSkill(s, opp, round) {
  if (s.skillUsed) return;
  const trigger =
    (s.skill === 'enemyAtkDown' && round === 1) ||
    (s.skill === 'heal40' && s.hp < s.base.maxHp * 0.5) ||
    (s.skill === 'draw2' && round === 2) ||
    (s.skill === 'atkMul2t' && round === 2) ||
    (s.skill === 'lifesteal' && round === 1) ||
    (s.skill === 'defCurse' && round === 1);
  if (!trigger) return;
  s.skillUsed = true;
  if (s.skill === 'enemyAtkDown') opp.oppAtkMul = 0.7;
  else if (s.skill === 'heal40') s.hp = Math.min(s.base.maxHp, s.hp + Math.round(s.base.maxHp * 0.4));
  else if (s.skill === 'draw2') { draw(s); draw(s); s.pierceNext = true; }
  else if (s.skill === 'atkMul2t') s.atkMulTurns = 3;
  else if (s.skill === 'lifesteal') s.lifesteal = true;
  else if (s.skill === 'defCurse') opp.oppDefMul = 0.5;
}

const atkOf = (s) => Math.round((s.base.atk + s.atkB) * (s.atkMulTurns > 0 ? 1.5 : 1) * s.oppAtkMul);
const defOf = (s) => (s.base.def + s.defB) * s.oppDefMul;
const agiOf = (s) => s.base.agi + s.agiB;

function attack(att, dfd) {
  let dmg;
  if (att.pierceNext) {
    dmg = Math.round(atkOf(att) * 2);
    att.pierceNext = false;
  } else {
    const dodge = Math.min(0.3, Math.max(0, (agiOf(dfd) - agiOf(att)) * 0.03));
    if (Math.random() < dodge) return;
    dmg = Math.max(1, Math.round(atkOf(att) * rand(0.9, 1.1) - defOf(dfd) * 0.5));
  }
  dfd.hp -= dmg;
  if (att.lifesteal) att.hp = Math.min(att.base.maxHp, att.hp + Math.round(dmg * 0.2));
}

// A(도전자) 승리 여부. 30라운드 초과 무승부 = 도전자 패배
function simulatePvp(buildA, buildB) {
  const A = makeSide(buildA), B = makeSide(buildB);
  for (let i = 0; i < 3; i++) { draw(A); draw(B); }
  for (let round = 1; round <= 30; round++) {
    act(A, round); act(B, round);
    useSkill(A, B, round); useSkill(B, A, round);
    const first = agiOf(A) >= agiOf(B) ? A : B;
    const second = first === A ? B : A;
    attack(first, second);
    if (second.hp > 0) attack(second, first);
    if (A.hp <= 0 && B.hp <= 0) return A.hp >= B.hp; // 동시 사망: 체력 우위
    if (B.hp <= 0) return true;
    if (A.hp <= 0) return false;
    if (A.atkMulTurns > 0) A.atkMulTurns--;
    if (B.atkMulTurns > 0) B.atkMulTurns--;
    draw(A); draw(B);
  }
  return false;
}

// ---- 리그 고스트 사다리 (튜닝 대상) ----
const LADDER = [
  { name: '견습 체이서 롬',     charId: 'edwin',   level: 2, deck: [...STARTER], upgrades: {} },
  { name: '뒷골목 해결사 피트', charId: 'jack',    level: 2, deck: [...STARTER], upgrades: {} },
  { name: '순례자 브람',        charId: 'gregor',  level: 4, deck: [...STARTER, 'hunter_mail', 'holy_water'], upgrades: {} },
  { name: '기록보관인 셀레네',  charId: 'aria',    level: 5, deck: [...STARTER, 'silver_knife', 'pocket_watch'], upgrades: {} },
  { name: '순찰대장 오스카',    charId: 'edwin',   level: 5, deck: [...STARTER, 'headsman'], upgrades: {} },
  { name: '진홍의 밤',          charId: 'violeta', level: 7, deck: [...STARTER, 'headsman', 'abbey_plate', 'holy_water'], upgrades: { headsman: 1 } },
  { name: '대마녀의 후계',      charId: 'margo',   level: 9, deck: [...STARTER, 'whisper', 'martyr_relic', 'elixir'], upgrades: { whisper: 1 } },
];

// 도전자 모델: 각 단계 도달 시점의 기대 레벨/덱 (진행 덱, 뽑기 미포함 = 보수적)
const progressionDeck = (cleared) => {
  const d = [...STARTER];
  const firstClears = ['silver_knife', 'hunter_mail', 'headsman', 'shadow_cloak', 'whisper'];
  for (let i = 0; i < Math.min(cleared, 5); i++) d.push(firstClears[i]);
  return d;
};
const CHALLENGERS = [
  { level: 3, cleared: 2 }, { level: 3, cleared: 2 }, { level: 4, cleared: 3 },
  { level: 5, cleared: 4 }, { level: 6, cleared: 5 }, { level: 7, cleared: 5 },
  { level: 9, cleared: 5 },
];

const N = 4000;
console.log(`리그 사다리 검증 (시행 ${N}회) — 도전자: 해당 단계 기대 레벨, 진행 덱, 강화 없음`);
console.log('rung\tghost\t\t' + Object.keys(CHARACTERS).join('\t'));
LADDER.forEach((g, i) => {
  const ch = CHALLENGERS[i];
  const row = [`#${i + 1}`, `${g.name}(${g.charId} Lv${g.level})`.padEnd(18)];
  for (const charId of Object.keys(CHARACTERS)) {
    let wins = 0;
    for (let n = 0; n < N; n++) {
      if (simulatePvp({ charId, level: ch.level, deck: progressionDeck(ch.cleared), upgrades: {} }, g)) wins++;
    }
    row.push((wins / N * 100).toFixed(0) + '%');
  }
  console.log(row.join('\t'));
});
