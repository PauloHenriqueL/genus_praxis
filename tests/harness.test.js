// Testa o próprio harness. Um erro aqui significa que a suíte inteira pode estar
// mentindo (batendo na OpenAI de verdade, ou escrevendo nos dados reais do dev).

const path = require('path');
const fs = require('fs');
const { app, request, resetData, DATA_DIR, loginAs, authHeader, readData } = require('./helpers');

beforeEach(() => resetData());

describe('harness de teste', () => {
  it('escreve num tmpdir, NUNCA em server/data/ do projeto', () => {
    const real = path.resolve(__dirname, '..', 'server', 'data');
    expect(path.resolve(DATA_DIR)).not.toBe(real);
    expect(path.resolve(DATA_DIR).startsWith(real)).toBe(false);
    expect(DATA_DIR).toMatch(/genus-test-/);
  });

  it('não tem chave de IA — nenhum teste chama a OpenAI de verdade', () => {
    // `dotenv` não sobrescreve variável já definida, então o '' do helpers vence
    // mesmo com um .env real no disco. Se isto quebrar, a suíte passa a gastar
    // dinheiro e a depender da rede.
    expect(process.env.OPENAI_API_KEY).toBe('');
    expect(process.env.ANTHROPIC_API_KEY).toBe('');
  });

  it('roda em NODE_ENV=test (rate limiters desligados)', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    // 25 logins errados seguidos: com o limiter ligado, algum viraria 429.
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/api/login').send({ username: 'admin', password: 'errada' });
      expect(res.status).toBe(401);
    }
  });

  it('resetData isola os testes entre si', async () => {
    const token = await loginAs('admin');
    await request(app).post('/api/freeplay').set(authHeader(token)).send({ name: 'Efêmero' });
    expect(readData('freeplay-characters.json').some((c) => c.name === 'Efêmero')).toBe(true);
    resetData();
    expect(readData('freeplay-characters.json').some((c) => c.name === 'Efêmero')).toBe(false);
  });

  it('o app é importável sem abrir uma porta (require.main guard)', () => {
    // Se o server chamasse listen() no require, a suíte prenderia a porta 3001.
    expect(typeof app).toBe('function');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf-8');
    expect(src).toContain('require.main === module');
  });
});
