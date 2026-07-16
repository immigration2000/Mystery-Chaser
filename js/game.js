// 미스테리 체이서: 검은 촛불 — 게임 로직
'use strict';

const SAVE_KEY = 'mystery-chaser-fan-save-v1';

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
function newState(charId) {
  return {
    charId,
    level: 1,
    exp: 0,
    gold: 120,
    cards: { ...STARTING_CARDS },
    cleared: 0, // 클리어한 챕터 수 (다음 도전 가능 챕터 인덱스)
  };
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !CHARACTERS[s.charId]) return null;
    return s;
  } catch (e) {
    return null;
  }
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
      state = null;
      alert('기록이 삭제되었습니다.');
    }
  };
}

function renderCharSelect() {
  const wrap = $('#char-list');
  wrap.innerHTML = '';
  Object.values(CHARACTERS).forEach(c => {
    const div = document.createElement('div');
    div.className = 'char-card';
    div.innerHTML = `
      <div class="char-head">
        <span class="char-icon">${c.icon}</span>
        <div>
          <div class="char-name">${c.name}</div>
          <div class="char-title">${c.title}</div>
        </div>
      </div>
      <div class="char-stats">HP ${c.hp} · 공격 ${c.atk} · 방어 ${c.def} · 민첩 ${c.agi}</div>
      <div class="char-skill"><b>${c.skill.name}</b> — ${c.skill.desc}</div>`;
    div.onclick = () => {
      state = newState(c.id);
      save();
      renderHub();
      show('hub');
    };
    wrap.appendChild(div);
  });
}

// ---------- 허브 ----------
function renderHub() {
  const c = CHARACTERS[state.charId];
  const ps = playerStats();
  const need = expNeeded(state.level);
  const pct = Math.min(100, Math.round(state.exp / need * 100));
  $('#hub-status').innerHTML = `
    <div>${c.icon} <b>${c.name}</b> <span style="color:var(--dim)">· ${c.title}</span></div>
    <div>Lv.${state.level} &nbsp; HP ${ps.maxHp} · 공격 ${ps.atk} · 방어 ${ps.def} · 민첩 ${ps.agi}</div>
    <div class="gold">🪙 ${state.gold} 골드</div>
    <div style="font-size:11px;color:var(--dim)">EXP ${state.exp} / ${need}</div>
    <div class="expbar"><div class="expfill" style="width:${pct}%"></div></div>`;
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    const to = btn.dataset.nav;
    if (to === 'hub') { renderHub(); show('hub'); }
    else if (to === 'title') { show('title'); }
    else if (to === 'story') { renderChapters(); show('story'); }
    else if (to === 'gacha') { renderGacha(); show('gacha'); }
    else if (to === 'deck') { renderDeck(); show('deck'); }
    else if (to === 'substory') { renderSubstory(); show('substory'); }
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

// ---------- 전투 ----------
function buildBattleDeck() {
  const deck = [];
  for (const [id, n] of Object.entries(state.cards)) {
    for (let i = 0; i < n; i++) deck.push(id);
  }
  return shuffle(deck);
}

function startBattle(chapterIdx) {
  const ch = CHAPTERS[chapterIdx];
  const ps = playerStats();
  battle = {
    chapterIdx,
    php: ps.maxHp, pmax: ps.maxHp,
    base: ps,
    atkB: 0, defB: 0, agiB: 0,   // 카드 지속 버프
    atkMulTurns: 0,               // 특종감각 남은 라운드
    enemyAtkMul: 1,               // 절대영도 적용 시 0.6
    ehp: ch.enemy.hp,
    enemy: ch.enemy,
    deck: buildBattleDeck(),
    hand: [],
    skillUsed: false,
    cardPlayed: false,
    round: 1,
    over: false,
  };
  $('#battle-log').innerHTML = '';
  for (let i = 0; i < 3; i++) drawCard(false);
  log(`<span class="lg-sys">${ch.enemy.icon} ${ch.enemy.name} 이(가) 나타났다!</span>`);
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
  return Math.round((battle.base.atk + battle.atkB) * mul);
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
  if (battle.enemyAtkMul < 1) buffs.push('적 공격력 -40%');
  $('#player-buffs').textContent = buffs.join(' · ');

  // 손패
  const hand = $('#hand');
  hand.innerHTML = '';
  battle.hand.forEach((id, idx) => {
    const card = CARDS[id];
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}` + (battle.cardPlayed || battle.over ? ' disabled' : '');
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${card.name}</div>
      <div class="c-desc">${card.desc}</div>`;
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
  battle.hand.splice(handIdx, 1);
  battle.cardPlayed = true;

  if (card.type === 'weapon') { battle.atkB += card.value; log(`<span class="lg-good">${card.icon} ${card.name} 장착 — 공격력 +${card.value}</span>`); }
  else if (card.type === 'armor') { battle.defB += card.value; log(`<span class="lg-good">${card.icon} ${card.name} 장착 — 방어력 +${card.value}</span>`); }
  else if (card.type === 'charm') { battle.agiB += card.value; log(`<span class="lg-good">${card.icon} ${card.name} 사용 — 민첩 +${card.value}</span>`); }
  else if (card.type === 'heal') {
    const before = battle.php;
    battle.php = Math.min(battle.pmax, battle.php + card.value);
    log(`<span class="lg-good">${card.icon} ${card.name} 사용 — HP ${battle.php - before} 회복</span>`);
  }
  renderBattle();
}

$('#btn-skill').onclick = () => {
  if (!battle || battle.skillUsed || battle.over) return;
  battle.skillUsed = true;
  const cid = state.charId;
  const skill = CHARACTERS[cid].skill;
  log(`<span class="lg-sys">✨ 고유 스킬 발동 — ${skill.name}!</span>`);
  if (cid === 'edwin') {
    battle.enemyAtkMul = 0.6;
    log('<span class="lg-good">적의 무기에 서리가 앉는다. 적 공격력 40% 감소!</span>');
  } else if (cid === 'gregor') {
    const heal = Math.round(battle.pmax * 0.4);
    battle.php = Math.min(battle.pmax, battle.php + heal);
    log(`<span class="lg-good">광기 어린 기도가 상처를 봉한다. HP ${heal} 회복!</span>`);
  } else if (cid === 'aria') {
    drawCard(); drawCard();
    log('<span class="lg-good">전황을 완전분석했다.</span>');
  } else if (cid === 'jack') {
    battle.atkMulTurns = 2;
    log('<span class="lg-good">특종의 냄새가 난다! 2라운드 동안 공격력 ×1.5!</span>');
  }
  renderBattle();
};

function dmgRoll(atk, def) {
  return Math.max(1, Math.round(atk * rand(0.9, 1.1) - def * 0.5));
}

$('#btn-attack').onclick = () => {
  if (!battle || battle.over) return;
  const e = battle.enemy;
  const playerFirst = pAgi() >= e.agi;
  log(`<span class="lg-sys">— ${battle.round}라운드 —</span>`);

  const doPlayerHit = () => {
    const dmg = dmgRoll(pAtk(), e.def);
    battle.ehp -= dmg;
    log(`<span class="lg-hit">공격! ${e.name}에게 ${dmg} 데미지</span>`);
  };
  const doEnemyHit = () => {
    const dark = battle.round % 3 === 0;
    let atk = e.atk * battle.enemyAtkMul;
    let dmg;
    if (dark) {
      dmg = Math.max(1, Math.round(atk * 1.3));
      log(`<span class="lg-bad">${e.icon} 흑마법! 방어를 무시하고 ${dmg} 데미지</span>`);
    } else {
      dmg = dmgRoll(atk, pDef());
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
  drawCard();
  renderBattle();
};

function endBattle(won) {
  battle.over = true;
  renderBattle();
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

function renderGacha() {
  $('#gacha-result').innerHTML = '<p style="color:var(--dim)">초를 골라 밀랍을 녹여보자...</p>';
  const btn = $('#btn-gacha');
  btn.textContent = `🕯️ 초 녹이기 (${GACHA_COST} 골드)`;
  btn.disabled = state.gold < GACHA_COST;
  btn.onclick = doGacha;
}

function doGacha() {
  if (state.gold < GACHA_COST) return;
  state.gold -= GACHA_COST;
  const rarity = rollRarity();
  const pool = Object.values(CARDS).filter(c => c.rarity === rarity);
  const card = pool[Math.floor(Math.random() * pool.length)];
  state.cards[card.id] = (state.cards[card.id] || 0) + 1;
  save();

  $('#gacha-result').innerHTML = `
    <div class="gacha-card r-${card.rarity}" style="border-color:var(--${card.rarity})">
      <div class="g-icon">${card.icon}</div>
      <div class="g-rarity rc-${card.rarity}">${RARITY[card.rarity].label}</div>
      <div class="g-name">${card.name}</div>
      <div class="g-desc">${card.desc}</div>
    </div>`;
  const btn = $('#btn-gacha');
  btn.textContent = `🕯️ 초 녹이기 (${GACHA_COST} 골드) — 보유 ${state.gold}G`;
  btn.disabled = state.gold < GACHA_COST;
}

// ---------- 보관함 ----------
function renderDeck() {
  const wrap = $('#deck-list');
  wrap.innerHTML = '';
  const order = { legend: 0, hero: 1, rare: 2, common: 3 };
  const owned = Object.entries(state.cards)
    .filter(([, n]) => n > 0)
    .sort((a, b) => order[CARDS[a[0]].rarity] - order[CARDS[b[0]].rarity]);
  if (owned.length === 0) {
    wrap.innerHTML = '<p style="color:var(--dim)">보유한 카드가 없다.</p>';
    return;
  }
  owned.forEach(([id, n]) => {
    const card = CARDS[id];
    const div = document.createElement('div');
    div.className = `card r-${card.rarity}`;
    div.innerHTML = `
      <div class="c-icon">${card.icon}</div>
      <div class="c-name">${card.name}</div>
      <div class="c-desc">${card.desc}</div>
      <div class="c-count">× ${n}</div>`;
    wrap.appendChild(div);
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
