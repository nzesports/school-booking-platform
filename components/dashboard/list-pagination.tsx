"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// The element that scrolls `element` (a scrolling panel, or the page).
function scrollContainerOf(element: HTMLElement) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }

  return document.scrollingElement ?? document.documentElement;
}

// "Showing 1 to 10 of 24" with numbered pages, shared by the paged lists.
// Changing page changes the list's height, which would move the pager out
// from under the pointer; the scroll is corrected so the pager stays put.
export function ListPagination({
  currentPage,
  pageSize,
  pageCount,
  totalItems,
  itemLabel,
  onPageChange
}: {
  currentPage: number;
  pageSize: number;
  pageCount: number;
  totalItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  const rootRef = useRef<HTMLDivElement>(null);
  const topBeforeChange = useRef<number | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const previousTop = topBeforeChange.current;
    topBeforeChange.current = null;

    if (!root || previousTop === null) {
      return;
    }

    const shift = root.getBoundingClientRect().top - previousTop;
    if (shift !== 0) {
      scrollContainerOf(root).scrollTop += shift;
    }
  }, [currentPage]);

  const goToPage = (page: number) => {
    topBeforeChange.current = rootRef.current?.getBoundingClientRect().top ?? null;
    onPageChange(page);
  };

  return (
    <div ref={rootRef} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[color:var(--text-soft)]">
        Showing {firstItem} to {lastItem} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1.5" aria-label={`${itemLabel} pagination`}>
        <PaginationArrow
          disabled={currentPage === 1}
          label="Previous page"
          onClick={() => goToPage(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </PaginationArrow>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => goToPage(pageNumber)}
            aria-current={pageNumber === currentPage ? "page" : undefined}
            className={cn(
              "flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[8px] border px-2.5 text-[12px] font-semibold transition",
              pageNumber === currentPage
                ? "border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] hover:border-[rgba(4,15,75,0.2)]"
            )}
          >
            {pageNumber}
          </button>
        ))}
        <PaginationArrow
          disabled={currentPage === pageCount}
          label="Next page"
          onClick={() => goToPage(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </PaginationArrow>
      </div>
    </div>
  );
}

function PaginationArrow({
  children,
  disabled,
  label,
  onClick
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:border-[rgba(4,15,75,0.2)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

// Shows `rows` a page at a time, with the pager only once there's more than
// one page. The page is clamped so a list that shrinks after an action
// (e.g. a payment moving on to the next card) never lands on an empty page.
export function PagedList({
  rows,
  pageSize,
  itemLabel
}: {
  rows: ReactNode[];
  pageSize: number;
  itemLabel: string;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  return (
    <>
      {rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
      {rows.length > pageSize ? (
        <ListPagination
          currentPage={currentPage}
          pageSize={pageSize}
          pageCount={pageCount}
          totalItems={rows.length}
          itemLabel={itemLabel}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}
