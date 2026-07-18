// 미스테리 체이서: 검은 촛불 — 게임 로직 (v1.0 원작 재현판)
// 전투: 덱 순환식 — 매 라운드 양측이 카드 1장을 내고, 그 카드의 공격/회피로 겨룬다.
'use strict';

const SAVE_KEY_V1 = 'mystery-chaser-fan-save-v1';
const SAVE_KEY_V2 = 'mystery-chaser-fan-save-v2';
const SAVE_KEY_V3 = 'mystery-chaser-fan-save-v3';
const SAVE_KEY_V4 = 'mystery-chaser-fan-save-v4';
const SAVE_KEY = 'mystery-chaser-fan-save-v5';

let state = null;
let battle = null;
let sceneCtx = null;

// ---------- 유틸 ----------
const $ = (sel) => document.querySelector(sel);
const rand = (a, b) => a + Math.random() * (b - a);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
}

// ---------- 저장/불러오기 ----------
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function freshDaily() { return { date: today(), runs: DUNGEON_RUNS_PER_DAY }; }

function newState(charId) {
  const s = {
    charId,
    level: 1,
    exp: 0,
    gold: 120,
    cards: { ...STARTING_CARDS },   // 전투 카드 컬렉션 (id → 수량)
    deck: [],                        // 덱: 지참할 카드 id 배열 (한도 = 4+레벨)
    items: { ...STARTING_ITEMS },    // 소모품 (id → 수량)
    upgrades: {},                    // 카드 강화 레벨 (0~5)
    cleared: 0,
    pity: 0,
    daily: freshDaily(),
    pvp: { rank: 0 },
  };
  s.deck = autoBuildDeck(s);
  return s;
}

let saveWasCorrupted = false;

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  try {
    // 마이그레이션 체인: v1→...→v4→v5 (v5: 전투 모델 개편 — deck/items 추가, 소모품 분리)
    const raw = localStorage.getItem(SAVE_KEY)
      || localStorage.getItem(SAVE_KEY_V4)
      || localStorage.getItem(SAVE_KEY_V3)
      || localStorage.getItem(SAVE_KEY_V2)
      || localStorage.getItem(SAVE_KEY_V1);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !CHARACTERS[s.charId]) { saveWasCorrupted = true; return null; }
    if (!s.upgrades) s.upgrades = {};
    if (typeof s.pity !== 'number') s.pity = 0;
    if (!s.daily || !s.daily.date) s.daily = freshDaily();
    if (!s.pvp || typeof s.pvp.rank !== 'number') s.pvp = { rank: 0 };
    // 마이그레이션 세이브에는 기본 소모품을 새로 지급하지 않는다 (구 소모품 카드가 이관됨)
    if (!s.items) s.items = {};
    // 구버전 컬렉션 정리: 소모품이던 카드는 items로 이관, 미지의 id 제거, 강화 0~5 클램프
    const cards = {};
    for (const [id, n] of Object.entries(s.cards || {})) {
      if (CARDS[id]) cards[id] = n;
      else if (CONSUMABLES[id]) s.items[id] = (s.items[id] || 0) + n;
    }
    if (Object.keys(cards).length === 0) Object.assign(cards, STARTING_CARDS);
    s.cards = cards;
    const ups = {};
    for (const [id, lv] of Object.entries(s.upgrades)) {
      if (CARDS[id] && Number.isInteger(lv)) ups[id] = Math.max(0, Math.min(UPGRADE_MAX, lv));
    }
    s.upgrades = ups;
    if (!Array.isArray(s.deck) || s.deck.length === 0) s.deck = autoBuildDeck(s);
    s.deck = sanitizeDeck(s);
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    [SAVE_KEY_V1, SAVE_KEY_V2, SAVE_KEY_V3, SAVE_KEY_V4].forEach(k => localStorage.removeItem(k));
    return s;
  } catch (e) {
    saveWasCorrupted = true;
    return null;
  }
}

// ---------- 능력치 / 성장 ----------
function expNeeded(level) { return level * 40; }

function playerStats() {
  const c = CHARACTERS[state.charId];
  const lv = state.level - 1;
  return {
    maxHp: c.hp + lv * 8,
    agi: c.agi + Math.floor(lv / 2),
    atkBonus: Math.round(c.atk / 2) + lv,
  };
}

function gainExp(amount) {
  state.exp += amount;
  let ups = 0;
  while (state.exp >= expNeeded(state.level)) {
    state.exp -= expNeeded(state.level);
    state.level++;
    ups++;
  }
  return ups;
}

// ---------- 카드 강화 (에이스 육성) ----------
function upLv(cardId) { return (state && state.upgrades[cardId]) || 0; }
function effAtk(cardId, ups) { return upgradedAtk(cardId, (ups || state.upgrades)[cardId] || 0); }
function effEva(cardId, ups) { return upgradedEva(cardId, (ups || state.upgrades)[cardId] || 0); }

function cardLabel(cardId, ups) {
  const lv = ((ups || state.upgrades)[cardId] || 0);
  return CARDS[cardId].name + (lv > 0 ? ` +${lv}` : '');
}

function canUpgrade(cardId) {
  return upLv(cardId) < UPGRADE_MAX
    && (state.cards[cardId] || 0) > 0
    && state.gold >= upgradeCost(cardId, upLv(cardId));
}

function doUpgrade(cardId) {
  if (!canUpgrade(cardId)) return false;
  state.gold -= upgradeCost(cardId, upLv(cardId));
  state.upgrades[cardId] = upLv(cardId) + 1;
  save();
  return true;
}

// ---------- 덱 ----------
function deckLimit() { return DECK_LIMIT(state.level); }

// 보유 수량을 넘거나 미지의 카드가 든 덱을 정리
function sanitizeDeck(s) {
  const remain = { ...s.cards };
  const deck = [];
  for (const id of s.deck) {
    if (CARDS[id] && remain[id] > 0 && deck.length < DECK_LIMIT(s.level)) {
      remain[id]--;
      deck.push(id);
    }
  }
  return deck;
}

// 자동 편성: (공격+회피) 상위 카드로 한도까지
function autoBuildDeck(s) {
  const pool = [];
  for (const [id, n] of Object.entries(s.cards)) {
    for (let i = 0; i < n; i++) pool.push(id);
  }
  const score = (id) => upgradedAtk(id, (s.upgrades && s.upgrades[id]) || 0) + upgradedEva(id, (s.upgrades && s.upgrades[id]) || 0);
  return pool.sort((a, b) => score(b) - score(a)).slice(0, DECK_LIMIT(s.level));
}

// ---------- 타이틀 / 캐릭터 선택 ----------
function renderTitle() {
  const s = load();
  const btn = $('#btn-start');
  if (s) {
    const c = CHARACTERS[s.charId];
    btn.textContent = `이어서 추적 — ${c.icon} ${c.name} Lv.${s.level}`;
  } else {
    btn.textContent = '추적 시작';
  }
}

function initTitle() {
  renderTitle();
  $('#btn-start').onclick = () => {
    const saved = load();
    if (saved) {
      state = saved;
      renderHub();
      show('hub');
    } else {
      if (saveWasCorrupted) {
        alert('저장 데이터를 읽을 수 없어 새 추적을 시작합니다.');
        saveWasCorrupted = false;
      }
      renderCharSelect();
      show('select');
    }
  };
  $('#btn-reset').onclick = () => {
    if (confirm('저장된 추적 기록을 모두 삭제할까요?')) {
      [SAVE_KEY, SAVE_KEY_V4, SAVE_KEY_V3, SAVE_KEY_V2, SAVE_KEY_V1].forEach(k => localStorage.removeItem(k));
      state = null;
      renderTitle();
      alert('기록이 삭제되었습니다.');
    }
  };
}

function renderCharSelect(switchMode = false) {
  $('#select-title').textContent = switchMode ? '체이서 교대' : '체이서를 선택하라';
  $('#btn-select-back').style.display = switchMode ? 'block' : 'none';
  const cleared = switchMode ? state.cleared : 0;
  const wrap = $('#char-list');
  wrap.innerHTML = '';
  Object.values(CHARACTERS).forEach(c => {
    const locked = c.unlockAfter > cleared;
    const active = switchMode && state.charId === c.id;
    const div = document.createElement('div');
    div.className = 'char-card' + (locked ? ' locked' : '') + (active ? ' active-char' : '');
    if (locked) {
      div.innerHTML = `
        <div class="char-head">
          <span class="char-icon">👤</span>
          <div>
            <div class="char-name">???</div>
            <div class="char-title">제${c.unlockAfter}장 클리어 시 해금</div>
          </div>
        </div>`;
      wrap.appendChild(div);
      return;
    }
    div.innerHTML = `
      <div class="char-head">
        <span class="char-icon">${c.icon}</span>
        <div>
          <div class="char-name">${c.name}${active ? ' <span class="char-active-badge">출전 중</span>' : ''}</div>
          <div class="char-title">${c.title}</div>
        </div>
      </div>
      <div class="char-stats">HP ${c.hp} · 공격 보정 +${Math.round(c.atk / 2)} · 민첩 ${c.agi}</div>
      <div class="char-skill"><b>${c.skill.name}</b> — ${c.skill.desc}</div>`;
    div.onclick = () => {
      if (switchMode) {
        state.charId = c.id;
        save();
      } else {
        state = newState(c.id);
        save();
      }
      renderHub();
      show('hub');
    };
    wrap.appendChild(div);
  });
}

$('#btn-select-back').onclick = () => { renderHub(); show('hub'); };

// ---------- 허브 ----------
function renderHub() {
  const c = CHARACTERS[state.charId];
  const ps = playerStats();
  const need = expNeeded(state.level);
  const pct = Math.min(100, Math.round(state.exp / need * 100));
  const champion = state.pvp.rank >= GHOST_LADDER.length ? ' <span class="rc-legend">🏆 밤의 챔피언</span>' : '';
  $('#hub-status').innerHTML = `
    <div>${c.icon} <b>${c.name}</b> <span style="color:var(--dim)">· ${c.title}</span>${champion}</div>
    <div>Lv.${state.level} &nbsp; HP ${ps.maxHp} · 공격 보정 +${ps.atkBonus} · 민첩 ${ps.agi}</div>
    <div>🃏 덱 ${state.deck.length} / ${deckLimit()}장 &nbsp; <span class="gold">🪙 ${state.gold} 골드</span></div>
    <div style="font-size:11px;color:var(--dim)">EXP ${state.exp} / ${need}</div>
    <div class="expbar"><div class="expfill" style="width:${pct}%"></div></div>`;

  $('#btn-sound').textContent = Sound.isMuted() ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
  const dBtn = $('#btn-nav-dungeon');
  if (state.cleared < 1) {
    dBtn.disabled = true;
    dBtn.textContent = '🌑 밤거리 순찰 — 제1장 클리어 시 해금';
  } else {
    dBtn.disabled = false;
    dBtn.textContent = `🌑 밤거리 순찰 — 오늘 ${dungeonRunsLeft()}회 남음`;
  }
  const pBtn = $('#btn-nav-pvp');
  if (state.cleared < PVP_UNLOCK_CLEARED) {
    pBtn.disabled = true;
    pBtn.textContent = `🕯️ 그림자 결투 — 제${PVP_UNLOCK_CLEARED}장 클리어 시 해금`;
  } else {
    pBtn.disabled = false;
    pBtn.textContent = `🕯️ 그림자 결투 — 리그 ${state.pvp.rank} / ${GHOST_LADDER.length} 격파`;
  }
}

$('#btn-sound').onclick = () => {
  Sound.toggle();
  $('#btn-sound').textContent = Sound.isMuted() ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
};

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    const to = btn.dataset.nav;
    if (to === 'hub') { renderHub(); show('hub'); }
    else if (to === 'title') { renderTitle(); show('title'); }
    else if (to === 'story') { renderChapters(); show('story'); }
    else if (to === 'gacha') { renderGacha(); show('gacha'); }
    else if (to === 'deck') { renderDeck(); show('deck'); }
    else if (to === 'deckedit') { renderDeckEdit(); show('deckedit'); }
    else if (to === 'substory') { renderSubstory(); show('substory'); }
    else if (to === 'switch') { renderCharSelect(true); show('select'); }
    else if (to === 'dungeon') { renderDungeon(); show('dungeon'); }
    else if (to === 'pvp') { renderPvp(); show('pvp'); }
  });
});

// ---------- 챕터 ----------
function renderChapters() {
  const wrap = $('#chapter-list');
  wrap.innerHTML = '';
  CHAPTERS.forEach((ch, i) => {
    const div = document.createElement('div');
    const cleared = i < state.cleared;
    const locked = i > state.cleared;
    div.className = 'chapter-item' + (cleared ? ' cleared' : '') + (locked ? ' locked' : '');
    const sub = locked
      ? '🔒 이전 사건을 먼저 해결해야 한다'
      : `${ch.place} · ${ch.enemy.icon} ${ch.enemy.name}` + (cleared ? ' · 재도전 (보상 50%)' : '');
    div.innerHTML = `<div class="ch-title">${ch.title}</div><div class="ch-sub">${sub}</div>`;
    if (!locked) div.onclick = () => startScene(i, 'intro');
    wrap.appendChild(div);
  });
}

// ---------- 스토리 씬 ----------
function startScene(chapterIdx, phase) {
  sceneCtx = { chapterIdx, phase };
  const ch = CHAPTERS[chapterIdx];
  $('#scene-title').textContent = ch.title;
  $('#scene-place').textContent = '— ' + ch.place + ' —';
  const lines = phase === 'intro' ? ch.intro : ch.outro;
  $('#scene-text').innerHTML = lines.map(t => `<p>${t}</p>`).join('');
  $('#btn-scene-next').textContent = phase === 'intro' ? '⚔️ 전투 시작' : '계속';
  const skipBtn = $('#btn-scene-skip');
  if (phase === 'intro' && chapterIdx < state.cleared) {
    skipBtn.style.display = 'block';
    skipBtn.onclick = () => startChapterBattle(chapterIdx);
  } else {
    skipBtn.style.display = 'none';
  }
  show('scene');
}

$('#btn-scene-next').onclick = () => {
  if (!sceneCtx) return;
  if (sceneCtx.phase === 'intro') {
    startChapterBattle(sceneCtx.chapterIdx);
  } else {
    renderHub();
    show('hub');
  }
};

// ---------- 전투 파이터 ----------
// cfg: { name, icon, maxHp, agi, atkBonus, deck, upgrades, charId(스킬 보유 시), isStory(흑마법) }
function makeFighter(cfg) {
  return {
    ...cfg,
    hp: cfg.maxHp,
    drawPile: shuffle(cfg.deck.slice()),
    discard: [],
    hand: [],
    played: null,
    skillUsed: false,
    atkMulTurns: 0,   // 특종감각
    atkDebuff: 1,     // 절대영도 (상대가 걸어줌)
    lifesteal: false, // 갈증
    agiBuff: 0,       // 각성제
  };
}

function fDraw(f) {
  if (f.drawPile.length === 0 && f.discard.length > 0) {
    f.drawPile = shuffle(f.discard);
    f.discard = [];
  }
  if (f.drawPile.length > 0 && f.hand.length < 5) f.hand.push(f.drawPile.pop());
}

const fAgi = (f) => f.agi + f.agiBuff;
const fCardAtk = (f, id) => upgradedAtk(id, (f.upgrades && f.upgrades[id]) || 0);
const fCardEva = (f, id) => upgradedEva(id, (f.upgrades && f.upgrades[id]) || 0);

function startBattleWith(foeCfg, mode, ctx) {
  const c = CHARACTERS[state.charId];
  const ps = playerStats();
  if (state.deck.length === 0) {
    state.deck = autoBuildDeck(state);
    save();
  }
  battle = {
    mode, // 'chapter' | 'dungeon' | 'pvp'
    ctx,  // chapter: {chapterIdx} / pvp: {rungIdx, name}
    me: makeFighter({
      name: c.name, icon: c.icon, maxHp: ps.maxHp, agi: ps.agi, atkBonus: ps.atkBonus,
      deck: state.deck, upgrades: state.upgrades, charId: state.charId, isStory: false,
    }),
    foe: makeFighter(foeCfg),
    sel: -1,           // 선택한 손패 인덱스
    itemUsed: false,   // 라운드당 소모품 1개
    round: 1,
    over: false,
    fled: false,
    lastClash: null,
  };
  for (let i = 0; i < 3; i++) { fDraw(battle.me); fDraw(battle.foe); }
  $('#battle-log').innerHTML = '';
  log(`<span class="lg-sys">${battle.foe.icon} ${battle.foe.name} 이(가) 마주 선다!</span>`);
  log('카드를 한 장 골라 이번 라운드의 무기로 삼자.');
  renderBattle();
  show('battle');
}

function startChapterBattle(chapterIdx) {
  const e = CHAPTERS[chapterIdx].enemy;
  startBattleWith(
    { name: e.name, icon: e.icon, maxHp: e.hp, agi: e.agi, atkBonus: e.atkBonus, deck: e.deck, upgrades: {}, charId: null, isStory: true },
    'chapter', { chapterIdx },
  );
}

function log(html) {
  const el = $('#battle-log');
  el.insertAdjacentHTML('beforeend', `<div>${html}</div>`);
  el.scrollTop = el.scrollHeight;
}

// ---------- 전투 렌더 ----------
function cardHtml(f, id, cls = '') {
  const card = CARDS[id];
  return `
    <div class="card r-${card.rarity} ${cls}">
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${cardLabel(id, f.upgrades)}</div>
      <div class="c-stat">⚔${fCardAtk(f, id)} · 👟${fCardEva(f, id)}%</div>
    </div>`;
}

function renderBattle() {
  const me = battle.me, foe = battle.foe;
  $('#enemy-info').innerHTML = `<span>${foe.icon} ${foe.name}</span><span>${Math.max(0, foe.hp)} / ${foe.maxHp}</span>`;
  $('#enemy-hp').style.width = Math.max(0, foe.hp / foe.maxHp * 100) + '%';
  const foeBuffs = [];
  if (foe.atkMulTurns > 0) foeBuffs.push(`공격 ×1.5 (${foe.atkMulTurns}라운드)`);
  if (foe.atkDebuff < 1) foeBuffs.push('❄️ 공격 -30%');
  if (foe.lifesteal) foeBuffs.push('흡혈 20%');
  $('#enemy-buffs').textContent = `손패 ${foe.hand.length}장 · 민첩 ${fAgi(foe)}` + (foeBuffs.length ? ' · ' + foeBuffs.join(' · ') : '');

  $('#player-info').innerHTML = `<span>${me.icon} ${me.name} Lv.${state.level}</span><span>${Math.max(0, me.hp)} / ${me.maxHp}</span>`;
  $('#player-hp').style.width = Math.max(0, me.hp / me.maxHp * 100) + '%';
  const myBuffs = [`민첩 ${fAgi(me)}`];
  if (me.atkMulTurns > 0) myBuffs.push(`특종감각 ×1.5 (${me.atkMulTurns}라운드)`);
  if (me.atkDebuff < 1) myBuffs.push('내 공격 -30%');
  if (me.lifesteal) myBuffs.push('흡혈 20%');
  $('#player-buffs').textContent = myBuffs.join(' · ');

  // 격돌 존: 직전 라운드에 서로 낸 카드
  const clash = $('#clash-zone');
  if (battle.lastClash) {
    clash.innerHTML = `
      <div class="clash-side">${cardHtml(me, battle.lastClash.mine, 'clash-card')}<div class="clash-label">나</div></div>
      <div class="clash-vs">VS</div>
      <div class="clash-side">${cardHtml(foe, battle.lastClash.foe, 'clash-card')}<div class="clash-label">${foe.name}</div></div>`;
  } else {
    clash.innerHTML = `<div class="clash-hint">— ${battle.round}라운드 · 낼 카드를 고르자 —</div>`;
  }

  // 손패
  const hand = $('#hand');
  hand.innerHTML = '';
  me.hand.forEach((id, idx) => {
    const card = CARDS[id];
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}` + (idx === battle.sel ? ' selected' : '') + (battle.over ? ' disabled' : '');
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${cardLabel(id)}</div>
      <div class="c-stat">⚔${fCardAtk(me, id)} · 👟${fCardEva(me, id)}%</div>`;
    if (!battle.over) div.onclick = () => { battle.sel = idx; Sound.card(); renderBattle(); };
    hand.appendChild(div);
  });

  // 소모품 바
  const bar = $('#item-bar');
  bar.innerHTML = '';
  Object.values(CONSUMABLES).forEach(it => {
    const n = state.items[it.id] || 0;
    if (n <= 0) return;
    const b = document.createElement('button');
    b.className = 'btn-item';
    b.textContent = `${it.icon} ${it.name} ×${n}`;
    b.disabled = battle.over || battle.itemUsed;
    b.onclick = () => useItem(it.id);
    bar.appendChild(b);
  });
  if (!bar.children.length) bar.innerHTML = '<span class="item-none">소모품 없음 (상점에서 구매)</span>';

  const skill = CHARACTERS[state.charId].skill;
  const skillBtn = $('#btn-skill');
  skillBtn.textContent = `✨ ${skill.name}`;
  skillBtn.disabled = battle.me.skillUsed || battle.over;
  skillBtn.title = skill.desc;
  $('#btn-attack').disabled = battle.over || battle.sel < 0;
  $('#btn-attack').textContent = battle.sel >= 0 ? '⚔️ 격돌!' : '카드를 고르자';
  $('#btn-flee').disabled = battle.over;
}

// ---------- 소모품 ----------
function useItem(itemId) {
  if (!battle || battle.over || battle.itemUsed) return;
  if ((state.items[itemId] || 0) <= 0) return;
  const it = CONSUMABLES[itemId];
  state.items[itemId]--;
  battle.itemUsed = true;
  save(); // 소모품은 쓰는 순간 소모 (패배해도 되돌아오지 않음)
  if (it.heal) {
    const before = battle.me.hp;
    battle.me.hp = Math.min(battle.me.maxHp, battle.me.hp + it.heal);
    log(`<span class="lg-good">${it.icon} ${it.name} 사용 — HP ${battle.me.hp - before} 회복</span>`);
  } else if (it.agi) {
    battle.me.agiBuff += it.agi;
    log(`<span class="lg-good">${it.icon} ${it.name} 사용 — 민첩 +${it.agi} (전투 지속)</span>`);
  }
  Sound.card();
  renderBattle();
}

// ---------- 스킬 ----------
function applySkill(user, opp, charId, isPlayer) {
  const who = isPlayer ? '' : `${user.name} 의 `;
  const cls = isPlayer ? 'lg-good' : 'lg-bad';
  log(`<span class="lg-sys">✨ ${who}고유 스킬 — ${CHARACTERS[charId].skill.name}!</span>`);
  if (charId === 'edwin') {
    opp.atkDebuff = 0.7;
    log(`<span class="${cls}">서리가 무기를 뒤덮는다. ${isPlayer ? '적' : '내'} 공격력 30% 감소!</span>`);
  } else if (charId === 'gregor') {
    const heal = Math.round(user.maxHp * 0.4);
    user.hp = Math.min(user.maxHp, user.hp + heal);
    log(`<span class="${cls}">광기 어린 기도 — HP ${heal} 회복!</span>`);
  } else if (charId === 'aria') {
    fDraw(user); fDraw(user);
    log(`<span class="${cls}">전황을 완전분석 — 카드 2장 드로우!</span>`);
  } else if (charId === 'jack') {
    user.atkMulTurns = 3;
    log(`<span class="${cls}">특종의 냄새 — 3라운드 동안 공격력 ×1.5!</span>`);
  } else if (charId === 'violeta') {
    user.lifesteal = true;
    log(`<span class="${cls}">송곳니가 드러난다 — 공격 데미지의 20% 흡혈!</span>`);
  } else if (charId === 'margo') {
    opp.agi = Math.max(1, opp.agi - 6);
    log(`<span class="${cls}">저주가 다리를 휘감는다 — ${isPlayer ? '적' : '내'} 민첩 6 감소!</span>`);
  }
  Sound.skill();
}

$('#btn-skill').onclick = () => {
  if (!battle || battle.me.skillUsed || battle.over) return;
  battle.me.skillUsed = true;
  applySkill(battle.me, battle.foe, state.charId, true);
  renderBattle();
};

// ---------- 도주 ----------
$('#btn-flee').onclick = () => {
  if (!battle || battle.over) return;
  const msg = battle.mode === 'dungeon'
    ? '도주하면 패배로 처리되고 오늘의 순찰 횟수가 1회 소모됩니다. 도주할까요?'
    : '도주하면 패배로 처리됩니다. (페널티 없음) 도주할까요?';
  if (!confirm(msg)) return;
  battle.fled = true;
  log('<span class="lg-sys">등을 돌려 어둠 속으로 몸을 뺐다...</span>');
  endBattle(false);
};

// ---------- 적 AI ----------
// 카드 정책: 평소 최고 공격, HP 40% 미만이면 최고 회피 (시뮬레이터와 동일)
function foePickCard(f) {
  if (f.hand.length === 0) return null;
  const key = f.hp < f.maxHp * 0.4 ? (id) => fCardEva(f, id) : (id) => fCardAtk(f, id);
  let best = 0;
  for (let i = 1; i < f.hand.length; i++) if (key(f.hand[i]) > key(f.hand[best])) best = i;
  return f.hand.splice(best, 1)[0];
}

function foeMaybeSkill() {
  const f = battle.foe;
  if (!f.charId || f.skillUsed) return;
  const r = battle.round;
  const trigger =
    (f.charId === 'edwin' && r === 1) ||
    (f.charId === 'gregor' && f.hp < f.maxHp * 0.5) ||
    (f.charId === 'aria' && r === 2) ||
    (f.charId === 'jack' && r === 2) ||
    (f.charId === 'violeta' && r === 1) ||
    (f.charId === 'margo' && r === 1);
  if (!trigger) return;
  f.skillUsed = true;
  applySkill(f, battle.me, f.charId, false);
}

// ---------- 라운드 해결 ----------
function strike(att, dfd, isFoeAttacker) {
  const dark = isFoeAttacker && att.isStory && battle.round % 5 === 0;
  const base = fCardAtk(att, att.played) + att.atkBonus;
  const mul = (att.atkMulTurns > 0 ? 1.5 : 1) * att.atkDebuff;
  const attName = isFoeAttacker ? att.name : '나';
  let dmg;
  if (dark) {
    dmg = Math.max(1, Math.round(base * mul * 1.2));
    Sound.dark();
    log(`<span class="lg-bad">${att.icon} 흑마법! 회피 불가 — ${dmg} 데미지</span>`);
  } else {
    const eva = dfd.played ? fCardEva(dfd, dfd.played) : 0;
    if (Math.random() * 100 < eva) {
      Sound.dodge();
      log(`<span class="${isFoeAttacker ? 'lg-good' : 'lg-bad'}">${isFoeAttacker ? '회피 성공! ' + att.name + ' 의 공격이 빗나갔다' : dfd.name + ' 이(가) 공격을 회피했다'}!</span>`);
      return;
    }
    dmg = Math.max(1, Math.round(base * mul * rand(0.9, 1.1)));
    Sound.hit();
    log(`<span class="${isFoeAttacker ? 'lg-bad' : 'lg-hit'}">${attName}의 ${CARDS[att.played].name} — ${dmg} 데미지</span>`);
  }
  dfd.hp -= dmg;
  if (att.lifesteal && att.hp > 0) {
    const heal = Math.round(dmg * 0.2);
    if (heal > 0) {
      att.hp = Math.min(att.maxHp, att.hp + heal);
      log(`<span class="${isFoeAttacker ? 'lg-bad' : 'lg-good'}">🦇 흡혈 — ${attName} HP ${heal} 회복</span>`);
    }
  }
}

$('#btn-attack').onclick = () => {
  if (!battle || battle.over || battle.sel < 0) return;
  const me = battle.me, foe = battle.foe;
  log(`<span class="lg-sys">— ${battle.round}라운드 —</span>`);

  me.played = me.hand.splice(battle.sel, 1)[0];
  battle.sel = -1;
  foe.played = foePickCard(foe);
  foeMaybeSkill();
  battle.lastClash = { mine: me.played, foe: foe.played };
  if (foe.played) log(`${foe.name} 이(가) ${CARDS[foe.played].icon} ${cardLabel(foe.played, foe.upgrades)} 을(를) 냈다.`);

  const meFirst = fAgi(me) >= fAgi(foe); // 동률은 플레이어 선공
  if (meFirst) {
    strike(me, foe, false);
    if (foe.hp > 0 && foe.played) strike(foe, me, true);
  } else {
    if (foe.played) strike(foe, me, true);
    if (me.hp > 0) strike(me, foe, false);
  }

  if (foe.hp <= 0 || me.hp <= 0) {
    renderBattle();
    return endBattle(foe.hp <= 0 && (me.hp > 0 || me.hp >= foe.hp));
  }

  // 라운드 정리: 낸 카드는 버림 더미로 (덱 순환), 1장 드로우
  if (me.played) me.discard.push(me.played);
  if (foe.played) foe.discard.push(foe.played);
  me.played = foe.played = null;
  if (me.atkMulTurns > 0) me.atkMulTurns--;
  if (foe.atkMulTurns > 0) foe.atkMulTurns--;
  battle.round++;
  battle.itemUsed = false;
  if (battle.round > 30) {
    battle.fled = true;
    battle.over = true;
    Sound.lose();
    log('<span class="lg-sys">승부가 나지 않는다. 어둠 속으로 몸을 피했다...</span>');
    renderBattle();
    if (battle.mode === 'pvp') return endPvpBattle(false, true);
    if (battle.mode === 'dungeon') return endDungeonBattle(false);
    return endChapterDefeat();
  }
  fDraw(me);
  fDraw(foe);
  renderBattle();
};

// ---------- 전투 종료 ----------
function endBattle(won) {
  battle.over = true;
  renderBattle();
  if (won) Sound.win(); else Sound.lose();
  if (battle.mode === 'pvp') return endPvpBattle(won, false);
  if (battle.mode === 'dungeon') return endDungeonBattle(won);
  if (!won) return endChapterDefeat();
  return endChapterVictory();
}

function endChapterDefeat() {
  const fled = battle.fled;
  if (!fled) log('<span class="lg-bad">쓰러졌다...</span>');
  setTimeout(() => {
    $('#result-title').textContent = fled ? '도주...' : '패배...';
    $('#result-body').innerHTML =
      `<p>${fled ? '싸움을 피해 물러났다. 페널티는 없다.' : '어둠 속에서 간신히 몸을 피했다. 상처를 추스르고 다시 도전하자.'}</p>
       <p style="color:var(--dim);font-size:13px">TIP: 에이스 카드를 강화하거나, 상점에서 소모품을 챙기고, 덱을 손보고 다시 오자.</p>`;
    $('#btn-result-ok').onclick = () => { renderHub(); show('hub'); };
    show('result');
  }, 700);
}

function endChapterVictory() {
  const chapterIdx = battle.ctx.chapterIdx;
  const ch = CHAPTERS[chapterIdx];
  const isFirstClear = chapterIdx === state.cleared;
  log(`<span class="lg-sys">${ch.enemy.name} 을(를) 쓰러뜨렸다!</span>`);
  const mult = isFirstClear ? 1 : 0.5;
  const exp = Math.round(ch.reward.exp * mult);
  const gold = Math.round(ch.reward.gold * mult);
  const ups = gainExp(exp);
  state.gold += gold;

  let body = `<p>경험치 <b>+${exp}</b> · 골드 <b class="rc-legend">+${gold}</b></p>`;
  if (ups > 0) {
    Sound.levelup();
    const ps = playerStats();
    body += `<p class="rc-rare">레벨 업! Lv.${state.level} — HP ${ps.maxHp} · 공격 보정 +${ps.atkBonus} · 민첩 ${ps.agi}<br>덱 지참 한도가 ${deckLimit()}장이 되었다!</p>`;
  }
  if (isFirstClear && ch.reward.card) {
    const card = CARDS[ch.reward.card];
    state.cards[card.id] = (state.cards[card.id] || 0) + 1;
    body += `<p>첫 클리어 보상: <b class="rc-${card.rarity}">${card.icon} ${card.name}</b> 획득! (덱 편성에서 채용하자)</p>`;
  }
  if (isFirstClear) state.cleared++;
  save();

  setTimeout(() => {
    $('#result-title').textContent = '승리!';
    $('#result-body').innerHTML = body;
    $('#btn-result-ok').onclick = isFirstClear
      ? () => startScene(chapterIdx, 'outro')
      : () => { renderHub(); show('hub'); };
    show('result');
  }, 700);
}

// ---------- 일일 던전 ----------
function dungeonRunsLeft() {
  if (state.daily.date !== today()) {
    state.daily = freshDaily();
    save();
  }
  return state.daily.runs;
}

function renderDungeon() {
  const runs = dungeonRunsLeft();
  const es = dungeonEnemyStats(state.level);
  const rw = dungeonReward(state.level);
  $('#dungeon-info').innerHTML = `
    <div>오늘 남은 순찰: <b class="gold">${runs} / ${DUNGEON_RUNS_PER_DAY}회</b> <span style="color:var(--dim)">(날짜가 바뀌면 초기화)</span></div>
    <div>위협 수준 (Lv.${state.level}): HP ${es.hp} · 공격 보정 +${es.atkBonus} · 민첩 ${es.agi} · 덱 ${es.deck.length}장</div>
    <div>보수: 🪙 ${rw.gold} 골드 · EXP ${rw.exp} · ${Math.round(DUNGEON_CARD_DROP * 100)}% 카드 · ${Math.round(DUNGEON_BANDAGE_DROP * 100)}% 붕대</div>
    <div style="color:var(--dim);font-size:11px">횟수는 전투가 끝날 때(승리·패배·도주) 1회 소모된다</div>`;
  const btn = $('#btn-dungeon-start');
  btn.textContent = runs > 0 ? '⚔️ 순찰 시작' : '오늘 순찰 완료 — 내일 다시 오자';
  btn.disabled = runs <= 0;
  btn.onclick = startDungeon;
}

function startDungeon() {
  if (dungeonRunsLeft() <= 0) return;
  const foe = DUNGEON_FOES[Math.floor(Math.random() * DUNGEON_FOES.length)];
  const es = dungeonEnemyStats(state.level);
  startBattleWith(
    { name: foe.name, icon: foe.icon, maxHp: es.hp, agi: es.agi, atkBonus: es.atkBonus, deck: es.deck, upgrades: {}, charId: null, isStory: true },
    'dungeon', {},
  );
}

function endDungeonBattle(won) {
  state.daily.runs = Math.max(0, state.daily.runs - 1);
  save();
  if (!won) {
    const fled = battle.fled;
    if (!fled) log('<span class="lg-bad">쓰러졌다...</span>');
    setTimeout(() => {
      $('#result-title').textContent = fled ? '순찰 포기...' : '순찰 실패...';
      $('#result-body').innerHTML =
        `<p>${fled ? '순찰을 포기하고 골목을 빠져나왔다.' : '간신히 골목을 빠져나왔다.'} 순찰 횟수는 1회 소모되었다.</p>`;
      $('#btn-result-ok').onclick = () => { renderDungeon(); show('dungeon'); };
      show('result');
    }, 700);
    return;
  }
  log(`<span class="lg-sys">${battle.foe.name} 을(를) 정리했다!</span>`);
  const rw = dungeonReward(state.level);
  const ups = gainExp(rw.exp);
  state.gold += rw.gold;
  let body = `<p>보수: 🪙 <b class="rc-legend">+${rw.gold}</b> · 경험치 <b>+${rw.exp}</b></p>`;
  if (ups > 0) {
    Sound.levelup();
    const ps = playerStats();
    body += `<p class="rc-rare">레벨 업! Lv.${state.level} — 덱 지참 한도 ${deckLimit()}장!</p>`;
  }
  if (Math.random() < DUNGEON_CARD_DROP) {
    const pool = Object.values(CARDS).filter(c => c.rarity === 'common' || c.rarity === 'rare');
    const card = pool[Math.floor(Math.random() * pool.length)];
    state.cards[card.id] = (state.cards[card.id] || 0) + 1;
    body += `<p>골목에서 주웠다: <b class="rc-${card.rarity}">${card.icon} ${card.name}</b></p>`;
  }
  if (Math.random() < DUNGEON_BANDAGE_DROP) {
    state.items.bandage = (state.items.bandage || 0) + 1;
    body += `<p>🩹 붕대 1개를 주웠다.</p>`;
  }
  save();
  setTimeout(() => {
    $('#result-title').textContent = '순찰 완료!';
    $('#result-body').innerHTML = body;
    $('#btn-result-ok').onclick = () => { renderDungeon(); show('dungeon'); };
    show('result');
  }, 700);
}

// ---------- 그림자 결투 ----------
function collectionToArray() {
  const arr = [];
  for (const [id, n] of Object.entries(state.cards)) for (let i = 0; i < n; i++) arr.push(id);
  return arr;
}

function myGhostBuild() {
  const c = CHARACTERS[state.charId];
  return {
    name: `${c.name}의 그림자`,
    charId: state.charId,
    level: state.level,
    deck: state.deck.slice(),
    upgrades: { ...state.upgrades },
  };
}

function exportGhostCode() {
  return GHOST_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(myGhostBuild()))));
}

function importGhostCode(str) {
  try {
    str = (str || '').trim();
    if (!str.startsWith(GHOST_CODE_PREFIX)) return null;
    const obj = JSON.parse(decodeURIComponent(escape(atob(str.slice(GHOST_CODE_PREFIX.length)))));
    if (!obj || !CHARACTERS[obj.charId]) return null;
    if (!Number.isInteger(obj.level) || obj.level < 1 || obj.level > 50) return null;
    if (!Array.isArray(obj.deck) || obj.deck.length < 1 || obj.deck.length > 12 || obj.deck.some(id => !CARDS[id])) return null;
    const upgrades = {};
    if (obj.upgrades && typeof obj.upgrades === 'object') {
      for (const [k, v] of Object.entries(obj.upgrades)) {
        if (CARDS[k] && Number.isInteger(v) && v >= 0 && v <= UPGRADE_MAX) upgrades[k] = v;
      }
    }
    return {
      name: String(obj.name || '이름 없는 그림자').slice(0, 24),
      charId: obj.charId,
      level: obj.level,
      deck: obj.deck.slice(),
      upgrades,
    };
  } catch (e) {
    return null;
  }
}

function renderPvp() {
  const rank = state.pvp.rank;
  const champion = rank >= GHOST_LADDER.length;
  $('#pvp-status').innerHTML =
    `<div>리그 전적: <b class="gold">${rank} / ${GHOST_LADDER.length} 격파</b>${champion ? ' · <span class="rc-legend">🏆 밤의 챔피언</span>' : ''} · 🪙 ${state.gold} 골드</div>
     <div style="color:var(--dim);font-size:12px">고스트도 나처럼 카드를 내고 스킬을 쓴다 — 소모품을 챙겨 가자</div>`;
  const wrap = $('#pvp-ladder');
  wrap.innerHTML = '';
  GHOST_LADDER.forEach((g, i) => {
    const c = CHARACTERS[g.charId];
    const beaten = i < rank;
    const current = i === rank;
    const div = document.createElement('div');
    div.className = 'chapter-item' + (beaten ? ' cleared' : '') + (!beaten && !current ? ' locked' : '');
    const status = beaten ? '재대결 가능 (보상 없음)'
      : current ? `도전 가능 · 첫 승리 🪙 ${g.reward}`
      : '🔒 이전 그림자를 먼저 쓰러뜨려야 한다';
    div.innerHTML = `
      <div class="ch-title">#${i + 1} ${c.icon} ${g.name} <span style="color:var(--dim)">Lv.${g.level} · 덱 ${g.deck.length}장</span></div>
      <div class="ch-sub">${status}</div>`;
    if (beaten || current) div.onclick = () => startPvpBattle(g, i);
    wrap.appendChild(div);
  });
  $('#ghost-code-mine').value = exportGhostCode();
}

function startPvpBattle(build, rungIdx) {
  const c = CHARACTERS[build.charId];
  const lv = build.level - 1;
  startBattleWith(
    {
      name: `${build.name} (Lv.${build.level})`, icon: c.icon,
      maxHp: c.hp + lv * 8,
      agi: c.agi + Math.floor(lv / 2),
      atkBonus: Math.round(c.atk / 2) + lv,
      deck: build.deck, upgrades: build.upgrades || {},
      charId: build.charId, isStory: false,
    },
    'pvp', { rungIdx, name: build.name },
  );
}

function endPvpBattle(won, isDraw) {
  const ctx = battle.ctx;
  let title, body;
  if (isDraw) {
    title = '무승부';
    body = '<p>30라운드가 지나도록 승부가 나지 않았다. 그림자는 어둠 속으로 사라졌다. (보상 없음)</p>';
  } else if (!won) {
    title = battle.fled ? '도주...' : '패배...';
    body = battle.fled
      ? `<p>${ctx.name} 의 그림자 앞에서 물러났다. 페널티는 없다.</p>`
      : `<p>${ctx.name} 의 그림자에게 무릎을 꿇었다. 페널티는 없다 — 덱과 에이스 카드를 손보고 다시 도전하자.</p>`;
  } else {
    title = '승리!';
    if (ctx.rungIdx !== null && ctx.rungIdx === state.pvp.rank) {
      const reward = GHOST_LADDER[ctx.rungIdx].reward;
      state.pvp.rank += 1;
      state.gold += reward;
      save();
      body = `<p>${ctx.name} 의 그림자를 쓰러뜨렸다!</p>
        <p>첫 격파 보상: 🪙 <b class="rc-legend">+${reward}</b> 골드</p>`;
      if (state.pvp.rank >= GHOST_LADDER.length) {
        body += '<p class="rc-legend">🏆 리그의 모든 그림자를 쓰러뜨렸다 — 칭호 「밤의 챔피언」 획득!</p>';
        Sound.legend();
      }
    } else if (ctx.rungIdx !== null) {
      body = `<p>${ctx.name} 의 그림자를 다시 쓰러뜨렸다. (재대결 — 보상 없음)</p>`;
    } else {
      body = `<p>${ctx.name} 와(과)의 친선전에서 승리했다! 코드의 주인에게 자랑하자.</p>`;
    }
  }
  setTimeout(() => {
    $('#result-title').textContent = title;
    $('#result-body').innerHTML = body;
    $('#btn-result-ok').onclick = () => { renderPvp(); show('pvp'); };
    show('result');
  }, 700);
}

$('#btn-ghost-copy').onclick = async () => {
  const code = $('#ghost-code-mine').value;
  try {
    await navigator.clipboard.writeText(code);
    $('#btn-ghost-copy').textContent = '📋 복사 완료!';
  } catch (e) {
    $('#ghost-code-mine').select();
    $('#btn-ghost-copy').textContent = '📋 코드를 직접 복사하세요 (선택됨)';
  }
  setTimeout(() => { $('#btn-ghost-copy').textContent = '📋 내 고스트 코드 복사'; }, 1500);
};

$('#btn-ghost-fight').onclick = () => {
  const build = importGhostCode($('#ghost-code-input').value);
  if (!build) {
    alert('유효하지 않은 고스트 코드입니다.');
    return;
  }
  startPvpBattle(build, null);
};

// ---------- 카드 뽑기 + 상점 ----------
function rollRarity() {
  const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const [key, r] of Object.entries(RARITY)) {
    roll -= r.weight;
    if (roll < 0) return key;
  }
  return 'common';
}

function updateGachaButton() {
  const left = GACHA_PITY - state.pity;
  const btn = $('#btn-gacha');
  btn.textContent = `🕯️ 초 녹이기 1회 (${GACHA_COST}G) — 보유 ${state.gold}G · 전설 확정까지 ${left}회`;
  btn.disabled = state.gold < GACHA_COST;
  const btn10 = $('#btn-gacha10');
  btn10.textContent = `🕯️ 10연차 (${GACHA_COST * 10}G)`;
  btn10.disabled = state.gold < GACHA_COST * 10;
}

function renderShop() {
  const wrap = $('#shop-list');
  wrap.innerHTML = '';
  Object.values(CONSUMABLES).forEach(it => {
    const n = state.items[it.id] || 0;
    const b = document.createElement('button');
    b.className = 'btn-item';
    b.textContent = `${it.icon} ${it.name} ×${n} — 🪙${it.price}`;
    b.disabled = state.gold < it.price;
    b.onclick = () => {
      if (state.gold < it.price) return;
      state.gold -= it.price;
      state.items[it.id] = (state.items[it.id] || 0) + 1;
      save();
      Sound.card();
      renderShop();
      updateGachaButton();
    };
    wrap.appendChild(b);
  });
}

function renderGacha() {
  $('#gacha-result').innerHTML = '<p style="color:var(--dim)">초를 골라 밀랍을 녹여보자...</p>';
  updateGachaButton();
  renderShop();
  $('#btn-gacha').onclick = doGacha;
  $('#btn-gacha10').onclick = doGacha10;
}

function drawOnce() {
  const rarity = state.pity >= GACHA_PITY - 1 ? 'legend' : rollRarity();
  state.pity = rarity === 'legend' ? 0 : state.pity + 1;
  const pool = Object.values(CARDS).filter(c => c.rarity === rarity);
  const card = pool[Math.floor(Math.random() * pool.length)];
  state.cards[card.id] = (state.cards[card.id] || 0) + 1;
  return card;
}

function doGacha() {
  if (state.gold < GACHA_COST) return;
  state.gold -= GACHA_COST;
  const card = drawOnce();
  save();
  if (card.rarity === 'legend') Sound.legend(); else Sound.gacha();
  $('#gacha-result').innerHTML = `
    <div class="gacha-card r-${card.rarity}" style="border-color:var(--${card.rarity})">
      <div class="g-icon">${card.icon}</div>
      <div class="g-rarity rc-${card.rarity}">${RARITY[card.rarity].label}</div>
      <div class="g-name">${cardLabel(card.id)}</div>
      <div class="g-desc">⚔ 공격 ${effAtk(card.id)} · 👟 회피 ${effEva(card.id)}%</div>
    </div>`;
  updateGachaButton();
  renderShop();
}

function doGacha10() {
  const cost = GACHA_COST * 10;
  if (state.gold < cost) return;
  state.gold -= cost;
  const cards = [];
  for (let i = 0; i < 10; i++) cards.push(drawOnce());
  save();
  if (cards.some(c => c.rarity === 'legend')) Sound.legend(); else Sound.gacha();
  $('#gacha-result').innerHTML = `<div class="gacha-grid">${cards.map(card => `
    <div class="gacha-mini" style="border-color:var(--${card.rarity})">
      <div class="m-icon">${card.icon}</div>
      <div class="m-name rc-${card.rarity}">${card.name}</div>
    </div>`).join('')}</div>`;
  updateGachaButton();
  renderShop();
}

// ---------- 보관함 / 도감 / 강화 ----------
function renderDeck() {
  const wrap = $('#deck-list');
  wrap.innerHTML = '';
  const order = { legend: 0, hero: 1, rare: 2, common: 3 };
  const all = Object.keys(CARDS).sort((a, b) => order[CARDS[a].rarity] - order[CARDS[b].rarity]);
  const ownedCount = all.filter(id => (state.cards[id] || 0) > 0).length;
  $('#deck-progress').textContent = `도감 ${ownedCount} / ${all.length} · 🪙 ${state.gold} 골드`;

  all.forEach(id => {
    const card = CARDS[id];
    const n = state.cards[id] || 0;
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}` + (n === 0 ? ' unowned' : '');
    if (n === 0) {
      div.innerHTML = `
        <div class="c-icon">❔</div>
        <div class="c-name">???</div>
        <div class="c-stat">미보유 · ${RARITY[card.rarity].label}</div>`;
      wrap.appendChild(div);
      return;
    }
    const lv = upLv(id);
    let upHtml;
    if (lv >= UPGRADE_MAX) {
      upHtml = `<button class="btn-up" disabled>강화 완료 +${UPGRADE_MAX}</button>`;
    } else {
      upHtml = `<button class="btn-up" data-up="${id}" ${canUpgrade(id) ? '' : 'disabled'}>⬆ 강화 (🪙${upgradeCost(id, lv)})</button>`;
    }
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${cardLabel(id)}</div>
      <div class="c-stat">⚔${effAtk(id)} · 👟${effEva(id)}%</div>
      <div class="c-count">× ${n}</div>
      ${upHtml}`;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll('[data-up]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (doUpgrade(btn.dataset.up)) { Sound.levelup(); renderDeck(); }
    });
  });
}

// ---------- 덱 편성 ----------
function renderDeckEdit() {
  state.deck = sanitizeDeck(state);
  const limit = deckLimit();
  $('#deckedit-info').textContent = `덱 ${state.deck.length} / ${limit}장 — 전투에서 이 카드들이 순환한다 (레벨업 시 한도 증가)`;

  const cur = $('#deckedit-current');
  cur.innerHTML = '';
  if (state.deck.length === 0) cur.innerHTML = '<p class="item-none">덱이 비어 있다 — 아래에서 카드를 추가하자</p>';
  state.deck.forEach((id, idx) => {
    const card = CARDS[id];
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}`;
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${cardLabel(id)}</div>
      <div class="c-stat">⚔${effAtk(id)} · 👟${effEva(id)}%</div>
      <button class="btn-up" data-out="${idx}">－ 빼기</button>`;
    cur.appendChild(div);
  });

  const inDeck = {};
  state.deck.forEach(id => { inDeck[id] = (inDeck[id] || 0) + 1; });
  const coll = $('#deckedit-collection');
  coll.innerHTML = '';
  const order = { legend: 0, hero: 1, rare: 2, common: 3 };
  Object.keys(state.cards)
    .filter(id => state.cards[id] > 0)
    .sort((a, b) => order[CARDS[a].rarity] - order[CARDS[b].rarity])
    .forEach(id => {
      const card = CARDS[id];
      const remain = state.cards[id] - (inDeck[id] || 0);
      const div = document.createElement('div');
      div.className = `card r-${card.rarity}` + (remain <= 0 ? ' disabled' : '');
      div.innerHTML = `
        <div class="c-icon">${card.icon}</div>
        <div class="c-name">${cardLabel(id)}</div>
        <div class="c-stat">⚔${effAtk(id)} · 👟${effEva(id)}%</div>
        <div class="c-count">남은 ${remain}장</div>
        <button class="btn-up" data-in="${id}" ${remain <= 0 || state.deck.length >= limit ? 'disabled' : ''}>＋ 넣기</button>`;
      coll.appendChild(div);
    });

  $('#deckedit-current').querySelectorAll('[data-out]').forEach(b => {
    b.addEventListener('click', () => {
      state.deck.splice(Number(b.dataset.out), 1);
      save();
      renderDeckEdit();
    });
  });
  coll.querySelectorAll('[data-in]').forEach(b => {
    b.addEventListener('click', () => {
      if (state.deck.length >= deckLimit()) return;
      state.deck.push(b.dataset.in);
      save();
      Sound.card();
      renderDeckEdit();
    });
  });
}

$('#btn-deck-auto').onclick = () => {
  state.deck = autoBuildDeck(state);
  save();
  Sound.card();
  renderDeckEdit();
};

// ---------- 서브 스토리 ----------
function renderSubstory() {
  const c = CHARACTERS[state.charId];
  $('#substory-title').textContent = `📜 ${c.name} — ${c.title}`;
  $('#substory-text').innerHTML = c.substory.map(t => `<p>${t}</p>`).join('');
}

// ---------- 시작 ----------
initTitle();
