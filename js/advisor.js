/* 构图建议引擎：纯逻辑，不碰 DOM */
window.Advisor = (function () {
  'use strict';

  const SCENES = ['portrait', 'architecture'];

  const PLANS = {
    portrait: [
      {
        id: 'A',
        name: '三分',
        desc: '人放右侧三分线',
        guide: { x: 0.50, y: 0.10, w: 0.46, h: 0.80 },
        crop: { x: 0.28, y: 0.02, w: 0.72, h: 0.96 }
      },
      {
        id: 'B',
        name: '中心',
        desc: '人放画面正中',
        guide: { x: 0.16, y: 0.06, w: 0.68, h: 0.86 },
        crop: { x: 0.10, y: 0.00, w: 0.80, h: 1.00 }
      }
    ],
    architecture: [
      {
        id: 'A',
        name: '对称',
        desc: '主体居中，左右对称',
        guide: { x: 0.20, y: 0.10, w: 0.60, h: 0.78 },
        crop: { x: 0.12, y: 0.00, w: 0.76, h: 1.00 }
      },
      {
        id: 'B',
        name: '三分',
        desc: '主体靠右，上方留天空',
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
      if (tilt) return { level: 'warn', text: '手机有点歪，先摆正（' + Math.round(roll) + '°）', guide, inside: false, scene: 'portrait', target: null };
      return { level: 'idle', text: '把人对进画面里，小布帮你看', guide, inside: false, scene: 'portrait', target: null };
    }

    const face = o.face;
    const ok = inside(guide, face);
    const target = targetFace(guide, face);

    if (tilt) {
      return { level: 'warn', text: '手机歪了 ' + Math.round(Math.abs(roll)) + '°，摆正再拍', guide, inside: ok, scene: 'portrait', target };
    }

    if (ok) {
      return { level: 'good', text: '构图到位了，按快门', guide, inside: true, scene: 'portrait', target };
    }

    if (face.w < 0.10) {
      return { level: 'hint', text: '人有点小，走近两步', guide, inside: false, scene: 'portrait', target };
    }
    if (face.w > 0.52) {
      return { level: 'hint', text: '离太近啦，往后退一点', guide, inside: false, scene: 'portrait', target };
    }

    const gc = { x: guide.x + guide.w / 2, y: guide.y + guide.h / 2 };
    const fc = { x: face.x + face.w / 2, y: face.y + face.h / 2 };
    const dx = gc.x - fc.x;
    const dy = gc.y - fc.y;

    let text;
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      text = dx > 0 ? '人物偏左，手机往左带一点' : '人物偏右，手机往右带一点';
    } else if (Math.abs(dy) > 0.07) {
      text = dy > 0 ? '人物偏上，手机往下压一点' : '人物偏下，手机往上抬一点';
    } else if (face.y < guide.y) {
      text = '头顶太满，手机往下压一点';
    } else {
      text = '再挪一点点';
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
    const notes = [];

    if (tilt) {
      notes.push('手往' + (roll > 0 ? '左' : '右') + '转 ' + Math.abs(roll).toFixed(1) + '°，让楼体竖线跟画面边平行');
    }

    if (sky != null) {
      if (sky > 0.55) notes.push('天空占太多，往下压一点');
      else if (sky < 0.08) notes.push('顶上没空间了，往上抬一点');
    }

    if (notes.length === 0) {
      return { level: 'good', text: '横平竖直，构图稳了，按快门', guide, inside: true, scene: 'architecture', target: null };
    }

    return {
      level: tilt ? 'warn' : 'hint',
      text: notes[0],
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
