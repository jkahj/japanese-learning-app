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

   PUBLIC API  (window.FB)
   ───────────────────────
   FB.init()                   call once on DOMContentLoaded
   FB.signIn()                 trigger Google popup
   FB.signOut()                sign out current user
   FB.syncWordData(userData)   call after every setWD()
   FB.syncSeenWords(seenData)  call after jp_seen_v2 update
   FB.syncPromoted(arr)        call after savePromotedList()

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
      const [wordSnap, seenSnap, promotedSnap] = await Promise.all([
        docRef('wordData').get(),
        docRef('seenWords').get(),
        docRef('promoted').get(),
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
  window.FB = { init, signIn, signOut, syncWordData, syncSeenWords, syncPromoted };

})();
