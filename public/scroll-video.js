// Leave more of the scroll for the middle of the opening orbit.
const openingTiming = progress => progress < .43 ? progress * (.35 / .43) : .35 + (progress - .43) * (.65 / .57);

export function connectScrollVideo(journey, video, hint, reduceMotion, { frameRate=30, timing=openingTiming, onProgress, lazy=false }={}) {
  const frameDuration = 1/frameRate;
  let frameId = 0;
  let desiredTime = 0;
  const source = video.dataset.src;
  let loadAllowed = !lazy;

  function seek() {
    if (reduceMotion.matches || video.seeking || video.readyState < 1 || !Number.isFinite(video.duration)) return;
    if (Math.abs(video.currentTime - desiredTime) >= frameDuration / 2) video.currentTime = desiredTime;
  }

  function render() {
    frameId = 0;
    if (!journey.getClientRects().length) return;
    const still = reduceMotion.matches || journey.classList.contains('video-unavailable');
    const rect = journey.getBoundingClientRect();
    const stage = journey.firstElementChild;
    const distance = Math.max(1, rect.height - stage.clientHeight);
    const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
    const progress = still ? 0 : Math.min(1, Math.max(0, (stickyTop - rect.top) / distance));
    journey.style.setProperty('--journey-progress', progress.toFixed(3));
    if (hint) {
      journey.classList.toggle('street-active', progress >= .43);
      hint.textContent = still || progress >= .43 ? 'Ir para o mapa ↓' : 'Role para ver o mapa ↓';
    }
    onProgress?.(progress);
    const clip = timing(progress);
    const lastFrame = Number.isFinite(video.duration) ? Math.max(0, video.duration - frameDuration) : 0;
    desiredTime = Math.min(lastFrame, Math.round(clip * lastFrame / frameDuration) * frameDuration);
    seek();
  }

  function schedule() {
    if (!frameId) frameId = requestAnimationFrame(render);
  }

  function syncPreference() {
    if (reduceMotion.matches) {
      if(video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
      journey.classList.remove('video-unavailable');
    } else if (loadAllowed && journey.getClientRects().length && !video.hasAttribute('src')) {
      video.src = source;
    }
    schedule();
  }

  video.addEventListener('loadedmetadata', schedule);
  video.addEventListener('seeked', seek);
  video.addEventListener('error', () => {
    if (!video.hasAttribute('src')) return;
    video.removeAttribute('src');
    video.load();
    journey.classList.add('video-unavailable');
    schedule();
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  reduceMotion.addEventListener('change', syncPreference);
  if(lazy) {
    const observer = new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting)) return;
      loadAllowed=true;
      syncPreference();
      observer.disconnect();
    },{rootMargin:'480px'});
    observer.observe(journey);
  }
  syncPreference();
  return schedule;
}
