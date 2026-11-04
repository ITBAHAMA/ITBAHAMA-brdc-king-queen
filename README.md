# BRDC King & Queen

Voting page for the BRDC Year-End Party 2026: guests vote for one **King** and one **Queen of the Night**, organizers watch a live count, and the winners are revealed on every screen at once.

Live page: https://claude.ai/artifact/RTaoi3watSCSwW9ftrHrVf

## How it runs

The page is a claude.ai artifact. It uses claude.ai's built-in artifact features for storage and sign-in:

- **Shared database**: nominees, settings, ballots and results
- **Asset storage**: nominee photos
- **Viewer identity**: one ballot per signed-in account

So it only works when opened from the claude.ai link above. Opening `index.html` from GitHub Pages or a local disk shows the page, but it can't load or save any data.

This repo is the version-controlled source and backup.

## Files

| File | What it is |
| --- | --- |
| `index.src.html` | Page source with a `__LOGO__` placeholder (edit this one) |
| `artifact.html` | Built page content, exactly as published to claude.ai |
| `index.html` | The same page as a full HTML document, for opening in a browser |
| `assets/bahama-logo.jpg` | Original BAHAMA logo |
| `build.py` | Rebuilds `artifact.html` and `index.html` from the source and logo |

Rebuild after editing the source:

```bash
python3 build.py
```

To publish a change, ask Claude to update the artifact at the link above with the new `artifact.html`.

## Who can do what

| Role (claude.ai share menu) | Can |
| --- | --- |
| Owner | Everything, including **Reset all ballots** |
| Editor | Organizer desk: add/remove nominees, take photos, open/close voting, reveal winners, see ballots |
| Contributor | Vote once |
| Viewer | See nominees and results, can't vote |

Share the artifact with the BRDC organization at **Contributor** so staff can vote.

## Data layout

| Path | Contents | Read | Write |
| --- | --- | --- | --- |
| `settings/main` | `status` (setup, open, closed, revealed), `eventName` | everyone | editors |
| `nominees/<id>` | `name`, `category` (king/queen), `unit`, `photo` (asset id) | everyone | editors |
| `votes/<user id>` | `king`, `queen` (nominee ids), `at` | editors and the voter | the voter (own), owner |
| `results/main` | Tallies written when winners are revealed | everyone | editors |

## Party night

1. Add nominees in the organizer desk. **Take photo** opens the phone camera and uploads immediately.
2. **Open voting**.
3. Put the page on the projector with **Present on screen**. It shows the running ballot count.
4. **Close voting**, then **Reveal winners**.
