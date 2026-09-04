export type PublicResource = {
  id: string;
  title: string;
  description: string;
  type: string;
  tags: string[];
  url: string;
  embedUrl?: string;
};

const suppliedResources: PublicResource[] = [
  {
    id: "start-an-esports-club-guide",
    title: "The Ultimate Guide: How to Start an Esports Club",
    description:
      "A practical guide for schools covering the foundations of setting up and growing an esports club.",
    type: "pdf",
    tags: ["Schools", "Esports clubs", "Guide"],
    url: "https://www.nzesports.org.nz/wp-content/uploads/2025/01/The-Ultimate-Guide-How-To-Start-An-Esports-Club.pdf"
  },
  {
    id: "brain-overtrain-clip",
    title: "NZ Esports School Presentation: Brain Overtrain Clip",
    description:
      "A short, student-friendly clip about recognising when the brain needs a break from gaming and screen time.",
    type: "youtube",
    tags: ["Digital wellbeing", "Video"],
    url: "https://www.youtube.com/watch?v=K5_uQXgS0tI",
    embedUrl: "https://www.youtube.com/embed/K5_uQXgS0tI"
  },
  {
    id: "digital-wellbeing-presentation",
    title: "Digital Wellbeing Presentation — Powered by Berocca",
    description:
      "Watch the NZ Esports presentation on healthier gaming routines, balance and digital wellbeing.",
    type: "youtube",
    tags: ["Digital wellbeing", "Video"],
    url: "https://www.youtube.com/watch?v=O9hyz0tgYic",
    embedUrl: "https://www.youtube.com/embed/O9hyz0tgYic"
  },
  {
    id: "high-school-league-of-legends-clubs",
    title: "High School League of Legends Clubs — Trailer",
    description:
      "A short look at organised League of Legends clubs and competition in high schools.",
    type: "youtube",
    tags: ["Esports clubs", "Competition", "Video"],
    url: "https://www.youtube.com/watch?v=fSAVS98xURE",
    embedUrl: "https://www.youtube.com/embed/fSAVS98xURE"
  },
  {
    id: "advice-for-aspiring-esports-athletes",
    title: "Advice for Aspiring Esports Athletes",
    description:
      "Practical advice for students interested in developing as competitive esports athletes.",
    type: "youtube",
    tags: ["Pathways", "Competition", "Video"],
    url: "https://www.youtube.com/watch?v=iFGXGioFp_4&t=2s",
    embedUrl: "https://www.youtube.com/embed/iFGXGioFp_4?start=2"
  },
  {
    id: "how-esports-improves-wellbeing",
    title: "How Esports Improves Your Wellbeing",
    description:
      "Explore how structured esports can support creativity, belonging, confidence, resilience and leadership.",
    type: "link",
    tags: ["Wellbeing", "Article"],
    url: "https://www.nzesports.org.nz/knowledge-base/how-esports-improves-your-wellbeing/"
  }
];

// The public /resources library is deliberately static for now: portal-published
// resources are intentionally NOT surfaced on the public site. This used to query
// `presentation_resources` (is_active + is_current rows with category "resource"
// whose audiences array contains "public", newest first, resolving each row's
// youtube_url / public_url / signed storage_path into a URL) and fell back to
// this curated list on error or zero rows. If public-facing materials get wired
// back up, reinstate that query — audiences contains "public" AND category
// "resource" is the rule — and surface DB rows instead of (or ahead of) this list.
export async function listPublicResources(): Promise<PublicResource[]> {
  return suppliedResources;
}
