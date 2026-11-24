const FRAME_DURATION = 1 / 30;

export function connectScrollVideo(journey, video, hint, reduceMotion) {
  let frameId = 0;
  let desiredTime = 0;
  const source = video.dataset.src;

  function seek() {
    if (reduceMotion.matches || video.seeking || video.readyState < 1 || !Number.isFinite(video.duration)) return;
    if (Math.abs(video.currentTime - desiredTime) >= FRAME_DURATION / 2) video.currentTime = desiredTime;
  }

  function render() {
    frameId = 0;
    if (journey.hidden) return;
    const still = reduceMotion.matches || journey.classList.contains('video-unavailable');
    const rect = journey.getBoundingClientRect();
    const distance = Math.max(1, rect.height - journey.firstElementChild.clientHeight);
    const progress = still ? 0 : Math.min(1, Math.max(0, -rect.top / distance));
    journey.style.setProperty('--journey-progress', progress.toFixed(3));
    journey.classList.toggle('street-active', progress >= .43);
    hint.textContent = still || progress >= .43 ? 'Ir para o mapa ↓' : 'Role para acompanhar ↓';

    // The middle of the clip contains most of the orbit. Leave room for it on the page.
    const clip = progress < .43 ? progress * (.35 / .43) : .35 + (progress - .43) * (.65 / .57);
    const lastFrame = Number.isFinite(video.duration) ? Math.max(0, video.duration - FRAME_DURATION) : 0;
    desiredTime = Math.min(lastFrame, Math.round(clip * lastFrame / FRAME_DURATION) * FRAME_DURATION);
    seek();
  }

  function schedule() {
    if (!frameId) frameId = requestAnimationFrame(render);
  }

  function syncPreference() {
    if (reduceMotion.matches) {
      video.removeAttribute('src');
      video.load();
      journey.classList.remove('video-unavailable');
    } else if (!journey.hidden && !video.hasAttribute('src')) {
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
  syncPreference();
  return schedule;
}
