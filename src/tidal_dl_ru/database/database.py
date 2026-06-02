import os
from pathlib import Path
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.orm import sessionmaker

# Absolute, env-configurable DB path. The previous "./flacaudio.db" default was
# relative to the process CWD, so in Docker (no volume there) the user DB was wiped
# on every restart — surfacing as "invalid credentials" after a redeploy. Mount a
# volume at the parent dir and set TIDALDLRU_DB_PATH to persist accounts.
_db_path = Path(
    os.environ.get(
        "TIDALDLRU_DB_PATH",
        str(Path.home() / ".local" / "share" / "tidal-dl-ru" / "flacaudio.db"),
    )
)
_db_path.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{_db_path.as_posix()}"

# Setting check_same_thread=False is needed in SQLite for FastAPI dependencies
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
