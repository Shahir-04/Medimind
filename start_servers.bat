@echo off
echo Starting MediMind Backend Server...
start cmd /k "uv run uvicorn backend.main:app --reload --port 8000"

echo Starting MediMind Frontend Server...
start cmd /k "cd frontend && npm run dev"

echo Both servers are starting!
echo Frontend will be available at http://localhost:3000
echo Backend API docs will be available at http://localhost:8000/docs
