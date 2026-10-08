"use client";

import { MonitorPlay } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { BookingFormState } from "@/app/actions";
import { BookingModalHost } from "@/components/site/booking-modal-host";
import { Button } from "@/components/ui/button";
import type { PresentationType } from "@/lib/domain/types";
import type { AvailabilityConfig } from "@/lib/services/availability";

const subscribeNoop = () => () => {};

// Opens the standard booking form in online mode as soon as the private
// online booking page loads, and lets the school reopen it after closing.
// The form is portalled to <body>: page content sits in a z-10 stacking
// context below the sticky site header, which would otherwise cover it.
export function OnlineBookingLauncher({
  token,
  presentations,
  availabilityConfig,
  action
}: {
  token: string;
  presentations: PresentationType[];
  availabilityConfig?: AvailabilityConfig;
  action: (state: BookingFormState, formData: FormData) => Promise<BookingFormState>;
}) {
  const [request, setRequest] = useState<{ id: number } | null>({ id: 1 });
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setRequest((current) => ({ id: (current?.id ?? 1) + 1 }))}
        className="min-h-12 w-full"
      >
        <MonitorPlay className="h-4 w-4" aria-hidden="true" />
        Start your online booking
      </Button>
      {isClient
        ? createPortal(
            <BookingModalHost
              request={request}
              onClose={() => setRequest(null)}
              presentations={presentations}
              regions={[]}
              availabilityConfig={availabilityConfig}
              action={action}
              mode="online"
              hiddenFields={{ onlineBookingToken: token }}
            />,
            document.body
          )
        : null}
    </>
  );
}
