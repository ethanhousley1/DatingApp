# Product decisions, options and ideas

The working record for building the Connections alpha. Every product choice lives
here with its status, so nothing decided in conversation gets lost, and nothing
rejected gets quietly re-decided.

**Status key**

| Tag | Meaning |
| --- | --- |
| **Decided** | Settled. Build it this way. |
| **Default** | A placeholder chosen so the build can move. Change it freely. |
| **Test** | More than one option is worth trying. Build so it can be switched. |
| **Idea** | Not in the alpha. Kept so it isn't lost. |
| **Open** | Needs an answer. Listed at the end. |

Last updated 2026-11-22.

> `PRODUCT.md`, `README.md` and the current prototype still describe "seven new
> conversations a week." That model is replaced by the 3-slot model below.

---

## 0. Pre-alpha (now)

A small, hand-picked group, used to work out how to make conversations feel organic
and genuine before the alpha opens.

| Rule | Status |
| --- | --- |
| **Hand-picked only.** Public sign-up is off. You add people one at a time (`web/scripts/invite.mjs`), from the waitlist or anyone you choose. Nobody else can get a sign-in link | Decided |
| **Anyone can be paired with anyone.** Gender preferences, city and the age rule are switched off (`app_settings.match_everyone`). People still fill in gender and who they're looking for, so the alpha rules can be switched back on | Decided |
| Testers are told on sign-up that anyone can be paired with anyone during the pre-alpha | Decided |
| Removing someone deletes their account, photos and conversations | Decided |
| The landing page waitlist collects interest; inviting someone marks them on the list | Decided |
| Everything else (3 slots, "+" bar, endings, ratings, reports, notes) works as described below | Decided |

**Turning the alpha rules back on:** set `match_everyone` to false in `app_settings`.

---

## 1. Alpha scope

| Area | Decision | Status |
| --- | --- | --- |
| Goal | A working prototype people can actually use, not a polished launch | Decided |
| Platform | Web app in the browser. Apple and Android apps come later | Decided |
| Location | One city | Decided |
| Notifications | Email | Decided |
| Matching algorithm | None yet. Anyone eligible can be paired with anyone eligible (see §3) | Decided |
| Ages | 18–35 | Decided |
| Profile | Fully visible from the start: photo, name, age, height. No reveal stages in the alpha (see §4) | Decided |

**MoSCoW for the alpha**

| Priority | Features |
| --- | --- |
| Must have | Sign-in, profile with photo, the 3-card home screen and the "+" bar, matching, chat, ending with a rating, "we took it off the app", report, email notifications |
| Should have | The reveal system (top priority after the alpha), the "open to more connections" toggle, pause matching |
| Could have | Fragments (conversation-starter questions on the profile) |
| Won't have (yet) | Matching algorithm, depth scoring, quality score affecting anything, app store apps |

## 1a. Main screen

Your conversations show as **cards**, up to 3 (more if you're in overflow). Under
them sits a **"+" bar** to find someone new. *Decided as the starting layout; no
prototype yet.*

Pairing only starts when you press "+". Matching is not something that happens to
you just because a slot is free. That way:
- someone who's happy with their current conversations isn't handed a new one, and
- the number of "+" presses is a useful signal in itself.

## 1b. Metrics to track from day one

| Metric | Why |
| --- | --- |
| "+" presses, and time from press to pairing | Demand for new people, and whether the pool is big enough |
| Conversations ended, and how (ended, ghosted, off the app, reported) | The core health of the product |
| Thumbs up/down and tags | Conversation quality |
| How often overflow is used, and how often "open to more connections" is on | Whether 3 slots is the right number |
| Messages per conversation, and time between replies | Groundwork for depth scoring and ghosting rules |

## 2. Tech stack

| Piece | Choice | Status |
| --- | --- | --- |
| App framework | Next.js (React) | Decided |
| Database, sign-in, live chat, photo storage | Supabase | Decided |
| Hosting | Vercel | Decided |
| Sign-in method | Emailed sign-in link, no passwords | Default |
| Mobile, later | React Native with Expo, using the same Supabase backend | Idea |

**Chat encryption.** Messages are encrypted in transit and at rest, and only the two
people in a conversation (plus admins) can read them. They are **not** end-to-end
encrypted, which would stop the app reading messages. Depth scoring, the quality
score and reviewing reports all need to read them. *Decided.*

*Options considered:* hosted chat services (Stream, Sendbird, CometChat, TalkJS) and
end-to-end encryption add-ons (Virgil E3Kit). Rejected for the alpha: a second
vendor, more cost, and encryption that blocks the core mechanic.

## 3. Slots and matching

| Rule | Status |
| --- | --- |
| You hold **3 conversations** at a time | Decided |
| To meet someone new, a slot has to free up: you end a conversation, or one is taken off the app | Decided |
| You ask for someone new with the **"+" bar**. From then on matching is automatic: you're in the pool, and the app pairs you at the next opportunity | Decided |
| You get an email when you're paired | Decided |
| **Overflow.** If you've pressed "+" and nobody else in the pool fits, you can be paired with someone who is already full, as their 4th (up to a 5th). That person can't press "+", but can be found | Decided |
| Full people only get overflow conversations if they've turned on **"I'm open to more connections"** | Decided |
| Overflow cap is **5** | Default |
| When several full people could take you, one is picked **at random** | Decided (alpha) |
| Overflow is tried after you've waited **24 hours** in the pool with no one found | Decided |
| **Pause matching** ("I don't want to match with anyone right now"): you aren't paired with anyone new, including as overflow. Exists so people pause instead of ghosting | Decided |
| **Age gap is set by the app, not chosen by the user.** The younger you are, the closer in age your match has to be (rule below) | Decided |

### Age rule

The app decides who is close enough in age, in keeping with the idea that pairing
should feel organic rather than like filtering on numbers. *Decided.*

**The formula (Default, tunable).** The allowed gap depends on the **younger** person's age:

```
allowed gap = 3 + 0.3 × (younger age − 18)   years
```

So a pair works when `older age − younger age ≤ allowed gap`. Because it's worked out
from the younger person, the rule gives the same answer for both people.

| Younger person | Allowed gap | Oldest match |
| --- | --- | --- |
| 18 | 3.0 | 21 |
| 20 | 3.6 | 23 |
| 22 | 4.2 | 26 |
| 25 | 5.1 | 30 |
| 28 | 6.0 | 34 |
| 30 | 6.6 | 35 (alpha age cap; 36 otherwise) |

The two numbers (a 3-year starting gap, plus 0.3 years per year of age) are settings.
When several people fit, a closer age can be preferred instead of a purely random pick.
*Idea.*

**Options considered**

| Option | How it works | Why not (for now) |
| --- | --- | --- |
| "Half your age plus 7" | The youngest acceptable partner is age ÷ 2 + 7 | It does narrow the gap for younger people, but it's very wide for a dating app: a 25-year-old could be paired with a 36-year-old, and a 30-year-old with a 46-year-old |
| User picks an age range | The usual approach on mainstream apps | Turns pairing back into filtering on numbers, which is what this app moves away from |
| Fixed gap for everyone | For example ±4 years | Too wide for 18-year-olds, too narrow later on |
| Unmatching is **permanent**. Two people are never paired again | Decided |
| Eligible pair (alpha): both are in the city, each one's gender fits what the other is looking for, they've never been paired before, and neither has blocked or reported the other | Default |
| In the alpha, the slot count may be raised (+1 or +2) if there aren't enough people | Decided |

*Ideas for choosing an overflow partner later:* whoever has waited longest, whoever
has the most room, or whoever has the highest quality score.

## 4. The reveal (top priority after the alpha)

**In the alpha there are no reveal stages.** The whole profile (photo, name, age,
height) is visible from the start. *Decided.*

Revealing is still the core idea of the product, so it's the **top-priority feature
after the alpha** (MoSCoW: should have). What gets revealed is **more photos**: you
see one photo from the start, and more open as the conversation deepens. *Decided,
built after the alpha.* This means profiles hold several photos from the start, even
though the alpha only shows the first.

When it's built, the planned design is stages, *Just started → Getting somewhere →
Real now → Unlocked*, that always open for both people at once.

**What moves a conversation to the next stage.** To be built so the rule can be
switched per conversation, for A/B tests.

| Option | How it works | Status |
| --- | --- | --- |
| **A. After N messages** | Both people have sent at least N messages since the last stage. N is a setting | **Default (first to build)** |
| **B. Both tap "reveal more"** | Either person can ask, and it only happens when both have asked. Fits the "mutual" rule, and shows when people *want* to reveal | **Test** |
| C. Admin moves it by hand | For demos and debugging | Idea |
| D. Depth scoring | Two-sided questions and answers count, sheer volume doesn't. The real version, built later | Idea |
| E. Thresholds tied to quality score | Good conversationalists reach reveals sooner | Idea |

**Photo timing.**

| Variant | Status |
| --- | --- |
| **Photo visible from the start** | **Decided for the alpha** |
| More photos revealed as the conversation deepens | **Decided, next after the alpha** |
| Photo hidden, revealed at a later stage | **Test** |
| Photo partly visible in early stages (blurred or cropped) | Idea |

Whichever variant is running, anything not yet revealed must not be sent to the
other person's browser at all. Hiding it with CSS is not enough.

## 5. Ending a conversation

| Way out | What happens | Status |
| --- | --- | --- |
| **End it** | The other person sees "This conversation ended." Both rate it. The slot frees up | Decided |
| **"They ghosted"** | Same as ending, flagged as ghosting. Hurts the ghoster's quality score | Decided |
| Ghosting can be claimed after | **2 days** without a reply. To be tuned with real data | Default |
| **"We took it off the app"** | Both people press it. Big quality boost for both. The conversation is archived and both get the slot back | Decided |
| **Report** | Sends the conversation to support, and the two are never paired again | Decided |

**Rating.** Thumbs up or down, plus optional tags: *ghosted*, *especially good*,
*report*. The other person never sees it. *Decided.*

**Ending a lot hurts your quality score heavily**, so people can't burn through
conversations shopping for someone. *Decided.*

*Ideas for "taking it off the app":* an in-app card to swap a phone number or
Instagram, a suggested first-date idea, or a check-in a week later ("Did you meet?").

## 6. Data retention

| Data | Rule | Status |
| --- | --- | --- |
| Messages in a closed conversation | Kept for **30 days**, then deleted | Default |
| Messages in a reported conversation | Kept until the report is resolved | Decided |
| The fact that two people were paired (who, when, rating, how it ended) | Kept permanently, without messages. This is how "never again" works | Decided |
| Conversations taken off the app | Archived | Decided |

## 7. Profile

| Field | Status |
| --- | --- |
| Name | Decided |
| Photo, required at sign-up | Decided |
| Age, 18–35 for the alpha, confirmed at sign-up | Decided |
| Height | Decided |
| Your gender: man, woman, other | Decided |
| Who you're looking for: men, women, other (pick any) | Decided |
| **Private notes**: an open text field in each conversation where you keep notes about the other person. Only you see them | Decided |

*Idea:* public notes, an open text field on your profile that the other person reads.

**Fragments (MoSCoW: could have).** Organic conversation starters. These are questions
built to start a real conversation, more interesting than Hinge prompts. You answer a
batch when you join, with a few more each day, and the answers show up at random on
your profile as it opens up. *Idea, not in the first build.*

## 8. Safety and support

| Item | Status |
| --- | --- |
| Report button in every conversation | Decided |
| "Contact us" link that emails the team | Decided |
| Reports go to a list that only admins can see | Decided |
| A photo check before meeting | Idea |

## 9. Quality score

Private, never shown publicly. *Decided.*

| Moves it up | Moves it down |
| --- | --- |
| Taking it off the app (big) | Ghosting (flagged by the other person) |
| Thumbs up, "especially good" | Ending a lot of conversations |
| | Thumbs down, being reported |

Exact weights: *Open*, to be set with real data. In the alpha the score is recorded
but doesn't change anything yet. *Default.*

## 10. Idea box

### Making conversations feel organic and genuine (the pre-alpha's focus)

From the original design brief (`design-prompt.md`) and `PRODUCT.md`:
- **Icebreakers** for when you don't know how to start, and for when a conversation stalls. Curious and specific, never cheesy: a way into a conversation, not decoration on a profile.
- **In-conversation games** that get people talking rather than performing: two-truths variants, would-you-rather, guess-the-answer.
- **Ideas for meeting in person**: low-pressure first meetings that aren't drinks at a bar, offered once both people are ready.
- **A calm chat**: uncluttered, no read receipts, no pressure timers. The alpha already has neither.
- **Rewarding asking back**: two-sided questions count, sheer message volume doesn't. From the original prototype ("Two-sided questions move this. Message count doesn't.").

New:
- **A shared opening question.** Each conversation starts with one question both people answer, and neither sees the other's answer until both have replied. This replaces the blank first message and puts both people on equal footing.
- **A nudge when things stall.** After a quiet stretch, the person whose turn it is privately sees an icebreaker suggestion. The other person never sees it.

### Other ideas

- **High priority: the reveal system**, with more photos opening as the conversation deepens (see §4)
- Preferring closer ages when several people fit the age rule
- Photo hidden at first and revealed later, as an A/B test (see §4)
- Public notes, a profile text field the other person reads
- Choosing overflow partners by longest wait, most room, or quality score, instead of at random
- Daily prompt pairing: everyone answers the same daily question, and you're paired with someone whose answer stood out
- Voice notes as a reveal stage between text and photo
- Depth scoring that rewards two-sided questions, not message volume
- Quality score lowering reveal thresholds, and pairing good conversationalists with each other
- A photo check before meeting

**Rejected, kept for the record**

- Earned currency ("keys") spent to reveal: too transactional
- A public reputation score: the opposite of the point

## 11. Open questions

1. **Age rule numbers:** are a 3-year starting gap and 0.3 years per year of age right? To be checked against real pairings.

**Deferred on purpose** (not needed for the alpha, but important later)

- **Quality score weights:** how much each signal counts. The alpha records the signals (ratings, how conversations end) so there's data to set them with.
- **Photos per profile and per reveal stage:** how many photos a profile holds and how many open at each stage. The alpha lets people upload up to 6 and shows the first.
