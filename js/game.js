// 미스테리 체이서: 검은 촛불 — 게임 로직
'use strict';

const SAVE_KEY_V1 = 'mystery-chaser-fan-save-v1';
const SAVE_KEY_V2 = 'mystery-chaser-fan-save-v2';
const SAVE_KEY_V3 = 'mystery-chaser-fan-save-v3';
const SAVE_KEY = 'mystery-chaser-fan-save-v4';

let state = null;   // 영속 상태 (localStorage)
let battle = null;  // 현재 전투 상태
let sceneCtx = null; // 현재 스토리 씬 컨텍스트 { chapterIdx, phase: 'intro'|'outro' }

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
  return {
    charId,
    level: 1,
    exp: 0,
    gold: 120,
    cards: { ...STARTING_CARDS },
    cleared: 0, // 클리어한 챕터 수 (다음 도전 가능 챕터 인덱스)
    upgrades: {}, // 카드 id → 강화 레벨 (0~UPGRADE_MAX)
    pity: 0,      // 마지막 전설 이후 뽑기 횟수
    daily: freshDaily(), // 일일 던전 { date, runs }
    pvp: { rank: 0 },    // 격파한 리그 고스트 수 (0~GHOST_LADDER.length)
  };
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  try {
    // 마이그레이션 체인: v1 → v2(upgrades/pity) → v3(daily) → v4(pvp) (FEATURE_SPEC §9.2)
    const raw = localStorage.getItem(SAVE_KEY)
      || localStorage.getItem(SAVE_KEY_V3)
      || localStorage.getItem(SAVE_KEY_V2)
      || localStorage.getItem(SAVE_KEY_V1);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !CHARACTERS[s.charId]) return null;
    if (!s.upgrades) s.upgrades = {};
    if (typeof s.pity !== 'number') s.pity = 0;
    if (!s.daily || !s.daily.date) s.daily = freshDaily();
    if (!s.pvp || typeof s.pvp.rank !== 'number') s.pvp = { rank: 0 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    localStorage.removeItem(SAVE_KEY_V1);
    localStorage.removeItem(SAVE_KEY_V2);
    localStorage.removeItem(SAVE_KEY_V3);
    return s;
  } catch (e) {
    return null;
  }
}

// ---------- 카드 강화 (FEATURE_SPEC §4.4) ----------
function upLv(cardId) { return (state && state.upgrades[cardId]) || 0; }

function isUpgradable(cardId) { return CARDS[cardId].value < 9999; } // 전체 회복은 강화 불가

function effValWith(cardId, upgrades) {
  const card = CARDS[cardId];
  if (!isUpgradable(cardId)) return card.value;
  return Math.round(card.value * (1 + 0.25 * ((upgrades && upgrades[cardId]) || 0)));
}

function effVal(cardId) { return effValWith(cardId, state.upgrades); }

function cardLabel(cardId) {
  const lv = upLv(cardId);
  return CARDS[cardId].name + (lv > 0 ? ` +${lv}` : '');
}

function cardDesc(cardId) {
  const card = CARDS[cardId];
  const v = effVal(cardId);
  if (card.type === 'weapon') return `이번 전투 동안 공격력 +${v}`;
  if (card.type === 'armor') return `이번 전투 동안 방어력 +${v}`;
  if (card.type === 'charm') return `이번 전투 동안 민첩 +${v}`;
  return v >= 9999 ? 'HP를 전부 회복' : `HP를 ${v} 회복`;
}

function canUpgrade(cardId) {
  return isUpgradable(cardId)
    && upLv(cardId) < UPGRADE_MAX
    && (state.cards[cardId] || 0) >= 2
    && state.gold >= UPGRADE_COST[CARDS[cardId].rarity];
}

function upgradeCard(cardId) {
  if (!canUpgrade(cardId)) return false;
  state.cards[cardId] -= 1;                 // 사본 1장 소비
  state.gold -= UPGRADE_COST[CARDS[cardId].rarity];
  state.upgrades[cardId] = upLv(cardId) + 1;
  save();
  return true;
}

// ---------- 능력치 ----------
function expNeeded(level) { return level * 40; }

function playerStats() {
  const c = CHARACTERS[state.charId];
  const lv = state.level - 1;
  return {
    maxHp: c.hp + lv * 8,
    atk: c.atk + lv * 2,
    def: c.def + lv * 1,
    agi: c.agi + lv * 1,
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

// ---------- 타이틀 / 캐릭터 선택 ----------
function initTitle() {
  $('#btn-start').onclick = () => {
    const saved = load();
    if (saved) {
      state = saved;
      renderHub();
      show('hub');
    } else {
      renderCharSelect();
      show('select');
    }
  };
  $('#btn-reset').onclick = () => {
    if (confirm('저장된 추적 기록을 모두 삭제할까요?')) {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(SAVE_KEY_V3);
      localStorage.removeItem(SAVE_KEY_V2);
      localStorage.removeItem(SAVE_KEY_V1);
      state = null;
      alert('기록이 삭제되었습니다.');
    }
  };
}

// switchMode=false: 새 게임 캐릭터 선택 / true: 허브에서 교대 (FR-16)
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
      <div class="char-stats">HP ${c.hp} · 공격 ${c.atk} · 방어 ${c.def} · 민첩 ${c.agi}</div>
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
    <div>Lv.${state.level} &nbsp; HP ${ps.maxHp} · 공격 ${ps.atk} · 방어 ${ps.def} · 민첩 ${ps.agi}</div>
    <div class="gold">🪙 ${state.gold} 골드</div>
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
    else if (to === 'title') { show('title'); }
    else if (to === 'story') { renderChapters(); show('story'); }
    else if (to === 'gacha') { renderGacha(); show('gacha'); }
    else if (to === 'deck') { renderDeck(); show('deck'); }
    else if (to === 'substory') { renderSubstory(); show('substory'); }
    else if (to === 'switch') { renderCharSelect(true); show('select'); }
    else if (to === 'dungeon') { renderDungeon(); show('dungeon'); }
    else if (to === 'pvp') { renderPvp(); show('pvp'); }
  });
});

// ---------- 챕터 목록 ----------
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
  show('scene');
}

$('#btn-scene-next').onclick = () => {
  if (!sceneCtx) return;
  if (sceneCtx.phase === 'intro') {
    startBattle(sceneCtx.chapterIdx);
  } else {
    renderHub();
    show('hub');
  }
};

// ---------- 일일 던전 (FEATURE_SPEC §6.3) ----------
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
    <div>위협 수준 (Lv.${state.level}): HP ${es.hp} · 공격 ${es.atk} · 방어 ${es.def} · 민첩 ${es.agi}</div>
    <div>보수: 🪙 ${rw.gold} 골드 · EXP ${rw.exp} · ${Math.round(DUNGEON_CARD_DROP * 100)}% 확률로 카드 1장</div>`;
  const btn = $('#btn-dungeon-start');
  btn.textContent = runs > 0 ? '⚔️ 순찰 시작 (입장 1회 소모)' : '오늘 순찰 완료 — 내일 다시 오자';
  btn.disabled = runs <= 0;
  btn.onclick = startDungeon;
}

function startDungeon() {
  if (dungeonRunsLeft() <= 0) return;
  state.daily.runs -= 1; // 입장 시점 차감 — 패배해도 소모
  save();
  const foe = DUNGEON_FOES[Math.floor(Math.random() * DUNGEON_FOES.length)];
  startBattle(null, { ...dungeonEnemyStats(state.level), name: foe.name, icon: foe.icon });
}

// ---------- 그림자 결투 (FEATURE_SPEC §12) ----------
function collectionToArray() {
  const deck = [];
  for (const [id, n] of Object.entries(state.cards)) {
    for (let i = 0; i < n; i++) deck.push(id);
  }
  return deck;
}

function myGhostBuild() {
  const c = CHARACTERS[state.charId];
  return {
    name: `${c.name}의 그림자`,
    charId: state.charId,
    level: state.level,
    deck: collectionToArray(),
    upgrades: { ...state.upgrades },
  };
}

function exportGhostCode() {
  return GHOST_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(myGhostBuild()))));
}

// 검증 실패 시 null — 게임 상태는 불변 (FR-20)
function importGhostCode(str) {
  try {
    str = (str || '').trim();
    if (!str.startsWith(GHOST_CODE_PREFIX)) return null;
    const obj = JSON.parse(decodeURIComponent(escape(atob(str.slice(GHOST_CODE_PREFIX.length)))));
    if (!obj || !CHARACTERS[obj.charId]) return null;
    if (!Number.isInteger(obj.level) || obj.level < 1 || obj.level > 50) return null;
    if (!Array.isArray(obj.deck) || obj.deck.length > 200 || obj.deck.some(id => !CARDS[id])) return null;
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
    `<div>리그 전적: <b class="gold">${rank} / ${GHOST_LADDER.length} 격파</b>${champion ? ' · <span class="rc-legend">🏆 밤의 챔피언</span>' : ''}</div>
     <div style="color:var(--dim);font-size:12px">현재 랭크의 그림자를 쓰러뜨리면 다음 그림자가 나타난다</div>`;

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
      <div class="ch-title">#${i + 1} ${c.icon} ${g.name} <span style="color:var(--dim)">Lv.${g.level}</span></div>
      <div class="ch-sub">${status}</div>`;
    if (beaten || current) div.onclick = () => startPvpBattle(g, i);
    wrap.appendChild(div);
  });

  $('#ghost-code-mine').value = exportGhostCode();
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

// ---------- 전투 ----------
function buildBattleDeck() {
  return shuffle(collectionToArray());
}

// 고스트 측 상태 (PvP). HP는 battle.ehp를 공유해 렌더링을 재사용한다
function makeGhostSide(build) {
  const c = CHARACTERS[build.charId];
  const lv = build.level - 1;
  return {
    charId: build.charId,
    ups: build.upgrades || {},
    base: { maxHp: c.hp + lv * 8, atk: c.atk + lv * 2, def: c.def + lv * 1, agi: c.agi + lv * 1 },
    atkB: 0, defB: 0, agiB: 0, atkMulTurns: 0, pierceNext: false, lifesteal: false,
    deck: shuffle(build.deck.slice()), hand: [], skillUsed: false,
  };
}

function startPvpBattle(build, rungIdx) {
  const c = CHARACTERS[build.charId];
  const ps = playerStats();
  const ghost = makeGhostSide(build);
  battle = {
    mode: 'pvp',
    chapterIdx: null,
    pvpCtx: { rungIdx, name: build.name },
    php: ps.maxHp, pmax: ps.maxHp,
    base: ps,
    atkB: 0, defB: 0, agiB: 0,
    atkMulTurns: 0,
    enemyAtkMul: 1, enemyDefMul: 1, // 내가 고스트에 건 디버프
    myAtkMul: 1, myDefMul: 1,       // 고스트가 나에게 건 디버프
    pierceNext: false,
    lifesteal: false,
    ehp: ghost.base.maxHp,
    enemy: { name: `${build.name} (Lv.${build.level})`, icon: c.icon, hp: ghost.base.maxHp },
    ghost,
    deck: buildBattleDeck(),
    hand: [],
    skillUsed: false,
    cardPlayed: false,
    round: 1,
    over: false,
  };
  $('#battle-log').innerHTML = '';
  for (let i = 0; i < 3; i++) { drawCard(false); ghostDraw(); }
  log(`<span class="lg-sys">${c.icon} ${build.name} 의 그림자가 마주 선다. (그림자 결투 — 흑마법 없음)</span>`);
  renderBattle();
  show('battle');
}

// chapterIdx 기반 챕터전, 또는 dungeonEnemy를 넘기면 던전전
function startBattle(chapterIdx, dungeonEnemy = null) {
  const enemy = dungeonEnemy || CHAPTERS[chapterIdx].enemy;
  const ps = playerStats();
  battle = {
    mode: dungeonEnemy ? 'dungeon' : 'chapter',
    chapterIdx,
    php: ps.maxHp, pmax: ps.maxHp,
    base: ps,
    atkB: 0, defB: 0, agiB: 0,   // 카드 지속 버프
    atkMulTurns: 0,               // 특종감각 남은 라운드
    enemyAtkMul: 1,               // 절대영도 적용 시 0.7
    enemyDefMul: 1,               // 파멸의 저주 적용 시 0.5
    myAtkMul: 1, myDefMul: 1,     // PvP에서 고스트가 거는 디버프 (PvE에선 항상 1)
    pierceNext: false,            // 완전분석: 다음 공격 방어 무시 2배
    lifesteal: false,             // 갈증: 공격 데미지 20% 회복
    ehp: enemy.hp,
    enemy,
    deck: buildBattleDeck(),
    hand: [],
    skillUsed: false,
    cardPlayed: false,
    round: 1,
    over: false,
  };
  $('#battle-log').innerHTML = '';
  for (let i = 0; i < 3; i++) drawCard(false);
  log(`<span class="lg-sys">${enemy.icon} ${enemy.name} 이(가) 나타났다!</span>`);
  renderBattle();
  show('battle');
}

function drawCard(announce = true) {
  if (battle.hand.length >= 5) { if (announce) log('손패가 가득 찼다. (최대 5장)'); return false; }
  if (battle.deck.length === 0) { if (announce) log('산차에 남은 카드가 없다.'); return false; }
  const id = battle.deck.pop();
  battle.hand.push(id);
  if (announce) log(`카드를 뽑았다: ${CARDS[id].name}`);
  return true;
}

function pAtk() {
  const mul = battle.atkMulTurns > 0 ? 1.5 : 1;
  return Math.round((battle.base.atk + battle.atkB) * mul * battle.myAtkMul);
}
function pDef() { return battle.base.def + battle.defB; }
function pAgi() { return battle.base.agi + battle.agiB; }

function log(html) {
  const el = $('#battle-log');
  el.insertAdjacentHTML('beforeend', `<div>${html}</div>`);
  el.scrollTop = el.scrollHeight;
}

function renderBattle() {
  const e = battle.enemy;
  $('#enemy-info').innerHTML =
    `<span>${e.icon} ${e.name}</span><span>${Math.max(0, battle.ehp)} / ${e.hp}</span>`;
  $('#enemy-hp').style.width = Math.max(0, battle.ehp / e.hp * 100) + '%';

  const c = CHARACTERS[state.charId];
  $('#player-info').innerHTML =
    `<span>${c.icon} ${c.name} Lv.${state.level}</span><span>${Math.max(0, battle.php)} / ${battle.pmax}</span>`;
  $('#player-hp').style.width = Math.max(0, battle.php / battle.pmax * 100) + '%';

  const buffs = [];
  if (battle.atkB) buffs.push(`공격 +${battle.atkB}`);
  if (battle.defB) buffs.push(`방어 +${battle.defB}`);
  if (battle.agiB) buffs.push(`민첩 +${battle.agiB}`);
  if (battle.atkMulTurns > 0) buffs.push(`특종감각 ×1.5 (${battle.atkMulTurns}라운드)`);
  if (battle.enemyAtkMul < 1) buffs.push('적 공격력 -30%');
  if (battle.enemyDefMul < 1) buffs.push('적 방어력 -50%');
  if (battle.pierceNext) buffs.push('다음 공격 관통 ×2');
  if (battle.lifesteal) buffs.push('흡혈 20%');
  if (battle.myAtkMul < 1) buffs.push('❄️ 빙결: 내 공격력 -30%');
  if (battle.myDefMul < 1) buffs.push('🕸️ 저주: 내 방어력 -50%');
  $('#player-buffs').textContent = buffs.join(' · ');

  // PvP: 고스트의 손패·버프 표시 (FR-21)
  const eb = $('#enemy-buffs');
  if (battle.mode === 'pvp') {
    const g = battle.ghost;
    const gb = [];
    if (g.atkB) gb.push(`공격 +${g.atkB}`);
    if (g.defB) gb.push(`방어 +${g.defB}`);
    if (g.agiB) gb.push(`민첩 +${g.agiB}`);
    if (g.atkMulTurns > 0) gb.push(`공격 ×1.5 (${g.atkMulTurns}라운드)`);
    if (g.pierceNext) gb.push('관통 대기');
    if (g.lifesteal) gb.push('흡혈 20%');
    eb.textContent = `손패 ${g.hand.length}장` + (gb.length ? ' · ' + gb.join(' · ') : '');
  } else {
    eb.textContent = '';
  }

  // 손패
  const hand = $('#hand');
  hand.innerHTML = '';
  battle.hand.forEach((id, idx) => {
    const card = CARDS[id];
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}` + (battle.cardPlayed || battle.over ? ' disabled' : '');
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${cardLabel(id)}</div>
      <div class="c-desc">${cardDesc(id)}</div>`;
    if (!battle.cardPlayed && !battle.over) div.onclick = () => playCard(idx);
    hand.appendChild(div);
  });

  const skill = CHARACTERS[state.charId].skill;
  const skillBtn = $('#btn-skill');
  skillBtn.textContent = `✨ ${skill.name}`;
  skillBtn.disabled = battle.skillUsed || battle.over;
  skillBtn.title = skill.desc;
  $('#btn-attack').disabled = battle.over;
}

function playCard(handIdx) {
  if (battle.cardPlayed || battle.over) return;
  const id = battle.hand[handIdx];
  const card = CARDS[id];
  const v = effVal(id);
  const name = cardLabel(id);
  battle.hand.splice(handIdx, 1);
  battle.cardPlayed = true;

  if (card.type === 'weapon') { battle.atkB += v; log(`<span class="lg-good">${card.icon} ${name} 장착 — 공격력 +${v}</span>`); }
  else if (card.type === 'armor') { battle.defB += v; log(`<span class="lg-good">${card.icon} ${name} 장착 — 방어력 +${v}</span>`); }
  else if (card.type === 'charm') { battle.agiB += v; log(`<span class="lg-good">${card.icon} ${name} 사용 — 민첩 +${v}</span>`); }
  else if (card.type === 'heal') {
    const before = battle.php;
    battle.php = Math.min(battle.pmax, battle.php + v);
    log(`<span class="lg-good">${card.icon} ${name} 사용 — HP ${battle.php - before} 회복</span>`);
  }
  Sound.card();
  renderBattle();
}

$('#btn-skill').onclick = () => {
  if (!battle || battle.skillUsed || battle.over) return;
  battle.skillUsed = true;
  const cid = state.charId;
  const skill = CHARACTERS[cid].skill;
  log(`<span class="lg-sys">✨ 고유 스킬 발동 — ${skill.name}!</span>`);
  if (cid === 'edwin') {
    battle.enemyAtkMul = 0.7;
    log('<span class="lg-good">적의 무기에 서리가 앉는다. 적 공격력 30% 감소!</span>');
  } else if (cid === 'gregor') {
    const heal = Math.round(battle.pmax * 0.4);
    battle.php = Math.min(battle.pmax, battle.php + heal);
    log(`<span class="lg-good">광기 어린 기도가 상처를 봉한다. HP ${heal} 회복!</span>`);
  } else if (cid === 'aria') {
    drawCard(); drawCard();
    battle.pierceNext = true;
    log('<span class="lg-good">약점을 간파했다. 다음 공격은 방어를 무시하는 2배 데미지!</span>');
  } else if (cid === 'jack') {
    battle.atkMulTurns = 3;
    log('<span class="lg-good">특종의 냄새가 난다! 3라운드 동안 공격력 ×1.5!</span>');
  } else if (cid === 'violeta') {
    battle.lifesteal = true;
    log('<span class="lg-good">송곳니가 드러난다. 공격 데미지의 20%를 흡혈한다!</span>');
  } else if (cid === 'margo') {
    battle.enemyDefMul = 0.5;
    log('<span class="lg-good">저주가 적의 갑주를 좀먹는다. 적 방어력 50% 감소!</span>');
  }
  Sound.skill();
  renderBattle();
};

function dmgRoll(atk, def) {
  return Math.max(1, Math.round(atk * rand(0.9, 1.1) - def * 0.5));
}

// ---------- PvP 고스트 행동 ----------
function ghostDraw() {
  const g = battle.ghost;
  if (g.hand.length < 5 && g.deck.length) g.hand.push(g.deck.pop());
}

function gAtkEff() {
  const g = battle.ghost;
  return Math.round((g.base.atk + g.atkB) * (g.atkMulTurns > 0 ? 1.5 : 1) * battle.enemyAtkMul);
}
function gDefEff() { const g = battle.ghost; return (g.base.def + g.defB) * battle.enemyDefMul; }
function gAgiEff() { const g = battle.ghost; return g.base.agi + g.agiB; }

// 고스트 AI: 시뮬레이터와 동일한 정책 (FEATURE_SPEC §12.1)
function ghostAct() {
  const g = battle.ghost;
  const gname = battle.pvpCtx.name;
  // 카드: HP 45% 미만이면 회복 우선, 아니면 무기 > 방어구 > 장신구
  let idx = -1;
  if (battle.ehp < g.base.maxHp * 0.45) idx = g.hand.findIndex(id => CARDS[id].type === 'heal');
  if (idx < 0) idx = g.hand.findIndex(id => CARDS[id].type === 'weapon');
  if (idx < 0) idx = g.hand.findIndex(id => CARDS[id].type === 'armor');
  if (idx < 0) idx = g.hand.findIndex(id => CARDS[id].type === 'charm');
  if (idx >= 0) {
    const id = g.hand.splice(idx, 1)[0];
    const card = CARDS[id];
    const v = effValWith(id, g.ups);
    if (card.type === 'weapon') g.atkB += v;
    else if (card.type === 'armor') g.defB += v;
    else if (card.type === 'charm') g.agiB += v;
    else battle.ehp = Math.min(g.base.maxHp, battle.ehp + v);
    log(`<span class="lg-bad">${gname} 이(가) ${card.icon} ${card.name} 을(를) 사용했다</span>`);
  }
  // 스킬: 캐릭터별 고정 타이밍, 전투당 1회
  if (g.skillUsed) return;
  const cid = g.charId;
  const r = battle.round;
  const trigger =
    (cid === 'edwin' && r === 1) ||
    (cid === 'gregor' && battle.ehp < g.base.maxHp * 0.5) ||
    (cid === 'aria' && r === 2) ||
    (cid === 'jack' && r === 2) ||
    (cid === 'violeta' && r === 1) ||
    (cid === 'margo' && r === 1);
  if (!trigger) return;
  g.skillUsed = true;
  const skillName = CHARACTERS[cid].skill.name;
  log(`<span class="lg-bad">✨ ${gname} 의 고유 스킬 — ${skillName}!</span>`);
  if (cid === 'edwin') battle.myAtkMul = 0.7;
  else if (cid === 'gregor') battle.ehp = Math.min(g.base.maxHp, battle.ehp + Math.round(g.base.maxHp * 0.4));
  else if (cid === 'aria') { ghostDraw(); ghostDraw(); g.pierceNext = true; }
  else if (cid === 'jack') g.atkMulTurns = 3;
  else if (cid === 'violeta') g.lifesteal = true;
  else if (cid === 'margo') battle.myDefMul = 0.5;
}

function pvpPlayerHit() {
  const gname = battle.pvpCtx.name;
  let dmg;
  if (battle.pierceNext) {
    dmg = Math.round(pAtk() * 2); // 필중
    battle.pierceNext = false;
    log(`<span class="lg-hit">관통 일격! 방어를 무시하고 ${gname} 에게 ${dmg} 데미지</span>`);
  } else {
    const dodge = Math.min(0.3, Math.max(0, (gAgiEff() - pAgi()) * 0.03));
    if (Math.random() < dodge) {
      Sound.dodge();
      log(`<span class="lg-bad">${gname} 이(가) 공격을 회피했다!</span>`);
      return;
    }
    dmg = dmgRoll(pAtk(), gDefEff());
    log(`<span class="lg-hit">공격! ${gname} 에게 ${dmg} 데미지</span>`);
  }
  battle.ehp -= dmg;
  Sound.hit();
  if (battle.lifesteal && battle.php > 0) {
    const heal = Math.round(dmg * 0.2);
    if (heal > 0) {
      battle.php = Math.min(battle.pmax, battle.php + heal);
      log(`<span class="lg-good">🦇 흡혈 — HP ${heal} 회복</span>`);
    }
  }
}

function pvpGhostHit() {
  const g = battle.ghost;
  const gname = battle.pvpCtx.name;
  let dmg;
  if (g.pierceNext) {
    dmg = Math.round(gAtkEff() * 2); // 필중
    g.pierceNext = false;
    log(`<span class="lg-bad">${gname} 의 관통 일격! 방어를 무시하고 ${dmg} 데미지</span>`);
  } else {
    const dodge = Math.min(0.3, Math.max(0, (pAgi() - gAgiEff()) * 0.03));
    if (Math.random() < dodge) {
      Sound.dodge();
      log(`<span class="lg-good">${gname} 의 공격을 회피했다!</span>`);
      return;
    }
    dmg = dmgRoll(gAtkEff(), pDef() * battle.myDefMul);
    log(`<span class="lg-bad">${gname} 의 공격 — ${dmg} 데미지</span>`);
  }
  battle.php -= dmg;
  Sound.hit();
  if (g.lifesteal && battle.ehp > 0) {
    const heal = Math.round(dmg * 0.2);
    if (heal > 0) {
      battle.ehp = Math.min(g.base.maxHp, battle.ehp + heal);
      log(`<span class="lg-bad">🦇 ${gname} 이(가) HP ${heal} 흡혈했다</span>`);
    }
  }
}

function pvpRound() {
  log(`<span class="lg-sys">— ${battle.round}라운드 —</span>`);
  ghostAct();
  const playerFirst = pAgi() >= gAgiEff(); // 동률은 도전자 우선
  if (playerFirst) {
    pvpPlayerHit();
    if (battle.ehp > 0) pvpGhostHit();
  } else {
    pvpGhostHit();
    if (battle.php > 0) pvpPlayerHit();
  }

  // 동시 사망: 잔여 HP 우위 (덜 깎인 쪽 승리)
  if (battle.ehp <= 0 || battle.php <= 0) {
    renderBattle();
    return endBattle(battle.ehp <= 0 && (battle.php > 0 || battle.php >= battle.ehp));
  }

  if (battle.atkMulTurns > 0) battle.atkMulTurns--;
  if (battle.ghost.atkMulTurns > 0) battle.ghost.atkMulTurns--;
  battle.round++;
  battle.cardPlayed = false;
  if (battle.round > 30) {
    // 무승부 = 패배 취급, 보상 없음 (§12.2)
    battle.over = true;
    Sound.lose();
    log('<span class="lg-sys">그림자가 흩어졌다... 승부를 내지 못했다.</span>');
    renderBattle();
    return endPvpBattle(false, true);
  }
  drawCard();
  ghostDraw();
  renderBattle();
}

$('#btn-attack').onclick = () => {
  if (!battle || battle.over) return;
  if (battle.mode === 'pvp') return pvpRound();
  const e = battle.enemy;
  const playerFirst = pAgi() >= e.agi;
  log(`<span class="lg-sys">— ${battle.round}라운드 —</span>`);

  const doPlayerHit = () => {
    let dmg;
    if (battle.pierceNext) {
      // 관통 일격은 필중 (적 회피 불가)
      dmg = Math.round(pAtk() * 2);
      battle.pierceNext = false;
      log(`<span class="lg-hit">관통 일격! 방어를 무시하고 ${e.name}에게 ${dmg} 데미지</span>`);
    } else {
      const dodge = Math.min(0.3, Math.max(0, (e.agi - pAgi()) * 0.03));
      if (Math.random() < dodge) {
        Sound.dodge();
        log(`<span class="lg-bad">${e.name}이(가) 공격을 회피했다!</span>`);
        return;
      }
      dmg = dmgRoll(pAtk(), e.def * battle.enemyDefMul);
      log(`<span class="lg-hit">공격! ${e.name}에게 ${dmg} 데미지</span>`);
    }
    battle.ehp -= dmg;
    Sound.hit();
    if (battle.lifesteal && battle.php > 0) {
      const heal = Math.round(dmg * 0.2);
      if (heal > 0) {
        battle.php = Math.min(battle.pmax, battle.php + heal);
        log(`<span class="lg-good">🦇 흡혈 — HP ${heal} 회복</span>`);
      }
    }
  };
  const doEnemyHit = () => {
    const dark = battle.round % 4 === 0;
    let atk = e.atk * battle.enemyAtkMul;
    let dmg;
    if (dark) {
      dmg = Math.max(1, Math.round(atk * 1.3));
      Sound.dark();
      log(`<span class="lg-bad">${e.icon} 흑마법! 방어를 무시하고 ${dmg} 데미지</span>`);
    } else {
      const dodge = Math.min(0.3, Math.max(0, (pAgi() - e.agi) * 0.03));
      if (Math.random() < dodge) {
        Sound.dodge();
        log(`<span class="lg-good">${e.name}의 공격을 회피했다!</span>`);
        return;
      }
      dmg = dmgRoll(atk, pDef());
      Sound.hit();
      log(`<span class="lg-bad">${e.name}의 공격 — ${dmg} 데미지</span>`);
    }
    battle.php -= dmg;
  };

  if (playerFirst) {
    doPlayerHit();
    if (battle.ehp > 0) doEnemyHit();
  } else {
    doEnemyHit();
    if (battle.php > 0) doPlayerHit();
  }

  if (battle.ehp <= 0) { renderBattle(); return endBattle(true); }
  if (battle.php <= 0) { renderBattle(); return endBattle(false); }

  // 라운드 정리
  if (battle.atkMulTurns > 0) battle.atkMulTurns--;
  battle.round++;
  battle.cardPlayed = false;
  // 산차 고갈 무한전 방지: 30라운드 초과 시 강제 도주 (패배 취급, 페널티 없음)
  if (battle.round > 30) {
    log('<span class="lg-sys">더 버틸 수 없다. 어둠 속으로 몸을 피했다...</span>');
    renderBattle();
    return endBattle(false);
  }
  drawCard();
  renderBattle();
};

function endBattle(won) {
  battle.over = true;
  renderBattle();
  if (won) Sound.win(); else Sound.lose();
  if (battle.mode === 'pvp') return endPvpBattle(won, false);
  if (battle.mode === 'dungeon') return endDungeonBattle(won);

  const ch = CHAPTERS[battle.chapterIdx];
  const isFirstClear = battle.chapterIdx === state.cleared;

  if (!won) {
    log('<span class="lg-bad">쓰러졌다...</span>');
    setTimeout(() => {
      $('#result-title').textContent = '패배...';
      $('#result-body').innerHTML =
        `<p>어둠 속에서 간신히 몸을 피했다. 상처를 추스르고 다시 도전하자.</p>
         <p style="color:var(--dim);font-size:13px">TIP: 카드 뽑기로 더 좋은 장비를 모으거나, 클리어한 챕터를 재도전해 레벨을 올려보자.</p>`;
      $('#btn-result-ok').onclick = () => { renderHub(); show('hub'); };
      show('result');
    }, 700);
    return;
  }

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
    body += `<p class="rc-rare">레벨 업! Lv.${state.level} 달성 — HP ${ps.maxHp} · 공격 ${ps.atk} · 방어 ${ps.def} · 민첩 ${ps.agi}</p>`;
  }
  if (isFirstClear && ch.reward.card) {
    const card = CARDS[ch.reward.card];
    state.cards[card.id] = (state.cards[card.id] || 0) + 1;
    body += `<p>첫 클리어 보상: <b class="rc-${card.rarity}">${card.icon} ${card.name}</b> 획득!</p>`;
  }
  if (isFirstClear) state.cleared++;
  save();

  setTimeout(() => {
    $('#result-title').textContent = '승리!';
    $('#result-body').innerHTML = body;
    $('#btn-result-ok').onclick = () => startScene(battle.chapterIdx, 'outro');
    show('result');
  }, 700);
}

// 그림자 결투 정산 (FEATURE_SPEC §12.3)
function endPvpBattle(won, isDraw) {
  const ctx = battle.pvpCtx;
  let title, body;
  if (isDraw) {
    title = '무승부';
    body = '<p>30라운드가 지나도록 승부가 나지 않았다. 그림자는 어둠 속으로 사라졌다. (보상 없음)</p>';
  } else if (!won) {
    title = '패배...';
    body = `<p>${ctx.name} 의 그림자에게 무릎을 꿇었다. 페널티는 없다 — 산차를 다듬고 다시 도전하자.</p>`;
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

// 던전 정산 (FEATURE_SPEC §6.3)
function endDungeonBattle(won) {
  if (!won) {
    log('<span class="lg-bad">쓰러졌다...</span>');
    setTimeout(() => {
      $('#result-title').textContent = '순찰 실패...';
      $('#result-body').innerHTML =
        '<p>간신히 골목을 빠져나왔다. 입장 횟수는 소모되었다.</p>';
      $('#btn-result-ok').onclick = () => { renderDungeon(); show('dungeon'); };
      show('result');
    }, 700);
    return;
  }

  log(`<span class="lg-sys">${battle.enemy.name} 을(를) 정리했다!</span>`);
  const rw = dungeonReward(state.level);
  const ups = gainExp(rw.exp);
  state.gold += rw.gold;

  let body = `<p>보수: 🪙 <b class="rc-legend">+${rw.gold}</b> · 경험치 <b>+${rw.exp}</b></p>`;
  if (ups > 0) {
    Sound.levelup();
    const ps = playerStats();
    body += `<p class="rc-rare">레벨 업! Lv.${state.level} 달성 — HP ${ps.maxHp} · 공격 ${ps.atk} · 방어 ${ps.def} · 민첩 ${ps.agi}</p>`;
  }
  if (Math.random() < DUNGEON_CARD_DROP) {
    const pool = Object.values(CARDS).filter(c => c.rarity === 'common' || c.rarity === 'rare');
    const card = pool[Math.floor(Math.random() * pool.length)];
    state.cards[card.id] = (state.cards[card.id] || 0) + 1;
    body += `<p>골목에서 주웠다: <b class="rc-${card.rarity}">${card.icon} ${card.name}</b></p>`;
  }
  save();

  setTimeout(() => {
    $('#result-title').textContent = '순찰 완료!';
    $('#result-body').innerHTML = body;
    $('#btn-result-ok').onclick = () => { renderDungeon(); show('dungeon'); };
    show('result');
  }, 700);
}

// ---------- 카드 뽑기 ----------
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
  const btn = $('#btn-gacha');
  const left = GACHA_PITY - state.pity;
  btn.textContent = `🕯️ 초 녹이기 (${GACHA_COST} 골드) — 보유 ${state.gold}G · 전설 확정까지 ${left}회`;
  btn.disabled = state.gold < GACHA_COST;
}

function renderGacha() {
  $('#gacha-result').innerHTML = '<p style="color:var(--dim)">초를 골라 밀랍을 녹여보자...</p>';
  updateGachaButton();
  $('#btn-gacha').onclick = doGacha;
}

function doGacha() {
  if (state.gold < GACHA_COST) return;
  state.gold -= GACHA_COST;
  // 천장: 이번이 GACHA_PITY회째(직전까지 GACHA_PITY-1회 연속 전설 없음)면 전설 확정
  const rarity = state.pity >= GACHA_PITY - 1 ? 'legend' : rollRarity();
  state.pity = rarity === 'legend' ? 0 : state.pity + 1;
  const pool = Object.values(CARDS).filter(c => c.rarity === rarity);
  const card = pool[Math.floor(Math.random() * pool.length)];
  state.cards[card.id] = (state.cards[card.id] || 0) + 1;
  save();
  if (rarity === 'legend') Sound.legend(); else Sound.gacha();

  $('#gacha-result').innerHTML = `
    <div class="gacha-card r-${card.rarity}" style="border-color:var(--${card.rarity})">
      <div class="g-icon">${card.icon}</div>
      <div class="g-rarity rc-${card.rarity}">${RARITY[card.rarity].label}</div>
      <div class="g-name">${cardLabel(card.id)}</div>
      <div class="g-desc">${cardDesc(card.id)}</div>
    </div>`;
  updateGachaButton();
}

// ---------- 보관함 / 도감 ----------
function renderDeck() {
  const wrap = $('#deck-list');
  wrap.innerHTML = '';
  const order = { legend: 0, hero: 1, rare: 2, common: 3 };
  const all = Object.keys(CARDS)
    .sort((a, b) => order[CARDS[a].rarity] - order[CARDS[b].rarity]);
  const ownedCount = all.filter(id => (state.cards[id] || 0) > 0).length;
  $('#deck-progress').textContent = `도감 ${ownedCount} / ${all.length} · 🪙 ${state.gold} 골드`;

  all.forEach(id => {
    const card = CARDS[id];
    const n = state.cards[id] || 0;
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}` + (n === 0 ? ' unowned' : '');

    if (n === 0) {
      // 도감: 미보유 카드는 실루엣 (FR-13)
      div.innerHTML = `
        <div class="c-icon">❔</div>
        <div class="c-name">???</div>
        <div class="c-desc">미보유 · ${RARITY[card.rarity].label}</div>`;
      wrap.appendChild(div);
      return;
    }

    const lv = upLv(id);
    let upHtml = '';
    if (isUpgradable(id)) {
      if (lv >= UPGRADE_MAX) {
        upHtml = `<button class="btn-up" disabled>강화 완료</button>`;
      } else {
        const cost = UPGRADE_COST[card.rarity];
        upHtml = `<button class="btn-up" data-up="${id}" ${canUpgrade(id) ? '' : 'disabled'}>⬆ 강화 (1장+${cost}G)</button>`;
      }
    }
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${cardLabel(id)}</div>
      <div class="c-desc">${cardDesc(id)}</div>
      <div class="c-count">× ${n}</div>
      ${upHtml}`;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll('[data-up]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.up;
      if (upgradeCard(id)) renderDeck();
    });
  });
}

// ---------- 서브 스토리 ----------
function renderSubstory() {
  const c = CHARACTERS[state.charId];
  $('#substory-title').textContent = `📜 ${c.name} — ${c.title}`;
  $('#substory-text').innerHTML = c.substory.map(t => `<p>${t}</p>`).join('');
}

// ---------- 시작 ----------
initTitle();
