/* 取景叠加层绘制 —— 柔光聚光版 */
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

  // 只往当前路径里追加一个圆角矩形，不重置路径（给 evenodd 挖洞用）
  function addRoundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawGrid(g, mode) {
    if (mode === 'off') return;
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,.15)';
    if (mode === 'thirds' || mode === 'golden') {
      const xs = mode === 'thirds' ? [1 / 3, 2 / 3] : [0.382, 0.618];
      g.beginPath();
      for (const f of xs) { g.moveTo(cw * f, 0); g.lineTo(cw * f, ch); }
      for (const f of xs) { g.moveTo(0, ch * f); g.lineTo(cw, ch * f); }
      g.stroke();
    } else if (mode === 'diag') {
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(cw, ch);
      g.moveTo(cw, 0); g.lineTo(0, ch);
      g.stroke();
    }
    g.restore();
  }

  // 建筑模式的中轴
  function drawArchAxis(g) {
    g.save();
    g.strokeStyle = 'rgba(108,140,255,.22)';
    g.lineWidth = 1;
    g.setLineDash([3, 8]);
    g.beginPath();
    g.moveTo(cw / 2, 0);
    g.lineTo(cw / 2, ch);
    g.stroke();
    g.restore();
  }

  /**
   * 核心：聚光遮罩 + 柔光边框
   * 框外画面压暗，注意力被"吸"进框里
   */
  function drawSpotlight(g, r, ok, t) {
    const rad = Math.min(28, r.w * 0.16, r.h * 0.16);
    const rgb = ok ? '95,211,154' : '255,255,255';

    // 1) 框外压暗（evenodd 挖洞 + 模糊，让边缘柔下来）
    g.save();
    g.filter = 'blur(7px)';
    g.beginPath();
    g.rect(-20, -20, cw + 40, ch + 40);
    addRoundRect(g, r.x, r.y, r.w, r.h, rad);
    g.fillStyle = ok ? 'rgba(0,14,8,0.22)' : 'rgba(0,0,0,0.22)';
    g.fill('evenodd');
    g.restore();

    // 2) 柔光外框
    g.save();
    g.shadowColor = 'rgba(' + rgb + ',' + (ok ? 0.7 : 0.5) + ')';
    g.shadowBlur = 20;
    g.strokeStyle = 'rgba(' + rgb + ',' + (ok ? 0.98 : 0.9) + ')';
    g.lineWidth = 1.6;
    roundRect(g, r.x, r.y, r.w, r.h, rad);
    g.stroke();
    g.restore();

    // 3) 内衬一圈极淡的亮边，增加"玻璃"质感
    g.save();
    g.strokeStyle = 'rgba(255,255,255,' + (ok ? 0.3 : 0.16) + ')';
    g.lineWidth = 1;
    roundRect(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, Math.max(4, rad - 3));
    g.stroke();
    g.restore();

    // 4) 四角微小高光
    if (!ok) {
      const L = Math.min(18, r.w * 0.12);
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      const corners = [
        [r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1],
        [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]
      ];
      for (const [x, y, sx, sy] of corners) {
        g.beginPath();
        g.moveTo(x + sx * 3, y + sy * 3 + sy * L * 0.2);
        g.lineTo(x + sx * 3, y + sy * 3);
        g.lineTo(x + sx * 3 + sx * L, y + sy * 3);
        g.stroke();
      }
      g.restore();
    }
  }

  // 目标"幽灵框"：柔和的呼吸轮廓
  function drawGhost(g, r, hot, t) {
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.7);
    const rad = Math.min(16, r.w * 0.3);
    g.save();
    if (hot) {
      g.strokeStyle = 'rgba(95,211,154,.85)';
      g.lineWidth = 1.4;
      g.shadowColor = 'rgba(95,211,154,.6)';
      g.shadowBlur = 14;
    } else {
      g.strokeStyle = 'rgba(255,255,255,' + (0.18 + 0.16 * breathe) + ')';
      g.lineWidth = 1.1;
    }
    g.setLineDash([3, 7]);
    g.lineDashOffset = -t * 10;
    roundRect(g, r.x, r.y, r.w, r.h, rad);
    g.stroke();
    g.restore();
  }

  // 引导：淡到几乎看不见的一条流动细线 + 小箭头
  function drawHintLine(g, from, to, t) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 14) return;
    const ux = dx / len, uy = dy / len;
    const sx = from.x + ux * 16, sy = from.y + uy * 16;
    const ex = to.x - ux * 18, ey = to.y - uy * 18;

    g.save();
    g.strokeStyle = 'rgba(255,236,210,.45)';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    g.setLineDash([2, 9]);
    g.lineDashOffset = -t * 30;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(ex, ey);
    g.stroke();
    g.setLineDash([]);

    const a = Math.atan2(uy, ux);
    g.beginPath();
    g.moveTo(ex + ux * 5, ey + uy * 5);
    g.lineTo(ex - 7 * Math.cos(a - 0.5), ey - 7 * Math.sin(a - 0.5));
    g.moveTo(ex + ux * 5, ey + uy * 5);
    g.lineTo(ex - 7 * Math.cos(a + 0.5), ey - 7 * Math.sin(a + 0.5));
    g.strokeStyle = 'rgba(255,236,210,.7)';
    g.lineWidth = 1.4;
    g.stroke();
    g.restore();
  }

  // 到位：一圈柔和绿光缓缓扩散
  function drawGlow(g, c, radius, t) {
    const p = (t % 1.8) / 1.8;
    const rr = radius + p * 40;
    const grad = g.createRadialGradient(c.x, c.y, rr * 0.55, c.x, c.y, rr);
    grad.addColorStop(0, 'rgba(95,211,154,0)');
    grad.addColorStop(0.75, 'rgba(95,211,154,' + (0.16 * (1 - p)) + ')');
    grad.addColorStop(1, 'rgba(95,211,154,0)');
    g.save();
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c.x, c.y, rr, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawFaceBox(g, r) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.26)';
    g.lineWidth = 1;
    g.setLineDash([3, 6]);
    roundRect(g, r.x, r.y, r.w, r.h, Math.min(12, r.w * 0.25));
    g.stroke();
    g.restore();
  }

  function drawLevel(g, roll, ok) {
    const cx = cw / 2;
    const cy = ch / 2;
    const len = Math.min(cw * 0.3, 130);
    const rad = roll * Math.PI / 180;

    g.save();
    g.translate(cx, cy);
    g.rotate(rad);
    g.strokeStyle = ok ? 'rgba(95,211,154,.85)' : 'rgba(255,255,255,.55)';
    g.lineWidth = 1.3;
    g.shadowColor = ok ? 'rgba(95,211,154,.5)' : 'transparent';
    g.shadowBlur = ok ? 10 : 0;
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.lineTo(len / 2, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(-len / 2, -5); g.lineTo(-len / 2, 5);
    g.moveTo(len / 2, -5); g.lineTo(len / 2, 5);
    g.stroke();
    g.fillStyle = ok ? 'rgba(95,211,154,.95)' : 'rgba(255,255,255,.7)';
    g.beginPath();
    g.arc(0, 0, 2.6, 0, Math.PI * 2);
    g.fill();
    g.restore();

    if (!ok) {
      g.save();
      g.font = '500 11px -apple-system, "PingFang SC", sans-serif';
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.textAlign = 'center';
      g.fillText(Math.abs(roll).toFixed(1) + '°', cx, cy + 22);
      g.restore();
    }
  }

  function draw(s) {
    if (!ctx) return;
    const t = s.time || 0;
    ctx.clearRect(0, 0, cw, ch);

    drawGrid(ctx, s.grid);
    if (s.scene === 'architecture') drawArchAxis(ctx);

    const g = s.guide;
    const gr = { x: g.x * cw, y: g.y * ch, w: g.w * cw, h: g.h * ch };
    const ok = !!(s.advice && s.advice.inside);

    drawSpotlight(ctx, gr, ok, t);

    if (s.face) {
      const fr = { x: s.face.x * cw, y: s.face.y * ch, w: s.face.w * cw, h: s.face.h * ch };
      drawFaceBox(ctx, fr);

      if (s.target) {
        const tr = { x: s.target.x * cw, y: s.target.y * ch, w: s.target.w * cw, h: s.target.h * ch };
        const fc = { x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 };
        const tc = { x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 };
        const dist = Math.hypot(tc.x - fc.x, tc.y - fc.y);
        const hot = dist < Math.max(18, fr.w * 0.35);

        drawGhost(ctx, tr, hot, t);
        if (!hot) drawHintLine(ctx, fc, tc, t);
        else drawGlow(ctx, tc, Math.max(fr.w, fr.h) * 0.6, t);
      }
    }

    // 水平仪只在歪了的时候出现，端平时不干扰画面
    if (Math.abs(s.roll || 0) >= 1.5) {
      drawLevel(ctx, s.roll, false);
    }
  }

  return { attach, resize, draw };
})();
