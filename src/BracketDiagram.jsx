import React, { useState, useMemo } from 'react';

const SLOT_HEIGHT = 44;
const MATCH_WIDTH = 176;
const DRAG_TYPE = 'application/victory-dart-player';

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One match per board at a time. Each wave uses at most `boardCount` matches on boards 1..boardCount
 * (no duplicate board in the same wave). Extra matches go to wave 2, 3, … (sit out until that wave).
 */
function assignBoardsWavesForRound(roundMatches, boardCount) {
  const n = Math.max(1, Math.min(6, Number(boardCount) || 1));
  const map = new Map();
  if (!roundMatches.length) return map;

  const list = shuffleArray([...roundMatches]);
  const totalWaves = Math.ceil(list.length / n);
  let idx = 0;
  for (let w = 0; w < totalWaves; w++) {
    const waveSize = Math.min(n, list.length - idx);
    const waveMatches = list.slice(idx, idx + waveSize);
    const boards = shuffleArray([...Array(waveSize)].map((_, i) => i + 1));
    waveMatches.forEach((m, i) => {
      map.set(m.id, { board: boards[i], wave: w + 1, totalWaves });
    });
    idx += waveSize;
  }
  return map;
}

function buildBoardMapSingleElim(matches, boardCount) {
  const map = new Map();
  const roundGroups = matches.reduce((acc, m) => {
    const label = m.roundLabel ?? `R${(m.round ?? 0) + 1}`;
    if (!acc[label]) acc[label] = [];
    acc[label].push(m);
    return acc;
  }, {});
  const rounds = Object.entries(roundGroups).sort((a, b) => {
    const rA = matches.find((m) => m.roundLabel === a[0])?.round ?? 0;
    const rB = matches.find((m) => m.roundLabel === b[0])?.round ?? 0;
    return rA - rB;
  });
  rounds.forEach(([, roundMatches]) => {
    assignBoardsWavesForRound(roundMatches, boardCount).forEach((v, k) => map.set(k, v));
  });
  return map;
}

function roundGroupsByRoundNum(list) {
  const mm = new Map();
  list.forEach((m) => {
    const r = m.round;
    if (!mm.has(r)) mm.set(r, []);
    mm.get(r).push(m);
  });
  return Array.from(mm.entries()).sort((a, b) => a[0] - b[0]);
}

function sortMatchesByWaveAndBoard(roundMatches, boardByMatchId) {
  return [...roundMatches].sort((a, b) => {
    const sa = boardByMatchId.get(a.id);
    const sb = boardByMatchId.get(b.id);
    if (!sa || !sb) return 0;
    if (sa.wave !== sb.wave) return sa.wave - sb.wave;
    return sa.board - sb.board;
  });
}

function buildBoardMapDoubleElim(matches, boardCount) {
  const map = new Map();
  const wb = matches.filter((m) => m.bracket === 'wb');
  const lb = matches.filter((m) => m.bracket === 'lb');
  const gf = matches.filter((m) => m.bracket === 'gf');

  roundGroupsByRoundNum(wb).forEach(([, roundMatches]) => {
    assignBoardsWavesForRound(roundMatches, boardCount).forEach((v, k) => map.set(k, v));
  });
  roundGroupsByRoundNum(lb).forEach(([, roundMatches]) => {
    assignBoardsWavesForRound(roundMatches, boardCount).forEach((v, k) => map.set(k, v));
  });
  if (gf.length) {
    assignBoardsWavesForRound(gf, boardCount).forEach((v, k) => map.set(k, v));
  }
  return map;
}

function SlotCell({ match, slotIndex, onWin, selectedMatchId, isEditable, onSlotDrop }) {
  const player = slotIndex === 0 ? match.p1 : match.p2;
  const name = (p) => (p?.id === 'bye' ? 'Bye' : p?.name ?? '—');
  const [dragOver, setDragOver] = useState(false);
  const isEmpty = !player;
  const isByeSlot = player?.id === 'bye';

  const handleDragOver = (e) => {
    if (!isEditable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    if (!isEditable) return;
    e.preventDefault();
    setDragOver(false);
    try {
      const payload = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '{}');
      if (payload.player) onSlotDrop(match.id, slotIndex, payload);
    } catch {}
  };

  const handleSlotDragStart = (e) => {
    if (!isEditable || !player || player.id === 'bye') return;
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
      player: { id: player.id, name: player.name },
      sourceMatchId: match.id,
      sourceSlot: slotIndex,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const content = (
    <>
      {isEmpty ? (isByeSlot ? 'Bye' : null) : name(player)}
      {!isEmpty && match.winner === player?.id && ' ✓'}
    </>
  );
  const showDropHere = isEmpty && !isByeSlot;

  const baseClass = `flex-1 px-2.5 py-2 text-base border-b border-slate-300 dark:border-slate-600 ${
    match.winner === player?.id ? 'bg-emerald-200/60 dark:bg-emerald-700/40 font-semibold' : 'bg-slate-100/90 dark:bg-slate-800/80'
  }`;

  if (isEditable) {
    return (
      <div
        draggable={!!player && player.id !== 'bye'}
        onDragStart={handleSlotDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`${baseClass} ${!player || player.id === 'bye' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${dragOver ? 'ring-2 ring-amber-500 dark:ring-amber-400 bg-slate-100 dark:bg-slate-700/80' : ''}`}
      >
        {showDropHere ? <span className="text-slate-600 dark:text-slate-500 italic">Drop here</span> : (isByeSlot ? <span className="text-amber-500/90">Bye</span> : content)}
      </div>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

/** assignment: { board, wave, totalWaves } */
function matchTitle(match, assignment) {
  const base = match.roundLabel ?? '';
  if (!assignment || assignment.board == null || assignment.board < 1) return base;
  const { board, wave, totalWaves } = assignment;
  const wavePart = totalWaves > 1 ? ` · Wave ${wave}/${totalWaves}` : '';
  return base ? `${base}${wavePart} · Board ${board}` : `Board ${board}`;
}

function BracketMatchCell({ match, onWin, selectedMatchId, isEditable, onSlotDrop, boardAssignment }) {
  const isBye1 = match.p1?.id === 'bye';
  const isBye2 = match.p2?.id === 'bye';
  const isBye = isBye1 || isBye2;
  const singlePlayer = isBye1 ? match.p2 : isBye2 ? match.p1 : null;

  const name = (p) => (p?.id === 'bye' ? 'Bye' : p?.name ?? '—');
  const isSelected = selectedMatchId === match.id;

  if (isBye && singlePlayer && !isEditable) {
    return (
      <div
        style={{ minWidth: MATCH_WIDTH - 20 }}
        className={`rounded border px-2 py-1.5 text-base ${
          isSelected ? 'border-amber-400 bg-amber-500/10' : 'border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-700/50'
        }`}
      >
        <div className="text-slate-600 dark:text-slate-400 text-sm font-mono">{matchTitle(match, boardAssignment)}</div>
        <div className="font-medium text-slate-700 dark:text-slate-300">{name(singlePlayer)}</div>
        <div className="text-sm text-amber-500/80">Advances (Bye)</div>
        {!match.winner && (
          <button
            type="button"
            className="mt-1 w-full py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm"
            onClick={() => onWin(match.id, singlePlayer.id)}
          >
            Advance
          </button>
        )}
      </div>
    );
  }

  if (isBye && isEditable) {
    return (
      <div
        style={{ minWidth: MATCH_WIDTH - 20 }}
        className={`rounded border overflow-hidden ${
          isSelected ? 'border-amber-400 ring-1 ring-amber-500 dark:ring-amber-400' : 'border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-800/80'
        }`}
      >
        <div className="text-slate-600 dark:text-slate-500 text-sm font-mono px-2 py-1 bg-slate-100/90 dark:bg-slate-700/50">{matchTitle(match, boardAssignment)}</div>
        <div className="flex">
          <SlotCell match={match} slotIndex={0} onWin={onWin} selectedMatchId={selectedMatchId} isEditable onSlotDrop={onSlotDrop} />
          <SlotCell match={match} slotIndex={1} onWin={onWin} selectedMatchId={selectedMatchId} isEditable onSlotDrop={onSlotDrop} />
        </div>
        {!match.winner && singlePlayer && (
          <button
            type="button"
            className="w-full py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-500 text-white"
            onClick={() => onWin(match.id, singlePlayer.id)}
          >
            Advance (Bye)
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ minWidth: MATCH_WIDTH - 20 }}
      className={`rounded border overflow-hidden ${
        isSelected ? 'border-amber-400 ring-1 ring-amber-500 dark:ring-amber-400' : 'border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-800/80'
      }`}
    >
      <div className="text-slate-600 dark:text-slate-500 text-sm font-mono px-2 py-1 bg-slate-100/90 dark:bg-slate-700/50">{matchTitle(match, boardAssignment)}</div>
      <div className="flex">
        <SlotCell
          match={match}
          slotIndex={0}
          onWin={onWin}
          selectedMatchId={selectedMatchId}
          isEditable={isEditable}
          onSlotDrop={onSlotDrop}
        />
        <SlotCell
          match={match}
          slotIndex={1}
          onWin={onWin}
          selectedMatchId={selectedMatchId}
          isEditable={isEditable}
          onSlotDrop={onSlotDrop}
        />
      </div>
      {!match.winner && match.p1 && match.p2 && match.p1.id !== 'bye' && match.p2.id !== 'bye' && (
        <div className="flex text-sm">
          <button
            type="button"
            className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
            onClick={() => onWin(match.id, match.p1.id)}
          >
            Win
          </button>
          <button
            type="button"
            className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
            onClick={() => onWin(match.id, match.p2.id)}
          >
            Win
          </button>
        </div>
      )}
    </div>
  );
}

export function SingleElimDiagram({ matches, boardCount = 2, onWin, selectedMatchId, onSlotDrop }) {
  const matchIdsKey = matches.map((m) => m.id).sort().join('|');
  const boardByMatchId = useMemo(
    () => buildBoardMapSingleElim(matches, boardCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable layout until match ids / board count change
    [matchIdsKey, boardCount]
  );

  const roundGroups = matches.reduce((acc, m) => {
    const label = m.roundLabel ?? `R${(m.round ?? 0) + 1}`;
    if (!acc[label]) acc[label] = [];
    acc[label].push(m);
    return acc;
  }, {});
  const rounds = Object.entries(roundGroups).sort((a, b) => {
    const rA = matches.find((m) => m.roundLabel === a[0])?.round ?? 0;
    const rB = matches.find((m) => m.roundLabel === b[0])?.round ?? 0;
    return rA - rB;
  });
  const maxRoundSize = Math.max(...Object.values(roundGroups).map((arr) => arr.length), 1);
  const totalHeight = maxRoundSize * SLOT_HEIGHT * 2;
  const nBoards = Math.max(1, Math.min(6, Number(boardCount) || 1));

  return (
    <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/80 p-4 w-full">
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
        Up to {nBoards} boards (from setup). Only one match per board at a time—extra matches in a round use
        the next wave (Wave 2, 3, …) when earlier waves finish.
      </p>
      <div className="inline-flex gap-6 items-start min-w-0">
        {rounds.map(([label, roundMatches]) => (
          <div key={label} className="flex flex-col justify-around shrink-0" style={{ minHeight: totalHeight }}>
            <div className="text-emerald-700 dark:text-emerald-400 font-bold text-base mb-2 px-1">{label}</div>
            <div className="flex flex-col gap-4">
              {sortMatchesByWaveAndBoard(roundMatches, boardByMatchId).map((m) => (
                <div key={m.id} style={{ minHeight: Math.pow(2, m.round) * SLOT_HEIGHT - 4 }} className="flex items-center">
                  <BracketMatchCell
                    match={m}
                    boardAssignment={boardByMatchId.get(m.id)}
                    onWin={onWin}
                    selectedMatchId={selectedMatchId}
                    isEditable={!!onSlotDrop}
                    onSlotDrop={onSlotDrop}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BracketDiagram({ matches, matchById, boardCount = 2, onWin, selectedMatchId, onSlotDrop }) {
  const matchIdsKey = matches.map((m) => m.id).sort().join('|');
  const boardByMatchId = useMemo(
    () => buildBoardMapDoubleElim(matches, boardCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchIdsKey, boardCount]
  );

  const wbMatches = matches.filter((m) => m.bracket === 'wb');
  const lbMatches = matches.filter((m) => m.bracket === 'lb');
  const gfMatches = matches.filter((m) => m.bracket === 'gf');

  const wbRounds = wbMatches.length ? Math.max(...wbMatches.map((m) => m.round)) + 1 : 0;
  const totalWBHeight = Math.pow(2, wbRounds) * SLOT_HEIGHT;
  const nBoards = Math.max(1, Math.min(6, Number(boardCount) || 1));

  const roundGroups = (list) => {
    const map = new Map();
    list.forEach((m) => {
      const r = m.round;
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(m);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  };

  return (
    <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/80 p-4 w-full">
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
        Up to {nBoards} boards (from setup). Only one match per board at a time—extra matches use the next wave
        when boards free up.
      </p>
      <div className="inline-flex gap-6 items-start min-w-0">
        {/* Winner's Bracket */}
        <div className="flex flex-col shrink-0">
          <div className="text-emerald-700 dark:text-emerald-400 font-bold text-base mb-2 px-1">Winners Bracket</div>
          <div className="flex gap-4 items-start">
            {roundGroups(wbMatches).map(([roundNum, roundMatches]) => (
              <div key={`wb-${roundNum}`} className="flex flex-col justify-around" style={{ minHeight: totalWBHeight }}>
                {sortMatchesByWaveAndBoard(roundMatches, boardByMatchId).map((m) => (
                  <div
                    key={m.id}
                    style={{
                      minHeight: Math.pow(2, roundNum) * SLOT_HEIGHT - 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <BracketMatchCell
                      match={m}
                      boardAssignment={boardByMatchId.get(m.id)}
                      onWin={onWin}
                      selectedMatchId={selectedMatchId}
                      isEditable={!!onSlotDrop}
                      onSlotDrop={onSlotDrop}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Grand Finals */}
        {gfMatches.length > 0 && (
          <div className="flex flex-col justify-center border-l border-slate-300 dark:border-slate-600 pl-6 shrink-0">
            <div className="text-amber-700 dark:text-amber-400 font-bold text-base mb-2 px-1">Grand Final</div>
            <div style={{ minHeight: 80 }} className="flex items-center">
              {sortMatchesByWaveAndBoard(gfMatches, boardByMatchId).map((m) => (
                <BracketMatchCell
                  key={m.id}
                  match={m}
                  boardAssignment={boardByMatchId.get(m.id)}
                  onWin={onWin}
                  selectedMatchId={selectedMatchId}
                  isEditable={!!onSlotDrop}
                  onSlotDrop={onSlotDrop}
                />
              ))}
            </div>
          </div>
        )}

        {/* Loser's Bracket */}
        <div className="flex flex-col border-l border-slate-300 dark:border-slate-600 pl-6 shrink-0">
          <div className="text-rose-400/90 font-bold text-base mb-2 px-1">Losers Bracket</div>
          <div className="flex gap-4 items-start">
            {roundGroups(lbMatches).map(([roundNum, roundMatches]) => (
              <div key={`lb-${roundNum}`} className="flex flex-col gap-2">
                {sortMatchesByWaveAndBoard(roundMatches, boardByMatchId).map((m) => (
                  <div key={m.id}>
                    <BracketMatchCell
                      match={m}
                      boardAssignment={boardByMatchId.get(m.id)}
                      onWin={onWin}
                      selectedMatchId={selectedMatchId}
                      isEditable={!!onSlotDrop}
                      onSlotDrop={onSlotDrop}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
