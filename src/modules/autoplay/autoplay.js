/* eslint no-underscore-dangle: "off" */
/* eslint no-use-before-define: "off" */
import { getDocument } from 'ssr-window';

export default function Autoplay({ swiper, extendParams, on, emit, params }) {
  swiper.autoplay = {
    running: false,
    paused: false,
    timeLeft: 0,
  };

  extendParams({
    autoplay: {
      enabled: false,
      delay: 3000,
      waitForTransition: true,
      disableOnInteraction: true,
      stopOnLastSlide: false,
      reverseDirection: false,
      pauseOnPointerEnter: true,
    },
  });
  let timeout;
  let raf;
  let autoplayDelay = params && params.autoplay ? params.autoplay.delay : 3000;
  let autoplayTimeLeft;
  let autoplayStartTime = new Date().getTime;
  let isTouched;
  let pausedByTouch;
  let touchStartTimeout;
  let slideChanged;
  let pausedByInteraction;

  function onTransitionEnd(e) {
    if (!swiper || swiper.destroyed || !swiper.$wrapperEl) return;
    if (e.target !== swiper.$wrapperEl[0]) return;
    swiper.$wrapperEl[0].removeEventListener('transitionend', onTransitionEnd);
    resume();
  }

  const calcTimeLeft = () => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    const timeLeft = swiper.autoplay.paused
      ? autoplayTimeLeft
      : autoplayStartTime + autoplayDelay - new Date().getTime();
    swiper.autoplay.timeLeft = timeLeft;
    emit('autoplayTimeLeft', timeLeft, timeLeft / autoplayDelay);
    raf = requestAnimationFrame(() => {
      calcTimeLeft();
    });
  };

  const getSlideDelay = () => {
    const currentSlideDelay = parseInt(
      swiper.slides[swiper.activeIndex].getAttribute('data-swiper-autoplay'),
      10,
    );
    return currentSlideDelay;
  };

  const run = (delayForce) => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    cancelAnimationFrame(raf);
    calcTimeLeft();

    let delay = typeof delayForce === 'undefined' ? swiper.params.autoplay.delay : delayForce;
    autoplayDelay = swiper.params.autoplay.delay;
    const currentSlideDelay = getSlideDelay();
    if (
      !Number.isNaN(currentSlideDelay) &&
      currentSlideDelay > 0 &&
      typeof delayForce === 'undefined'
    ) {
      delay = currentSlideDelay;
      autoplayDelay = currentSlideDelay;
    }
    autoplayTimeLeft = delay;

    const speed = swiper.params.speed;
    const proceed = () => {
      if (swiper.params.autoplay.reverseDirection) {
        if (!swiper.isBeginning || swiper.params.loop || swiper.params.rewind) {
          swiper.slidePrev(speed, true, true);
          emit('autoplay');
        } else if (!swiper.params.autoplay.stopOnLastSlide) {
          swiper.slideTo(swiper.slides.length - 1, speed, true, true);
          emit('autoplay');
        }
      } else {
        if (!swiper.isEnd || swiper.params.loop || swiper.params.rewind) {
          swiper.slideNext(speed, true, true);
          emit('autoplay');
        } else if (!swiper.params.autoplay.stopOnLastSlide) {
          swiper.slideTo(0, speed, true, true);
          emit('autoplay');
        }
      }
      if (swiper.params.cssMode) {
        autoplayStartTime = new Date().getTime();
        requestAnimationFrame(() => {
          run();
        });
      }
    };
    if (delay > 0) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        proceed();
      }, delay);
    } else {
      requestAnimationFrame(() => {
        proceed();
      });
    }

    // eslint-disable-next-line
    return delay;
  };

  const start = () => {
    swiper.autoplay.running = true;
    run();
    emit('autoplayStart');
  };

  const stop = () => {
    swiper.autoplay.running = false;
    clearTimeout(timeout);
    cancelAnimationFrame(raf);
    emit('autoplayStop');
  };
  const pause = (internal, reset) => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    clearTimeout(timeout);
    if (!internal) {
      pausedByInteraction = true;
    }

    const proceed = () => {
      emit('autoplayPause');
      if (swiper.params.autoplay.waitForTransition) {
        swiper.$wrapperEl[0].addEventListener('transitionend', onTransitionEnd);
      } else {
        resume();
      }
    };

    swiper.autoplay.paused = true;
    if (reset) {
      if (slideChanged) {
        autoplayTimeLeft = swiper.params.autoplay.delay;
      }
      slideChanged = false;
      proceed();
      return;
    }
    const delay = autoplayTimeLeft || swiper.params.autoplay.delay;
    autoplayTimeLeft = delay - (new Date().getTime() - autoplayStartTime);
    if (swiper.isEnd && autoplayTimeLeft < 0 && !swiper.params.loop) return;
    if (autoplayTimeLeft < 0) autoplayTimeLeft = 0;
    proceed();
  };

  const resume = () => {
    if (
      (swiper.isEnd && autoplayTimeLeft < 0 && !swiper.params.loop) ||
      swiper.destroyed ||
      !swiper.autoplay.running
    )
      return;
    autoplayStartTime = new Date().getTime();
    if (pausedByInteraction) {
      pausedByInteraction = false;
      run(autoplayTimeLeft);
    } else {
      run();
    }
    swiper.autoplay.paused = false;
    emit('autoplayResume');
  };

  const onVisibilityChange = () => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    const document = getDocument();
    if (document.visibilityState === 'hidden') {
      pausedByInteraction = true;
      pause(true);
    }
    if (document.visibilityState === 'visible') {
      resume();
    }
  };

  const onPointerEnter = () => {
    pausedByInteraction = true;
    pause(true);
  };

  const onPointerLeave = () => {
    if (swiper.autoplay.paused) {
      resume();
    }
  };

  const attachMouseEvents = () => {
    if (swiper.params.autoplay.pauseOnPointerEnter) {
      swiper.$el.on('pointerenter', onPointerEnter);
      swiper.$el.on('pointerleave', onPointerLeave);
    }
  };

  const detachMouseEvents = () => {
    swiper.$el.off('pointerenter', onPointerEnter);
    swiper.$el.off('pointerleave', onPointerLeave);
  };

  const attachDocumentEvents = () => {
    const document = getDocument();
    document.addEventListener('visibilitychange', onVisibilityChange);
  };

  const detachDocumentEvents = () => {
    const document = getDocument();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  on('init', () => {
    if (swiper.params.autoplay.enabled) {
      attachMouseEvents();
      attachDocumentEvents();
      autoplayStartTime = new Date().getTime();
      start();
    }
  });

  on('destroy', () => {
    detachMouseEvents();
    detachDocumentEvents();
    if (swiper.autoplay.running) {
      stop();
    }
  });

  on('beforeTransitionStart', (_s, speed, internal) => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    if (internal || !swiper.params.autoplay.disableOnInteraction) {
      pause(true, true);
    } else {
      stop();
    }
  });

  on('sliderFirstMove', () => {
    if (swiper.destroyed || !swiper.autoplay.running) return;

    if (swiper.params.autoplay.disableOnInteraction) {
      stop();
      return;
    }
    isTouched = true;
    pausedByTouch = false;
    pausedByInteraction = false;
    touchStartTimeout = setTimeout(() => {
      pausedByInteraction = true;
      pausedByTouch = true;
      pause(true);
    }, 200);
  });

  on('touchEnd', () => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    clearTimeout(touchStartTimeout);
    clearTimeout(timeout);

    if (!isTouched || swiper.params.autoplay.disableOnInteraction) {
      pausedByTouch = false;
      isTouched = false;
      return;
    }

    if (pausedByTouch && swiper.params.cssMode) resume();
    pausedByTouch = false;
    isTouched = false;
  });

  on('slideChange', () => {
    if (swiper.destroyed || !swiper.autoplay.running) return;
    slideChanged = true;
  });

  Object.assign(swiper.autoplay, {
    start,
    stop,
    pause,
    resume,
  });
}
