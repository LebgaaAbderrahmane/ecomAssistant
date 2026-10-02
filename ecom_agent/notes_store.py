import logging

import psycopg
from langgraph.store.postgres import PostgresStore
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

log = logging.getLogger("ecom_agent.notes_store")

# Own schema, not `public`: back runs `prisma db push` at every start and drops tables it does not know.
SCHEMA = "agent"


def open_postgres_store(database_url: str) -> PostgresStore:
    """Keep the agent's notes (flows, drafts) in Postgres, so a restart does not lose them."""
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    pool = ConnectionPool(
        database_url,
        min_size=1,
        # The gRPC server runs 10 threads and one connection is not safe across threads.
        max_size=10,
        open=True,
        check=ConnectionPool.check_connection,
        # autocommit and dict_row are required by PostgresStore. search_path puts its tables in SCHEMA.
        kwargs={"autocommit": True, "row_factory": dict_row, "options": f"-c search_path={SCHEMA}"},
    )
    store = PostgresStore(pool)
    store.setup()
    log.info("notes are saved in Postgres, schema %s", SCHEMA)
    return store
