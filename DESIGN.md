# The Last Straw

**Pitch:** Take turns loading one very patient camel. Whoever breaks its back loses the round.

**The goal in one look:** a camel under a wobbling tower of junk, your item hanging in your hands above it, a brass dial whose
straw needle is creeping into the red, the camel's knees shaking.

**Store line:** "Take turns loading the camel. Don't be the one who breaks its back."
Genre: Party. 2D side view. 1-6 players, bots in empty seats.

## Where this fills in or changes the spec

1. **A points race, not strikes.** Every item you load that stays on scores its weight in kg. The player whose turn breaks
   the back (or drops anything) scores nothing for that round. Most kg after 3 rounds (or 5) wins. Strikes meant players
   sitting out and 15+ rounds; this keeps everyone playing every turn, fits a match in about 6 minutes, and gives the pick a
   second edge: heavy items are points early and danger late.
2. **Every item strains the camel, even a straw.** Strain = weight + 2 per item + off-centre load + landing impact. The
   straw weighs "1 g" and scores 0, but its +2 can be the one that breaks it (in bot rounds about a quarter of all breaks
   are a straw's).
3. **Caravan has towns.** Solo score attack: load, walk, deliver the load at the next town, go on with a tired camel. Kg
   delivered is the score; one failure ends the run. This makes the solo mode a skill climb rather than one random limit.
4. **Daily cart** is a Caravan run on the day's seed (same items and limits for everyone). The first run of the day counts.
   Platform leaderboards keep a best-ever, so today's board is a small shared list in `ow.data.game` (see Progression); the
   score itself is the plain kg.
5. **Bots are desert animals** (Fennec, Tortoise, Vulture, Gecko, Jerboa) with habits of their own, not people.
6. **Mouse:** the held item follows the pointer and a click drops it (no holding a button while aiming). Touch: drag
   anywhere to move it (it moves with the finger, never under it), buttons to turn it, a Drop button.

## The rules (all of them)

- A camel stands on a market weighbridge. Each round the camel starts empty, fresh and with a new hidden breaking point.
- Turns go round the table. On your turn the merchant's cart shows **two items**, each with its weight on a tag. **Pick
  one. The other goes to the next player**, whose pair is that item plus a new one from the cart.
- Your item rises into your hands above the camel. Move it, turn it in 15° steps, drop it. A ghost outline shows where it
  first touches. It falls, lands, slides, settles; then the camel shifts its weight (a short sway toward the heavier side).
- **Your turn ends the round if** anything touches the sand (or the weighbridge) before the load settles, or the camel's
  strain passes its breaking point. Both count as "you broke it": you score 0 kg for this round; everyone else keeps the kg
  of every item they placed this round. Either way the cause plays out on screen: the item that fell tumbles in slow motion
  with an outline and lands in a puff of sand, or the crack runs along the back; then your name and the item on the sign.
- Otherwise your item's kg is yours (it shows as "+8" flying to your tag) and the next player goes.
- After the last round, most kg wins (ties share a place).
- The hourglass: 15 s per turn (host: 10 / 15 / 25 s), from the moment the cart stops. At 0 the cart picks the left item
  for you, and your hands open wherever they are.
- A camel that looks alarmed is always offered a straw (the last straw is never far).
- A round also ends, with nobody losing, after 40 turns.

## The first minute (what a new player sees and does)

| Time | Screen | Hint (then gone) |
|---|---|---|
| 0 s | Title: the scene alive at sunset. Animal paws load the camel, it chews and side-eyes them; when the load goes the camel folds, and the next time it gets up first. "The Last Straw" big across the sky with a golden straw under it, one gold Play slab on the sand. | none |
| ~2 s | Play: the lobby in the same scene: your tag on the rope (avatar, name), animal tags beside it faded where bots will sit, the host's board on the cart, the Caravan and Daily cart signposts, the platform's Ready strip. | none |
| ~4 s | Ready. Our own 3-2-1 painted on the sun with three drum hits, then "Load!" on a sign. | none |
| ~7 s | Round 1. The cart rolls in with two items and grows into two big pick targets; the golden straw points down at your tag. | "Pick one" (arrow to the cart) |
| ~9 s | You tap the crate. The other item stays on the cart and shows on the next tag. | "Fennec gets the other" (arrow to that tag), 2 s |
| ~10 s | The crate rises into your hands (your sleeves) above the camel. A dotted ghost shows where it first touches (rose if that's the sand). | "Move to aim" / "Drag to aim"; then "Q E turn" / "Turn it" (arrow to the buttons); then "Click to drop" / "Tap Drop" |
| ~14 s | Drop: hands open with a whup, the crate lands with a wooden knock, the needle swings on its spring, the camel squashes, chews and side-eyes you. "+8" flies to your tag. | none |
| ~17-45 s | The animals take their turns, each with its own paws and pace. Vulture hands you the anvil. The tower grows. | First time the needle passes half way: "Watch the needle" |
| ~50 s | The needle enters the red: the knees tremble, sweat flies, creaks, the drum loop speeds up, straws start appearing on the cart. | First time in the red: "Every item counts" |
| ~60-90 s | Someone's drop breaks it: a freeze, a crack, slow motion, the camel folds like a deckchair, junk everywhere. "Vulture broke its back". | none |

Round 1 is gentler: its first three turns offer common items only (no anvil, sofa, bathtub, clock or bicycle) and its
breaking point is drawn from the upper half of the red.

## Controls

| | Keyboard / mouse | Phone / tablet |
|---|---|---|
| Pick | Click an item; or 1 / 2; or ← → then Space | Tap an item (each pick target is at least 56 px, about 120 × 80 on a phone) |
| Move | Mouse: the item follows the pointer. Keys: A D / ← → sideways, W S / ↑ ↓ height | Drag anywhere in the scene: the item moves with the finger's movement, never under it |
| Turn | Q / E, or the mouse wheel (15° a step) | The ↺ and ↻ slabs |
| Drop | Click, or Space / Enter | The Drop slab (the biggest); lifting a finger never drops |

Touch buttons are the game's own wooden slabs (Drop 72 px, 64 on phones; ↺ and ↻ 64 px; 12 px apart), shown only during
your place step, in the lower right and moved above anything in `ow.ui.reserved` there (the platform's corners stay clear).
`ow.controls.set(null)` everywhere: no stick. `onceworlds.json` `controls` lists all of the above.

## The core loop, and where mastery comes from

Pick (2 s) → aim and drop (5 s) → watch it settle and the camel sway (3 s) → watch the others (each 6-10 s) → your next pick.

- **A beginner** takes the heavier item for points, drops it in the middle from wherever it is, and finds out about the red
  zone the hard way.
- **An expert**:
  - *drafts*: keeps the heavy item while the camel is fresh, and late in the round keeps the straw and hands the anvil on,
    knowing who sits next (the Vulture does this to you);
  - *builds a base*: rug, crate and books flat and low first, round things (watermelon, duck, bicycle wheels) never as a
    floor for later;
  - *balances*: off-centre load costs 0.7 strain per kg·m, so they place on the light side and keep the sway small;
  - *lowers before dropping*: impact strain is 0.1 × kg × landing speed, so an anvil let go just above the load costs a
    third of one dropped from high;
  - *reads the camel*: its face is an honest tell of the hidden limit (bored below 60% of it, uneasy, sweating from 80%,
    alarmed from 93%), so an expert knows when only a straw is safe, while a beginner only sees the dial.

## Solo

A player alone gets all of it from the same lobby:
- **Versus the market** (the match): Ready, and bots fill the empty seats (host setting: Bots Off / to 4 / to 6; alone with
  Off still seats one bot). A 3-round match against 3 animals is about 5 minutes.
- **Caravan** (signpost in the lobby): score attack. Legs of 5, 6, 7 ... up to 10 loads; between loads the camel walks three
  steps (the load sways), at the end of a leg it walks into a town (a longer, bumpier walk) and the load is delivered
  (lifted off, "+kg" each). Each town the camel is 4% weaker. No hourglass. The item you don't pick stays on the cart for
  your next pick, so you can't dodge the anvil forever. The run ends at the first break or fall; the score is kg delivered
  (the unfinished leg is lost). A good run reaches town 5-6 (about 300 kg, 6-8 minutes). Personal best, `caravan` board.
- **Daily cart** (signpost): a Caravan run on the day's seed (UTC date from `ow.now()`). First run counts; later ones are
  practice. Today's top 5 on the run-over board, you marked.
- Solo runs pause on the platform menu and when the page is hidden, and end if a match starts for you (kg delivered so far
  counts for Caravan; an interrupted daily is not used up).

## Multiplayer

- **Public game**: `ow.rooms.join({ maxPlayers: 6, minPlayers: 1, lobby: 'bar', ownCountdown: true, settings: [...] })`,
  once, as the page loads. Friends get private servers from the platform. The title has one Play button.
- **Settings** (drawn by the game on the cart's side board; the host taps a row to cycle it with `room.setSetting`):
  Rounds 3 / 5 (3), Turn 10 / 15 / 25 s (15), Bots Off / to 4 / to 6 (to 4).
- **Lobby and ready-up**: the platform's Ready strip; public servers start on the room's countdown when everyone is ready;
  a private server's host presses Start when `room.canStart`. Joining never starts anything. Empty seats on the rope show
  the animal that will sit there, faded, and tapping one opens `ow.ui.showInvite()`.
- **Match**: `createMatch` with `rounds: 'rounds'`, `introSeconds: 2.2` ("Round 2" while the camel stands up),
  `roundEndSeconds: 5`, `resultsSeconds: 25` in public servers and `0` in private ones (the host's "Back to lobby"),
  `admit: 'round'`. The game runs its own turns inside each round in `match.data` (not the helper's turn timer, so a settle
  is never cut off by a clock).
- **Turn order**: seat order (players, then bots), rotating the first placer each round. Leavers drop out of the order but
  keep their kg in the standings.
- **Bots**: `createBots(match, { host, fill, names: animals, skill: [0.35, 0.85] })`, acting through the same rpcs as players.
- **Latecomers** watch the round in progress ("Next round" by the cart) and take a bot's seat, or a new one, at the next
  round (`admit: 'round'`).
- **Away / idle**: an away placer's hourglass runs; at 0 the turn is skipped and the pair passes on untouched. An idle placer
  gets the full hourglass, then the cart picks and drops for them.
- **Host change**: everything is in `match.data` plus one private value; a new host carries on (below).

### Netcode (who decides what)

The host's page decides everything; every other page draws it.
- **Presence** (the placer only): `{ k: turnKey, x, y, a, sl }` (mm, mrad, sleeve id) up to 20/s; others draw it with
  `room.presenceAt(id, { angles: ['a'] })`. Validated: `k` must be the current turn and the sender its placer.
- **RPCs** (`createHost`): `pick { k, i: 0|1 }` and `drop { k, x, y, a }`, rate 4/s, validated against the turn key, the
  step, the sender and the hover box (values are clamped).
- **`match.data`** (host, checked by `checkRecord` on every page): `{ v, rid, round, order, ti, tn, step:
  'pick'|'place'|'settle'|'over', until, offer, pick, carry, keep, snap, top, S, mood, kg, drop, t0, verdict, final, last,
  path, by, th }` where `snap`/`final` are the load as `[item, x, y, a]` integers (0.1 mm, 0.1 mrad), `verdict` is
  `held | fell | broke` with the step it happened and the fallen item, `path` a bot's carry and `th` the page that drew the
  breaking point. About 1.5 KB.
- **The hidden breaking point** lives in the host's private value (`room.setPrivate`). A new host reads it with
  `privateOf(th)`; if that is gone, it draws a new one at least 3 above the strain the camel has already survived.
- **A drop**: the host rebuilds the world from `snap` (every page, every turn, so all start from identical numbers), adds
  the item at the clamped drop, and simulates the whole settle ahead of time in slices of 6 ms a frame (a few frames). It
  writes `drop` and `t0` at once, then `verdict` and `final`, and sends the motion as 15 Hz keyframes (every body's pose,
  the tray's sway and the dial's strain, in mm and mrad) in batches of 12 (under 12 KB a message). Every page plays the
  keyframes on the match clock, 150 ms behind, and keeps the last four turns'. At `t0 + duration` the host applies the
  verdict: next turn, or `endRound(kg)`.
- **The placer doesn't wait**: its page runs the same simulation locally from the same `snap` the instant it drops, step for
  step on the same timeline as the keyframes. As the host's keyframes arrive it blends from its own bodies to the host's at
  the same step over 0.3 s (no time shift, so no jump; when both pages run the same browser engine they are identical). The
  verdict and the settled load are always the host's. No other page ever simulates a settle.
- **Bots' hands**: the host writes a bot's carry as a short eased path with match-clock times in `match.data` (checked with
  `checkPath` before anything draws it); every page animates the same path, and the host drops at its end.
- **After a break** the collapse is cosmetic: each page tumbles the junk with its own local physics.
- A page that reloads or arrives late draws `final` (or `snap`) at once and skips the keyframes it missed.

## Progression and reasons to come back

- **Bests** (`ow.save` key `profile`): matches won, Caravan best (kg and town), lifetime kg delivered, dailies finished,
  first-round hints seen, sleeves unlocked and chosen. Key `daily`: `{ day, kg, town }`.
- **Leaderboards**: `wins` (matches won), `caravan` (best kg in one run).
- **Today's board**: `ow.data.game` list `daily` (`max: 100, bytes: 64`). A player pushes `{ d: dayNumber, kg, t: town }`
  only when their scored daily run beats their own best for today (one push a day at most). Readers keep entries whose `d`
  is today, whose numbers are integers in range, and whose kg is possible for that town (every load an anvil), the best
  per player, top 5. On the device: today's kg (on the signpost) and the all-time Caravan best.
- **Sleeves** (cosmetic, the hands everyone sees when you place): Plain; Stripes (win a match); Checks (reach town 3);
  Stars (3 dailies); Zigzag (10 wins); Gold (Steady Hand). Tap your own tag in the lobby to change.
- **Badges** (256 px discs):

| id | Name | Earned |
|---|---|---|
| `first-load` | First Load | Place your first item that holds. |
| `last-straw` | The Last Straw | Break the camel's back with a straw. |
| `steady-hand` | Steady Hand | Land an item with the needle past the middle of the red, and it holds. |
| `anvil-gift` | Anvil Gift | Hand the anvil to the next player, who breaks the back with it. |
| `high-rise` | High Rise | A load whose top stands 3 m above the saddle, and holds. |
| `survivor` | Survivor | Win a match. |
| `six-towns` | Six Towns | Reach town 6 in one Caravan run. |
| `heavy-lifter` | Heavy Lifter | Deliver 1000 kg in Caravan, all runs together. |
| `daily-cart` | Daily Cart | Finish a Daily cart. |

## Balance and timing (the numbers)

**World**: metres, y up, gravity 10 m/s², planck.js at a fixed 1/60 s step (10 velocity, 6 position iterations), sleeping
on. Weighbridge top at y = 0. Saddle: a kinematic tray 2.4 m wide, top at y = 2.10, with 0.3 m posts at both ends. The
camel's neck, head and body are static colliders (a duck can sit on its head; that counts as on the camel).
Hover box: x within ±1.6 m of the saddle centre; the item's bottom from 0.2 m to 1.6 m above the top of the load. Default
hover: centred, 0.8 m above the load.

**Items** (kg is both weight and score; friction 0.9 unless said; restitution 0.03 unless said):

| Item | kg | Size (m) | Shape | Sound | Cart |
|---|---|---|---|---|---|
| Straw | "1 g" (0) | 0.90 × 0.05 | thin box, heavy damping (floats down) | tick | rises with the strain |
| Rubber duck | 1 | 0.46 × 0.42 | body + head (restitution 0.25) | squeak | uncommon |
| Teapot | 2 | 0.50 × 0.40 | body + spout | clink | common |
| Birdcage | 3 | 0.46 × 0.70 | base + dome | jingle | uncommon |
| Potted cactus | 3 | 0.36 × 0.76 | pot + stem | clay knock | uncommon |
| Books | 4 | 0.60 × 0.30 | box | paper thump | common |
| Copper pot | 4 | 0.62 × 0.40 | trapezoid, wide top | bong | common |
| Ladder | 4 | 1.80 × 0.12 | long thin box (friction 0.5) | clack | uncommon |
| Suitcase | 5 | 0.80 × 0.50 | box + handle | leather thump | common |
| Watermelon | 5 | 0.58 × 0.44 | ellipse (friction 0.55) | thwock | uncommon |
| Tuba | 6 | 0.62 × 0.72 | bell + body | honk | uncommon |
| Rolled rug | 6 | 1.60 × 0.28 | capsule | flump | common |
| Bicycle | 7 | 1.40 × 0.80 | two wheels + frame | rattle and bell | uncommon |
| Crate | 8 | 0.70 × 0.60 | box | wooden knock | common |
| Grandfather clock | 12 | 0.50 × 1.80 | box + hood | bong and chime | rare |
| Bathtub | 14 | 1.40 × 0.60 | U of three parts | enamel gong | rare |
| Sofa | 16 | 1.60 × 0.76 | L (seat + arm) | whumph | rare |
| Anvil | 18 | 0.72 × 0.42 | foot, waist, face + horn | CLANG | rare |

**Cart**: each new item is drawn with weights common 10, uncommon 6, rare 3, straw `4 + 60 × clamp((S - 40) / 45, 0, 1)`
(3% of draws on a fresh camel, about 36% from strain 85). No identical pair (one redraw). An alarmed camel's pair always has
a straw. Draws come from the room's match seed, the round and the turn (`cartRng`), so a new host deals the same.

**Strain** S = Σ(kg + 2) + 0.7 × |Σ kg × x| + impact, with x from the saddle centre and impact = 0.1 × kg × speed at first
contact, fading with a 0.25 s time constant; something already tumbling off no longer counts. The dial runs 0-100; the red
band is 70-100; the breaking point is drawn uniformly in 70-100 (round 1: 85-100), always inside the band the dial shows.
Checked every physics step during the settle: a spike can break it. The needle follows the keyframes' strain on a spring
(slight overshoot, a boing when it swings far).

**Settle**: until every body is below 0.03 m/s and 0.06 rad/s for 15 steps, at least 20 steps after first contact (at most
3 s); then the weight shift: the tray tilts toward the heavy side, `A · sin(2πt / 0.9 s) · e^(-t / 0.5 s)` for 1.2 s with
`A = min(0.05, 0.008 + 0.002 × |Σ kg × x|)` rad and a 2 cm dip; then settle again (at most 4 s, usually far less). After a
fall the tumble plays 50 more steps so everyone sees the same thing land.

**Turns and rounds** (measured over bot rounds with `test/play.mjs`): a round is 8-20 placements, median 10, about a
minute; about 38% of rounds end with a fall and the rest with a break, about a quarter of those by a straw. A careful
scripted player took 32% of the kg in 4-seat games (a fair share is 25%); a careless one (big items, high, on the edge)
lost 29 of 60 rounds against 5 of 60 for the bots. Intro 2.2 s, round result 5 s; a 3-round match against animals is
about 5 minutes with results.

**Mood** (the camel's tells, written by the host): bored below 0.60 of the breaking point, uneasy to 0.80, sweating to 0.93,
alarmed above.

**Bots**: skill 0.35-0.85. Pick after 0.9-2.2 s × pace; carry 1.2-2.1 s × pace on an eased path with a small overshoot.
Placement search: 8 + 16 × skill spots (x every 10 cm across the tray at the item's rest angles, mostly near the load's
middle, a few at random), each tried with a 100-step quick simulation that includes the start of the weight shift, scored on
nothing moving, low torque and low height; a less sharp bot sometimes takes one of the next best, and its hand is off by up
to 0.06 m × (1 - skill) and 5° × (1 - skill). Release height from each animal's range.
- **Fennec** (pace 0.7): quick and greedy; keeps the heavier item until the camel is alarmed; lets go 0.55-1.1 m up.
- **Tortoise** (pace 1.5): slow and careful; keeps the lighter one once strain passes 45 or the camel looks uneasy; minds
  the balance most; lowers to 0.06-0.2 m.
- **Vulture**: the prankster; past strain 50 it keeps the lighter one and hands the next player the heavier.
- **Gecko**: the show-off; stands tall things upright and builds high.
- **Jerboa**: nervous; jiggles while aiming and 15% of the time lets go early, short of its spot.

**Caravan**: leg n has 4 + n loads (max 10); the breaking point is drawn per leg from (70-100) × 0.96^(n-1); a walk of three
steps between loads (1.6 s, tray bob 3 cm and tilt 0.02 × (1 + 0.15(n - 1)) rad); the town walk is 3 s of six steps at 1.5×
that sway. Cart draws depend only on the run's seed and the draw count (a Daily deals the same items to everyone), straws
rising toward the end of each leg.

**Checked in node** (`npm test`, about 10 s): items held, strained more off-centre, broken past the limit and fallen past
the tray's end; the same drop settling identically twice, keyframes included; keyframes surviving the wire and refusing
junk; offers, the alarmed camel's straw, passing the other item on, scoring (the one who broke it or dropped something
scores 0), skips, the 40-turn limit, record checks against malformed rounds, the daily board's checks; every animal's plan
inside the hover box and its carry path; whole bot matches ending with whole-kg scores; a Caravan run and the title's
attract mode playing to the end; and the match over a pretend room with a host and a guest page: whole rounds with the
guest's keyframes equal to the host's, only the placer may act, a new host mid-settle reaching the same result, a leaver
passed over, and the out-of-time pick and drop.

## Every screen

All in one world; no panels floating over a dimmed screen. HUD text: Archivo 800 in bone with a 4 px ink outline, or ink on
bone signboards.

- **Title**: the scene in attract mode (animals loading until the load goes, about a minute, then the camel gets up and they
  start again). "The Last Straw" in Big Shoulders Display 900, bone with an ink shadow, across the sky (under the platform's
  menu when it would reach it), a golden straw underlining it. One gold Play slab (68 px tall) on the sand in front of the
  weighbridge. Click, tap, Space or Enter.
- **Lobby** (room phase lobby): the empty camel chewing; the tag rope across the top with up to 6 luggage tags (avatar or
  animal portrait, name, a seat symbol ● ▲ ■ ◆ ★ ⬢ in the seat colour, host marked with a small key; tap your own to change
  sleeves, an empty one to invite); the cart on the left with the settings board (three rows; the host taps to cycle, others
  see the values); two signposts on the right (hidden for a private server's host with friends waiting):
  "Caravan" (with your best kg) and "Daily cart" (today's kg or "New"); everything above the platform's Ready strip. Results
  of the last match stay on the tags (place numbers) until the next one starts.
- **Countdown**: 3-2-1 painted on the sun disc, drum on each, "Load!".
- **Play**: the camel and its load centred (the camera eases out as the load grows); the cart at the left with the two
  offered items and their weight tags and the hourglass; the dial on its post right of the camel (on narrow screens it hangs
  from the rope's right end); the tag rope at the top, the placer's tag swung low with the golden straw pointing at it, the
  next player's tag showing the item that is coming to them; lanterns at the rope's ends, one per round, lit as rounds pass.
  When it's yours: the golden straw points at your tag, the two cart items grow to big pick targets with their keys, and the
  hourglass ticks in its last 5 s.
- **Round end** (5 s): the moment (collapse or fall) plays, then a sign board drops: "Vulture broke its back" / "Ann dropped
  the teapot" / "THE LAST STRAW" (straw breaks get the big words), with the culprit's tag cracking and "0" stamped on it;
  every other tag's "+kg" counts up into its total.
- **Between rounds** (2 s): the camel gets up hind legs first and shakes off sand; "Round 2" on the sign; a lantern lights.
- **Results**: the camel lying in front of the whole match's junk heaped on the sand (each item resting on its own edges on
  what is under it), the last item on the peak with the
  winner's avatar (or animal) on it wearing the golden straw like a crown; "Ann wins" on a sign; tags hang 1st to 6th with
  total kg; straw confetti and a fanfare. Public: a sand bar runs 25 s back to the lobby. Private: the host's "Back to
  lobby" slab; everyone else sees "Waiting for" the host.
- **Watching** (latecomer): the scene as everyone sees it, with "Next round" by the cart.
- **Caravan / Daily**: your tag alone on the rope with kg delivered (big); the town signpost ahead with the loads left
  ("3 to town"); the dial with the leg's band; the pause slab. The camel walks between loads (the dunes scroll); town
  arrival: the gate comes in, items lift off one by one with "+kg" flying to your tag. The sun sinks town by town and the
  stars come out. Run over: the camel down, a board with kg delivered, town reached, your best (or "New best"), the day's
  or the all-time top 5 with you marked, and two slabs: "Again" (Space) and "Lobby" (Esc).
- **Pause** (solo runs only): the scene frozen, a board "Paused" with "Resume" and "End run".
- **Room closed**: one board, one slab: removed → "You were removed" / Play; disconnected → "Connection lost" / Rejoin;
  replaced → "Playing in another tab" / Play here (each calls `rooms.join` again with the same options).

Layouts: 1280×720 as above. Phone portrait (390×844): tags in one row under the platform's menu (avatar + kg), the dial
under the rope's right end, the camel fills the width with room above it for the load, the cart at the bottom, the game's
buttons bottom right only while placing. Phone landscape (844×390): short tags (avatar, name, kg), the camel and load in
the middle, cart left, dial right. Nothing under `ow.ui.reserved`; targets at least 56 px.

## Art direction

**The world:** a caravan weigh-station at sunset, drawn like a 1930s travel poster: flat colour shapes in two or three tones,
a huge low sun, a sky in flat bands, three layers of dunes with parallax, long violet shadows across the sand, and chunky
junk with ink outlines.

**Palette:**

| | Hex | Used for |
|---|---|---|
| Ink | `#1C0F2E` | outlines, text outline, deepest shadow |
| Dusk violet | `#3B2160` | upper sky, far dunes, shadow tone, panels |
| Rose | `#D63F6E` | middle dunes, the dial's red band (hatched), "bad" |
| Ember | `#F27B35` | near dunes, the cart, warm accents |
| Sun gold | `#FFC845` | the sun, the golden straw, Play slabs, highlights |
| Bone | `#FFF0D9` | tags, dial face, text, highlights; the camel is a tint of ember and bone |
| Turquoise | `#22B8A7` | "good": the ghost outline, your marker, "+kg" |

`ow.ui.setLook({ accent: '#FFC845', panel: '#3B2160', text: '#FFF0D9' })`.

**Fonts** (self-hosted woff2, latin subset, OFL files beside them): Big Shoulders Display 900 for the title and big numerals
(kg, the countdown, round signs); Archivo 800 for names, hints and labels. Both are requested at load; canvas text uses
them as soon as they arrive.

**Signature element: the golden straw.** It is the dial's needle, the pointer over whose turn it is, the title's underline,
the winner's crown, and the straw in the camel's mouth on the icon. A straw that breaks the back gets the biggest sign.

**Light and camera:** the sun sits low on the left, sinking a little each round (round 3 is a sliver; stars come out). Every
shape is lit gold on its left edge and violet-shadowed on its lower right; the camel and its load cast one long sheared
shadow across the sand to the right. Orthographic side view; the camera eases to fit the camel, the load and the hover zone
(the hover zone stays in frame all round, so the camera only eases out as the load grows and never pumps between turns);
dunes parallax at 15/35/60%; camera shake from decaying trauma² on landings (scaled by kg) and the break.

**The camel:** a dromedary facing the cart, heavy-lidded, always chewing, with a striped pack rug and a wooden saddle tray. Its
eye side-eyes whoever placed last. Its knees bow as strain grows, tremble once it's sweating, and its eyes go wide and its ears
flat when alarmed (sweat drops fly). It squashes down a little under every landing. The break: a zigzag crack along the back,
a creak, the legs fold front then back like a deckchair, the body thumps onto the planks, tongue out.

**Players and bots:** players are their platform avatar on their tag and their hands (sleeves in the seat colour and their
chosen pattern, a symbol on the cuff) holding the item from above. Bots are animal portraits on their tags and their own paws:
Fennec's sandy fur, Tortoise's green scaled hands, Vulture's dark feathered talons, Gecko's sticky toes, Jerboa's tiny pale
paws.

**HUD in the world's language:** scores on luggage tags hanging from a rope; the hidden limit's band on a brass weighbridge
dial with a straw needle; turn time in the cart's hourglass; rounds as lanterns; results on sign boards and a heap of junk.

**Juice:** items squash on landing, the needle overshoots on a spring, the cart bounces on a pick, tags swing when they change,
sand puffs where things land, splinters on the crack, an 80 ms freeze then 0.3× slow motion for 0.8 s on a break, straw
confetti for the winner. Reduced motion: no shake, no freeze or slow motion, fewer particles.

## Sound

All synthesized in Web Audio, started on the first tap or key.
- Pick: a wooden tok; a new pair arrives with the cart's scrape.
- Aim: a soft rope creak while moving fast; a ratchet click per 15° turn; the ghost blips when it moves onto a new surface
  (the load, the camel, the sand).
- Drop: hands open with a whup; heavy items whistle a little as they fall.
- Landing (volume by kg × speed): wood (low knock), metal (inharmonic ring), cloth (low thump), ceramic (clink), rubber
  (squeak), brass (a honk for the tuba), straw (a tiny tick), and the rest.
- The camel: a grumble after each placement that rises with its mood; spine creaks that come faster and louder with strain;
  a snort when something falls.
- The needle: a spring boing when it swings far.
- The break: a crack, a slow-motion whoosh, the wooden clatter of the fold.
- Scores: a rising note per item delivered in a town; a flat thud for a round's end.
- Hourglass: ticks in the last 5 s, sharper in the last 3.
- Countdown: three drum hits, a brass call for "Load!". Win: a short brass fanfare.
- **Music**: a small sequencer, percussion first: a low frame-drum thump, a dry rim click, a shaker, a plucked bass in D
  dorian and a sparse two-note mallet motif every other bar (no scale borrowed as a desert cliché). 96 BPM on a fresh camel
  rising to 124 BPM at the top of the red, the shaker doubling its density past 60%; in menus and the lobby only bass and
  shaker, at half volume.

## Store art and the trailer

All drawn by the game's own renderer in poster mode (`?poster=<name>`, no SDK), with loads built by really dropping the
items with the game's physics.
- **Cover** (`thumb-1`, 1280×720): the camel under a tall load (rug, crate, suitcase, sofa, books, tuba, birdcage, teapot),
  sweating, knees bowed, eyes wide, against the huge sun; a player's hands lowering a single golden straw onto the top, with
  a warm glow around it; "The Last Straw" big once, over the sun on the left.
- **Action** (`thumb-2`): the collapse frozen mid-fold: X eyes, tongue out, the crack, splinters, the anvil in the air, sand
  flying.
- **Win** (`thumb-3`): the camel lying in front of the heap of junk at nightfall, the winner on the peak with the golden
  straw crown, straw confetti.
- **Multi** (`thumb-4`): six tags on the rope (players and animals, kg on each), the golden straw pointing at whose turn it
  is, that player's hands lowering a watermelon over the load.
- **Icon** (512×512): the camel's head side-eyeing, a golden straw in its mouth, on the sun disc. No text.
- **Badges**: a symbol on a palette-coloured disc with a brass rim: a crate, a golden straw, a straw set on a crate, the
  anvil, a tower, the crowned winner, a town gate with 6, a weight, a calendar page.
- **Trailer** (23 s), from real play captured with the autoplay: the goal in the first frame (a tall load, the needle, the
  pick between a teapot and an anvil, the anvil going up), the animals loading, the load slumping with the needle in the
  red, the last straw and its sign, the win on the heap, and the title screen to close.

## Originality check

It resembles stacking games: the board games where wooden animals are piled on a crocodile, falling-block tower races,
Jenga. What a player notices in the first minute that is different:
- the limit isn't only balance: the camel has a hidden breaking point you read on its face and on the dial;
- **you choose between two items and hand the other to the next player** (give them the anvil);
- weight is both your score and the danger: greedy early, careful late;
- the camel is a character who chews, sweats, side-eyes you and folds like a deckchair.

## Stack and files

Plain ES modules and Canvas 2D, no build (`"dir": "game"`). planck.js 1.5.1 (MIT) vendored as `game/vendor/planck.js`
with its license, imported by relative path so node tests use the same file.
- `game/items.js` item table and shapes; `game/physics.js` world from a snapshot, drop, step, strain, sway, verdict,
  keyframes; `game/rules.js` offers, turn order, scoring, thresholds, record checks, the daily board; `game/caravan.js`
  Caravan legs and towns; `game/bots.js` picks, placement search, carry paths; `game/rng.js` (all pure: no `window`,
  `document` or `onceworlds` at import).
- `game/net.js` the match over the room: `createMatch`/`createHost`/`createBots`, rpcs, the host's turns, keyframes,
  presence; `game/solo.js` local runs (Caravan, Daily, the attract mode) and the animals' auto hand; `game/main.js` boot,
  saves, input, the title and solo screens, drawing; `game/match-view.js` the room's screens.
- `game/scene.js` one frame from a scene description (the game and the posters); `game/render.js` sky, dunes, weighbridge,
  tray and shadows; `game/camel.js`; `game/art.js` items, hands, portraits; `game/ui.js` tags, dial, cart, signs, slabs;
  `game/fx.js`; `game/audio.js`; `game/poster.js` store art.
- Captures only (never in production): `?autoplay=1` plays this page's turns with the animals' brain (`autoplay=caravan` a
  Caravan run), and `&rounds=1` asks for a shorter match.
- Canvas at `ow.settings.pixelRatio(2)`, flat fills drawn every frame; physics only where it runs (host, the placer's
  prediction, solo, attract); audio suspends and solo runs pause on `visibilitychange`.

## Risks

- **Pages disagreeing about physics** (browser engines round some maths differently, and stacks are chaotic): one page
  simulates, everyone plays its keyframes; every turn restarts from the same quantised snapshot; the placer's prediction
  yields to the host's keyframes.
- **Unstable stacks or jitter** with thin and odd shapes: convex parts of at most 8 vertices, a straw at least 5 cm thick,
  10/6 iterations, sleeping, the straw a bullet body with heavy damping.
- **A round decided by luck**: the hidden limit is honest on the camel's face, the dial shows the band, and balance, impact
  and the draft are skill. The balance tests check that careful play wins.
- **Rounds too long or too short**: bot simulations measure placements per round; the band and the per-item strain are the
  knobs.
- **Phone fumbles**: Drop is a button, dragging is relative, the ghost shows the landing, the hover box keeps the item over
  the camel.
- **Phone performance**: flat fills, no blur, the host's settle simulation sliced at 6 ms a frame, the pixel ratio the
  platform's Graphics setting asks for.
- **Host in the background or leaving mid-settle**: the outcome is in `match.data` as soon as it is computed; a new host
  re-simulates only if `verdict` never arrived.
- **Tone**: the merchant is a cart and hands, the bots are animals, the music avoids desert clichés.
