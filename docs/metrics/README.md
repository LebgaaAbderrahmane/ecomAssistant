# Metrics

One file per measurement run: `YYYY-MM-DD-<phase>.md`. Commit it with the PR that produced it. Numbers, not prose.

## Template

```markdown
# Metrics — <phase> — <commit>

- Date:
- Commit:
- Environment: local | staging | production
- Dataset: eval suite | 200 recorded transcripts | synthetic load

| Metric | Value | Target | Pass |
|---|---|---|---|
| Eval pass rate | | ≥ baseline | |
| LLM calls per turn (p50 / p95 / p100) | | ≤ 3 p100 | |
| Input tokens per turn (p50) | | −40% | |
| Output tokens per turn (p50) | | −40% | |
| Turn latency p50 / p95 | | p95 < 8s | |
| Cost per 1k turns | | −50% | |
| Duplicate orders | | 0 | |
| Lost messages (load test) | | 0 | |
| Webhook ACK p95 | | < 100ms | |
| Queue lag p95 | | < 1s | |
| Initial JS (gzip) | | < 250KB | |
| Lighthouse perf / a11y | | ≥ 90 / 100 | |
| axe critical+serious | | 0 | |

## Notes

- What changed since the last run.
- What regressed and why.
- Follow-ups filed.
```

## Baseline

The baseline must be captured on `dev` before Phase 2 starts. Until then this directory is empty by design.
