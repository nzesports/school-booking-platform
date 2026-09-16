-- Update existing feedback copy without changing links, HTML attributes,
-- placeholders, or other email templates.
update public.email_templates
set body_html = replace(replace(body_html,
      'feedback — it takes', 'feedback, it takes'),
      '</a> — no login needed.', '</a>, no login needed.'),
    body_text = replace(replace(body_text,
      'feedback — it takes', 'feedback, it takes'),
      ' — no login needed.', ', no login needed.')
where template_key = 'school_feedback_request';
