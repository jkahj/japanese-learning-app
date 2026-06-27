# Japanese Learning App — Work Log

## Completed

### 1. Initial App (index.html)
- Built a self-contained single-file web app
- **30 curated vocabulary words** (N5/N4) with:
  - Kanji, hiragana, romaji, pitch accent visualization
  - Full conjugation tables (verb & adjective)
  - Chinese definitions + example sentences
  - Collocations, nuance comparisons (熱い vs 暑い, 探す vs 捜す, etc.)
  - Transitive/intransitive pairs (閉める ↔ 閉まる)
  - SRS (Spaced Repetition System) flashcard mode
  - Multiple-choice quiz
  - Progress dashboard
  - Personal notes (saved to localStorage)
  - Status tracking (未學 / 學習中 / 複習 / 已精通)

### 2. JMdict Dictionary Integration
- Cloned `yomidevs/jmdict-yomitan` from GitHub
- Downloaded `JMdict_english.zip` from GitHub releases (~15MB)
- Extracted and processed all 52 term banks
- Extracted **19,049 common words** with frequency filtering
- Created per-JLPT-level JS files for dynamic loading (file:// compatible):

| File | Words | Size |
|------|-------|------|
| `data/n5_dict.js` | 2,985 | 212 KB |
| `data/n4_dict.js` | 8,312 | 580 KB |
| `data/n3_dict.js` | 3,887 | 269 KB |
| `data/n2_dict.js` | 2,643 | 186 KB |
| `data/n1_dict.js` | 1,175 | 83 KB |

### 3. Level Selection Screen ✅ (Completed 2026-04-20)
- Full-screen welcome overlay shown on first launch
- 5 clickable level cards (N5 → N1), multi-select allowed
- Each card shows: level name, approximate word count, typical topics
- Selection saved to `localStorage` as `jp_levels`
- On returning visits, welcome screen is skipped automatically
- "Change Level" button in header returns to level selection
- Vocabulary and grammar sections filter content based on selected levels

### 4. Grammar Section ✅ (Completed 2026-04-20)
- New **📖 文法** tab added to navigation
- **30 grammar points** total:
  - **N5** (15 points): は〜です, が/は, を, に, で, と, から〜まで, も, の, ています, てください, たい, ましょう, から（because）, てもいいですか/てはいけない
  - **N4** (15 points): てしまう, てみる, てあげる/もらう/くれる, たら, ば, ながら, ために, かもしれない, はずだ, つもり, ようだ/みたいだ, そうだ（hearsay）, てはいけない, ことができる, ようにする
- Accordion-style expandable cards
- Filter bar to show N5 / N4 / All, respects selected level from welcome screen
- Each card: pattern badge → title → structure → meaning → explanation → examples → notes

### 5. Dictionary Lookup Tab ✅ (Completed 2026-04-20)
- New **🔍 辭書** tab added to navigation
- Search box supports kanji, hiragana, romaji, and English keyword search
- Dictionaries loaded on-demand via `<script>` tag injection (works on `file://`)
- Level chips show load status: idle → loading (spinner) → ready (word count)
- Relevance-scored results (exact match → starts-with → contains → definition match)
- Results capped at 60, showing word + reading + JLPT badge + up to 3 English definitions
- Click any result to open full detail modal (all definitions, POS, JLPT)
- ESC key closes the modal
- Retry button for failed dictionary loads

---

## File Structure

```
Japanese/
├── index.html              ← Main app (all features complete)
├── Work Log.md             ← This file
├── process_jmdict.py       ← Script to regenerate dictionary files
├── Japanese_Learning_App_Plan.docx
├── jmdict_english.zip      ← Downloaded dictionary source
├── jmdict-yomitan/         ← Cloned GitHub repo (source scripts only)
├── jmdict_extracted/       ← Extracted dictionary JSON files (52 term banks)
└── data/
    ├── dictionary.json     ← Full 19,049-word dictionary (1.96 MB)
    ├── n5.json / n4.json / n3.json / n2.json / n1.json   ← Per-level (raw)
    └── n5_dict.js / n4_dict.js / n3_dict.js / n2_dict.js / n1_dict.js  ← For app use
```

---

## Possible Future Enhancements

- **Add to Study Deck**: promote a JMdict word into the curated vocab list with custom Chinese definition
- **Grammar quiz**: test grammar patterns with fill-in-the-blank or multiple choice
- **Sentence mining**: paste a Japanese sentence and look up unknown words inline
- **Audio/pitch audio**: play pitch accent audio clips
- **Export/import**: backup and restore progress data (SRS intervals, notes, status)
- **N3–N1 grammar**: expand grammar section beyond current N5/N4 coverage
