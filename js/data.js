// 미스테리 체이서: 검은 촛불 — 게임 데이터
// 원작(2013 미스테리 체이서)의 시스템을 재해석한 오리지널 콘텐츠

const CHARACTERS = {
  edwin: {
    id: 'edwin',
    name: '에드윈 프로스트',
    title: '얼음의 귀공자',
    icon: '❄️',
    hp: 90, atk: 12, def: 6, agi: 8,
    skill: {
      name: '절대영도',
      desc: '적의 공격력을 40% 감소시킨다. (전투당 1회)',
    },
    substory: [
      '프로스트 가문의 장남 에드윈은 태어날 때부터 만지는 것을 얼리는 저주를 지녔다.',
      '어머니는 그를 안아보지도 못한 채 세상을 떠났고, 아버지는 아들을 저택 깊은 곳에 가두었다.',
      '그가 처음으로 저택을 나선 것은 아버지의 서재에서 「검은 촛불」의 문장이 찍힌 편지를 발견한 밤이었다.',
      '"이 저주가 누군가의 실험이었다면 — 나는 그자들의 촛불을 전부 얼려버리겠다."',
    ],
  },
  gregor: {
    id: 'gregor',
    name: '그레고르 신부',
    title: '광기의 사제',
    icon: '✝️',
    hp: 110, atk: 10, def: 8, agi: 6,
    skill: {
      name: '광신의 기도',
      desc: '최대 HP의 40%를 회복한다. (전투당 1회)',
    },
    substory: [
      '그레고르는 한때 그레이헤이븐에서 가장 온화한 사제였다.',
      '어느 날 그의 교구민 열둘이 하룻밤 사이 광인이 되어 서로를 물어뜯었다. 그는 그 방에서 사흘을 기도했다.',
      '사흘째 밤, 그는 웃으면서 걸어 나왔다. 사람들은 그도 미쳤다고 수군댔다.',
      '"신이 침묵하신다면, 내가 대신 심판의 말씀을 전해야지. 아주 큰 소리로."',
    ],
  },
  aria: {
    id: 'aria',
    name: '아리아 벨',
    title: '천재소녀',
    icon: '🔍',
    hp: 80, atk: 9, def: 5, agi: 10,
    skill: {
      name: '완전분석',
      desc: '카드를 2장 즉시 드로우한다. (전투당 1회)',
    },
    substory: [
      '열네 살에 왕립학회 논문을 반박한 소녀, 아리아 벨. 그녀의 스승은 도시 최고의 의학자였다.',
      '스승이 남긴 마지막 연구 노트에는 사람의 뇌를 "다시 쓰는" 술식이 적혀 있었다. 그리고 스승은 실종됐다.',
      '노트의 마지막 장에는 검은 밀랍으로 봉인된 초대장이 끼워져 있었다.',
      '"가설: 스승님은 살아 있다. 검증 방법: 검은 촛불을 전부 뒤진다."',
    ],
  },
  jack: {
    id: 'jack',
    name: '잭 하퍼',
    title: '열혈기자',
    icon: '📰',
    hp: 85, atk: 11, def: 5, agi: 12,
    skill: {
      name: '특종감각',
      desc: '2라운드 동안 공격력이 50% 증가한다. (전투당 1회)',
    },
    substory: [
      '그레이헤이븐 가제트의 사회부 기자 잭 하퍼. 실종 사건 기사를 쓸 때마다 데스크에서 기사가 잘려나갔다.',
      '어느 밤, 그의 하숙방에 검은 초 한 자루와 쪽지가 놓여 있었다. "다음 기사는 네 부고다."',
      '잭은 그 초를 창밖으로 던져버리고 타자기 앞에 앉았다.',
      '"협박장을 보냈다는 건 기사가 정답이라는 뜻이지. 1면감이다."',
    ],
  },
};

// 카드 등급: common(일반) / rare(희귀) / hero(영웅) / legend(전설)
const RARITY = {
  common: { label: '일반', weight: 60 },
  rare:   { label: '희귀', weight: 25 },
  hero:   { label: '영웅', weight: 12 },
  legend: { label: '전설', weight: 3 },
};

// type: weapon(+atk 지속) / armor(+def 지속) / charm(+agi 지속) / heal(즉시 회복)
const CARDS = {
  rusty_dagger:  { id: 'rusty_dagger',  name: '녹슨 단검',        rarity: 'common', type: 'weapon', value: 3,  icon: '🗡️', desc: '이번 전투 동안 공격력 +3' },
  old_coat:      { id: 'old_coat',      name: '낡은 코트',        rarity: 'common', type: 'armor',  value: 3,  icon: '🧥', desc: '이번 전투 동안 방어력 +3' },
  bandage:       { id: 'bandage',       name: '붕대',             rarity: 'common', type: 'heal',   value: 15, icon: '🩹', desc: 'HP를 15 회복' },
  tonic:         { id: 'tonic',         name: '각성제',           rarity: 'common', type: 'charm',  value: 2,  icon: '☕', desc: '이번 전투 동안 민첩 +2' },
  silver_knife:  { id: 'silver_knife',  name: '은장도',           rarity: 'rare',   type: 'weapon', value: 6,  icon: '🔪', desc: '이번 전투 동안 공격력 +6' },
  hunter_mail:   { id: 'hunter_mail',   name: '사냥꾼의 갑주',    rarity: 'rare',   type: 'armor',  value: 6,  icon: '🛡️', desc: '이번 전투 동안 방어력 +6' },
  holy_water:    { id: 'holy_water',    name: '성수',             rarity: 'rare',   type: 'heal',   value: 30, icon: '💧', desc: 'HP를 30 회복' },
  pocket_watch:  { id: 'pocket_watch',  name: '회중시계',         rarity: 'rare',   type: 'charm',  value: 4,  icon: '⌚', desc: '이번 전투 동안 민첩 +4' },
  headsman:      { id: 'headsman',      name: '처형인의 대검',    rarity: 'hero',   type: 'weapon', value: 10, icon: '⚔️', desc: '이번 전투 동안 공격력 +10' },
  abbey_plate:   { id: 'abbey_plate',   name: '수도원의 성갑',    rarity: 'hero',   type: 'armor',  value: 10, icon: '🏰', desc: '이번 전투 동안 방어력 +10' },
  elixir:        { id: 'elixir',        name: '비약',             rarity: 'hero',   type: 'heal',   value: 50, icon: '🧪', desc: 'HP를 50 회복' },
  shadow_cloak:  { id: 'shadow_cloak',  name: '그림자 망토',      rarity: 'hero',   type: 'charm',  value: 6,  icon: '🌘', desc: '이번 전투 동안 민첩 +6' },
  whisper:       { id: 'whisper',       name: '서리검 「위스퍼」', rarity: 'legend', type: 'weapon', value: 15, icon: '❄️', desc: '이번 전투 동안 공격력 +15' },
  martyr_relic:  { id: 'martyr_relic',  name: '순교자의 성물',    rarity: 'legend', type: 'armor',  value: 15, icon: '📿', desc: '이번 전투 동안 방어력 +15' },
  life_potion:   { id: 'life_potion',   name: '생명의 물약',      rarity: 'legend', type: 'heal',   value: 9999, icon: '💖', desc: 'HP를 전부 회복' },
  time_watch:    { id: 'time_watch',    name: '시간왜곡 회중시계', rarity: 'legend', type: 'charm',  value: 10, icon: '🕰️', desc: '이번 전투 동안 민첩 +10' },
};

const STARTING_CARDS = { rusty_dagger: 2, old_coat: 1, bandage: 2 };

const GACHA_COST = 80;

const CHAPTERS = [
  {
    title: '제1장 · 안개 낀 부두',
    place: '그레이헤이븐 부둣가',
    intro: [
      '밤안개가 부두를 삼킨 시각. 사흘 전 실종된 등대지기가 창고 뒤에서 발견되었다.',
      '그는 살아 있었다 — 하지만 눈동자에는 촛불 같은 검은 불꽃이 일렁이고 있었다.',
      '"촛불이... 꺼지면 안 돼... 촛불이 부른다..."',
      '그가 녹슨 갈고리를 집어 들고 이쪽으로 걸어온다. 눈은 웃고 있지 않았다.',
    ],
    outro: [
      '쓰러진 노동자의 소매에서 검은 밀랍 조각이 떨어졌다. 밀랍에는 촛대 문장이 찍혀 있다.',
      '아무래도 이 도시의 광기에는 주인이 있는 모양이다. 단서는 폐쇄된 예배당을 가리킨다.',
    ],
    enemy: { name: '광인이 된 부두 노동자', icon: '🪝', hp: 80, atk: 9, def: 3, agi: 6 },
    reward: { exp: 60, gold: 100, card: 'silver_knife' },
  },
  {
    title: '제2장 · 검은 촛불',
    place: '폐쇄된 예배당',
    intro: [
      '못질된 예배당 문틈으로 낮은 성가가 새어 나온다. 안에서는 수십 자루의 검은 초가 타고 있었다.',
      '제단 앞의 수도사가 돌아본다. 두건 아래 얼굴에는 눈이 있어야 할 자리에 밀랍이 흘러 굳어 있다.',
      '"오셨군요, 체이서. 촛불은 언제나 나방을 기다립니다."',
    ],
    outro: [
      '수도사의 품에서 나온 장부에는 "실험체 후보" 명단이 빼곡했다. 전부 실종자들의 이름이다.',
      '명단의 발송지는 옛 교도소 지하 — 20년 전 폐쇄된 곳이다.',
    ],
    enemy: { name: '검은 촛불의 수도사', icon: '🕯️', hp: 100, atk: 11, def: 5, agi: 8 },
    reward: { exp: 80, gold: 120, card: 'hunter_mail' },
  },
  {
    title: '제3장 · 지하 실험실',
    place: '옛 교도소 지하',
    intro: [
      '교도소 지하는 폐쇄된 곳이 아니었다. 복도를 따라 수술대와 유리관, 그리고 이름 대신 번호가 적힌 침대들.',
      '9번 침대의 구속구가 뜯겨 있다. 어둠 속에서 쇠사슬 끌리는 소리가 다가온다.',
      '"아... 프다... 머리가... 지워진다... 네가... 지웠나...?"',
    ],
    outro: [
      '실험체 9호는 마지막 순간, 사람의 눈으로 돌아와 한 곳을 가리켰다 — 공동묘지의 오래된 마녀의 비석.',
      '기록에 따르면 이 실험은 "그분"의 주문 설계를 마녀에게서 받아왔다고 한다.',
    ],
    enemy: { name: '실험체 9호', icon: '⛓️', hp: 140, atk: 13, def: 7, agi: 5 },
    reward: { exp: 110, gold: 150, card: 'headsman' },
  },
  {
    title: '제4장 · 마녀의 밤',
    place: '그레이헤이븐 공동묘지',
    intro: [
      '보름달 아래 공동묘지. 마녀 헤카테의 비석 앞에 촛불이 원을 그리며 타오른다.',
      '원 안에서 여자의 형상이 연기처럼 피어오른다. 백 년 전에 화형당했다는 그 마녀의 그림자다.',
      '"주교가 내 주문을 훔쳐 갔지. 하지만 너희부터 치우는 게 계약이라서 말이야. 미안하게 됐네, 체이서."',
    ],
    outro: [
      '흩어지는 그림자가 마지막으로 속삭였다. "대성당 첨탑. 발타자르. 촛불이 전부 켜지기 전에."',
      '도시의 모든 종이 일제히 울리기 시작했다. 초대장인 셈이다.',
    ],
    enemy: { name: '마녀 헤카테의 그림자', icon: '🌙', hp: 160, atk: 16, def: 8, agi: 11 },
    reward: { exp: 150, gold: 180, card: 'shadow_cloak' },
  },
  {
    title: '제5장 · 촛불이 꺼질 때',
    place: '대성당 첨탑',
    intro: [
      '첨탑의 나선계단 끝, 도시가 한눈에 내려다보이는 방. 수백 자루의 검은 초가 도시의 지도를 따라 배열되어 있다.',
      '주교 발타자르가 돌아본다. 온화한 미소, 그리고 밀랍처럼 창백한 피부.',
      '"광기는 병이 아닙니다, 체이서. 구원입니다. 생각을 멈춘 양떼는 더 이상 고통받지 않아요."',
      '"마지막 촛불은 — 당신입니다."',
    ],
    outro: [
      '촛불이 일제히 꺼졌다. 도시를 덮었던 검은 안개가 걷히고, 사람들의 눈에서 검은 불꽃이 사라졌다.',
      '그러나 발타자르의 시신은 끝내 발견되지 않았다. 밀랍 한 줌만이 첨탑 바닥에 남아 있었다.',
      '— 1부 끝. 체이서의 추적은 계속된다. —',
    ],
    enemy: { name: '주교 발타자르', icon: '🕯️', hp: 220, atk: 19, def: 10, agi: 10 },
    reward: { exp: 220, gold: 300, card: 'whisper' },
  },
];
