from contextlib import asynccontextmanager
from typing import AsyncIterator

import psycopg
from psycopg.rows import dict_row

from app.config import settings


@asynccontextmanager
async def get_connection() -> AsyncIterator[psycopg.AsyncConnection]:
    conn = await psycopg.AsyncConnection.connect(settings.database_url, row_factory=dict_row)
    try:
        yield conn
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise
    finally:
        await conn.close()
