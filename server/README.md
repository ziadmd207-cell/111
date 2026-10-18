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
docker-compose up --build
```

## Env
Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
If `OPENAI_API_KEY` is empty, all AI functions return mock data so the app works offline.

## Endpoints
- `GET /health`
- `GET /api/entities/{Entity}` , `POST /api/entities/{Entity}` , `PUT /api/entities/{Entity}/{id}` , `POST /api/entities/{Entity}/filter` , `bulkCreate`, `updateMany` etc.
- `POST /api/functions/{discoveryChat, recommendGoals, generateRoadmap, generateSchedule, prepareLesson, lessonTutor, companionChat, nodeResources, searchJobs, rewriteSummary, rewriteProjectDescription, joinCommunity, getPublicPortfolio}`
- `POST /api/upload` or `/api/integrations/Core/UploadPublicFile`
