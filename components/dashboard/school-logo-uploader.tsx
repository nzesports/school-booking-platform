"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Move, ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";

const CROP_SIZE = 768;

type SchoolLogoUploaderProps = {
  currentLogoUrl?: string | null;
  schoolName: string;
  inputName?: string;
  uploadLabel?: string;
  chooseLabel?: string;
  emptyLabel?: string;
  helperText?: string;
};

export function SchoolLogoUploader({
  currentLogoUrl,
  schoolName,
  inputName = "logo",
  uploadLabel = "Upload logo",
  chooseLabel = "Choose image",
  emptyLabel,
  helperText = "PNG, JPG, or WebP works best. Uploading replaces your current logo."
}: SchoolLogoUploaderProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("school-logo");
  const [scale, setScale] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const croppedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) {
      return;
    }

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

      const baseScale = Math.max(CROP_SIZE / image.naturalWidth, CROP_SIZE / image.naturalHeight);
      const drawWidth = image.naturalWidth * baseScale * scale;
      const drawHeight = image.naturalHeight * baseScale * scale;
      const maxOffsetX = Math.max(0, (drawWidth - CROP_SIZE) / 2);
      const maxOffsetY = Math.max(0, (drawHeight - CROP_SIZE) / 2);
      const drawX = (CROP_SIZE - drawWidth) / 2 + (positionX / 100) * maxOffsetX;
      const drawY = (CROP_SIZE - drawHeight) / 2 + (positionY / 100) * maxOffsetY;

      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      canvas.toBlob((blob) => {
        if (cancelled || !blob || !croppedInputRef.current) {
          return;
        }

        const safeName = sourceName.replace(/\.[^.]+$/, "") || "school-logo";
        const file = new File([blob], `${safeName}-square.png`, { type: "image/png" });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        croppedInputRef.current.files = transfer.files;
      }, "image/png");
    };

    image.src = sourceUrl;

    return () => {
      cancelled = true;
    };
  }, [positionX, positionY, scale, sourceName, sourceUrl]);

  return (
    <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="grid gap-2">
        <div className="relative aspect-square w-full max-w-[180px] overflow-hidden rounded-[24px] border border-[color:var(--border-soft)] bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]">
          {sourceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sourceUrl}
              alt={`${schoolName} logo preview`}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${50 + positionX / 2}% ${50 + positionY / 2}%`,
                transform: `scale(${scale})`
              }}
            />
          ) : currentLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentLogoUrl}
              alt={`${schoolName} logo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#eef2f8,#eaf8ee)] text-3xl font-bold text-[color:var(--navy)]">
              {emptyLabel ??
                schoolName
                  .split(" ")
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")}
            </span>
          )}
        </div>
        <p className="text-xs text-[color:var(--text-soft)]">Saved as a square image.</p>
      </div>

      <div className="grid content-start gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
            {uploadLabel}
          </span>
          <span className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[16px] border border-dashed border-[color:var(--border-soft)] bg-white/92 px-4 text-sm font-semibold text-[color:var(--navy)] transition hover:border-[rgba(24,168,59,0.35)] hover:bg-[#f7fdf8]">
            <ImagePlus className="h-4 w-4 text-[color:var(--green)]" />
            {chooseLabel}
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              setSourceUrl((current) => {
                if (current) {
                  URL.revokeObjectURL(current);
                }
                return URL.createObjectURL(file);
              });
              setSourceName(file.name);
              setScale(1);
              setPositionX(0);
              setPositionY(0);
            }}
          />
        </label>
        <input
          ref={croppedInputRef}
          type="file"
          name={inputName}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        {sourceUrl ? (
          <div className="grid gap-4 rounded-[20px] border border-[color:var(--border-soft)] bg-white/82 p-4">
            <LogoRange
              icon={<ZoomIn className="h-4 w-4" />}
              label="Scale"
              min={1}
              max={3}
              step={0.05}
              value={scale}
              onChange={setScale}
            />
            <LogoRange
              icon={<Move className="h-4 w-4" />}
              label="Horizontal"
              min={-100}
              max={100}
              step={1}
              value={positionX}
              onChange={setPositionX}
            />
            <LogoRange
              icon={<Move className="h-4 w-4 rotate-90" />}
              label="Vertical"
              min={-100}
              max={100}
              step={1}
              value={positionY}
              onChange={setPositionY}
            />
          </div>
        ) : (
          <p className="text-xs leading-5 text-[color:var(--text-soft)]">
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}

function LogoRange({
  icon,
  label,
  min,
  max,
  step,
  value,
  onChange
}: {
  icon: ReactNode;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        <span className={cn("text-[color:var(--green)]")}>{icon}</span>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-[color:var(--green)]"
      />
    </label>
  );
}
