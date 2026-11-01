# The Last Straw: teardown and rebuild plan

Played the `main` build headless (a 4-seat match with the autoplay, 20 s captured at 1280×720, every frame read at full
size), next to the store posters and the old trailer. The posters flatter it; play does not.

## Teardown: what is wrong

### Looks cheap
1. **The sky is nine flat stripes.** No gradient, no light, no air. It reads as a vector template, not a place.
2. **The sun is a flat disc with a see-through ring.** Nothing glows, nothing is backlit, nothing casts light.
3. **The world is empty.** Three flat dune silhouettes and sand with a few dashes. No set dressing, nothing alive in the
   distance (no birds, no other caravan, no wind), no foreground. Every frame of the match is the same picture.
4. **The camel, the star, is clip art.** Stick legs with tiny joints, a bean body, a fixed pose; it fills a third of the
   screen height. It chews and its knees bow a few pixels, and that is all.
5. **Items are tiny and flat.** A 4 kg pile of books is 50 px wide. Iron, wood, cloth and glass are all the same two-tone
   fill; nothing reads as heavy or fragile.
6. **The HUD is web cards.** White rounded cards on a dashed line, a huge plain gauge on a pole (15% of the screen), white
   text boxes for signs, a "15" next to a small hourglass. Generic.
7. **The hands are two flat rectangles** dropping from the top of the screen.

### Moves stiffly
8. Nothing anticipates or follows through. The camel does not breathe, shift its feet, look at what is coming, flinch,
   grunt or stagger. A landing is a 3 px squash.
9. Things pop: the cart's items appear, a pick jumps straight into the hands, the "+kg" is the only motion in the HUD.
10. The camera never moves: no punch-in on a heavy landing, no lean into danger, no slow push in the red.
11. Landings get a small puff; no hit-stop, no impact flash, no sparks off iron or splinters off wood, no debris that
    belongs to the item.

### Feels slow
12. **Dead air.** In 20 s of a 4-seat match only three items were placed. Animals hover their item 3-4 s before letting
    go, and each turn ends with ~2 s of nothing. Between two of my turns I wait about 30 s doing nothing.
13. Solo settles draw the newest physics step without interpolation (judder on 120 Hz screens).

### Reads unclear
14. The dial is the only strain read that people look at; the camel's face (the real tell) is 20 px tall.
15. The cart and its weight tags sit in a corner; the pick is the most important decision and it is the smallest thing.

### Boring after one round / no reason to come back
16. **Every round is the same round**: same camel, same 18 items, same sunset. Nothing new is introduced after minute one.
17. **Score = kg, nothing else.** A clean, careful, low set-down earns the same as a sloppy one. No streaks, no style, no
    combo, no risk you choose to take beyond the pick.
18. **Caravan has no decisions.** Fixed loads per leg, the walk, the town, repeat; one mistake ends it. No reason to push.
19. **Progression is six sleeve patterns** behind milestones. No levels, nothing to collect, no daily goals, no streak,
    no "one more run" hook, results that last a second.
20. **Sound is synthesized blips.** Wood, iron and cloth landings sound alike; the music is a thin loop.

### What the best of the genre do that this doesn't
- *Tricky Towers*: rich lit scenes, a character reacting to every piece, spells that change each round, a ladder.
- *Dobutsu Tower Battle*: dead simple rules, but each piece is a character and every wobble is a laugh; ranked play.
- *Alto's Odyssey*: the desert as layered light, haze and life; the same dunes never look the same twice.
- Roguelites (*Balatro*, *Slay the Spire*): a run you build with choices, a push-your-luck cash-in, a daily seed.

## The rebuild

Keep: the pitch, the pick-one-hand-on-the-other draft, the hidden breaking point read on the camel's face, planck
physics and the host-runs-the-physics netcode, the animals as bots. Everything you see and hear is redone, and the game
gets a loop worth repeating.

### Art direction: "Golden hour at the weigh station"
- A painted, lit desert instead of flat bands: graded sky, a sun that glows and blooms, god rays, long clouds lit from
  below, atmospheric haze between mesas and three dune ranges with sunlit crests, a far caravan walking the ridge,
  vultures circling, wind-blown sand, a market awning and set dressing at the station, dark foreground framing, film
  grain and a vignette. Time of day moves round by round: gold, dusk, night with lanterns.
- Every stop looks different: the dune market, an oasis, a red canyon, salt flats, ruins, the night market.
- One light everywhere: warm rim light on the sun side, violet shade opposite, soft contact shadows under items and feet.

### The camel: a character with a rig
- Rebuilt with a 2D skeleton: two-bone legs with planted feet, a spline neck, a head with heavy lids, lashes, a split
  floppy lip, ears and a tail on springs. Breathing, chewing cud, blinking, ear flicks, a head that tracks the item in
  your hands, side-eye at whoever placed last.
- It acts the strain: bored, uneasy, sweating, alarmed; knees buckle and shake, it shifts its feet, grunts on a landing
  (squash with follow-through), and folds into the kneeling camel pose on a break, stars circling. Gets up hind legs first.
  Walks with a real pacing gait.

### Items, hands, HUD
- Every item redrawn with material: grain, metal sheen, enamel highlights, fabric; contact shadows; landing squash.
- New items with a mechanic each: the **vase** (fragile: a hard landing smashes it), the **cat** (walks along the load
  after it lands, then curls up), the **hay bale** (a good wide base).
- Gloved hands with sleeves; picks fly from the cart into the hands; hands open and rise away.
- Luggage tags that swing and stamp their kg, a brass dial with glass and a straw needle, a cart that rolls in, a glass
  hourglass with running sand, painted wooden signs, buttons that press.

### Juice and feel
- Hit-stop on heavy landings, directional shake, dust, splinters, sparks, feathers and straw bits by material, impact
  rings, the camera leaning in on a landing and pushing in when the camel is in the red, slow motion on the break.
- Animals act in ~1-2 s, not 4; no dead air between turns; interpolated rendering.
- Recorded CC0 impact, cloth, metal, coin and UI sounds; a layered music loop that builds with the strain.

### Depth
- **Soft landing**: setting an item down gently (low, slow) is shown and rewarded ("Soft +1"), and soft landings in a row
  build a streak. Mastery you can see every turn.
- **Round twists** in matches from round 2: Gusty (wind pushes the load), Wobbly (the camel fidgets), Heavy cart, Night
  market (double kg). Round 20 is not round 1.
- **Caravan becomes a run you build**: load as much as you dare, then **Set off**; the payout multiplies with every load
  and doubles if you leave with the camel sweating. Three breaks and the camel quits. At each town pick one of three
  **perks** (strong knees, wide saddle, grippy straps, steady gait, haggler, heavy hitter...). Push your luck, read the
  camel, build a run.

### Reasons to come back
- **Levels** from every kg that holds, every town and every win, each level unlocking something you see: camel coats,
  saddle blankets, hats, sleeves and gloves, chosen in **the Stable**.
- **Daily cart** (same run for everyone, today's board) and **three daily goals** with a streak.
- New items join the cart as you level; badges for the new mechanics.

### Order of work
1. Backdrop, light and post. 2. The camel rig. 3. Items and hands. 4. HUD. 5. Juice and camera. 6. Sound.
7. Caravan run, perks, twists, new items. 8. Levels, Stable, daily goals. 9. Pace, bots, balance tests.
10. Posters, trailer, docs.
