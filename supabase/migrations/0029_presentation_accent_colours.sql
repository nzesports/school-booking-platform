alter table public.presentation_types
  add column if not exists accent_color text;

update public.presentation_types
set accent_color = case slug
  when 'digital-wellbeing' then '#18A83B'
  when 'esports-pathways' then '#E0A11A'
  when 'understanding-esports' then '#2563EB'
  else '#18A83B'
end
where accent_color is null;

alter table public.presentation_types
  alter column accent_color set default '#18A83B';

alter table public.presentation_types
  add constraint presentation_types_accent_color_hex
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
