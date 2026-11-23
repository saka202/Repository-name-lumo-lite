/* 摄像头控制 */
window.Camera = (function () {
  'use strict';

  let stream = null;
  let facing = 'environment';

  function constraints() {
    return {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        // 4:3 是传感器全视野，用它能拿到和原生相机 1x 一样的视场角
        width: { ideal: 1440 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 1440 / 1080 },
        frameRate: { ideal: 30 }
      }
    };
  }

  async function start(videoEl) {
    stop();
    stream = await navigator.mediaDevices.getUserMedia(constraints());
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', '');
    await videoEl.play().catch(() => {});
    return stream;
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  async function flip(videoEl) {
    facing = facing === 'environment' ? 'user' : 'environment';
    await start(videoEl);
    return facing;
  }

  function track() {
    return stream ? stream.getVideoTracks()[0] : null;
  }

  return {
    start, stop, flip, track,
    get facing() { return facing; }
  };
})();
