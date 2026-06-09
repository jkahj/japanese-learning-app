# Database Schema — Japanese Learning PWA

Generated: 2026-06-09

---

## Current State: localStorage Keys

| Key | Type | What it stores | Synced to Firestore? |
|-----|------|----------------|----------------------|
| `jp_data` | map | SRS progress per word (status, srsLevel, note, nextReview) | ✅ as `wordData` |
| `jp_promoted` | array | User-curated words (full VocabEntry objects) | ✅ as `promoted` |
| `jp_seen_v2` | object | Seen-word rotation state (lvKey, seen[], cycle) | ✅ as `seenWords` |
| `jp_daily` | object | Today's flashcard word list (ephemeral) | ❌ local only |
| `jp_fc_done` | object | Today's flashcard session completion state | ✅ as `fcDone` |
| `jp_activity` | map | Heatmap counts per date ("YYYY-MM-DD": number) | ✅ as `activity` |
| `jp_stats` | object | totalReviewed, totalCorrect, streaks | ✅ as `stats` |
| `jp_levels` | array | Selected JLPT levels (e.g. ["N5","N4"]) | ❌ **missing — should sync** |
| `jp_theme` | string | UI theme ("dark"/"light") | ❌ intentionally local (per-device) |
| `jp_zh_defs` | map | English→Chinese translation cache | ❌ intentionally local |
| `jp_zh_ver` | string | Cache-bust version key | ❌ intentionally local |
| `jp_img_cache` | map | Unsplash image URL cache per word | ❌ intentionally local |
| `jp_ex_v3` | map | Gemini example sentence cache per word | ❌ intentionally local |
| `pwa_nudge_dismissed` | string | Whether user dismissed PWA install nudge | ❌ intentionally local |

**Gaps in current sync:**
- `answerLog` and `quizSessions` are **write-only** — data goes to Firestore but `loadAll()` never reads them back, making them useless for analytics inside the app.
- `jp_levels` is never synced — multi-device users lose their level selection.

---

## Proposed Firestore Schema

```
Collection: users/{userId}
  Fields:
    - displayName:     string       // from Google Auth
    - email:           string       // from Google Auth
    - photoURL:        string       // from Google Auth
    - createdAt:       timestamp    // first sign-in
    - lastActiveDate:  string       // "YYYY-MM-DD"
    - selectedLevels:  string[]     // ["N5","N4"] — NEW: sync this field


Collection: users/{userId}/data/wordData   (single document)
  Fields:
    - [wordId]: map {
        status:     "new" | "learning" | "review" | "mastered"
        srsLevel:   number  (0–5)
        nextReview: string  ("YYYY-MM-DD")
        note:       string
      }
  Notes:
    - wordId format: "d_<kanji>" for dict words, numeric for curated, "jisho_<slug>" for Jisho
    - 2-second debounced writes via queueWrite()
    - ⚠️ Risk: may hit Firestore 1MB doc limit for power users (thousands of words)
    - Future migration: move to users/{userId}/words/{wordId} subcollection


Collection: users/{userId}/data/seenWords  (single document)
  Fields:
    - lvKey:  string    // "N5,N4"
    - seen:   string[]  // word keys shown in current cycle
    - cycle:  number    // rotation cycle number (starts at 1)


Collection: users/{userId}/data/promoted   (single document)
  Fields:
    - arr: VocabEntry[] {
        id, kanji, hiragana, romaji, pitch, posCode, pos,
        meanings, jlpt, conj, transIntrans, examples,
        collocations, nuance, antonyms, similar, tags
      }


Collection: users/{userId}/data/activity   (single document)
  Fields:
    - ["YYYY-MM-DD"]: number   // review count for that date
  Notes:
    - Higher count wins on merge (offline reviews never lost)
    - Future: rotate to monthly sub-documents if map grows very large


Collection: users/{userId}/data/fcDone    (single document)
  Fields:
    - date:        string    // "YYYY-MM-DD"
    - shownCount:  number
    - allShownIds: string[]


Collection: users/{userId}/data/stats     (single document)
  Fields:
    - totalReviewed:   number
    - totalCorrect:    number
    - longestStreak:   number
    - currentStreak:   number
    - lastActiveDate:  string


Collection: users/{userId}/data/answerLog  (single document — append-only)
  Fields:
    - ["YYYY-MM-DD"]: {
        wId: string    // word ID
        r:   "c"|"w"  // correct / wrong
        lb:  number   // srsLevel before
        la:  number   // srsLevel after
        src: "fc"|"quiz"
        t:   string   // "HH:MM:SS"
      }[]
  Notes:
    - Written via arrayUnion (immediate, not debounced)
    - ⚠️ Currently NOT read back in loadAll() — add to fix analytics blind spot
    - Future: rotate to users/{userId}/answerLog/{YYYY-MM} monthly documents


Collection: users/{userId}/data/quizSessions  (single document — append-only)
  Fields:
    - ["YYYY-MM-DD"]: {
        score: number
        total: number
        pct:   number  // 0–100
        t:     string  // "HH:MM:SS"
      }[]
  Notes:
    - ⚠️ Currently NOT read back in loadAll() — add to enable quiz history UI
```

---

## Migration Action Items

### Must Do
1. **Sync `jp_levels`** — add `selectedLevels` to `users/{userId}` doc. Write on level change; read on sign-in. Without this, multi-device users repeat level setup.
2. **Read `answerLog` on loadAll()** — currently write-only. Add to `Promise.all` in `loadAll()` to enable per-word review history display.
3. **Read `quizSessions` on loadAll()** — same issue. Enables quiz history / performance trends.

### Should Do
4. **Add document size guard** — before writing `wordData`, check estimated size. If > 800KB, log a warning (or migrate word-by-word to subcollection).
5. **Handle `jp_daily` sync** — optional but enables seamless device switching mid-session. Add as `users/{userId}/data/dailyCache` with date TTL check on read.

### Keep Local (No Change)
- `jp_theme`, `jp_zh_defs`, `jp_zh_ver`, `jp_img_cache`, `jp_ex_v3`, `pwa_nudge_dismissed`

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      // User can only read/write their own data
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;

      match /data/{docName} {
        allow read, write: if request.auth != null
                           && request.auth.uid == userId;

        // Prevent documents exceeding ~900KB (Firestore 1MB limit)
        allow write: if request.resource.size() < 900000;
      }
    }

    // Deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Hardened wordData validation (optional, recommended)
```javascript
match /data/wordData {
  allow write: if request.auth.uid == userId
    && request.resource.data.keys().hasOnly(
         request.resource.data.keys()  // allow any word IDs
       )
    // Each entry must have valid status
    && request.resource.data.values().all(v,
         v.status in ["new","learning","review","mastered"]
         && v.srsLevel is int
         && v.srsLevel >= 0 && v.srsLevel <= 5
       );
}
```
