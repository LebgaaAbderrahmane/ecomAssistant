# The commune is filled with the wilaya name

Status: needs-triage
Severity: major

Found in the real end-to-end test of 2026-10-19 (re-run after the product fix).

## What

The customer said "Oran". The args LLM filled both fields with it, so the agent never asked for the commune.
`createOrder` then failed on commune validation, and the agent said "la ville Oran ne semble pas être reconnue".

## Facts

- Log 20:18:33: `extracted={... 'wilaya': 'Oran', 'commune': 'Oran'}`.
- The customer gave only the wilaya in that message.
