# ZEUS Backend (FastAPI + PostgreSQL)

## Run locally (easiest - SQLite, no postgres needed)
```bash
cd server
pip install -r requirements.txt
# optional: set OPENAI_API_KEY for real AI, otherwise mock data is used
uvicorn app.main:app --reload --port 8000
```
API: http://localhost:8000/docs
Health: http://localhost:8000/health

## With Postgres (Docker)
```bash
docker compose up --build
```

Set `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, and `SECRET_KEY` in the repository `.env` before starting Compose. The database administrator account is reserved for maintenance; the API connects as the non-superuser `zeus_app`.

The app-role setup script runs automatically when PostgreSQL initializes a new data volume. For an existing volume, start only PostgreSQL first, then apply the setup script once before starting the API:

```bash
docker compose up -d postgres
docker compose exec postgres sh /docker-entrypoint-initdb.d/20-create-app-role.sh
docker compose up -d
```

The script grants the app role access to the ZEUS database and transfers ownership of its existing tables and sequences. It is safe to rerun to rotate the app-role password.

Copy `.env.example` to `.env` for local server development and set the provider credentials you use. Never commit `.env`.

## Endpoints
- `GET /health`
- `GET /api/entities/{Entity}` , `POST /api/entities/{Entity}` , `PUT /api/entities/{Entity}/{id}` , `POST /api/entities/{Entity}/filter` , `bulkCreate`, `updateMany` etc.
- `POST /api/functions/{discoveryChat, recommendGoals, generateRoadmap, generateSchedule, prepareLesson, lessonTutor, companionChat, nodeResources, searchJobs, rewriteSummary, rewriteProjectDescription, joinCommunity, getPublicPortfolio}`
- `POST /api/upload` or `/api/integrations/Core/UploadPublicFile`

### Educational partners

Partner management is available to admins at `/api/partners/admin`; each partner workspace is scoped to the signed-in partner, and instructor access is limited to assigned students.

- Partner administration: `GET/POST /api/partners/admin`, `GET/PUT/DELETE /api/partners/admin/{partner_id}`
- Partner subscription extension: `POST /api/partners/admin/{partner_id}/subscription/extend`
- Student and instructor management: `/api/partners/admin/{partner_id}/members` and `/api/partners/members`
- Student detail and partner dashboards: `GET /api/partners/admin/{partner_id}/students/{student_id}`, `GET /api/partners/students/{student_id}`, `GET /api/partners/dashboard`
- Spreadsheet import and instructor curriculum: `POST /api/partners/members/import`, `PUT /api/partners/track`
- Partner communities: `/api/partners/admin/{partner_id}/communities` and `/api/partners/communities`
- Partner exams and recorded attempts: `/api/partners/assessments` and `/api/partners/assessments/{assessment_id}/attempts`

Community ownership and instructor ownership are stored on the existing community records; schema migration version 20 adds the nullable ownership columns without removing existing data.
