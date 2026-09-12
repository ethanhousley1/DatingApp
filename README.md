# Connections

A blind texting app. You get seven conversations a week, each one starting with no photo and no bio. The other person's profile unlocks only as the two of you actually get to know each other.

**Live prototype:** https://dating-app-nine-chi.vercel.app
**Repo:** https://github.com/ethanhousley1/DatingApp

---

## 1. Concept

| | |
| --- | --- |
| **Need** | Meeting someone new means being judged on a photo before anyone hears a word, so people who are better in conversation than in pictures get filtered out before they can say anything. |
| **Persona** | Has deleted at least one dating app, goes weeks at a time without meeting anyone new, and would rather open a text thread than walk up to a stranger. |
| **Capability** | Hold a real conversation with a matched stranger before seeing their photo. |
| **Value** | **Being known.** After a stretch on dating apps you feel processed, not known — sorted by a face into yes or no. Here the first thing anyone learns about you is how you actually talk. |

The affordance sentence, and the dominant thing a first-time visitor meets:

> **Connections pairs you with seven people a week. Every conversation starts blind — no photo, no bio. Their profile unlocks only as the two of you actually get to know each other.**

## 2. The three screens

| Screen | Its one job | Why it earned the slot | Design question it tests |
| --- | --- | --- | --- |
| **Landing** (`index.html`) | Signal the capability and the value before anything is read | It is the only screen a first-time user is guaranteed to see, and the whole idea fails if "you talk before you see them" doesn't land in five seconds | Does the value read pre-attentively, or does it need the paragraph? |
| **A conversation** (`conversation.html`) | Let you *do* the capability | The capability is a conversation, so the only honest demonstration is a conversation you can drive. Send replies and the profile resolves in front of you | Does the interaction teach the rule — asking back unlocks, volume doesn't — without the caption? |
| **Your week** (`your-week.html`) | Show the arc across people, and the scarcity that makes it work | One conversation can't show that you only get seven, or that different people sit at different depths at once. Seven cards at seven states show the whole system in one view | Does seven feel like enough, or like a restriction? |

Navigation back to the landing screen is in the nav logo and the footer on all three screens.

## 3. Design question plan

Questions worded as I would actually say them, with predictions and what each rests on. **No findings yet.**

| Group | Question | Prediction | Rests on |
| --- | --- | --- | --- |
| Capability | *"I'm going to show you this for five seconds, then take it away. What does this app do?"* | They say "you text someone before seeing their picture." They get the blind part; I predict they **miss the seven-a-week limit**, since it's inside the sentence rather than shown | Landing hero, `index.html` |
| Capability | *"Click around on this and tell me what you think it's for."* | They click a suggested reply on the conversation screen, see the photo sharpen, and say it out loud unprompted. This is the moment I'm most confident in | Reply chips + depth meter, `conversation.html` |
| Need | *"Tell me about the last time you tried a dating app. What actually happened?"* | Downloaded it, swiped a few days, a couple of dead conversations, deleted it inside two weeks. I expect "waste of time" more than "I didn't match" | Nothing — this one is deliberately about them, not the prototype |
| Need | *"What makes you give up and close the app?"* | Dead threads and one-word replies, not rejection. If they say rejection instead, the blind premise is solving a problem they don't have | The premise itself |
| Value | *"If this worked exactly as advertised, what would you get out of it? One or two words."* | Something near "actually being known" or "a fair shot." If they say "it's fun" or "less shallow," I've built novelty, not value | Landing hero + reveal on `conversation.html` |
| Persona | *"How often do you meet someone new that you'd want to date, and what are you usually doing when it happens?"* | Rarely, and almost always through friends or work. Confirms the gap between "won't use apps" and "can't meet people in person" | Nothing — qualifies the persona |
| Value / trust | *"What would have to be true for you to use this instead of what you do now?"* | They ask what stops people lying, or what happens if the photo is a letdown after four days. I predict this is the **top objection** and the prototype has no answer for it | Gap in current build |

## 4. Design justification and first read

Opening the live URL as if for the first time:

**Does the landing screen signal the capability and value at first glance?** Mostly. The headline and the affordance sentence sit in the strongest position and the hero image carries the idea without words — a blurred card and a clear card side by side, labelled *Message 1* and *Message 40*. Similarity makes them read as the same kind of object, so the difference between them reads as change over time rather than two different people. The part that does **not** survive a five-second read is "seven a week." It's bolded inside a sentence, which is a text-level fix for a pre-attentive problem.

**Does everything on the landing screen earn its place?** Close. The three research stats are the weakest element — they're supporting evidence for why the product exists, not a signal of what it does, and they sit above pricing where attention is still worth something. They stay for now because the assignment asks the market gap to be visible, but if this were competing purely on comprehension I'd cut them.

**Grouping, by principle:**
- *Common region* — every conversation on **Your week** is a bordered card, so seven separate people read as seven separate things rather than one list.
- *Proximity* — on **A conversation**, the depth meter, the photo, and the bio fragments sit in one panel with no internal dividers, because they are all answers to "what have I earned?" The thread is a separate panel. Two panels, two questions.
- *Similarity* — the four reveal steps on the landing screen are identical cards differing only in blur, so blur is read as the variable. Nothing else changes to compete with it.
- *Figure/ground* — blurred profile art is deliberately low-contrast ground; text and the depth bar are figure. The thing you can't have yet recedes.
- *Continuity* — the depth bar, the step cards, and the week's seven-segment strip all run left-to-right as progress, so the same visual grammar means the same thing on all three screens.

**Do screens 2 and 3 stay on mission?** Yes. Neither has a settings page, a login, or a feature list. Both end in a link to the other, and the nav logo plus footer return home from anywhere.

### What the AI got wrong, and what changed

**Before:** [`045f2a1`](https://github.com/ethanhousley1/DatingApp/commit/045f2a1) — the original three screens were Landing, *Why we're different*, and *Features*.

| | Before | After |
| --- | --- | --- |
| Landing | ![before](docs/before-landing.png) | ![after](docs/after-landing.png) |
| Screen 3 | ![before](docs/before-screen3.png) | ![after](docs/after-screen3.png) |

**The problem, named:** screens 2 and 3 *described* the product instead of demonstrating it. *Why we're different* was a market-research page — stat cards and a bar chart arguing that dating apps are declining. *Features* was a marketing feature list. Neither let a user perform the capability, so a five-second test on either would have measured whether my copy is persuasive, not whether the concept is legible. The capability was never on screen.

**The change:** both were replaced with product screens. *A conversation* is now interactive — you pick replies, a depth meter fills, and the photo resolves from `blur(22px)` to `blur(0)` in four stages. *Your week* shows seven conversations at seven different depths at once. Motivated by design question 2: *does the interaction teach the rule without the caption?* You cannot answer that on a page that has no interaction.

**Three smaller revisions, each for a stated reason:**

1. **The hero was a tagline, not an affordance.** It read "Talk first. See them later." — evocative, but it never said what you do or how often. Replaced with a headline plus an explicit affordance sentence naming the pairing, the blind start, and the unlock condition.
2. **The revenue chart drew declines as upward bars.** Bumble (−9.5%) and Tinder (−5.2%) were rendered as short bars rising from a baseline next to Hinge's +25%, so the encoding said "everyone grew, Hinge grew most" while the labels said the opposite. Fixed with a zero baseline and the declines below it before the page was later cut entirely.
3. **The waitlist button did nothing.** `preventDefault()` with no feedback, which would have killed design question 3 — you cannot ask "what do you expect will happen" about a control that does nothing. It now confirms inline.

### Known gaps, carried forward

- **Seven-a-week doesn't survive a five-second read.** It needs to be shown, not written.
- **No answer to the honesty objection** I predict in question 7 — nothing addresses what stops someone misrepresenting themselves, or what happens when the reveal disappoints.
- **Both conversations are scripted.** Replies are pre-written, so the prototype demonstrates the mechanic but not the experience of composing something real.

## 5. Repo contents

| Path | What it is |
| --- | --- |
| `index.html` | Screen 1 — landing |
| `conversation.html` | Screen 2 — the blind conversation, interactive |
| `your-week.html` | Screen 3 — the weekly seven |
| `PRODUCT.md` | Product spec behind the prototype |
| `design-prompt.md` | The brief given to the AI agent |
| `docs/` | Before/after screenshots |

Plain static HTML and vanilla JS. No build step, no dependencies. Vercel serves the repo root.
