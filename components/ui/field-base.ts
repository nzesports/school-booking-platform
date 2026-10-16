/**
 * The one size every form control in the app uses.
 *
 * Kept deliberately in step with BUTTON_SIZE in components/ui/button.tsx —
 * 36px tall, 12px text, 8px radius — so a field and a button sitting next to
 * each other in a toolbar line up. Sizing lives only here: call sites pass
 * colour and layout, not size, because tailwind-merge lets any size utility at
 * a call site silently beat this string.
 */
export const FIELD_SIZE =
  "min-h-[36px] w-full rounded-[8px] px-3 py-[9px] text-[12px] leading-[16px]";

export const FIELD_SKIN =
  "border border-[color:var(--border-soft)] bg-white/92 text-[color:var(--text-dark)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)] outline-none transition placeholder:text-[color:var(--text-soft)] focus:border-[color:rgba(24,168,59,0.34)] focus:ring-2 focus:ring-[rgba(24,168,59,0.1)]";

export const FIELD_BASE = `${FIELD_SIZE} ${FIELD_SKIN}`;

/** Multi-line fields keep the shared width/padding but need real height. */
export const TEXTAREA_BASE = FIELD_BASE.replace("min-h-[36px]", "min-h-[88px]");
