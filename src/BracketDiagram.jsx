import React, { useState } from 'react';

const SLOT_HEIGHT = 36;
const MATCH_WIDTH = 160;
const DRAG_TYPE = 'application/victory-dart-player';

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

  const baseClass = `flex-1 px-2 py-1.5 text-sm border-b border-slate-600 ${
    match.winner === player?.id ? 'bg-emerald-700/40 font-semibold' : 'bg-slate-800/80'
  }`;

  if (isEditable) {
    return (
      <div
        draggable={!!player && player.id !== 'bye'}
        onDragStart={handleSlotDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`${baseClass} ${!player || player.id === 'bye' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${dragOver ? 'ring-2 ring-amber-400 bg-slate-700/80' : ''}`}
      >
        {showDropHere ? <span className="text-slate-500 italic">Drop here</span> : (isByeSlot ? <span className="text-amber-500/90">Bye</span> : content)}
      </div>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

function BracketMatchCell({ match, onWin, selectedMatchId, isEditable, onSlotDrop }) {
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
        className={`rounded border px-2 py-1 text-sm ${
          isSelected ? 'border-amber-400 bg-amber-500/10' : 'border-slate-600 bg-slate-700/50'
        }`}
      >
        <div className="text-slate-400 text-xs font-mono">{match.roundLabel}</div>
        <div className="font-medium text-slate-300">{name(singlePlayer)}</div>
        <div className="text-xs text-amber-500/80">Advances (Bye)</div>
        {!match.winner && (
          <button
            type="button"
            className="mt-1 w-full py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs"
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
          isSelected ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-600 bg-slate-800/80'
        }`}
      >
        <div className="text-slate-500 text-xs font-mono px-2 py-0.5 bg-slate-700/50">{match.roundLabel}</div>
        <div className="flex">
          <SlotCell match={match} slotIndex={0} onWin={onWin} selectedMatchId={selectedMatchId} isEditable onSlotDrop={onSlotDrop} />
          <SlotCell match={match} slotIndex={1} onWin={onWin} selectedMatchId={selectedMatchId} isEditable onSlotDrop={onSlotDrop} />
        </div>
        {!match.winner && singlePlayer && (
          <button
            type="button"
            className="w-full py-1 text-xs bg-emerald-600/80 hover:bg-emerald-500 text-white"
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
        isSelected ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-600 bg-slate-800/80'
      }`}
    >
      <div className="text-slate-500 text-xs font-mono px-2 py-0.5 bg-slate-700/50">{match.roundLabel}</div>
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
        <div className="flex text-xs">
          <button
            type="button"
            className="flex-1 py-1 bg-slate-700 hover:bg-slate-600"
            onClick={() => onWin(match.id, match.p1.id)}
          >
            Win
          </button>
          <button
            type="button"
            className="flex-1 py-1 bg-slate-700 hover:bg-slate-600"
            onClick={() => onWin(match.id, match.p2.id)}
          >
            Win
          </button>
        </div>
      )}
    </div>
  );
}

export function SingleElimDiagram({ matches, onWin, selectedMatchId, onSlotDrop }) {
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

  return (
    <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-600 bg-slate-900/80 p-4 w-full">
      <div className="inline-flex gap-6 items-start min-w-0">
        {rounds.map(([label, roundMatches]) => (
          <div key={label} className="flex flex-col justify-around shrink-0" style={{ minHeight: totalHeight }}>
            <div className="text-emerald-400 font-bold text-sm mb-2 px-1">{label}</div>
            <div className="flex flex-col gap-4">
              {roundMatches.map((m) => (
                <div key={m.id} style={{ minHeight: Math.pow(2, m.round) * SLOT_HEIGHT - 4 }} className="flex items-center">
                  <BracketMatchCell
                    match={m}
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

export function BracketDiagram({ matches, matchById, onWin, selectedMatchId, onSlotDrop }) {
  const wbMatches = matches.filter((m) => m.bracket === 'wb');
  const lbMatches = matches.filter((m) => m.bracket === 'lb');
  const gfMatches = matches.filter((m) => m.bracket === 'gf');

  const wbRounds = wbMatches.length ? Math.max(...wbMatches.map((m) => m.round)) + 1 : 0;
  const totalWBHeight = Math.pow(2, wbRounds) * SLOT_HEIGHT;

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
    <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-600 bg-slate-900/80 p-4 w-full">
      <div className="inline-flex gap-6 items-start min-w-0">
        {/* Winner's Bracket */}
        <div className="flex flex-col shrink-0">
          <div className="text-emerald-400 font-bold text-sm mb-2 px-1">Winners Bracket</div>
          <div className="flex gap-4 items-start">
            {roundGroups(wbMatches).map(([roundNum, roundMatches]) => (
              <div key={`wb-${roundNum}`} className="flex flex-col justify-around" style={{ minHeight: totalWBHeight }}>
                {roundMatches.map((m) => (
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
          <div className="flex flex-col justify-center border-l border-slate-600 pl-6 shrink-0">
            <div className="text-amber-400 font-bold text-sm mb-2 px-1">Grand Final</div>
            <div style={{ minHeight: 80 }} className="flex items-center">
              {gfMatches.map((m) => (
                <BracketMatchCell
                  key={m.id}
                  match={m}
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
        <div className="flex flex-col border-l border-slate-600 pl-6 shrink-0">
          <div className="text-rose-400/90 font-bold text-sm mb-2 px-1">Losers Bracket</div>
          <div className="flex gap-4 items-start">
            {roundGroups(lbMatches).map(([roundNum, roundMatches]) => (
              <div key={`lb-${roundNum}`} className="flex flex-col gap-2">
                {roundMatches.map((m) => (
                  <div key={m.id}>
                    <BracketMatchCell
                      match={m}
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
