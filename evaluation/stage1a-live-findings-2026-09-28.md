# Stage 1A live culinary comparison — 2026-09-28

## Scope and reproducibility

This is the first live falsification pass, not a release gate or a claim of culinary reliability. The run completed 16 synthetic scenarios, each with three scripted user turns, across all three arms: 144 API responses, with zero recorded errors. No photos, voice, production customer data, or Stage 1B capability was tested.

Run ID: `2026-09-29T01-31-51-380Z` (UTC). The complete private, gitignored run is `runs/stage1a-live-2026-09-28/` in the canonical local checkout. It contains `results.json` (all outputs and per-turn measurements), `summary.json`, `blinded-review.md`, `context-fixtures.md`, and a separate `blinding-key.json`. Keep the key separate until a reviewer has scored the blind sheet. The API credential was checked for absence from the saved run files.

Frozen configuration: model `gpt-6-astra`; Responses API; reasoning effort `medium`; maximum output 4,096 tokens; `store:false`; behavior `stage1a-snap-v1`; context `stage1a-fixtures-v1`; scenarios `stage1a-scenarios-v1`; price card checked 2026-09-28. A used minimal food-help instructions. B added Snap's conversational behavior. C added the same behavior plus explicit synthetic customer context. All arms received the same scripted user turns. Earlier assistant replies differed naturally by arm.

## Measured results

| Arm | Responses | Input tokens | Output tokens | Median full-response latency | p95 full-response latency | Estimated API cost | Mean cost per three-turn case |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A — foundation reference | 48 | 23,939 | 24,030 | 14.2 s | 23.5 s | $1.4409 | $0.0901 |
| B — Snap behavior | 48 | 27,769 | 21,571 | 13.1 s | 25.3 s | $1.3562 | $0.0848 |
| C — Snap plus context | 48 | 29,815 | 20,010 | 10.9 s | 24.1 s | $1.2987 | $0.0812 |

Total estimated API cost was $4.0958. The sequential run took 33 minutes 13 seconds. These are provider-reported token counts and measured request-to-complete times; they are not time to first useful text. Cost is an estimate from the dated price card, not a vendor invoice, and excludes any usage from retried requests without a received usage record, hosting, images, and voice. Zero cached input tokens were reported. The differences between arms are observations from one run, not evidence that a prompt or context reliably reduces cost or latency.

## Blind-first qualitative findings

- **The model has a real open culinary range, but novelty is uneven.** In the repeated Argentine red shrimp rejection, A went from garlic-butter pasta to moqueca to a po'boy dinner; B moved to Turkish shrimp güveç; C reached a shrimp-and-chive dumpling dinner. B and C initially explored more directions than A in this case. Conversely, all three arms converged on harissa tofu with tahini after the wok case asked for a surprising alternative to soy-ginger. In the open-ended “no idea” case, the final alternatives were useful but repeatedly included familiar light dinners such as fish tacos. This is a shared breadth weakness, not clear evidence that Snap's instructions or context narrowed the foundation model.
- **Behavior and context did not visibly override the current user.** All arms accepted that the wok was unavailable and switched technique to a skillet. C used known equipment, household size, guest and taste facts where relevant, yet still changed direction when asked. In the Italian occasion, C anticipated the visiting vegetarian sister from context; after the user rejected homemade pasta, it did not force use of the known pasta machine. The small corpus cannot establish that context consistently improves taste or broadness; human scoring is needed.
- **The recovery behavior was calm and materially adaptive in the reviewed cases.** The cold-grill responses abandoned the original smoking timeline, used faster available equipment, qualified the 7 p.m. target, and kept a thermometer check. The missing-yogurt responses kept the chicken already cooking and substituted a quick tahini sauce. The burned-sauce responses avoided scraping the black layer into dinner. The oversalted-sauce responses diluted with unsalted tomatoes and kept the mild guest's portion separate.
- **The serious-allergy case handled the explicit uncertainty.** Each arm rejected the curry paste with an unreadable label and suggested a meal using ingredients the household could verify. This is one synthetic case, not a food-safety certification. The reviewer should still flag any questionable ingredient, temperature, handling, or timing advice in the full blind sheet.
- **Some responses are longer than a natural discovery turn needs.** Several first turns deliver a full recipe before the user has chosen a direction. That may be welcome for a clear cooking request but can make open exploration feel like reading a recipe article. Human preference matters here; the evaluation should favor a meal someone wants to make, not response length.

## Diagnosis and gate

**Provisional diagnosis: A — adequate culinary experience in this first synthetic pass.** The live outputs show broad, useful and adaptive planning, with no clear evidence that B or C degrades A. This is **not** a passed product gate: the owner has not scored the blinded conversations, no actual examples of the ChatGPT experience that inspired the product were supplied for a direct reference comparison, and there was only one model run per case. The scripted follow-ups also occasionally say “that direction” or “the more adventurous one,” which can mean different things across arms.

Latency is a material product risk. Full responses commonly took roughly 11–14 seconds at the median and about 24–25 seconds at p95; a real conversation needs streaming and time-to-first-useful-content measurement before the interaction can be judged. The text-only three-turn cost averaged about eight to nine cents per case; longer sessions, retries, image use, voice and backend costs remain unknown. These observations do not yet justify diagnosis D, and they do not establish a viable free-product unit economy.

For the owner's blind gate, score `blinded-review.md` using `evaluation/protocol.md` **before** opening `blinding-key.json` or `context-fixtures.md`. Supply a small, privacy-scrubbed set of the food-planning conversations that inspired Snap n Dish for a true reference check. If the first pass is promising to the owner, any expansion or Stage 1B requires the next explicit authorization. **Stop here.**
