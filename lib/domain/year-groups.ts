const chipPalette = [
  "bg-[#e6f5ee] text-[#178247]",
  "bg-[#ecebff] text-[#4a43a9]",
  "bg-[#fff3d8] text-[#9a6900]",
  "bg-[#e3f2fd] text-[#1565c0]",
  "bg-[#fde7ef] text-[#ad2f62]",
  "bg-[#e0f4f3] text-[#0f766e]"
];

const knownGroupStyles: Record<string, string> = {
  "years 1 to 6": chipPalette[2],
  "years 5 to 6": chipPalette[2],
  "years 7 to 8": chipPalette[0],
  "years 9 to 13": chipPalette[1]
};

/**
 * Splits a stored year-levels string ("Years 5 to 6, Years 7 to 8") into the
 * individual groups staff entered, so each renders as its own chip.
 */
export function splitYearGroups(yearLevels: string | null | undefined): string[] {
  if (!yearLevels) {
    return [];
  }

  return yearLevels
    .split(/[,;·|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function yearGroupChipClass(label: string) {
  const key = label.trim().toLowerCase();

  if (knownGroupStyles[key]) {
    return knownGroupStyles[key];
  }

  // Unknown labels get a stable colour from the palette so the same group
  // always renders the same way wherever it appears.
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }

  return chipPalette[Math.abs(hash) % chipPalette.length];
}
