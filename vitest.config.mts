import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: [
        'src/index.ts',
        'src/db.ts',
        'src/parser.ts',
        'src/parser/index.ts',
        'src/parser/wire-scan.ts',
        'src/parser/video-entity.ts',
        'src/validate-video.ts',
        'src/player/animator.ts',
        'src/player/index.ts',
        'src/player/render.ts'
      ],
      exclude: ['src/parser/svga.generated.ts'],
      provider: 'v8',
      reporter: ['text'],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95
      }
    },
    include: ['tests/unit/**/*.test.ts']
  }
})
