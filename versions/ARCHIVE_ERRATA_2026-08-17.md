# Archive hash errata

Verified: `2026-08-17`, Europe/London.

This errata does not replace or modify any archived release file.

## Affected record

- Folder: `versions/2026-07-21-compact-mobile-3995075/`.
- Original manifest SHA-256 claim for `aresfit-dialer-sandde-v2.html`: `D9ADB032BC95C12BCCD263E5D719C7F38CF88A0CCF7E68A1DFC4ABCD358FA06A`.
- Exact file SHA-256 on current GitHub `main`: `674D5CB71CE7EFB108F98C15073B135DCEAD7233783AD1EAB1C63B6DB736808D`.
- Exact Git blob on current GitHub `main`: `658cf5a7d994c35f873ab475456184855d184261`.
- Exact root-app Git blob on immutable branch `archive/live-2026-07-21-compact-mobile-3995075`: `658cf5a7d994c35f873ab475456184855d184261`.

## Disposition

The preserved bytes on `main` and the immutable branch agree. The old manifest and test expectation are wrong, most likely because the original SHA-256 was calculated over a different newline representation before the Git bytes were frozen.

The regression suite must validate the actual preserved GitHub bytes, while this errata retains both the original claim and the verified correction. The archived folder remains append-only and unchanged.

