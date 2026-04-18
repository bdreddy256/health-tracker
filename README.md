# Health Tracker

A minimal personal health tracker — vanilla HTML/CSS/JS, Supabase backend, Chart.js charts. Deployable to GitHub Pages. Mobile-friendly.

## Features

- Email/password auth (Supabase Auth)
- Daily logging: weight, steps, protein, calories, workout type/volume/notes
- One entry per user per date (upsert)
- Editable & deletable history
- Weekly metrics: 7-day averages, goal-hit %, workout frequency & volume
- 30-day line charts for all metrics
- Settings: weight unit (lbs/kg), daily goals for steps/protein/calories
- Row Level Security — users only see their own data

---

## Step-by-Step Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New Project**. Choose an org, name it (e.g. `health-tracker`), set a database password, pick a region.
3. Wait ~1 minute for it to spin up.

### 2. Create the Table + Row Level Security

Open your project's **SQL Editor** (left sidebar) and run this:

```sql
-- entries table
create table entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  weight     real,
  steps      integer,
  protein    integer,
  calories   integer,
  workout_type text not null default 'none'
    check (workout_type in ('none','cardio','strength','mixed','other')),
  workout_volume real,
  workout_notes  text,
  created_at timestamptz default now(),

  unique(user_id, entry_date)
);

-- Enable RLS
alter table entries enable row level security;

-- Users can only see their own rows
create policy "Users read own entries"
  on entries for select
  using (auth.uid() = user_id);

create policy "Users insert own entries"
  on entries for insert
  with check (auth.uid() = user_id);

create policy "Users update own entries"
  on entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own entries"
  on entries for delete
  using (auth.uid() = user_id);
```

Click **Run**. You should see "Success" for each statement.

### 3. Get Your Keys into config.js

1. In Supabase, go to **Settings → API** (left sidebar → gear icon → API).
2. Copy the **Project URL** and the **anon / public** key.
3. In your project folder, copy the example config:

```bash
cp config.example.js config.js
```

4. Open `config.js` and paste your values:

```js
const SUPABASE_URL = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...your-key-here';
```

> `config.js` is in `.gitignore` — it won't be committed.

### 4. Run Locally

No build step needed. Just serve the files:

```bash
# Option A: Python (built into macOS)
python3 -m http.server 8000

# Option B: Node (if you have npx)
npx serve .

# Option C: VS Code Live Server extension
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

1. Click **Sign Up**, enter an email & password.
2. Check your email and click the confirmation link (Supabase sends one by default).
3. Sign in — you're ready to log entries.

### 5. Deploy to GitHub Pages

```bash
# Initialize repo & push
git init
git add .
git commit -m "Initial commit: health tracker app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/health-tracker.git
git push -u origin main
```

Then enable Pages:

1. Go to your repo on GitHub → **Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Click **Save**.
4. Wait ~1 minute. Your site is live at `https://YOUR_USERNAME.github.io/health-tracker/`.

> **Important:** Since `config.js` is gitignored, GitHub Pages won't have it.
> For a public deployment, you have two options:
>
> - **Option A:** Remove `config.js` from `.gitignore` and commit it. The anon key is safe to expose — RLS protects the data.
> - **Option B:** Use a CI step to inject the values from GitHub Secrets.
>
> Option A is fine for a personal tracker. The anon key only grants access scoped by RLS policies.

### Supabase Auth: Allowed Redirect URLs

If deploying to GitHub Pages, add your Pages URL to Supabase:

1. **Authentication → URL Configuration**
2. Add `https://YOUR_USERNAME.github.io/health-tracker/` to **Redirect URLs**.

---

## File Structure

```
├── index.html           # Single-page app shell
├── app.js               # All application logic
├── style.css            # Styles (system fonts, responsive)
├── config.js            # Your Supabase keys (gitignored)
├── config.example.js    # Template for config.js
├── .gitignore
└── README.md
```

## Tech Stack

- HTML / CSS / vanilla JS — no build tools
- [Supabase](https://supabase.com) — Auth + Postgres + RLS
- [Chart.js](https://www.chartjs.org/) — line charts via CDN
