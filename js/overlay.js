/* 取景叠加层绘制 */
window.Overlay = (function () {
  'use strict';

  let ctx = null;
  let cw = 0, ch = 0;

  function attach(canvasEl) {
    ctx = canvasEl.getContext('2d');
    return ctx;
  }

  function resize(canvasEl) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvasEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    cw = r.width;
    ch = r.height;
    canvasEl.width = Math.round(cw * dpr);
    canvasEl.height = Math.round(ch * dpr);
    ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawGrid(g, mode) {
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,.20)';
    if (mode === 'thirds' || mode === 'golden') {
      const xs = mode === 'thirds' ? [1 / 3, 2 / 3] : [0.382, 0.618];
      g.beginPath();
      for (const f of xs) { g.moveTo(cw * f, 0); g.lineTo(cw * f, ch); }
      for (const f of xs) { g.moveTo(0, ch * f); g.lineTo(cw, ch * f); }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.30)';
      for (const fx of xs) for (const fy of xs) {
        g.beginPath();
        g.arc(cw * fx, ch * fy, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    } else if (mode === 'diag') {
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(cw, ch);
      g.moveTo(cw, 0); g.lineTo(0, ch);
      g.stroke();
    }
    g.restore();
  }

  // 建筑模式：中轴线 + 上下水平基准
  function drawArchGuides(g, skyRatio) {
    g.save();
    g.strokeStyle = 'rgba(108,140,255,.28)';
    g.lineWidth = 1;
    g.setLineDash([3, 7]);
    g.beginPath();
    g.moveTo(cw / 2, 0);
    g.lineTo(cw / 2, ch);
    g.stroke();
    g.restore();
  }

  function drawGuide(g, r, ok, scene) {
    const col = ok ? 'rgba(95,211,154,.95)' : 'rgba(255,255,255,.85)';
    g.save();
    g.strokeStyle = col;
    g.lineWidth = 1.5;
    g.setLineDash(ok ? [] : [7, 6]);
    roundRect(g, r.x, r.y, r.w, r.h, 16);
    g.stroke();
    g.setLineDash([]);

    const L = Math.min(26, r.w * 0.22);
    g.lineWidth = 3;
    g.lineCap = 'round';
    const corners = [
      [r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1],
      [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]
    ];
    for (const [x, y, sx, sy] of corners) {
      g.beginPath();
      g.moveTo(x, y + sy * L);
      g.lineTo(x, y);
      g.lineTo(x + sx * L, y);
      g.stroke();
    }
    g.restore();
  }

  function drawFaceBox(g, r) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.38)';
    g.lineWidth = 1;
    g.setLineDash([4, 5]);
    roundRect(g, r.x, r.y, r.w, r.h, 10);
    g.stroke();
    g.restore();
  }

  // 目标"幽灵框"：脸应该待的地方，虚线流动 + 呼吸
  function drawGhost(g, r, hot, t) {
    g.save();
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.6);
    const alpha = hot ? 0.95 : 0.34 + 0.3 * breathe;
    g.strokeStyle = hot
      ? 'rgba(95,211,154,' + alpha + ')'
      : 'rgba(255,255,255,' + alpha + ')';
    g.lineWidth = hot ? 2 : 1.4;
    g.setLineDash([6, 6]);
    g.lineDashOffset = -t * 34;
    roundRect(g, r.x, r.y, r.w, r.h, Math.min(14, r.w * 0.22));
    g.stroke();
    g.restore();

    // 框中心一个小十字，标记"脸中心放这"
    if (!hot) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.3 * breathe) + ')';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy);
      g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6);
      g.stroke();
      g.restore();
    }
  }

  // 流动箭头：从当前脸中心指向目标中心
  function drawArrow(g, from, to, t) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;
    const ux = dx / len, uy = dy / len;
    const sx = from.x + ux * 12, sy = from.y + uy * 12;
    const ex = to.x - ux * 14, ey = to.y - uy * 14;

    g.save();
    g.strokeStyle = 'rgba(255,122,69,.9)';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.setLineDash([5, 7]);
    g.lineDashOffset = -t * 46;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(ex, ey);
    g.stroke();
    g.setLineDash([]);

    const a = Math.atan2(uy, ux);
    g.beginPath();
    g.moveTo(ex + ux * 4, ey + uy * 4);
    g.lineTo(ex - 9 * Math.cos(a - 0.42), ey - 9 * Math.sin(a - 0.42));
    g.lineTo(ex - 9 * Math.cos(a + 0.42), ey - 9 * Math.sin(a + 0.42));
    g.closePath();
    g.fillStyle = 'rgba(255,122,69,.95)';
    g.fill();
    g.restore();
  }

  // 到位脉冲
  function drawPulse(g, c, baseR, t) {
    const p = (t % 1.4) / 1.4;
    g.save();
    g.strokeStyle = 'rgba(95,211,154,' + (0.55 * (1 - p)) + ')';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c.x, c.y, baseR + p * 26, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  function drawLevel(g, roll, ok) {
    const cx = cw / 2;
    const cy = ch / 2;
    const len = Math.min(cw * 0.34, 150);
    const rad = roll * Math.PI / 180;

    g.save();
    g.translate(cx, cy);
    g.rotate(rad);
    g.strokeStyle = ok ? 'rgba(95,211,154,.95)' : 'rgba(255,255,255,.8)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.lineTo(len / 2, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(-len / 2, -6); g.lineTo(-len / 2, 6);
    g.moveTo(len / 2, -6); g.lineTo(len / 2, 6);
    g.stroke();
    g.fillStyle = ok ? 'rgba(95,211,154,.95)' : 'rgba(255,255,255,.8)';
    g.beginPath();
    g.arc(0, 0, 3, 0, Math.PI * 2);
    g.fill();
    g.restore();

    if (!ok) {
      g.save();
      g.font = '600 12px -apple-system, "PingFang SC", sans-serif';
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.textAlign = 'center';
      g.fillText(Math.abs(roll).toFixed(1) + '°', cx, cy + 26);
      g.restore();
    }
  }

  function draw(s) {
    if (!ctx) return;
    const t = s.time || 0;
    ctx.clearRect(0, 0, cw, ch);

    drawGrid(ctx, s.grid);
    if (s.scene === 'architecture') drawArchGuides(ctx, s.skyRatio);

    const g = s.guide;
    const gr = { x: g.x * cw, y: g.y * ch, w: g.w * cw, h: g.h * ch };
    drawGuide(ctx, gr, !!(s.advice && s.advice.inside), s.scene);

    if (s.face) {
      const fr = { x: s.face.x * cw, y: s.face.y * ch, w: s.face.w * cw, h: s.face.h * ch };
      drawFaceBox(ctx, fr);

      // 目标位置 + 引导
      if (s.target) {
        const tr = { x: s.target.x * cw, y: s.target.y * ch, w: s.target.w * cw, h: s.target.h * ch };
        const fc = { x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 };
        const tc = { x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 };
        const dist = Math.hypot(tc.x - fc.x, tc.y - fc.y);
        const hot = dist < Math.max(18, fr.w * 0.35);

        drawGhost(ctx, tr, hot, t);
        if (!hot) drawArrow(ctx, fc, tc, t);
        else drawPulse(ctx, tc, Math.max(fr.w, fr.h) * 0.55, t);
      }
    }

    drawLevel(ctx, s.roll || 0, Math.abs(s.roll || 0) < 1.5);
  }

  return { attach, resize, draw };
})();
