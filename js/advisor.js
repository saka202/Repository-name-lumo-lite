/* 构图建议引擎：纯逻辑，不碰 DOM */
window.Advisor = (function () {
  'use strict';

  const SCENES = ['portrait', 'architecture'];

  const PLANS = {
    portrait: [
      {
        id: 'A',
        name: '三分',
        desc: '人贴右侧三分线，视线方向留白',
        guide: { x: 0.50, y: 0.10, w: 0.46, h: 0.80 },
        crop: { x: 0.28, y: 0.02, w: 0.72, h: 0.96 }
      },
      {
        id: 'B',
        name: '中心',
        desc: '人放正中，适合干净背景',
        guide: { x: 0.16, y: 0.06, w: 0.68, h: 0.86 },
        crop: { x: 0.10, y: 0.00, w: 0.80, h: 1.00 }
      }
    ],
    architecture: [
      {
        id: 'A',
        name: '对称',
        desc: '镜头正对中轴，左右分毫不差',
        guide: { x: 0.20, y: 0.10, w: 0.60, h: 0.78 },
        crop: { x: 0.12, y: 0.00, w: 0.76, h: 1.00 }
      },
      {
        id: 'B',
        name: '三分',
        desc: '楼放右侧三分线，天空留上方',
        guide: { x: 0.46, y: 0.16, w: 0.44, h: 0.70 },
        crop: { x: 0.28, y: 0.06, w: 0.70, h: 0.92 }
      }
    ]
  };

  function plans(scene) {
    return PLANS[scene] || PLANS.portrait;
  }

  function plan(scene, id) {
    const list = plans(scene);
    return list.find(p => p.id === id) || list[0];
  }

  // 人脸在引导框里的理想位置（框内偏上），用来画"幽灵目标框"
  function targetFace(guide, face) {
    const w = face && face.w ? face.w : 0.20;
    const h = face && face.h ? face.h : 0.26;
    const cy = guide.y + guide.h * 0.22;
    return {
      x: guide.x + guide.w / 2 - w / 2,
      y: cy - h / 2,
      w,
      h
    };
  }

  function inside(guide, face, pad) {
    const p = pad == null ? 0.06 : pad;
    const gx2 = guide.x + guide.w, gy2 = guide.y + guide.h;
    return face.x >= guide.x - guide.w * p &&
           face.y >= guide.y - guide.h * p &&
           face.x + face.w <= gx2 + guide.w * p &&
           face.y + face.h <= gy2 + guide.h * p;
  }

  function portraitAdvice(o) {
    const p = plan('portrait', o.planId);
    const guide = p.guide;
    const roll = o.roll || 0;
    const tilt = Math.abs(roll) > 4.5;

    if (!o.face) {
      if (tilt) return { level: 'warn', text: '手机歪了 ' + Math.round(Math.abs(roll)) + '° · 摆正再看', guide, inside: false, scene: 'portrait', target: null };
      return { level: 'idle', text: '把人对进画面 · 小布帮你看三分线', guide, inside: false, scene: 'portrait', target: null };
    }

    const face = o.face;
    const ok = inside(guide, face);
    const target = targetFace(guide, face);

    if (tilt) {
      return { level: 'warn', text: '手机歪了 ' + Math.round(Math.abs(roll)) + '° · 摆正再按', guide, inside: ok, scene: 'portrait', target };
    }

    if (ok) {
      return { level: 'good', text: '三分线卡住了 · 按快门', guide, inside: true, scene: 'portrait', target };
    }

    if (face.w < 0.10) {
      return { level: 'hint', text: '人有点小 · 走近两步', guide, inside: false, scene: 'portrait', target };
    }
    if (face.w > 0.52) {
      return { level: 'hint', text: '离太近 · 退后半步', guide, inside: false, scene: 'portrait', target };
    }

    const fc = { x: face.x + face.w / 2, y: face.y + face.h / 2 };

    // 头顶空间
    if (face.y < guide.y - 0.02) {
      return { level: 'hint', text: '头顶太挤 · 手机往下沉一点', guide, inside: false, scene: 'portrait', target };
    }

    // 居中方案下，人在正中反而是对的；三分方案下才提示别放中间
    const gc = { x: guide.x + guide.w / 2, y: guide.y + guide.h / 2 };
    const dx = gc.x - fc.x;
    const dy = gc.y - fc.y;

    if (o.planId === 'A' && Math.abs(fc.x - 0.5) < 0.07) {
      return { level: 'hint', text: '别放正中间 · 往右让半步', guide, inside: false, scene: 'portrait', target };
    }

    let text;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) {
      text = dx > 0 ? '人偏左 · 往右让半步，视线那边留空' : '人偏右 · 往左让半步';
    } else if (Math.abs(dy) > 0.07) {
      text = dy > 0 ? '人偏上 · 手机抬高一点' : '人偏下 · 手机压低一点';
    } else {
      text = '再挪一点点 · 让眼睛落到上三分线';
    }
    return { level: 'hint', text, guide, inside: false, scene: 'portrait', target };
  }

  function architectureAdvice(o) {
    const p = plan('architecture', o.planId);
    const guide = p.guide;
    const roll = o.roll || 0;
    const a = o.analysis || {};
    const sky = a.skyRatio == null ? null : a.skyRatio;

    const tilt = Math.abs(roll) > 3;
    let text = null;

    if (tilt) {
      text = '左歪 ' + Math.abs(roll).toFixed(1) + '° · 摆正让楼体竖线跟边平行';
      if (roll < 0) text = '右歪 ' + Math.abs(roll).toFixed(1) + '° · 摆正让楼体竖线跟边平行';
    } else if (sky != null && sky > 0.55) {
      text = '天空太多 · 往下压一点，让楼占满下半';
    } else if (sky != null && sky < 0.08) {
      text = '顶上没空间 · 往上抬，给楼留口气';
    }

    if (!text) {
      if (sky == null) {
        text = '把楼的主体对进框里 · 镜头正对中轴';
        return { level: 'idle', text, guide, inside: false, scene: 'architecture', target: null };
      }
      return { level: 'good', text: '横平竖直 · 拍吧', guide, inside: true, scene: 'architecture', target: null };
    }

    return {
      level: tilt ? 'warn' : 'hint',
      text,
      guide,
      inside: !tilt,
      scene: 'architecture',
      target: null
    };
  }

  function advise(o) {
    if (o.scene === 'architecture') return architectureAdvice(o);
    return portraitAdvice(o);
  }

  return { SCENES, PLANS, plans, plan, advise, inside, targetFace };
})();
