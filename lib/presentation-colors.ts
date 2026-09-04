import type { PresentationType } from "@/lib/domain/types";

const fallbackColours: Record<string, string> = {
  "digital-wellbeing": "#18A83B",
  "esports-pathways": "#E0A11A",
  "understanding-esports": "#2563EB",
  "understanding-the-gaming-world": "#2563EB"
};

export function presentationAccent(
  presentation: Pick<PresentationType, "slug" | "accentColor">
) {
  return presentation.accentColor ?? fallbackColours[presentation.slug] ?? "#18A83B";
}

export function colourWithAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((character) => `${character}${character}`).join("")
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return `rgba(24,168,59,${alpha})`;
  }

  return `rgba(${red},${green},${blue},${alpha})`;
}

export function presentationPalette(
  presentation: Pick<PresentationType, "slug" | "accentColor">
) {
  const accent = presentationAccent(presentation);

  return {
    accent,
    soft: colourWithAlpha(accent, 0.09),
    border: colourWithAlpha(accent, 0.3),
    shadow: colourWithAlpha(accent, 0.13)
  };
}
