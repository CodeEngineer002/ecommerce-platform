"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PromoSlide {
  image_url?: string;
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta_link?: string;
}

interface Props {
  slides: PromoSlide[];
  title?: string | null;
  subtitle?: string | null;
}

export function PromoBannerCarousel({ slides, title, subtitle }: Props) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;

  const prev = useCallback(() => setCurrent((c) => (c - 1 + count) % count), [count]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % count), [count]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [count, paused, next]);

  if (count === 0) {
    if (!title) return null;
    return (
      <section className="bg-muted">
        <div className="container flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="max-w-2xl text-3xl font-bold">{title}</h2>
          {subtitle && <p className="max-w-xl text-muted-foreground">{subtitle}</p>}
        </div>
      </section>
    );
  }

  const slide = slides[current];

  // If slide has an image, show it full-width at natural ratio (contain).
  // Only show text overlay when there's actual text/CTA to show.
  const hasTextContent = (s: PromoSlide) => s.title || s.subtitle || s.cta_text;

  return (
    <section
      className="relative isolate w-full overflow-hidden bg-black"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      {slides.map((s, idx) => (
        <div
          key={idx}
          className={cn(
            "transition-opacity duration-700",
            idx === current ? "opacity-100" : "absolute inset-0 opacity-0",
          )}
        >
          {s.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.image_url}
              alt={s.title ?? "Promotional banner"}
              style={{ display: "block", width: "100%", height: "420px", objectFit: "cover", objectPosition: "center" }}
            />
          ) : (
            <div style={{ height: "420px" }} className="w-full bg-gradient-to-br from-brand-600 to-brand-900" />
          )}
          {/* Dark overlay only when there is text/CTA to display */}
          {hasTextContent(s) && (
            <div className="absolute inset-0 bg-black/45" />
          )}
        </div>
      ))}

      {/* Content — sits above slides, only rendered when there is something to show */}
      {hasTextContent(slide) && (
      <div className="absolute inset-0 z-20 container flex flex-col items-center justify-center gap-5 py-16 text-center text-white">
        {slide.title && (
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl drop-shadow-lg">
            {slide.title}
          </h2>
        )}
        {slide.subtitle && (
          <p className="max-w-xl text-lg text-white/85 drop-shadow">{slide.subtitle}</p>
        )}
        {slide.cta_text && (
          <Button size="lg" variant="secondary" asChild className="mt-2">
            <Link href={slide.cta_link ?? "#"}>{slide.cta_text}</Link>
          </Button>
        )}
      </div>
      )}

      {/* Arrows — only when multiple slides */}
      {count > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={next}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={cn(
                "h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                idx === current ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/75",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
