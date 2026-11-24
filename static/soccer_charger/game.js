import { scenes } from "./story.js";
import { createField } from "./field.js";
import { clamp, shotSpec } from "../soccer/logic.js";

const $ = (id) => document.getElementById(id);
const keys = new Set(),
  saveKey = "eastchester-chargers-v1";
const music = new Audio("/games-3d/sounds/music/soccer/kickoff.mp3");
music.loop = true;
music.volume = 0.16;
let muted = false,
  audio;
try {
  muted = localStorage.getItem("chargers-muted") === "true";
} catch {}
music.muted = muted;
$("mute").textContent = muted ? "Sound off" : "Sound on";
const synth = window.speechSynthesis;
function readLine() {
  if (!synth || muted) return;
  synth.cancel();
  const line = new SpeechSynthesisUtterance($("line").textContent);
  const speaker = scene().who;
  line.lang = "en-US";
  line.rate = 0.98;
  line.pitch = speaker === "Matias" ? 0.87 : speaker === "Liv" ? 1.16 : 1.08;
  music.volume = 0.045;
  line.onend = () => {
    music.volume = 0.16;
  };
  line.onerror = line.onend;
  synth.speak(line);
}
function note(freq, end, duration) {
  if (muted || !audio) return;
  const o = audio.createOscillator(),
    v = audio.createGain(),
    t = audio.currentTime;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(end, t + duration);
  v.gain.setValueAtTime(0.09, t);
  v.gain.exponentialRampToValueAtTime(0.001, t + duration);
  o.connect(v).connect(audio.destination);
  o.start(t);
  o.stop(t + duration);
}
function soundStart() {
  if (muted) return;
  audio ||= new AudioContext();
  audio.resume().catch(() => {});
  music.volume = scene().team === "Metrostarts" ? 0.085 : 0.16;
  music.play().catch(() => {});
}
let stored;
try {
  stored = JSON.parse(localStorage.getItem(saveKey));
} catch {}
const s = {
  index: Number.isInteger(stored?.index)
    ? clamp(stored.index, 0, scenes.length)
    : 0,
  choice: stored?.choice === "gloves" ? "gloves" : "bench",
  phase: "intro",
  time: 0,
  goals: 0,
};
const savedScene = scenes[s.index];
if (savedScene && ["play", "after"].includes(stored?.phase)) {
  s.phase = stored.phase;
  s.goals = Number.isInteger(stored.goals)
    ? clamp(stored.goals, 0, savedScene.goals || 1)
    : 0;
}
const scene = () => scenes[Math.min(s.index, scenes.length - 1)];
function save() {
  try {
    localStorage.setItem(
      saveKey,
      JSON.stringify({
        index: s.index,
        choice: s.choice,
        phase: s.phase,
        goals: s.goals,
      }),
    );
  } catch {}
}
function resetRun() {
  Object.assign(s, {
    x: 455,
    y: 255,
    keeper: 255,
    defX: 628,
    defY: 255,
    mateX: 610,
    mateY: 205,
    charge: null,
    ball: null,
    pass: 0,
    linked: false,
    gate: false,
    boostUsed: false,
    boost: 0,
    moving: false,
  });
}
function button(text, fn) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = fn;
  $("actions").append(b);
}
function controls(text) {
  $("hint").textContent = text;
}
function finisher() {
  const c = scene();
  if (c.team === "Metrostarts" || (c.team === "Storm" && s.goals === 2))
    return "Sami";
  if (c.team === "Storm" && s.goals === 1) return "Liv";
  return null;
}
function objective() {
  if (scene().mode === "gate" && !s.gate)
    return "Dribble right between the orange cones.";
  if (scene().mode === "pass")
    return "Press E to pass to Liv and follow the return.";
  if (scene().mode === "duel")
    return "Dodge Liv and reach the box on the right. Run over the yellow bolt for three seconds of speed.";
  if (scene().team && s.x < 670)
    return "Carry the ball past the dashed attacking line. E plays a one-two around the defender.";
  if (finisher())
    return (
      "Find " +
      finisher() +
      " in the upper channel. Dribble above the middle of the goal, then press E for the cross."
    );
  return "Line up with the right goal. Hold Space, then release to shoot.";
}
function pitchHud() {
  const c = scene();
  $("board").textContent = c.team
    ? "Chargers " + (c.start + s.goals) + " – " + c.away + " " + c.team
    : "Eastchester Chargers";
  $("location").textContent = c.label;
}
function panel() {
  synth?.cancel();
  music.volume = 0.16;
  keys.clear();
  s.charge = null;
  $("pad").hidden = s.phase !== "play";
  $("actions").replaceChildren();
  pitchHud();
  const c = scene();
  $("speaker").textContent =
    c.who + "  /  " + (c.who === "Matias" ? "Coach & Dad" : "Chargers");
  $("title").textContent = c.title;
  $("status").textContent = "FIELD NOTES";
  if (s.index === scenes.length) {
    s.phase = "end";
    $("location").textContent = "Tournament record";
    $("board").textContent = "Eastchester · Full time";
    $("speaker").textContent = "Thomas · After the handshakes";
    $("title").textContent = "Same field next Saturday?";
    $("line").textContent =
      "Dad folds the little goals. Thomas spots Sami still wearing one glove. “Keep it on,” he says, rolling him the last orange. Sami catches it one-handed.";
    controls(
      "Crew 3–2   ·   Metrostarts 1–3   ·   Storm 7–0   ·   Thunder 2–3",
    );
    music.pause();
    button("Play again", () => {
      s.index = 0;
      s.goals = 0;
      s.choice = "bench";
      s.phase = "intro";
      resetRun();
      save();
      panel();
    });
    return;
  }
  if (s.phase === "intro") {
    $("line").textContent =
      c.team === "Thunder" && s.choice === "gloves"
        ? "“Hey, Thomas! Still want my lucky glove?” Sami wiggles his fingers. Three down again, and this time Thomas laughs."
        : c.line;
    controls(
      c.mode === "choice"
        ? "↑ / ↓ choose · E to speak"
        : "Chapter " + (s.index + 1) + " of " + scenes.length,
    );
    if (c.mode === "choice") {
      button("Sit with Sami", () => choose("bench"));
      button("Ask about his gloves", () => choose("gloves"));
    } else button("Take the field  →", start);
    if (synth && !muted) button("Hear " + c.who, readLine);
  } else if (s.phase === "after") {
    $("speaker").textContent = "Touchline · " + c.label;
    $("line").textContent =
      c.mode === "choice"
        ? s.choice === "gloves"
          ? "“Can I try one?” Thomas asks. Sami hands over a glove. It smells so bad they both start laughing."
          : "Thomas sits beside him. For a while neither talks. Then Sami leans his shoulder into Thomas’s and says, “Save me a spot up front.”"
        : c.end;
    controls("Moment complete");
    button("Continue  →", advance);
  } else {
    $("status").textContent = "LIVE PLAY";
    button("Pause", togglePause);
    $("line").textContent = objective();
    controls(
      c.mode === "duel"
        ? "Beat Liv to the white line."
        : c.mode === "pass"
          ? "Find the green shirt on the wing."
          : "Arrows move and aim. The dotted line shows your shot.",
    );
  }
}
function start() {
  soundStart();
  s.phase = "play";
  resetRun();
  save();
  panel();
}
function choose(choice) {
  s.choice = choice;
  s.phase = "after";
  soundStart();
  music.pause();
  save();
  panel();
}
function advance() {
  s.index++;
  s.goals = 0;
  s.phase = "intro";
  resetRun();
  save();
  panel();
  if (s.phase === "intro") readLine();
}
function finish() {
  music.pause();
  s.phase = "after";
  s.moving = false;
  save();
  const loss = scene().team && scene().start + s.goals < scene().away;
  note(loss ? 510 : 460, loss ? 330 : 920, 0.26);
  panel();
}
function give() {
  if (s.ball || s.pass || scene().mode === "duel") return;
  if (finisher() && s.x >= 670) {
    if (s.y > 249) {
      controls("Carry into the upper channel to open the cross.");
      return;
    }
    s.charge = null;
    s.pass = 3;
    s.ball = { x: s.x + 9, y: s.y, kind: "pass" };
    controls("Cross to " + finisher() + "!");
    return;
  }
  s.charge = null;
  s.pass = 1;
  s.ball = { x: s.x + 9, y: s.y, kind: "pass" };
  note(230, 120, 0.1);
}
function kick() {
  if (s.charge === null || s.ball) return;
  if (finisher() && s.x >= 670) {
    s.charge = null;
    controls(finisher() + " is open! Move up and press E to cross.");
    return;
  }
  const power = s.charge;
  s.charge = null;
  if (scene().mode === "gate" && !s.gate) {
    controls("Through the cones first!");
    return;
  }
  if (scene().mode === "pass" || scene().mode === "duel") {
    controls(objective());
    return;
  }
  if (scene().team && s.x < 670) {
    controls("Too far out. Dribble across the dashed line first.");
    return;
  }
  s.ball = {
    x: s.x + 9,
    y: s.y,
    kind: "shot",
    hot: s.linked,
    speed: shotSpec(power).speed * (s.linked ? 25 : 19),
  };
  note(s.linked ? 650 : 200, 75, 0.18);
  controls(s.linked ? "LIGHTNING DRIVE!" : "Shot away!");
}
function retry(message) {
  const gateCleared = s.gate;
  resetRun();
  if (gateCleared) {
    s.gate = true;
    s.x = 559;
  }
  $("line").textContent = objective();
  controls(message);
}
function scored() {
  s.goals++;
  pitchHud();
  if (s.goals >= (scene().goals || 1)) {
    finish();
    return;
  }
  resetRun();
  save();
  $("line").textContent = objective();
  controls("Goal! Take the next attack.");
  note(440, 880, 0.22);
}
function update(dt) {
  if (s.phase === "paused") return;
  s.time += dt;
  if (s.phase !== "play") return;
  const c = scene();
  s.keeper = 254 + Math.sin(s.time * 1.85) * 30;
  s.defY = 248 + Math.sin(s.time * (c.team === "Thunder" ? 2.1 : 1.45)) * 38;
  const dx = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")),
    dy = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
  const speed =
    ((s.boost > 0 ? 235 : 155) * dt) / Math.max(1, Math.hypot(dx, dy));
  if (c.mode === "duel") {
    // Liv reads a run in her channel. An early cut leaves time to escape.
    const pressing = Math.abs(s.x - 628) < 75;
    s.defX += clamp((pressing ? s.x : 628) - s.defX, -dt * 48, dt * 48);
  }
  s.receiver = finisher() || (c.team === "Thunder" ? "Sami" : "Liv");
  if (finisher()) {
    s.mateX = 740 + Math.sin(s.time) * 16;
    s.mateY = 225 + Math.sin(s.time * 1.8) * 8;
  }
  const wasOutside = s.x < 670;
  s.moving = !!(dx || dy) && s.charge === null && s.ball?.kind !== "shot";
  if (s.moving) {
    s.x = clamp(s.x + dx * speed, 65, 840);
    s.y = clamp(s.y + dy * speed, 172, 350);
  }
  if (c.team && wasOutside !== s.x < 670) $("line").textContent = objective();
  if (!s.boostUsed && Math.hypot(s.x - 635, s.y - 227) < 20) {
    s.boostUsed = true;
    s.boost = 3;
    controls("BOLT BOOTS · Burst of speed!");
    note(300, 900, 0.2);
  }
  s.boost = Math.max(0, s.boost - dt);
  if (
    c.mode === "gate" &&
    !s.gate &&
    Math.abs(s.x - 536) < 12 &&
    s.y > 230 &&
    s.y < 281
  ) {
    s.gate = true;
    $("line").textContent = objective();
    note(270, 520, 0.14);
  }
  if (
    (c.mode === "duel" || c.mode === "match") &&
    !s.ball &&
    !s.linked &&
    Math.hypot(s.x - s.defX, s.y - s.defY) < 17
  ) {
    retry((c.team || "Liv") + " won the ball. Try the other side.");
    return;
  }
  if (c.mode === "duel" && s.x >= 790) {
    finish();
    return;
  }
  if (s.charge !== null) {
    s.charge = Math.min(1, s.charge + dt / 1.05);
    controls("SHOT POWER  " + Math.round(s.charge * 100) + "%");
  }
  const b = s.ball;
  if (!b) return;
  if (b.kind === "pass") {
    const outbound = s.pass !== 2;
    const tx = outbound ? s.mateX : s.x + 9,
      ty = outbound ? s.mateY : s.y;
    const dist = Math.hypot(tx - b.x, ty - b.y),
      step = 490 * dt;
    if (dist <= step) {
      b.x = tx;
      b.y = ty;
      if (s.pass === 3) {
        s.pass = 0;
        s.ball = { x: tx, y: ty, kind: "shot", speed: 720, volley: true };
        controls(finisher() + " hits it first time!");
        note(350, 110, 0.12);
      } else if (s.pass === 1) {
        s.pass = 2;
        note(300, 180, 0.08);
      } else {
        s.pass = 0;
        s.ball = null;
        s.linked = true;
        controls("ONE–TWO · Lightning Drive ready!");
        if (c.mode === "pass") finish();
      }
    } else {
      b.x += ((tx - b.x) * step) / dist;
      b.y += ((ty - b.y) * step) / dist;
    }
  } else {
    b.x += b.speed * dt;
    if (b.x >= 887) {
      if (b.y < 211 || b.y > 296)
        retry("Wide of the posts. Move up or down to aim.");
      else if (Math.abs(b.y - s.keeper) < (b.volley ? 3 : b.hot ? 5 : 14))
        retry("Keeper save! Try the far corner or a one-two.");
      else scored();
    }
  }
}
function togglePause() {
  if (s.phase === "play") {
    s.phase = "paused";
    keys.clear();
    s.charge = null;
    s.moving = false;
    music.pause();
    $("pad").hidden = true;
    $("status").textContent = "PAUSED";
    controls("E to return to the ball.");
    $("actions").replaceChildren();
    button("Resume", togglePause);
  } else if (s.phase === "paused") {
    s.phase = "play";
    soundStart();
    panel();
  }
}
function action(code, down) {
  if (code === "Escape" && down) {
    togglePause();
    return;
  }
  if (code === "KeyE" && down) {
    if (s.phase === "play") give();
    else
      (
        $("actions").querySelector("button:focus") ||
        $("actions").querySelector("button")
      )?.click();
    return;
  }
  if (
    s.phase === "intro" &&
    scene().mode === "choice" &&
    down &&
    ["ArrowDown", "ArrowUp"].includes(code)
  ) {
    const buttons = [...$("actions").querySelectorAll("button")];
    buttons[code === "ArrowDown" ? 1 : 0].focus();
    return;
  }
  if (s.phase !== "play") return;
  if (down && music.paused && !muted) soundStart();
  if (code === "Space") {
    if (down) {
      if (!s.ball) s.charge = 0;
    } else kick();
  }
  if (down) keys.add(code);
  else keys.delete(code);
}
addEventListener("keydown", (e) => {
  if (
    [
      "Space",
      "KeyE",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Escape",
    ].includes(e.code)
  ) {
    e.preventDefault();
    if (!e.repeat) action(e.code, true);
  }
});
addEventListener("keyup", (e) => action(e.code, false));
addEventListener("blur", () => {
  keys.clear();
  s.charge = null;
});
for (const btn of $("pad").querySelectorAll("button")) {
  btn.onpointerdown = (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    action(btn.dataset.key, true);
  };
  btn.onpointerup = () => action(btn.dataset.key, false);
  btn.onpointercancel = () => {
    keys.delete(btn.dataset.key);
    s.charge = null;
  };
}
$("mute").onclick = () => {
  muted = !muted;
  try {
    localStorage.setItem("chargers-muted", String(muted));
  } catch {}
  music.muted = muted;
  if (muted) synth?.cancel();
  $("mute").textContent = muted ? "Sound off" : "Sound on";
  if (!muted && s.phase === "play") soundStart();
  if (s.phase === "intro") panel();
};
async function boot() {
  try {
    const draw = await createField();
    resetRun();
    panel();
    let previous = performance.now();
    function frame(now) {
      const dt = Math.min(.16, (now - previous) / 1000);
      previous = now;
      // A slower display still gets small collision and possession steps.
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 60);
        update(step);
        remaining -= step;
      }
      draw(s, scene(), dt);
      requestAnimationFrame(frame);
    }
    frame(previous);
  } catch (error) {
    console.error(error);
    $("title").textContent = "The 3D field couldn't open";
    $("line").textContent = "Check that WebGL is enabled and reload the field.";
    button("Reload field", () => location.reload());
  }
}
boot();
