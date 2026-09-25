# Vaibhav Web Studio website

A static site (HTML, CSS and plain JavaScript, with no build tools or npm) hosted on **Cloudflare Pages**.
Client accounts and the database use **Supabase** (Auth + Postgres with Row Level Security).
Owner notifications and the contact form go through **FormSubmit**.

```
public/                 ← deploy this folder
  index, websites (work), services, about, faq, contact, start (Website Planner)
  login, signup, forgot-password, reset-password, dashboard
  privacy, terms, 404, demos/, sitemap.xml, robots.txt, _headers
  assets/js/
    config.js      public settings (FormSubmit, WhatsApp, Supabase URL + anon key)
    site.js        menu, header, reveal animations, account link
    forms.js       validation, spam checks, FormSubmit delivery, contact form
    auth.js        Supabase Auth + REST client (fetch only, no SDK)
    account.js     login / signup / forgot / reset pages
    planner.js     Website Planner (questions, conditions, review, submit)
    dashboard.js   client dashboard
    projects.js    website examples data + renderer
partials/               shared head, header, footer, "accounts coming soon" box
supabase/schema.sql     database tables, security policies, rate limits
tools/build.ps1         injects partials + SEO tags, writes sitemap/robots
tools/serve.ps1         local preview server (http://localhost:8080)
```

## 1. Set up Supabase (for accounts + dashboard)

Without this step the site still works: projects and messages arrive by email, and the login pages say "accounts coming soon".

1. Create a free project at https://supabase.com (region: Mumbai / ap-south-1 is closest).
2. **SQL Editor → New query**: paste all of `supabase/schema.sql`, then click **Run**.
3. **Authentication → URL Configuration**
   - Site URL: your live URL (e.g. `https://vaibhavwebstudio.pages.dev`)
   - Redirect URLs: add `https://YOUR-DOMAIN/dashboard` and `https://YOUR-DOMAIN/reset-password`
4. **Authentication → Providers → Email**: keep *Confirm email* ON. Set minimum password length to 8.
5. **Authentication → SMTP** (important for production). Supabase's built-in email sender is only for testing and sends very few emails per hour. Connect a free SMTP service (e.g. Brevo or Resend) so confirmation and reset emails arrive reliably.
6. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** into `public/assets/js/config.js`:
   ```js
   supabaseUrl: "https://xxxxxxxx.supabase.co",
   supabaseAnonKey: "eyJ... or sb_publishable_..."
   ```
   The anon key is public by design. Never put the `service_role` / secret key in any file here.

### Managing projects (owner)
- **Table Editor → projects**: every submitted project. Change the `status` column to move it through
  *Requirement Submitted → Under Review → Planning → Design → Development → Testing → Ready for Launch → Live*.
  The client sees the change in their dashboard.
- **Table Editor → project_updates**: insert a row (`project_id` + `message`) to post an update the client will see.
- **contact_messages**: copies of contact-form messages (they're also emailed).
- Clients can only read their own projects and can't change status. This is enforced by Row Level Security in the database, not by the website code.

## 2. FormSubmit (one-time activation)

1. After deploying, send the contact form once from the live site.
2. Open the email FormSubmit sends to **vaibhavgaur36@gmail.com** and click **Activate Form**.
3. Optional: replace the email in `config.js` and in `contact.html`'s form `action` with the random alias FormSubmit gives you.

## 3. Build and deploy

1. Put your real domain in `$SiteUrl` at the top of `tools/build.ps1` (default: `https://vaibhavwebstudio.pages.dev`).
2. Run: `powershell -ExecutionPolicy Bypass -File tools\build.ps1`
3. Cloudflare dashboard → **Workers & Pages → Create → Pages → Upload assets** → upload the **`public`** folder.
4. After launch: add the site to Google Search Console and submit `https://YOUR-DOMAIN/sitemap.xml`.

## Security & spam protection

- Strict Content-Security-Policy (scripts only from this site), plus HSTS, no-framing and nosniff headers (`public/_headers`).
- All user content is rendered as text, never as HTML.
- Passwords are handled by Supabase Auth (bcrypt-hashed). Sessions use a short-lived access token plus a rotating refresh token.
- Post-login redirects only allow same-site paths (no open redirects).
- Forms: honeypot, minimum fill time, link limit, 60-second duplicate guard, length limits and validation.
- Database (server-side): length/format CHECK constraints, max 5 projects per user per day, and contact-message limits (3 per email per hour, 30 site-wide per 10 minutes).

## Local preview

`powershell -ExecutionPolicy Bypass -File tools\serve.ps1`, then open http://localhost:8080
