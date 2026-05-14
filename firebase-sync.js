/* ═══════════════════════════════════════════════════════════════
   firebase-sync.js  — Cloud sync layer for the Japanese Learning App
   ═══════════════════════════════════════════════════════════════

   SYNC STRATEGY
   ─────────────
   • localStorage  = instant read-cache (all reads come from memory)
   • Firestore     = source of truth    (written on every change)
   • On sign-in    → load 3 Firestore docs → merge into memory/localStorage
   • On data write → update memory + localStorage immediately (optimistic)
                    → queue a Firestore write, flush after 2 s of inactivity
   • Offline       → Firestore persistence keeps a local copy; syncs on reconnect

   FIRESTORE LAYOUT
   ─────────────────
   users/{uid}/data/wordData   → { wordId: { srsLevel, status, nextReview, note }, … }
   users/{uid}/data/seenWords  → { lvKey, seen:[…], cycle }
   users/{uid}/data/promoted   → { arr: [ …full VOCAB entries… ] }
   users/{uid}/data/activity   → { "YYYY-MM-DD": count, … }          ← heatmap
   users/{uid}/data/fcDone     → { date, shownCount, allShownIds[] }  ← daily session
   users/{uid}/data/answerLog   → { "YYYY-MM-DD": [{wId,r,lb,la,src,t}] } ← per-word history
   users/{uid}/data/quizSessions→ { "YYYY-MM-DD": [{score,total,pct,t}] }   ← quiz summaries
   users/{uid}/data/stats       → { totalReviewed, totalCorrect,            ← cached counters
                                    currentStreak, longestStreak,
                                    lastActiveDate }

   PUBLIC API  (window.FB)
   ───────────────────────
   FB.init()                   call once on DOMContentLoaded
   FB.signIn()                 trigger Google popup
   FB.signOut()                sign out current user
   FB.syncWordData(userData)   call after every setWD()
   FB.syncSeenWords(seenData)  call after jp_seen_v2 update
   FB.syncPromoted(arr)        call after savePromotedList()
   FB.syncActivity(log)        call after logActivity() writes to localStorage
   FB.syncFcDone(obj)          call after setFcDoneState() writes to localStorage
   FB.logAnswerRecord(rec)     call in fcAnswer()/quizAnswer() — appends {wId,r,lb,la,src,t} to today's log
   FB.logQuizSession(score,total) call at quiz end — appends {score,total,pct,t} to today's sessions
   FB.syncStats(stats)         call after updateStats() — queued write of all counters + streak

═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Internal state ───────────────────────────────────────── */
  let _db   = null;
  let _auth = null;
  let _uid  = null;   // null = not signed in
  let _cfgOk = false; // firebase-config.js was loaded with real values

  // Debounced write queue: { docName → data }
  const _queue = {};
  let   _flushTimer = null;
  const FLUSH_MS    = 2000;  // coalesce writes for 2 s

  /* ── Firestore doc reference helper ──────────────────────── */
  function docRef(name) {
    return _db.collection('users').doc(_uid).collection('data').doc(name);
  }

  /* ── Status indicator ────────────────────────────────────── */
  const ICONS   = { off:'☁', idle:'☁', pending:'⏳', syncing:'🔄', ok:'✓', error:'⚠' };
  const COLORS  = {
    off:     'var(--muted)',
    idle:    'var(--muted)',
    pending: '#ffa726',
    syncing: '#42a5f5',
    ok:      '#66bb6a',
    error:   '#ef5350',
  };

  function setStatus(key, tooltip) {
    const el = document.getElementById('fb-sync-btn');
    if (!el) return;
    el.textContent        = ICONS[key]  ?? '☁';
    el.style.color        = COLORS[key] ?? 'var(--muted)';
    el.dataset.syncStatus = key;
    if (tooltip) el.title = tooltip;
  }

  /* ── Auth UI helper ──────────────────────────────────────── */
  function refreshAuthUI(user) {
    const el = document.getElementById('fb-sync-btn');
    if (!el) return;
    if (user) {
      const name = user.displayName || user.email || '已登入';
      el.title   = `${name} · 點擊登出`;
      el.onclick = signOut;
    } else {
      el.title   = '點擊以 Google 帳號登入，跨裝置同步 SRS 資料';
      el.onclick = signIn;
    }
  }

  /* ── Auth ─────────────────────────────────────────────────── */
  function signIn() {
    if (!_auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    _auth.signInWithPopup(provider).catch(err => {
      console.error('[FB] sign-in error', err);
      setStatus('error', '登入失敗，請重試');
    });
  }

  function signOut() {
    if (!_auth) return;
    _auth.signOut().then(() => setStatus('idle', '已登出'));
  }

  /* ── Load all user data from Firestore ───────────────────── */
  async function loadAll() {
    if (!_uid || !_db) return;
    setStatus('syncing', '載入雲端資料…');

    try {
      const [wordSnap, seenSnap, promotedSnap, activitySnap, fcDoneSnap, statsSnap] = await Promise.all([
        docRef('wordData').get(),
        docRef('seenWords').get(),
        docRef('promoted').get(),
        docRef('activity').get(),
        docRef('fcDone').get(),
        docRef('stats').get(),
      ]);

      /* ── Word data (SRS progress) ── */
      if (wordSnap.exists) {
        const cloud = wordSnap.data() || {};
        // Cloud wins on conflict (server is source of truth)
        const merged = Object.assign({}, window.userData || {}, cloud);
        window.userData = merged;
        if (typeof saveStorage === 'function') saveStorage(merged);
      }

      /* ── Seen-words rotation ── */
      if (seenSnap.exists) {
        const cloudSeen = seenSnap.data();
        if (cloudSeen && cloudSeen.lvKey) {
          localStorage.setItem('jp_seen_v2', JSON.stringify(cloudSeen));
        }
      }

      /* ── Promoted words ── */
      if (promotedSnap.exists) {
        const cloudArr = (promotedSnap.data().arr) || [];
        if (cloudArr.length > 0) {
          localStorage.setItem('jp_promoted', JSON.stringify(cloudArr));
          // Inject into VOCAB (skip duplicates)
          if (typeof VOCAB !== 'undefined') {
            cloudArr.forEach(w => {
              if (w && w.id && w.kanji &&
                  !VOCAB.find(v => v.id === w.id || v.kanji === w.kanji)) {
                VOCAB.push(w);
              }
            });
          }
        }
      }

      /* ── Activity heatmap ── */
      if (activitySnap.exists) {
        const cloudLog = activitySnap.data() || {};
        // Merge: per-date, keep the higher count so offline work is never lost
        let localLog = {};
        try { localLog = JSON.parse(localStorage.getItem('jp_activity') || '{}'); } catch(_) {}
        const merged = Object.assign({}, cloudLog);
        for (const [date, cnt] of Object.entries(localLog)) {
          merged[date] = Math.max(merged[date] || 0, cnt);
        }
        localStorage.setItem('jp_activity', JSON.stringify(merged));
        // Push merged result back to cloud if it differs from cloud
        if (JSON.stringify(merged) !== JSON.stringify(cloudLog)) {
          queueWrite('activity', merged);
        }
      }

      /* ── Flashcard daily session ── */
      if (fcDoneSnap.exists) {
        const cloudFc = fcDoneSnap.data() || {};
        let localFc = null;
        try { localFc = JSON.parse(localStorage.getItem('jp_fc_done') || 'null'); } catch(_) {}
        // Use whichever record has more shown words for today
        const today = new Date().toISOString().slice(0, 10);
        const cloudIsToday = cloudFc.date === today;
        const localIsToday = localFc && localFc.date === today;
        if (cloudIsToday && (!localIsToday || (cloudFc.shownCount || 0) > (localFc.shownCount || 0))) {
          localStorage.setItem('jp_fc_done', JSON.stringify(cloudFc));
        }
      }

      /* ── Stats summary (counters + streak) ── */
      if (statsSnap.exists) {
        const cloudStats = statsSnap.data() || {};
        let localStats = {};
        try { localStats = JSON.parse(localStorage.getItem('jp_stats') || '{}'); } catch(_) {}
        // Counters can only go up — take the max so no device loses its history
        const merged = {
          totalReviewed: Math.max(cloudStats.totalReviewed || 0, localStats.totalReviewed || 0),
          totalCorrect:  Math.max(cloudStats.totalCorrect  || 0, localStats.totalCorrect  || 0),
          longestStreak: Math.max(cloudStats.longestStreak || 0, localStats.longestStreak || 0),
        };
        localStorage.setItem('jp_stats', JSON.stringify(merged));
        // If local was behind, push the merged result back
        if (merged.totalReviewed > (cloudStats.totalReviewed || 0) ||
            merged.totalCorrect  > (cloudStats.totalCorrect  || 0) ||
            merged.longestStreak > (cloudStats.longestStreak || 0)) {
          queueWrite('stats', merged);
        }
      }

      setStatus('ok', '雲端已同步');

      // If the main app is visible, re-render the current section
      if (typeof state !== 'undefined' && typeof renderVocab === 'function') {
        if (state.section === 'vocab')     renderVocab();
        if (state.section === 'progress' && typeof renderProgress === 'function')
          renderProgress();
      }

    } catch (err) {
      console.error('[FB] loadAll error', err);
      setStatus('error', '同步失敗（離線？）');
    }
  }

  /* ── Debounced write queue ───────────────────────────────── */
  function queueWrite(docName, data) {
    if (!_uid || !_db) return;
    _queue[docName] = data;
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(flushQueue, FLUSH_MS);
    setStatus('pending', '等待同步…');
  }

  async function flushQueue() {
    if (!_uid || !_db) return;
    const entries = Object.entries(_queue);
    if (entries.length === 0) return;

    setStatus('syncing', '同步中…');

    // Copy and clear queue before await (new writes can queue during flush)
    const snapshot = { ...(_queue) };
    for (const key of Object.keys(_queue)) delete _queue[key];

    try {
      const batch = _db.batch();
      for (const [docName, data] of Object.entries(snapshot)) {
        // Use set+merge so partial updates don't wipe existing fields
        batch.set(docRef(docName), data, { merge: true });
      }
      await batch.commit();
      setStatus('ok', '雲端已同步');
    } catch (err) {
      console.error('[FB] flush error', err);
      // Re-queue failed writes so they retry on next change
      Object.assign(_queue, snapshot);
      setStatus('error', '同步失敗，稍後重試');
    }
  }

  /* ── Public sync hooks ───────────────────────────────────── */
  function syncWordData(allUserData) {
    queueWrite('wordData', allUserData);
  }

  function syncSeenWords(seenData) {
    queueWrite('seenWords', seenData);
  }

  function syncPromoted(arr) {
    queueWrite('promoted', { arr: arr || [] });
  }

  function syncActivity(log) {
    queueWrite('activity', log || {});
  }

  function syncFcDone(obj) {
    if (!obj) return;
    queueWrite('fcDone', obj);
  }

  /**
   * Append one answer record to today's log via arrayUnion (non-debounced).
   * Record shape: { wId, r: "c"|"w", lb: levelBefore, la: levelAfter, t: "HH:MM:SS" }
   */
  function logAnswerRecord(rec) {
    if (!_uid || !_db) return;
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const hms   = new Date().toTimeString().slice(0, 8); // "HH:MM:SS"
    const entry = Object.assign({}, rec, { t: hms });
    docRef('answerLog')
      .set({ [today]: firebase.firestore.FieldValue.arrayUnion(entry) }, { merge: true })
      .catch(err => console.error('[FB] answerLog write error', err));
  }

  function syncStats(stats) {
    queueWrite('stats', stats || {});
  }

  /** Record a completed quiz session summary (score / total / accuracy %). */
  function logQuizSession(score, total) {
    if (!_uid || !_db) return;
    const today = new Date().toISOString().slice(0, 10);
    const hms   = new Date().toTimeString().slice(0, 8);
    const pct   = total > 0 ? Math.round((score / total) * 100) : 0;
    const entry = { score, total, pct, t: hms };
    docRef('quizSessions')
      .set({ [today]: firebase.firestore.FieldValue.arrayUnion(entry) }, { merge: true })
      .catch(err => console.error('[FB] quizSessions write error', err));
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    // Check that firebase-config.js was loaded and filled in
    if (typeof FIREBASE_CONFIG === 'undefined') {
      console.warn('[FB] firebase-config.js not loaded — sync disabled');
      setStatus('off', '未設定雲端同步');
      return;
    }
    if (FIREBASE_CONFIG.apiKey.startsWith('PASTE_')) {
      console.warn('[FB] Firebase config not filled in — sync disabled');
      setStatus('off', '未設定雲端同步（填入 firebase-config.js）');
      return;
    }

    _cfgOk = true;

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      _db   = firebase.firestore();
      _auth = firebase.auth();
    } catch (err) {
      console.error('[FB] init error', err);
      setStatus('error', 'Firebase 初始化失敗');
      return;
    }

    // Enable offline persistence (Firestore caches locally for offline use)
    // Use the newer settings-based cache instead of the deprecated enablePersistence()
    try {
      firebase.firestore.setLogLevel('silent');
      _db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
    } catch(_) {}
    _db.enablePersistence({ synchronizeTabs: false }).catch(() => {});

    setStatus('idle', '點擊登入以啟用雲端同步');
    refreshAuthUI(null);

    // Watch for auth state changes
    _auth.onAuthStateChanged(user => {
      _uid = user ? user.uid : null;
      refreshAuthUI(user);
      if (user) {
        loadAll();
      } else {
        setStatus('idle', '點擊登入以啟用雲端同步');
      }
    });
  }

  /* ── Expose public API ───────────────────────────────────── */
  window.FB = { init, signIn, signOut, syncWordData, syncSeenWords, syncPromoted, syncActivity, syncFcDone, logAnswerRecord, logQuizSession, syncStats };

})();
