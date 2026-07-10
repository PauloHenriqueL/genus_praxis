// Geometria do cropper de foto de perfil (client/src/cropMath.js).
//
// Módulo puro — sem React, sem canvas, sem DOM — por isso roda no ambiente node
// da suíte. O <PhotoCropper> é só a casca de eventos em volta disto.

const {
  OUTPUT_SIZE, STAGE_MAX, STAGE_MIN, STAGE_CHROME,
  fitStage, baseScale, rescaleForStage, cropRect, canReopenInCropper,
} = require('../client/src/cropMath.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

describe('fitStage', () => {
  it('usa o tamanho cheio no desktop', () => {
    for (const w of [1440, 768, STAGE_MAX + STAGE_CHROME]) {
      expect(fitStage(w)).toBe(STAGE_MAX);
    }
  });

  // 280px fixos (o valor do All_OS) estouram um celular de 320px: o modal e o
  // overlay comem 92px de padding. Este é o bug que a função existe para evitar.
  it('encolhe no celular, cabendo na viewport', () => {
    for (const w of [320, 360, 390]) {
      const s = fitStage(w);
      expect(s).toBeLessThanOrEqual(w - STAGE_CHROME);
      expect(s).toBeLessThanOrEqual(STAGE_MAX);
    }
    expect(fitStage(320)).toBe(320 - STAGE_CHROME);
  });

  it('nunca desce do piso, mesmo numa viewport absurda', () => {
    for (const w of [0, 100, 200]) expect(fitStage(w)).toBe(STAGE_MIN);
  });

  it('sem viewport (SSR) devolve o tamanho de desktop', () => {
    for (const v of [NaN, undefined, null, 'abc']) expect(fitStage(v)).toBe(STAGE_MAX);
  });
});

describe('baseScale', () => {
  it('faz a menor dimensão preencher o stage (paisagem e retrato)', () => {
    expect(baseScale(1000, 600, 280)).toBeCloseTo(280 / 600, 10);
    expect(baseScale(600, 1000, 280)).toBeCloseTo(280 / 600, 10);
    expect(baseScale(500, 500, 280)).toBeCloseTo(280 / 500, 10);
  });

  it('imagem degenerada não gera NaN/Infinity', () => {
    expect(baseScale(0, 100, 280)).toBe(1);
    expect(baseScale(100, 0, 280)).toBe(1);
  });
});

describe('cropRect: o enquadramento no canvas de saída', () => {
  const stage = 280;

  it('no zoom inicial, a imagem cobre exatamente o quadrado de saída', () => {
    for (const [w, h] of [[1000, 600], [600, 1000], [800, 800]]) {
      const r = cropRect({
        imageWidth: w, imageHeight: h,
        scale: baseScale(w, h, stage), offset: { x: 0, y: 0 }, stageSize: stage,
      });
      // A menor dimensão desenhada bate com OUTPUT_SIZE — sem faixa branca.
      expect(Math.min(r.dw, r.dh)).toBeCloseTo(OUTPUT_SIZE, 6);
      expect(r.dw).toBeGreaterThanOrEqual(OUTPUT_SIZE - 1e-6);
      expect(r.dh).toBeGreaterThanOrEqual(OUTPUT_SIZE - 1e-6);
    }
  });

  it('centraliza quando não há offset', () => {
    const r = cropRect({
      imageWidth: 1000, imageHeight: 600,
      scale: baseScale(1000, 600, stage), offset: { x: 0, y: 0 }, stageSize: stage,
    });
    // A sobra horizontal é igual dos dois lados; a vertical é zero.
    expect(near(r.dx + (r.dw - OUTPUT_SIZE) / 2, 0)).toBe(true);
    expect(near(r.dy, 0)).toBe(true);
  });

  it('o offset desloca o recorte na proporção do stage', () => {
    const base = { imageWidth: 800, imageHeight: 800, scale: 0.35, stageSize: stage };
    const a = cropRect({ ...base, offset: { x: 0, y: 0 } });
    const b = cropRect({ ...base, offset: { x: 14, y: -7 } });
    const ratio = OUTPUT_SIZE / stage;
    expect(b.dx - a.dx).toBeCloseTo(14 * ratio, 10);
    expect(b.dy - a.dy).toBeCloseTo(-7 * ratio, 10);
  });

  it('zoom abaixo do ajuste deixa a imagem menor que o quadrado (fundo branco)', () => {
    const r = cropRect({
      imageWidth: 1000, imageHeight: 600, scale: 0.1, offset: { x: 0, y: 0 }, stageSize: stage,
    });
    expect(r.dh).toBeLessThan(OUTPUT_SIZE);
  });

  it('stage menor não muda o recorte se o scale acompanhar', () => {
    // Mesmo enquadramento, expresso em dois stages diferentes.
    const img = { imageWidth: 1000, imageHeight: 600 };
    const big = { ...img, scale: baseScale(1000, 600, 280), offset: { x: 0, y: 0 }, stageSize: 280 };
    const smallView = rescaleForStage({ scale: big.scale, offset: big.offset }, 280, 228);
    const small = { ...img, ...smallView, stageSize: 228 };

    const a = cropRect(big);
    const b = cropRect(small);
    for (const k of ['dx', 'dy', 'dw', 'dh']) expect(near(a[k], b[k])).toBe(true);
  });
});

// O bug: girar o celular encolhe o stage. `scale` e `offset` estão em pixels do
// stage, então sem reescalar o recorte SALVO sairia diferente do enquadrado.
describe('rescaleForStage: girar o celular preserva o enquadramento', () => {
  const img = { imageWidth: 1000, imageHeight: 600 };

  function cropAt(stageSize, view) {
    return cropRect({ ...img, ...view, stageSize });
  }

  it('o recorte é idêntico antes e depois do resize', () => {
    const prev = 280;
    const view = { scale: baseScale(1000, 600, prev), offset: { x: 30, y: -12 } };
    const before = cropAt(prev, view);

    for (const next of [228, 268, 180, 280]) {
      const after = cropAt(next, rescaleForStage(view, prev, next));
      for (const k of ['dx', 'dy', 'dw', 'dh']) {
        expect(near(before[k], after[k]), `${k} divergiu em ${prev}→${next}`).toBe(true);
      }
    }
  });

  it('é reversível: encolher e voltar devolve o mesmo enquadramento', () => {
    const view = { scale: 0.42, offset: { x: 11, y: -5 } };
    const shrunk = rescaleForStage(view, 280, 228);
    const back = rescaleForStage(shrunk, 228, 280);
    expect(near(back.scale, view.scale)).toBe(true);
    expect(near(back.offset.x, view.offset.x)).toBe(true);
    expect(near(back.offset.y, view.offset.y)).toBe(true);
  });

  it('sem mudança de tamanho, a view não muda', () => {
    const view = { scale: 0.42, offset: { x: 11, y: -5 } };
    expect(rescaleForStage(view, 280, 280)).toEqual(view);
  });

  it('prevStage zerado não gera divisão por zero (nem NaN)', () => {
    const view = { scale: 0.42, offset: { x: 11, y: -5 } };
    const out = rescaleForStage(view, 0, 280);
    expect(out).toEqual(view);
    expect(Number.isFinite(out.scale)).toBe(true);
  });

  it('não muta a view recebida', () => {
    const view = { scale: 0.42, offset: { x: 11, y: -5 } };
    rescaleForStage(view, 280, 228);
    expect(view).toEqual({ scale: 0.42, offset: { x: 11, y: -5 } });
  });

  // Se alguém "simplificar" removendo o rescale, este teste falha.
  it('NÃO reescalar corromperia o recorte', () => {
    const prev = 280, next = 228;
    const view = { scale: baseScale(1000, 600, prev), offset: { x: 0, y: 0 } };
    const correto = cropAt(next, rescaleForStage(view, prev, next));
    const semRescale = cropAt(next, view); // o bug
    expect(near(correto.dh, semRescale.dh)).toBe(false);
  });
});

// Um avatar da galeria vem de `/profiles_icon`, servido sem
// `Access-Control-Allow-Origin`. Reabri-lo no cropper tingiria o canvas e o
// `toDataURL()` lançaria SecurityError na hora de salvar.
describe('canReopenInCropper', () => {
  it('aceita data URL', () => {
    expect(canReopenInCropper('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('recusa caminho da galeria e URL absoluta', () => {
    expect(canReopenInCropper('/profiles_icon/jung.png')).toBe(false);
    expect(canReopenInCropper('https://cdn.exemplo.com/a.png')).toBe(false);
  });

  it('recusa vazio e não-string', () => {
    for (const v of ['', null, undefined, 42, {}, []]) {
      expect(canReopenInCropper(v)).toBe(false);
    }
  });
});
