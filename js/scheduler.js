/* ==========================================================================
   JMM Bell Commander — scheduler.js
   The engine that decides which timetable is "active" right now, checks
   the clock once a second, and fires + queues bell audio when a bell's
   time is reached. Pure logic + a small audio queue; app.js wires it to
   the UI and to persisted state.
   ========================================================================== */

const Scheduler = (() => {
  let intervalHandle = null;
  let firedToday = new Set();
  let firedForYMD = null;
  let callbacks = {};
  let paused = false;
  let skippedKeys = new Set();
  let lastTickInfo = null;
  const ringSrcCache = new Map(); // ringKey -> resolved src (object URL or path)

  /* ---------------- active timetable resolution ---------------- */

  function matchesDate(t, dateObj) {
    const ymd = Utils.dateToYMD(dateObj);
    const exception = (t.assignment.exceptions || []).find((item) => item.date === ymd);
    if (exception) return exception.mode === 'include';
    if (t.assignment.type === 'dateRange') {
      return ymd >= t.assignment.start && ymd <= t.assignment.end;
    }
    if (t.assignment.type === 'weekday') {
      return (t.assignment.days || []).includes(dateObj.getDay());
    }
    return false;
  }

  function rangeSpanDays(t) {
    const [sy, sm, sd] = t.assignment.start.split('-').map(Number);
    const [ey, em, ed] = t.assignment.end.split('-').map(Number);
    return (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000;
  }

  /**
   * Returns { timetable, reason } where reason is one of:
   * 'override' | 'dateRange' | 'weekday' | 'none'
   */
  function computeActiveTimetable(dateObj, timetables, settings) {
    const ymd = Utils.dateToYMD(dateObj);

    if ((settings.excludedDates || []).includes(ymd)) {
      return { timetable: null, reason: 'excluded' };
    }

    if (settings.overrideDate === ymd && settings.overrideTimetableId) {
      const t = timetables.find((tt) => tt.id === settings.overrideTimetableId);
      if (t) return { timetable: t, reason: 'override' };
    }

    const candidates = timetables.filter((t) => matchesDate(t, dateObj));
    const dateRangeMatches = candidates.filter((t) => t.assignment.type === 'dateRange');
    if (dateRangeMatches.length) {
      dateRangeMatches.sort((a, b) => rangeSpanDays(a) - rangeSpanDays(b));
      return { timetable: dateRangeMatches[0], reason: 'dateRange' };
    }
    const weekdayMatches = candidates.filter((t) => t.assignment.type === 'weekday');
    if (weekdayMatches.length) {
      return { timetable: weekdayMatches[0], reason: 'weekday' };
    }
    return { timetable: null, reason: 'none' };
  }

  function sortedBells(timetable) {
    if (!timetable) return [];
    return [...timetable.bells].sort((a, b) => a.time.localeCompare(b.time));
  }

  function nextBell(timetable, dateObj) {
    const bells = sortedBells(timetable).filter((b) => b.enabled);
    if (!bells.length) return null;
    const nowHHMM = Utils.timeToHHMM(dateObj);
    let best = null;
    for (const b of bells) {
      if (b.time >= nowHHMM) { best = b; break; }
    }
    if (!best) best = bells[0]; // wraps to first bell tomorrow
    return best;
  }

  function nextScheduledBell(dateObj, timetables, settings) {
    for (let offset = 0; offset <= 366; offset += 1) {
      const candidateDate = new Date(dateObj);
      candidateDate.setDate(candidateDate.getDate() + offset);
      const active = computeActiveTimetable(candidateDate, timetables, settings);
      const minimumTime = offset === 0 ? Utils.timeToHHMM(dateObj) : '00:00';
      const bell = sortedBells(active.timetable)
        .filter((item) => item.enabled && item.time >= minimumTime)[0];
      if (bell) {
        return {
          ...bell,
          occurrenceDate: Utils.dateToYMD(candidateDate),
          timetable: active.timetable,
          reason: active.reason,
        };
      }
    }
    return null;
  }

  /* ---------------- ring source resolution ---------------- */

  async function resolveRingSrc(ring, defaultRings) {
    if (!ring) return null;
    const key = `${ring.source}::${ring.id}`;
    if (ringSrcCache.has(key)) return ringSrcCache.get(key);

    if (ring.source === 'default') {
      const entry = defaultRings.find((r) => r.id === ring.id);
      if (!entry) return null;
      const src = `rings/${entry.file}`;
      ringSrcCache.set(key, src);
      return src;
    }
    if (ring.source === 'custom') {
      const rec = await RingsDB.get(ring.id);
      if (!rec) return null;
      const src = URL.createObjectURL(rec.blob);
      ringSrcCache.set(key, src);
      return src;
    }
    return null;
  }

  function invalidateRingCache(source, id) {
    const key = `${source}::${id}`;
    if (ringSrcCache.has(key)) {
      const src = ringSrcCache.get(key);
      if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
      ringSrcCache.delete(key);
    }
  }

  /* ---------------- audio queue ---------------- */

  const audioEl = new Audio();
  let queue = [];
  let playing = false;

  function setVolume(v) {
    audioEl.volume = Math.max(0, Math.min(1, v));
  }

  function setPaused(value) { paused = Boolean(value); }
  function isPaused() { return paused; }
  function skipNextBell() {
    if (!lastTickInfo?.next) return false;
    skippedKeys.add(`${lastTickInfo.next.occurrenceDate}_${lastTickInfo.next.id}`);
    return true;
  }
  function stopRinging() {
    queue = [];
    audioEl.pause();
    audioEl.currentTime = 0;
  }

  function playNextInQueue() {
    if (!queue.length) { playing = false; return; }
    playing = true;
    const item = queue.shift();
    audioEl.src = item.src;
    audioEl.play().catch(() => {
      // Autoplay was blocked (no user gesture yet this session).
      playing = false;
      callbacks.onAudioBlocked && callbacks.onAudioBlocked(item);
    });
  }

  audioEl.addEventListener('ended', () => {
    setTimeout(playNextInQueue, 250);
  });

  async function enqueueRing(ring, defaultRings) {
    const src = await resolveRingSrc(ring, defaultRings);
    if (!src) return false;
    queue.push({ src });
    if (!playing) playNextInQueue();
    return true;
  }

  async function previewRing(ring, defaultRings, volume) {
    const src = await resolveRingSrc(ring, defaultRings);
    if (!src) return false;
    setVolume(volume ?? audioEl.volume);
    const preview = new Audio(src);
    preview.volume = audioEl.volume;
    await preview.play();
    return true;
  }

  async function ringNow(ring, defaultRings) {
    return enqueueRing(ring, defaultRings);
  }

  async function testVolume(ring, defaultRings, volume) {
    return previewRing(ring, defaultRings, volume);
  }

  function unlockAudio() {
    // Play a near-silent blip synchronously within a user gesture to
    // satisfy iOS/Safari/Chrome autoplay-unlock requirements for this
    // page session.
    const el = new Audio();
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    el.volume = 0.0001;
    return el.play().catch(() => {});
  }

  /* ---------------- tick loop ---------------- */

  function start(cbs) {
    callbacks = cbs;
    stop();
    tick(); // immediate first tick
    intervalHandle = setInterval(tick, 1000);
  }

  function stop() {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
  }

  function tick() {
    const now = new Date();
    const ymd = Utils.dateToYMD(now);
    if (firedForYMD !== ymd) {
      firedForYMD = ymd;
      firedToday = new Set();
      callbacks.onDayRollover && callbacks.onDayRollover(ymd);
    }

    const timetables = callbacks.getTimetables();
    const settings = callbacks.getSettings();
    const defaultRings = callbacks.getDefaultRings();
    const { timetable, reason } = computeActiveTimetable(now, timetables, settings);
    const next = nextScheduledBell(now, timetables, settings);
    lastTickInfo = { now, timetable, reason, next };

    callbacks.onTick && callbacks.onTick({ now, timetable, reason, next, paused });

    if (paused) return;

    if (timetable) {
      const hhmm = Utils.timeToHHMM(now);
      for (const bell of timetable.bells) {
        if (!bell.enabled) continue;
        if (bell.time !== hhmm) continue;
        const key = `${ymd}_${bell.id}`;
        if (firedToday.has(key)) continue;
        if (skippedKeys.delete(key)) {
          firedToday.add(key);
          callbacks.onBellSkip && callbacks.onBellSkip(bell, timetable);
          continue;
        }
        firedToday.add(key);
        enqueueRing(bell.ring, defaultRings);
        callbacks.onBellFire && callbacks.onBellFire(bell, timetable);
      }
    }
  }

  return {
    computeActiveTimetable, sortedBells, nextBell, nextScheduledBell,
    start, stop, setVolume, unlockAudio, setPaused, isPaused,
    skipNextBell, stopRinging, ringNow, testVolume,
    enqueueRing, previewRing, invalidateRingCache,
  };
})();
