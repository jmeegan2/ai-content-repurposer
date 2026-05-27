---
description: Launch the FastAPI backend (port 8000) and Vite frontend (port 5173) for this project
---

## Launch backend and frontend

Start the FastAPI backend and Vite frontend as background processes, then verify both are up.

```bash
# Backend
cd "/Users/jamesmeegan/Desktop/Business /AI Content Repurposer/ai content repurposer code/backend-python"
uvicorn main:app --reload --port 8000 > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# Frontend
cd "/Users/jamesmeegan/Desktop/Business /AI Content Repurposer/ai content repurposer code/frontend"
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for both to be ready
sleep 4
curl -s http://localhost:8000/docs > /dev/null && echo "Backend: UP" || echo "Backend: NOT YET"
curl -s http://localhost:5173 > /dev/null && echo "Frontend: UP" || echo "Frontend: NOT YET"
```

Report the PIDs and URLs to the user:
- **Backend**: http://localhost:8000 (API docs at http://localhost:8000/docs)
- **Frontend**: http://localhost:5173
- Logs: `/tmp/backend.log` and `/tmp/frontend.log`
