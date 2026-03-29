import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { Trophy, Users, Play, Medal, LayoutGrid, Clock, Volume2, UserPlus, ListOrdered, RotateCcw, Image, Sun, Moon, Pencil } from 'lucide-react';
import html2canvas from 'html2canvas';
import {
  buildSingleElimBracket,
  buildDoubleElimBracket,
  buildRoundRobinMatches,
  buildCompassDraw,
  buildLadderRankings,
  advancePlayer,
} from './bracketUtils';
import { BracketDiagram, SingleElimDiagram } from './BracketDiagram';

const BRACKET_FORMATS = [
  { id: 'single', label: 'Single Elimination', desc: 'One loss and you\'re out' },
  { id: 'double', label: 'Double Elimination', desc: 'One loss to loser\'s bracket, two losses out' },
  { id: 'triple', label: 'Triple Elimination', desc: 'Three losses and you\'re out' },
  { id: 'roundRobin', label: 'Round Robin', desc: 'Everyone plays everyone' },
  { id: 'compass', label: 'Compass Draw', desc: 'N/S/E/W brackets feed into finals' },
  { id: 'ladder', label: 'Ladder / Pyramid', desc: 'Challenge players above you to climb' },
];

const BYE = { id: 'bye', name: 'Bye' };
const DRAG_TYPE = 'application/victory-dart-player';
const THEME_STORAGE_KEY = 'dart-tournament-theme';

function getPlayer(match, playerId) {
  if (match.p1?.id === playerId) return match.p1;
  if (match.p2?.id === playerId) return match.p2;
  return null;
}

function getWinStreak(matchHistory, playerId) {
  if (!playerId || playerId === 'bye') return 0;
  let streak = 0;
  for (let i = matchHistory.length - 1; i >= 0; i--) {
    const m = matchHistory[i];
    const inMatch = m.p1Id === playerId || m.p2Id === playerId;
    if (!inMatch) continue;
    if (m.winnerId === playerId) streak++;
    else break;
  }
  return streak;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function patchPlayerInSlot(slot, playerId, newName) {
  if (!slot || slot.id !== playerId) return slot;
  return { ...slot, name: newName };
}

function patchMatchPlayerNames(match, playerId, newName) {
  if (!match) return match;
  return {
    ...match,
    p1: patchPlayerInSlot(match.p1, playerId, newName),
    p2: patchPlayerInSlot(match.p2, playerId, newName),
  };
}

function EditablePlayerName({ player, onRename, draggable, dragType = DRAG_TYPE, className = '', noChipStyle = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player.name);

  useEffect(() => {
    if (!editing) setDraft(player.name);
  }, [player.name, editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== player.name) onRename(player.id, t);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(player.name);
    setEditing(false);
  };

  const inputCls =
    'min-w-0 flex-1 bg-white text-slate-900 dark:bg-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-base outline-none focus:border-blue-500';

  if (editing) {
    return (
      <div className={`flex items-center gap-1 flex-wrap ${className}`}>
        <input
          className={inputCls}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          autoFocus
        />
        <button type="button" className="text-emerald-600 dark:text-emerald-400 text-sm font-medium px-1 shrink-0" onClick={commit}>
          Save
        </button>
        <button type="button" className="text-slate-600 dark:text-slate-400 text-sm px-1 shrink-0" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  const label = draggable ? (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(dragType, JSON.stringify({ player: { id: player.id, name: player.name } }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="cursor-grab active:cursor-grabbing truncate"
    >
      {player.name}
    </span>
  ) : (
    <span className="truncate">{player.name}</span>
  );

  const shell =
    noChipStyle
      ? `inline-flex items-center gap-1 text-base max-w-full ${className}`
      : `inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-2.5 py-2 text-base max-w-full ${className}`;

  return (
    <div className={shell}>
      {label}
      <button
        type="button"
        aria-label="Edit name"
        onClick={() => {
          setDraft(player.name);
          setEditing(true);
        }}
        className="p-0.5 rounded shrink-0 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-600"
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

function BracketMatchCell({ match, onWin, onSlotDrop }) {
  const [dragOverSlot, setDragOverSlot] = useState(null);

  const handleDrop = (e, slot) => {
    e.preventDefault();
    setDragOverSlot(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '{}');
      if (payload.player) onSlotDrop(match.id, slot, payload.player, payload.sourceMatchId, payload.sourceSlot);
    } catch {}
  };

  const Slot = ({ slotKey, player }) => {
    const isEmpty = !player || player.id === 'bye';
    const isOver = dragOverSlot === slotKey;
    const handleDragStart = (e) => {
      if (isEmpty || player?.id === 'bye') return;
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({
        player: { id: player.id, name: player.name },
        sourceMatchId: match.id,
        sourceSlot: slotKey,
      }));
      e.dataTransfer.effectAllowed = 'move';
    };
    return (
      <div
        draggable={!isEmpty}
        onDragStart={handleDragStart}
        className={`px-3 py-2.5 border-b border-slate-300 dark:border-slate-600 last:border-b-0 min-h-[44px] flex items-center ${
          isEmpty ? 'text-slate-600 dark:text-slate-500 italic cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        } ${isOver ? 'ring-2 ring-amber-500 dark:ring-amber-400 bg-slate-200 dark:bg-slate-600' : 'bg-slate-100/90 dark:bg-slate-800/80'} ${player?.id === match?.winner ? 'bg-emerald-200/60 dark:bg-emerald-700/40 font-semibold' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSlot(slotKey); }}
        onDragLeave={() => setDragOverSlot(null)}
        onDrop={(e) => handleDrop(e, slotKey)}
      >
        {isEmpty ? 'Drop player' : player?.name}{player?.id === match?.winner ? ' ✓' : ''}
      </div>
    );
  };

  const isBye = match.p2?.id === 'bye';
  const done = match.winner != null;

  return (
    <div className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden min-w-[140px]">
      <div className="flex flex-col">
        <Slot slotKey="p1" player={match.p1} />
        <Slot slotKey="p2" player={match.p2} />
      </div>
      {!done && (
        <div className="p-2 border-t border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-700/50">
          {isBye ? (
            <button
              type="button"
              className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-base"
              onClick={() => onWin(match.id, match.p1?.id)}
            >
              Advance
            </button>
          ) : (
            <div className="flex gap-1">
              <button type="button" className="flex-1 py-1.5 rounded bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-base" onClick={() => onWin(match.id, match.p1?.id)}>Win</button>
              <button type="button" className="flex-1 py-1.5 rounded bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-base" onClick={() => onWin(match.id, match.p2?.id)}>Win</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchHistoryPanel({ matches, onScoreChange, getMatchLabel }) {
  const completed = matches.filter((m) => m.winner != null);
  if (completed.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
      <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-3">Match results</h3>
        <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className="text-left text-slate-600 dark:text-slate-400 border-b border-slate-300 dark:border-slate-600">
              <th className="py-2 pr-4">Match</th>
              <th className="py-2 pr-4">Player 1</th>
              <th className="py-2 pr-4">Player 2</th>
              <th className="py-2 pr-4">Winner</th>
              <th className="py-2">Score (optional)</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((m, i) => (
              <tr key={m.id} className="border-b border-slate-200/80 dark:border-slate-200 dark:border-slate-700/50">
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-500 font-mono text-base">{getMatchLabel?.(m, i) ?? m.roundLabel ?? m.id}</td>
                <td className="py-2 pr-4">{m.p1?.name ?? '—'}</td>
                <td className="py-2 pr-4">{m.p2?.name ?? '—'}</td>
                <td className="py-2 pr-4 font-semibold text-emerald-700 dark:text-emerald-400">{getPlayer(m, m.winner)?.name ?? '—'}</td>
                <td className="py-2">
                  {onScoreChange ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        className="w-14 bg-white text-slate-900 dark:bg-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 rounded px-1 py-1 text-center text-base"
                        value={m.p1Score ?? ''}
                        onChange={(e) => onScoreChange(m.id, 'p1', e.target.value)}
                      />
                      <span className="text-slate-600 dark:text-slate-500">–</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        className="w-14 bg-white text-slate-900 dark:bg-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 rounded px-1 py-1 text-center text-base"
                        value={m.p2Score ?? ''}
                        onChange={(e) => onScoreChange(m.id, 'p2', e.target.value)}
                      />
                    </div>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-500">
                      {m.p1Score != null && m.p2Score != null ? `${m.p1Score}–${m.p2Score}` : '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function generateRoundMatches(poolPlayers) {
  const list = shuffleArray(poolPlayers);
  const matches = [];
  for (let i = 0; i < list.length; i += 2) {
    const p1 = list[i];
    const p2 = list[i + 1] || BYE;
    matches.push({
      id: `pool-${Date.now()}-${i}`,
      p1,
      p2,
      winner: null,
    });
  }
  return matches;
}

/** Browsers suspend AudioContext until a user gesture; reuse one context and resume before playing. */
let sharedAudioContext = null;

function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioContext = new Ctx();
    }
    return sharedAudioContext;
  } catch {
    return null;
  }
}

async function resumeAudioContextIfNeeded() {
  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}

function playCelebrationSound() {
  void (async () => {
    try {
      const ctx = await resumeAudioContextIfNeeded();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const t0 = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const t = t0 + i * 0.15;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch {}
  })();
}

function formatTime(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return '—:—';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function playOneMinuteWarningSound() {
  void (async () => {
    try {
      const ctx = await resumeAudioContextIfNeeded();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const playBeep = (frequency, delaySec, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        const start = t0 + delaySec;
        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.start(start);
        osc.stop(start + duration);
      };
      playBeep(784, 0, 0.12);
      playBeep(988, 0.15, 0.15);
    } catch {}
  })();
}

function playAlarmSound() {
  void (async () => {
    try {
      const ctx = await resumeAudioContextIfNeeded();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const playBeep = (frequency, delaySec, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        const start = t0 + delaySec;
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.start(start);
        osc.stop(start + duration);
      };
      for (let t = 0; t < 5; t += 0.5)
        playBeep(t % 1 === 0 ? 880 : 660, t, 0.4);
    } catch {}
  })();
}

export default function DartTournament() {
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [stage, setStage] = useState('setup');
  const [bracketFormat, setBracketFormat] = useState('single');
  const [boardCount, setBoardCount] = useState(2);
  const [matchHistory, setMatchHistory] = useState([]);
  const [qualified, setQualified] = useState([]);
  const [tournamentPhase, setTournamentPhase] = useState('pool');
  const [currentRoundMatches, setCurrentRoundMatches] = useState([]);
  const [finalsMatches, setFinalsMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [bracketMatches, setBracketMatches] = useState([]);
  const [matchById, setMatchById] = useState({});
  const [roundRobinMatches, setRoundRobinMatches] = useState([]);
  const [roundRobinStandings, setRoundRobinStandings] = useState([]);
  const [compassData, setCompassData] = useState(null);
  const [ladderData, setLadderData] = useState(null);

  const [timerInputMinutes, setTimerInputMinutes] = useState(10);
  const [timerInputSeconds, setTimerInputSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const timerIntervalRef = useRef(null);
  const alarmPlayedRef = useRef(false);
  const oneMinuteAlertPlayedRef = useRef(false);

  const [theme, setTheme] = useState(() => {
    try {
      const t = localStorage.getItem(THEME_STORAGE_KEY);
      if (t === 'light' || t === 'dark') return t;
    } catch {}
    return 'dark';
  });

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    if (!timerRunning || remainingSeconds == null || remainingSeconds <= 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (remainingSeconds === 0 && !alarmPlayedRef.current) {
        alarmPlayedRef.current = true;
        playAlarmSound();
        setAlarmRinging(true);
        setTimerRunning(false);
      }
      return;
    }
    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev == null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning, remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds !== 60 || !timerRunning) return;
    if (oneMinuteAlertPlayedRef.current) return;
    oneMinuteAlertPlayedRef.current = true;
    playOneMinuteWarningSound();
  }, [remainingSeconds, timerRunning]);

  const startTimer = () => {
    const total = Math.max(0, (Number(timerInputMinutes) || 0) * 60 + (Number(timerInputSeconds) || 0));
    alarmPlayedRef.current = false;
    oneMinuteAlertPlayedRef.current = false;
    void resumeAudioContextIfNeeded();
    setRemainingSeconds(total);
    setTimerRunning(true);
    setAlarmRinging(false);
  };

  useEffect(() => {
    const unlock = () => {
      void resumeAudioContextIfNeeded();
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const stopAlarm = () => setAlarmRinging(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const resetGame = () => {
    setPlayers([]);
    setNewPlayer('');
    setStage('setup');
    setMatchHistory([]);
    setQualified([]);
    setTournamentPhase('pool');
    setCurrentRoundMatches([]);
    setFinalsMatches([]);
    setBracketMatches([]);
    setMatchById({});
    setRoundRobinMatches([]);
    setRoundRobinStandings([]);
    setCompassData(null);
    setLadderData(null);
    setSelectedMatchId(null);
    setRemainingSeconds(null);
    setTimerRunning(false);
    setAlarmRinging(false);
    setShowResetConfirm(false);
    celebrationFiredRef.current = false;
    alarmPlayedRef.current = false;
    oneMinuteAlertPlayedRef.current = false;
  };

  const addPlayer = () => {
    if (newPlayer.trim()) {
      setPlayers([...players, { id: Date.now(), name: newPlayer.trim() }]);
      setNewPlayer('');
    }
  };

  const renamePlayer = (playerId, rawName) => {
    const name = rawName.trim();
    if (!name) return;

    setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, name } : p)));

    setQualified((prev) => prev.map((p) => (p?.id === playerId ? { ...p, name } : p)));

    setCurrentRoundMatches((prev) => prev.map((m) => patchMatchPlayerNames(m, playerId, name)));

    setFinalsMatches((prev) => prev.map((m) => patchMatchPlayerNames(m, playerId, name)));

    setBracketMatches((prev) => prev.map((m) => patchMatchPlayerNames(m, playerId, name)));

    setMatchById((prev) => {
      const next = {};
      for (const k of Object.keys(prev)) {
        next[k] = patchMatchPlayerNames(prev[k], playerId, name);
      }
      return next;
    });

    setRoundRobinMatches((prev) => prev.map((m) => patchMatchPlayerNames(m, playerId, name)));

    setRoundRobinStandings((prev) =>
      prev.map((s) => (s.player?.id === playerId ? { ...s, player: { ...s.player, name } } : s))
    );

    setCompassData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map((g) => ({
          ...g,
          players: (g.players ?? []).map((p) => (p?.id === playerId ? { ...p, name } : p)),
          matches: g.matches.map((m) => patchMatchPlayerNames(m, playerId, name)),
        })),
        finals: (prev.finals ?? []).map((m) => patchMatchPlayerNames(m, playerId, name)),
      };
    });

    setLadderData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rankings: prev.rankings.map((r) =>
          r.player?.id === playerId ? { ...r, player: { ...r.player, name } } : r
        ),
        challengeMatch: prev.challengeMatch
          ? patchMatchPlayerNames(prev.challengeMatch, playerId, name)
          : null,
      };
    });
  };

  const startTournament = () => {
    const pool = players.filter((p) => p.id !== 'bye');
    setMatchHistory([]);
    setQualified([]);
    setCurrentRoundMatches([]);
    setFinalsMatches([]);
    setBracketMatches([]);
    setMatchById({});
    setRoundRobinMatches([]);
    setRoundRobinStandings([]);
    setCompassData(null);
    setLadderData(null);

    if (bracketFormat === 'single') {
      const { matches, matchById: mid } = buildSingleElimBracket(pool);
      setBracketMatches(matches);
      setMatchById(mid);
      setTournamentPhase('bracket');
    } else if (bracketFormat === 'double' || bracketFormat === 'triple') {
      const { matches, matchById: mid } = buildDoubleElimBracket(pool);
      setBracketMatches(matches);
      setMatchById(mid);
      setTournamentPhase('bracket');
    } else if (bracketFormat === 'roundRobin') {
      const { matches, standings } = buildRoundRobinMatches(pool);
      setRoundRobinMatches(matches);
      setRoundRobinStandings(standings);
      setTournamentPhase('roundRobin');
    } else if (bracketFormat === 'compass') {
      const data = buildCompassDraw(pool);
      setCompassData(data);
      setTournamentPhase('compass');
    } else if (bracketFormat === 'ladder') {
      const data = buildLadderRankings(pool);
      setLadderData(data);
      setTournamentPhase('ladder');
    }

    setStage('playing');
    setSelectedMatchId(null);
    celebrationFiredRef.current = false;
  };

  const handlePoolWin = (matchId, winnerId) => {
    const match = currentRoundMatches.find((m) => m.id === matchId);
    if (!match || match.winner) return;
    const winner = getPlayer(match, winnerId);
    if (!winner || winner.id === 'bye') return;

    const newHistory = [
      ...matchHistory,
      { p1Id: match.p1?.id, p2Id: match.p2?.id, winnerId },
    ];
    const winnerStreak = getWinStreak(newHistory, winnerId);
    const winnerObj = match.p1?.id === winnerId ? match.p1 : match.p2;
    const newQualified =
      winnerStreak >= 3 && !qualified.some((q) => q.id === winnerId) && qualified.length < 4
        ? [...qualified, winnerObj]
        : qualified;

    setMatchHistory(newHistory);
    setQualified(newQualified);
    setCurrentRoundMatches((prev) => {
      const updated = prev.map((m) => (m.id === matchId ? { ...m, winner: winnerId } : m));
      const allDone = updated.every((m) => m.winner != null);
      if (!allDone) return updated;
      if (newQualified.length >= 4) {
        setTournamentPhase('finals');
        setFinalsMatches([
          { id: 'gf', type: 'Grand Final', p1: newQualified[0], p2: newQualified[1], winner: null },
          { id: '3rd', type: '3rd / 4th Place', p1: newQualified[2], p2: newQualified[3], winner: null },
        ]);
        return [];
      }
      const pool = players.filter((p) => p.id !== 'bye' && !newQualified.some((q) => q.id === p.id));
      return pool.length >= 2 ? generateRoundMatches(pool) : updated;
    });
    setSelectedMatchId(null);
  };

  const handleFinalsWin = (matchId, winnerId) => {
    setFinalsMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, winner: winnerId } : m))
    );
    setSelectedMatchId(null);
  };

  const handleBracketWin = (matchId, winnerId) => {
    const match = matchById[matchId] || bracketMatches.find((m) => m.id === matchId);
    if (!match || match.winner) return;
    const winner = getPlayer(match, winnerId);
    if (!winner || winner.id === 'bye') return;

    const mid = {};
    for (const k of Object.keys(matchById)) {
      mid[k] = { ...matchById[k] };
    }
    const m = mid[matchId];
    if (!m) return;
    m.winner = winnerId;
    const loser = m.p1?.id === winnerId ? m.p2 : m.p1;

    if (bracketFormat === 'single') {
      if (m.nextMatchId && m.nextSlot != null) advancePlayer(mid, m, 'win', winner);
    } else {
      if (m.nextMatchId && m.nextSlot != null) advancePlayer(mid, m, 'win', winner);
      if (m.nextLoseMatchId != null && loser && loser.id !== 'bye') {
        advancePlayer(mid, m, 'lose', loser);
      }
    }

    setMatchById(mid);
    setBracketMatches((prev) => prev.map((x) => mid[x.id] || x));
    setSelectedMatchId(null);
  };

  const handleRoundRobinWin = (matchId, winnerId) => {
    const match = roundRobinMatches.find((m) => m.id === matchId);
    if (!match || match.winner) return;
    const loserId = match.p1?.id === winnerId ? match.p2?.id : match.p1?.id;
    setRoundRobinMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, winner: winnerId } : m))
    );
    setRoundRobinStandings((prev) =>
      prev.map((s) => {
        if (s.player?.id === winnerId) return { ...s, wins: (s.wins ?? 0) + 1 };
        if (s.player?.id === loserId) return { ...s, losses: (s.losses ?? 0) + 1 };
        return s;
      })
    );
  };

  const handleCompassWin = (matchId, winnerId) => {
    setCompassData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map((g) => ({
          ...g,
          matches: g.matches.map((m) => (m.id === matchId ? { ...m, winner: winnerId } : m)),
        })),
      };
    });
  };

  const handleCompassFinalsWin = (matchId, winnerId) => {
    setCompassData((prev) => {
      if (!prev || !prev.finals) return prev;
      return {
        ...prev,
        finals: prev.finals.map((m) => (m.id === matchId ? { ...m, winner: winnerId } : m)),
      };
    });
  };

  const handleScoreChange = (matchId, slot, value) => {
    const num = value === '' ? null : parseInt(value, 10);
    if (tournamentPhase === 'bracket') {
      setBracketMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, [slot === 'p1' ? 'p1Score' : 'p2Score']: num } : m))
      );
      setMatchById((prev) => {
        const next = { ...prev };
        if (prev[matchId]) next[matchId] = { ...prev[matchId], [slot === 'p1' ? 'p1Score' : 'p2Score']: num };
        return next;
      });
    } else if (tournamentPhase === 'roundRobin') {
      setRoundRobinMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, [slot === 'p1' ? 'p1Score' : 'p2Score']: num } : m))
      );
    } else if (tournamentPhase === 'compass') {
      setCompassData((prev) => {
        if (!prev) return prev;
        const updateMatch = (m) => (m.id === matchId ? { ...m, [slot === 'p1' ? 'p1Score' : 'p2Score']: num } : m);
        return {
          ...prev,
          groups: prev.groups.map((g) => ({ ...g, matches: g.matches.map(updateMatch) })),
          finals: prev.finals?.map(updateMatch) ?? [],
        };
      });
    } else if (tournamentPhase === 'pool') {
      setCurrentRoundMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, [slot === 'p1' ? 'p1Score' : 'p2Score']: num } : m))
      );
    } else {
      setFinalsMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, [slot === 'p1' ? 'p1Score' : 'p2Score']: num } : m))
      );
    }
  };

  const handleSlotDrop = (matchId, slot, player, sourceMatchId, sourceSlot) => {
    const playerObj = typeof player === 'object' && player?.id ? player : players.find((p) => p.id === player?.id);
    if (!playerObj || playerObj.id === 'bye') return;

    const clearPlayerFromMatch = (m, pid) => {
      const out = { ...m };
      if (m.p1?.id === pid) out.p1 = null;
      if (m.p2?.id === pid) out.p2 = null;
      return out;
    };

    const applyDrop = (m) => {
      let out = clearPlayerFromMatch(m, playerObj.id);
      if (m.id === matchId) out = { ...out, [slot]: playerObj };
      if (sourceMatchId && m.id === sourceMatchId && sourceSlot != null)
        out = { ...out, [sourceSlot]: null };
      return out;
    };

    if (tournamentPhase === 'pool') {
      setCurrentRoundMatches((prev) => prev.map(applyDrop));
    } else if (tournamentPhase === 'bracket') {
      setBracketMatches((prev) => prev.map(applyDrop));
      setMatchById((prev) => {
        const next = {};
        for (const k of Object.keys(prev)) {
          next[k] = applyDrop(prev[k]);
        }
        return next;
      });
    } else if (tournamentPhase === 'roundRobin') {
      setRoundRobinMatches((prev) => prev.map(applyDrop));
    } else if (tournamentPhase === 'compass') {
      setCompassData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) => ({
            ...g,
            matches: g.matches.map((m) => applyDrop(m)),
          })),
          finals: prev.finals?.map((m) => applyDrop(m)) ?? [],
        };
      });
    } else {
      setFinalsMatches((prev) => prev.map(applyDrop));
    }
  };

  const playablePoolMatches = currentRoundMatches.filter(
    (m) => !m.winner && m.p1 && m.p2 && m.p1.id !== 'bye' && m.p2.id !== 'bye'
  );
  const playableFinalsMatches = finalsMatches.filter(
    (m) => !m.winner && m.p1 && m.p2
  );
  const playableBracketMatches = bracketMatches.filter(
    (m) => !m.winner && m.p1 && m.p2 && m.p1.id !== 'bye' && m.p2.id !== 'bye'
  );
  const hasPlayableMatches =
    tournamentPhase === 'pool' ? playablePoolMatches.length > 0
    : tournamentPhase === 'bracket' ? playableBracketMatches.length > 0
    : tournamentPhase === 'roundRobin' ? roundRobinMatches.some((m) => !m.winner)
    : tournamentPhase === 'compass' ? compassData?.groups?.some((g) => g.matches?.some((m) => !m.winner))
    : tournamentPhase === 'ladder' ? !!ladderData?.challengeMatch
    : playableFinalsMatches.length > 0;
  const bracketChampionMatch = bracketMatches.find((m) => m.bracket === 'gf' && m.winner) || bracketMatches.find((m) => !m.nextMatchId && m.winner);
  const tournamentOver =
    (tournamentPhase === 'finals' && finalsMatches.length === 2 && finalsMatches.every((m) => m.winner != null))
    || (tournamentPhase === 'bracket' && !!bracketChampionMatch)
    || (tournamentPhase === 'roundRobin' && roundRobinMatches.length > 0 && roundRobinMatches.every((m) => m.winner != null))
    || (tournamentPhase === 'compass' && compassData?.finals?.length > 0 && compassData.finals.every((m) => m.winner != null));
  const roundRobinWinner = tournamentPhase === 'roundRobin' && roundRobinStandings.length > 0
    ? [...roundRobinStandings].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0))[0]?.player
    : null;
  const champion = tournamentOver
    ? tournamentPhase === 'finals' && finalsMatches[0]
      ? getPlayer(finalsMatches[0], finalsMatches[0].winner)
      : bracketChampionMatch
        ? getPlayer(bracketChampionMatch, bracketChampionMatch.winner)
        : roundRobinWinner
          ? roundRobinWinner
          : tournamentPhase === 'compass' && compassData?.finals?.[2]?.winner
            ? getPlayer(compassData.finals[2], compassData.finals[2].winner)
            : null
    : null;

  const [showConfetti, setShowConfetti] = useState(false);
  const celebrationFiredRef = useRef(false);

  useEffect(() => {
    if (!tournamentOver) return;
    if (celebrationFiredRef.current) return;
    celebrationFiredRef.current = true;
    playCelebrationSound();
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(t);
  }, [tournamentOver]);

  const confettiPieces = useMemo(() => {
    const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#fff'];
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.floor(Math.random() * 8),
      rotation: Math.random() * 360,
    }));
  }, []);

  const completedMatchesForExport = useMemo(() => {
    const getMatchLabel = (m, i) => m.roundLabel ?? m.label ?? `M${i + 1}`;
    if (tournamentPhase === 'bracket') {
      return bracketMatches.filter((m) => m.winner != null).map((m, i) => ({
        match: getMatchLabel(m, i),
        p1: m.p1?.name ?? '—',
        p2: m.p2?.name ?? '—',
        winner: getPlayer(m, m.winner)?.name ?? '—',
        loser: getPlayer(m, m.winner === m.p1?.id ? m.p2?.id : m.p1?.id)?.name ?? '—',
        score: m.p1Score != null && m.p2Score != null ? `${m.p1Score}–${m.p2Score}` : null,
      }));
    }
    if (tournamentPhase === 'roundRobin') {
      return roundRobinMatches.filter((m) => m.winner != null).map((m, i) => ({
        match: `M${i + 1}`,
        p1: m.p1?.name ?? '—',
        p2: m.p2?.name ?? '—',
        winner: getPlayer(m, m.winner)?.name ?? '—',
        loser: getPlayer(m, m.winner === m.p1?.id ? m.p2?.id : m.p1?.id)?.name ?? '—',
        score: m.p1Score != null && m.p2Score != null ? `${m.p1Score}–${m.p2Score}` : null,
      }));
    }
    if (tournamentPhase === 'compass' && compassData) {
      const all = [...(compassData.groups?.flatMap((g) => g.matches) ?? []), ...(compassData.finals ?? [])];
      return all.filter((m) => m.winner != null).map((m, i) => ({
        match: m.label ?? getMatchLabel(m, i),
        p1: m.p1?.name ?? '—',
        p2: m.p2?.name ?? '—',
        winner: getPlayer(m, m.winner)?.name ?? '—',
        loser: getPlayer(m, m.winner === m.p1?.id ? m.p2?.id : m.p1?.id)?.name ?? '—',
        score: m.p1Score != null && m.p2Score != null ? `${m.p1Score}–${m.p2Score}` : null,
      }));
    }
    if (tournamentPhase === 'finals') {
      return finalsMatches.filter((m) => m.winner != null).map((m, i) => ({
        match: m.type ?? `Match ${i + 1}`,
        p1: m.p1?.name ?? '—',
        p2: m.p2?.name ?? '—',
        winner: getPlayer(m, m.winner)?.name ?? '—',
        loser: getPlayer(m, m.winner === m.p1?.id ? m.p2?.id : m.p1?.id)?.name ?? '—',
        score: m.p1Score != null && m.p2Score != null ? `${m.p1Score}–${m.p2Score}` : null,
      }));
    }
    if (tournamentPhase === 'pool' && matchHistory.length > 0) {
      const getPlayerName = (id) => players.find((p) => p.id === id)?.name ?? '—';
      return matchHistory.map((m, i) => ({
        match: `Match ${i + 1}`,
        p1: getPlayerName(m.p1Id),
        p2: getPlayerName(m.p2Id),
        winner: getPlayerName(m.winnerId),
        loser: getPlayerName(m.winnerId === m.p1Id ? m.p2Id : m.p1Id),
        score: null,
      }));
    }
    return [];
  }, [tournamentPhase, bracketMatches, roundRobinMatches, compassData, finalsMatches, matchHistory, players]);

  const exportResultsRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportResultsAsImage = async () => {
    if (completedMatchesForExport.length === 0) return;
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 250));
    const el = exportResultsRef.current;
    if (!el) {
      setIsExporting(false);
      return;
    }
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: theme === 'dark' ? '#1e293b' : '#f8fafc',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `dart-tournament-results-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
    setIsExporting(false);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-sans text-base leading-relaxed overflow-hidden relative">
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60" aria-hidden="true" />
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">Reset tournament?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-base mb-6">
              This will clear all players, matches, and progress. You will return to the setup screen.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-500 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={resetGame}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition font-medium"
              >
                Reset Game
              </button>
            </div>
          </div>
        </div>
      )}

      {completedMatchesForExport.length > 0 && (
        <div
          ref={exportResultsRef}
          className={`w-[600px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl p-6 text-slate-900 dark:text-white ${
            isExporting ? 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]' : 'fixed left-[-9999px] top-0'
          }`}
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Trophy className="text-yellow-600 dark:text-yellow-400" /> Men&apos;s Dart Night — Tournament Results
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base mb-4">
            {new Date().toLocaleDateString()} • {BRACKET_FORMATS.find((f) => f.id === bracketFormat)?.label ?? bracketFormat}
          </p>
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-slate-600 dark:text-slate-400 border-b border-slate-300 dark:border-slate-600">
                <th className="py-2 pr-4">Match</th>
                <th className="py-2 pr-4">Player 1</th>
                <th className="py-2 pr-4">Player 2</th>
                <th className="py-2 pr-4">Winner</th>
                <th className="py-2 pr-4">Loser</th>
                <th className="py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {completedMatchesForExport.map((row, i) => (
                <tr key={i} className="border-b border-slate-200/80 dark:border-slate-200 dark:border-slate-700/50">
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-500 font-mono text-sm">{row.match}</td>
                  <td className="py-2 pr-4">{row.p1}</td>
                  <td className="py-2 pr-4">{row.p2}</td>
                  <td className="py-2 pr-4 font-semibold text-emerald-700 dark:text-emerald-400">{row.winner}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{row.loser}</td>
                  <td className="py-2">{row.score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {champion && (
            <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-600 text-center">
              <span className="text-slate-600 dark:text-slate-400 text-base">Champion: </span>
              <span className="text-xl font-bold text-amber-700 dark:text-amber-400">{champion.name}</span>
            </div>
          )}
        </div>
      )}

      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
          {confettiPieces.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-sm"
              style={{
                left: `${p.left}%`,
                top: '-20px',
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                animation: `confetti-fall ${p.duration}s ease-in forwards`,
                animationDelay: `${p.delay}s`,
                transform: `rotate(${p.rotation}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0 max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 self-center">
        <header className="flex flex-wrap justify-between items-center gap-4 mb-4 border-b border-slate-200 dark:border-slate-700 pb-3 shrink-0">
          <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2 shrink-0">
            <Trophy className="text-yellow-600 dark:text-yellow-400 shrink-0" /> Men's Dart Night
          </h1>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-base transition"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            {(stage === 'playing' || tournamentOver) && (
              <>
                <button
                  type="button"
                  onClick={exportResultsAsImage}
                  disabled={completedMatchesForExport.length === 0 || isExporting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 text-base transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Image size={16} /> Export
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 text-base transition"
                >
                  <RotateCcw size={16} /> Reset Game
                </button>
              </>
            )}
            <span className="text-slate-600 dark:text-slate-400 uppercase tracking-widest text-base">
              {stage === 'setup' ? 'Setup' : tournamentOver ? 'Complete'
                : tournamentPhase === 'bracket' ? BRACKET_FORMATS.find((f) => f.id === bracketFormat)?.label ?? 'Bracket'
                : tournamentPhase === 'roundRobin' ? 'Round Robin'
                : tournamentPhase === 'compass' ? 'Compass Draw'
                : tournamentPhase === 'ladder' ? 'Ladder'
                : tournamentPhase === 'finals' ? 'Grand Final & 3rd/4th' : '3 wins in a row → Finals'}
            </span>
          </div>
        </header>

      {stage === 'setup' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex justify-center py-6 px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 p-6 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700">
          <h2 className="text-2xl mb-4 flex items-center gap-2">
            <Users className="shrink-0" /> Register Players
          </h2>
          <div className="flex gap-2 mb-6">
            <input
              className="flex-1 bg-white text-slate-900 placeholder:text-slate-500 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-400 p-2 rounded border border-slate-300 dark:border-slate-600 outline-none focus:border-blue-500"
              value={newPlayer}
              onChange={(e) => setNewPlayer(e.target.value)}
              placeholder="Enter name..."
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            />
            <button
              onClick={addPlayer}
              className="bg-blue-600 text-white px-4 rounded hover:bg-blue-500 transition"
            >
              Add
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-6 max-h-48 overflow-y-auto">
            {players.map((p) => (
              <div
                key={p.id}
                className="bg-slate-100 dark:bg-slate-700 p-2 rounded text-base flex justify-between items-center gap-2 min-w-0"
              >
                <EditablePlayerName player={p} onRename={renamePlayer} draggable={false} noChipStyle className="flex-1 min-w-0" />
                <span className="text-slate-600 dark:text-slate-500 shrink-0 text-sm">#{String(p.id).slice(-3)}</span>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-base mb-2">
              <ListOrdered size={18} className="text-slate-600 dark:text-slate-400" />
              Bracket format
            </label>
            <div className="space-y-2 mb-3">
              {BRACKET_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setBracketFormat(f.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    bracketFormat === f.id
                      ? 'bg-blue-600/30 border-blue-500 ring-1 ring-blue-500 dark:ring-blue-400'
                      : 'bg-slate-100/90 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="font-medium block">{f.label}</span>
                  <span className="text-slate-600 dark:text-slate-400 text-sm">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-base mb-2">
              <LayoutGrid size={18} className="text-slate-600 dark:text-slate-400" />
              Dart boards for this tournament
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBoardCount(n)}
                  className={`w-10 h-10 rounded-lg font-bold text-base transition ${
                    boardCount === n
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
              {boardCount} board{boardCount !== 1 ? 's' : ''} — that many matches can run at once
            </p>
          </div>

          <button
            disabled={players.length < 2}
            onClick={startTournament}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-bold disabled:opacity-50 hover:bg-green-500 transition shadow-lg shadow-green-900/10 dark:shadow-green-900/20"
          >
            Start Tournament ({players.length} Players)
          </button>
          <p className="text-slate-600 dark:text-slate-500 text-sm mt-2 text-center">
            {BRACKET_FORMATS.find((f) => f.id === bracketFormat)?.label ?? bracketFormat}
          </p>
        </div>
          </div>
        </div>
      )}

      {stage === 'playing' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-auto w-full">
        <div className="space-y-4 w-full flex-shrink-0">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Clock className="shrink-0" /> Round timer
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-slate-600 dark:text-slate-400 text-base">Minutes</label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={timerInputMinutes}
                  onChange={(e) => setTimerInputMinutes(e.target.value)}
                  disabled={timerRunning}
                  className="w-20 bg-white text-slate-900 dark:bg-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 rounded px-2 py-2 text-center text-base"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-600 dark:text-slate-400 text-base">Seconds</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={timerInputSeconds}
                  onChange={(e) => setTimerInputSeconds(e.target.value)}
                  disabled={timerRunning}
                  className="w-20 bg-white text-slate-900 dark:bg-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 rounded px-2 py-2 text-center text-base"
                />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-6xl sm:text-7xl font-mono font-bold tabular-nums ${
                    remainingSeconds == null
                      ? 'text-slate-600 dark:text-slate-400'
                      : remainingSeconds === 0
                        ? 'text-red-600 dark:text-red-400'
                        : remainingSeconds > 60
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {formatTime(remainingSeconds)}
                </span>
              </div>
              <div className="flex gap-2">
                {!timerRunning ? (
                  <button
                    type="button"
                    onClick={startTimer}
                    className="bg-emerald-600 text-white hover:bg-emerald-500 px-4 py-1.5 rounded text-base font-medium"
                  >
                    Start timer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTimerRunning(false)}
                    className="bg-amber-600 text-white hover:bg-amber-500 px-4 py-1.5 rounded text-base font-medium"
                  >
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    alarmPlayedRef.current = false;
                    oneMinuteAlertPlayedRef.current = false;
                    setRemainingSeconds(null);
                    setTimerRunning(false);
                    setAlarmRinging(false);
                  }}
                  className="bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-500 px-4 py-1.5 rounded text-base"
                >
                  Reset Timer
                </button>
              </div>
            </div>
            {alarmRinging && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                  <Volume2 size={18} /> Time&apos;s up — stop playing!
                </span>
                <button
                  type="button"
                  onClick={stopAlarm}
                  className="bg-slate-200 dark:bg-slate-600 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-500 px-3 py-1 rounded text-base"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Medal className="text-slate-600 dark:text-slate-400 shrink-0" /> Players ({players.filter((p) => p.id !== 'bye').length})
            </h3>
            <p className="text-slate-600 dark:text-slate-500 text-sm px-4 pt-2">
              Drag players into bracket slots to assign. Use the pencil to fix spelling anytime.
            </p>
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {players.filter((p) => p.id !== 'bye').map((p) => (
                  <EditablePlayerName key={p.id} player={p} onRename={renamePlayer} draggable />
                ))}
              </div>
              <div className="pt-2 border-t border-slate-300 dark:border-slate-600">
                <label className="text-slate-600 dark:text-slate-400 text-sm block mb-1.5">Add player to roster</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-white text-slate-900 placeholder:text-slate-500 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-400 p-2 rounded border border-slate-300 dark:border-slate-600 outline-none focus:border-blue-500 text-base"
                    value={newPlayer}
                    onChange={(e) => setNewPlayer(e.target.value)}
                    placeholder="Name..."
                    onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                  />
                  <button
                    onClick={addPlayer}
                    className="bg-blue-600 text-white px-4 rounded hover:bg-blue-500 transition text-base shrink-0"
                  >
                    Add
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">
                  New players join the roster only.
                </p>
              </div>
            </div>
          </div>

          {tournamentPhase === 'bracket' && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
                <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                  <Play className="shrink-0" /> Bracket diagram
                </h3>
                {bracketFormat === 'single' ? (
                  <SingleElimDiagram
                    matches={bracketMatches}
                    boardCount={boardCount}
                    onWin={handleBracketWin}
                    selectedMatchId={selectedMatchId}
                    onSlotDrop={(matchId, slotIndex, payload) =>
                      handleSlotDrop(matchId, slotIndex === 0 ? 'p1' : 'p2', payload.player, payload.sourceMatchId, payload.sourceSlot === 0 ? 'p1' : 'p2')
                    }
                  />
                ) : (
                  <BracketDiagram
                    matches={bracketMatches}
                    matchById={matchById}
                    boardCount={boardCount}
                    onWin={handleBracketWin}
                    selectedMatchId={selectedMatchId}
                    onSlotDrop={(matchId, slotIndex, payload) =>
                      handleSlotDrop(matchId, slotIndex === 0 ? 'p1' : 'p2', payload.player, payload.sourceMatchId, payload.sourceSlot === 0 ? 'p1' : 'p2')
                    }
                  />
                )}
              </div>
              <MatchHistoryPanel
                matches={bracketMatches}
                onScoreChange={handleScoreChange}
                getMatchLabel={(m) => m.roundLabel ?? (m.bracket === 'gf' ? 'GF' : m.id)}
              />
            </>
          )}

          {tournamentPhase === 'roundRobin' && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
                <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-2">Standings</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {[...roundRobinStandings].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0)).map((s, i) => (
                    <span key={s.player?.id} className="bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded text-base">
                      {i + 1}. {s.player?.name} — {s.wins ?? 0}W / {s.losses ?? 0}L
                    </span>
                  ))}
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-3">Matches</h3>
                <div className="flex flex-wrap gap-4">
                  {roundRobinMatches.map((m) => (
                    <BracketMatchCell key={m.id} match={m} onWin={handleRoundRobinWin} onSlotDrop={handleSlotDrop} />
                  ))}
                </div>
              </div>
              <MatchHistoryPanel
                matches={roundRobinMatches}
                onScoreChange={handleScoreChange}
                getMatchLabel={(m, i) => `M${i + 1}`}
              />
            </>
          )}

          {tournamentPhase === 'compass' && compassData && (
            <>
              {compassData.groups.map((g) => (
                <div key={g.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
                  <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-3">{g.label} bracket</h3>
                  <div className="flex flex-wrap gap-4">
                    {g.matches.map((m) => (
                      <BracketMatchCell key={m.id} match={m} onWin={handleCompassWin} onSlotDrop={handleSlotDrop} />
                    ))}
                  </div>
                </div>
              ))}
              {compassData.finals?.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
                  <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-3">Finals</h3>
                  <div className="flex flex-wrap gap-4">
                    {compassData.finals.map((m) => (
                      <div key={m.id} className="flex flex-col">
                        <span className="text-slate-600 dark:text-slate-500 text-sm mb-1">{m.label}</span>
                        <BracketMatchCell match={m} onWin={handleCompassFinalsWin} onSlotDrop={handleSlotDrop} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <MatchHistoryPanel
                matches={[...(compassData.groups?.flatMap((g) => g.matches) ?? []), ...(compassData.finals ?? [])]}
                onScoreChange={handleScoreChange}
                getMatchLabel={(m) => m.label ?? m.id}
              />
            </>
          )}

          {tournamentPhase === 'ladder' && ladderData && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
              <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-3">Ladder rankings</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base mb-4">Challenge players above you to climb the ladder.</p>
              <div className="space-y-2">
                {ladderData.rankings.map((r, i) => (
                  <div key={r.player?.id} className="flex items-center gap-3 bg-slate-100 dark:bg-slate-700 p-2 rounded">
                    <span className="text-slate-600 dark:text-slate-500 w-6">#{r.rank}</span>
                    <span>{r.player?.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tournamentPhase === 'pool' && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
                <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-2">Qualified for finals (3 wins in a row)</h3>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {qualified.length === 0 ? (
                    <span className="text-slate-600 dark:text-slate-500 text-base">No one yet</span>
                  ) : (
                    qualified.map((p, i) => (
                      <span key={p.id} className="bg-amber-500/20 border border-amber-500/50 px-3 py-1.5 rounded text-base">
                        {i + 1}. {p.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full overflow-x-auto">
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Play className="shrink-0" /> Bracket — Current round
                </h3>
                <div className="flex gap-6 items-start">
                  <div className="flex flex-col gap-8">
                    {currentRoundMatches.map((m, i) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <span className="text-slate-600 dark:text-slate-500 text-sm w-6">M{i + 1}</span>
                        <BracketMatchCell
                          match={m}
                          onWin={handlePoolWin}
                          onSlotDrop={handleSlotDrop}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full">
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-2">Win streak</h3>
                <div className="flex flex-wrap gap-2">
                  {players.filter((p) => p.id !== 'bye').map((p) => (
                    <span key={p.id} className="bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded text-base">
                      {p.name}: <span className="text-amber-700 dark:text-amber-400 font-mono">{getWinStreak(matchHistory, p.id)}</span> in a row
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {tournamentPhase === 'finals' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 p-4 w-full overflow-x-auto">
              <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 mb-3">Finals bracket</h3>
              <div className="flex gap-8 flex-wrap">
                {finalsMatches.map((m) => (
                  <div key={m.id} className="flex flex-col">
                    <span className="text-slate-600 dark:text-slate-500 text-sm mb-1">{m.type}</span>
                    <BracketMatchCell
                      match={m}
                      onWin={handleFinalsWin}
                      onSlotDrop={handleSlotDrop}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tournamentOver && (
            <div className="space-y-4 w-full">
              <div className="max-w-md mx-auto bg-amber-500/10 border border-amber-500/50 rounded-xl p-6 text-center">
                <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-400">Champion</h3>
                <p className="text-4xl font-black text-slate-900 dark:text-white mt-2">{champion?.name}</p>
              </div>
              {tournamentPhase === 'finals' && finalsMatches.length >= 2 && (
                <div className="max-w-md mx-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl p-4 text-center">
                  <h3 className="text-base font-bold text-slate-600 dark:text-slate-400 mb-2">3rd & 4th place</h3>
                  <p className="text-slate-800 dark:text-slate-200">
                    <strong>3rd:</strong> {finalsMatches[1] && getPlayer(finalsMatches[1], finalsMatches[1].winner)?.name}
                    {' · '}
                    <strong>4th:</strong> {finalsMatches[1] && getPlayer(finalsMatches[1], finalsMatches[1].winner === finalsMatches[1].p1?.id ? finalsMatches[1].p2?.id : finalsMatches[1].p1?.id)?.name}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      )}
      </div>
    </div>
  );
}
