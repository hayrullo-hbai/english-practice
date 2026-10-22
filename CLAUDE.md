# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

English Practice: a single-user app for practicing written English answers to stored questions. FastAPI + SQLAlchemy backend, PostgreSQL, and a vanilla HTML/CSS/JS frontend served by nginx. See also `AGENTS.md` (repository guidelines) and `README.md` (feature list, in Uzbek).

## Commands

```bash
cp .env.example .env          # first time only
docker compose up --build     # db (postgres:16), backend (:8000), frontend (nginx :8080)
docker compose down           # stop; data persists in the postgres_data volume
docker compose logs -f backend
```

- App: http://localhost:8080 — API docs: http://localhost:8000/docs
- The frontend directory is bind-mounted read-only into nginx, so HTML/CSS/JS edits only need a browser refresh. Backend changes need `docker compose up --build backend` (no `--reload`, code is copied into the image).
- Running the backend outside Docker: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`. Without `DATABASE_URL` it falls back to SQLite at `backend/english_practice.db`. Note the frontend calls relative `/api`, which only resolves through the nginx proxy.
- No tests, linter, or formatter are configured. If adding tests, put them in `backend/tests/` as `test_*.py` and document the command in `AGENTS.md`.

## Architecture

**Backend is a single module**, [backend/app/main.py](backend/app/main.py): ORM models, Pydantic schemas, and all `/api/*` routes live together. New modules go under `backend/app/`.

**No migrations.** Tables are created with `Base.metadata.create_all` on startup, which never alters existing tables. Adding/changing columns on an existing model will not apply to the persisted Postgres volume — you need a manual `ALTER TABLE` (or a migration tool) rather than wiping the user's `postgres_data` volume.

**Data model:**
- `Question` — prompt, answer, hint, `stage` (1–3), `score` (per-stage, reset to 0 on stage change or when the stage is edited).
- `Settings` — singleton row `id=1` (created by `get_settings`) holding the stage thresholds.
- `PracticeRound` — one per served question (UUID `round_id`); stores active duration and completion/correctness. Dashboard stats are computed from rounds, not attempts.
- `Attempt` — each submitted answer within a round.

**Practice flow** (`/api/practice/next` → `/api/practice/{id}/answer`): the client picks a stage; the server returns a random active question of that stage and creates a round. Answers are compared via `normalize()` (casefold, alphanumerics only). Scoring rules live in `answer_question`:
- Correct: +2 on 1st attempt, +1 otherwise; reaching the stage threshold promotes the question (score reset).
- 2nd wrong attempt returns the hint; 3rd wrong reveals the answer and penalizes: stage 1 −1, stage 2 −2, stage 3 demotes to stage 2 with `stage_two_return_score`.

**Dashboard** (`/api/dashboard?period=7|30|all&timezone_offset_minutes=…`): buckets rounds by the client's local day (or by month for `all`); the frontend passes `Date.getTimezoneOffset()`.

**Frontend** ([frontend/app.js](frontend/app.js)): one page with four tab views (`#practice-view`, `#library-view`, `#dashboard-view`, `#settings-view`) toggled by `showView`. All API calls go through `request()`. Practice time is counted client-side (only while the tab is visible and focused) and sent as `duration_seconds`. Stage 3 questions are audio-only via the browser Web Speech API (`speechSynthesis`, en-US). Charts are hand-built SVG — no libraries or build step. `styles.css` is written in a compact, mostly one-line-per-component style.

**UI language:** all user-facing strings (frontend text and backend `HTTPException` details/messages) are Uzbek (Latin script, using `‘`/`’` apostrophes). Keep new strings consistent.

## Manual verification

When touching these flows, exercise them in the browser: question create/edit/delete, answer attempts (hint on 2nd, reveal on 3rd), scoring, stage promotion/demotion, audio playback, and the dashboard periods.
