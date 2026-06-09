# UX Improvement Report — Japanese Learning PWA

Generated: 2026-06-09

---

## HIGH Priority

| # | Issue | Category | Fix |
|---|-------|----------|-----|
| 1 | Dev button `🔍 翻譯驗證` visible in production | Nav | Hide with `display:none` or gate behind `localStorage.getItem('jp_dev') === '1'` |
| 2 | Card flip affordance unclear — instruction text too muted | SRS Flow | Pulsing CSS animation on first 3 cards; integrate "Tap to reveal" as pill badge inside card front |
| 3 | Keyboard answer (ArrowLeft/Right) fires before card is flipped | SRS Flow | Gate: `if (e.key === 'ArrowLeft' && state.fc.flipped) fcAnswer(false)` |
| 4 | No debounce on Jisho search — fires on every keystroke | Dictionary | Wrap `onBrowseInput` in 300ms debounce |
| 5 | Quiz end shows score only — no wrong-answer review | Quiz | Collect `state.quiz.wrongWords`, show collapsible 需要加強 list with 加入精選 shortcut |
| 6 | Filter panel too tall on mobile (375px) | Mobile | Collapse filters behind "篩選 ▼" toggle on screens < 480px; show summary chip |
| 7 | Zero ARIA attributes across entire page | a11y | Add `role="navigation"`, `aria-selected`, `aria-modal`, `aria-live`, `role="button"` on key elements |
| 8 | No focus trap in modals | a11y | On modal open, focus first focusable element; on close, return focus to trigger |
| 9 | Flashcard `<div>` not keyboard-reachable | a11y | Add `tabindex="0"` and `role="button"` to `#fc-card` |
| 10 | `<html lang="ja">` wrong for Chinese UI | a11y | Change to `lang="zh-TW"`; wrap Japanese vocab in `<span lang="ja">` |

---

## MEDIUM Priority

| # | Issue | Category | Fix |
|---|-------|----------|-----|
| 11 | SRS has no intermediate reinforcement (1 correct → 7-day gap) | SRS Flow | Add level 1=1d, level 2=3d, level 3=7d; or add "Not confident" button that stays at level 1 |
| 12 | Translation spinner has no timeout fallback | SRS Flow | `Promise.race([translate(), timeout(4000)])` — show English on timeout |
| 13 | Browse tab empty on first visit | Dictionary | Render `.browse-state` default block with search icon + example queries |
| 14 | Dictionary shows English only — no Chinese option | Dictionary | Async Chinese translation pass in `openDictModal()` same as flashcards |
| 15 | Quiz loading spinner blocks first question | Quiz | Render first question immediately with English, swap in Chinese as it arrives |
| 16 | No auto-advance after quiz answer | Quiz | Correct: auto-advance after 0.8s; Wrong: show answer for 1.2s then advance. Add countdown bar. |
| 17 | "Retry" quiz repeats same questions | Quiz | Add "只練錯的 (N題)" button that filters to wrong answers |
| 18 | Rapid card flips stack animations | Micro | Guard `flipCard()`: return early if `state.fc.flipped === true` |
| 19 | Grammar `max-height: 600px` clips long cards, janky for short | Micro | Use JS `scrollHeight` measurement; remove inline max-height after transition |
| 20 | Nav horizontal overflow has no scroll edge indicator | Mobile | CSS `::after` fade-edge on `nav`; disappears when fully scrolled |
| 21 | `fc-btn` tap target borderline 44px | Mobile | Set `min-height: 52px` on `.fc-btn` |
| 22 | Header overflows at 375px | Mobile | Hide `.app-sub` < 480px; hide `.app-name` < 360px |
| 23 | `--muted` color fails WCAG AA contrast | a11y | Shift `--muted` to `#8A7060` (already done in redesign) |
| 24 | Welcome screen forces level selection before browsing | Onboarding | Add "先看看" link; default to N5+N4; show callout to set levels later |
| 25 | No SRS explanation for new users | Onboarding | Dismissible first-run tooltip gated by `jp_fc_intro_seen` |
| 26 | Tab switch loses scroll position | Nav | Store scroll position per section in `state`; restore on re-entry |

---

## LOW Priority

| # | Issue | Category | Fix |
|---|-------|----------|-----|
| 27 | "進捗" label is Japanese in a Chinese UI | Nav | Change to "學習進度" or "統計" |
| 28 | 辭書 vs 單字帳 distinction unclear | Nav | Rename "辭書" to "查詞"; add one-line subtitle in empty state |
| 29 | "Load more" shows no remaining word count | SRS Flow | Show "➕ 再學 10 個（剩 243 個未學）" |
| 30 | No toast after "Add to Curated" | Dictionary | Show "已加入精選 ✓" toast (300ms slide-up, 1.5s) bottom-center |
| 31 | Quiz length not user-configurable | Quiz | Add "快速 (10題)" / "標準 (20題)" option before quiz starts |
| 32 | Status badge updates after render, not on answer | Micro | Update badge text/color immediately in `fcAnswer()` before `renderFlashcard()` |
| 33 | No haptic feedback on answer | Micro | `navigator.vibrate?.(50)` correct; `navigator.vibrate?.([80,40,80])` wrong |
| 34 | Empty heatmap (0 activity) looks like blank spreadsheet | Onboarding | Hide heatmap if zero activity; show "開始你的第一次學習！" CTA card |
| 35 | Cycle completion message too small (11px inline span) | Onboarding | Show modal or full-width banner with confetti animation |
