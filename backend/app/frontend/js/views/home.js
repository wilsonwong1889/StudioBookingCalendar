const AUTOPLAY_INTERVAL_MS = 6000;

function normalizeIndex(index, total) {
  if (!total) {
    return 0;
  }
  return (index + total) % total;
}

export function initHomeView() {
  const carousel = document.querySelector("[data-home-carousel]");
  if (!carousel || carousel.dataset.initialized === "true") {
    return;
  }

  const slides = Array.from(carousel.querySelectorAll("[data-home-slide]"));
  const dots = Array.from(carousel.querySelectorAll("[data-home-dot]"));
  const captions = Array.from(carousel.querySelectorAll("[data-home-caption]"));
  const previousButton = carousel.querySelector("[data-home-prev]");
  const nextButton = carousel.querySelector("[data-home-next]");
  const counter = carousel.querySelector("[data-home-counter]");

  if (!slides.length) {
    return;
  }

  carousel.dataset.initialized = "true";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
  let autoPlayTimer = null;

  if (activeIndex < 0) {
    activeIndex = 0;
  }

  const clearAutoPlay = () => {
    if (autoPlayTimer) {
      window.clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
  };

  const render = (nextIndex, { restartAutoPlay = true } = {}) => {
    activeIndex = normalizeIndex(nextIndex, slides.length);

    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-current", isActive ? "true" : "false");
    });

    captions.forEach((caption, index) => {
      const isActive = index === activeIndex;
      caption.classList.toggle("is-active", isActive);
      caption.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (counter) {
      counter.textContent = `${activeIndex + 1} / ${slides.length}`;
    }

    if (restartAutoPlay) {
      clearAutoPlay();
      if (!prefersReducedMotion.matches) {
        autoPlayTimer = window.setInterval(() => {
          render(activeIndex + 1, { restartAutoPlay: false });
        }, AUTOPLAY_INTERVAL_MS);
      }
    }
  };

  const moveBy = (offset) => {
    render(activeIndex + offset);
  };

  previousButton?.addEventListener("click", () => moveBy(-1));
  nextButton?.addEventListener("click", () => moveBy(1));

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => render(index));
  });

  captions.forEach((caption, index) => {
    caption.addEventListener("click", () => render(index));
  });

  const pauseAutoPlay = () => {
    clearAutoPlay();
  };

  const resumeAutoPlay = () => {
    render(activeIndex);
  };

  carousel.addEventListener("mouseenter", pauseAutoPlay);
  carousel.addEventListener("mouseleave", resumeAutoPlay);
  carousel.addEventListener("focusin", pauseAutoPlay);
  carousel.addEventListener("focusout", (event) => {
    if (!carousel.contains(event.relatedTarget)) {
      resumeAutoPlay();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAutoPlay();
      return;
    }
    resumeAutoPlay();
  });

  render(activeIndex);
}
