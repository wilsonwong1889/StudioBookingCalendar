from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass


@event.listens_for(Base.metadata, "before_create")
def enable_postgres_extensions(_metadata, connection, **_kwargs):
    if connection.dialect.name == "postgresql":
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
