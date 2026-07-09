# System Architecture

日本語深層學習アプリ is a single-file PWA (`index.html`) served by Firebase Hosting,
with per-user study data in Firestore and all dictionary data shipped as static files.

```mermaid
flowchart TB
    subgraph Client["📱 Client — PWA (index.html, vanilla JS)"]
        UI["UI Sections<br/>單字帳 · 文法 · 辭書 · 學習卡片 · 測驗 · 進捗"]
        Canvas["🎨 Ambient Canvas<br/>light: koi pond + lotus<br/>dark: night lake + 提灯"]
        SRS["SRS Engine<br/>srsLevel 0-5 · nextReview<br/>status: new→learning→review→mastered"]
        TTS["Web Speech API<br/>speakJapanese (ja-JP TTS)"]
        LS[("localStorage<br/>jp_data · jp_seen · zh/ex/kanji caches")]
        SW["Service Worker (sw.js)<br/>shell: SWR, versioned per deploy<br/>dict data: cache-first"]
    end

    subgraph Static["📦 Static Data (shipped with app)"]
        DICT["n1–n5_dict.js<br/>19,002 JMdict words"]
        PITCH["pitch_accent.js<br/>NHK pitch accents"]
        ZHDEFS["data/zh_defs.js<br/>pre-baked zh-TW definitions"]
        GRAMMAR["GRAMMAR array<br/>147 grammar points (inline)"]
    end

    subgraph Firebase["☁️ Firebase"]
        HOST["Hosting<br/>deploy via GitHub Actions"]
        AUTH["Auth<br/>Google Sign-in"]
        FS[("Firestore<br/>users/{uid}/data/*<br/>wordData · seenWords · promoted<br/>activity · stats · answerLog")]
    end

    subgraph External["🌐 External APIs (fallbacks, cached)"]
        TATOEBA["Tatoeba<br/>real example sentences"]
        GTX["Google Translate (gtx)<br/>runtime fallback only"]
        KANJIAPI["kanjiapi.dev<br/>kanji meanings/readings"]
    end

    UI --> SRS --> LS
    UI --> Canvas
    UI --> TTS
    UI --> DICT & PITCH & ZHDEFS & GRAMMAR
    LS <-->|"optimistic write,<br/>debounced 2s flush"| FS
    AUTH --> FS
    SW --> HOST
    UI -.->|例句| TATOEBA
    UI -.->|fallback translate| GTX
    UI -.->|漢字分解| KANJIAPI

    GH["GitHub repo (main)"] -->|"Actions: stamp SW build<br/>+ firebase deploy"| HOST
```

## Key design decisions

| Decision | Rationale |
|---|---|
| Single `index.html` (~19k lines) | Zero build step; deploy = copy file |
| Dictionary as static JS files | Free, offline-capable, no API quota |
| Pre-baked zh-TW translations (`zh_defs.js`) | Removes runtime dependency on the unofficial Google Translate endpoint |
| localStorage = read cache, Firestore = source of truth | Instant reads, optimistic writes, offline resilience |
| Firestore rules: `users/{uid}` self-access only | Web API key is public by design; rules are the security boundary |
| SW shell cache stamped with commit SHA | Every deploy auto-reloads open tabs; no stale UI |
