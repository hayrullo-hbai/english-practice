# Repository Guidelines

## Project Structure

- `backend/app/` contains the FastAPI application, database models, schemas, and business logic.
- `frontend/` contains the responsive browser interface and static assets.
- `compose.yaml` runs the application and PostgreSQL database together.

Keep API, persistence, and interface concerns in their respective directories. Put new Python modules under `backend/app/` and follow the existing package boundaries.

## Run Locally

- `docker compose up --build` builds and starts the frontend, API, and database.
- Open `http://localhost:8080` for the application and `http://localhost:8000/docs` for interactive API documentation.
- `docker compose down` stops the services. PostgreSQL data is kept in its named volume.

## Code Style

Write Python using PEP 8: four-space indentation, `snake_case` for functions and variables, and `PascalCase` for classes. Keep API schemas explicit and database access behind the backend. Use semantic HTML, descriptive CSS class names, and small JavaScript functions. Keep the visual design minimal and accessible.

## Testing

Automated tests are not configured yet. When adding them, place backend tests in `backend/tests/`, use `test_*.py` names, and document the command in this file. Manually exercise question creation, answer attempts, scoring, stage progression, and audio playback when changing those flows.

## Commits and Pull Requests

Use concise imperative commit subjects, such as `Add question practice flow`. Pull requests should summarize user-visible behavior, note database or configuration changes, list validation performed, and include screenshots for frontend changes.

## Configuration and Security

Copy `.env.example` to `.env` for local configuration. Never commit real secrets. Use environment variables for database credentials and preserve the PostgreSQL volume when restarting local development.
