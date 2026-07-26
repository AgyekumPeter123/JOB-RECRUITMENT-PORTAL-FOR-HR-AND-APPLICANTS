# Northstar HR Suite

A Supabase-powered HR platform with separate HR and applicant dashboards, authentication, job postings, application tracking, employee management, and an internal notification center for alerts.

## What it includes

- Auth screen for sign up and log in as HR or applicant
- HR dashboard for posting jobs, managing applications, scheduling interviews, setting offers, hiring, onboarding, employee records, salaries, and alerts
- Applicant dashboard for browsing vacancies, applying with CV, and tracking status updates natively on their dashboard
- Supabase schema for profiles, jobs, applications, employees, events, and notifications

## Supabase setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase-schema.sql`.
3. Create a storage bucket named `cvs` and make it public if you want CV links to open directly.
4. Copy your Supabase project URL and anon key into `window.SUPABASE_CONFIG` inside `index.html`.

## How to run

Open `index.html` in a browser or deploy the folder to a static host such as Netlify, Vercel, GitHub Pages, or Cloudflare Pages.

# Northstar HR Track (Local Backup)

A shareable HR application tracking web app for the full recruitment pipeline.

## What it does

- Registers new candidates at `Received`
- Lets HR move applications through `Shortlisted`, `Interviewing`, `Offer`, `Hired`, or `Rejected`
- Lets candidates check progress natively on the dashboard feed
- Stores data in Supabase so the data persists in a hosted PostgreSQL database

## How to share as a link

Deploy the static front end to a host such as:

- Netlify
- Vercel
- GitHub Pages
- Cloudflare Pages
