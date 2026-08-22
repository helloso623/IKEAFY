import type { BuildPlan, Material } from "@/lib/types";
import { retailerLinks } from "@/lib/retailers";

const SPARE_PARTS_HINT =
  "IKEA ships replacement fittings free — note the part number from your instruction booklet, or bring a photo of the damaged part to the store.";

export const SAMPLE_PRODUCTS: { name: string; blurb: string }[] = [
  { name: "LACK Side Table", blurb: "Four legs, one top — a five-minute build." },
  { name: "BILLY Bookcase", blurb: "Classic shelf unit; remember to anchor it." },
  { name: "KALLAX Shelf Unit", blurb: "2x2 cube storage that doubles as a divider." },
];

function includedMaterial(name: string, quantity: number, note?: string): Material {
  return { name, quantity, badge: "included", note, retailers: retailerLinks(name) };
}

function purchaseMaterial(name: string, quantity: number, note?: string): Material {
  return { name, quantity, badge: "purchase", note, retailers: retailerLinks(name) };
}

const SAMPLE_PLANS: BuildPlan[] = [
  {
    title: "LACK Side Table",
    sourceType: "product",
    sourceValue: "LACK Side Table",
    origin: "sample",
    steps: [
      {
        number: 1,
        title: "Screw in the four legs",
        action:
          "Turn the tabletop upside down on a soft surface. Screw each of the four legs clockwise into the pre-drilled threaded corners until hand-tight.",
        parts: ["Tabletop", "Leg"],
        tools: [],
        note: "The legs thread directly into the corners — no extra hardware is needed.",
      },
      {
        number: 2,
        title: "Tighten and check for wobble",
        action:
          "Firmly hand-tighten each leg, then press down on each corner to confirm the frame sits square and none of the legs are cross-threaded.",
        parts: ["Leg"],
        tools: [],
      },
      {
        number: 3,
        title: "Flip the table upright",
        action:
          "Turn the table over onto its legs and set it on a level floor. Rock it gently to verify all four legs make even contact.",
        parts: ["Tabletop", "Leg"],
        tools: [],
        note: "If it rocks, back one leg off a quarter turn to level it.",
      },
    ],
    materials: [
      purchaseMaterial("LACK tabletop", 1, "Hollow-core top with pre-threaded corners."),
      purchaseMaterial("LACK leg", 4, "Screw-in legs sold with the table."),
    ],
    tools: [],
    difficulties: [
      "Cross-threading a leg if it is started at an angle — begin each by hand.",
      "The hollow-core top dents easily, so keep it on a blanket while working.",
    ],
    sparePartsHint: SPARE_PARTS_HINT,
  },
  {
    title: "BILLY Bookcase",
    sourceType: "product",
    sourceValue: "BILLY Bookcase",
    origin: "sample",
    steps: [
      {
        number: 1,
        title: "Insert the dowels into the side panels",
        action:
          "Lay both side panels inside-face up and tap a wooden dowel into each pre-drilled dowel hole along the top and bottom edges.",
        parts: ["Side panel", "Wooden dowel"],
        tools: ["Mallet"],
        note: "Dowels should sit about halfway in so the boards line up cleanly.",
      },
      {
        number: 2,
        title: "Attach the top and bottom panels",
        action:
          "Fit the top and bottom panels onto the dowels of one side panel, then lower the second side panel onto the exposed dowels to form the rectangular frame.",
        parts: ["Side panel", "Top panel", "Bottom panel", "Wooden dowel"],
        tools: [],
      },
      {
        number: 3,
        title: "Lock the frame with cam locks",
        action:
          "Drop a cam bolt into each joint, seat the cam-lock disc into its recess, and turn each disc clockwise with a Phillips screwdriver until the panels draw tight.",
        parts: ["Cam lock", "Cam bolt"],
        tools: ["Phillips screwdriver"],
        note: "Snug, not overtightened — cam discs strip if forced past their stop.",
      },
      {
        number: 4,
        title: "Stand the bookcase upright",
        action:
          "With help, tip the assembled frame up onto its base and position it near its final wall location before adding the back.",
        parts: ["Side panel", "Top panel", "Bottom panel"],
        tools: [],
      },
      {
        number: 5,
        title: "Nail on the back panel",
        action:
          "Square the frame, lay the hardboard back panel over the rear, and secure it with the supplied panel nails every few inches around the perimeter.",
        parts: ["Back panel", "Panel nail"],
        tools: ["Mallet"],
        note: "Nailing the back on is what keeps the case square — check corners first.",
      },
      {
        number: 6,
        title: "Add shelf pegs and adjustable shelves",
        action:
          "Push metal shelf pegs into the holes at your chosen heights, then rest each adjustable shelf on its four pegs.",
        parts: ["Shelf peg", "Adjustable shelf"],
        tools: [],
      },
    ],
    materials: [
      purchaseMaterial("BILLY side panel", 2, "Tall vertical panels with dowel and shelf-peg holes."),
      purchaseMaterial("BILLY top panel", 1),
      purchaseMaterial("BILLY bottom panel", 1),
      purchaseMaterial("BILLY adjustable shelf", 3),
      purchaseMaterial("Hardboard back panel", 1, "Thin back that squares the whole unit."),
      includedMaterial("Wooden dowel", 8),
      includedMaterial("Cam lock", 8),
      includedMaterial("Cam bolt", 8),
      includedMaterial("Metal shelf peg", 12),
      includedMaterial("Panel nail", 20),
      includedMaterial("Wall-anchor bracket", 1, "Tip-over restraint — install before loading shelves."),
    ],
    tools: ["Phillips screwdriver", "Mallet"],
    difficulties: [
      "The thin hardboard back bows easily; keep the frame square while nailing so it lies flat.",
      "This is a tall, top-heavy unit — you must wall-anchor it with the supplied bracket to prevent tip-over.",
      "Cam locks strip if overtightened; stop as soon as the panels pull flush.",
    ],
    sparePartsHint: SPARE_PARTS_HINT,
  },
  {
    title: "KALLAX Shelf Unit",
    sourceType: "product",
    sourceValue: "KALLAX Shelf Unit",
    origin: "sample",
    steps: [
      {
        number: 1,
        title: "Tap dowels into the outer panels",
        action:
          "Lay the two long outer panels inside-face up and tap a wooden dowel into every pre-drilled hole along their edges.",
        parts: ["Outer panel", "Wooden dowel"],
        tools: ["Mallet"],
      },
      {
        number: 2,
        title: "Assemble the outer frame",
        action:
          "Join the top and bottom panels to one outer panel over the dowels, then add the second outer panel to close the square frame.",
        parts: ["Outer panel", "Top panel", "Bottom panel", "Wooden dowel"],
        tools: [],
        note: "Keep the frame flat on the floor so the dowels seat fully.",
      },
      {
        number: 3,
        title: "Insert the cross dividers",
        action:
          "Slide the horizontal and vertical dividers into their slots to form the four-cube grid, aligning each divider's dowels with the frame holes.",
        parts: ["Divider panel", "Wooden dowel"],
        tools: [],
      },
      {
        number: 4,
        title: "Tap the joints together with a mallet",
        action:
          "Gently tap along each seam with the mallet to close the joints, then drive the cam locks with a Phillips screwdriver to draw the frame tight.",
        parts: ["Divider panel", "Cam lock", "Cam bolt"],
        tools: ["Mallet", "Phillips screwdriver"],
        note: "Protect the surface with a scrap of cardboard when tapping.",
      },
      {
        number: 5,
        title: "Stand upright and wall-anchor",
        action:
          "Raise the unit into position and fasten the supplied tip-over restraint from the back of the unit into a wall stud.",
        parts: ["Wall-anchor bracket"],
        tools: ["Phillips screwdriver"],
        note: "Anchoring is required whether the unit stands vertically or lies on its side.",
      },
    ],
    materials: [
      purchaseMaterial("KALLAX outer panel", 2, "Long side panels of the cube frame."),
      purchaseMaterial("KALLAX top panel", 1),
      purchaseMaterial("KALLAX bottom panel", 1),
      purchaseMaterial("KALLAX divider panel", 2, "Short cross pieces that form the 2x2 cubes."),
      includedMaterial("Wooden dowel", 16),
      includedMaterial("Cam lock", 8),
      includedMaterial("Cam bolt", 8),
      includedMaterial("Wall-anchor bracket", 1, "Included tip-over restraint."),
    ],
    tools: ["Mallet", "Phillips screwdriver"],
    difficulties: [
      "The panels are heavy and awkward; assemble on the floor rather than on edge.",
      "Dividers must be squared before locking or the cubes come out uneven.",
      "Wall-anchoring is required for safety, especially with a TV or heavy items on top.",
    ],
    sparePartsHint: SPARE_PARTS_HINT,
  },
];

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function clonePlan(plan: BuildPlan): BuildPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      parts: [...step.parts],
      tools: [...step.tools],
    })),
    materials: plan.materials.map((material) => ({
      ...material,
      retailers: material.retailers.map((retailer) => ({ ...retailer })),
    })),
    tools: [...plan.tools],
    difficulties: [...plan.difficulties],
  };
}

export function findProductPlan(query: string): BuildPlan | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  const match = SAMPLE_PLANS.find((plan) => {
    const name = normalize(plan.title);
    const firstWord = name.split(" ")[0];
    return (
      name.includes(q) ||
      q.includes(name) ||
      q.includes(firstWord) ||
      firstWord.includes(q)
    );
  });
  return match ? clonePlan(match) : undefined;
}

export function generateGenericPlan(
  productName: string,
  opts?: { instructions?: string },
): BuildPlan {
  const title = productName.replace(/\s+/g, " ").trim() || "Custom IKEA Build";
  return {
    title,
    sourceType: "product",
    sourceValue: title,
    instructions: opts?.instructions,
    origin: "generated",
    steps: [
      {
        number: 1,
        title: "Unpack and sort the hardware",
        action:
          "Lay out every panel and open the fittings bag. Sort the screws, cam locks, and dowels into groups and check each against the parts list before starting.",
        parts: ["Main panel", "Screw", "Cam lock", "Wooden dowel"],
        tools: [],
        note: "Counting parts first avoids stalling halfway through the build.",
      },
      {
        number: 2,
        title: "Attach the main structural panels",
        action:
          "Tap the wooden dowels into the pre-drilled holes, then bring the main panels together so the dowels align and the frame takes its basic shape.",
        parts: ["Main panel", "Wooden dowel"],
        tools: ["Mallet"],
      },
      {
        number: 3,
        title: "Secure the fasteners",
        action:
          "Drive the screws and turn each cam lock with the appropriate driver until the joints pull flush, working around the frame evenly.",
        parts: ["Screw", "Cam lock"],
        tools: ["Phillips screwdriver", "Allen key"],
        note: "Tighten in stages so the frame stays square.",
      },
      {
        number: 4,
        title: "Final checks and wall-anchor",
        action:
          "Confirm every joint is tight and the unit sits level. If the piece is tall or top-heavy, fasten the supplied anti-tip bracket to a wall stud.",
        parts: ["Main panel", "Wall-anchor bracket"],
        tools: ["Phillips screwdriver"],
        note: "Anchor anything tall enough to tip before use.",
      },
    ],
    materials: [
      includedMaterial("Screw", 12),
      includedMaterial("Cam lock", 8),
      includedMaterial("Wooden dowel", 8),
      purchaseMaterial("Main panel", 4, "Approximate — confirm panel count against your product."),
    ],
    tools: ["Phillips screwdriver", "Allen key", "Mallet"],
    difficulties: [
      "This is an approximate, generic plan — verify part counts against your actual instruction booklet.",
      "Keep the frame square while fastening and wall-anchor the unit if it is tall.",
    ],
    sparePartsHint: SPARE_PARTS_HINT,
  };
}
