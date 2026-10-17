import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  setupFiles: ['<rootDir>/src/test/setup-env.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  // The patched sanitizer uses the ESM-only htmlparser2 family. Production
  // Node supports require(ESM); Jest's CJS VM needs these real modules transformed.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.[cm]?js$': ['ts-jest', { tsconfig: { allowJs: true, isolatedModules: true, module: 'CommonJS', target: 'ES2022' } }],
  },
  transformIgnorePatterns: ['node_modules/(?!(?:.*\/)?(?:htmlparser2|entities|domhandler|domutils|dom-serializer|domelementtype)/)'],
};

export default config;
