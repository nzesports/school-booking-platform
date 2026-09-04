drop policy if exists "public read public resources" on public.presentation_resources;

create policy "public read public resources"
on public.presentation_resources for select
to anon, authenticated
using (
  is_active = true
  and 'public' = any(audiences)
);

with public_resources(
  title,
  description,
  resource_type,
  public_url,
  youtube_url,
  audiences,
  tags
) as (
  values
    (
      'The Ultimate Guide: How to Start an Esports Club',
      'A practical guide for schools covering the foundations of setting up and growing an esports club.',
      'pdf',
      'https://www.nzesports.org.nz/wp-content/uploads/2025/01/The-Ultimate-Guide-How-To-Start-An-Esports-Club.pdf',
      null,
      array['public', 'ambassador'],
      array['schools', 'esports clubs', 'guide']
    ),
    (
      'NZ Esports School Presentation: Brain Overtrain Clip',
      'A short, student-friendly clip about recognising when the brain needs a break from gaming and screen time.',
      'youtube',
      null,
      'https://www.youtube.com/watch?v=K5_uQXgS0tI',
      array['public', 'ambassador'],
      array['digital wellbeing', 'video']
    ),
    (
      'Digital Wellbeing Presentation — Powered by Berocca',
      'Watch the NZ Esports presentation on healthier gaming routines, balance and digital wellbeing.',
      'youtube',
      null,
      'https://www.youtube.com/watch?v=O9hyz0tgYic',
      array['public', 'ambassador'],
      array['digital wellbeing', 'video']
    ),
    (
      'High School League of Legends Clubs — Trailer',
      'A short look at organised League of Legends clubs and competition in high schools.',
      'youtube',
      null,
      'https://www.youtube.com/watch?v=fSAVS98xURE',
      array['public', 'ambassador'],
      array['esports clubs', 'competition', 'video']
    ),
    (
      'Advice for Aspiring Esports Athletes',
      'Practical advice for students interested in developing as competitive esports athletes.',
      'youtube',
      null,
      'https://www.youtube.com/watch?v=iFGXGioFp_4&t=2s',
      array['public', 'ambassador'],
      array['pathways', 'competition', 'video']
    ),
    (
      'How Esports Improves Your Wellbeing',
      'Explore how structured esports can support creativity, belonging, confidence, resilience and leadership.',
      'link',
      'https://www.nzesports.org.nz/knowledge-base/how-esports-improves-your-wellbeing/',
      null,
      array['public', 'ambassador'],
      array['wellbeing', 'article']
    )
)
insert into public.presentation_resources (
  title,
  description,
  resource_type,
  public_url,
  youtube_url,
  audiences,
  tags,
  category,
  is_current,
  is_active
)
select
  resource.title,
  resource.description,
  resource.resource_type,
  resource.public_url,
  resource.youtube_url,
  resource.audiences,
  resource.tags,
  'resource',
  true,
  true
from public_resources resource
where not exists (
  select 1
  from public.presentation_resources existing
  where lower(existing.title) = lower(resource.title)
);
