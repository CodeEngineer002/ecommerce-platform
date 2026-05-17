"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HeroSlide {
  image_url?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  cta_text?: string;
  cta_link?: string;
}

interface Props {
  slides: HeroSlide[];
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  fallbackCtaText?: string;
  fallbackCtaLink?: string;
}

export function HeroBannerCarousel({
  slides,
  fallbackTitle,
  fallbackSubtitle,
  fallbackCtaText,
  fallbackCtaLink,
}: Props) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;

  const prev = useCallback(() => setCurrent((c) => (c - 1 + count) % count), [count]);
  const next = useCallback(() => setCurrent((c) => (c + 1) % count), [count]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(next, 5000);
    return () => clearInterval(id);
  }, [count, paused, next]);

  if (count === 0) {
    return (
      <section className="relative overflow-hidden text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-900" />
        <div className="container relative z-10 flex min-h-[500px] flex-col items-start justify-center gap-6 py-16">
          {fallbackTitle && (
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              {fallbackTitle}
            </h1>
          )}
          {fallbackSubtitle && (
            <p className="max-w-lg text-lg text-white/80">{fallbackSubtitle}</p>
          )}
          {fallbackCtaText && (
            <Button size="xl" variant="secondary" asChild className="gap-2">
              <Link href={fallbackCtaLink ?? "#"}>
                {fallbackCtaText}
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          )}
        </div>
      </section>
    );
  }

  const slide = slides[current];

  return (
    <section
      className="relative isolate overflow-hidden text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides */}
      {slides.map((s, idx) => (
        <div
          key={idx}
          className={cn(
            "transition-opacity duration-700",
            idx === current ? "opacity-100" : "absolute inset-0 opacity-0 pointer-events-none",
          )}
        >
          {s.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.image_url}
              alt={s.title ?? "Hero banner"}
              style={{ display: "block", width: "100%", height: "500px", objectFit: "cover", objectPosition: "center" }}
            />
          ) : (
            <div style={{ height: "500px" }} className="w-full bg-gradient-to-br from-brand-600 to-brand-900" />
          )}
          {/* Uniform dark overlay */}
          <div className="absolute inset-0 bg-black/45" />
        </div>
      ))}

      {/* Text content */}
      <div className="absolute inset-0 z-20 container flex flex-col items-start justify-center gap-6 py-16">
        {slide.badge && (
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
            {slide.badge}
          </span>
        )}
        {slide.title && (
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight drop-shadow-lg sm:text-5xl lg:text-6xl">
            {slide.title}
          </h1>
        )}
        {slide.subtitle && (
          <p className="max-w-lg text-lg text-white/80 drop-shadow">{slide.subtitle}</p>
        )}
        {(slide.cta_text ?? fallbackCtaText) && (
          <Button size="xl" variant="secondary" asChild className="gap-2">
            <Link href={slide.cta_link ?? fallbackCtaLink ?? "#"}>
              {slide.cta_text ?? fallbackCtaText}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        )}
      </div>


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
