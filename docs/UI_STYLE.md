# UI style — "Flight Manual" (binding)

The interface is a set of beautifully printed **mission documents** laid over the 3D world: warm paper, black ink, one signal red. It nods to 1970s space-agency graphic standards and Apollo-era flight plans, executed with modern softness — generous type, rounded corners, deep soft shadows, calm motion. It must never look like a generic "sci-fi HUD": no cyan glow, no tiny monospace, no sharp boxes, no neon.

## 1. Palette

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F1ECE2` | card surface |
| `--paper-2` | `#E7E0D3` | inset areas, table stripes, slider track |
| `--ink` | `#1B1B1B` | text, rules, outlines |
| `--ink-2` | `#5A5650` | secondary text |
| `--ink-3` | `#8C867C` | hints, disabled |
| `--signal` | `#D8382C` | the one accent: primary actions, section labels, key highlights |
| `--signal-ink` | `#A92A20` | pressed/hover signal |
| `--blue` | `#2E5AAC` | information, data, links |
| `--amber` | `#D98A12` | warnings |
| `--green` | `#2F8F5B` | ok / done |
| `--night` | `rgba(20,23,29,0.84)` | HUD variant surface |
| `--night-line` | `rgba(241,236,226,0.16)` | HUD hairlines |

Status is never colour-only: every status also has an icon or word.

## 2. Typography

- **Display:** *Instrument Serif* (regular + italic). Titles 34–64 px. Italic for the second word of a title is the signature ("HRI-5 *Imager*", "Mission *Brief*", "First *Light*").
- **UI text:** *Inter* (400/500/600/700) with `font-feature-settings: "tnum"` for all numbers. Body 17 px at 1080p (`clamp(16px, 0.55vw + 9px, 19px)`), never below 15 px anywhere. Big stat numbers 24–40 px Inter 600.
- **Micro labels:** Inter 600, 12–13 px, uppercase, letter-spacing 0.12em, colour `--signal` or `--ink-2`. Use sparingly (section labels, index "03 / 05").
- **Codes:** *IBM Plex Mono* 500 only for part codes and telemetry IDs (e.g. `LUMEN-1`, `T+00:42`). Never for sentences.
- Fallbacks: `Georgia, serif` / `Segoe UI, system-ui, sans-serif` / `Consolas, monospace`.

## 3. Shape, depth and texture

- Radii: cards 18 px, buttons 12 px, chips/inputs 10 px, key caps 8 px. **No sharp corners anywhere.**
- Card shadow: `0 24px 60px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.25)`.
- Paper grain: a very subtle noise texture (inline SVG data URI, ≤ 4 % opacity) on paper surfaces.
- Rules: 1.5 px ink lines separate sections (like a printed form). Thin 1 px `--paper-2` lines inside tables.
- Large documents (brief, readiness check, debrief) carry small print furniture: index number top-right ("03 / 05"), a document code in mono (`FL-DOC-001`), optional corner registration marks. Tasteful, never noisy.
- Line icons only, 1.75 px stroke, round caps (inline SVG). No emoji.

## 4. Two surface variants

1. **Paper card** — focused moments: menus, part info card, mission brief, readiness check, console screens, debrief, intro controls, loading.
2. **Night card** (HUD) — persistent overlays that must not dominate the 3D view: objective tracker, interaction prompt, orbit telemetry, subtitles. Same radii, type and spacing; `--night` surface, paper-coloured text, signal red accents, `backdrop-filter: blur(10px)`.

## 5. Components

- **Button primary:** signal fill, white text, Inter 600 16 px, min height 48 px, padding 0 24 px, radius 12 px. Hover: `--signal-ink` + lift 1 px. Active: scale .97. Focus-visible: 3 px ring `rgba(216,56,44,.35)`.
- **Button secondary:** 1.5 px ink outline, ink text; hover: ink fill sweeps in left→right (220 ms), text turns paper.
- **Button ghost:** ink text with animated underline on hover.
- **Key cap:** 32 px rounded square (radius 8), ink fill, paper letter, Inter 600; on the night card it inverts (paper fill, ink letter).
- **Slider:** 6 px `--paper-2` track with ink fill to the thumb; thumb 20 px ink circle with paper ring; value shown in Inter 600 tabular.
- **Toggle:** 44×26 pill; on = signal.
- **Segmented control:** paper-2 trough, ink selected segment with paper text.
- **Stat block:** micro label above, big number + small unit beside (e.g. **85** W).
- **Meter (mass / budget / battery / memory):** 10 px rounded track, ink fill, red over-limit segment, limit tick with label.
- **Checklist row:** icon (✓ green / ! amber / × red as drawn line icons), title Inter 600, one-line explanation, optional "Fix" hint in `--ink-2`.
- **Toast:** small paper slip from the top-right, slides in and settles.
- **Interaction prompt (night):** key cap + verb + object name ("[E] Pick up · HRI-5 Imager"), centre-bottom, 18 px.
- **Subtitles:** night card, Inter 500 22–26 px, max 2 lines, centred low.

## 6. Motion

- Enter: translateY(16 px) + opacity 0 → 0, 380 ms `cubic-bezier(.2,.8,.2,1)`; children stagger 40 ms.
- Exit: 200 ms ease-in fade + 8 px drop.
- Numbers animate (count) when they change; meters ease to new values (300 ms).
- Checkmarks draw their stroke (240 ms) when an item completes.
- Hover/press feedback within 1 frame; no animation longer than 450 ms on interactive elements.
- `prefers-reduced-motion`: replace movement with fades.

## 7. Sound hooks
Every interactive component calls `ui.sfx('hover' | 'press' | 'confirm' | 'error' | 'open' | 'close')` (soft paper/click sounds supplied in the sound pass; silent until then).

## 8. Layout
- Safe margin 32 px (1080p), 20 px (720p). Objective tracker top-left, prompt centre-bottom, toasts top-right, debug top-right corner only in debug mode.
- Text must be readable at 1280×720 from a normal viewing distance; minimum 15 px.
- One primary button per view.
