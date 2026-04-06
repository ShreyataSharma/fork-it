# Objective
Replace the current "crossed fork & spoon" logo with a modern wordmark where the letter F is drawn as a fork shape, followed by "ork It" in a bold, characterful display font.

# Design Spec

**The F-fork SVG** (inline, `fill="currentColor"`, `text-primary`):
- 3 upward tines (rounded rectangles) sitting across the top
- A horizontal tine-base connecting all three (doubles as the top arm of the F)
- The leftmost tine continues downward as the handle (= left vertical stroke of the F)
- A shorter middle crossbar extends right from the handle at mid-height (= middle arm of the F)
- Net shape: unmistakably a fork AND unmistakably an F

**"ork It" text**: rendered in **Syne** (Google Font — bold, geometric, modern, memorable) loaded via `@import` in `index.css`. The F-fork SVG and the "ork It" span sit on the same baseline as one cohesive wordmark.

**Removal**: the existing 12-element crossed-fork-spoon SVG is deleted.

# Tasks

### T001: Import Syne font from Google Fonts
- **Blocked By**: []
- **Details**:
  - In `client/src/index.css`, prepend `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');`
  - Add utility class `.font-syne { font-family: 'Syne', sans-serif; }` to the same file
  - Files: `client/src/index.css`

### T002: Replace logo with F-fork SVG wordmark
- **Blocked By**: [T001]
- **Details**:
  - In `client/src/pages/home.tsx`, replace the entire logo block (icon SVG + `<h1>Fork It</h1>`) with a single new element containing:
    1. An inline SVG drawing the F-fork shape (3 tines + tine base + handle + middle crossbar), in `text-primary`
    2. A `<span>` with "ork It" in Syne 800 weight, same primary colour, sized and spaced to sit flush with the SVG as one wordmark
  - Remove `Utensils` from the lucide-react import if it's unused elsewhere
  - Files: `client/src/pages/home.tsx`
  - Acceptance: Logo renders as a single cohesive wordmark; F clearly reads as a fork; font is Syne Bold
