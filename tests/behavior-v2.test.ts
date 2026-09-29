import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BEHAVIOR_VERSION, CANDIDATE_BEHAVIOR_VERSION, instructionsFor, instructionsForCandidate } from "../src/config.ts";

test("candidate is separately versioned and leaves deployed v1 and Foundation A callable", () => {
  assert.equal(BEHAVIOR_VERSION,"stage1a-snap-v1");
  assert.equal(CANDIDATE_BEHAVIOR_VERSION,"stage1a-snap-v2");
  assert.equal(instructionsFor("A",""),"Help the user decide what to cook and how to prepare it. Be useful and accurate.");
  const v1=instructionsFor("C","No saved customer facts provided yet.");
  const v2=instructionsForCandidate("");
  assert.ok(v1.includes("No saved customer facts provided yet."));
  assert.ok(v2.includes("No saved customer facts provided yet."));
  assert.ok(!v1.includes("next decision or action"));
  assert.ok(v2.includes("next decision or action"));
  assert.ok(v2.includes("does not require using that equipment"));
});

test("focused evaluation includes absent-context, explicit-context, selection, ambiguity, recovery and change controls", () => {
  const cards=JSON.parse(readFileSync(new URL("../evaluation/behavior-v2-cases.json",import.meta.url),"utf8")) as Array<{id:string;context:string;history:unknown[];followUp?:string}>;
  const ids=new Set(cards.map(c=>c.id));
  for(const id of ["pork-original-empty","pork-paraphrase-a","pork-paraphrase-b","pork-context","chicken-thighs","frozen-shrimp","blackstone-tonight","italian","family-brunch","no-idea","direct-question","recovery-burned","recovery-missing","clear-selection","indexed-selection","reference-selection","ambiguous-reference","delegated-choice","repeated-rejection","direction-change","allergy-context","gold-two-turn"])
    assert.ok(ids.has(id),`Missing ${id}`);
  assert.equal(cards.find(c=>c.id==="pork-original-empty")?.context,"");
  assert.ok(cards.find(c=>c.id==="pork-context")?.context);
  assert.ok(cards.find(c=>c.id==="clear-selection")?.history.length);
  assert.ok(cards.find(c=>c.id==="gold-two-turn")?.followUp);
});
