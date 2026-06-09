"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { BookingModalHost } from "@/components/site/booking-modal-host";
import type { HeroBookingDraftSession } from "@/components/site/hero-booking-modal";
import type { PresentationType, Region } from "@/lib/domain/types";

type BookingModalRequest = {
  id: number;
  initialStep?: "plan" | "review";
  presentationSlug?: string;
  regionSlug?: string;
  date?: string;
  time?: string;
  sessions?: HeroBookingDraftSession[];
};

type BookingModalContextValue = {
  openBooking: (options?: Omit<BookingModalRequest, "id">) => void;
  closeBooking: () => void;
};

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({
  children,
  presentations,
  regions,
  action
}: {
  children: ReactNode;
  presentations: PresentationType[];
  regions: Region[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const nextIdRef = useRef(1);
  const [request, setRequest] = useState<BookingModalRequest | null>(null);

  const openBooking = useCallback((options: Omit<BookingModalRequest, "id"> = {}) => {
    setRequest({
      id: nextIdRef.current++,
      ...options
    });
  }, []);

  const closeBooking = useCallback(() => {
    setRequest(null);
  }, []);

  const value = useMemo(
    () => ({
      openBooking,
      closeBooking
    }),
    [closeBooking, openBooking]
  );

  return (
    <BookingModalContext.Provider value={value}>
      {children}
      <BookingModalHost
        request={request}
        onClose={closeBooking}
        presentations={presentations}
        regions={regions}
        action={action}
      />
    </BookingModalContext.Provider>
  );
}

export function useBookingModal() {
  return useContext(BookingModalContext);
}
