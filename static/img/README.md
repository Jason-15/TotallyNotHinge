# Profile photos

Every profile has a folder here. Drop images in and they're picked up on the next
page load — no code change, no restart.

```
static/img/<profile-id>/0.jpg   ← first photo
                        1.jpg   ← second photo
```

`.jpg`, `.jpeg`, `.png` and `.webp` all work. Portrait **3:4** crops best — the app
renders into a 3:4 box with `object-fit: cover`, so a landscape shot gets centre-cropped
hard.

Any slot without a file falls back to generated artwork, so you can fill these in
gradually. Each folder has a `_photos.txt` listing its slots.

| | Who | Folder | Photos | Supplied |
|---|-----|--------|--------|----------|
| Account owner | **Sheshu** | `static/img/sheshu/` | 6 | — generated art |
| Wings | **Jason** | `static/img/jason/` | 3 | — generated art |
|  | **Julia** | `static/img/julia/` | 3 | — generated art |
|  | **Sewon** | `static/img/sewon/` | 3 | — generated art |
| Discover deck | **Homer** | `static/img/homer/` | 6 | ✅ 6/6 |
|  | **Moe** | `static/img/moe/` | 6 | ✅ 6/6 |
|  | **Ned** | `static/img/flanders/` | 6 | ✅ 6/6 |
|  | **Krusty** | `static/img/krusty/` | 6 | ✅ 6/6 |
|  | **Jeff** | `static/img/cbg/` | 6 | ✅ 6/6 |

The five deck profiles ship with real screenshots. The owner and wings are still on
generated placeholders — drop your own photos into those folders.

**Adding more photos than listed** — the app renders the `photos` list in
`app/data/profiles.py`, not the folder contents. Add an entry there (with a `caption`
and a short `label`) and it'll look for the next slot here.

The `label` matters: it's the phrase the Wing Badge uses, as in "Julia reacted 🔥 to
his *donut photo*". Keep it a short noun phrase.
