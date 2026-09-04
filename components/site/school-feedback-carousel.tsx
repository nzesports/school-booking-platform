"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { StarRating } from "@/components/ui/star-rating";
import type { Testimonial } from "@/lib/domain/types";

export function SchoolFeedbackCarousel({ testimonials }: { testimonials: Testimonial[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  function animateScrollTo(track: HTMLDivElement, target: number) {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      track.scrollLeft = target;
      return;
    }

    const start = track.scrollLeft;
    const distance = target - start;
    const duration = 500;
    const startedAt = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      track.scrollLeft = start + distance * eased;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        animationFrameRef.current = null;
      }
    }

    animationFrameRef.current = requestAnimationFrame(tick);
  }

  function scroll(direction: -1 | 1) {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const firstCard = track.querySelector<HTMLElement>("[data-feedback-card]");

    if (!firstCard) {
      return;
    }

    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const cardStep = firstCard.offsetWidth + gap;
    const currentIndex = Math.round(track.scrollLeft / cardStep);
    const maxScroll = track.scrollWidth - track.clientWidth;
    const target = Math.min(maxScroll, Math.max(0, (currentIndex + direction) * cardStep));

    animateScrollTo(track, target);
  }

  return (
    <div className="mt-8" aria-roledescription="carousel" aria-label="School feedback">
      <div className="mb-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="View previous school feedback"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] shadow-[0_8px_18px_rgba(11,24,77,0.06)] transition hover:border-[rgba(24,168,59,0.35)] hover:text-[color:var(--green)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="View next school feedback"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] shadow-[0_8px_18px_rgba(11,24,77,0.06)] transition hover:border-[rgba(24,168,59,0.35)] hover:text-[color:var(--green)]"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={trackRef}
        className="feedback-carousel-track flex snap-x snap-mandatory gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {testimonials.map((testimonial) => (
          <article
            key={testimonial.id}
            data-feedback-card
            className="feedback-carousel-card flex min-h-[290px] shrink-0 snap-start snap-always flex-col rounded-[26px] border border-[color:var(--border-soft)] bg-white/90 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  {testimonial.school}
                </p>
                <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                  {testimonial.attribution}
                </p>
              </div>

              <StarRating
                rating={testimonial.rating ?? 5}
                fillClassName="text-[#ffb938]"
                className="mt-0.5 shrink-0"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[color:var(--navy)]">
              {testimonial.presentationTitle ? (
                <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1.5">
                  {testimonial.presentationTitle}
                </span>
              ) : null}
              {testimonial.feedbackDate ? (
                <span className="rounded-full bg-[color:var(--green-soft)] px-3 py-1.5 text-[color:var(--green)]">
                  {testimonial.feedbackDate}
                </span>
              ) : null}
            </div>

            <p className="mt-5 text-base leading-8 text-[color:var(--text-dark)]">
              “{testimonial.quote}”
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
