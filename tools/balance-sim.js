// 밸런스 시뮬레이터 (v1.0 원작 재현판) — 덱 순환식 전투
// 원작 플레이 증언 기반: 카드=공격 수단(공격/회피 스탯), 캐릭터 HP 단일, 덱 소진 시 리셔플,
// 민첩 선공, 캐릭터 스킬 1회, 특정 카드 집중 강화(에이스), 레벨업 시 덱 지참 한도 증가
// 사용법: node tools/balance-sim.js — 수치 변경 시 재실행 후 docs/FEATURE_SPEC.md §7 갱신
'use strict';

const CHARACTERS = {
  edwin:  { hp: 90,  atk: 12, agi: 8,  skill: 'enemyAtkDown' }, // 적 공격 -30%
  gregor: { hp: 110, atk: 10, agi: 6,  skill: 'heal40' },
  aria:   { hp: 85,  atk: 9,  agi: 10, skill: 'draw2' },
  jack:   { hp: 85,  atk: 11, agi: 12, skill: 'atkMul3t' },     // 3라운드 x1.5
  violeta:{ hp: 95,  atk: 11, agi: 9,  skill: 'lifesteal' },
  margo:  { hp: 78,  atk: 13, agi: 7,  skill: 'agiCurse' },     // 원작 마녀: 적 민첩 대폭 감소 (선공 탈취)
};

// 전투 카드: atk(데미지) / eva(회피 %)
const CARDS = {
  rusty_dagger: { rarity: 'common', atk: 8,  eva: 5 },
  old_coat:     { rarity: 'common', atk: 4,  eva: 18 },
  silver_knife: { rarity: 'rare',   atk: 12, eva: 8 },
  hunter_mail:  { rarity: 'rare',   atk: 6,  eva: 26 },
  pocket_watch: { rarity: 'rare',   atk: 9,  eva: 15 },
  headsman:     { rarity: 'hero',   atk: 18, eva: 4 },
  abbey_plate:  { rarity: 'hero',   atk: 8,  eva: 32 },
  shadow_cloak: { rarity: 'hero',   atk: 11, eva: 26 },
  whisper:      { rarity: 'legend', atk: 24, eva: 10 },
  martyr_relic: { rarity: 'legend', atk: 12, eva: 38 },
  time_watch:   { rarity: 'legend', atk: 17, eva: 28 },
};

// 강화: +1당 atk +2, eva +2%p (최대 +5)
const upAtk = (id, lv) => CARDS[id].atk + 2 * lv;
const upEva = (id, lv) => Math.min(45, CARDS[id].eva + 2 * lv);

const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

const DECK_LIMIT = (level) => Math.min(12, 4 + level);

// side: { charKey, level, deck: [ids], upgrades: {id: lv}, isStoryEnemy(흑마법) }
function makeSide(cfg) {
  const c = CHARACTERS[cfg.charKey] || cfg.enemyChar; // 적은 enemyChar로 직접 지정 가능
  return {
    ...cfg,
    maxHp: cfg.hp !== undefined ? cfg.hp : c.hp + (cfg.level - 1) * 8,
    hp: 0,
    agi: (cfg.agi !== undefined ? cfg.agi : c.agi) + (cfg.charKey ? Math.floor((cfg.level - 1) / 2) : 0),
    atkBonus: cfg.isStoryEnemy ? cfg.atk : Math.round(c.atk / 2) + (cfg.level - 1),
    skill: cfg.skill !== undefined ? cfg.skill : (c ? c.skill : null),
    drawPile: [], discard: [], hand: [],
    played: null, skillUsed: false, atkMulTurns: 0, oppAtkMul: 1, lifesteal: false,
  };
}

function initSide(s) {
  s.hp = s.maxHp;
  s.drawPile = shuffle(s.deck.slice());
  s.discard = []; s.hand = [];
  for (let i = 0; i < 3; i++) draw(s);
}

function draw(s) {
  if (s.drawPile.length === 0 && s.discard.length > 0) {
    s.drawPile = shuffle(s.discard); s.discard = [];
  }
  if (s.drawPile.length > 0 && s.hand.length < 5) s.hand.push(s.drawPile.pop());
}

const cardAtk = (s, id) => upAtk(id, (s.upgrades && s.upgrades[id]) || 0);
const cardEva = (s, id) => upEva(id, (s.upgrades && s.upgrades[id]) || 0);

// 카드 선택 정책: 평소 최고 공격, HP 40% 미만이면 최고 회피
function pickCard(s) {
  if (s.hand.length === 0) return null;
  const key = s.hp < s.maxHp * 0.4 ? (id) => cardEva(s, id) : (id) => cardAtk(s, id);
  let best = 0;
  for (let i = 1; i < s.hand.length; i++) if (key(s.hand[i]) > key(s.hand[best])) best = i;
  return s.hand.splice(best, 1)[0];
}

function useSkill(s, opp, round) {
  if (!s.skill || s.skillUsed) return;
  const t =
    (s.skill === 'enemyAtkDown' && round === 1) ||
    (s.skill === 'heal40' && s.hp < s.maxHp * 0.5) ||
    (s.skill === 'draw2' && round === 2) ||
    (s.skill === 'atkMul3t' && round === 2) ||
    (s.skill === 'lifesteal' && round === 1) ||
    (s.skill === 'agiCurse' && round === 1);
  if (!t) return;
  s.skillUsed = true;
  if (s.skill === 'enemyAtkDown') opp.oppAtkMul = 0.7;
  else if (s.skill === 'heal40') s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.4));
  else if (s.skill === 'draw2') { draw(s); draw(s); }
  else if (s.skill === 'atkMul3t') s.atkMulTurns = 3;
  else if (s.skill === 'lifesteal') s.lifesteal = true;
  else if (s.skill === 'agiCurse') opp.agi = Math.max(1, opp.agi - 6); // 선공 탈취
}

function attack(att, dfd, round) {
  const dark = att.isStoryEnemy && round % 5 === 0; // 스토리 적 흑마법: 회피 불가 +20%
  const base = cardAtk(att, att.played) + att.atkBonus;
  const mul = (att.atkMulTurns > 0 ? 1.5 : 1) * att.oppAtkMul;
  let dmg;
  if (dark) {
    dmg = Math.max(1, Math.round(base * mul * 1.2));
  } else {
    const eva = dfd.played ? cardEva(dfd, dfd.played) : 0;
    if (Math.random() * 100 < eva) return; // 회피!
    dmg = Math.max(1, Math.round(base * mul * rand(0.9, 1.1)));
  }
  dfd.hp -= dmg;
  if (att.lifesteal) att.hp = Math.min(att.maxHp, att.hp + Math.round(dmg * 0.2));
}

function simulate(cfgA, cfgB) {
  const A = makeSide(cfgA), B = makeSide(cfgB);
  initSide(A); initSide(B);
  A.potions = (cfgA.potions || [30, 30]).slice();
  for (let round = 1; round <= 30; round++) {
    if (A.potions.length > 0 && A.hp < A.maxHp * 0.45) { A.hp = Math.min(A.maxHp, A.hp + A.potions.shift()); }
    A.played = pickCard(A); B.played = pickCard(B);
    useSkill(A, B, round); useSkill(B, A, round);
    const first = A.agi >= B.agi ? A : B;
    const second = first === A ? B : A;
    attack(first, second, round);
    if (second.hp > 0) attack(second, first, round);
    if (A.hp <= 0 && B.hp <= 0) return { win: A.hp >= B.hp, rounds: round, hpLeft: 0 };
    if (B.hp <= 0) return { win: true, rounds: round, hpLeft: A.hp / A.maxHp };
    if (A.hp <= 0) return { win: false, rounds: round, hpLeft: 0 };
    if (A.played) A.discard.push(A.played);
    if (B.played) B.discard.push(B.played);
    A.played = B.played = null;
    if (A.atkMulTurns > 0) A.atkMulTurns--;
    if (B.atkMulTurns > 0) B.atkMulTurns--;
    draw(A); draw(B);
  }
  return { win: false, rounds: 30, hpLeft: 0 };
}

// ---- 시나리오: 그라인딩 없는 순차 진행 ----
// 시작 덱: 녹슨 단검x3 + 낡은 코트x2 (한도 5 = 4+Lv1)
// 첫 클리어 보상: 은장도/사냥꾼갑주/처형인대검/그림자망토/위스퍼 (기존 유지)
function playerDeckAt(chapterIdx, level) {
  const owned = ['rusty_dagger', 'rusty_dagger', 'rusty_dagger', 'old_coat', 'old_coat'];
  const rewards = ['silver_knife', 'hunter_mail', 'headsman', 'shadow_cloak', 'whisper'];
  for (let i = 0; i < chapterIdx; i++) owned.push(rewards[i]);
  // 덱 자동 구성: (atk+eva) 상위 limit장
  const limit = DECK_LIMIT(level);
  return owned
    .sort((a, b) => (CARDS[b].atk + CARDS[b].eva) - (CARDS[a].atk + CARDS[a].eva))
    .slice(0, limit);
}

// 챕터 적 (튜닝 대상): hp/agi/atk(캐릭터식 공격치)/level/deck
const CHAPTERS = [
  { name: 'ch1 부두 노동자', hp: 80,  agi: 6,  atk: 1, level: 1, deck: ['rusty_dagger','rusty_dagger','rusty_dagger','old_coat','old_coat'] },
  { name: 'ch2 수도사',     hp: 110, agi: 8,  atk: 3, level: 2, deck: ['rusty_dagger','rusty_dagger','silver_knife','silver_knife','old_coat','old_coat'] },
  { name: 'ch3 실험체9호',  hp: 140, agi: 5,  atk: 4, level: 3, deck: ['silver_knife','silver_knife','hunter_mail','hunter_mail','rusty_dagger','rusty_dagger'] },
  { name: 'ch4 마녀그림자', hp: 170, agi: 11, atk: 6, level: 4, deck: ['silver_knife','silver_knife','shadow_cloak','shadow_cloak','pocket_watch','pocket_watch','hunter_mail'] },
  { name: 'ch5 발타자르',   hp: 225, agi: 10, atk: 6, level: 5, deck: ['headsman','headsman','abbey_plate','abbey_plate','whisper','shadow_cloak','silver_knife'] },
];
const LEVEL_AT = [1, 2, 3, 4, 5];

const N = 5000;
console.log(`원작 재현 전투 시나리오 (시행 ${N}회) — 강화·뽑기 없음`);
console.log('char\t' + CHAPTERS.map((_, i) => `ch${i + 1}`).join('\t'));
for (const charKey of Object.keys(CHARACTERS)) {
  const row = [charKey];
  for (let ch = 0; ch < CHAPTERS.length; ch++) {
    const e = CHAPTERS[ch];
    let wins = 0, hpSum = 0, rSum = 0;
    for (let i = 0; i < N; i++) {
      const POTIONS = [[30,30],[30,30],[30,60],[60,60],[60,60]][ch];
      const r = simulate(
        { charKey, level: LEVEL_AT[ch], deck: playerDeckAt(ch, LEVEL_AT[ch]), upgrades: {}, potions: POTIONS },
        { hp: e.hp, agi: e.agi, atk: e.atk, level: e.level, deck: e.deck, skill: null, isStoryEnemy: true },
      );
      if (r.win) { wins++; hpSum += r.hpLeft; rSum += r.rounds; }
    }
    row.push(`${(wins / N * 100).toFixed(0)}% ${(wins ? rSum / wins : 0).toFixed(1)}R ${(wins ? hpSum / wins * 100 : 0).toFixed(0)}hp`);
  }
  console.log(row.join('\t'));
}

// 에이스 강화 검증: ch5를 은장도+5 (에이스) 들고 도전 시 승률 변화
console.log('\n에이스 강화 효과 (ch5, 에이스 headsman +5):');
for (const charKey of ['aria', 'margo']) {
  let base = 0, aced = 0;
  for (let i = 0; i < N; i++) {
    const e = CHAPTERS[4];
    if (simulate({ charKey, level: 5, deck: playerDeckAt(4, 5), upgrades: {}, potions: [60,60] },
      { hp: e.hp, agi: e.agi, atk: e.atk, level: e.level, deck: e.deck, skill: null, isStoryEnemy: true }).win) base++;
    if (simulate({ charKey, level: 5, deck: playerDeckAt(4, 5), upgrades: { headsman: 5 }, potions: [60,60] },
      { hp: e.hp, agi: e.agi, atk: e.atk, level: e.level, deck: e.deck, skill: null, isStoryEnemy: true }).win) aced++;
  }
  console.log(`${charKey}: 무강화 ${(base / N * 100).toFixed(0)}% → 에이스+5 ${(aced / N * 100).toFixed(0)}%`);
}


// ---- 일일 던전 (레벨 스케일링) ----
function dungeonEnemy(L) {
  const pool = L <= 2 ? ['rusty_dagger','rusty_dagger','old_coat','silver_knife','hunter_mail']
    : L <= 4 ? ['silver_knife','silver_knife','hunter_mail','pocket_watch','shadow_cloak','rusty_dagger']
    : ['silver_knife','headsman','shadow_cloak','abbey_plate','pocket_watch','whisper'];
  return { hp: 45 + 15 * L, agi: 4 + L, atk: Math.max(0, L - 2), level: L, deck: pool.slice(0, 5 + Math.min(3, L)), isStoryEnemy: true };
}
console.log('\n일일 던전 승률 (물약 30x1):');
console.log('char\t' + [1,2,3,4,5,6].map(l => 'Lv' + l).join('\t'));
for (const charKey of Object.keys(CHARACTERS)) {
  const row = [charKey];
  for (const L of [1,2,3,4,5,6]) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (simulate({ charKey, level: L, deck: playerDeckAt(Math.min(5, L - 1), L), upgrades: {}, potions: [30] }, dungeonEnemy(L)).win) wins++;
    }
    row.push((wins / N * 100).toFixed(0) + '%');
  }
  console.log(row.join('\t'));
}

// ---- PvP 리그 사다리 (양측 캐릭터+덱, 흑마법 없음) ----
const STARTER5 = ['rusty_dagger','rusty_dagger','rusty_dagger','old_coat','old_coat'];
const LADDER = [
  { name: '롬',     charKey: 'aria',    level: 1, deck: [...STARTER5] },
  { name: '피트',   charKey: 'jack',    level: 1, deck: [...STARTER5] },
  { name: '셀레네', charKey: 'aria',    level: 4, deck: [...STARTER5, 'silver_knife', 'pocket_watch', 'shadow_cloak'] },
  { name: '브람',   charKey: 'gregor',  level: 3, deck: [...STARTER5, 'silver_knife'] },
  { name: '오스카', charKey: 'edwin',   level: 5, deck: [...STARTER5, 'headsman', 'hunter_mail', 'silver_knife'] },
  { name: '진홍',   charKey: 'violeta', level: 7, deck: [...STARTER5, 'headsman', 'abbey_plate', 'shadow_cloak', 'silver_knife', 'pocket_watch', 'silver_knife'] },
  { name: '후계',   charKey: 'margo',   level: 9, deck: ['whisper', 'martyr_relic', 'headsman', 'shadow_cloak', 'abbey_plate', 'silver_knife', 'silver_knife', 'pocket_watch', 'hunter_mail', 'rusty_dagger', 'rusty_dagger', 'old_coat'].slice(0, DECK_LIMIT(9)) },
];
const CHALL = [
  { level: 3, ch: 2 }, { level: 3, ch: 2 }, { level: 4, ch: 3 }, { level: 5, ch: 4 }, // #3 셀레네, #4 브람
  { level: 6, ch: 5 }, { level: 7, ch: 5 }, { level: 9, ch: 5 },
];
console.log('\nPvP 리그 (도전자: 기대 레벨·진행 덱·물약 없음):');
console.log('rung\t' + Object.keys(CHARACTERS).join('\t'));
LADDER.forEach((g, i) => {
  const row = ['#' + (i + 1) + ' ' + g.name];
  for (const charKey of Object.keys(CHARACTERS)) {
    let wins = 0;
    for (let n = 0; n < 3000; n++) {
      if (simulate(
        { charKey, level: CHALL[i].level, deck: playerDeckAt(CHALL[i].ch, CHALL[i].level), upgrades: {}, potions: [30] },
        { charKey: g.charKey, level: g.level, deck: g.deck, upgrades: g.upgrades || {} },
      ).win) wins++;
    }
    row.push((wins / 3000 * 100).toFixed(0) + '%');
  }
  console.log(row.join('\t'));
});
