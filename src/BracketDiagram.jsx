import React, { useState, useMemo, useRef, useEffect } from 'react';

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

function applyBoardOverrides(map, overrides) {
  if (!overrides || typeof overrides !== 'object') return map;
  const next = new Map(map);
  for (const [matchId, val] of Object.entries(overrides)) {
    if (!val || val.board == null) continue;
    const existing = next.get(matchId) ?? { board: 1, wave: 1, totalWaves: 1 };
    next.set(matchId, { ...existing, board: val.board });
  }
  return next;
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

function SlotCell({ match, slotIndex, isEditable, onSlotDrop, onPickRequest, isPickerActive }) {
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
    <span className="block truncate" title={isEmpty || isByeSlot ? undefined : name(player)}>
      {isEmpty ? (isByeSlot ? 'Bye' : null) : name(player)}
      {!isEmpty && match.winner === player?.id && ' ✓'}
    </span>
  );
  const showDropHere = isEmpty && !isByeSlot;

  const baseClass = `w-full min-w-0 px-2.5 py-2 text-base border-b border-slate-300 dark:border-slate-600 last:border-b-0 overflow-hidden ${
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
        className="w-full min-w-0"
      >
        <div
          className={`${baseClass} min-h-[44px] ${!player || player.id === 'bye' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${dragOver || isPickerActive ? 'ring-2 ring-amber-500 dark:ring-amber-400 bg-slate-100 dark:bg-slate-700/80' : ''}`}
        >
          {showDropHere ? (
            <button
              type="button"
              className="w-full h-full text-left text-slate-600 dark:text-slate-500 italic hover:text-slate-800 dark:hover:text-slate-300 truncate"
              onClick={(e) => {
                e.stopPropagation();
                onPickRequest?.(slotIndex);
              }}
            >
              {isPickerActive ? 'Pick below…' : 'Drop here'}
            </button>
          ) : (
            isByeSlot ? <span className="text-amber-500/90">Bye</span> : content
          )}
        </div>
      </div>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

/** assignment: { board, wave, totalWaves } */
function matchTitle(match, assignment, { includeBoard = true } = {}) {
  const base = match.roundLabel ?? '';
  if (!assignment || assignment.board == null || assignment.board < 1) return base;
  const { board, wave, totalWaves } = assignment;
  const wavePart = totalWaves > 1 ? ` · Wave ${wave}/${totalWaves}` : '';
  if (!includeBoard) return base ? `${base}${wavePart}` : wavePart ? wavePart.slice(3) : '';
  return base ? `${base}${wavePart} · Board ${board}` : `Board ${board}`;
}

function MatchHeaderRow({ match, boardAssignment, boardCount, onBoardChange, titleText }) {
  const roundWaveText = matchTitle(match, boardAssignment, { includeBoard: false });
  if (onBoardChange && boardAssignment) {
    const n = Math.max(1, Math.min(6, Number(boardCount) || 1));
    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-slate-100/90 dark:bg-slate-700/50 rounded-t min-w-0">
        <span
          className="text-slate-600 dark:text-slate-500 text-xs font-mono truncate flex-1 min-w-0"
          title={roundWaveText || titleText}
        >
          {roundWaveText || '—'}
        </span>
        <label className="shrink-0 flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Bd</span>
          <select
            className="w-11 py-0.5 px-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
            value={boardAssignment.board ?? 1}
            onChange={(e) => onBoardChange(match.id, Number(e.target.value))}
            aria-label={`Board for ${roundWaveText || match.id}`}
          >
            {Array.from({ length: n }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  return (
    <div
      className="text-slate-600 dark:text-slate-500 text-xs font-mono px-2 py-1 bg-slate-100/90 dark:bg-slate-700/50 truncate rounded-t"
      title={titleText}
    >
      {titleText}
    </div>
  );
}

function BracketMatchCell({ match, onWin, onClearWin, selectedMatchId, isEditable, onSlotDrop, boardAssignment, boardCount, onBoardChange, availablePlayers = [] }) {
  const [pickSlot, setPickSlot] = useState(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (pickSlot == null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setPickSlot(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickSlot]);

  useEffect(() => {
    if (pickSlot == null) return;
    let removeClick = () => {};
    const timer = window.setTimeout(() => {
      const onDocClick = (e) => {
        if (pickerRef.current?.contains(e.target)) return;
        setPickSlot(null);
      };
      document.addEventListener('click', onDocClick, true);
      removeClick = () => document.removeEventListener('click', onDocClick, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      removeClick();
    };
  }, [pickSlot]);

  const handlePickPlayer = (player) => {
    if (pickSlot == null || !onSlotDrop) return;
    onSlotDrop(match.id, pickSlot, { player: { id: player.id, name: player.name } });
    setPickSlot(null);
  };

  const sortedPickPlayers = [...availablePlayers].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' })
  );

  const slotPicker = pickSlot != null && isEditable && (
    <div className="border-t border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/90 px-2 py-2">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Select a player</p>
      <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {sortedPickPlayers.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="w-full text-left px-2.5 py-2 rounded text-base bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-amber-500/15 dark:hover:bg-amber-500/20 hover:border-amber-400/50 truncate"
              title={p.name}
              onClick={() => handlePickPlayer(p)}
            >
              {p.name}
            </button>
          </li>
        ))}
      </ul>
      {availablePlayers.length === 0 && (
        <p className="text-sm text-slate-500 italic px-1">No players on roster</p>
      )}
      <button
        type="button"
        className="mt-2 w-full text-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-1"
        onClick={() => setPickSlot(null)}
      >
        Cancel
      </button>
    </div>
  );

  const isBye1 = match.p1?.id === 'bye';
  const isBye2 = match.p2?.id === 'bye';
  const isBye = isBye1 || isBye2;
  const singlePlayer = isBye1 ? match.p2 : isBye2 ? match.p1 : null;

  const name = (p) => (p?.id === 'bye' ? 'Bye' : p?.name ?? '—');
  const isSelected = selectedMatchId === match.id;

  const slotCellProps = (slotIndex) => ({
    match,
    slotIndex,
    isEditable: true,
    onSlotDrop,
    onPickRequest: (idx) => setPickSlot((prev) => (prev === idx ? null : idx)),
    isPickerActive: pickSlot === slotIndex,
  });

  const matchCellStyle = { width: MATCH_WIDTH, maxWidth: MATCH_WIDTH, minWidth: MATCH_WIDTH };
  const titleText = matchTitle(match, boardAssignment);
  const header = (
    <MatchHeaderRow
      match={match}
      boardAssignment={boardAssignment}
      boardCount={boardCount}
      onBoardChange={onBoardChange}
      titleText={titleText}
    />
  );

  const clearWinButton = match.winner && onClearWin && (
    <button
      type="button"
      className="w-full py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white border-t border-slate-300 dark:border-slate-600"
      onClick={() => onClearWin(match.id)}
    >
      Clear winner
    </button>
  );

  if (isBye && singlePlayer && !isEditable) {
    return (
      <div
        style={matchCellStyle}
        className={`rounded border overflow-hidden px-2 py-1.5 text-base ${
          isSelected ? 'border-amber-400 bg-amber-500/10' : 'border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-700/50'
        }`}
      >
        {header}
        <div className="font-medium text-slate-700 dark:text-slate-300 truncate" title={name(singlePlayer)}>{name(singlePlayer)}</div>
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
        {clearWinButton}
      </div>
    );
  }

  if (isBye && isEditable) {
    return (
      <div
        ref={pickSlot != null ? pickerRef : undefined}
        style={matchCellStyle}
        className={`rounded border overflow-hidden ${
          isSelected ? 'border-amber-400 ring-1 ring-amber-500 dark:ring-amber-400' : 'border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-800/80'
        }`}
      >
        {header}
        <div className="flex flex-col min-w-0">
          <SlotCell {...slotCellProps(0)} />
          <SlotCell {...slotCellProps(1)} />
        </div>
        {slotPicker}
        {!match.winner && singlePlayer && (
          <button
            type="button"
            className="w-full py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-500 text-white"
            onClick={() => onWin(match.id, singlePlayer.id)}
          >
            Advance (Bye)
          </button>
        )}
        {clearWinButton}
      </div>
    );
  }

  return (
    <div
      ref={pickSlot != null ? pickerRef : undefined}
      style={matchCellStyle}
      className={`rounded border overflow-hidden ${
        isSelected ? 'border-amber-400 ring-1 ring-amber-500 dark:ring-amber-400' : 'border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-800/80'
      }`}
    >
      {header}
      <div className="flex flex-col min-w-0">
        <SlotCell
          match={match}
          slotIndex={0}
          isEditable={isEditable}
          onSlotDrop={onSlotDrop}
          onPickRequest={isEditable ? (idx) => setPickSlot((prev) => (prev === idx ? null : idx)) : undefined}
          isPickerActive={pickSlot === 0}
        />
        <SlotCell
          match={match}
          slotIndex={1}
          isEditable={isEditable}
          onSlotDrop={onSlotDrop}
          onPickRequest={isEditable ? (idx) => setPickSlot((prev) => (prev === idx ? null : idx)) : undefined}
          isPickerActive={pickSlot === 1}
        />
      </div>
      {slotPicker}
      {match.p1 && match.p2 && match.p1.id !== 'bye' && match.p2.id !== 'bye' && (
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
      {clearWinButton}
    </div>
  );
}

export function SingleElimDiagram({ matches, boardCount = 2, boardOverrides = {}, onBoardChange, onWin, onClearWin, selectedMatchId, onSlotDrop, availablePlayers = [] }) {
  const matchIdsKey = matches.map((m) => m.id).sort().join('|');
  const overridesKey = JSON.stringify(boardOverrides);
  const boardByMatchId = useMemo(
    () => applyBoardOverrides(buildBoardMapSingleElim(matches, boardCount), boardOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable layout until match ids / board count / overrides change
    [matchIdsKey, boardCount, overridesKey]
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
        the next wave (Wave 2, 3, …) when earlier waves finish. Use the <span className="font-mono">Bd</span> dropdown on each match to set its board.
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
                    boardCount={boardCount}
                    onBoardChange={onBoardChange}
                    onWin={onWin}
                    onClearWin={onClearWin}
                    selectedMatchId={selectedMatchId}
                    isEditable={!!onSlotDrop}
                    onSlotDrop={onSlotDrop}
                    availablePlayers={availablePlayers}
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

export function BracketDiagram({ matches, matchById, boardCount = 2, boardOverrides = {}, onBoardChange, onWin, onClearWin, selectedMatchId, onSlotDrop, availablePlayers = [] }) {
  const matchIdsKey = matches.map((m) => m.id).sort().join('|');
  const overridesKey = JSON.stringify(boardOverrides);
  const boardByMatchId = useMemo(
    () => applyBoardOverrides(buildBoardMapDoubleElim(matches, boardCount), boardOverrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchIdsKey, boardCount, overridesKey]
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
        when boards free up. Use the <span className="font-mono">Bd</span> dropdown on each match to set its board.
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
                      boardCount={boardCount}
                      onBoardChange={onBoardChange}
                      onWin={onWin}
                      onClearWin={onClearWin}
                      selectedMatchId={selectedMatchId}
                      isEditable={!!onSlotDrop}
                      onSlotDrop={onSlotDrop}
                      availablePlayers={availablePlayers}
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
                  boardCount={boardCount}
                  onBoardChange={onBoardChange}
                  onWin={onWin}
                  onClearWin={onClearWin}
                  selectedMatchId={selectedMatchId}
                  isEditable={!!onSlotDrop}
                  onSlotDrop={onSlotDrop}
                  availablePlayers={availablePlayers}
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
                      boardCount={boardCount}
                      onBoardChange={onBoardChange}
                      onWin={onWin}
                      onClearWin={onClearWin}
                      selectedMatchId={selectedMatchId}
                      isEditable={!!onSlotDrop}
                      onSlotDrop={onSlotDrop}
                      availablePlayers={availablePlayers}
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
