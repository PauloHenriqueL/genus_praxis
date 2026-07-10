import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes do servidor são CommonJS (require) — não converter para ESM.
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: true, // describe/it/expect globais, compatível com CommonJS
    testTimeout: 15000,
    // Cada arquivo roda num processo próprio: o server/index.js é um singleton
    // (require cache + DATA_DIR resolvido no boot), então compartilhar processo
    // faria um arquivo enxergar o estado do outro.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
});
