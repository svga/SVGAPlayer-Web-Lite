<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SVGAPlayer-Web-Lite is a lightweight (< 60KB, gzip < 18KB) SVGA animation player for web, optimized for modern mobile browsers (Android 10+, iOS 14+). It uses WebWorker for parsing, OffscreenCanvas/ImageBitmap for rendering, and IndexedDB for caching.

**Key Limitations:** Does NOT support SVGA 1.x format or audio playback.

## Common Commands

```bash
# Development with hot reload (serves __test__/ directory)
yarn test

# Production build (ESM-only)
yarn build

# Type checking
yarn type:check

# Linting
yarn format:check
```

## Architecture

The codebase follows a three-layer architecture:

### 1. Parser Layer (`src/parser.ts`, `src/parser/`)
Downloads and parses SVGA files using WebWorker. Uses protobuf deserialization with Zlib decompression. Converts raw Movie data to Video entity format.

**Key Detail:** The parser worker is built as a module file and loaded via `new Worker(new URL('./parser.worker.js', import.meta.url), { type: 'module' })`.

### 2. Player Layer (`src/player/`)
- **Player** (`index.ts`): Main controller with canvas management, configuration, and event callbacks
- **Animator** (`animator.ts`): Frame-based animation timing with WebWorker fallback to avoid browser throttling
- **Renderer** (`render.ts`): Pure functional Canvas2D drawing engine for sprites, shapes, paths

### 3. Storage Layer (`src/db.ts`)
IndexedDB wrapper for caching parsed SVGA data to avoid redundant downloads/parsing.

## Data Flow

```
SVGA URL → Parser.load() → WebWorker download → Zlib decompression
→ Protobuf deserialization → Movie → VideoEntity conversion
→ Player.mount() → Preload images to bitmapsCache
→ Player.start() → Animator.start() → requestAnimationFrame loop
→ Renderer.render() → Canvas 2D drawing
```

## Type System

All types defined in `src/types.ts` (306 lines). Key types:
- `Movie`: Raw protobuf data structure
- `Video`: Player-ready video entity
- `VideoFrame`, `VideoSprite`: Animation data
- `VideoFrameShape`: Shape types (bezier, rect, ellipse)
- `Transform`: Affine transform matrix
- `PlayerConfigOptions`, `ParserConfigOptions`

## Build System

**Tool:** Rollup with TypeScript

**Outputs:**
- `dist/index.js` - ES modules
- `dist/parser.worker.js` - Module worker entry

## Code Conventions

- ESLint: `standard-with-typescript`
- TypeScript strict mode enabled
- 2-space indentation, semicolons required, single quotes
- Class-based components with PascalCase
- camelCase for methods/variables
- Pure functions for rendering logic

## Known Issues

- Firefox OffscreenCanvas cannot clear history content (workaround: recreate canvas)
- Audio-prefixed images are skipped during parsing
- Empty path shapes can cause playback issues (recently fixed)

## Git Hooks

- Pre-commit: Type checking + ESLint via lint-staged
- Commit-msg: Commitlint (conventional commits)

## Dependencies

- Custom forks of `protobufjs` and `zlibjs` for ESM compatibility
- Babel for transpilation to target Android 10+ / iOS 14+
