# Group and family travel: design for approval

Status: **draft for the owner's approval. Nothing here is built, and no database change has been made.**
Date: 2026-11-12.

## The goal, in plain words

Let a few people plan one trip together without anyone seeing what they should not. Start with the
smallest safe step (people who can *look* at a plan), then let chosen people *edit* it, then add
voting and shared costs. Each step ships on its own and can stop there.

## What exists today (and what it means for the design)

- A trip is one row in `trips`, with the whole plan in the `data` JSON. Row-level security lets
  **only the owner** read or change it. That is a strong default we keep.
- `data` holds private things: **bookings and confirmation codes, spending and who paid, the
  passport country, the exact start point**. Share links already leave these out (`sharedTripPayload`).
- Share links (`/shared#trip=...`) need no account: the plan travels inside the link and never
  reaches our server. They are copies, not live, and anyone with the link can open one.
- Each traveler's private preferences (food needs, access needs, memberships, home airport) live in
  `traveler_preferences`, owner-only.
- The table `trips` already has a `revision` number, which we can use to catch two people editing at once.

## Principles (non-negotiable)

1. **Private stays private.** A member never receives bookings, confirmations, spending, passport,
   exact locations, e-mail addresses or another person's saved preferences, unless that person
   chooses to share them for this trip.
2. **The owner is in charge.** Only the owner changes who is in the trip, the money (budget and
   emergency fund) and deletes the trip.
3. **Server-enforced.** Every rule below is enforced in the database (row-level security and
   functions), never only in the screen.
4. **Smallest data.** No e-mail is stored for invitations. Members can use a nickname.
5. **Deleting is real.** Deleting an account removes its trips, memberships and invitations (the
   existing "delete my account" function must be extended in the same change).

## Roles

| Role | Can see | Can change |
| --- | --- | --- |
| Owner | Everything in their trip | Everything, including members, money, bookings, deletion |
| Editor | The plan: days, stops, notes, dates, places, tips | The itinerary and notes (not money, bookings, members) |
| Viewer | The plan (same as editor) | Nothing; can vote in Phase 3 |

Nobody but the owner sees: bookings, spending, budget totals, passport, saved preferences.
(Open question 2 below: should members see the budget total?)

## Data model (proposed)

New tables, all with row-level security on, owner-only unless stated:

- `trip_members (trip_id, user_id, role editor|viewer, nickname, share_needs boolean default false, created_at)`,
  primary key `(trip_id, user_id)`. A member can read their own row and delete it (leave the trip).
  The owner can read and delete all rows of their trips. Limit 10 members per trip.
- `trip_invites (id, trip_id, token_hash, role, expires_at, created_at, accepted_by, accepted_at)`.
  The invite link carries a random 128-bit token; only its hash is stored. Single use, valid 7 days,
  revocable by the owner. Accepting needs a signed-in account.
- Phase 3 only: `trip_votes (trip_id, item_id, user_id, vote)`.

`trips` keeps its owner-only policies. Members never query `trips` directly. They use two
database functions that run with the owner's rights but check the caller first:

- `get_shared_trip(trip_id)`: returns the plan **with the private parts removed**
  (bookings, spending, passport, exact points, budget fields). Works only for a member.
- `update_shared_trip(trip_id, expected_revision, itinerary)`: editors only; changes **only** the
  itinerary and notes; fails with a clear "someone else changed this" if the revision moved.

The same removal list as the share link is used (one list, one test) so the two can never drift.

## What each phase delivers

**Phase 1: Invite people to look (viewers).** Owner creates an invite link, picks the role,
sees and removes members. A member opens the link, signs in, sees the plan read-only under
"Shared with me". Smallest useful step, and it proves the privacy rules.

**Phase 2: Let chosen people edit.** Editors change the itinerary through `update_shared_trip`.
Conflicts: if two people save at once, the second sees "Someone else changed this plan" with a
reload button (no silent overwrite). The existing day-edit Undo works per person on their own change.
No live cursors or instant sync; the page refreshes when you return to it.

**Phase 3: Decide together.** Stop voting ("Want to go" / "Skip") by members; the owner sees tallies.
Group needs for AI planning: a member may tick "share my food and access needs with this trip"
(`share_needs`); the planner then receives the **combined** needs with no names attached.
Shared costs: the existing "who paid" split in Spending can later be linked to members; Waypoint
still never moves money.

## Risks and how the design handles them

- **Invite link leaks:** it works once, expires in 7 days, can be revoked, and gives only the
  role chosen; viewers cannot change anything.
- **Someone is added who should not see the plan:** the owner can remove them at any time; their
  access ends immediately (the functions check membership on every call).
- **Private data in the plan JSON:** removed server-side by the function, with a test that fails
  if a private field is ever added to the plan without being listed.
- **Two people editing:** revision check, never a silent overwrite.
- **Abuse:** invitations and member changes use the existing per-account rate limit; 10 members max.
- **AI replans change item ids, so votes attach to items that vanish:** votes for removed items are
  dropped; the screen says votes apply to the plan as it stands.
- **Account deletion:** the delete-account function is extended to remove owned trips, memberships
  and invites; a member who deletes their account just leaves.

## How we would test it before launch

- Database tests with **two real users** (run as each role): a member cannot read `trips`, cannot
  see private fields through `get_shared_trip`, a viewer cannot call `update_shared_trip`, an editor
  cannot change money fields, a stranger gets nothing, an expired or reused invite fails.
- Unit tests for the "remove private fields" list and the conflict rule.
- A manual run through two browsers before enabling it.
- The Privacy policy updated in the same change (what members can see, what is stored).

## Decisions needed from the owner

1. **Approve the data model above** (three new tables and two functions on the production database)?
2. **Can members see the budget total and per-day cost?** Default proposed: **no**.
3. **Invite by link only** (no e-mail needed; recommended) or also by e-mail (needs an e-mail service)?
4. **Member limit:** 10 per trip proposed.
5. **Start with Phase 1 only** (viewers) and review before Phase 2? Recommended.

## Not in scope

Real-time co-editing, chat, payments or money transfers, public trip pages, and any selling or
sharing of identifiable member data.
