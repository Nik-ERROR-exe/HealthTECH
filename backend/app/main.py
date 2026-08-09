"""Uvicorn entry shim — allows `uvicorn app.main:app` (same app as `main:app`)."""
from main import app  # re-export the FastAPI instance built in backend/main.py
