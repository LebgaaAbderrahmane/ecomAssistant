import re

NUM_RE = re.compile(r"\b\d+\b")
AFFIRM_RE = re.compile(
    r"\b(yes|yeah|yep|ok|okay|sure|fine|go|go ahead|do it|deal|let's go|lets go|nedi|ekhdem|zid|na'am|d'accord|aight)\b",
    re.IGNORECASE,
)
CANCEL_RE = re.compile(
    r"\b(cancel|cancel it|forget|forget it|never mind|nevermind|nvm|stop|abort|leave it|drop it|"
    r"asba|khaleh|la|no thanks|not now|later)\b",
    re.IGNORECASE,
)
BUY_RE = re.compile(
    r"\b(buy|order|take|get|want|grab|nedi|khoud|ekhdem|prefer)\b",
    re.IGNORECASE,
)
WORD_RE = re.compile(r"[a-z]{3,}")
STOP_WORDS = {
    "the", "this", "that", "your", "please", "actually", "will", "would", "could",
    "with", "and", "for", "you", "i", "me", "just", "want",
}
