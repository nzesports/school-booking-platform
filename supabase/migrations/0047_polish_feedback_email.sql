-- Refresh only feedback request copy; preserve subject, activation and other templates.
update public.email_templates
set body_html = $feedback$<p>Kia ora {{contactName}},</p><p>Thank you for welcoming us to <strong>{{schoolName}}</strong> for your <strong>{{presentationTitle}}</strong> session!</p><p><a href="{{reviewUrl}}" style="display:inline-block;background-color:#18a83b;color:#ffffff;padding:12px 26px;border-radius:10px;font-weight:bold;text-decoration:none;">Share your feedback</a></p><p>We’d love to hear how it went and what your students took away. Your feedback helps us make future presentations even better for schools across Aotearoa. No login is needed.</p><p>Thanks again,<br>The NZ Esports team</p>$feedback$,
    body_text = $feedback$Kia ora {{contactName}},

Thank you for welcoming us to {{schoolName}} for your {{presentationTitle}} session!

Share your feedback: {{reviewUrl}}

We’d love to hear how it went and what your students took away. Your feedback helps us make future presentations even better for schools across Aotearoa. No login is needed.

Thanks again,
The NZ Esports team$feedback$
where template_key = 'school_feedback_request';
