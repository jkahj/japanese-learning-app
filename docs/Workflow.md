# Study Workflow

The daily loop: pick JLPT levels once, then study the same day-batch of words
across flashcards and quizzes. Every answer updates the SRS schedule and syncs
to Firestore.

```mermaid
flowchart TB
    START(["Open app"]) --> WELCOME{"First visit?"}
    WELCOME -->|yes| LEVELS["Select JLPT levels<br/>N5–N1 (multi-select)"]
    WELCOME -->|no| DAILY
    LEVELS --> DAILY["📅 Daily batch<br/>due reviews + new words<br/>(deterministic per day)"]

    DAILY --> FC["🃏 學習卡片 Flashcards"]
    DAILY --> QZ["🧪 測驗 Quiz"]

    subgraph Flashcards
        FC --> MODE{"🎧 listening<br/>mode?"}
        MODE -->|on| LISTEN["Auto-play TTS<br/>word hidden → recall"]
        MODE -->|off| READ["Show word + reading"]
        LISTEN & READ --> FLIP["Flip → meaning"]
        FLIP --> ANS1{"知道嗎？"}
        ANS1 -->|✓ 已記住| UP["srsLevel +1"]
        ANS1 -->|✗ 不熟悉| DOWN["srsLevel −1"]
    end

    subgraph Quiz["Quiz (4 modes)"]
        QZ --> QMODE{"mode"}
        QMODE --> QN["📖 看字<br/>word → meaning"]
        QMODE --> QL["🎧 聽力<br/>audio → meaning"]
        QMODE --> QC["✏️ 克漏字<br/>cloze sentence → word"]
        QMODE --> QG["📐 文法<br/>cloze sentence → pattern"]
        QN & QL & QC --> SCORE["Answer → SRS ±1"]
        QG --> GEXPL["Answer → 查看詳解<br/>(grammar modal)"]
        SCORE --> RESULT["Result + 只練錯的 retry"]
    end

    UP & DOWN & SCORE --> SYNC["💾 localStorage instantly<br/>→ Firestore (debounced 2s)"]
    SYNC --> PROG["📊 進捗<br/>heatmap · streak · stats"]
    PROG -->|"nextReview due"| DAILY
```

## Example sentence pipeline (dict modal 例句)

```mermaid
flowchart LR
    OPEN["Open word modal"] --> CACHE{"cached?"}
    CACHE -->|yes| SHOW["Show examples<br/>(words clickable → dict modal)"]
    CACHE -->|no| TB["Tatoeba search<br/>(direct + CORS proxies)"]
    TB -->|"found"| TR["Translate ja→zh-TW"] --> SHOW
    TB -->|"none / offline"| TPL["Natural template<br/>(POS-aware, conjugated)"]
    TPL --> TR2["Translate full sentence"] --> SHOW
    SHOW --> LS[("localStorage cache")]
```
