// Restores the approved public card and Learn more content for the three
// presentation types. Run from the project root:
// node scripts/sync-public-presentation-content.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const presentations = [
  {
    slug: "digital-wellbeing",
    title: "Digital Wellbeing",
    short_summary:
      "Help students build healthier gaming and screen habits through practical lessons on breaks, movement, sleep, hydration and nutrition.",
    full_description:
      "<p>A practical, student-friendly presentation that helps young people build healthier relationships with gaming and technology. Students learn how to recognise when their brain needs a break and explore how movement, sleep, hydration and nutrition can affect focus, mood and performance.</p><p>The presentation takes a positive approach to gaming while giving students simple, practical habits they can use both on and away from screens.</p>",
    content_snippet:
      "<p>This is a practical wellbeing presentation rather than a lecture about reducing or stopping gaming. It acknowledges the positive social and personal experiences gaming can provide while helping students understand how to look after themselves when spending time on screens.</p><p>Students are introduced to simple concepts around brain fatigue, movement, sleep, hydration and nutrition, with advice designed to be easy to understand and put into practice.</p>",
    year_levels: "Years 5 to 6, Years 7 to 8, Years 9 to 13",
    duration_minutes: 10,
    delivery_formats: ["Assembly", "classroom"],
    learning_outcomes: [
      "Recognise the signs of screen fatigue :: Learn to identify signs such as tired eyes, headaches, frustration, reduced focus and the urge to keep playing when it is time to take a break.",
      "Build healthier gaming routines :: Understand why regular breaks and physical activity are important for maintaining focus, energy and wellbeing during gaming and screen time.",
      "Understand the importance of sleep and hydration :: Explore how sleep and hydration can affect concentration, cognitive performance, mood and emotional regulation.",
      "Make better choices for sustained energy and focus :: Learn how everyday food and drink choices can support concentration and performance, with practical examples students can apply in their daily routines."
    ].join("\n"),
    required_equipment: [
      "Projector or screen",
      "Microphone if needed",
      "No gaming equipment, computers or student devices are required."
    ].join("\n")
  },
  {
    slug: "esports-pathways",
    title: "Esports Pathways",
    short_summary:
      "Explore the careers, study pathways and transferable skills behind gaming and esports, from school competition through to the wider global industry.",
    full_description:
      "<p>A practical presentation showing students where gaming and esports can lead beyond becoming a professional player. Students explore competitive pathways, career opportunities, further study options and the transferable skills they may already be developing through gaming.</p><p>The presentation also helps teachers recognise gaming as a useful way to engage students in conversations about learning, skills and future careers.</p>",
    content_snippet:
      "<p>This is not a presentation about simply becoming a professional gamer. It uses students' existing interest in gaming to show the much wider range of careers, study options and transferable skills connected to the gaming and esports industries.</p><p>Students will see the competitive esports pathway, but will also learn that professional competition represents only a very small part of the wider industry.</p>",
    year_levels: "Years 9 to 13",
    duration_minutes: 10,
    delivery_formats: ["Assembly", "classroom", "careers session"],
    learning_outcomes: [
      "Understand esports pathways :: Explore how students can progress from school esports into university competition, community events, national qualifiers, Junior E Blacks and national team opportunities.",
      "Discover careers beyond professional gaming :: Learn about the wide range of careers connected to gaming and esports, including game development, live production, coaching, design, marketing, events, broadcasting and management.",
      "Recognise transferable skills :: Understand how gaming can develop useful skills including communication, teamwork, problem solving, leadership, organisation, critical thinking, adaptability, budgeting and technical literacy.",
      "Explore study and experience options :: Discover different pathways into the gaming, esports and creative industries through universities, polytechnics, private training establishments and volunteering."
    ].join("\n"),
    required_equipment: [
      "Projector or screen",
      "Microphone if needed",
      "No gaming equipment, computers or student devices are required."
    ].join("\n")
  },
  {
    slug: "understanding-esports",
    title: "Understanding the Gaming World",
    short_summary:
      "A positive, practical introduction that helps parents and whānau understand young people's gaming and support healthier habits and conversations.",
    full_description:
      "<p>A practical introduction to gaming and esports for parents and whānau. This presentation helps families better understand what gaming means to young people, addresses common concerns and tension points, and provides practical ways to support a healthier, more balanced relationship with gaming.</p><p>The presentation also introduces school esports, the E Blacks national team and the wide range of career opportunities connected to gaming and esports.</p>",
    content_snippet:
      "<p><strong>This is a positive, practical presentation rather than an anti-gaming talk.</strong> It helps parents understand why gaming matters to young people, puts common concerns into context and gives families practical ways to have better conversations and set healthier boundaries.</p>",
    year_levels: "Parents & whānau, Teachers & school staff",
    duration_minutes: 25,
    delivery_formats: [
      "Parent evening",
      "whānau information session",
      "school community event"
    ],
    learning_outcomes: [
      "Understand the role gaming plays in young people's lives :: Recognise gaming as a space for social connection, identity, achievement, competition and recreation.",
      "Recognise common gaming-related tension points :: Understand issues such as difficulty stopping, sleep, time management, online behaviour, stranger interactions and emotional regulation.",
      "Use practical strategies for healthier conversations about gaming :: Learn how timing, curiosity, boundaries and a balanced lifestyle can reduce conflict around gaming.",
      "Understand where gaming and esports can lead :: Explore pathways ranging from game development and design through to events, marketing, teaching, psychology, sports science and other careers."
    ].join("\n"),
    required_equipment: [
      "Projector or presentation screen :: For displaying the presentation.",
      "Microphone for larger audiences :: Recommended for parent evenings, halls or larger community sessions.",
      "Audience phones for Q&A, optional :: The presentation includes QR-based audience questions, so attendees can submit questions from their phones if that functionality is being used."
    ].join("\n")
  }
];

for (const presentation of presentations) {
  const { slug, ...content } = presentation;
  const { data, error } = await admin
    .from("presentation_types")
    .update({ ...content, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .select("id")
    .single();

  if (error || !data) {
    console.error(`${slug}: FAILED — ${error?.message ?? "presentation not found"}`);
    process.exitCode = 1;
  } else {
    console.log(`${slug}: updated`);
  }
}
