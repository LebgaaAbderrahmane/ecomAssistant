import logging
import os

import psycopg
from psycopg.rows import dict_row

log = logging.getLogger("ecom_agent.db")

MESSAGE_SELECT = (
    'SELECT id, "conversationId", role, content, text, "messageType", '
    'direction, sender, "createdAt" FROM "Message" WHERE id = %s'
)


def get_message(message_id: str) -> dict | None:
    """Read one message row from the shared Postgres by its cuid id."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        log.warning("DATABASE_URL not set; cannot read message %s", message_id)
        return None
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(MESSAGE_SELECT, (message_id,))
                return cur.fetchone()
    except psycopg.Error as exc:
        log.warning("failed to read message %s: %s", message_id, exc)
        return None