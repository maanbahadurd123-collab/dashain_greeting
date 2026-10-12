/* ==========================================================================
   Dashain 2083 — cinematic greeting
   One scene, one clock, one requestAnimationFrame loop.

   Sections
     1. helpers & config
     2. state machine (intro → opening → kiteReveal → divineReveal → greeting, + about overlay)
     3. names / URL / share
     4. audio
     5. layout measuring (deity, greeting, gift) and text fitting
     6. sky renderer: gradient, light, rays, halo, clouds
     7. kites: sprites, placement, launch + wind, strings
     8. main loop
     9. UI wiring
   ========================================================================== */
(() => {
  'use strict';

  /* ---------------- 1. helpers & config ---------------- */
  const CFG = window.DASHAIN_CONFIG || {};
  const MUSIC = CFG.music || {};
  const DEITY = CFG.deity || {};
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOut4 = (t) => 1 - Math.pow(1 - t, 4);
  const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; };

  const stage = $('stage'), skyEl = $('sky'), fgEl = $('fg');
  const layoutEl = $('layout'), deityEl = $('deity'), deityImg = $('deityImg');
  const greetingEl = $('greeting'), giftEl = $('gift'), aboutEl = $('about');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = reduceMotion ? 2.4 : 1;           // timeline runs faster for reduced motion

  /* Scene timeline, in ms since the reveal button was pressed */
  const TL = {
    kiteLaunch: 950,          // kites burst out of the gift
    kiteState: 1500,          // 'kiteReveal'
    divineState: 3300,        // 'divineReveal': sky opens
    brightenA: 2600, brightenB: 7200,
    sunMoveA: 3300, sunMoveB: 5600,
    haloA: 4200, haloB: 7000,
    partA: 3600, partB: 7400,
    emerge: 4300,             // goddess begins to appear
    greeting: 6800            // text appears
  };

  /* ---------------- 2. state machine ---------------- */
  const ORDER = ['intro', 'opening', 'kiteReveal', 'divineReveal', 'greeting'];
  const CLASS_AT = { opening: 'st-opening', kiteReveal: 'st-kite', divineReveal: 'st-divine', greeting: 'st-greeting' };
  let scene = 'intro';        // the underlying scene
  let mode = 'scene';         // 'scene' | 'about'  (about is an overlay state)
  let returnTo = null;        // scene to restore when About closes
  let T = 0;                  // scene clock (ms). Frozen while About is open, so closing never replays anything.
  let started = false;

  function setScene(next) {
    if (ORDER.indexOf(next) <= ORDER.indexOf(scene)) return;   // only moves forward, no duplicates
    scene = next;
    const idx = ORDER.indexOf(next);
    ORDER.forEach((s, i) => { if (CLASS_AT[s]) stage.classList.toggle(CLASS_AT[s], i <= idx); });
    if (mode !== 'about') stage.dataset.state = scene;
  }

  function reveal() {
    if (scene !== 'intro' || started) return;       // ignore duplicate clicks
    started = true;
    $('openBtn').disabled = true;
    giftEl.parentNode.querySelector('#intro').setAttribute('inert', '');
    giftEl.classList.add('loosen', 'open');
    stage.classList.add('is-started');
    setScene('opening');
    startAudio();                                    // user gesture → playback allowed
    measure();
  }

  /* ---------------- 3. names / URL / share ---------------- */
  const names = { from: '', to: '' };
  const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);

  function readNamesFromUrl() {
    let q;
    try { q = new URL(window.location.href).searchParams; } catch (e) { q = new URLSearchParams(''); }
    const d = CFG.defaults || {};
    names.from = cleanName(q.get('from') || d.from);
    names.to = cleanName(q.get('to') || d.to);
  }

  function buildShareUrl() {
    const u = new URL(window.location.href);
    u.search = ''; u.hash = '';
    if (names.from) u.searchParams.set('from', names.from);
    if (names.to) u.searchParams.set('to', names.to);
    return u.toString();
  }

  function renderNames() {
    // untrusted input → textContent only
    $('gTo').textContent = names.to ? 'Happy Dashain, ' + names.to + '!' : 'Happy Dashain!';
    const f = $('gFrom');
    if (names.from) { f.textContent = 'With love, ' + names.from; f.hidden = false; } else { f.textContent = ''; f.hidden = true; }
    $('iSub').textContent = names.to ? 'A little Dashain surprise awaits you, ' + names.to + '.' : 'A little Dashain surprise awaits you.';
    const has = !!(names.from || names.to);
    $('namesBtn1').textContent = has ? 'Edit names' : 'Add names';
    $('namesBtn2').textContent = has ? 'Edit names' : 'Add names';
    $('fromIn').value = names.from; $('toIn').value = names.to;
    fitGreeting();
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function copyViaExecCommand(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* permission denied → fall through */ }
    }
    return copyViaExecCommand(text);
  }

  function showManualCopy(url) {
    closeSheets();
    const sheet = $('copySheet'), input = $('copyIn');
    input.value = url; sheet.hidden = false;
    input.focus(); input.select();
  }

  async function share() {
    const url = buildShareUrl();
    const who = names.to ? names.to + ', ' : '';
    const payload = {
      title: 'शुभ विजयादशमी २०८३ · Happy Dashain',
      text: who + 'a little Dashain surprise, wrapped just for you.',
      url
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      try { await navigator.share(payload); toast('Shared · धन्यवाद'); return; }
      catch (err) {
        if (err && err.name === 'AbortError') return;       // cancelled: never claim it was shared
        /* any other failure → fall back to copying */
      }
    }
    if (await copyText(url)) toast('Link copied · Paste it anywhere');
    else showManualCopy(url);
  }

  /* ---------------- 4. audio ---------------- */
 
  /* ---------------- 4. audio ---------------- */
  const audio = new Audio();
  audio.loop = false; // We control the selected section ourselves.
  audio.volume = clamp(typeof MUSIC.volume === 'number' ? MUSIC.volume : 0.6);
  audio.preload = 'auto';

  const AUDIO_START = Math.max(0, Number(MUSIC.startTime) || 0);
  const AUDIO_END = Number(MUSIC.endTime) || 0;

  let audioFailed = !MUSIC.src;
  let audioReadyHandler = null;
  const soundBtn = $('soundBtn');

  function paintSound() {
    const on = !audio.paused && !audioFailed;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute(
      'aria-label',
      audioFailed ? 'Music unavailable' : on ? 'Turn music off' : 'Turn music on'
    );
    soundBtn.title = audioFailed ? 'Music unavailable' : on ? 'Music on' : 'Music off';
  }

  audio.addEventListener('play', paintSound);
  audio.addEventListener('pause', paintSound);

  audio.addEventListener('error', () => {
    audioFailed = true;
    paintSound();
  });

  function playAudio() {
    const p = audio.play();

    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === 'NotAllowedError') {
          paintSound();
          return;
        }
        audioFailed = true;
        paintSound();
      });
    }
  }

  function startAudio() {
    if (!MUSIC.src) {
      $('sound').hidden = true;
      return;
    }

    if (!audio.src) {
      audio.src = MUSIC.src;
    }

    // Wait for duration/metadata before seeking if necessary.
    if (audio.readyState >= 1) {
      audio.currentTime = AUDIO_START;
      playAudio();
    } else {
      if (audioReadyHandler) {
        audio.removeEventListener('loadedmetadata', audioReadyHandler);
      }

      audioReadyHandler = () => {
        audio.removeEventListener('loadedmetadata', audioReadyHandler);
        audioReadyHandler = null;

        if (AUDIO_END > 0 && AUDIO_END <= audio.duration) {
          audio.currentTime = AUDIO_START;
          playAudio();
        } else {
          audioFailed = true;
          paintSound();
          toast('Check startTime and endTime in config.js');
        }
      };

      audio.addEventListener('loadedmetadata', audioReadyHandler);
      audio.load();
    }
  }

  // Stop at the configured endpoint and repeat only the selected section.
  audio.addEventListener('timeupdate', () => {
    if (AUDIO_END <= AUDIO_START || !audio.duration) return;
    if (audio.currentTime < AUDIO_END) return;

    if (MUSIC.loop !== false) {
      audio.currentTime = AUDIO_START;

      if (!audio.paused) {
        playAudio();
      }
    } else {
      audio.pause();
      audio.currentTime = AUDIO_START;
    }
  });

  function toggleSound() {
    if (audioFailed) {
      toast('No music file found — see config.js');
      return;
    }

    if (!audio.src) {
      audio.src = MUSIC.src;
    }

    if (audio.paused) {
      if (audio.readyState >= 1) {
        if (
          audio.currentTime < AUDIO_START ||
          (AUDIO_END > 0 && audio.currentTime >= AUDIO_END)
        ) {
          audio.currentTime = AUDIO_START;
        }

        playAudio();
      } else {
        startAudio();
      }
    } else {
      audio.pause();
    }
  }


  /* ---------------- 5. layout measuring + fitting ---------------- */
  let W = 0, H = 0, DPR = 1;
  const geo = {
    gift: { x: 0, y: 0 },
    deity: { l: 0, t: 0, r: 0, b: 0, cx: 0, cy: 0, h: 0 },
    text: { l: 0, t: 0, r: 0, b: 0 }
  };

  function measure() {
    const sr = stage.getBoundingClientRect();
    const g = giftEl.getBoundingClientRect();
    geo.gift.x = g.left - sr.left + g.width / 2;
    geo.gift.y = g.top - sr.top + g.height * .3;

    const d = deityEl.getBoundingClientRect();
    const aspect = DEITY.aspect || .75;
    const cw = Math.min(d.width, d.height * aspect);
    const cx = d.left - sr.left + d.width / 2;
    geo.deity.l = cx - cw / 2; geo.deity.r = cx + cw / 2;
    geo.deity.t = d.top - sr.top; geo.deity.b = d.bottom - sr.top;
    geo.deity.cx = cx; geo.deity.h = d.height;
    geo.deity.cy = geo.deity.t + d.height * (typeof DEITY.haloY === 'number' ? DEITY.haloY : .4);

    const t = greetingEl.getBoundingClientRect();
    geo.text.l = t.left - sr.left; geo.text.r = t.right - sr.left;
    geo.text.t = t.top - sr.top; geo.text.b = t.bottom - sr.top;
  }

  /* Shrink the greeting (a CSS variable) until it fits next to / under the goddess — never scroll. */
  function fitGreeting() {
    let gs = 1;
    greetingEl.style.setProperty('--gs', gs);
    const landscape = window.matchMedia('(min-aspect-ratio: 6/5)').matches;
    const cs = getComputedStyle(layoutEl);
    const avail = layoutEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const reserve = landscape ? 0 : Math.max(150, avail * .3);     // deity keeps at least ~30% of the height
    let guard = 0;
    while (greetingEl.offsetHeight > avail - reserve && gs > .52 && guard++ < 40) {
      gs -= .03;
      greetingEl.style.setProperty('--gs', gs.toFixed(2));
    }
    measure();
    placeKites();
  }

  /* About overlay: shrink type, then switch to two columns, until it fits — never scroll. */
  function fitAbout() {
    const panel = $('aboutPanel');
    panel.classList.remove('cols');
    const base = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const maxFs = Math.min(1.2 * base, Math.max(14, Math.min(window.innerWidth / 24, 21)));
    const tryFit = () => {
      let fs = maxFs, guard = 0;
      panel.style.setProperty('--afs', fs + 'px');
      while (panel.scrollHeight > panel.clientHeight + 1 && fs > 11 && guard++ < 60) {
        fs -= .5; panel.style.setProperty('--afs', fs + 'px');
      }
      return panel.scrollHeight <= panel.clientHeight + 1;
    };
    if (!tryFit()) {
      panel.classList.add('cols');
      tryFit();
    }
  }

  /* ---------------- 6. sky renderer ---------------- */
  const sctx = skyEl.getContext('2d');
  const fctx = fgEl.getContext('2d');

  function makeCloud(seed) {
    const r = rng(seed), puffs = [], n = 15 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), bell = Math.sin(t * Math.PI);
      puffs.push([70 + t * 500 + (r() - .5) * 46, 176 - bell * 62 * (.6 + r() * .6) + (r() - .5) * 18, 32 + bell * 60 * (.5 + r() * .7)]);
    }
    for (let i = 0; i < 6; i++) puffs.push([110 + i * 82 + (r() - .5) * 30, 196 + (r() - .5) * 8, 34 + r() * 20]);  // flat base
    return puffs;
  }
  function paintCloud(puffs, top, mid, bottom) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 280;
    const x = c.getContext('2d');
    for (const [px, py, pr] of puffs) {
      const g = x.createRadialGradient(px, py, pr * .12, px, py, pr);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'source-atop';
    const g = x.createLinearGradient(0, 40, 0, 250);
    g.addColorStop(0, top); g.addColorStop(.5, mid); g.addColorStop(1, bottom);
    x.fillStyle = g; x.fillRect(0, 0, 640, 280);
    return c;
  }

  const clouds = [];
  (function buildClouds() {
    const r = rng(7);
    const defs = [];
    for (let i = 0; i < 6; i++) defs.push({ layer: 'far', x: i / 6 + r() * .08, y: .08 + r() * .3, s: .35 + r() * .25, a: .5, v: 6e-6 + r() * 4e-6, d: .35 });
    for (let i = 0; i < 5; i++) defs.push({ layer: 'mid', x: i / 5 + r() * .1, y: .3 + r() * .32, s: .6 + r() * .35, a: .78, v: 1.1e-5 + r() * 6e-6, d: .7 });
    for (let i = 0; i < 7; i++) defs.push({ layer: 'bank', x: i / 7 + r() * .05, y: .9 + r() * .1, s: 1.2 + r() * .7, a: .96, v: 5e-6 + r() * 3e-6, d: 1 });
    defs.forEach((d, i) => {
      const puffs = makeCloud(31 + i * 17);
      d.cool = paintCloud(puffs, '#f4f9ff', '#c7dbf6', '#7e9cca');
      d.warm = paintCloud(puffs, '#fff7e0', '#ffdcae', '#d98f6c');
      clouds.push(d);
    });
  })();

  const P = { light: .12, glow: 0, giftGlow: 0, halo: 0, part: 0, sunX: 0, sunY: 0, ambient: 1 };
  const mouse = { x: .5, y: .5, tx: .5, ty: .5 };

  function drawClouds(ctx, layer, now) {
    const warm = clamp(P.light * 1.15 - .12);
    for (const c of clouds) {
      if (c.layer !== layer) continue;
      const w = 640 * c.s * (W / 1280 * .55 + .45) * (layer === 'bank' ? 1.0 : 1), h = 280 * c.s * (W / 1280 * .55 + .45);
      const span = 1.5;
      let nx = ((c.x + now * c.v * (reduceMotion ? 0 : 1)) % span + span) % span - .25;
      let px = nx * W;
      const cxm = px + w / 2;
      let a = c.a;
      if (layer !== 'bank') {
        const dist = (cxm - P.sunX) / (W * .5);
        const centre = 1 - clamp(Math.abs(dist));
        px += P.part * Math.sign(dist || 1) * W * .2 * c.d * (.4 + centre);
        a *= 1 - P.part * .8 * centre;
      } else {
        a *= lerp(1, .62, P.glow);
      }
      px += (mouse.x - .5) * -26 * c.d;
      const py = c.y * H - h * .55 + (mouse.y - .5) * -10 * c.d;
      ctx.globalAlpha = a * (1 - warm);
      ctx.drawImage(c.cool, px, py, w, h);
      ctx.globalAlpha = a * warm;
      ctx.drawImage(c.warm, px, py, w, h);
    }
    ctx.globalAlpha = 1;
  }

  function drawSky(ctx, now) {
    const L = P.light;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix('#04153f', '#1450ae', L));
    g.addColorStop(.5, mix('#0c3a8c', '#3d88dc', L));
    g.addColorStop(1, mix('#2a5ea6', '#a9d3f3', L));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // ambient low sun (intro) — fades as the divine light takes over
    if (P.ambient > .01) {
      const ax = W * .8, ay = H * .2, R = Math.max(W, H) * .5;
      const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, R);
      ag.addColorStop(0, `rgba(255,224,160,${.5 * P.ambient})`); ag.addColorStop(.35, `rgba(255,190,110,${.16 * P.ambient})`); ag.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawLight(ctx, now) {
    ctx.globalCompositeOperation = 'screen';
    // the gift's light: a warm bloom and a soft upward beam
    if (P.giftGlow > .01) {
      const gx = geo.gift.x, gy = geo.gift.y, R = Math.min(W, H) * (.3 + .25 * P.giftGlow);
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
      gg.addColorStop(0, `rgba(255,240,190,${.85 * P.giftGlow})`); gg.addColorStop(.4, `rgba(255,205,110,${.3 * P.giftGlow})`); gg.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = gg; ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
    }
    // the divine light: grows from the gift's glow and settles behind the goddess
    if (P.glow > .01) {
      const sx = P.sunX, sy = P.sunY, R = Math.max(W, H) * .62 * (.55 + .45 * P.glow);
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      sg.addColorStop(0, `rgba(255,236,176,${.78 * P.glow})`);
      sg.addColorStop(.22, `rgba(255,214,126,${.42 * P.glow})`);
      sg.addColorStop(.55, `rgba(255,186,90,${.14 * P.glow})`);
      sg.addColorStop(1, 'rgba(255,186,90,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

      // very slow god-rays (restrained)
      const rays = 16, rot = reduceMotion ? 0 : now * 3.2e-5, rl = Math.max(W, H) * .95;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, rl);
      rg.addColorStop(0, `rgba(255,232,170,${.2 * P.glow})`); rg.addColorStop(1, 'rgba(255,232,170,0)');
      ctx.fillStyle = rg;
      for (let i = 0; i < rays; i++) {
        const a = rot + i * (Math.PI * 2 / rays), w = .045 + (i % 3) * .022;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a - w) * rl, sy + Math.sin(a - w) * rl);
        ctx.lineTo(sx + Math.cos(a + w) * rl, sy + Math.sin(a + w) * rl);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* A fine halo: soft disc + two thin rings + a ring of tiny petal ticks, drawn into the light, not around an outline */
  function drawHalo(ctx, now) {
    if (P.halo < .01) return;
    const cx = geo.deity.cx, cy = geo.deity.cy;
    const R = Math.min(geo.deity.h * .46, Math.max(W * .3, 90));
    const a = P.halo;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const dg = ctx.createRadialGradient(cx, cy, R * .1, cx, cy, R * 1.05);
    dg.addColorStop(0, `rgba(255,240,196,${.62 * a})`); dg.addColorStop(.6, `rgba(255,214,128,${.3 * a})`); dg.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(1, R * .006);
    ctx.strokeStyle = `rgba(255,232,170,${.34 * a})`;
    ctx.beginPath(); ctx.arc(cx, cy, R * .86, 0, 7); ctx.stroke();
    ctx.strokeStyle = `rgba(255,232,170,${.18 * a})`;
    ctx.beginPath(); ctx.arc(cx, cy, R * .96, 0, 7); ctx.stroke();
    const n = 48, rot = reduceMotion ? 0 : now * 1.2e-5;
    ctx.fillStyle = `rgba(255,232,170,${.4 * a})`;
    for (let i = 0; i < n; i++) {
      const t = rot + i / n * Math.PI * 2, rr = R * .91;
      ctx.beginPath(); ctx.arc(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, Math.max(.8, R * .0065), 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 7. kites ---------------- */
  const PALETTES = [
    ['#d7262f', '#ffd24a', '#fff2c4'], ['#f08a1c', '#c1272d', '#ffe08a'], ['#1f64d6', '#fff6e0', '#ffd24a'],
    ['#e03a8e', '#ffc23d', '#fff2c4'], ['#12a37f', '#ffe14d', '#fff6e0'], ['#7b3fc4', '#ff8fb1', '#ffe6a0'],
    ['#c1272d', '#fff6e0', '#ffd24a'], ['#18a9d6', '#ffcf3d', '#ffffff']
  ];
  const sprites = PALETTES.map(makeKiteSprite);

  function makeKiteSprite(p) {
    const SW = 150, SH = 210, c = document.createElement('canvas');
    c.width = SW; c.height = SH;
    const x = c.getContext('2d');
    const top = [SW / 2, 6], right = [SW - 6, 6 + (SH - 12) * .4], bot = [SW / 2, SH - 6], left = [6, 6 + (SH - 12) * .4], m = [SW / 2, right[1]];
    const tri = (a, b, d, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...d); x.closePath(); x.fill(); };
    tri(top, left, m, p[0]); tri(top, right, m, p[1]); tri(bot, right, m, p[0]); tri(bot, left, m, p[1]);
    // translucent paper: lighter heart, darker edges
    const rg = x.createRadialGradient(m[0], m[1], 4, m[0], m[1], SH * .55);
    rg.addColorStop(0, 'rgba(255,255,255,.34)'); rg.addColorStop(1, 'rgba(0,0,0,.16)');
    x.fillStyle = rg; x.beginPath(); x.moveTo(...top); x.lineTo(...right); x.lineTo(...bot); x.lineTo(...left); x.closePath(); x.fill();
    // spars + border
    x.strokeStyle = 'rgba(255,238,196,.78)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(...top); x.lineTo(...bot); x.moveTo(...left); x.lineTo(...right); x.stroke();
    x.strokeStyle = 'rgba(70,30,10,.45)'; x.lineWidth = 2.4; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(...top); x.lineTo(...right); x.lineTo(...bot); x.lineTo(...left); x.closePath(); x.stroke();
    return { c, SW, SH, px: m[0], py: m[1], tail: p[2] };
  }

  const kites = [];
  let nearBudget = 0;
  function buildKites() {
    const small = Math.min(window.innerWidth, window.innerHeight) < 560;
    const weak = (navigator.hardwareConcurrency || 4) <= 4;
    const total = small ? 12 : weak ? 16 : 20;
    const counts = { far: Math.round(total * .38), mid: Math.round(total * .42), near: Math.max(2, Math.round(total * .15)) };
    const r = rng(2083); let id = 0;
    for (const layer of ['far', 'mid', 'near']) {
      for (let i = 0; i < counts[layer]; i++) {
        const depth = layer === 'far' ? .34 : layer === 'mid' ? .72 : 1.4;
        kites.push({
          id: id++, layer, depth, seed: 100 + id * 13,
          sprite: sprites[Math.floor(r() * sprites.length)],
          size: depth * (.92 + r() * .24),
          delay: r() * 650 + (layer === 'near' ? 0 : 80), dur: 1700 + r() * 1100,
          spin: (r() < .5 ? -1 : 1) * (2 + r() * 3), tilt: (r() - .5) * .55, arc: (r() - .5) * .5,
          f1: 4e-4 + r() * 5e-4, f2: 3e-4 + r() * 5e-4, ph: r() * 6.28,
          ax: 5 + r() * 11, ay: 4 + r() * 9, wind: .5 + r() * .9,
          hx: .5, hy: .3, anx: .5, any: 1.05
        });
      }
    }
  }

  function placeKites() {
    if (!W) return;
    const base = Math.min(W, H) * (W < 560 ? .17 : .15);
    const pad = Math.max(10, W * .015);
    const ex = [
      { l: geo.deity.l - pad, t: geo.deity.t - pad * .5, r: geo.deity.r + pad, b: geo.deity.b },
      { l: geo.text.l - pad * 1.5, t: geo.text.t - pad, r: geo.text.r + pad * 1.5, b: geo.text.b + pad }
    ];
    // keep the goddess' centre line clear of everything; leave a little room for far kites to peek behind her shoulders
    for (const k of kites) {
      const r = rng(k.seed), half = base * k.size * .55;
      k.px = base * k.size;
      let hx = .5, hy = .2, ok = false;
      for (let n = 0; n < 80 && !ok; n++) {
        if (k.layer === 'near') { hx = r() < .5 ? .01 + r() * .1 : .89 + r() * .1; hy = .12 + r() * .68; }
        else if (k.layer === 'mid') { hx = .03 + r() * .94; hy = .07 + r() * .62; }
        else { hx = .02 + r() * .96; hy = .05 + r() * .55; }
        const x = hx * W, y = hy * H;
        ok = ex.every((e) => !(x > e.l - half && x < e.r + half && y > e.t - half && y < e.b + half));
      }
      if (!ok) { hx = r() < .5 ? .05 : .95; hy = .08 + r() * .22; }
      k.hx = hx; k.hy = hy;
      k.anx = hx < .5 ? -.08 - r() * .12 : 1.08 + r() * .12;
      k.any = .8 + r() * .35;
    }
  }

  function drawKite(ctx, k, now, gust) {
    const p = clamp((T - TL.kiteLaunch - k.delay) / k.dur);
    if (!started || p <= 0) return;
    const e = easeOut4(p);
    const ox = geo.gift.x, oy = geo.gift.y - 6;
    const sway = reduceMotion ? 0 : 1;
    let x = lerp(ox, k.hx * W, e), y = lerp(oy, k.hy * H, e);
    // arced trajectory + celebratory spread
    const dx = k.hx * W - ox, dy = k.hy * H - oy, len = Math.hypot(dx, dy) || 1;
    x += (-dy / len) * k.arc * len * .5 * Math.sin(Math.PI * e);
    y += (dx / len) * k.arc * len * .5 * Math.sin(Math.PI * e);
    x += (Math.sin(now * k.f1 + k.ph) * k.ax + gust * 16 * k.wind) * k.depth * sway * easeOut(p);
    y += Math.cos(now * k.f2 + k.ph * 1.3) * k.ay * k.depth * sway * easeOut(p);
    x += (mouse.x - .5) * -40 * k.depth; y += (mouse.y - .5) * -22 * k.depth;
    const sz = k.px * lerp(.22, 1, easeOut(clamp(p / .4)));
    const rot = k.tilt + (1 - e) * k.spin + Math.sin(now * k.f1 * 1.4 + k.ph) * .1 * sway + gust * .06 * sway;
    const alpha = clamp(p / .1) * (k.layer === 'far' ? .82 : 1);
    const sc = sz / k.sprite.SH;

    // string: from the kite to a hand beyond the bottom corner, fading with distance
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const ax = x - sa * sz * .06, ay = y + ca * sz * .06;
    const ex = lerp(ox, k.anx * W, easeIO(p)), ey = lerp(oy, k.any * H, easeIO(p));
    const mx = (ax + ex) / 2, my = (ay + ey) / 2, dd = Math.hypot(ex - ax, ey - ay);
    const sag = dd * (.1 + .035 * Math.sin(now * .0011 + k.ph) * sway) * (ex > ax ? -1 : 1) + gust * dd * .05 * sway;
    ctx.save();
    ctx.globalAlpha = alpha;
    const sg = ctx.createLinearGradient(ax, ay, ex, ey);
    sg.addColorStop(0, 'rgba(255,255,255,.62)'); sg.addColorStop(.55, 'rgba(255,255,255,.2)'); sg.addColorStop(1, 'rgba(255,255,255,.04)');
    ctx.strokeStyle = sg; ctx.lineWidth = Math.max(.7, 1.1 * k.depth);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx + sag * .4, my + dd * .05 + sag, ex, ey); ctx.stroke();

    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
    ctx.drawImage(k.sprite.c, -k.sprite.px, -k.sprite.py);
    // tail: a slim ribbon with small bows, waving gently
    const ty0 = k.sprite.SH - 6 - k.sprite.py;
    ctx.strokeStyle = k.sprite.tail; ctx.fillStyle = k.sprite.tail; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, ty0);
    const seg = 24, wag = sway ? 1 : .4;
    const pts = [];
    for (let i = 1; i <= 5; i++) { const px = Math.sin(now * .0042 + k.ph + i * .9) * i * 3.6 * wag; const py = ty0 + i * seg; pts.push([px, py]); ctx.lineTo(px, py); }
    ctx.stroke();
    for (let i = 1; i < pts.length; i += 1) { ctx.save(); ctx.translate(pts[i][0], pts[i][1]); ctx.rotate(.7); ctx.fillRect(-4.5, -4.5, 9, 9); ctx.restore(); }
    ctx.restore();
  }

  /* ---------------- 8. main loop ---------------- */
  let last = 0, rafId = 0;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(48, now - (last || now)); last = now;
    if (started && mode !== 'about') T += dt * SPEED;

    // derive scene parameters from the single clock
    P.light = lerp(.12, 1, easeIO(range(T, TL.brightenA, TL.brightenB)) * (started ? 1 : 0)) + (started ? range(T, 0, 1400) * .08 : 0);
    P.light = clamp(P.light);
    P.ambient = 1 - range(T, TL.sunMoveA, TL.brightenB);
    const gIn = range(T, 450, 1500), gOut = range(T, TL.sunMoveA, TL.sunMoveB);
    P.giftGlow = started ? gIn * (1 - gOut) : 0;
    P.glow = easeIO(range(T, TL.sunMoveA, TL.haloB));
    const sunMove = easeIO(range(T, TL.sunMoveA, TL.sunMoveB));
    P.sunX = lerp(geo.gift.x, geo.deity.cx, sunMove);
    P.sunY = lerp(geo.gift.y, geo.deity.cy, sunMove);
    P.halo = easeIO(range(T, TL.haloA, TL.haloB));
    P.part = easeIO(range(T, TL.partA, TL.partB));

    // advance the scene (moves forward only; frozen with the clock while About is open)
    if (started && mode !== 'about') {
      if (scene === 'opening' && T >= TL.kiteState) setScene('kiteReveal');
      if (scene === 'kiteReveal' && T >= TL.divineState) setScene('divineReveal');
      if (T >= TL.emerge && !stage.classList.contains('st-emerge')) stage.classList.add('st-emerge');
      if (scene === 'divineReveal' && T >= TL.greeting) {
        setScene('greeting');
        stage.classList.add('st-text'); greetingEl.classList.add('live');
        measure(); placeKites();
      }
    }

    mouse.x += (mouse.tx - mouse.x) * .05; mouse.y += (mouse.ty - mouse.y) * .05;
    const gust = (Math.sin(now * .00031) * .6 + Math.sin(now * .00077 + 1.3) * .4) * (reduceMotion ? 0 : 1);

    // ---- sky canvas: sky, light, halo, far clouds, far kites, mid clouds, mid kites
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky(sctx, now);
    drawLight(sctx, now);
    drawHalo(sctx, now);
    drawClouds(sctx, 'far', now);
    for (const k of kites) if (k.layer === 'far') drawKite(sctx, k, now, gust);
    drawClouds(sctx, 'mid', now);
    for (const k of kites) if (k.layer === 'mid') drawKite(sctx, k, now, gust);

    // ---- foreground canvas: cloud bank (the gift rests in it) + near kites
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.clearRect(0, 0, W, H);
    drawClouds(fctx, 'bank', now);
    for (const k of kites) if (k.layer === 'near') drawKite(fctx, k, now, gust);
  }

  function resize() {
    W = stage.clientWidth || window.innerWidth; H = stage.clientHeight || window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, W * H > 1.2e6 ? 1.5 : 1.75);
    for (const c of [skyEl, fgEl]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    fitGreeting();
    if (mode === 'about') fitAbout();
  }

  function loop(on) {
    cancelAnimationFrame(rafId);
    if (on) { last = 0; rafId = requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', () => loop(!document.hidden));   // nothing runs in a hidden tab

  /* ---------------- 9. UI wiring ---------------- */
  const inertables = () => Array.from(document.querySelectorAll('[data-inertable]'));

  function openAbout() {
    if (mode === 'about') return;
    closeSheets();
    returnTo = scene; mode = 'about';
    stage.dataset.state = 'about';
    inertables().forEach((el) => el.setAttribute('inert', ''));
    aboutEl.classList.add('open'); aboutEl.setAttribute('aria-hidden', 'false');
    fitAbout();
    $('aboutClose').focus({ preventScroll: true });
  }
  function closeAbout() {
    if (mode !== 'about') return;
    mode = 'scene';
    aboutEl.classList.remove('open'); aboutEl.setAttribute('aria-hidden', 'true');
    inertables().forEach((el) => { if (!(el.id === 'intro' && started)) el.removeAttribute('inert'); });
    stage.dataset.state = returnTo || scene;      // exact scene, clock resumes, nothing replays
    $('aboutBtn').focus({ preventScroll: true });
  }

  function closeSheets() { $('namesSheet').hidden = true; $('copySheet').hidden = true; }
  function openNames() {
    closeSheets();
    $('fromIn').value = names.from; $('toIn').value = names.to;
    $('namesSheet').hidden = false;
    $('toIn').focus({ preventScroll: true });
  }

  function init() {
    // deity image (graceful fallback to the lotus emblem)
    if (DEITY.src) {
      deityImg.alt = DEITY.alt || 'Goddess Durga';
      deityImg.onload = () => { deityEl.classList.remove('no-image'); measure(); };
      deityImg.onerror = () => { deityEl.classList.add('no-image'); };
      deityImg.src = DEITY.src;
    }
    buildLotusEmblem();

    readNamesFromUrl();
    buildKites();
    resize();
    renderNames();
    measure(); placeKites();

    $('openBtn').addEventListener('click', reveal);
    giftEl.addEventListener('click', reveal);
    $('aboutBtn').addEventListener('click', openAbout);
    $('aboutClose').addEventListener('click', closeAbout);
    aboutEl.addEventListener('click', (e) => { if (e.target === aboutEl) closeAbout(); });
    $('shareBtn').addEventListener('click', share);
    soundBtn.addEventListener('click', toggleSound);
    const vol = $('vol'); vol.value = audio.volume; vol.addEventListener('input', () => { audio.volume = clamp(parseFloat(vol.value) || 0); });
    document.querySelectorAll('[data-names-open]').forEach((b) => b.addEventListener('click', openNames));
    $('namesCancel').addEventListener('click', closeSheets);
    $('copyClose').addEventListener('click', closeSheets);
    $('copyAgain').addEventListener('click', async () => { const u = $('copyIn').value; if (await copyText(u)) { toast('Link copied · Paste it anywhere'); closeSheets(); } else { $('copyIn').focus(); $('copyIn').select(); } });
    $('namesSheet').addEventListener('submit', (e) => {
      e.preventDefault();
      names.from = cleanName($('fromIn').value); names.to = cleanName($('toIn').value);
      try { window.history.replaceState(null, '', buildShareUrl()); } catch (err) { /* e.g. file:// — names still apply on screen */ }
      renderNames(); closeSheets();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (mode === 'about') closeAbout(); else closeSheets(); }
      if (e.key === 'Tab' && mode === 'about') { e.preventDefault(); $('aboutClose').focus(); }   // the only control inside the dialog
    });
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mouse.tx = e.clientX / W; mouse.ty = e.clientY / H; } }, { passive: true });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));
    window.addEventListener('scroll', () => window.scrollTo(0, 0), { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitGreeting(); if (mode === 'about') fitAbout(); });

    paintSound();
    if (!MUSIC.src) $('sound').hidden = true;
    loop(!document.hidden);

    // read-only handle for automated checks
    Object.defineProperty(window, '__dashain', { value: { get scene() { return scene; }, get mode() { return mode; }, get T() { return T; }, get kites() { return kites.length; }, get audioFailed() { return audioFailed; } } });
  }

  function buildLotusEmblem() {
    const svg = $('deityFallback'), NS = 'http://www.w3.org/2000/svg';
    const el = (n, a, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); (p || svg).appendChild(e); return e; };
    const defs = el('defs', {});
    const gl = el('radialGradient', { id: 'lgGold', cx: '.5', cy: '.5', r: '.5' }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff0b4' }, gl); el('stop', { offset: '1', 'stop-color': '#d79a2b' }, gl);
    const rd = el('linearGradient', { id: 'lgRed', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#e2453f' }, rd); el('stop', { offset: '1', 'stop-color': '#8f1217' }, rd);
    el('path', { id: 'lgPetal', d: 'M0 0C16-26 16-58 0-92-16-58-16-26 0 0Z' }, defs);
    const root = el('g', { transform: 'translate(150 200)' });
    const ring = (n, off, scale, fill, stroke) => {
      const g = el('g', { fill, stroke, 'stroke-width': '.9', 'stroke-linejoin': 'round' }, root);
      for (let i = 0; i < n; i++) el('use', { href: '#lgPetal', transform: `rotate(${i * 360 / n + off}) scale(${scale})` }, g);
    };
    ring(16, 0, 1.5, 'url(#lgGold)', '#8a5a12');
    ring(12, 15, 1.12, 'url(#lgRed)', '#ffe3a0');
    ring(8, 0, .66, 'url(#lgGold)', '#8a5a12');
    el('circle', { r: '34', fill: '#7f0f15', stroke: '#ffe3a0', 'stroke-width': '1.6' }, root);
    const t = el('text', { x: '0', y: '14', 'text-anchor': 'middle', 'font-size': '44', fill: '#ffe3a0', 'font-family': 'Tiro Devanagari Hindi, Noto Serif Devanagari, FreeSerif, serif' }, root);
    t.textContent = 'ॐ';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();