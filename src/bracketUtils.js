/**
 * Build a double-elimination bracket for N players.
 * Any number of players; uses byes to fill to next power of 2 for WB R1.
 * Returns flat list of matches with advancement rules.
 */

const BYE = { id: 'bye', name: 'Bye' };

function makeMatchId(bracket, round, index) {
  return `${bracket}_${round}_${index}`;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildSingleElimBracket(players) {
  const list = [...players];
  const n = list.length;
  if (n < 2) return { matches: [], matchById: {}, bye: BYE };

  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
  const byes = size - n;
  const seeded = shuffleArray([...list]);
  for (let i = 0; i < byes; i++) seeded.push(BYE);

  const matches = [];
  const matchById = {};
  const rounds = Math.log2(size);

  for (let r = 0; r < rounds; r++) {
    const numMatches = size / Math.pow(2, r + 1);
    for (let m = 0; m < numMatches; m++) {
      const id = makeMatchId('se', r, m);
      const match = {
        id,
        bracket: 'se',
        round: r,
        roundLabel: r === 0 ? 'R1' : r === 1 ? 'R2' : r === 2 ? 'R3' : `R${r + 1}`,
        matchIndex: m,
        p1: null,
        p2: null,
        winner: null,
        nextMatchId: r < rounds - 1 ? makeMatchId('se', r + 1, Math.floor(m / 2)) : null,
        nextSlot: r < rounds - 1 ? m % 2 : null,
      };
      if (r === 0) {
        match.p1 = seeded[m * 2] ?? null;
        match.p2 = seeded[m * 2 + 1] ?? null;
      }
      matches.push(match);
      matchById[id] = match;
    }
  }

  return { matches, matchById, bye: BYE };
}

export function buildDoubleElimBracket(players) {
  const list = [...players];
  const n = list.length;
  if (n < 2) return { matches: [], matchById: {}, bye: BYE };

  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
  const byes = size - n;
  const seeded = shuffleArray([...list]);
  for (let i = 0; i < byes; i++) seeded.push(BYE);

  const matches = [];
  const matchById = {};

  // —— Winner's Bracket ——
  const wbRounds = Math.log2(size); // e.g. 8 -> 3 rounds
  for (let r = 0; r < wbRounds; r++) {
    const numMatches = size / Math.pow(2, r + 1);
    for (let m = 0; m < numMatches; m++) {
      const id = makeMatchId('wb', r, m);
      const match = {
        id,
        bracket: 'wb',
        round: r,
        roundLabel: r === 0 ? 'WB R1' : r === 1 ? 'WB R2' : r === 2 ? 'WB R3' : `WB R${r + 1}`,
        matchIndex: m,
        p1: null,
        p2: null,
        winner: null,
        nextMatchId: null,
        nextSlot: null,
        nextLoseMatchId: null,
        nextLoseSlot: null,
      };
      if (r === 0) {
        match.p1 = seeded[m * 2] ?? null;
        match.p2 = seeded[m * 2 + 1] ?? null;
      }
      if (r < wbRounds - 1) {
        match.nextMatchId = makeMatchId('wb', r + 1, Math.floor(m / 2));
        match.nextSlot = m % 2;
      } else {
        match.nextMatchId = 'gf_0_0';
        match.nextSlot = 0;
      }
      if (r === 0) {
        if (size === 2) {
          match.nextLoseMatchId = 'gf_0_0';
          match.nextLoseSlot = 1;
        } else {
          const lbMatchIndex = Math.floor(m / 2);
          match.nextLoseMatchId = makeMatchId('lb', 0, lbMatchIndex);
          match.nextLoseSlot = m % 2;
        }
      } else if (r === 1 && wbRounds >= 2) {
        match.nextLoseMatchId = makeMatchId('lb', 1, m);
        match.nextLoseSlot = 0;
      }
      // WB final loser is eliminated (Grand Final is WB winner vs LB winner only)
      matches.push(match);
      matchById[id] = match;
    }
  }

  // —— Loser's Bracket ——
  const lbR0Matches = size / 4;
  for (let m = 0; m < lbR0Matches; m++) {
    const id = makeMatchId('lb', 0, m);
    const match = {
      id,
      bracket: 'lb',
      round: 0,
      roundLabel: 'LB R1',
      matchIndex: m,
      p1: null,
      p2: null,
      winner: null,
      nextMatchId: makeMatchId('lb', 1, m),
      nextSlot: 1,
      nextLoseMatchId: null,
      nextLoseSlot: null,
    };
    matches.push(match);
    matchById[id] = match;
  }
  for (let m = 0; m < lbR0Matches; m++) {
    const id = makeMatchId('lb', 1, m);
    const match = {
      id,
      bracket: 'lb',
      round: 1,
      roundLabel: 'LB R2',
      matchIndex: m,
      p1: null,
      p2: null,
      winner: null,
      nextMatchId: lbR0Matches === 1 ? 'gf_0_0' : makeMatchId('lb', 2, 0),
      nextSlot: lbR0Matches === 1 ? 1 : m,
      nextLoseMatchId: null,
      nextLoseSlot: null,
    };
    matches.push(match);
    matchById[id] = match;
  }
  if (lbR0Matches > 1) {
    const id = makeMatchId('lb', 2, 0);
    matchById[id] = {
      id,
      bracket: 'lb',
      round: 2,
      roundLabel: 'LB Final',
      matchIndex: 0,
      p1: null,
      p2: null,
      winner: null,
      nextMatchId: 'gf_0_0',
      nextSlot: 1,
      nextLoseMatchId: null,
      nextLoseSlot: null,
    };
    matches.push(matchById[id]);
  }

  // —— Grand Finals ——
  const gf = {
    id: 'gf_0_0',
    bracket: 'gf',
    round: 0,
    roundLabel: 'Grand Final',
    matchIndex: 0,
    p1: null,
    p2: null,
    winner: null,
    nextMatchId: null,
    nextSlot: null,
    nextLoseMatchId: null,
    nextLoseSlot: null,
  };
  matches.push(gf);
  matchById['gf_0_0'] = gf;

  return { matches, matchById, bye: BYE };
}

export function advancePlayer(matchById, match, slot, player) {
  const nextId = slot === 'win' ? match.nextMatchId : match.nextLoseMatchId;
  const nextSlot = slot === 'win' ? match.nextSlot : match.nextLoseSlot;
  if (!nextId || nextSlot == null) return;
  const nextMatch = matchById[nextId];
  if (!nextMatch) return;
  if (nextSlot === 0) nextMatch.p1 = player;
  else nextMatch.p2 = player;
}

export function buildRoundRobinMatches(players) {
  const list = players.filter((p) => p?.id !== 'bye');
  const matches = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      matches.push({
        id: `rr_${list[i].id}_${list[j].id}`,
        p1: list[i],
        p2: list[j],
        winner: null,
      });
    }
  }
  return { matches, standings: list.map((p) => ({ player: p, wins: 0, losses: 0 })) };
}

export function buildCompassDraw(players) {
  const list = shuffleArray([...players].filter((p) => p?.id !== 'bye'));
  const n = list.length;
  if (n < 4) return { groups: [], finals: [] };
  const perGroup = Math.ceil(n / 4);
  const groups = [
    { id: 'N', label: 'North', players: list.slice(0, perGroup), matches: [] },
    { id: 'S', label: 'South', players: list.slice(perGroup, perGroup * 2), matches: [] },
    { id: 'E', label: 'East', players: list.slice(perGroup * 2, perGroup * 3), matches: [] },
    { id: 'W', label: 'West', players: list.slice(perGroup * 3, n), matches: [] },
  ];
  groups.forEach((g) => {
    const p = g.players;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        g.matches.push({
          id: `compass_${g.id}_${i}_${j}`,
          p1: p[i],
          p2: p[j],
          winner: null,
        });
      }
    }
  });
  const finals = [
    { id: 'compass_semi1', p1: null, p2: null, winner: null, label: 'Semi 1 (N vs S)' },
    { id: 'compass_semi2', p1: null, p2: null, winner: null, label: 'Semi 2 (E vs W)' },
    { id: 'compass_final', p1: null, p2: null, winner: null, label: 'Final' },
  ];
  return { groups, finals };
}

export function buildTripleElimBracket(players) {
  return buildDoubleElimBracket(players);
}

export function buildLadderRankings(players) {
  const list = shuffleArray([...players].filter((p) => p?.id !== 'bye'));
  return {
    rankings: list.map((p, i) => ({ rank: i + 1, player: p })),
    challengeMatch: null,
  };
}

export { BYE };
