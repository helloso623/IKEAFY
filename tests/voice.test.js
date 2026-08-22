import { test } from "node:test";
import assert from "node:assert/strict";
import { bindVoice, speechCtor } from "../client/src/voice.js";

test("speechCtor prefers webkitSpeechRecognition when present", () => {
  const Fake = function Fake() {};
  assert.equal(speechCtor({ webkitSpeechRecognition: Fake }), Fake);
  assert.equal(speechCtor({}), null);
  assert.equal(speechCtor(undefined), null);
});

test("bindVoice disables the mic when speech APIs are missing", () => {
  const button = {
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    addEventListener() {},
  };
  const status = { textContent: "" };
  const bound = bindVoice({ button, status, input: { value: "" } });
  assert.equal(bound.available, false);
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /Type instead/);
});
