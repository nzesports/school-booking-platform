import type {
  AmbassadorProfile,
  AuditLogEntry,
  BookingRequestView,
  DashboardMetric,
  EmailTemplateSummary,
  Faq,
  PaymentRecord,
  PresentationType,
  Region,
  ReportSummary,
  ResourceItem,
  School,
  TaskItem,
  Testimonial,
  TrainingModule
} from "@/lib/domain/types";

export const regions: Region[] = [
  "Auckland Central",
  "South Auckland",
  "West Auckland",
  "East Auckland",
  "North Shore",
  "Christchurch",
  "Wellington",
  "Hamilton",
  "Tauranga",
  "Dunedin",
  "Palmerston North",
  "Nelson",
  "Queenstown",
  "Other / request region"
].map((name) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  isActive: true
}));

export const presentations: PresentationType[] = [
  {
    id: "digital-wellbeing",
    slug: "digital-wellbeing",
    title: "Digital Wellbeing",
    shortSummary:
      "Promote healthy habits, screen balance, and positive digital choices.",
    fullDescription:
      "A practical school presentation focused on digital habits, online wellbeing, and helping students build healthy relationships with technology and gaming.",
    durationMinutes: 10,
    yearLevels: "Years 7 to 8",
    deliveryFormats: ["assembly", "classroom"],
    learningOutcomes: [
      "Healthy screen routines",
      "Digital citizenship",
      "Positive online behaviour"
    ],
    requiredEquipment: ["Projector or screen", "Microphone if needed"],
    active: true,
    public: true
  },
  {
    id: "esports-pathways",
    slug: "esports-pathways",
    title: "Esports Pathways",
    shortSummary:
      "Show students how esports connects to teamwork, leadership, and future opportunities.",
    fullDescription:
      "An engaging overview of the wider esports ecosystem, highlighting event operations, coaching, production, and the positive skills students can build through organised play.",
    durationMinutes: 10,
    yearLevels: "Years 9 to 13",
    deliveryFormats: ["assembly", "workshop"],
    learningOutcomes: [
      "Understanding esports roles",
      "Teamwork and communication",
      "Structured competition awareness"
    ],
    requiredEquipment: ["Projector or screen"],
    active: true,
    public: true
  },
  {
    id: "careers",
    slug: "careers",
    title: "Careers",
    shortSummary:
      "Explore real education and career pathways connected to digital industries.",
    fullDescription:
      "A careers-focused session that connects student interests to higher education, training, creative industries, and technology-adjacent jobs.",
    durationMinutes: 10,
    yearLevels: "Years 9 to 13",
    deliveryFormats: ["assembly", "classroom"],
    learningOutcomes: [
      "Career awareness",
      "Pathway planning",
      "Industry role discovery"
    ],
    requiredEquipment: ["Projector or screen"],
    active: true,
    public: true
  },
  {
    id: "understanding-esports",
    slug: "understanding-esports",
    title: "Understanding Esports",
    shortSummary:
      "Help schools and students understand what esports is and how it can be delivered safely.",
    fullDescription:
      "A foundational session for educators and students covering what esports is, how it works in school settings, and how structured programmes can support engagement and belonging.",
    durationMinutes: 10,
    yearLevels: "Years 1 to 6",
    deliveryFormats: ["assembly", "online"],
    learningOutcomes: [
      "Esports literacy",
      "Safety and inclusion",
      "School implementation basics"
    ],
    requiredEquipment: ["Projector or screen", "Stable internet for online mode"],
    active: true,
    public: true
  }
];

export const testimonials: Testimonial[] = [
  {
    id: "t1",
    quote:
      "The session landed brilliantly with our senior students and gave them a realistic view of digital pathways.",
    attribution: "Deputy Principal",
    school: "Harbour Secondary College",
    presentationTitle: "Careers",
    feedbackDate: "May 2026",
    rating: 5
  },
  {
    id: "t2",
    quote:
      "Professional, engaging, and easy to organise. The booking flow and follow-up were excellent.",
    attribution: "Careers Lead",
    school: "South Coast High School",
    presentationTitle: "Esports Pathways",
    feedbackDate: "Apr 2026",
    rating: 5
  },
  {
    id: "t3",
    quote:
      "Students stayed engaged the whole time and the ambassador connected the content to real opportunities.",
    attribution: "Teacher in Charge",
    school: "Aoraki College",
    presentationTitle: "Digital Wellbeing",
    feedbackDate: "May 2026",
    rating: 5
  },
  {
    id: "t4",
    quote:
      "The messaging felt balanced and practical for our students. It supported wider wellbeing conversations we were already having at school.",
    attribution: "Head of Year 10",
    school: "Westlake Girls High School",
    presentationTitle: "Digital Wellbeing",
    feedbackDate: "Jun 2026",
    rating: 5
  }
];

export const faqs: Faq[] = [
  {
    id: "f1",
    question: "How quickly are bookings confirmed?",
    answer:
      "All requests start as tentative. Staff review region availability and ambassador capacity before confirming a session."
  },
  {
    id: "f2",
    question: "Can we book more than one session in a single request?",
    answer:
      "Yes. Schools can request multiple presentations or multiple sessions in one booking request."
  },
  {
    id: "f3",
    question: "Do we need special equipment?",
    answer:
      "Usually only a screen or projector is needed. Specific presentation requirements are listed on each presentation page."
  }
];

export const schools: School[] = [
  {
    id: "school-1",
    name: "Harbour Secondary College",
    regionSlug: "north-shore",
    city: "Auckland",
    rollSize: 980,
    status: "active"
  },
  {
    id: "school-2",
    name: "South Coast High School",
    regionSlug: "south-auckland",
    city: "Auckland",
    rollSize: 1240,
    status: "active"
  },
  {
    id: "school-3",
    name: "Aoraki College",
    regionSlug: "christchurch",
    city: "Christchurch",
    rollSize: 760,
    status: "pending_review"
  }
];

export const ambassadors: AmbassadorProfile[] = [
  {
    id: "ambassador-1",
    name: "Alex Tane",
    email: "alex@example.com",
    regionSlug: "north-shore",
    status: "approved",
    openToTravel: true,
    travelRegions: ["auckland-central", "west-auckland"],
    estimatedEarningsCents: 125000,
    pendingPaymentsCents: 50000,
    paidPaymentsCents: 75000
  },
  {
    id: "ambassador-2",
    name: "Mia Rangi",
    email: "mia@example.com",
    regionSlug: "christchurch",
    status: "approved",
    openToTravel: false,
    travelRegions: [],
    estimatedEarningsCents: 50000,
    pendingPaymentsCents: 25000,
    paidPaymentsCents: 25000
  }
];

export const bookingRequests: BookingRequestView[] = [
  {
    id: "booking-1001",
    schoolName: "Harbour Secondary College",
    primaryContactName: "Jules Morgan",
    primaryContactEmail: "jules@harboursecondary.school.nz",
    regionSlug: "north-shore",
    status: "confirmed",
    source: "public",
    createdAt: "2026-06-01T08:30:00.000Z",
    sessions: [
      {
        id: "session-1001",
        presentationSlug: "digital-wellbeing",
        presentationTitle: "Digital Wellbeing",
        regionSlug: "north-shore",
        schoolName: "Harbour Secondary College",
        startsAt: "2026-06-18T09:00:00.000Z",
        endsAt: "2026-06-18T10:00:00.000Z",
        yearLevels: "Years 9 to 10",
        expectedStudentCount: 180,
        actualStudentCount: 168,
        status: "report_submitted",
        assignedAmbassadorName: "Alex Tane",
        reportStatus: "submitted",
        paymentStatus: "pending"
      },
      {
        id: "session-1002",
        presentationSlug: "careers",
        presentationTitle: "Careers",
        regionSlug: "north-shore",
        schoolName: "Harbour Secondary College",
        startsAt: "2026-06-18T11:00:00.000Z",
        endsAt: "2026-06-18T11:45:00.000Z",
        yearLevels: "Years 11 to 13",
        expectedStudentCount: 120,
        status: "confirmed",
        assignedAmbassadorName: "Alex Tane",
        reportStatus: "not_submitted",
        paymentStatus: "not_eligible"
      }
    ]
  },
  {
    id: "booking-1002",
    schoolName: "South Coast High School",
    primaryContactName: "Rina Patel",
    primaryContactEmail: "rina@southcoast.school.nz",
    regionSlug: "south-auckland",
    status: "ambassador_needed",
    source: "staff",
    createdAt: "2026-06-05T04:20:00.000Z",
    sessions: [
      {
        id: "session-1003",
        presentationSlug: "esports-pathways",
        presentationTitle: "Esports Pathways",
        regionSlug: "south-auckland",
        schoolName: "South Coast High School",
        startsAt: "2026-06-24T09:30:00.000Z",
        endsAt: "2026-06-24T10:20:00.000Z",
        yearLevels: "Years 8 to 10",
        expectedStudentCount: 150,
        status: "ambassador_needed",
        reportStatus: "not_submitted",
        paymentStatus: "not_eligible"
      }
    ]
  },
  {
    id: "booking-1003",
    schoolName: "Aoraki College",
    primaryContactName: "Theo Brown",
    primaryContactEmail: "theo@aoraki.school.nz",
    regionSlug: "christchurch",
    status: "tentative",
    source: "public",
    createdAt: "2026-06-06T07:15:00.000Z",
    sessions: [
      {
        id: "session-1004",
        presentationSlug: "understanding-esports",
        presentationTitle: "Understanding Esports",
        regionSlug: "christchurch",
        schoolName: "Aoraki College",
        startsAt: "2026-06-30T13:00:00.000Z",
        endsAt: "2026-06-30T13:45:00.000Z",
        yearLevels: "Years 7 to 9",
        expectedStudentCount: 90,
        status: "tentative",
        reportStatus: "not_submitted",
        paymentStatus: "not_eligible"
      }
    ]
  }
];

export const trainingModules: TrainingModule[] = [
  {
    id: "training-1",
    title: "Presenter Induction",
    description:
      "Core onboarding for tone, safeguarding, expectations, and delivery standards.",
    progress: 100,
    lessons: [
      { id: "lesson-1", title: "Welcome and role overview", type: "video", durationMinutes: 12 },
      { id: "lesson-2", title: "School safety checklist", type: "checklist", durationMinutes: 10 }
    ]
  },
  {
    id: "training-2",
    title: "Digital Wellbeing Delivery Pack",
    description:
      "Presentation-specific walkthrough for Digital Wellbeing structure and facilitation.",
    progress: 40,
    lessons: [
      { id: "lesson-3", title: "Session run sheet", type: "video", durationMinutes: 18 },
      { id: "lesson-4", title: "Audience prompts", type: "quiz", durationMinutes: 8 }
    ]
  }
];

export const resources: ResourceItem[] = [
  {
    id: "resource-1",
    title: "School booking prep checklist",
    description: "Short PDF schools can use before a confirmed session.",
    type: "pdf",
    audience: "school",
    isCurrent: true
  },
  {
    id: "resource-2",
    title: "Digital Wellbeing slide deck",
    description: "Current presenter deck for the Digital Wellbeing session.",
    type: "slide_deck",
    audience: "ambassador",
    presentationSlug: "digital-wellbeing",
    isCurrent: true
  },
  {
    id: "resource-3",
    title: "Ambassador travel reimbursement guide",
    description: "Internal document for staff and ambassadors.",
    type: "pdf",
    audience: "staff",
    isCurrent: true
  }
];

export const tasks: TaskItem[] = [
  {
    id: "task-1",
    title: "Assign ambassador for South Coast High School",
    dueAt: "2026-06-10T17:00:00.000Z",
    owner: "Operations",
    status: "open"
  },
  {
    id: "task-2",
    title: "Review Harbour Secondary report for payment",
    dueAt: "2026-06-12T17:00:00.000Z",
    owner: "Finance",
    status: "in_progress"
  },
  {
    id: "task-3",
    title: "Approve new Christchurch ambassador application",
    dueAt: "2026-06-13T17:00:00.000Z",
    owner: "Talent",
    status: "open"
  }
];

export const paymentRecords: PaymentRecord[] = [
  {
    id: "payment-1",
    ambassadorName: "Alex Tane",
    bookingSessionId: "session-1001",
    amountCents: 25000,
    status: "pending",
    eligibilityReason: "168 attendees, report submitted"
  },
  {
    id: "payment-2",
    ambassadorName: "Mia Rangi",
    bookingSessionId: "session-0907",
    amountCents: 25000,
    status: "paid",
    eligibilityReason: "Manual override by staff"
  }
];

export const reportSummaries: ReportSummary[] = [
  {
    id: "report-1",
    schoolName: "Harbour Secondary College",
    presentationTitle: "Digital Wellbeing",
    submittedAt: "2026-06-19T02:00:00.000Z",
    attendeeCount: 168,
    status: "submitted",
    ambassadorName: "Alex Tane",
    teacherResponseRating: 5,
    presentationFeedback:
      "Students were engaged throughout and the wellbeing discussion opened up useful questions from Year 9 and 10.",
    yearLevels: "Years 9 to 10",
    sessionStartsAt: "2026-06-18T09:00:00.000Z"
  },
  {
    id: "report-2",
    schoolName: "Westview Intermediate",
    presentationTitle: "Esports Pathways",
    submittedAt: "2026-05-30T00:30:00.000Z",
    attendeeCount: 104,
    status: "reviewed",
    ambassadorName: "Mia Rangi",
    teacherResponseRating: 4,
    presentationFeedback:
      "The pathways examples worked well. A follow-up resource for teachers would make the session easier to extend in class.",
    yearLevels: "Years 7 to 8",
    sessionStartsAt: "2026-05-29T10:00:00.000Z"
  }
];

export const auditLogs: AuditLogEntry[] = [
  {
    id: "audit-1",
    action: "booking.confirmed",
    entityType: "booking_session",
    actor: "Ava Staff",
    createdAt: "2026-06-05T10:15:00.000Z"
  },
  {
    id: "audit-2",
    action: "presentation.updated",
    entityType: "presentation_type",
    actor: "Noah Admin",
    createdAt: "2026-06-05T12:20:00.000Z"
  },
  {
    id: "audit-3",
    action: "report.reviewed",
    entityType: "ambassador_report",
    actor: "Ava Staff",
    createdAt: "2026-06-06T09:00:00.000Z"
  }
];

export const emailTemplates: EmailTemplateSummary[] = [
  {
    id: "email-template-1",
    key: "booking_request_received",
    subject: "We have received your presentation request",
    status: "active"
  },
  {
    id: "email-template-2",
    key: "ambassador_assignment_confirmation",
    subject: "You have been assigned to a new school session",
    status: "active"
  },
  {
    id: "email-template-3",
    key: "report_reminder",
    subject: "Reminder: submit your post-session report",
    status: "draft"
  }
];

export const homepageMetrics: DashboardMetric[] = [
  {
    label: "Schools supported",
    value: "120+",
    trend: "+18% vs last year",
    detail: "Across Aotearoa",
    icon: "school",
    tone: "green"
  },
  {
    label: "Students reached",
    value: "18k+",
    trend: "+22% growth",
    detail: "Last 12 months",
    icon: "users",
    tone: "blue"
  },
  {
    label: "Presentation topics",
    value: "4",
    trend: "Curriculum aligned",
    detail: "Editable in admin",
    icon: "sparkles",
    tone: "navy"
  },
  {
    label: "Regions covered",
    value: "14",
    trend: "Launch ready",
    detail: "Nationwide scheduling",
    icon: "map",
    tone: "amber"
  }
];
