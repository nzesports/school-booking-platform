import { beforeEach, describe, expect, it, vi } from "vitest";

// Log booking → "Record only, don't send any emails". A fake Supabase client
// records every write; the email entry points are spies, so nothing is sent.
const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  scheduleEmail: vi.fn(),
  sendSchoolStatusChangeEmails: vi.fn(),
  sendSchoolSessionEmails: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  deletes: [] as string[],
  rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResult: null as unknown
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/services/auth", () => ({
  buildAuthConfirmUrl: vi.fn(),
  requirePortalAccess: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    role: "super_admin",
    fullName: "Test Admin",
    email: "admin@example.nz",
    status: "active"
  }))
}));
vi.mock("@/lib/services/email-background", () => ({ scheduleEmail: mocks.scheduleEmail }));
vi.mock("@/lib/services/school-session-email", () => ({
  sendSchoolSessionEmails: mocks.sendSchoolSessionEmails,
  sendSchoolStatusChangeEmails: mocks.sendSchoolStatusChangeEmails
}));
vi.mock("@/lib/services/email", () => ({ sendTransactionalEmail: mocks.sendTransactionalEmail }));

function fakeQuery(table: string) {
  let operation = "select";
  let payload: Record<string, unknown> | null = null;

  const result = () => {
    if (table === "schools") {
      return { data: { id: SCHOOL_ID, name: "Harbour College", region_id: null, status: "active" }, error: null };
    }
    if (table === "school_contacts") return { data: { id: "contact-1" }, error: null };
    if (table === "booking_requests" && operation === "insert") {
      return { data: { id: payload?.id, reference_code: "123456" }, error: null };
    }
    if (table === "booking_sessions" && operation === "insert") return { data: { id: "session-1" }, error: null };
    return { data: null, error: null };
  };

  const builder: Record<string, unknown> = {
    insert(value: Record<string, unknown>) {
      operation = "insert";
      payload = value;
      mocks.inserts.push({ table, payload: value });
      return builder;
    },
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null })
  };

  for (const method of ["select", "eq", "in", "is", "ilike", "order", "limit", "update", "or", "not"]) {
    builder[method] = () => builder;
  }

  builder.delete = () => {
    mocks.deletes.push(table);
    return builder;
  };

  return builder;
}

// The session itself is inserted by insert_booking_session_checked (0055).
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => fakeQuery(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      mocks.rpcs.push({ name, args });
      return { data: mocks.rpcResult, error: null };
    }
  })
}));

import { saveManualBookingAction } from "@/app/portal/actions";

const SCHOOL_ID = "22222222-2222-4222-8222-222222222222";

function logBookingForm({ date, recordOnly }: { date: string; recordOnly: boolean }) {
  const form = new FormData();
  form.set("submissionId", "33333333-3333-4333-8333-333333333333");
  form.set("schoolId", SCHOOL_ID);
  form.set("schoolName", "Harbour College");
  form.set("presentationTypeId", "44444444-4444-4444-8444-444444444444");
  form.set("contactName", "Aroha Rangi");
  form.set("contactEmail", "aroha@example.nz");
  form.set("assignedAmbassadorId", "55555555-5555-4555-8555-555555555555");
  form.set("status", "confirmed");
  form.set("date", date);
  form.set("startTime", "09:30");
  form.set("durationMinutes", "45");
  form.set("yearLevels", "Years 9 to 10");
  form.set("expectedStudentCount", "120");
  form.set("returnTo", "/admin/bookings");
  if (recordOnly) form.set("recordOnly", "on");
  return form;
}

async function submit(form: FormData) {
  await expect(saveManualBookingAction(form)).rejects.toThrow(/^REDIRECT:\/admin\/bookings\?/);
}

function inserted(table: string) {
  return mocks.inserts.find((entry) => entry.table === table)?.payload;
}

function insertedSession() {
  const call = mocks.rpcs.find((entry) => entry.name === "insert_booking_session_checked");
  return call?.args.p_session as Record<string, unknown> | undefined;
}

function expectNoEmails() {
  expect(mocks.scheduleEmail).not.toHaveBeenCalled();
  expect(mocks.sendSchoolStatusChangeEmails).not.toHaveBeenCalled();
  expect(mocks.sendSchoolSessionEmails).not.toHaveBeenCalled();
  expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
}

describe("Log booking — record only", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.deletes.length = 0;
    mocks.rpcs.length = 0;
    mocks.rpcResult = [{ outcome: "inserted", session_id: "session-1", conflict_session_id: null }];
    for (const mock of [
      mocks.redirect,
      mocks.scheduleEmail,
      mocks.sendSchoolStatusChangeEmails,
      mocks.sendSchoolSessionEmails,
      mocks.sendTransactionalEmail
    ]) {
      mock.mockReset();
    }
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it("backlogs a past session silently and settled, with no report or payment due", async () => {
    await submit(logBookingForm({ date: "2025-03-10", recordOnly: true }));

    expect(inserted("booking_requests")).toMatchObject({ manual_email_only: true, status: "closed" });
    // payment_status is always 'not_eligible', set by the database function.
    expect(insertedSession()).toMatchObject({ status: "closed", report_status: "reviewed" });
    expect(inserted("booking_sessions")).toBeUndefined();
    expectNoEmails();
  });

  it("keeps a future record-only booking in the normal flow but silent", async () => {
    await submit(logBookingForm({ date: "2099-03-10", recordOnly: true }));

    expect(inserted("booking_requests")).toMatchObject({ manual_email_only: true, status: "confirmed" });
    expect(insertedSession()).toMatchObject({ status: "confirmed", report_status: "not_submitted" });
    expectNoEmails();
  });

  it("control: the same confirmed booking without record only queues the confirmation email", async () => {
    await submit(logBookingForm({ date: "2099-03-10", recordOnly: false }));

    expect(inserted("booking_requests")).toMatchObject({ manual_email_only: false, status: "confirmed" });
    expect(mocks.scheduleEmail).toHaveBeenCalledOnce();
  });
});

describe("Log booking — checked session insert", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.deletes.length = 0;
    mocks.rpcs.length = 0;
    mocks.rpcResult = [{ outcome: "inserted", session_id: "session-1", conflict_session_id: null }];
    mocks.scheduleEmail.mockReset();
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it("sends only the allowed session fields, with the chosen ambassador and online details", async () => {
    const form = logBookingForm({ date: "2099-03-10", recordOnly: false });
    form.set("deliveryMode", "online");
    form.set("meetingUrl", "https://meet.example.nz/abc");

    await submit(form);

    const call = mocks.rpcs[0];
    expect(call.name).toBe("insert_booking_session_checked");
    expect(call.args).toMatchObject({
      p_actor_id: "11111111-1111-4111-8111-111111111111",
      p_booking_id: "33333333-3333-4333-8333-333333333333"
    });
    expect(Object.keys(insertedSession() ?? {}).sort()).toEqual(
      [
        "actual_student_count",
        "assigned_ambassador_id",
        "delivery_mode",
        "ends_at",
        "expected_student_count",
        "internal_notes",
        "meeting_url",
        "presentation_type_id",
        "report_status",
        "starts_at",
        "status",
        "year_levels"
      ].sort()
    );
    expect(insertedSession()).toMatchObject({
      assigned_ambassador_id: "55555555-5555-4555-8555-555555555555",
      delivery_mode: "online",
      meeting_url: "https://meet.example.nz/abc"
    });
  });

  it("removes the booking again, shows the clash and emails nobody when the ambassador is busy", async () => {
    mocks.rpcResult = [{ outcome: "ambassador-conflict", session_id: null, conflict_session_id: "other" }];

    await expect(saveManualBookingAction(logBookingForm({ date: "2099-03-10", recordOnly: false }))).rejects.toThrow(
      "REDIRECT:/admin/bookings?error=ambassador-conflict"
    );
    expect(mocks.deletes).toEqual(["booking_requests"]);
    expect(mocks.scheduleEmail).not.toHaveBeenCalled();
    expect(inserted("booking_status_history")).toBeUndefined();
  });

  it("treats any other refusal or a failed call as a failed save", async () => {
    mocks.rpcResult = [{ outcome: "not-authorized", session_id: null, conflict_session_id: null }];

    await expect(saveManualBookingAction(logBookingForm({ date: "2099-03-10", recordOnly: false }))).rejects.toThrow(
      "REDIRECT:/admin/bookings?error=booking-session-save-failed"
    );
    expect(mocks.deletes).toEqual(["booking_requests"]);
  });
});
