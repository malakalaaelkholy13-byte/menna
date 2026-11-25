(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const body = document.body;
  const intro = $('#intro');
  const openBtn = $('#openBtn');
  const bar = $('#bar');

  /* ==========================================================
     1. Cinematic opening
     ========================================================== */
  let introTimers = [];

  function startIntro() {
    introTimers.forEach(clearTimeout);
    introTimers = [];

    body.classList.add('is-locked');
    intro.hidden = false;
    intro.classList.remove('is-opening', 'is-done', 'is-playing', 'is-ready', 'is-static');
    bar.classList.remove('is-visible');
    window.scrollTo(0, 0);
    void intro.offsetWidth; // restart CSS animations

    if (reduceMotion) {
      intro.classList.add('is-static', 'is-playing', 'is-ready');
      openBtn.focus({ preventScroll: true });
      return;
    }

    // Wait for fonts (up to 1.2s) so the opening never flashes a fallback typeface.
    const fontsReady = document.fonts && document.fonts.ready
      ? Promise.race([document.fonts.ready, wait(1200)])
      : Promise.resolve();

    fontsReady.then(() => {
      intro.classList.add('is-playing');
      introTimers.push(setTimeout(() => {
        intro.classList.add('is-ready');
        openBtn.focus({ preventScroll: true });
      }, 4300));
    });
  }

  async function openSurprise() {
    if (intro.classList.contains('is-opening')) return;
    openBtn.disabled = true;
    intro.classList.add('is-opening');

    await wait(reduceMotion ? 0 : 1500);
    body.classList.remove('is-locked');
    window.scrollTo(0, 0);
    intro.classList.add('is-done');
    bar.classList.add('is-visible');
    litVisible();

    await wait(reduceMotion ? 0 : 1000);
    intro.hidden = true;
    openBtn.disabled = false;
  }

  openBtn.addEventListener('click', openSurprise);

  /* ==========================================================
     Reading reveal: lines brighten once you reach them
     ========================================================== */
  const reads = $$('.read');
  let readObserver = null;

  function litVisible() {
    // Light anything already on screen (used right after the opening).
    reads.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.85 && r.bottom > 0) el.classList.add('is-lit');
    });
  }

  if ('IntersectionObserver' in window && !reduceMotion) {
    readObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-lit');
          readObserver.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.2 });
    reads.forEach((el) => readObserver.observe(el));
  } else {
    reads.forEach((el) => el.classList.add('is-lit'));
  }

  /* ==========================================================
     Nav: highlight the section being read
     ========================================================== */
  const links = $$('[data-link]');
  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.dataset.link === e.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['letter', 'memories', 'message'].forEach((id) => navObserver.observe($('#' + id)));
  }

  /* ==========================================================
     3 + 4. Custom video player
     ========================================================== */
  const player = $('#player');
  const video = $('#video');
  const cover = $('#cover');
  const toggleBtn = $('#toggleBtn');
  const seek = $('#seek');
  const timeEl = $('#time');
  const muteBtn = $('#muteBtn');
  const fsBtn = $('#fsBtn');
  const durChip = $('#durChip');
  const errorEl = $('#videoError');

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };

  const setState = (s) => { player.dataset.state = s; };

  function renderProgress() {
    const d = video.duration || 0;
    const t = video.currentTime || 0;
    const pct = d ? (t / d) * 100 : 0;
    if (!scrubbing) seek.value = d ? Math.round((t / d) * 1000) : 0;
    seek.style.setProperty('--p', (scrubbing ? (seek.value / 10) : pct) + '%');
    timeEl.textContent = fmt(t) + ' / ' + fmt(d);
  }

  let scrubbing = false;
  let raf = 0;
  const loop = () => { renderProgress(); raf = requestAnimationFrame(loop); };

  async function playVideo() {
    if (video.ended) video.currentTime = 0;
    try {
      await video.play();
    } catch (err) {
      // Some browsers refuse unmuted autoplay; retry muted so it still plays.
      if (err && err.name === 'NotAllowedError') {
        video.muted = true;
        syncMute();
        try { await video.play(); } catch (_) { /* give up quietly */ }
      }
    }
  }
  const pauseVideo = () => video.pause();
  const togglePlay = () => (video.paused || video.ended ? playVideo() : pauseVideo());

  video.addEventListener('play', () => {
    setState('playing');
    body.classList.add('is-cinema');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    toggleBtn.setAttribute('aria-label', 'Pause');
    cover.setAttribute('aria-label', 'Play memories video');
    scheduleIdle();
  });
  video.addEventListener('pause', () => {
    cancelAnimationFrame(raf);
    renderProgress();
    body.classList.remove('is-cinema');
    toggleBtn.setAttribute('aria-label', 'Play');
    cover.setAttribute('aria-label', 'Resume memories video');
    player.classList.remove('is-idle');
    if (!video.ended) setState(video.currentTime > 0.05 ? 'paused' : 'idle');
  });
  video.addEventListener('ended', () => {
    cancelAnimationFrame(raf);
    renderProgress();
    body.classList.remove('is-cinema');
    setState('ended');
    cover.setAttribute('aria-label', 'Watch the video again');
    toggleBtn.setAttribute('aria-label', 'Play');
    player.classList.remove('is-idle');
    if (document.fullscreenElement === player && document.exitFullscreen) document.exitFullscreen();
  });
  video.addEventListener('loadedmetadata', () => {
    durChip.textContent = fmt(video.duration);
    renderProgress();
  });
  video.addEventListener('timeupdate', () => { if (video.paused) renderProgress(); });
  video.addEventListener('error', () => { errorEl.hidden = false; });
  $('source', video).addEventListener('error', () => { errorEl.hidden = false; });

  cover.addEventListener('click', playVideo);
  toggleBtn.addEventListener('click', togglePlay);
  video.addEventListener('click', () => {
    // Tapping the picture toggles play; on touch it also reveals the controls.
    player.classList.add('is-touched');
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => player.classList.remove('is-touched'), 2800);
    if (!window.matchMedia('(hover: none)').matches) togglePlay();
    else if (player.dataset.state !== 'playing') playVideo();
  });
  let touchTimer = 0;

  // Scrubbing
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  seek.addEventListener('input', () => {
    const d = video.duration;
    if (d) video.currentTime = (seek.value / 1000) * d;
    if (video.ended && seek.value < 1000) setState('paused');
    renderProgress();
  });
  const endScrub = () => { scrubbing = false; renderProgress(); };
  seek.addEventListener('pointerup', endScrub);
  seek.addEventListener('change', endScrub);
  seek.addEventListener('blur', endScrub);

  // Mute
  function syncMute() {
    player.classList.toggle('is-muted', video.muted || video.volume === 0);
    muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
  }
  muteBtn.addEventListener('click', () => { video.muted = !video.muted; syncMute(); });
  video.addEventListener('volumechange', syncMute);
  syncMute();

  // Fullscreen
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function toggleFullscreen() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (player.requestFullscreen) {
      player.requestFullscreen().catch(() => {});
    } else if (player.webkitRequestFullscreen) {
      player.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {   // iPhone Safari
      video.webkitEnterFullscreen();
    }
  }
  fsBtn.addEventListener('click', toggleFullscreen);
  video.addEventListener('dblclick', toggleFullscreen);
  const onFsChange = () => {
    const on = fsElement() === player;
    fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // Auto-hide controls while playing
  let idleTimer = 0;
  function scheduleIdle() {
    player.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const a = document.activeElement;
      const keyboardInside = a && player.contains(a) && a.matches(':focus-visible');
      if (!video.paused && !keyboardInside) player.classList.add('is-idle');
    }, 2600);
  }
  ['pointermove', 'pointerdown', 'keydown', 'focusin'].forEach((ev) => player.addEventListener(ev, () => {
    if (!video.paused) scheduleIdle();
  }));

  // Keyboard shortcuts while the player has focus
  player.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    const key = e.key.toLowerCase();
    if (key === 'm') { e.preventDefault(); muteBtn.click(); }
    else if (key === 'f') { e.preventDefault(); toggleFullscreen(); }
    else if (key === 'k' || (key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT')) { e.preventDefault(); togglePlay(); }
    else if ((key === 'arrowleft' || key === 'arrowright') && tag !== 'INPUT') {
      e.preventDefault();
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + (key === 'arrowright' ? 5 : -5)));
      renderProgress();
    }
  });

  // Pause when the video scrolls out of view (not in fullscreen)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting && !video.paused && !fsElement()) video.pause();
      });
    }, { threshold: 0.1 }).observe(player);
  }

  /* ==========================================================
     5. Finale: confetti and navigation buttons
     ========================================================== */
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  let confettiRaf = 0;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function celebrate(fromEl) {
    if (reduceMotion) return;
    cancelAnimationFrame(confettiRaf);
    sizeCanvas();

    const r = fromEl.getBoundingClientRect();
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const colors = ['#e7aeb0', '#7fb5aa', '#f4e6e3', '#c69a62', '#d98e96', '#9fd0c6'];
    const W = window.innerWidth;
    const H = window.innerHeight;

    const make = (x, y, spread, speed) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const s = speed * (0.45 + Math.random() * 0.75);
      return {
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        w: 7 + Math.random() * 9, h: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.35,
        wob: Math.random() * Math.PI * 2,
        c: colors[(Math.random() * colors.length) | 0],
        petal: Math.random() < 0.5,
      };
    };

    const parts = [];
    for (let i = 0; i < 150; i++) parts.push(make(ox, oy, 1.9, Math.min(18, W / 40 + 8)));
    // A soft second wave falling from above
    for (let i = 0; i < 70; i++) {
      const p = make(Math.random() * W, -20 - Math.random() * 200, 0.6, 1);
      p.vy = 1 + Math.random() * 2; p.vx = (Math.random() - 0.5) * 1.2; p.delay = 18 + Math.random() * 40;
      p.vy = Math.abs(p.vy);
      parts.push(p);
    }

    let frame = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        if (p.delay && frame < p.delay) { alive++; continue; }
        p.vy += 0.26;
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.wob += 0.08;
        p.x += p.vx + Math.sin(p.wob) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < H + 30) alive++; else continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.min(1, (H + 30 - p.y) / 160);
        if (p.petal) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w / 2, p.h / 2 + 1, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (alive > 0 && frame < 600) confettiRaf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    confettiRaf = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => { if (confettiRaf) sizeCanvas(); });

  $('#confettiBtn').addEventListener('click', (e) => celebrate(e.currentTarget));

  $('#rewatchBtn').addEventListener('click', () => {
    $('#memories').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    // Start playing right away; the click counts as the user's permission for sound.
    if (video.ended || video.currentTime > 0) video.currentTime = 0;
    playVideo();
  });

  $('#restartBtn').addEventListener('click', () => {
    video.pause();
    video.currentTime = 0;
    setState('idle');
    renderProgress();
    startIntro();
  });

  /* ---------- go ---------- */
  startIntro();
})();
