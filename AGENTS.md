# Repository Guidelines

## Project Structure & Module Organization

This repository contains a SketchUp AI rendering plugin and a companion Vite editor. The SketchUp extension entry files are `nano_banana_renderer.rb` and `nano_banana_renderer/main.rb`. Ruby service code lives in `nano_banana_renderer/services/`, HTML dialogs in `nano_banana_renderer/ui/`, UI scripts in `nano_banana_renderer/ui/scripts/`, styles in `nano_banana_renderer/ui/styles/`, and icons or bundled assets in `nano_banana_renderer/assets/`. The React/TypeScript editor is under `webapp/src/`, organized by `app`, `editor`, `engine`, `drawing`, and `types`. Project notes and specs are in `docs/` and `skills/`.

## Build, Test, and Development Commands

Run web commands from `webapp/`:

- `npm install` installs Vite, React, TypeScript, ESLint, and runtime dependencies.
- `npm run dev` starts the local Vite development server.
- `npm run build` type-checks with `tsc -b` and builds the production bundle.
- `npm run lint` runs ESLint over the TypeScript/React app.
- `npm run preview` serves the built webapp locally.

For SketchUp plugin testing, copy or sync the Ruby plugin into SketchUp using `./sync-to-sketchup.sh`, then restart SketchUp. Use `ruby test_api.rb` only for the existing API smoke-test flow.

## Coding Style & Naming Conventions

Ruby code uses `# frozen_string_literal: true`, two-space indentation, PascalCase classes/modules, snake_case methods, and constants in upper snake case. Keep SketchUp callbacks and UI bridge methods explicit and small. TypeScript uses ES modules, React function components, PascalCase component files such as `NodeEditor.tsx`, and camelCase functions or variables. Follow the configured ESLint rules in `webapp/eslint.config.js`; avoid introducing unrelated formatting churn.

## Testing Guidelines

There is no formal unit test suite yet. Before submitting changes, run `npm run lint` and `npm run build` for webapp changes. For Ruby plugin changes, validate inside SketchUp, including dialog launch, API-key handling, render flow, and any affected bridge callbacks. Add focused tests or smoke scripts when adding standalone logic.

## Commit & Pull Request Guidelines

Recent commits use short imperative summaries such as `Add ...`, `Fix ...`, and `Revert ...`. Keep commits scoped to one behavior change where practical. Pull requests should include a concise description, affected areas, verification steps, linked issues when available, and screenshots or screen recordings for UI changes.

## Security & Configuration Tips

Do not commit Gemini or Replicate API keys, generated images containing private project data, or local SketchUp paths beyond existing helper scripts. Prefer configuration through the plugin settings UI or local environment-specific files.
