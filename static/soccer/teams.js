// National kits for the World Cup. Shirt numbers and colors follow the country
// strips: stripes, a chest sash, or side bars. The ace is the player you control.

const HOME_IDS = new Set(['ren', 'jun', 'kei', 'tetsu']);

const ROLES = [
  { id: 'ren', slot: 'ace', hair: 'black', skin: '#f0c2a0' },
  { id: 'jun', slot: 'wingR', hair: 'brown', skin: '#e0aa88' },
  { id: 'kei', slot: 'wingL', hair: 'teal', skin: '#e7b898' },
  { id: 'tetsu', slot: 'gk', hair: 'orange', skin: '#f3c7a4' },
  { id: 'kai', slot: 'ace', hair: 'silver', skin: '#f6d3b0' },
  { id: 'riku', slot: 'wingL', hair: 'black', skin: '#c6865a' },
  { id: 'daichi', slot: 'wingR', hair: 'rust', skin: '#d7a574' },
  { id: 'goro', slot: 'gk', hair: 'navy', skin: '#e8b898' },
];

function kit(shirt, short, sock, ink, extra = {}) {
  return { shirt, short, sock, boot: '#1a1c22', ink, ...extra };
}

export const NATIONS = [
  {
    id: 'argentina',
    name: 'Argentina',
    kit: kit('#7ec8ea', '#1a1c22', '#f7f4ea', '#1a1c22', { pattern: 'stripes', stripe: '#f7f4ea' }),
    keeper: kit('#143026', '#0e1a14', '#7ec8ea', '#f7f4ea'),
    squad: {
      ace: { name: 'Messi', number: 10, lead: true },
      wingR: { name: 'Nico Prado', number: 7 },
      wingL: { name: 'Lucho Quiroga', number: 11 },
      gk: { name: 'Rafa Molina', number: 1 },
    },
  },
  {
    id: 'france',
    name: 'France',
    kit: kit('#1f3fbf', '#f4f7fb', '#c8102e', '#f7f4ea'),
    keeper: kit('#f0c42a', '#1f3fbf', '#f0c42a', '#1a1c22'),
    squad: {
      ace: { name: 'Mbappé', number: 10, lead: true },
      wingR: { name: 'Adrien Pelletier', number: 11 },
      wingL: { name: 'Marc Duval', number: 7 },
      gk: { name: 'Hugo Renard', number: 1 },
    },
  },
  {
    id: 'germany',
    name: 'Germany',
    kit: kit('#f7f4ea', '#16181d', '#f7f4ea', '#1a1c22', {
      pattern: 'sides', stripe: '#16181d', stripe2: '#dd0000', stripe3: '#f0c400',
    }),
    keeper: kit('#0d6b3a', '#16181d', '#0d6b3a', '#f7f4ea'),
    squad: {
      ace: { name: 'Kimmich', number: 6, lead: true },
      wingR: { name: 'Finn Berger', number: 7 },
      wingL: { name: 'Lukas Hartmann', number: 10 },
      gk: { name: 'Erik Vogel', number: 1 },
    },
  },
  {
    id: 'spain',
    name: 'Spain',
    kit: kit('#c60b1e', '#0d3d8c', '#c60b1e', '#f7f4ea', {
      pattern: 'sides', stripe: '#f1c400', stripe2: '#f1c400', stripe3: '#f1c400',
    }),
    keeper: kit('#f7f4ea', '#16181d', '#f1c400', '#1a1c22'),
    squad: {
      ace: { name: 'Lamine Yamal', number: 19, lead: true },
      wingR: { name: 'Nico Soler', number: 11 },
      wingL: { name: 'Marc Vidal', number: 7 },
      gk: { name: 'Pol Serra', number: 1 },
    },
  },
  {
    id: 'england',
    name: 'England',
    kit: kit('#f7f4ea', '#0d1c4d', '#f7f4ea', '#1a1c22'),
    keeper: kit('#f0c42a', '#0d1c4d', '#f0c42a', '#1a1c22'),
    squad: {
      ace: { name: 'Harry Kane', number: 9, lead: true },
      wingR: { name: 'Owen Blake', number: 11 },
      wingL: { name: 'Jamie Cole', number: 7 },
      gk: { name: 'Ben Archer', number: 1 },
    },
  },
  {
    id: 'norway',
    name: 'Norway',
    kit: kit('#d31216', '#f7f4ea', '#0033a0', '#f7f4ea', {
      pattern: 'sash', stripe: '#0033a0', stripe2: '#f7f4ea', stripe3: '#0033a0',
    }),
    keeper: kit('#0033a0', '#f7f4ea', '#0033a0', '#f7f4ea'),
    squad: {
      ace: { name: 'Erling Haaland', number: 9, lead: true },
      wingR: { name: 'Magnus Berg', number: 8 },
      wingL: { name: 'Erik Dahl', number: 11 },
      gk: { name: 'Lars Viken', number: 1 },
    },
  },
  {
    id: 'portugal',
    name: 'Portugal',
    kit: kit('#d31216', '#0d6b3a', '#d31216', '#f7f4ea'),
    keeper: kit('#f0c42a', '#16181d', '#0d6b3a', '#1a1c22'),
    squad: {
      ace: { name: 'Cristiano Ronaldo', number: 7, lead: true },
      wingR: { name: 'Tiago Serra', number: 11 },
      wingL: { name: 'Pedro Lemos', number: 20 },
      gk: { name: 'Dinis Carvalho', number: 1 },
    },
  },
  {
    id: 'brazil',
    name: 'Brazil',
    kit: kit('#ffe14a', '#1f3f8f', '#f7f4ea', '#1a1c22'),
    keeper: kit('#0d6b3a', '#0d6b3a', '#ffe14a', '#f7f4ea'),
    squad: {
      ace: { name: 'Neymar', number: 10, lead: true },
      wingR: { name: 'Davi Luz', number: 11 },
      wingL: { name: 'Rafa Moura', number: 7 },
      gk: { name: 'Gil Santos', number: 1 },
    },
  },
];

export function nationById(id) {
  return NATIONS.find((nation) => nation.id === id) || null;
}

export function opponentsOf(teamId) {
  return NATIONS.filter((nation) => nation.id !== teamId);
}

export const KNOCKOUT_ROUNDS = ['Quarter-final', 'Semi-final', 'Final'];

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function qfPairs(bracket) {
  const s = bracket.slots;
  return [[s[0], s[1]], [s[2], s[3]], [s[4], s[5]], [s[6], s[7]]];
}

function rollWinner(pair, rng) {
  return pair[Math.floor(rng() * 2)];
}

// Eight names, one of them yours. Three wins is the final.
export function createBracket(teamId, rng = Math.random) {
  const others = shuffle(opponentsOf(teamId).map((nation) => nation.id), rng);
  const slot = Math.floor(rng() * 8);
  const slots = [];
  let index = 0;
  for (let i = 0; i < 8; i++) slots.push(i === slot ? teamId : others[index++]);
  return {
    teamId,
    slots,
    qf: [null, null, null, null],
    sf: [null, null],
    champion: null,
    round: 0,
  };
}

export function playerOpponent(bracket) {
  if (bracket.round <= 0) {
    const pair = qfPairs(bracket).find((item) => item.includes(bracket.teamId));
    return pair.find((id) => id !== bracket.teamId);
  }
  const qfIndex = qfPairs(bracket).findIndex((item) => item.includes(bracket.teamId));
  if (bracket.round === 1) {
    const mate = qfIndex % 2 === 0 ? qfIndex + 1 : qfIndex - 1;
    return bracket.qf[mate];
  }
  const side = qfIndex < 2 ? 0 : 1;
  return bracket.sf[1 - side];
}

// The player won the tie they were in. The other ties in that round are a coin flip.
export function advanceBracket(bracket, rng = Math.random) {
  if (bracket.round === 0) {
    bracket.qf = qfPairs(bracket).map((pair) => (
      pair.includes(bracket.teamId) ? bracket.teamId : rollWinner(pair, rng)
    ));
  } else if (bracket.round === 1) {
    const pairs = [[bracket.qf[0], bracket.qf[1]], [bracket.qf[2], bracket.qf[3]]];
    bracket.sf = pairs.map((pair) => (
      pair.includes(bracket.teamId) ? bracket.teamId : rollWinner(pair, rng)
    ));
  } else if (bracket.round === 2) {
    bracket.champion = bracket.teamId;
  }
  bracket.round += 1;
  return bracket.champion ? null : playerOpponent(bracket);
}

// A loss leaves the saved bracket alone. This copy settles only the round just played,
// so the board can show who went through and who is out. Later rounds stay unplayed.
export function knockedOutView(bracket, rng = Math.random) {
  const view = {
    teamId: bracket.teamId,
    slots: bracket.slots.slice(),
    qf: bracket.qf.slice(),
    sf: bracket.sf.slice(),
    champion: bracket.champion,
    round: bracket.round,
    out: true,
  };
  const opp = playerOpponent(view);
  if (view.round === 0) {
    view.qf = qfPairs(view).map((pair) => (
      pair.includes(view.teamId) ? opp : rollWinner(pair, rng)
    ));
  } else if (view.round === 1) {
    const pairs = [[view.qf[0], view.qf[1]], [view.qf[2], view.qf[3]]];
    view.sf = pairs.map((pair) => (
      pair.includes(view.teamId) ? opp : rollWinner(pair, rng)
    ));
  } else if (!view.champion) {
    view.champion = opp;
  }
  return view;
}

// A loss leaves the saved bracket alone. This copy plays the rest of the cup out.
export function previewKnockout(bracket, rng = Math.random) {
  const view = {
    teamId: bracket.teamId,
    slots: bracket.slots.slice(),
    qf: bracket.qf.slice(),
    sf: bracket.sf.slice(),
    champion: bracket.champion,
    round: bracket.round,
    out: true,
  };
  const opp = playerOpponent(view);
  if (view.round === 0) {
    view.qf = qfPairs(view).map((pair) => (
      pair.includes(view.teamId) ? opp : rollWinner(pair, rng)
    ));
  }
  if (view.round <= 1) {
    const pairs = [[view.qf[0], view.qf[1]], [view.qf[2], view.qf[3]]];
    view.sf = pairs.map((pair, i) => {
      if (view.round === 1 && view.sf[i]) return view.sf[i];
      if (pair.includes(view.teamId)) return pair.find((id) => id !== view.teamId);
      return rollWinner(pair, rng);
    });
  }
  if (view.round <= 2 && !view.champion) {
    const pair = [view.sf[0], view.sf[1]];
    view.champion = pair.includes(view.teamId)
      ? pair.find((id) => id !== view.teamId)
      : rollWinner(pair, rng);
  }
  return view;
}

export function bracketTable(view) {
  const quarters = qfPairs(view);
  const semis = view.qf.every(Boolean)
    ? [[view.qf[0], view.qf[1]], [view.qf[2], view.qf[3]]]
    : [];
  const finalPair = view.sf[0] && view.sf[1] ? [[view.sf[0], view.sf[1]]] : [];
  return [
    { name: KNOCKOUT_ROUNDS[0], pairs: quarters, winners: view.qf },
    { name: KNOCKOUT_ROUNDS[1], pairs: semis, winners: view.sf },
    { name: KNOCKOUT_ROUNDS[2], pairs: finalPair, winners: [view.champion] },
  ];
}

export function rosterFor(home, away) {
  const roster = {
    homeName: home.name,
    awayName: away.name,
    homeKit: home.kit,
    awayKit: away.kit,
  };
  for (const role of ROLES) {
    const nation = HOME_IDS.has(role.id) ? home : away;
    const person = nation.squad[role.slot];
    roster[role.id] = {
      name: person.name,
      number: person.number,
      hair: role.hair,
      skin: role.skin,
      kit: role.slot === 'gk' ? nation.keeper : nation.kit,
    };
  }
  return roster;
}

// Each knockout round copies one arcade block. Later rounds then run a little
// faster and finish a little more often. Keeper numbers stay on the block.
export function roundCup(round, cups, home, away) {
  const sourceId = round >= 2 ? 'sky-final' : round >= 1 ? 'rival-cup' : 'harbor-friendly';
  const base = cups.find((cup) => cup.id === sourceId) || cups[0];
  const step = round >= 2 ? 2 : round >= 1 ? 1 : 0;
  const opponent = { ...(base.opponent || {}) };
  opponent.speed = (opponent.speed || 4.35) + step * 0.4;
  opponent.sprint = (opponent.sprint || 6.5) + step * 0.55;
  opponent.scoreBias = step * 0.1;
  return {
    id: `world-${home.id}-${away.id}`,
    name: 'World Cup',
    challenge: true,
    tactic: round >= 2 ? 'drive-threat' : round >= 1 ? 'pair-press' : 'single-press',
    order: 0,
    firstTo: base.firstTo || 3,
    parSeconds: base.parSeconds || 180,
    opponent,
  };
}

export function scoreColor(kit) {
  return kit.shirt;
}

export function jerseyBackground(kit) {
  if (kit.pattern === 'stripes') {
    return `repeating-linear-gradient(90deg, ${kit.shirt} 0 7px, ${kit.stripe} 7px 14px)`;
  }
  if (kit.pattern === 'sash') {
    return `linear-gradient(90deg, ${kit.shirt} 0 36%, ${kit.stripe} 36% 42%, ${kit.stripe2} 42% 50%, ${kit.stripe3} 50% 56%, ${kit.shirt} 56% 100%)`;
  }
  if (kit.pattern === 'sides') {
    return `linear-gradient(90deg, ${kit.shirt} 0 16%, ${kit.stripe} 16% 22%, ${kit.stripe2} 22% 28%, ${kit.stripe3} 28% 34%, ${kit.shirt} 34% 66%, ${kit.stripe} 66% 72%, ${kit.stripe2} 72% 78%, ${kit.stripe3} 78% 84%, ${kit.shirt} 84% 100%)`;
  }
  return kit.shirt;
}

