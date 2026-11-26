import { connectScrollVideo } from './scroll-video.js';

const chapterStops = [.01, (1+.13)/3, .98];
const wheelIdleMs = 160;

export function connectParticipationRide(section) {
  const stage = section.firstElementChild;
  const video = section.querySelector('video');
  const chapters = Array.from(section.querySelectorAll('.participate-chapters li'));
  const still = matchMedia('(prefers-reduced-motion: reduce), (max-height: 410px)');
  let active = 0;
  let target = null;
  let wheelDirection = 0;
  let wheelDistance = 0;
  let wheelHandled = false;
  let wheelTimer;
  let swipe;

  function setMotion() {
    section.classList.toggle('is-animated', !still.matches);
    target = null;
  }
  setMotion();
  still.addEventListener('change', setMotion);

  connectScrollVideo(section, video, null, still, {
    frameRate:48,
    timing:progress=>progress,
    lazy:true,
    onProgress(progress) {
      const index = Math.min(chapters.length-1, Math.floor(progress*chapters.length));
      if (index === active) return;
      active = index;
      for (const [number,chapter] of chapters.entries()) {
        chapter.classList.toggle('is-current', number===index);
        if (number===index) chapter.setAttribute('aria-current','step');
        else chapter.removeAttribute('aria-current');
      }
    },
  });

  function geometry() {
    if (still.matches || section.classList.contains('video-unavailable') || !section.getClientRects().length || document.querySelector('dialog[open]')) return null;
    const rect = section.getBoundingClientRect();
    const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
    if (rect.top > stickyTop+2 || rect.bottom < stickyTop+stage.clientHeight-2) return null;
    return {start:scrollY+rect.top-stickyTop, distance:rect.height-stage.clientHeight};
  }

  function nextChapter(direction) {
    const currentGeometry = geometry();
    if (!currentGeometry) return null;
    if (target && (performance.now()>target.until || Math.abs(scrollY-target.top)<3)) target=null;
    const index = (target?.index??active)+direction;
    return index>=0 && index<chapters.length ? {index,...currentGeometry} : null;
  }

  function goTo({ index,start,distance }) {
    const top = start+distance*chapterStops[index];
    target = {index,top,until:performance.now()+900};
    scrollTo({top, behavior:'smooth'});
  }

  function resetWheelAfterPause() {
    clearTimeout(wheelTimer);
    wheelTimer=setTimeout(()=>{
      wheelDirection=0;
      wheelDistance=0;
      wheelHandled=false;
    },wheelIdleMs);
  }

  addEventListener('wheel',event=>{
    if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaY)<=Math.abs(event.deltaX) || !event.cancelable || event.defaultPrevented) return;
    const direction = Math.sign(event.deltaY);
    if (wheelHandled && direction===wheelDirection) {
      if (!geometry()) return;
      event.preventDefault();
      resetWheelAfterPause();
      return;
    }
    const next = nextChapter(direction);
    if (!next) return;
    event.preventDefault();
    if (direction!==wheelDirection) {
      wheelDirection=direction;
      wheelDistance=0;
      wheelHandled=false;
    }
    const multiplier=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
    wheelDistance+=Math.abs(event.deltaY)*multiplier;
    if (wheelDistance>=22) {
      wheelHandled=true;
      goTo(next);
    }
    resetWheelAfterPause();
  },{passive:false});

  addEventListener('keydown',event=>{
    const direction = event.key==='PageDown'?1:event.key==='PageUp'?-1:0;
    if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, button, [contenteditable], [role="dialog"]')) return;
    const next = nextChapter(direction);
    if (!next) return;
    event.preventDefault();
    goTo(next);
  });

  section.addEventListener('touchstart',event=>{
    swipe = undefined;
    if (event.touches.length!==1 || event.target.closest('a, button, input, select, textarea') || !geometry()) return;
    const {clientX:x,clientY:y}=event.touches[0];
    swipe={x,y,moved:false};
  },{passive:true});
  section.addEventListener('touchmove',event=>{
    if (!swipe || event.touches.length!==1 || !event.cancelable) return;
    if (swipe.moved) {event.preventDefault();return;}
    const {clientX,clientY}=event.touches[0];
    const distance=swipe.y-clientY;
    if (Math.abs(distance)<8) return;
    if (Math.abs(clientX-swipe.x)>Math.abs(distance)) {swipe=undefined;return;}
    const next=nextChapter(Math.sign(distance));
    if (!next) {swipe=undefined;return;}
    event.preventDefault();
    if (Math.abs(distance)>=30) {
      swipe.moved=true;
      goTo(next);
    }
  },{passive:false});
  for (const event of ['touchend','touchcancel']) section.addEventListener(event,()=>{swipe=undefined;},{passive:true});
}
