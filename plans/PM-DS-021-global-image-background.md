# PM-DS-021 Global Image Background Rollout

## Locked Decisions
1. Use local `image-bg.svg` as a background texture for all screens.
2. Effective opacity of the image layer is `30%`.
3. Background layer must apply globally, including app routes and `/designsystem`.
4. Keep existing gradient background and overlay image texture on top of it.
5. No backend/API/schema changes.

## File-Level Implementation Map
1. `web/src/assets/backgrounds/image-bg.svg`
1. Copy source file from root `assets/image-bg.svg` into web-bundled assets.
2. `web/src/index.css`
1. Add fixed full-viewport `body::before` layer with `image-bg.svg` and `opacity: 0.3`.
2. Ensure overlay is non-interactive (`pointer-events: none`).
3. Keep app content above layer by setting `#root` stacking context.

## Acceptance Checklist
1. Background texture is visible on all screens at roughly 30% opacity.
2. Existing gradient remains visible beneath image layer.
3. No interaction regressions from overlay layer.
4. `/` and `/designsystem` both render with the same global texture.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual check:
1. Open `/` and `/designsystem` and confirm background presence and readability.
