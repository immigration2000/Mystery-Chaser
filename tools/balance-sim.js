// 전투 공식을 게임(js/game.js)과 동일하게 구현한 밸런스 시뮬레이터
// 시나리오: 그라인딩·뽑기 없이 챕터 1→5 순차 진행 (시작 카드 + 첫 클리어 카드만 보유)
// 사용법: node tools/balance-sim.js
// 규칙·수치를 바꾸면 반드시 재실행하고 docs/FEATURE_SPEC.md §7.4 표를 갱신할 것
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
  silver_knife: { type: 'weapon', value: 6 },
  hunter_mail:  { type: 'armor',  value: 6 },
  headsman:     { type: 'weapon', value: 10 },
  shadow_cloak: { type: 'charm',  value: 6 },
};

const CHAPTERS = [
  { enemy: { hp: 90,  atk: 10, def: 3,  agi: 6  }, rewardCard: 'silver_knife' },
  { enemy: { hp: 130, atk: 13, def: 5,  agi: 9  }, rewardCard: 'hunter_mail' },
  { enemy: { hp: 180, atk: 16, def: 8,  agi: 5  }, rewardCard: 'headsman' },
  { enemy: { hp: 210, atk: 18, def: 9,  agi: 12 }, rewardCard: 'shadow_cloak' },
  { enemy: { hp: 280, atk: 21, def: 11, agi: 11 }, rewardCard: null },
];

// 그라인딩 없는 진행 시 챕터별 도전 레벨 (exp 60/80/110/150, need lv*40)
const LEVEL_AT = [1, 2, 3, 4, 5];

const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const dmgRoll = (atk, def) => Math.max(1, Math.round(atk * rand(0.9, 1.1) - def * 0.5));

function deckFor(chapterIdx) {
  const ids = ['rusty_dagger', 'rusty_dagger', 'old_coat', 'bandage', 'bandage'];
  for (let i = 0; i < chapterIdx; i++) if (CHAPTERS[i].rewardCard) ids.push(CHAPTERS[i].rewardCard);
  return ids;
}

function simulate(charKey, chapterIdx) {
  const c = CHARACTERS[charKey];
  const lv = LEVEL_AT[chapterIdx] - 1;
  const base = { maxHp: c.hp + lv * 8, atk: c.atk + lv * 2, def: c.def + lv * 1, agi: c.agi + lv * 1 };
  const e = { ...CHAPTERS[chapterIdx].enemy };

  let php = base.maxHp, ehp = e.hp;
  let atkB = 0, defB = 0, agiB = 0, atkMulTurns = 0, enemyAtkMul = 1;
  let skillUsed = false; let pierceNext = false; let lifesteal = false; let enemyDefMul = 1;
  const deck = shuffle(deckFor(chapterIdx).slice());
  const hand = [];
  const draw = () => { if (hand.length < 5 && deck.length) hand.push(deck.pop()); };
  for (let i = 0; i < 3; i++) draw();

  for (let round = 1; round <= 60; round++) {
    // 카드 정책: HP 45% 미만이면 회복 우선, 아니면 무기 > 방어구 > 장신구
    let idx = -1;
    if (php < base.maxHp * 0.45) idx = hand.findIndex(id => CARDS[id].type === 'heal');
    if (idx < 0) idx = hand.findIndex(id => CARDS[id].type === 'weapon');
    if (idx < 0) idx = hand.findIndex(id => CARDS[id].type === 'armor');
    if (idx < 0) idx = hand.findIndex(id => CARDS[id].type === 'charm');
    if (idx >= 0) {
      const card = CARDS[hand[idx]];
      hand.splice(idx, 1);
      if (card.type === 'weapon') atkB += card.value;
      else if (card.type === 'armor') defB += card.value;
      else if (card.type === 'charm') agiB += card.value;
      else php = Math.min(base.maxHp, php + card.value);
    }
    // 스킬 정책
    if (!skillUsed) {
      if (c.skill === 'enemyAtkDown' && round === 1) { enemyAtkMul = 0.7; skillUsed = true; }
      else if (c.skill === 'heal40' && php < base.maxHp * 0.5) { php = Math.min(base.maxHp, php + Math.round(base.maxHp * 0.4)); skillUsed = true; }
      else if (c.skill === 'draw2' && round === 2) { draw(); draw(); pierceNext = true; skillUsed = true; }
      else if (c.skill === 'atkMul2t' && round === 2) { atkMulTurns = 3; skillUsed = true; }
      else if (c.skill === 'lifesteal' && round === 1) { lifesteal = true; skillUsed = true; }
      else if (c.skill === 'defCurse' && round === 1) { enemyDefMul = 0.5; skillUsed = true; }
    }

    const pAtk = Math.round((base.atk + atkB) * (atkMulTurns > 0 ? 1.5 : 1));
    const pDef = base.def + defB;
    const pAgi = base.agi + agiB;

    const playerHit = () => {
      if (pierceNext) { ehp -= Math.round(pAtk * 2); pierceNext = false; return; } // 관통은 필중
      const dodge = Math.min(0.3, Math.max(0, (e.agi - pAgi) * 0.03));
      if (Math.random() < dodge) return;
      const dmg = dmgRoll(pAtk, e.def * enemyDefMul);
      ehp -= dmg;
      if (lifesteal) php = Math.min(base.maxHp, php + Math.round(dmg * 0.2));
    };
    const enemyHit = () => {
      const a = e.atk * enemyAtkMul;
      if (round % 4 === 0) { php -= Math.max(1, Math.round(a * 1.3)); return; }
      const dodge = Math.min(0.3, Math.max(0, (pAgi - e.agi) * 0.03));
      if (Math.random() < dodge) return;
      php -= dmgRoll(a, pDef);
    };
    if (pAgi >= e.agi) { playerHit(); if (ehp > 0) enemyHit(); }
    else { enemyHit(); if (php > 0) playerHit(); }
    if (ehp <= 0) return { win: true, rounds: round, hpLeft: php / base.maxHp };
    if (php <= 0) return { win: false, rounds: round, hpLeft: 0 };
    if (atkMulTurns > 0) atkMulTurns--;
    draw();
  }
  return { win: false, rounds: 60, hpLeft: 0 };
}

const N = 5000;
console.log('시나리오: 그라인딩 없이 순차 진행 / 시행 ' + N + '회');
console.log('char\t' + CHAPTERS.map((_, i) => `ch${i + 1}`).join('\t'));
for (const charKey of Object.keys(CHARACTERS)) {
  const row = [charKey];
  for (let ch = 0; ch < CHAPTERS.length; ch++) {
    let wins = 0, roundSum = 0, hpSum = 0;
    for (let i = 0; i < N; i++) {
      const r = simulate(charKey, ch);
      if (r.win) { wins++; roundSum += r.rounds; hpSum += r.hpLeft; }
    }
    const wr = (wins / N * 100).toFixed(0);
    const avgR = wins ? (roundSum / wins).toFixed(1) : '-';
    const avgHp = wins ? (hpSum / wins * 100).toFixed(0) : '-';
    row.push(`${wr}% ${avgR}R ${avgHp}%hp`);
  }
  console.log(row.join('\t'));
}


// ---- 일일 던전: 레벨 스케일링 적 (파밍 콘텐츠, 목표 승률 >= 90%) ----
function dungeonEnemy(lv) {
  return { hp: 60 + 18 * lv, atk: Math.round(8 + 2.4 * lv), def: 2 + lv, agi: Math.round(5 + 1.2 * lv) };
}

// simulate()의 챕터 0 슬롯을 임시로 던전 적으로 바꿔 재사용.
// 산차는 시작 카드 5장만 사용 — 실플레이보다 보수적인(약한) 가정.
function simulateDungeon(charKey, lv) {
  const saveEnemy = CHAPTERS[0].enemy;
  const saveLv = LEVEL_AT[0];
  CHAPTERS[0] = { enemy: dungeonEnemy(lv), rewardCard: CHAPTERS[0].rewardCard };
  LEVEL_AT[0] = lv;
  const r = simulate(charKey, 0);
  CHAPTERS[0] = { enemy: saveEnemy, rewardCard: CHAPTERS[0].rewardCard };
  LEVEL_AT[0] = saveLv;
  return r;
}

console.log('\n일일 던전 (레벨 스케일링 적) 승률:');
console.log('char\t' + [1,2,3,4,5,6].map(l => 'Lv' + l).join('\t'));
for (const charKey of Object.keys(CHARACTERS)) {
  const row = [charKey];
  for (const lv of [1,2,3,4,5,6]) {
    let wins = 0, hpSum = 0;
    for (let i = 0; i < N; i++) { const r = simulateDungeon(charKey, lv); if (r.win) { wins++; hpSum += r.hpLeft; } }
    row.push((wins / N * 100).toFixed(0) + '% ' + (wins ? (hpSum / wins * 100).toFixed(0) : '-') + 'hp');
  }
  console.log(row.join('\t'));
}
