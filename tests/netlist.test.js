/**
 * The bench as a small EDA: cables collapse into named nets (GND, +5V, D13,
 * N$1…), every electronic piece gets a reference designator, and ERC refuses
 * the wires a schematic editor would refuse — before they are drawn.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getPart } from "../server/lib/catalog.js";
import { buildNetlist, ercReport } from "../server/lib/cables.js";
import {
  addCable,
  addPiece,
  benchChrome,
  emptyProject,
  projectErc,
  projectNetlist,
  seedLampTable,
} from "../server/lib/project.js";

function blinkBench() {
  const project = emptyProject();
  const nano = addPiece(project, "arduino-nano");
  const led = addPiece(project, "led-5mm");
  const res = addPiece(project, "resistor-220");
  return { project, nano, led, res };
}

test("pieces get reference designators like a schematic sheet", () => {
  const { project, nano, led, res } = blinkBench();
  assert.equal(nano.ref, "U1");
  assert.equal(led.ref, "D1");
  assert.equal(res.ref, "R1");
  const second = addPiece(project, "arduino-nano");
  assert.equal(second.ref, "U2");
  const top = addPiece(project, "lack-top");
  assert.equal(top.ref, null, "furniture stays refdes-free");
});

test("cables collapse into named nets: pin names, GND, class per net", () => {
  const { project, nano, led, res } = blinkBench();
  addCable(project, nano.id, "d13", res.id, "a");
  addCable(project, res.id, "b", led.id, "anode");
  addCable(project, led.id, "cathode", nano.id, "gnd");
  const netlist = buildNetlist(project, getPart);
  const names = netlist.nets.map((n) => n.name);
  assert.ok(names.includes("D13"), `expected D13 in ${names}`);
  assert.ok(names.includes("GND"), `expected GND in ${names}`);
  assert.equal(netlist.nets.find((n) => n.name === "GND").class, "ground");
  for (const c of project.cables) {
    assert.ok(netlist.cableNets[c.id], "every kept cable knows the net it joined");
  }
  const gnd = netlist.nets.find((n) => n.name === "GND");
  assert.ok(gnd.members.every((m) => m.ref), "net members carry their refdes");
});

test("a wire with no rail or pin name is numbered N$n", () => {
  const project = emptyProject();
  const led = addPiece(project, "led-5mm");
  const res = addPiece(project, "resistor-220");
  const cable = addCable(project, res.id, "b", led.id, "anode");
  assert.equal(cable.net, "N$1");
});

test("ERC refuses a rail-to-ground short instead of drawing it", () => {
  const { project, nano } = blinkBench();
  const result = addCable(project, nano.id, "5v", nano.id, "gnd");
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  assert.equal(result.code, "power-short");
  assert.match(result.reason, /GND/);
  assert.equal(project.cables.length, 0, "the refused wire is not kept");
});

test("incompatible connectors and doubled wires are refused with reasons", () => {
  const { project, nano, led } = blinkBench();
  const bad = addCable(project, nano.id, "usb", led.id, "anode");
  assert.equal(bad.refused, true);
  assert.equal(bad.code, "no-mate");

  const first = addCable(project, nano.id, "d13", led.id, "anode");
  assert.ok(first.id, "a legal wire is kept");
  const dupe = addCable(project, led.id, "anode", nano.id, "d13");
  assert.equal(dupe.refused, true);
  assert.equal(dupe.code, "duplicate");
});

test("ERC warns about an LED hanging straight off an MCU pin", () => {
  const { project, nano, led } = blinkBench();
  addCable(project, nano.id, "d13", led.id, "anode");
  addCable(project, led.id, "cathode", nano.id, "gnd");
  const erc = ercReport(project, getPart);
  assert.equal(erc.errors.length, 0);
  assert.ok(erc.warnings.some((w) => w.code === "no-series-resistor"));
});

test("the seeded lamp table is ERC-clean and fully named", () => {
  const project = seedLampTable();
  const erc = projectErc(project);
  assert.equal(erc.errors.length, 0, JSON.stringify(erc.errors));
  const netlist = projectNetlist(project);
  assert.ok(netlist.nets.length >= 3);
  assert.ok(netlist.nets.some((n) => n.name === "GND"));
  assert.ok(netlist.nets.some((n) => n.name === "D13"));
  const chrome = benchChrome(project);
  assert.equal(chrome.electronics, true, "electronics on the bench turn the EDA chrome on");
});
