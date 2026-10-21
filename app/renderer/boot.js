/* Console boot intros. Original code: everything is drawn here, nothing is taken from a console.
   Timings and positions were measured frame by frame from recordings of the real boot sequences
   (see README, "Açılış introları"); the marks are the user's own files or original shapes.
   BOOT.frame(kind, ctx, t, opt) draws one frame at t seconds (also used by the reference diff);
   BOOT.Player plays one intro on #boot (user video, or the drawn animation with sound). */
(function (root) {
  'use strict';
  const W = 1920, H = 1080;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
  const outCubic = (u) => 1 - Math.pow(1 - clamp(u), 3);
  // Piecewise keyframes [[t, v...], ...] with smoothstep between them.
  function lin(list, t) {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) if (t <= list[i][0]) return lerp(list[i - 1][1], list[i][1], (t - list[i - 1][0]) / (list[i][0] - list[i - 1][0]));
    return list[list.length - 1][1];
  }
  function keys(list, t) {
    if (t <= list[0][0]) return list[0].slice(1);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (t <= b[0]) { const u = smooth((t - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, k) => lerp(v, b[k + 1], u)); }
    }
    return list[list.length - 1].slice(1);
  }

  // ---------- PS5 (power on) ----------
  // Measured from a 60 fps capture of a PS5 start (player t 0 = first non-blank frame):
  //  0.08-2.30  one line of small text in the middle (cut in / cut out)
  //  0.10-3.55  very large soft teal light discs, brightness rising linearly (mean luma 1 -> 18)
  //  3.45-4.10  the discs flare into a cluster of smaller light discs (mean luma peaks ~28 at 3.75)
  //  3.90-4.60  the discs go, fine white specks and warm gold specks remain (teal -> 0 by 4.4)
  //  4.40-5.80  the scene fades into the press-the-button screen (spotlight from the top left)
  const PS5 = { total: 4.15, fadeOut: 1500 };
  let rng = 1;
  const rnd = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  let ps5Parts = null;
  function ps5Init() {
    rng = 11;
    const big = [[1100, 560, 830, 1.0], [430, 520, 600, 0.8], [1560, 690, 620, 0.7]];
    const flare = Array.from({ length: 11 }, () => ({ a: rnd() * 6.283, d: 0.2 + rnd() * 0.8, r: 120 + rnd() * 110, l: 0.5 + rnd() * 0.5 }));
    const fine = Array.from({ length: 2200 }, () => ({ x: Math.pow(rnd(), 1.3) * 1350, y: rnd() * H, r: 1 + rnd() * 1.6, a: 0.2 + rnd() * 0.45, v: (rnd() - 0.5) * 30 }));
    const gold = Array.from({ length: 140 }, () => { const x = 1050 + (rnd() - 0.3) * 900; return { x, y: 80 + rnd() * 880, r: 2 + Math.pow(rnd(), 2) * 9, a: 0.5 + rnd() * 0.5, v: -10 - rnd() * 25 }; });
    ps5Parts = { big, flare, fine, gold };
  }
  function disc(ctx, x, y, r, col, a, soft = 0.12) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1 - soft, `rgba(${col},${a * 0.92})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  function ps5Frame(ctx, t, opt) {
    opt = opt || {};
    if (!ps5Parts) ps5Init();
    const P = ps5Parts;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // Two very large discs (main one right of centre); colour measured: rgb(0, 4+7.6t, 5+11t).
    const out = 1 - 0.55 * smooth((t - 3.95) / 0.5);
    const flare = t > 3.45 ? Math.sin(Math.PI * clamp((t - 3.45) / 0.7)) : 0;
    const gC = clamp(4 + 7.6 * t, 0, 36) * out + 6 * flare * out, bC = clamp(5 + 11 * t, 0, 50) * out + 8 * flare * out;
    ctx.globalCompositeOperation = 'source-over';
    if (t > 0.05) {
      const fadeIn = clamp((t - 0.05) / 0.25);
      const k2 = lerp(0.08, 0.5, clamp(t / 3.2));
      disc(ctx, 540 + t * 4, 560, 470, `0,${Math.round(gC * k2)},${Math.round(bC * k2 * 0.92)}`, fadeIn, 0.4);
      disc(ctx, 1110 + t * 6, 560, 900 + 4 * t, `0,${Math.round(gC)},${Math.round(bC)}`, fadeIn, 0.22);
    }
    ctx.globalCompositeOperation = 'lighter';
    if (t > 3.45 && t < 4.4) {
      const u = clamp((t - 3.45) / 0.95);
      for (const f of P.flare) {
        const d = f.d * lerp(160, 760, outCubic(u));
        disc(ctx, 930 + Math.cos(f.a) * d * 1.25, 480 + Math.sin(f.a) * d * 0.75, f.r * lerp(0.95, 0.6, u), '80,96,98', 0.3 * f.l * Math.sin(Math.PI * Math.min(1, u * 1.25)), 0.12);
      }
    }
    // specks
    const sp = smooth((t - 3.75) / 0.45);
    if (sp > 0) {
      for (const f of P.fine) { ctx.fillStyle = `rgba(200,215,230,${f.a * sp})`; ctx.fillRect(f.x + f.v * (t - 3.75), f.y, f.r, f.r); }
      for (const g of P.gold) disc(ctx, g.x, g.y + g.v * (t - 3.75), g.r, '220,170,130', g.a * sp * 0.8, 0.45);
    }
    ctx.restore();
    // the text line
    if (t >= 0.08 && t < 2.3 && opt.text) {
      ctx.font = '400 26px "Segoe UI", Selawik, "SST", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(236,238,240,0.92)'; ctx.fillText(opt.text, 960, 552);
    }
  }

  // ---------- Xbox 360 (2010+ dashboard era): light room, green ribbons around a white orb ----------
  // Measured phase times (s): flash from black 0.33-0.53, ribbons enter 0.6-1.3, wind in to a ring
  // 1.3-2.3, unwind 2.3-3.45, fly-through 3.45-4.3, wrap 4.3-5.0, collapse into the orb 5.0-5.25,
  // mark 5.05-5.3, lock-up 5.3-6.0, hold to 7.7.
  // Player time 0 = 0.40 s into the measured sequence (the light room is already up); the
  // measured times below are kept on that sequence's clock (OFFSET).
  const X = { total: 7.5, offset: 0.4, fadeOut: 520 };
  const GREENS = { dark: '#1d5c14', mid: '#3e9b22', light: '#86c440', lime: '#b5d82c', yellow: '#efe400' };
  const ORB = [ // t, x, y, r (measured from the frames)
    [1.10, 962, 462, 0], [1.30, 966, 462, 52], [1.60, 957, 462, 79], [2.00, 957, 462, 96], [2.30, 957, 452, 96],
    [2.60, 957, 452, 100], [3.00, 912, 440, 124], [3.30, 845, 400, 163], [3.70, 800, 374, 214], [4.10, 945, 376, 226],
    [4.50, 1013, 413, 197], [4.90, 957, 432, 172], [5.10, 948, 434, 169]];
  const SHADOW = [[1.10, 960, 800, 0, 0], [1.60, 960, 800, 120, 10], [2.30, 957, 811, 150, 12], [3.00, 920, 890, 200, 14],
    [3.70, 860, 930, 330, 22], [4.50, 980, 990, 360, 26], [5.10, 950, 935, 420, 26], [6.00, 950, 912, 470, 26]];

  let bgCache = null;
  function background(ctx) {
    if (!bgCache) {
      // Measured luma along the normalised elliptical distance from the centre, steps of 0.05.
      const P = [238, 238, 238, 238, 238, 237.7, 237.3, 236.8, 236, 235.1, 234.1, 232.9, 231.5, 230.5, 229.4, 227.8, 225.8, 224.1, 222.5, 219.3, 214.4, 213.5, 211.3, 208, 204.9, 200.7, 195.6, 190];
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.save(); g.translate(960, 540); g.scale(1, 540 / 960);
      const R = 960 * 1.45; const rg = g.createRadialGradient(0, 0, 0, 0, 0, R);
      P.forEach((v, i) => { const c = Math.round(v); rg.addColorStop(Math.min(1, ((i + 0.5) * 0.05) / 1.45), `rgb(${c},${c},${c})`); });
      g.fillStyle = rg; g.fillRect(-960, -960, 1920, 1920 * 1.2); g.restore();
      bgCache = c;
    }
    ctx.drawImage(bgCache, 0, 0);
  }
  // A ribbon along a log spiral r = a·e^(k·θ) around (cx, cy), squashed by tilt and turned by rot.
  // stripes: [[offset, width, colour], ...] across the ribbon (in units of w).
  function ribbon(ctx, o) {
    const n = Math.max(8, Math.ceil(Math.abs(o.th1 - o.th0) / 0.035));
    const pts = [];
    const cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0);
    for (let i = 0; i <= n; i++) {
      const th = lerp(o.th0, o.th1, i / n); const r = o.a * Math.exp(o.k * (th - o.th0));
      const x = r * Math.cos(th), y = r * Math.sin(th) * (o.tilt || 1);
      pts.push([o.cx + x * cr - y * sr, o.cy + x * sr + y * cr, i / n]);
    }
    const taper = (u) => Math.min(1, u / (o.tIn || 0.15), (1 - u) / (o.tOut || 0.15));
    for (const [off, sw, col] of o.stripes) {
      const L = [], R = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], m = pts[Math.max(0, i - 1)];
        let dx = q[0] - m[0], dy = q[1] - m[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const ww = lerp(o.w, o.wEnd == null ? o.w : o.wEnd, p[2]) * taper(p[2]); const c = off * ww, h = sw * ww * 0.5;
        L.push([p[0] - dy * (c - h), p[1] + dx * (c - h)]); R.push([p[0] - dy * (c + h), p[1] + dx * (c + h)]);
      }
      ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
      for (const p of L) ctx.lineTo(p[0], p[1]);
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
      ctx.closePath(); ctx.fillStyle = col; ctx.globalAlpha = o.alpha == null ? 1 : o.alpha; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  const S1 = (c) => [[0, 1, c]];
  const BAND = [[-0.36, 0.28, GREENS.dark], [-0.12, 0.26, GREENS.mid], [0.08, 0.2, GREENS.yellow], [0.26, 0.24, GREENS.light], [0.42, 0.14, GREENS.lime]];
  const BANDR = BAND.map(([o, w, c]) => [-o, w, c]);
  // internal time -> x of the big band's left edge at y=1000 (player time + 0.4)
  const BANDX = [[3.50, 624], [3.65, 722], [3.85, 898], [4.00, 1100], [4.15, 1368], [4.30, 1630], [4.35, 1760]];
  const BAND3 = [[-0.3, 0.4, GREENS.mid], [0.02, 0.26, GREENS.yellow], [0.3, 0.34, GREENS.light]];
  function orb(ctx, x, y, r) {
    if (r <= 0.5) return;
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.02);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#f3f3f3'); g.addColorStop(0.7, '#d2d2d2'); g.addColorStop(0.9, '#a9a9a9'); g.addColorStop(1, '#979797');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function shadow(ctx, x, y, w, h, a) {
    if (w <= 1) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
    g.addColorStop(0, `rgba(90,90,90,${0.45 * a})`); g.addColorStop(0.55, `rgba(110,110,110,${0.2 * a})`); g.addColorStop(1, 'rgba(120,120,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // Original mark on the orb when no x360-logo.png exists: a green light crescent inside the sphere.
  function orbMark(ctx, x, y, r, a) {
    if (a <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(x, y + r * 0.15, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(160,220,40,0)'); g.addColorStop(0.62, 'rgba(160,220,40,0)'); g.addColorStop(0.8, 'rgba(110,190,30,0.85)'); g.addColorStop(0.93, 'rgba(60,140,20,0.9)'); g.addColorStop(1, 'rgba(60,140,20,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function x360Frame(ctx, tp, opt) {
    opt = opt || {};
    const t = tp + X.offset;
    background(ctx);
    const [ox, oy, or] = keys(ORB, t);
    const [sx, sy, sw, sh] = keys(SHADOW, t);
    const L = opt.logo && opt.logo.width ? prepLogo(opt.logo, 'x360') : null;
    // Measured: the mark is up at 5.10-5.35, the word under it fades in over 5.60-5.87.
    const markA = L ? smooth((t - 5.08) / 0.27) : 0;
    const wordA = L && L.word ? smooth((t - 5.6) / 0.27) : 0;
    shadow(ctx, sx, sy, sw, sh, 1);
    const spin = -0.55 * t;
    // 0.6-2.3: five thin arms, inner ends at the vortex, outer ends off screen; they wind in.
    if (t > 0.55 && t < 2.45) {
      const enter = outCubic((t - 0.55) / 0.7);            // how far the arms have come in
      const wind = smooth((t - 1.3) / 1.0);                 // 0: open spiral, 1: ring round the orb
      const arms = [[0, 22, GREENS.dark], [1.25, 14, GREENS.mid], [2.5, 12, GREENS.yellow], [3.75, 16, GREENS.light], [5.0, 10, GREENS.mid]];
      const ring = Math.max(or * 1.22, 24);
      for (const [ph, w, c] of arms) {
        const k = lerp(0.95, 0.015, wind);
        const span = lerp(1.6 * Math.PI, 0.9 * Math.PI, wind);
        const th0 = ph + spin * 2 + lerp(0, 1.6, wind);
        const vis0 = lerp(0.75, 0, enter);                  // the inner part shows up last
        ribbon(ctx, { cx: ox, cy: oy, a: lerp(14, ring, wind), k, th0: th0 + span * vis0, th1: th0 + span, w: lerp(w * 0.35, w * 0.9, wind), wEnd: lerp(w * 2.6, w * 0.9, wind), tilt: lerp(0.86, 0.9, wind), rot: 0, stripes: S1(c), tIn: 0.1, tOut: 0.25, alpha: t > 2.3 ? 1 - (t - 2.3) / 0.15 : 1 });
      }
    }
    if (or > 0 && t < 3.6) orb(ctx, ox, oy, or);
    // 2.3-3.45: the ring thickens into a striped band and unwinds to the upper right, then over the top.
    if (t > 2.25 && t < 3.6) {
      const u = smooth((t - 2.3) / 1.15);
      const w = lerp(18, 64, u);
      const th0 = lerp(-0.2, -2.6, u);
      ribbon(ctx, { cx: ox, cy: oy, a: or * 1.18, k: lerp(0.02, 0.2, u), th0, th1: th0 + lerp(1.8 * Math.PI, 1.25 * Math.PI, u), w, tilt: 0.92, rot: 0, stripes: BAND3, tIn: 0.08, tOut: 0.35, alpha: t > 3.45 ? 1 - (t - 3.45) / 0.15 : clamp((t - 2.25) / 0.1) });
    }
    if (t >= 3.6 && t < 5.25) orb(ctx, ox, oy, or);
    // 3.45-4.3: the camera passes through the band: a very wide striped arc sweeps over the right side,
    // a thinner one hugs the left edge.
    if (t > 3.47 && t < 4.36) {
      const u = smooth((t - 3.45) / 0.85);
      const a = t < 3.5 ? (t - 3.47) / 0.03 : 1;
      // Measured at 3.7 s: inner edge from (700, 1080) to (1180, 0), outer edge to (1470, 0); at 4.1 s
      // the whole band has moved ~500 px to the right.
      // Measured on the user video: the band's left edge is a near-straight slant (470 px right over
      // 920 px up); at y=1000 it is at x = BANDX(t), and the band is ~545 px wide when it comes in.
      const xb = lin(BANDX, t), bw = lerp(560, 1100, smooth((t - 3.55) / 0.15)), R = 6000;
      const nx = 0.891, ny = 0.455, mx = xb + 195, my = 540;
      ribbon(ctx, { cx: mx + nx * R, cy: my + ny * R, a: R - bw / 2, k: 0, th0: -2.6697 - 0.16, th1: -2.6697 + 0.16, w: bw, wEnd: bw, tilt: 1, rot: 0, stripes: BANDR, tIn: 0.001, tOut: 0.001, alpha: a });
      // The thinner loop on the left (measured: right edge at y=1000 from x 222 to 114, its top crossing
      // y=80 between x 500 and 1060 at the start, gone from the top by 4.15).
      const v = clamp((t - 3.5) / 0.65);
      ribbon(ctx, { cx: lerp(900, 640, v), cy: lerp(1100, 1180, v), a: lerp(800, 600, v), k: 0, th0: Math.PI * 0.85, th1: Math.PI * lerp(1.64, 1.6, v), w: lerp(230, 130, v), wEnd: lerp(150, 60, v), tilt: lerp(1.3, 1.45, v), rot: 0, stripes: BAND3, tIn: 0.05, tOut: 0.3, alpha: a * (t > 4.15 ? clamp(1 - (t - 4.15) / 0.15) : 1) });
    }
    // 4.3-5.0: the band comes down from the top right and wraps under the orb; 5.0-5.25 it collapses.
    if (t > 4.25 && t < 5.3) {
      const u = smooth((t - 4.3) / 0.7);
      const c = clamp((t - 5.0) / 0.25);
      const front = (th0, th1) => ribbon(ctx, { cx: ox, cy: oy + 10, a: lerp(or * 2.4, or * 1.75, u), k: lerp(0.12, 0.03, u), th0, th1, w: lerp(150, 72, u) * (1 - c), tilt: lerp(0.95, 0.52, u), rot: lerp(-0.45, -0.8, u), stripes: BAND3, tIn: 0.12, tOut: 0.3, alpha: (t < 4.35 ? (t - 4.25) / 0.1 : 1) * (1 - c * 0.6) });
      front(lerp(-1.2, -0.3, u), lerp(-1.2, -0.3, u) + lerp(1.2 * Math.PI, 2.0 * Math.PI, u));
    }
    if (t >= 5.25 && markA < 1) orb(ctx, ox, oy, or);
    const gl = t > 5.1 && t < 5.9 ? Math.sin(Math.PI * (t - 5.1) / 0.8) : 0;
    if (!L) orbMark(ctx, ox, oy, or, smooth((t - 5.05) / 0.25));
    else if (markA > 0) {
      // The user's sphere (top part of x360-logo.png) sits on the drawn orb: same centre and size.
      const m = L.mark, s2 = (2 * or) / m.orbH;
      ctx.globalAlpha = markA; ctx.drawImage(m.canvas, ox - m.orbCx * s2, oy - m.orbCy * s2, m.canvas.width * s2, m.canvas.height * s2); ctx.globalAlpha = 1;
    }
    if (gl > 0) { const g = ctx.createRadialGradient(ox, oy - or * 0.6, 0, ox, oy - or * 0.6, or * 1.2); g.addColorStop(0, `rgba(190,240,60,${0.55 * gl})`); g.addColorStop(1, 'rgba(190,240,60,0)'); ctx.fillStyle = g; ctx.fillRect(ox - 2 * or, oy - 2 * or, 4 * or, 3 * or); }
    if (wordA > 0) {
      // The word (bottom part) fills the measured word box 497-1406 x 664-821.
      const wc = L.word, bw = 909, bh = 158; const s3 = Math.min(bw / wc.width, bh / wc.height);
      const w = wc.width * s3, h = wc.height * s3;
      ctx.globalAlpha = wordA; ctx.drawImage(wc, 951.5 - w / 2, 742.5 - h / 2, w, h); ctx.globalAlpha = 1;
    }
  }

  // ---------- the user's logo files ----------
  // x360-logo.png: sphere above, word below (split at the widest transparent row band; without one
  // the whole picture is the sphere). ps5-logo.png: symbol left, word right (split at the widest
  // transparent column band); the symbol is used, white, where the menu shows the console's mark.
  function alphaOf(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { c, d: g.getImageData(0, 0, c.width, c.height).data };
  }
  function bbox(d, w, x0, y0, x1, y1) {
    let a = x1, b = y1, c = x0 - 1, e = y0 - 1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y; }
    return c < a ? null : [a, b, c + 1, e + 1];
  }
  function crop(src, [x0, y0, x1, y1]) { const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0; c.getContext('2d').drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0); return c; }
  function widestGap(filled, lo, hi) {
    let best = null, s = -1;
    for (let i = lo; i <= hi; i++) { if (i < hi && !filled[i]) { if (s < 0) s = i; } else if (s >= 0) { if (!best || i - s > best[1] - best[0]) best = [s, i]; s = -1; } }
    return best;
  }
  function prepLogo(img, kind) {
    if (img.__prep && img.__prep[kind]) return img.__prep[kind];
    const { c, d } = alphaOf(img); const w = c.width, h = c.height;
    const rows = new Array(h).fill(false), cols = new Array(w).fill(false);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { rows[y] = true; cols[x] = true; }
    let out;
    if (kind === 'x360') {
      const gap = widestGap(rows, Math.floor(h * 0.2), Math.ceil(h * 0.85));
      const top = bbox(d, w, 0, 0, w, gap ? gap[0] : h) || [0, 0, w, h];
      const mc = crop(c, top);
      // The sphere inside the top part: its widest filled row span gives the diameter.
      const md = alphaOf(mc).d; let best = [0, 0, 0];
      for (let y = 0; y < mc.height; y++) { let a = -1, b = -1; for (let x = 0; x < mc.width; x++) if (md[(y * mc.width + x) * 4 + 3] > 20) { if (a < 0) a = x; b = x; } if (b - a > best[2] - best[1]) best = [y, a, b]; }
      const orbH = Math.max(best[2] - best[1] + 1, 1);
      const sb = bbox(md, mc.width, best[1], 0, best[2] + 1, mc.height) || [0, 0, mc.width, mc.height];
      out = { mark: { canvas: mc, orbH, orbCx: (best[1] + best[2] + 1) / 2, orbCy: (sb[1] + sb[3]) / 2 }, word: gap ? crop(c, bbox(d, w, 0, gap[1], w, h) || [0, gap[1], w, h]) : null };
    } else {
      const gap = widestGap(cols, Math.floor(w * 0.05), Math.ceil(w * 0.95));
      const box = bbox(d, w, 0, 0, gap && gap[1] - gap[0] > w * 0.03 ? gap[0] : w, h) || [0, 0, w, h];
      const mc = crop(c, box); const g = mc.getContext('2d');
      g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, mc.width, mc.height);
      out = { mark: { canvas: mc }, url: mc.toDataURL('image/png') };
    }
    img.__prep = { ...(img.__prep || {}), [kind]: out };
    return out;
  }
  async function markUrl(url, kind) { const img = await loadImage(url); if (!img) return null; const p = prepLogo(img, kind); return kind === 'x360' ? p.mark.canvas.toDataURL('image/png') : p.url; }

  const DUR = { ps5: PS5.total, x360: X.total };
  const FADE = { ps5: PS5.fadeOut, x360: X.fadeOut };
  function frame(kind, ctx, t, opt) { (kind === 'x360' ? x360Frame : ps5Frame)(ctx, t, opt); }

  function loadImage(url) { return new Promise((res) => { if (!url) { res(null); return; } const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }); }

  // ---------- player ----------
  class Player {
    constructor(el, { sound, markPath } = {}) { this.el = el; this.sound = sound; this.markPath = markPath; this.active = null; }
    get on() { return !!this.active; }
    // files: { video, audio, logo }. fadeIn: ms from transparent to covering (0 at app start).
    // onCovered runs once the screen is fully covered (switch the menu underneath there).
    play(kind, files = {}, { fadeIn = 0, onCovered, volume = 0.6, muted = false, fadeOut: fo, text = '' } = {}) {
      const fadeOut = fo || (files.video ? 520 : FADE[kind]);
      if (this.active) this.active.finish(true);
      const el = this.el; el.innerHTML = ''; el.className = 'on'; el.style.transition = 'none'; el.style.opacity = fadeIn ? '0' : '1';
      let resolve; const done = new Promise((r) => { resolve = r; });
      const st = { kind, finished: false, raf: 0, stopAudio: null, media: null };
      this.active = st;
      const finish = (quick, video) => {
        if (st.finished) return; st.finished = true;
        cancelAnimationFrame(st.raf); clearTimeout(st.wait);
        if (!revealed) reveal();
        if (st.stopAudio) st.stopAudio(quick ? 0.15 : video ? fadeOut / 1000 : 0.6);
        el.style.transition = `opacity ${quick ? 300 : fadeOut}ms cubic-bezier(0.33, 0, 0.2, 1)`; el.style.opacity = '0';
        setTimeout(() => { if (st.media) { try { st.media.pause(); } catch { /* */ } } if (this.active === st) { this.active = null; el.className = ''; el.innerHTML = ''; } resolve(); }, (quick ? 300 : fadeOut) + 20);
      };
      st.finish = finish;
      const covered = () => { if (onCovered) { try { onCovered(); } catch (e) { console.warn(e); } } };
      let revealed = false;
      const reveal = () => { if (revealed) return; revealed = true; if (fadeIn) { requestAnimationFrame(() => { el.style.transition = `opacity ${fadeIn}ms linear`; el.style.opacity = '1'; }); setTimeout(covered, fadeIn + 20); } else covered(); };
      if (!files.video) reveal();
      const fromStart = () => {
        reveal();
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; el.appendChild(cv); const ctx = cv.getContext('2d');
        let audio = null;
        if (files.audio && !muted) {
          audio = new Audio(files.audio); audio.volume = clamp(volume); st.media = audio;
          audio.play().catch(() => { audio = null; st.stopAudio = this.sound && !muted ? this.sound.bootSynth(kind) : null; });
          st.stopAudio = (s) => { if (!audio) return; const a = audio; const v0 = a.volume; const t0 = performance.now(); const step = () => { const u = (performance.now() - t0) / (s * 1000); if (u >= 1) { a.pause(); return; } a.volume = v0 * (1 - u); requestAnimationFrame(step); }; step(); };
        } else if (this.sound && !muted) st.stopAudio = this.sound.bootSynth(kind);
        Promise.all([loadImage(files.logo), Promise.resolve(this.markPath ? new Path2D(this.markPath) : null)]).then(([logo, mark]) => {
          const t0 = performance.now();
          const draw = () => {
            if (st.finished) return;
            // Follow the user's sound when there is one, so picture and sound stay together.
            const t = audio && !audio.paused && audio.currentTime > 0 ? audio.currentTime : (performance.now() - t0) / 1000;
            frame(kind, ctx, t, { logo, mark, text });
            if (t >= DUR[kind]) { finish(false); return; }
            st.raf = requestAnimationFrame(draw);
          };
          draw();
        });
      };
      if (files.video) {
        // The user's own video, full screen with its sound. files.start/end trim it (intro.json).
        // At `end` (or the real end) the layer fades into the menu while the video keeps running
        // under the fade, so there is no frozen or black frame between the two.
        const v = document.createElement('video'); v.preload = 'auto'; v.playsInline = true; v.muted = muted; v.volume = clamp(volume);
        const start = files.start || 0; const end = files.end || 0;
        st.media = v; el.appendChild(v);
        let failed = false, started = false;
        const fail = () => { if (failed || st.finished) return; failed = true; v.remove(); st.media = null; clearTimeout(st.wait); if (!started) { started = true; begin(); } fromStart(); };
        v.addEventListener('error', fail);
        v.addEventListener('ended', () => finish(false, true));
        const watch = () => { if (st.finished || failed) return; if (end && v.currentTime >= end) { finish(false, true); return; } st.raf = requestAnimationFrame(watch); };
        const go = () => { if (st.finished || failed) return; v.play().then(watch).catch(() => { v.muted = true; v.play().then(watch).catch(fail); }); };
        let begin = () => {};
        const ready = () => { if (started || failed) return; started = true; clearTimeout(st.wait); begin(); };
        v.addEventListener('loadeddata', () => { if (start && Math.abs(v.currentTime - start) > 0.05) { v.currentTime = start; v.addEventListener('seeked', ready, { once: true }); } else ready(); }, { once: true });
        st.wait = setTimeout(fail, 2500);
        v.src = files.video;
        st.stopAudio = (s) => { const v0 = v.volume; const t0 = performance.now(); const step = () => { const u = (performance.now() - t0) / (s * 1000); if (u >= 1 || st.media !== v) return; v.volume = v0 * (1 - u); requestAnimationFrame(step); }; step(); };
        // Show the first frame only once it is decoded; for a switch the menu fades into it.
        begin = () => { reveal(); if (fadeIn) setTimeout(go, fadeIn + 20); else go(); };
            } else fromStart();
      return done;
    }
    skip() { if (this.active) this.active.finish(true); }
  }

  root.BOOT = { frame, DUR, FADE, Player, PS5, X, ORB, loadImage, prepLogo, markUrl };
})(typeof window !== 'undefined' ? window : globalThis);
