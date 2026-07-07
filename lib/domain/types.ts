export type Role = "super_admin" | "staff" | "ambassador" | "school";

export type ProfileStatus = "active" | "inactive";

export type BookingStatus =
  | "requested"
  | "tentative"
  | "ambassador_needed"
  | "ambassador_applied"
  | "ambassador_assigned"
  | "confirmed"
  | "withdrawal_requested"
  | "reschedule_requested"
  | "cancel_requested"
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
  | "invoiced"
  | "submitted_for_payment"
  | "paid";

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
  audience: "school" | "ambassador" | "staff";
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
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  progress: number;
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
}

export interface AmbassadorProfile {
  id: string;
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

export interface BookingSessionView {
  id: string;
  presentationTypeId?: string;
  presentationSlug: string;
  presentationTitle: string;
  regionSlug: string;
  regionName?: string;
  schoolId?: string;
  schoolName: string;
  schoolAddress?: string;
  locationAddress?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  startsAt: string;
  endsAt: string;
  yearLevels: string;
  expectedStudentCount: number;
  actualStudentCount?: number;
  status: BookingStatus;
  assignedAmbassadorName?: string;
  assignedAmbassadorEmail?: string;
  assignedAmbassadorPhone?: string;
  reportStatus: ReportStatus;
  paymentStatus: PaymentStatus;
  myApplicationStatus?: string;
  applicants?: Array<{ id: string; name: string }>;
  bookingRequestId?: string;
  bookingStatus?: BookingStatus;
  withdrawalReason?: string;
  withdrawalRequestedAt?: string;
}

export interface BookingRequestView {
  id: string;
  schoolName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  regionSlug: string;
  status: BookingStatus;
  source: "public" | "staff" | "ambassador";
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
  schoolName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  regionSlug: string;
  schoolNotes?: string;
  marketingConsent: boolean;
  sessions: BookingSessionDraft[];
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
  ambassadorName: string;
  bookingSessionId: string;
  amountCents: number;
  status: PaymentStatus;
  eligibilityReason: string;
  createdAt: string;
  paidAt?: string;
  invoiceNumber?: string;
  invoiceSubmittedAt?: string;
  sentToFinanceAt?: string;
  sentToEmail?: string;
  sentCcEmail?: string;
  bankAccountNumber?: string;
  gstNumber?: string;
  invoiceNotes?: string;
}

export interface ReportSummary {
  id: string;
  schoolId?: string;
  schoolName: string;
  presentationTypeId?: string;
  presentationTitle: string;
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
  media?: Array<{ url: string; type: string; title?: string }>;
  bookingRequestId?: string;
  bookingRequestedAt?: string;
  reviewedAt?: string;
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
