import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

logger = logging.getLogger(__name__)


def _create_engine():
    """Create the SQLAlchemy engine with resilient defaults.

    Does NOT attempt an eager connection so the app can start even when
    the database host is temporarily unreachable (pool_pre_ping handles
    stale-connection recovery on the first real request).
    """
    try:
        eng = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            connect_args={"connect_timeout": 10},
        )
        return eng
    except Exception as exc:
        logger.error(
            "[DB] Failed to create database engine. "
            "Check DATABASE_URL in .env and your network/VPN connection. "
            f"Error: {exc}"
        )
        raise


engine = _create_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()