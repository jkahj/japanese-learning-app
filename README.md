# 日本語深層學習アプリ · Japanese Deep Learning

A single-file PWA for learning Japanese vocabulary and grammar (JLPT N5–N1),
with SRS flashcards, four quiz modes, a JMdict dictionary, pitch accents,
and cloud sync — wrapped in a Crystal Clear Lake theme with swimming koi
(light) and floating lanterns on a night lake (dark).

**Live**: https://japanese-b4d88.web.app

## Features

- 🃏 **SRS flashcards** — daily word batches, listening mode (hear → recall), status tracking new→learning→review→mastered
- 🧪 **Quiz** — 看字 / 聽力 / 克漏字 / 文法 (grammar cloze) modes with 只練錯的 retry
- 📖 **文法** — 147 grammar points with structure, explanation, examples in a detail modal
- 🔍 **辭書** — 19,002-word JMdict dictionary with conjugation tables, pitch accents, 漢字分解 (kanji breakdown), collocations, clickable example sentences
- 📊 **進捗** — activity heatmap, streaks, accuracy stats
- ☁️ **Sync** — Google sign-in, Firestore per-user data, offline-first
- 🌊 **Theme** — animated koi pond (light) / lantern night lake (dark), rendered on canvas

## System Architecture

Full document: [docs/System-Architecture.md](docs/System-Architecture.md)

```mermaid
flowchart TB
    subgraph Client["📱 Client — PWA (index.html, vanilla JS)"]
        UI["UI Sections<br/>單字帳 · 文法 · 辭書 · 學習卡片 · 測驗 · 進捗"]
        Canvas["🎨 Ambient Canvas<br/>light: koi pond · dark: night lake 提灯"]
        SRS["SRS Engine<br/>srsLevel 0-5 · nextReview"]
        LS[("localStorage<br/>read cache")]
        SW["Service Worker<br/>versioned shell cache"]
    end

    subgraph Static["📦 Static Data"]
        DICT["n1–n5_dict.js<br/>19,002 words"]
        PITCH["pitch_accent.js"]
        ZHDEFS["zh_defs.js<br/>pre-baked zh-TW"]
        GRAMMAR["147 grammar points"]
    end

    subgraph Firebase["☁️ Firebase"]
        HOST["Hosting"]
        AUTH["Auth (Google)"]
        FS[("Firestore<br/>users/{uid}/data/*")]
    end

    subgraph External["🌐 External (fallbacks, cached)"]
        TATOEBA["Tatoeba 例句"]
        KANJIAPI["kanjiapi.dev 漢字"]
    end

    UI --> SRS --> LS
    UI --> Canvas
    UI --> DICT & PITCH & ZHDEFS & GRAMMAR
    LS <-->|"optimistic write<br/>debounced flush"| FS
    AUTH --> FS
    SW --> HOST
    UI -.-> TATOEBA & KANJIAPI
    GH["GitHub main"] -->|"Actions deploy"| HOST
```

## Workflow

Full document: [docs/Workflow.md](docs/Workflow.md)

```mermaid
flowchart TB
    START(["Open app"]) --> DAILY["📅 Daily batch<br/>due reviews + new words"]
    DAILY --> FC["🃏 Flashcards<br/>(optional 🎧 listening mode)"]
    DAILY --> QZ["🧪 Quiz<br/>看字 · 聽力 · 克漏字 · 📐文法"]
    FC --> ANS{"知道嗎？"}
    ANS -->|✓| UP["srsLevel +1"]
    ANS -->|✗| DOWN["srsLevel −1"]
    QZ --> SCORE["Answer → SRS ±1<br/>只練錯的 retry"]
    UP & DOWN & SCORE --> SYNC["💾 localStorage → Firestore"]
    SYNC --> PROG["📊 進捗 heatmap · streak"]
    PROG -->|"nextReview due"| DAILY
```

## Development

```bash
# no build step — serve the folder and open index.html
npx serve .

# deploy (automatic on push to main via GitHub Actions)
firebase deploy --only hosting

# rebuild pre-baked translations after dict data changes
python _dev/pretranslate.py
```

Docs: [Database Schema](docs/Database-Schema.md) · [UX Improvements](docs/UX-Improvements.md)
