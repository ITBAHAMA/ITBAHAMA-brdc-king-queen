# BRDC King & Queen

Voting site for the BRDC Year-End Party 2026. Guests vote for one **King** and one **Queen of the Night** from their phones. Organizers manage nominees, watch a live count, and reveal the winners on every screen at once.

## Links

| Page | For | URL |
| --- | --- | --- |
| Voter page | Everyone at the party | https://itbahama.github.io/ITBAHAMA-brdc-king-queen/ |
| Organizer page | Admins with the PIN | https://itbahama.github.io/ITBAHAMA-brdc-king-queen/admin.html |

Guests don't need an account. The organizer page asks for the **admin PIN**. Ask the IT team for it; it is not stored in this repo.

## How voting works

- **One vote per phone.** Each browser gets a random device ID on first visit, and the database accepts one ballot per ID. Someone could vote again from a second browser or a private window, so it's meant for a friendly party vote, not a secure election.
- **Nobody sees the count until the reveal.** Guests only see their own pick. The live count is on the organizer page only.
- **Everything updates live.** When an organizer opens voting or reveals winners, every open voter page updates by itself within a few seconds.

## Organizer page

1. Unlock with the admin PIN.
2. **Nominees:** enter the name and pick King or Queen. **Take photo** opens the phone camera; the photo is resized and saved with the nominee. Use **Retake** or **Add photo** on an existing nominee to change it.
3. **Open voting** (needs at least one King and one Queen).
4. **Present on screen** shows a full-screen projector view with the number of ballots cast.
5. **Close voting**, then **Reveal winners**. Ties are shown as ties.
6. **Reset all ballots** clears test votes before the party (nominees stay).
7. **Change PIN** under Admin PIN. Other organizers are asked for the new PIN on their next action.

After 20 wrong PINs within 5 minutes, unlocking is blocked for 5 minutes.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Voter page |
| `admin.html` | Organizer page |
| `css/style.css` | Shared styles (BAHAMA green, black and crown gold) |
| `js/config.js` | Supabase URL, public anon key and default event name |
| `js/common.js` | Shared helpers, live data loading, photo resizing |
| `js/vote.js` | Voter page logic |
| `js/crown.js` | Three.js faceted glass crown in the voter page hero (blue-tinted, light-splitting, slowly turning) |
| `js/admin.js` | Organizer page logic |
| `assets/` | BAHAMA logo |
| `supabase/*.sql` | Database tables and functions, exactly as applied |
| `claude-artifact/` | Earlier claude.ai version of the page, kept for reference |

## Backend

Data lives in Supabase, in tables prefixed `kq_` inside an existing project. They don't touch any other tables there.

| Table | Contents | Public can |
| --- | --- | --- |
| `kq_settings` | Voting status and event name | read |
| `kq_nominees` | Name, category, photo | read |
| `kq_votes` | One row per device | nothing (only via `kq_cast_vote` / `kq_my_vote`) |
| `kq_results` | Tallies, written at the reveal | read |
| `kq_admin` | Hashed admin PIN | nothing |

Every write goes through a database function. Organizer functions (`kq_admin_*`) check the PIN inside the database, so the anon key in `js/config.js` is safe to publish: on its own it can only read nominees, status and revealed results, and cast a vote while voting is open.

## Hosting

GitHub Pages serves the site from the `main` branch root. After a push, wait for the **pages build and deployment** run in the Actions tab, then hard-refresh (Ctrl+F5).
