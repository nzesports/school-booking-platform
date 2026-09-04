"use client";

import { ImagePlus, Move, ZoomIn } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";

const OUTPUT_SIZE = 768;

type ImageDimensions = {
  width: number;
  height: number;
};

type CropOffset = {
  x: number;
  y: number;
};

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
  const [sourceName, setSourceName] = useState("profile-image");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [viewportSize, setViewportSize] = useState(320);
  const [applying, setApplying] = useState(false);
  const croppedInputRef = useRef<HTMLInputElement>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!cropOpen || !cropViewportRef.current) {
      return;
    }

    const viewport = cropViewportRef.current;
    const updateViewportSize = () => setViewportSize(viewport.clientWidth || 320);
    updateViewportSize();

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [cropOpen]);

  const geometry = dimensions
    ? cropGeometry(dimensions, viewportSize, zoom)
    : { width: viewportSize, height: viewportSize, maxX: 0, maxY: 0 };
  const clampedOffset = dimensions
    ? clampCropOffset(offset, dimensions, viewportSize, zoom)
    : offset;
  const displayedImageUrl = previewUrl ?? currentLogoUrl;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dimensions) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: clampedOffset.x,
      originY: clampedOffset.y
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !dimensions) {
      return;
    }

    setOffset(
      clampCropOffset(
        {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY
        },
        dimensions,
        viewportSize,
        zoom
      )
    );
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const applyCrop = async () => {
    if (!sourceUrl || !dimensions || !croppedInputRef.current) {
      return;
    }

    setApplying(true);

    try {
      const file = await createSquareCrop({
        sourceUrl,
        sourceName,
        dimensions,
        viewportSize,
        zoom,
        offset: clampedOffset
      });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      croppedInputRef.current.files = transfer.files;
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return URL.createObjectURL(file);
      });
      setCropOpen(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative aspect-square w-full max-w-[180px] overflow-hidden rounded-[24px] border border-[color:var(--border-soft)] bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]">
        {displayedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayedImageUrl}
            alt={`${schoolName} image preview`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#eef2f8,#eaf8ee)] text-3xl font-bold text-[color:var(--navy)]">
            {emptyLabel ?? initialsFor(schoolName)}
          </span>
        )}
      </div>

      <div className="grid content-start gap-3">
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
              setDimensions(null);
              setZoom(1);
              setOffset({ x: 0, y: 0 });
              setCropOpen(true);
              event.currentTarget.value = "";
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

        {sourceUrl && previewUrl ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCropOpen(true)}
            className="min-h-[40px] w-fit rounded-[13px] px-4 text-xs"
          >
            <Move className="h-3.5 w-3.5" />
            Adjust crop
          </Button>
        ) : null}
        <p className="text-xs leading-5 text-[color:var(--text-soft)]">{helperText}</p>
      </div>

      {cropOpen && sourceUrl
        ? createPortal(
            <BookingDialogShell
              kicker="Image crop"
              title="Position your image"
              description="Drag the image inside the square, then use the zoom control to frame it."
              onClose={() => setCropOpen(false)}
              maxWidthClassName="max-w-[720px]"
              overlayClassName="z-[100]"
              compact
            >
              <div className="mt-6 grid justify-items-center gap-5">
                <div
                  ref={cropViewportRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={stopDragging}
                  onPointerCancel={stopDragging}
                  className="relative aspect-square w-full max-w-[390px] touch-none cursor-grab overflow-hidden rounded-[26px] bg-[#e9eef5] shadow-[inset_0_0_0_2px_rgba(4,15,75,0.14)] active:cursor-grabbing"
                  aria-label="Drag to reposition image crop"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sourceUrl}
                    alt="Crop preview"
                    draggable={false}
                    onLoad={(event) =>
                      setDimensions({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight
                      })
                    }
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                      width: `${geometry.width}px`,
                      height: `${geometry.height}px`,
                      left: `${(viewportSize - geometry.width) / 2 + clampedOffset.x}px`,
                      top: `${(viewportSize - geometry.height) / 2 + clampedOffset.y}px`
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/80" />
                  <div className="pointer-events-none absolute left-1/3 top-0 h-full border-l border-white/35" />
                  <div className="pointer-events-none absolute left-2/3 top-0 h-full border-l border-white/35" />
                  <div className="pointer-events-none absolute left-0 top-1/3 w-full border-t border-white/35" />
                  <div className="pointer-events-none absolute left-0 top-2/3 w-full border-t border-white/35" />
                </div>

                <label className="grid w-full max-w-[470px] gap-2">
                  <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                    <span className="inline-flex items-center gap-2">
                      <ZoomIn className="h-4 w-4 text-[color:var(--green)]" />
                      Zoom
                    </span>
                    <span>{Math.round(zoom * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.02}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="h-2 w-full cursor-pointer accent-[color:var(--green)]"
                  />
                </label>

                <div className="flex w-full justify-end gap-3 border-t border-[color:var(--border-soft)] pt-5">
                  <Button type="button" variant="secondary" onClick={() => setCropOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={applyCrop}
                    disabled={!dimensions || applying}
                    className="border-[#149238] bg-[color:var(--green)] text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
                  >
                    {applying ? "Applying…" : "Use image"}
                  </Button>
                </div>
              </div>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </div>
  );
}

function cropGeometry(dimensions: ImageDimensions, viewportSize: number, zoom: number) {
  const baseScale = Math.max(
    viewportSize / dimensions.width,
    viewportSize / dimensions.height
  );
  const width = dimensions.width * baseScale * zoom;
  const height = dimensions.height * baseScale * zoom;

  return {
    width,
    height,
    maxX: Math.max(0, (width - viewportSize) / 2),
    maxY: Math.max(0, (height - viewportSize) / 2)
  };
}

function clampCropOffset(
  offset: CropOffset,
  dimensions: ImageDimensions,
  viewportSize: number,
  zoom: number
) {
  const geometry = cropGeometry(dimensions, viewportSize, zoom);
  return {
    x: Math.max(-geometry.maxX, Math.min(geometry.maxX, offset.x)),
    y: Math.max(-geometry.maxY, Math.min(geometry.maxY, offset.y))
  };
}

async function createSquareCrop({
  sourceUrl,
  sourceName,
  dimensions,
  viewportSize,
  zoom,
  offset
}: {
  sourceUrl: string;
  sourceName: string;
  dimensions: ImageDimensions;
  viewportSize: number;
  zoom: number;
  offset: CropOffset;
}) {
  const image = new Image();
  image.src = sourceUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare the image crop.");
  }

  const baseScale = Math.max(
    OUTPUT_SIZE / dimensions.width,
    OUTPUT_SIZE / dimensions.height
  );
  const width = dimensions.width * baseScale * zoom;
  const height = dimensions.height * baseScale * zoom;
  const outputRatio = OUTPUT_SIZE / viewportSize;
  const x = (OUTPUT_SIZE - width) / 2 + offset.x * outputRatio;
  const y = (OUTPUT_SIZE - height) / 2 + offset.y * outputRatio;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(image, x, y, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Unable to export the image crop."));
      }
    }, "image/png");
  });
  const safeName = sourceName.replace(/\.[^.]+$/, "") || "profile-image";

  return new File([blob], `${safeName}-square.png`, { type: "image/png" });
}

function initialsFor(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}
