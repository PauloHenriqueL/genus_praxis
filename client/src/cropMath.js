// Geometria do cropper de foto de perfil.
//
// Módulo puro — sem React, sem CSS, sem DOM — para que a matemática do recorte
// possa ser testada direto no node (`tests/crop-math.test.js`). O
// <PhotoCropper> é só a casca de eventos e canvas em volta disto.

export const OUTPUT_SIZE = 320;  // lado do JPEG gerado
export const STAGE_MAX = 280;    // lado do stage circular no desktop
export const STAGE_MIN = 180;    // piso, para não virar um selo
// Modal (26px) + overlay (20px) de padding, dos dois lados.
export const STAGE_CHROME = 92;

/**
 * Lado do stage que cabe numa viewport. 280px fixos estouram um celular de
 * 320px, então o stage encolhe — e toda a matemática abaixo usa este valor,
 * nunca a constante.
 */
export function fitStage(viewportWidth) {
  if (!Number.isFinite(viewportWidth)) return STAGE_MAX;
  return Math.max(STAGE_MIN, Math.min(STAGE_MAX, viewportWidth - STAGE_CHROME));
}

/**
 * Zoom inicial: a menor dimensão da imagem preenche o stage, sem sobrar fundo.
 */
export function baseScale(imageWidth, imageHeight, stageSize) {
  const minSide = Math.min(imageWidth, imageHeight);
  if (!minSide) return 1;
  return stageSize / minSide;
}

/**
 * Ao mudar o tamanho do stage (girar o celular), `scale` e `offset` estão em
 * pixels do stage antigo. Sem reescalá-los pelo mesmo fator, o recorte salvo
 * sairia diferente do que o usuário enquadrou na tela.
 */
export function rescaleForStage({ scale, offset }, prevStage, nextStage) {
  if (!prevStage || prevStage === nextStage) return { scale, offset };
  const k = nextStage / prevStage;
  return { scale: scale * k, offset: { x: offset.x * k, y: offset.y * k } };
}

/**
 * Retângulo a desenhar no canvas de saída (OUTPUT_SIZE × OUTPUT_SIZE), a partir
 * do que está visível no stage. Devolve os argumentos de `ctx.drawImage`.
 */
export function cropRect({ imageWidth, imageHeight, scale, offset, stageSize }) {
  const ratio = OUTPUT_SIZE / stageSize;
  const dw = imageWidth * scale * ratio;
  const dh = imageHeight * scale * ratio;
  const cx = OUTPUT_SIZE / 2 + offset.x * ratio;
  const cy = OUTPUT_SIZE / 2 + offset.y * ratio;
  return { dx: cx - dw / 2, dy: cy - dh / 2, dw, dh };
}

/**
 * Só reabrimos no cropper uma foto que já seja data URL. Um avatar da galeria é
 * servido por `/profiles_icon` sem `Access-Control-Allow-Origin`: num deploy com
 * o front noutra origem (VITE_API_BASE) ele tingiria o canvas e o `toDataURL()`
 * lançaria SecurityError na hora de salvar.
 */
export function canReopenInCropper(photo) {
  return typeof photo === 'string' && photo.startsWith('data:');
}
