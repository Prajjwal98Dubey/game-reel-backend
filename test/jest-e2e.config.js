/** End-to-end tests: the full Nest app against a real Postgres (see test/support/database.ts). */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: String.raw`test/.*\.e2e-spec\.ts$`,
  // 151002: ts-jest's advisory about node16 module mode; it does not affect results.
  transform: { [String.raw`^.+\.ts$`]: ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }] },
  testEnvironment: 'node',
  // Generated Prisma client imports './x.js' (node16 resolution); map to the .ts sources.
  moduleNameMapper: { [String.raw`^(\.{1,2}/.*)\.js$`]: '$1' },
  testTimeout: 120_000,
};
