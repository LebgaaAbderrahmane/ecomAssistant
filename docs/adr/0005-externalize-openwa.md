# Externalize OpenWA

`OpenWA/` is a vendored NestJS WhatsApp bridge: about 42k lines across 505 tracked files, 7.6MB on disk, with its own CI, env files, and dependency tree. It is not a submodule. It is the largest single directory in the repo and the team does not own its roadmap.

We remove the source from this repository and consume a pinned image (or a small fork we control, published as an image). The app keeps a thin adapter for the operations it uses: session create, QR, send message, media download, webhook delivery.

## Considered options

- **Keep vendored source.** Easiest today; every upstream update becomes a manual merge and the repo keeps 42k lines nobody reviews.
- **Git submodule.** Better separation, but still builds from source and adds submodule friction for every clone and CI job.
- **Pinned image or controlled fork image.** Chosen. Reproducible, smaller repo, clear upgrade path.
- **Official WhatsApp Cloud API now.** The right long-term direction, but it changes onboarding, pricing, and media handling. Plan it as a follow-up, not part of this rework.

## Consequences

- Local dev pulls an image instead of building OpenWA from source.
- Patches, if needed, live in a fork with its own CI and a published tag.
- The adapter interface is the seam that makes a later Cloud API migration possible.
- `git ls-files | grep OpenWA` must return nothing when done.
