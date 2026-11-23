/* 主逻辑 */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));

  const video = $('#video');
  const overlayCanvas = $('#overlay');
  const adviceEl = $('#advice');

  const state = {
    scene: 'portrait',
    mode: 'guide',
    planId: 'A',
    grid: 'thirds',
    roll: 0,
    zoom: 1,
    hardwareZoom: false,
    zoomHintShown: false,
    faceRaw: null,
    faceSmooth: null,
    faceScreen: null,
    advice: null,
    target: null,
    skyRatio: null,
    running: false,
    lastDetect: 0,
    lastAnalyze: 0,
    missCount: 0,
    detectCanvas: null,
    planCrops: [],
    lastThumb: 0,
    wakeLock: null
  };

  /* ---------------- 坐标 ---------------- */

  function canvasSize() {
    const r = overlayCanvas.getBoundingClientRect();
    return { cw: r.width, ch: r.height };
  }

  function videoToScreenNorm(n) {
    const { cw, ch } = canvasSize();
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return n;
    const zoom = state.hardwareZoom ? 1 : state.zoom;
    const scale = Math.max(cw / vw, ch / vh) * zoom;
    const dw = vw * scale, dh = vh * scale;
    const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    return {
      x: (ox + n.x * vw * scale) / cw,
      y: (oy + n.y * vh * scale) / ch,
      w: (n.w * vw * scale) / cw,
      h: (n.h * vh * scale) / ch
    };
  }

  /* ---------------- 变焦 ---------------- */

  async function tryHardwareZoom(z) {
    const track = Camera.track();
    if (!track) return false;
    let caps = null;
    try { caps = track.getCapabilities ? track.getCapabilities() : null; } catch (e) { return false; }
    if (!caps || !caps.zoom) return false;
    const { min, max } = caps.zoom;
    const target = z < min ? min : Math.min(max, z);
    try {
      await track.applyConstraints({ advanced: [{ zoom: target }] });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function setZoom(z) {
    if (state.zoom === z) return;
    state.zoom = z;
    $$('.zoom').forEach(b => b.classList.toggle('active', Number(b.dataset.zoom) === z));

    const hw = await tryHardwareZoom(z);
    state.hardwareZoom = hw;
    video.style.transform = hw ? 'none' : 'scale(' + z + ')';

    if (!hw && z > 1 && !state.zoomHintShown) {
      state.zoomHintShown = true;
      toast('这台机器的浏览器不支持硬件变焦，用的是画面裁切，放大后画质会降一点', 3600);
    }
  }

  function resetZoom() {
    state.zoom = 1;
    state.hardwareZoom = false;
    video.style.transform = 'none';
    $$('.zoom').forEach(b => b.classList.toggle('active', Number(b.dataset.zoom) === 1));
  }

  function smooth(prev, next, a) {
    if (!prev) return next;
    if (!next) return prev;
    const k = a == null ? 0.4 : a;
    return {
      x: prev.x + (next.x - prev.x) * k,
      y: prev.y + (next.y - prev.y) * k,
      w: prev.w + (next.w - prev.w) * k,
      h: prev.h + (next.h - prev.h) * k
    };
  }

  /* ---------------- 检测 ---------------- */

  function grabDetectFrame() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    if (!state.detectCanvas) state.detectCanvas = document.createElement('canvas');
    const dc = state.detectCanvas;
    const targetW = 480;
    dc.width = targetW;
    dc.height = Math.round(targetW * vh / vw);
    const g = dc.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, dc.width, dc.height);
    return dc;
  }

  async function runDetect() {
    if (state.scene !== 'portrait') { state.faceRaw = null; return; }
    const dc = grabDetectFrame();
    if (!dc) return;
    state.faceRaw = await Detector.detect(dc);
  }

  // 建筑模式：估一下上三分之一里"天空/亮面"占多少
  function analyzeFrame() {
    const dc = state.detectCanvas;
    if (!dc) return;
    const g = dc.getContext('2d');
    const w = dc.width, h = dc.height;
    const topH = Math.max(1, Math.floor(h * 0.34));
    let img;
    try { img = g.getImageData(0, 0, w, topH); } catch (e) { return; }
    const d = img.data;
    let sky = 0, total = 0;
    for (let i = 0; i < d.length; i += 16) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const lum = (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
      total++;
      if (lum > 0.55 && sat < 0.38) sky++;
    }
    state.skyRatio = sky / Math.max(1, total);
  }

  /* ---------------- 渲染 ---------------- */

  function updateAdvice() {
    const a = Advisor.advise({
      face: state.faceScreen,
      planId: state.planId,
      roll: state.roll,
      scene: state.scene,
      analysis: { skyRatio: state.skyRatio }
    });
    state.advice = a;
    state.target = a.target || null;

    if (adviceEl.textContent.trim() !== a.text) {
      adviceEl.firstElementChild.textContent = a.text;
      adviceEl.classList.remove('ok', 'warn');
      if (a.level === 'good') adviceEl.classList.add('ok');
      else if (a.level === 'warn') adviceEl.classList.add('warn');
    }
  }

  function render() {
    const t = performance.now();

    if (state.scene === 'portrait') {
      if (state.faceRaw) {
        state.missCount = 0;
        state.faceSmooth = smooth(state.faceSmooth, videoToScreenNorm(state.faceRaw), 0.45);
        state.faceScreen = state.faceSmooth;
      } else {
        state.missCount++;
        if (state.missCount > 6) {
          state.faceSmooth = null;
          state.faceScreen = null;
        }
      }
    } else {
      state.faceScreen = null;
      state.faceSmooth = null;
    }

    updateAdvice();

    Overlay.draw({
      face: state.faceScreen,
      guide: Advisor.plan(state.scene, state.planId).guide,
      grid: state.grid,
      roll: state.roll,
      advice: state.advice,
      scene: state.scene,
      skyRatio: state.skyRatio,
      target: state.target,
      time: t / 1000
    });

    if (t - state.lastThumb > 420) {
      state.lastThumb = t;
      refreshThumbs();
    }
  }

  function loop(ts) {
    if (!state.running) return;
    const gap = state.scene === 'architecture' ? 700 : 230;
    if (ts - state.lastDetect > gap) {
      state.lastDetect = ts;
      runDetect();
    }
    if (state.scene === 'architecture' && ts - state.lastAnalyze > 600) {
      state.lastAnalyze = ts;
      if (state.detectCanvas) analyzeFrame();
      else if (video.videoWidth) { grabDetectFrame(); analyzeFrame(); }
    }
    render();
    requestAnimationFrame(loop);
  }

  /* ---------------- 缩略图 ---------------- */

  function buildCandidates() {
    const box = $('#candidates');
    box.innerHTML = '';
    state.planCrops = [];

    Advisor.plans(state.scene).forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'cand' + (p.id === state.planId ? ' active' : '');
      btn.dataset.plan = p.id;
      btn.type = 'button';

      const c = document.createElement('canvas');
      c.width = 144;
      c.height = 192;
      btn.appendChild(c);

      const label = document.createElement('span');
      label.textContent = p.name;
      btn.appendChild(label);

      btn.addEventListener('click', () => setPlan(p.id));
      box.appendChild(btn);
      state.planCrops.push({ plan: p, canvas: c });
    });
  }

  function refreshThumbs() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    for (const item of state.planCrops) {
      const c = item.canvas;
      const g = c.getContext('2d');
      const crop = item.plan.crop;
      g.drawImage(video, crop.x * vw, crop.y * vh, crop.w * vw, crop.h * vh, 0, 0, c.width, c.height);
    }
  }

  function setPlan(id) {
    if (state.planId === id) return;
    state.planId = id;
    $$('.cand').forEach(el => el.classList.toggle('active', el.dataset.plan === id));
    state.faceSmooth = null;
    state.faceScreen = null;
    toast(Advisor.plan(state.scene, id).desc);
  }

  function setScene(scene) {
    if (state.scene === scene) return;
    state.scene = scene;
    state.planId = 'A';
    state.faceRaw = null;
    state.faceSmooth = null;
    state.faceScreen = null;
    state.skyRatio = null;
    $$('.scene').forEach(el => el.classList.toggle('active', el.dataset.scene === scene));
    buildCandidates();
    toast(scene === 'architecture' ? '建筑模式：看横平竖直和天空留白' : '人像模式：把人放进框里');
  }

  /* ---------------- 摄像头 ---------------- */

  async function startCamera() {
    try {
      await Camera.start(video);
      await waitForVideo();
      Overlay.resize(overlayCanvas);
      return true;
    } catch (e) {
      console.error(e);
      toast('摄像头打不开：' + (e && e.message ? e.message : '未知错误'), 4200);
      return false;
    }
  }

  function waitForVideo() {
    return new Promise(resolve => {
      if (video.videoWidth) return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const tick = () => {
        if (video.videoWidth) finish();
        else if (!done) setTimeout(tick, 60);
      };
      setTimeout(finish, 4000);
      tick();
    });
  }

  /* ---------------- 拍照 ---------------- */

  function capture() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const { cw, ch } = canvasSize();
    if (!vw || !vh || !cw || !ch) return null;

    const zoom = state.hardwareZoom ? 1 : state.zoom;
    const screenAR = cw / ch;
    const videoAR = vw / vh;
    let sw, sh;
    if (videoAR > screenAR) { sh = vh; sw = vh * screenAR; }
    else { sw = vw; sh = vw / screenAR; }
    sw /= zoom;
    sh /= zoom;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    const out = document.createElement('canvas');
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const g = out.getContext('2d');
    g.drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out;
  }

  function shutter() {
    const c = capture();
    if (!c) { toast('画面还没准备好'); return; }
    c.toBlob(blob => {
      if (!blob) { toast('保存失败'); return; }
      window.__lastBlob = blob;
      $('#resultImg').src = URL.createObjectURL(blob);
      showScreen('result');
      stopLoop();
    }, 'image/jpeg', 0.92);
  }

  async function savePhoto() {
    const blob = window.__lastBlob;
    if (!blob) return;
    const file = new File([blob], 'lumo-' + Date.now() + '.jpg', { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '灵感构图' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('已保存到下载目录');
  }

  /* ---------------- 流程 ---------------- */

  function showScreen(name) {
    ['intro', 'viewfinder', 'result'].forEach(id => {
      $('#' + id).classList.toggle('hidden', id !== name);
    });
  }

  function startLoop() {
    state.running = true;
    requestAnimationFrame(loop);
  }

  function stopLoop() {
    state.running = false;
    state.faceRaw = null;
    state.faceSmooth = null;
    state.faceScreen = null;
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2200);
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* 忽略 */ }
  }

  let rollFiltered = 0;
  function onOrientation(e) {
    let roll = 0;
    const portrait = window.innerHeight >= window.innerWidth;
    if (portrait) {
      roll = e.gamma || 0;
      if (Math.abs(roll) > 90) roll = 0;
    } else {
      roll = e.beta ? (e.beta - 90) : 0;
    }
    rollFiltered = rollFiltered * 0.72 + roll * 0.28;
    state.roll = Math.abs(rollFiltered) < 0.35 ? 0 : rollFiltered;
  }

  async function enterViewfinder() {
    showScreen('viewfinder');
    Overlay.attach(overlayCanvas);
    Overlay.resize(overlayCanvas);

    const ok = await startCamera();
    if (!ok) { showScreen('intro'); return; }

    resetZoom();
    buildCandidates();

    toast('正在加载识别模型…', 2600);
    const ready = await Detector.init();
    toast(ready ? '好了，把人放进框里' : '识别模型没加载上，先用网格和水平仪', ready ? 1800 : 4200);

    requestWakeLock();
    startLoop();
  }

  /* ---------------- 事件 ---------------- */

  function bind() {
    $('#startBtn').addEventListener('click', enterViewfinder);

    $('#closeBtn').addEventListener('click', () => {
      stopLoop();
      Camera.stop();
      showScreen('intro');
    });

    $('#shutter').addEventListener('click', shutter);
    $('#saveBtn').addEventListener('click', savePhoto);
    $('#retakeBtn').addEventListener('click', () => {
      showScreen('viewfinder');
      startLoop();
    });

    $('#flipBtn').addEventListener('click', async () => {
      try {
        stopLoop();
        await Camera.flip(video);
        await waitForVideo();
        Overlay.resize(overlayCanvas);
        resetZoom();
        startLoop();
      } catch (e) {
        toast('切镜头失败');
        startLoop();
      }
    });

    $$('.zoom').forEach(btn => {
      btn.addEventListener('click', () => setZoom(Number(btn.dataset.zoom)));
    });

    $('#gridBtn').addEventListener('click', () => {
      const order = ['thirds', 'golden', 'diag', 'off'];
      const i = order.indexOf(state.grid);
      state.grid = order[(i + 1) % order.length];
      toast({ thirds: '三分线', golden: '黄金分割', diag: '对角线', off: '关掉参考线' }[state.grid]);
    });

    $$('.scene').forEach(btn => {
      btn.addEventListener('click', () => setScene(btn.dataset.scene));
    });

    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
        state.mode = tab.dataset.mode;
        if (state.mode === 'pose') startPoseTips();
        else stopPoseTips();
      });
    });

    window.addEventListener('resize', () => Overlay.resize(overlayCanvas));
    window.addEventListener('deviceorientation', onOrientation, true);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopLoop();
        Camera.stop();
      } else {
        const onViewfinder = !document.getElementById('viewfinder').classList.contains('hidden');
        if (onViewfinder) {
          startCamera().then(ok => {
            if (ok) { requestWakeLock(); startLoop(); }
          });
        }
      }
    });
  }

  /* ---------------- 灵感推荐 ---------------- */

  const POSE_TIPS = [
    '侧身站，肩膀朝镜头 45°，显瘦',
    '手别闲着：撩头发、碰杯、扶栏杆',
    '下巴微收，眼睛看镜头，别仰头',
    '找自然光：窗户边侧脸最好看',
    '走路抓拍，比站着摆更自然',
    '蹲一点、坐一点，别总站着'
  ];
  let poseTimer = null;
  let poseIdx = 0;

  function startPoseTips() {
    stopPoseTips();
    poseIdx = 0;
    toast(POSE_TIPS[0], 3200);
    poseTimer = setInterval(() => {
      poseIdx = (poseIdx + 1) % POSE_TIPS.length;
      toast(POSE_TIPS[poseIdx], 3200);
    }, 4200);
  }
  function stopPoseTips() {
    if (poseTimer) { clearInterval(poseTimer); poseTimer = null; }
  }

  /* ---------------- 启动 ---------------- */

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const btn = document.getElementById('startBtn');
    btn.textContent = '这个浏览器不支持摄像头';
    btn.disabled = true;
  }

  bind();
})();
