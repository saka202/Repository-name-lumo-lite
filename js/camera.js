/* 摄像头控制 */
window.Camera = (function () {
  'use strict';

  let stream = null;
  let facing = 'environment';

  function constraints() {
    const portrait = window.innerHeight >= window.innerWidth;
    return {
      audio: false,
      video: portrait
        ? {
            // 竖着拿：直接要竖幅，避免宽幅流被竖屏 cover 裁掉一半视野
            facingMode: { ideal: facing },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 1080 / 1920 },
            frameRate: { ideal: 30 }
          }
        : {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 1920 / 1080 },
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
