/* 人脸检测封装：face-api.js TinyFaceDetector */
window.Detector = (function () {
  'use strict';

  let ready = false;
  let busy = false;
  let lastError = null;

  async function init() {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri('vendor/models');
      ready = true;
    } catch (e) {
      lastError = e;
      console.error('[detector] load failed', e);
    }
    return ready;
  }

  const options = () => new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.32
  });

  /**
   * @param {HTMLCanvasElement} canvas 抽帧用的小画布
   * @returns {Promise<Object|null>} 归一化人脸框
   */
  async function detect(canvas) {
    if (!ready || busy || !canvas || !canvas.width) return null;
    busy = true;
    try {
      const res = await faceapi.detectSingleFace(canvas, options());
      if (!res) return null;
      const b = res.box;
      return {
        x: b.x / canvas.width,
        y: b.y / canvas.height,
        w: b.width / canvas.width,
        h: b.height / canvas.height,
        score: res.score
      };
    } catch (e) {
      return null;
    } finally {
      busy = false;
    }
  }

  return {
    init,
    detect,
    get ready() { return ready; },
    get error() { return lastError; }
  };
})();
