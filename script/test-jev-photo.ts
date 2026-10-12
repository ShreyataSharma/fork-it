// Step 7 test for the photo-items job: runs Jev on a fixed list of photo detections (as Haiku
// would report them) and prints each decision with its probability. No Haiku or Spoonacular calls.
//   npx tsx script/test-jev-photo.ts
import {
  classifyFridgeItems,
  jevStats,
  PHOTO_HIDE_BELOW,
  PHOTO_IDENTITY_MIN_CONFIDENCE,
  PHOTO_INGREDIENT_MIN,
  resetJevStats,
  type FridgeItem,
} from "../server/jev";

const DETECTIONS: FridgeItem[] = [
  { name: "chicken breast", description: "two raw chicken breasts in a clear tray, Perdue label", alternatives: [] },
  { name: "greek yogurt", description: "white tub, label reads 'Fage Total 0%'", alternatives: [] },
  { name: "milk", description: "gallon jug, half full, door shelf", alternatives: [] },
  { name: "lime", description: "two small green citrus fruits in the door bin", alternatives: ["lemon"] },
  { name: "sour cream", description: "unlabeled white tub with a lid, top shelf", alternatives: ["plain yogurt", "cream cheese"] },
  { name: "salsa", description: "jar of red chunky sauce, label turned away", alternatives: ["marinara sauce", "tomato sauce"] },
  { name: "cilantro", description: "bunch of leafy green herbs standing in a cup of water", alternatives: ["parsley"] },
  { name: "spinach", description: "plastic clamshell of small dark leafy greens", alternatives: ["spring mix", "arugula"] },
  { name: "cheddar", description: "orange block of cheese, partly wrapped in plastic", alternatives: ["colby jack"] },
  { name: "leftovers", description: "foil-covered glass dish, contents not visible", alternatives: ["cooked rice", "lasagna"] },
  { name: "baking soda", description: "open orange box at the back of the shelf, Arm & Hammer", alternatives: [] },
  { name: "beer", description: "six-pack of brown bottles on the bottom shelf", alternatives: [] },
  { name: "water filter pitcher", description: "Brita pitcher full of water", alternatives: [] },
  { name: "ice pack", description: "blue gel pack in the freezer door", alternatives: [] },
  { name: "medication", description: "small orange pill bottle on the door shelf", alternatives: [] },
];

async function main() {
  console.log(
    `thresholds: hide below ${PHOTO_HIDE_BELOW}, select at ingredient >= ${PHOTO_INGREDIENT_MIN} ` +
      `and identity confidence >= ${PHOTO_IDENTITY_MIN_CONFIDENCE}\n`,
  );
  resetJevStats(true);
  const result = await classifyFridgeItems(DETECTIONS);

  for (const item of DETECTIONS) {
    const decisions = jevStats.decisions.filter((d) => d.subject === item.name);
    console.log(`${item.name}  (${item.description})`);
    for (const d of decisions) console.log(`    ${d.probability.toFixed(2)}  ${d.question} -> ${d.outcome}`);
  }

  console.log("\nreturned to the client:");
  for (const r of result) console.log(`  ${r.selected ? "[x]" : "[ ]"} ${r.name} (confidence ${r.confidence?.toFixed(2) ?? "null"})`);
  console.log(`\njev calls: ${jevStats.calls}, ${jevStats.failures} failed`);
  process.exit(jevStats.failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
