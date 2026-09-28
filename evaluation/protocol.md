# Stage 1A evaluation protocol

This initial 16-scenario corpus is a **falsification pass**, not a proof of culinary reliability. All scenarios are synthetic. Each arm gets identical user turns, model and reasoning settings. The only independent variables are instructions and explicit context. Earlier assistant replies necessarily differ by arm, which is part of the multi-turn behavior being tested.

Before a live run, the project owner should supply a small set of examples from the ChatGPT food-planning experience that inspired Snap n Dish, with private details removed. Recreate relevant explicit preferences for a fair comparison; the API has no access to hidden ChatGPT memories or settings. Keep owner reference conversations separate from prompt-tuning cases.

Score the generated `blinded-review.md` before opening `blinding-key.json`. For each arm and full conversation, score 1–5 on:

1. Useful, appealing culinary options and execution advice.
2. Meaningful breadth, especially after a rejection.
3. Natural curiosity: useful questions, including no question when appropriate.
4. Adaptation to changed constraints and what already happened.
5. Complete-meal or occasion thinking where relevant.

Note material errors separately: ignored allergy, impossible timing stated as certain, invented completed action, missing required ingredient, unsuitable equipment, failure to acknowledge a correction, or unsafe holding. A high average does not excuse a serious safety failure. Assess personalization separately after reading the context fixture. Favor a meal a person would want to cook, not a longer or more exotic answer.

The first pass should diagnose whether the foundation model itself disappoints, Snap's behavior prompt narrows it, or context improves or harms it. If promising, expand toward roughly 100 scenario cards with held-out cases and at least 20 substantial multi-turn conversations. Obtain culinary review and cook a small representative set before claiming usable meal guidance. These are human decisions; the CLI does not fabricate ratings.

Run metrics capture full-response latency, provider-reported token counts, estimated cost, errors and configuration versions. The cost estimate does not include retried calls whose usage was not received, hosting or taxes. `store:false` limits provider-side application storage behavior but does not imply zero vendor retention. No real customer photos, voice, private profiles or production data belong in this Stage 1A corpus.

Only if Stage 1A is promising should an explicitly authorized Stage 1B examine real images, realtime spoken conversation, minimal durable state and cross-device continuity.
