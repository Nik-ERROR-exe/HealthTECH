"""Pytest configuration — puts `backend/` on sys.path so `app.*` imports work.

Tests import the agent modules which pull in app.config (.env) and app.database
(engine creation is lazy — no connection happens at import).
"""
import pathlib
import sys

BACKEND_DIR = str(pathlib.Path(__file__).resolve().parents[1])
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)