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
  ...[
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
    "Queenstown"
  ].map((name) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    isActive: true
  })),
  // Keeps the historical slug so existing bookings and seeded rows still resolve.
  {
    id: "other-request-region",
    name: "Other",
    slug: "other-request-region",
    isActive: true
  }
];

export const presentations: PresentationType[] = [
  {
    id: "digital-wellbeing",
    slug: "digital-wellbeing",
    title: "Digital Wellbeing",
    shortSummary:
      "Help students build healthier gaming and screen habits through practical lessons on breaks, movement, sleep, hydration and nutrition.",
    fullDescription:
      "<p>A practical, student-friendly presentation that helps young people build healthier relationships with gaming and technology. Students learn how to recognise when their brain needs a break and explore how movement, sleep, hydration and nutrition can affect focus, mood and performance.</p><p>The presentation takes a positive approach to gaming while giving students simple, practical habits they can use both on and away from screens.</p>",
    contentSnippet:
      "<p>This is a practical wellbeing presentation rather than a lecture about reducing or stopping gaming. It acknowledges the positive social and personal experiences gaming can provide while helping students understand how to look after themselves when spending time on screens.</p><p>Students are introduced to simple concepts around brain fatigue, movement, sleep, hydration and nutrition, with advice designed to be easy to understand and put into practice.</p>",
    durationMinutes: 10,
    yearLevels: "Years 5 to 6, Years 7 to 8, Years 9 to 13",
    deliveryFormats: ["Assembly", "classroom"],
    learningOutcomes: [
      "Recognise the signs of screen fatigue :: Learn to identify signs such as tired eyes, headaches, frustration, reduced focus and the urge to keep playing when it is time to take a break.",
      "Build healthier gaming routines :: Understand why regular breaks and physical activity are important for maintaining focus, energy and wellbeing during gaming and screen time.",
      "Understand the importance of sleep and hydration :: Explore how sleep and hydration can affect concentration, cognitive performance, mood and emotional regulation.",
      "Make better choices for sustained energy and focus :: Learn how everyday food and drink choices can support concentration and performance, with practical examples students can apply in their daily routines."
    ],
    requiredEquipment: [
      "Projector or screen",
      "Microphone if needed",
      "No gaming equipment, computers or student devices are required."
    ],
    accentColor: "#18A83B",
    active: true,
    public: true
  },
  {
    id: "esports-pathways",
    slug: "esports-pathways",
    title: "Esports Pathways",
    shortSummary:
      "Explore the careers, study pathways and transferable skills behind gaming and esports, from school competition through to the wider global industry.",
    fullDescription:
      "<p>A practical presentation showing students where gaming and esports can lead beyond becoming a professional player. Students explore competitive pathways, career opportunities, further study options and the transferable skills they may already be developing through gaming.</p><p>The presentation also helps teachers recognise gaming as a useful way to engage students in conversations about learning, skills and future careers.</p>",
    contentSnippet:
      "<p>This is not a presentation about simply becoming a professional gamer. It uses students' existing interest in gaming to show the much wider range of careers, study options and transferable skills connected to the gaming and esports industries.</p><p>Students will see the competitive esports pathway, but will also learn that professional competition represents only a very small part of the wider industry.</p>",
    durationMinutes: 10,
    yearLevels: "Years 9 to 13",
    deliveryFormats: ["Assembly", "classroom", "careers session"],
    learningOutcomes: [
      "Understand esports pathways :: Explore how students can progress from school esports into university competition, community events, national qualifiers, Junior E Blacks and national team opportunities.",
      "Discover careers beyond professional gaming :: Learn about the wide range of careers connected to gaming and esports, including game development, live production, coaching, design, marketing, events, broadcasting and management.",
      "Recognise transferable skills :: Understand how gaming can develop useful skills including communication, teamwork, problem solving, leadership, organisation, critical thinking, adaptability, budgeting and technical literacy.",
      "Explore study and experience options :: Discover different pathways into the gaming, esports and creative industries through universities, polytechnics, private training establishments and volunteering."
    ],
    requiredEquipment: [
      "Projector or screen",
      "Microphone if needed",
      "No gaming equipment, computers or student devices are required."
    ],
    accentColor: "#E0A11A",
    active: true,
    public: true
  },
  {
    id: "understanding-esports",
    slug: "understanding-esports",
    title: "Understanding the Gaming World",
    shortSummary:
      "A positive, practical introduction that helps parents and whānau understand young people's gaming and support healthier habits and conversations.",
    fullDescription:
      "<p>A practical introduction to gaming and esports for parents and whānau. This presentation helps families better understand what gaming means to young people, addresses common concerns and tension points, and provides practical ways to support a healthier, more balanced relationship with gaming.</p><p>The presentation also introduces school esports, the E Blacks national team and the wide range of career opportunities connected to gaming and esports.</p>",
    contentSnippet:
      "<p><strong>This is a positive, practical presentation rather than an anti-gaming talk.</strong> It helps parents understand why gaming matters to young people, puts common concerns into context and gives families practical ways to have better conversations and set healthier boundaries.</p>",
    durationMinutes: 25,
    yearLevels: "Parents & whānau, Teachers & school staff",
    deliveryFormats: [
      "Parent evening",
      "whānau information session",
      "school community event"
    ],
    learningOutcomes: [
      "Understand the role gaming plays in young people's lives :: Recognise gaming as a space for social connection, identity, achievement, competition and recreation.",
      "Recognise common gaming-related tension points :: Understand issues such as difficulty stopping, sleep, time management, online behaviour, stranger interactions and emotional regulation.",
      "Use practical strategies for healthier conversations about gaming :: Learn how timing, curiosity, boundaries and a balanced lifestyle can reduce conflict around gaming.",
      "Understand where gaming and esports can lead :: Explore pathways ranging from game development and design through to events, marketing, teaching, psychology, sports science and other careers."
    ],
    requiredEquipment: [
      "Projector or presentation screen :: For displaying the presentation.",
      "Microphone for larger audiences :: Recommended for parent evenings, halls or larger community sessions.",
      "Audience phones for Q&A, optional :: The presentation includes QR-based audience questions, so attendees can submit questions from their phones if that functionality is being used."
    ],
    accentColor: "#2563EB",
    active: true,
    public: true
  }
];

export const testimonials: Testimonial[] = [
  {
    id: "feedback-st-peters-college-palmerston-north",
    quote:
      "He hooked them in with the ESports which really helped him to get the message across. The year 10s were super engaged in it. I would recommend it for others too.",
    attribution: "School feedback",
    school: "St Peter's College, Palmerston North",
    feedbackDate: "Aug 2026",
    rating: 5
  },
  {
    id: "feedback-havelock-north-intermediate",
    quote: "That was the best special assembly we've had",
    attribution: "Attendee feedback",
    school: "Havelock North Intermediate",
    feedbackDate: "Aug 2026",
    rating: 4.6
  },
  {
    id: "feedback-north-west-college",
    quote:
      "Everyone loved it, including all of the teachers - most of whom were very skeptical of the presentation going into it.",
    attribution: "School feedback",
    school: "North West College",
    feedbackDate: "Jun 2026",
    rating: 5
  },
  {
    id: "feedback-waiheke-high-school",
    quote:
      "They really enjoyed it and wished there was longer to do more and ask more questions.",
    attribution: "School feedback",
    school: "Waiheke High School",
    feedbackDate: "Jun 2025",
    rating: 5
  },
  {
    id: "feedback-ani",
    quote:
      "The students loved the presentation they all want me to set up an esports club now, which is my next step.",
    attribution: "School feedback",
    school: "ANI",
    feedbackDate: "Jun 2025",
    rating: 5
  },
  {
    id: "feedback-huntly-college",
    quote:
      "They loved the idea of Esports and are very keen to start something like it at school. Sam was an excellent presenter and held their attention. Especially in the game.",
    attribution: "School feedback",
    school: "Huntly College",
    feedbackDate: "Jun 2025",
    rating: 5
  },
  {
    id: "feedback-ormiston-primary",
    quote:
      "Belinda was great. The presentation was pitched at the right level for our year 5/6 learners",
    attribution: "School feedback",
    school: "Ormiston Primary",
    feedbackDate: "Aug 2024",
    rating: 5
  },
  {
    id: "feedback-wairarapa-cobham-intermediate",
    quote: "Really engaging, insightful with useful info for future esporters",
    attribution: "School feedback",
    school: "Wairarapa Cobham Intermediate",
    feedbackDate: "Jun 2024",
    rating: 4.6
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
        presentationAccentColor: "#18A83B",
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
        presentationAccentColor: "#18A83B",
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
    status: "tentative",
    source: "staff",
    createdAt: "2026-06-05T04:20:00.000Z",
    sessions: [
      {
        id: "session-1003",
        presentationSlug: "esports-pathways",
        presentationTitle: "Esports Pathways",
        presentationAccentColor: "#E0A11A",
        regionSlug: "south-auckland",
        schoolName: "South Coast High School",
        startsAt: "2026-06-24T09:30:00.000Z",
        endsAt: "2026-06-24T10:20:00.000Z",
        yearLevels: "Years 8 to 10",
        expectedStudentCount: 150,
        status: "tentative",
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
        presentationTitle: "Understanding the Gaming World",
        presentationAccentColor: "#2563EB",
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
    lessons: [
      { id: "lesson-1", title: "Welcome and role overview", type: "video", durationMinutes: 12 },
      { id: "lesson-2", title: "School safety checklist", type: "checklist", durationMinutes: 10 }
    ]
  },
  {
    id: "training-2",
    presentationTypeId: "digital-wellbeing",
    title: "Digital Wellbeing Delivery Pack",
    description:
      "Presentation-specific walkthrough for Digital Wellbeing structure and facilitation.",
    lessons: [
      { id: "lesson-3", title: "Session run sheet", type: "video", durationMinutes: 18 },
      { id: "lesson-4", title: "Audience prompts", type: "quiz", durationMinutes: 8 }
    ]
  }
];

export const resources: ResourceItem[] = [
  {
    id: "resource-1",
    title: "School esports club launch checklist",
    description: "A practical checklist for preparing and launching a student-led esports club.",
    type: "pdf",
    audience: "school",
    isCurrent: true,
    downloadUrl:
      "https://www.nzesports.org.nz/wp-content/uploads/2025/01/The-Ultimate-Guide-How-To-Start-An-Esports-Club.pdf"
  },
  {
    id: "resource-school-guide",
    title: "The ultimate guide to starting an esports club",
    description: "A step-by-step guide for creating a safe, sustainable school esports club.",
    type: "pdf",
    audience: "school",
    isCurrent: true,
    downloadUrl:
      "https://www.nzesports.org.nz/wp-content/uploads/2025/01/The-Ultimate-Guide-How-To-Start-An-Esports-Club.pdf"
  },
  {
    id: "resource-school-video",
    title: "Digital wellbeing: recognising when your brain needs a break",
    description: "A short student-friendly video to revisit after the presentation.",
    type: "youtube",
    audience: "school",
    presentationSlug: "digital-wellbeing",
    isCurrent: true,
    downloadUrl: "https://www.youtube.com/watch?v=K5_uQXgS0tI"
  },
  {
    id: "resource-school-wellbeing-guide",
    title: "How esports can improve student wellbeing",
    description: "A practical guide to belonging, confidence, resilience and leadership.",
    type: "file",
    audience: "school",
    isCurrent: true,
    downloadUrl: "https://www.nzesports.org.nz/knowledge-base/how-esports-improves-your-wellbeing/"
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
    baseAmountCents: 25000,
    sourcingBonusCents: 0,
    status: "pending",
    eligibilityReason: "168 attendees, report submitted",
    createdAt: "2026-06-19T02:30:00.000Z",
    financeEmailAttempts: 0
  },
  {
    id: "payment-2",
    ambassadorName: "Mia Rangi",
    bookingSessionId: "session-0907",
    amountCents: 25000,
    baseAmountCents: 25000,
    sourcingBonusCents: 0,
    status: "paid",
    eligibilityReason: "Manual override by staff",
    createdAt: "2026-05-02T21:00:00.000Z",
    paidAt: "2026-05-09T03:00:00.000Z",
    invoiceNumber: "INV-2026-9A11B2C3",
    invoiceGeneratedAt: "2026-05-03T20:00:00.000Z",
    sentToFinanceAt: "2026-05-05T22:00:00.000Z",
    sentToEmail: "info@esf.nz",
    financeEmailStatus: "sent",
    financeEmailAttempts: 1,
    financeConfirmedAt: "2026-05-09T03:00:00.000Z"
  },
  {
    id: "payment-3",
    ambassadorName: "Alex Tane",
    bookingSessionId: "session-0912",
    amountCents: 25000,
    baseAmountCents: 25000,
    sourcingBonusCents: 0,
    status: "approved",
    eligibilityReason: "142 attendees, report submitted",
    createdAt: "2026-06-10T01:00:00.000Z",
    invoiceNumber: "INV-2026-4D55E6F7",
    invoiceGeneratedAt: "2026-06-12T21:30:00.000Z",
    bankAccountName: "Alex Tane",
    bankAccountNumber: "12-3456-7890123-00",
    financeEmailStatus: "failed",
    financeEmailAttempts: 1,
    financeEmailError: "Finance email delivery failed"
  },
  {
    id: "payment-4",
    ambassadorName: "Mia Rangi",
    bookingSessionId: "session-0920",
    amountCents: 25000,
    baseAmountCents: 25000,
    sourcingBonusCents: 0,
    status: "approved",
    eligibilityReason: "205 attendees, report submitted",
    createdAt: "2026-06-01T01:00:00.000Z",
    invoiceNumber: "INV-2026-8G99H0I1",
    invoiceGeneratedAt: "2026-06-03T20:00:00.000Z",
    sentToFinanceAt: "2026-06-05T02:00:00.000Z",
    sentToEmail: "info@esf.nz",
    financeEmailStatus: "sent",
    financeEmailAttempts: 1,
    bankAccountName: "Mia Rangi",
    financeConfirmationExpiresAt: "2026-07-05T02:00:00.000Z"
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
