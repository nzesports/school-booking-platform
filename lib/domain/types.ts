export type Role = "super_admin" | "staff" | "ambassador" | "school";

export type ProfileStatus = "active" | "inactive";

export type BookingStatus =
  | "requested"
  | "tentative"
  | "applied"
  | "ambassador_assigned"
  | "confirmed"
  | "withdrawal_requested"
  | "reschedule_requested"
  | "cancelled"
  | "completed_pending_report"
  | "report_submitted"
  | "payment_pending"
  | "paid"
  | "closed"
  | "declined";

export type PaymentStatus =
  | "not_eligible"
  | "eligible"
  | "pending"
  | "approved"
  | "paid";

export type WithdrawalReasonType = "school_rescheduled" | "unavailable" | "other";

export type FinanceEmailStatus = "pending" | "sent" | "failed";

export type ReportStatus =
  | "not_submitted"
  | "draft"
  | "submitted"
  | "reviewed";

export interface Region {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder?: number;
}

export interface PresentationType {
  id: string;
  slug: string;
  title: string;
  shortSummary: string;
  fullDescription: string;
  contentSnippet?: string;
  durationMinutes: number;
  yearLevels: string;
  deliveryFormats: string[];
  learningOutcomes: string[];
  requiredEquipment: string[];
  youtubeUrl?: string;
  imageUrl?: string;
  accentColor?: string;
  active: boolean;
  public: boolean;
}

export interface Testimonial {
  id: string;
  quote: string;
  attribution: string;
  school: string;
  presentationTitle?: string;
  feedbackDate?: string;
  rating?: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export type ResourceAudience = "public" | "school" | "ambassador" | "staff";

export interface ResourceItem {
  id: string;
  title: string;
  description: string;
  type:
    | "pdf"
    | "video"
    | "slide_deck"
    | "worksheet"
    | "image"
    | "youtube"
    | "pptx"
    | "script"
    | "file";
  audience: ResourceAudience;
  presentationSlug?: string;
  isCurrent: boolean;
  downloadUrl?: string;
  embedUrl?: string;
}

export interface TrainingLesson {
  id: string;
  title: string;
  type: "video" | "quiz" | "checklist";
  durationMinutes: number;
  youtubeUrl?: string;
  content?: string;
}

export interface TrainingModule {
  id: string;
  presentationTypeId?: string;
  title: string;
  description: string;
  lessons: TrainingLesson[];
}

export interface School {
  id: string;
  name: string;
  regionSlug: string;
  city: string;
  rollSize: number;
  status: "active" | "pending_review";
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  // Availability windows / site instructions the school shares with staff.
  profileNotes?: string | null;
}

export interface SchoolFeedbackSummary {
  id: string;
  schoolId?: string;
  schoolName: string;
  presentationTypeId?: string;
  presentationTitle: string;
  quote: string;
  attribution?: string;
  rating?: number;
  createdAt: string;
  isApproved: boolean;
  isPublic: boolean;
  bookingSessionId?: string;
  // Structured answers from the post-session feedback form.
  details?: {
    firstName?: string;
    lastName?: string;
    role?: string;
    studentsAttended?: number;
    studentsCompeted?: string;
    attendeeFeedback?: string;
    attendanceRating?: number;
    studentResponseRating?: number;
    contentRating?: number;
    presenterEnergyRating?: number;
    hadEsportsClub?: string;
    consideringClub?: string;
    mailingListOptIn?: string;
  };
}

export interface AmbassadorProfileDetails {
  mailingAddress?: string;
  payoutEmail?: string;
  payoutMethod?: string;
  invoiceName?: string;
  irdNumber?: string;
  billingNote?: string;
  bookingTypes?: string[];
  preferredTimes?: string;
  weeklyAvailability?: Record<string, string>;
  unavailableDates?: string[];
  availabilityNote?: string;
  materialsConsentAcceptedAt?: string;
  materialsConsentSignedName?: string;
  materialsConsentVersion?: string;
}

export interface AmbassadorProfile {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  imageUrl?: string | null;
  regionSlug: string;
  regionName?: string;
  status: "applied" | "approved" | "inactive" | "declined";
  openToTravel: boolean;
  travelRegions: string[];
  bio?: string;
  experience?: string;
  referredBy?: string;
  estimatedEarningsCents: number;
  pendingPaymentsCents: number;
  paidPaymentsCents: number;
  bankAccountName?: string;
  bankAccountNumber?: string;
  gstNumber?: string;
  details?: AmbassadorProfileDetails;
}

// An ambassador's open application for a session, with their track record so
// staff can choose between applicants.
export type SessionApplicant = {
  id: string;
  name: string;
  message?: string;
  deliveredSessions?: number;
  averageRating?: number;
  reviewCount?: number;
};

export interface BookingSessionView {
  id: string;
  presentationTypeId?: string;
  presentationSlug: string;
  presentationTitle: string;
  presentationAccentColor?: string;
  regionSlug: string;
  regionName?: string;
  schoolId?: string;
  schoolName: string;
  schoolRollSize?: number;
  schoolAddress?: string;
  locationAddress?: string;
  // Online sessions are booked via the private online booking link (or logged
  // by staff); they have no region and staff add a video-call link.
  // Undefined means in person.
  deliveryMode?: "in_person" | "online";
  meetingUrl?: string;
  contactName?: string;
  contactEmail?: string;
  contactPosition?: string;
  contactPhone?: string;
  startsAt: string;
  endsAt: string;
  yearLevels: string;
  expectedStudentCount: number;
  actualStudentCount?: number;
  status: BookingStatus;
  assignedAmbassadorId?: string;
  assignedAmbassadorName?: string;
  assignedAmbassadorEmail?: string;
  assignedAmbassadorPhone?: string;
  reportStatus: ReportStatus;
  paymentStatus: PaymentStatus;
  myApplicationStatus?: string;
  applicants?: SessionApplicant[];
  bookingRequestId?: string;
  bookingStatus?: BookingStatus;
  // Who sourced the parent booking; decides the ambassador's sourced rate.
  bookingSource?: BookingRequestView["source"];
  sourcedByAmbassadorId?: string;
  sourcedByAmbassadorName?: string;
  withdrawalReason?: string;
  withdrawalRequestedAt?: string;
  rescheduleHistory?: Array<{
    changedAt: string;
    previousStartsAt?: string;
    startsAt?: string;
  }>;
  rescheduleRequestedDate?: string;
  rescheduleRequestNotes?: string;
  rescheduleRequestedAt?: string;
  reschedulePreviousStatus?: BookingStatus;
  // Set when the school moved the session itself; cleared once staff
  // confirm the new date. Puts the session in the "Rescheduling" view.
  rescheduleConfirmationNeededAt?: string;
  withdrawalReasonType?: WithdrawalReasonType;
}

export interface BookingRequestView {
  id: string;
  referenceCode?: string;
  // Logged as "record only": no emails of any kind are sent for it.
  recordOnly?: boolean;
  // Successful emails to the school (automatic and sent by staff).
  schoolEmailsSentCount?: number;
  lastSchoolEmailSentAt?: string;
  schoolName: string;
  primaryContactPosition?: string;
  primaryContactName: string;
  primaryContactEmail: string;
  regionSlug: string;
  status: BookingStatus;
  source: "public" | "staff" | "ambassador" | "ambassador_booked";
  sourcedByAmbassadorId?: string;
  sourcedByAmbassadorName?: string;
  schoolNotes?: string;
  internalNotes?: string;
  createdAt: string;
  sessions: BookingSessionView[];
}

export interface BookingSessionDraft {
  presentationSlug: string;
  regionSlug: string;
  date: string;
  startTime: string;
  endTime: string;
  yearLevels: string;
  expectedStudentCount: number;
}

export interface BookingRequestInput {
  contactPosition?: string;
  schoolName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  regionSlug: string;
  schoolNotes?: string;
  marketingConsent: boolean;
  sessions: BookingSessionDraft[];
  submittedByUserId?: string;
  // "online" for the private online booking link: no region, video call.
  deliveryMode?: "in_person" | "online";
}

export interface BookingContactDefaults {
  schoolName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  regionSlug: string;
}

export interface AvailabilitySlot {
  label: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface DashboardMetric {
  label: string;
  value: string;
  trend?: string;
  detail?: string;
  icon?:
    | "calendar"
    | "users"
    | "clock"
    | "star"
    | "banknote"
    | "school"
    | "map"
    | "shield"
    | "file"
    | "sparkles";
  tone?: "green" | "blue" | "amber" | "navy" | "violet";
}

export interface BookingActivityLogSummary {
  bookingRequestId?: string;
  bookingSessionId?: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  actorType?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  dueAt: string;
  owner: string;
  status: "open" | "in_progress" | "done";
}

export interface PaymentRecord {
  id: string;
  ambassadorProfileId?: string;
  ambassadorName: string;
  bookingSessionId: string;
  amountCents: number;
  baseAmountCents: number;
  sourcingBonusCents: number;
  // The tier's amount for the second session of the same booking and day,
  // covered by this payment's report (included in amountCents): $50 within
  // 1 hour, $100 over 2 and under 4 hours (0056), or the flat $50 before 0056.
  additionalSessionCents?: number;
  // Staff amount added at approval (included in amountCents): an optional
  // extra, or for a custom-review payment the staff-chosen custom amount.
  extraAmountCents?: number;
  // Why the extra/custom amount was set, or why there was no payment.
  paymentNote?: string;
  // 0056 tier; undefined for payments created before 0056.
  paymentTier?: "single" | "pair_within_60" | "pair_120_to_240" | "custom_review";
  // Sessions the payment's report covers (0056 onwards).
  coveredSessionCount?: number;
  // Created for explicit staff custom review (reason and gap below); until
  // customReviewedAt is set its amount is not an earned/payable total.
  reviewRequired?: boolean;
  reviewReason?: string;
  reviewGapMinutes?: number;
  customReviewedAt?: string;
  // The same ambassador's sessions at that school that day which this payment
  // does not already cover (other bookings, or a third+ session).
  sameDayPaymentCount?: number;
  // The ambassador's current profile gaps that block approval.
  missingPaymentDetails?: string[];
  status: PaymentStatus;
  eligibilityReason: string;
  createdAt: string;
  paidAt?: string;
  invoiceNumber?: string;
  invoiceGeneratedAt?: string;
  sentToFinanceAt?: string;
  sentToEmail?: string;
  financeEmailStatus?: FinanceEmailStatus;
  financeEmailAttempts: number;
  financeEmailLastAttemptAt?: string;
  financeEmailError?: string;
  financeConfirmationExpiresAt?: string;
  financeConfirmedAt?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  gstNumber?: string;
}

export interface ReportSummary {
  id: string;
  ambassadorProfileId?: string;
  bookingSessionId?: string;
  schoolId?: string;
  schoolName: string;
  presentationTypeId?: string;
  presentationTitle: string;
  presentationAccentColor?: string;
  submittedAt: string;
  attendeeCount: number;
  status: ReportStatus;
  ambassadorName?: string;
  presenterName?: string;
  schoolRollSize?: number;
  primaryContactName?: string;
  primaryContactEmail?: string;
  deliveredAt?: string;
  firstPresentationToSchool?: boolean;
  studentsCompetedInEsports?: boolean;
  parentsPresent?: boolean;
  ageGroups?: string;
  mediaConsentConfirmed?: boolean;
  attendeeQuotes?: string;
  attendanceRating?: number;
  teacherResponseRating?: number;
  studentEngagementRating?: number;
  presentationEnergyRating?: number;
  notableQuestions?: string;
  presentationFeedback?: string;
  additionalNotes?: string;
  yearLevels?: string;
  sessionStartsAt?: string;
  // Every session the report covers: the ambassador's sessions of this
  // booking on the same NZ day (one report per double/triple session).
  coveredSessions?: Array<{ id: string; startsAt: string; endsAt?: string }>;
  media?: Array<{ id?: string; url: string; type: string; title?: string }>;
  bookingRequestId?: string;
  bookingRequestedAt?: string;
  reviewedAt?: string;
  paymentRequired?: boolean;
  paymentAmountCents?: number;
  // Parts of paymentAmountCents: delivery, sourcing bonus and the tier's
  // second-session amount.
  paymentBaseAmountCents?: number;
  paymentSourcingBonusCents?: number;
  paymentAdditionalSessionCents?: number;
  paymentTier?: PaymentRecord["paymentTier"];
  // The payment needs an explicit staff custom review before approval.
  paymentReviewRequired?: boolean;
  paymentReviewReason?: string;
  paymentReviewGapMinutes?: number;
  paymentCustomReviewedAt?: string;
  // Where the report's payment is now, for the dialog's status line.
  paymentStatus?: PaymentStatus;
  financeEmailStatus?: FinanceEmailStatus;
  sentToFinanceAt?: string;
  paidAt?: string;
  paymentNote?: string;
  sameDayPaymentCount?: number;
  paymentDetailsComplete?: boolean;
  missingPaymentDetails?: string[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  actor: string;
  createdAt: string;
}

export interface EmailTemplateSummary {
  id: string;
  key: string;
  subject: string;
  status: "active" | "draft";
  bodyHtml?: string;
  bodyText?: string;
}

export interface PortalNotification {
  id: string;
  title: string;
  body: string;
  notificationType: string;
  relatedUrl?: string;
  readAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface HomepageSectionRecord {
  id: string;
  sectionKey: string;
  title?: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: ProfileStatus;
  phone?: string;
  avatarUrl?: string | null;
  createdAt?: string;
  ambassadorProfileId?: string;
  ambassadorStatus?: AmbassadorProfile["status"];
}
