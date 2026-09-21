# AresFit Dialer release archive

The public app remains `aresfit-dialer-sandde-v2.html` so the phone link does not change.

Before every future app change:

1. Create an immutable GitHub branch from the current `main` commit.
2. Copy the current app and `index.html` into a new dated folder under `versions/`.
3. Record both SHA256 hashes and the GitHub commit in that folder's `MANIFEST.md`.
4. Build and test the next revision without modifying or deleting any archived folder.
5. Move `main` only after the new revision and its archived predecessor are both verified.

Archived releases are append-only. Never replace an existing archived file.
