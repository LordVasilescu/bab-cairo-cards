// © 2026 Mathew. All rights reserved.
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);

const SAVE_KEY = "bab-cairo-v2";
const MASTERED_AT = 3;
let save = loadSave();
let battle = null;
let selectedMinion = null;
let pendingPlay = null;
let packQueue = [];
let teaching = false;

function emptySave() {
  return {
    hero: null,
    collection: [],
    wins: 0,
    xp: 0,
    mastered: {},
    taught: {},
    practiced: {},
  };
}

function loadSave() {
  try {
    return Object.assign(emptySave(), JSON.parse(localStorage.getItem(SAVE_KEY)) || {});
  } catch {
    return emptySave();
  }
}

function isMastered(id) {
  return (save.mastered[id] || 0) >= MASTERED_AT;
}
function isTaught(id) {
  return !!save.taught[id];
}
function practiced(id) {
  return save.practiced[id] || 0;
}
function persist() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function cloneFrom(id, enemy) {
  const d = defFor(id, enemy);
  if (!d) throw new Error("missing card " + id);
  return Object.assign({}, d, {
    uid: uid(),
    sick: true,
    silenced: false,
    maxHealth: d.health,
    enemy: !!enemy,
  });
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let audioCtx = null;

function audioSrcFor(ar) {
  if (!ar || typeof AUDIO_FILES === "undefined") return null;
  if (AUDIO_FILES[ar]) return AUDIO_FILES[ar];
  const t = String(ar).trim();
  if (AUDIO_FILES[t]) return AUDIO_FILES[t];
  return null;
}

function ctx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("This browser has no Web Audio");
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function setSoundStatus(msg) {
  ["#sound-status", "#hear-status", "#speaker-label"].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = msg;
  });
  const bar = $("#speaker");
  if (bar) bar.classList.remove("hidden");
}

function markHear(on) {
  document.querySelectorAll(".hear, #hero-power").forEach((b) => {
    b.classList.toggle("speaking", on);
  });
}

function beep() {
  const c = ctx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.28, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.22);
}

async function speak(ar) {
  if (!ar) return;
  try {
    ctx();
    beep();
    const file = audioSrcFor(ar);
    if (!file) {
      setSoundStatus("No clip for " + ar);
      return;
    }
    setSoundStatus("Playing " + ar);
    markHear(true);
    const res = await fetch(file + "?v=5");
    if (!res.ok) throw new Error("could not load clip (" + res.status + ")");
    const raw = await res.arrayBuffer();
    const buf = await ctx().decodeAudioData(raw.slice(0));
    const src = ctx().createBufferSource();
    const g = ctx().createGain();
    g.gain.value = 2.4;
    src.buffer = buf;
    src.connect(g);
    g.connect(ctx().destination);
    src.onended = () => markHear(false);
    src.start();
  } catch (err) {
    markHear(false);
    setSoundStatus("Sound error: " + (err && err.message ? err.message : err));
    console.error(err);
  }
}

function show(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function cardHTML(c, opts = {}) {
  const cls = [
    "card",
    c.type,
    c.rarity,
    opts.small ? "small" : "",
    opts.playable ? "playable" : "",
    opts.ready ? "ready" : "",
    opts.selected ? "selected" : "",
    opts.faceDown ? "facedown" : "",
    c.taunt && !c.silenced ? "taunt" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const data = `data-uid="${c.uid || ""}" data-id="${c.id}"`;
  if (opts.faceDown) {
    return `<div class="${cls}" ${data}><div class="back"></div></div>`;
  }
  const stats =
    c.type === "minion"
      ? `<div class="stat atk">${c.attack}</div><div class="stat hp">${c.health}</div>`
      : "";
  const text = c.silenced ? "<i>Silence</i>" : cardBodyText(c);
  return `<div class="${cls}" ${data}>
    <div class="mana-gem">${c.cost}</div>
    <div class="art" style="background-image:url('${c.art}')"></div>
    <div class="name-banner"><div class="ar">${c.nameAr}</div><div class="lat">${c.nameLat}</div></div>
    <div class="textbox">${text}</div>
    ${stats}
  </div>`;
}

function cardBodyText(c) {
  if (c.enemy) return c.meaning || c.text || "";
  if (isMastered(c.id)) return c.text || "";
  if (practiced(c.id) < 1) return c.meaning + (c.text ? " · " + c.text : "");
  return c.text || "";
}

/* ---------- screens ---------- */
function goTitle() {
  show("#screen-title");
  const hasHero = !!save.hero;
  $("#continue-btn").classList.toggle("hidden", !hasHero);
  $("#collection-btn").classList.toggle("hidden", save.collection.length === 0);
}

function goHero() {
  show("#screen-hero");
}

function goPrimer() {
  show("#screen-primer");
}

function goCollection() {
  show("#screen-collection");
  const ids = save.collection.length
    ? save.collection
    : Object.keys(CARDS).filter((id) => !CARDS[id].gender || CARDS[id].gender === save.hero);
  $("#collection-grid").innerHTML = ids
    .map((id) => {
      const c = CARDS[id];
      if (!c) return "";
      const n = save.mastered[id] || 0;
      const stage = isMastered(id) ? "mastered" : isTaught(id) ? `${n}/${MASTERED_AT} recalls` : "not learned yet";
      return `<div class="col-card" data-id="${id}">${cardHTML({ ...c, uid: id })}<div class="lat" style="text-align:center;margin-top:6px;color:#b9a07a">${stage}</div></div>`;
    })
    .join("");
}

function openStarterPack() {
  const list = shuffle(starterList(save.hero));
  const unique = [];
  for (const id of list) {
    if (!unique.includes(id)) unique.push(id);
    if (unique.length === 5) break;
  }
  packQueue = unique.map((id) => cloneFrom(id, false));
  show("#screen-pack");
  $("#pack-row").innerHTML = packQueue
    .map((c, i) => `<div class="pack-card" data-i="${i}">${cardHTML(c, { faceDown: true })}</div>`)
    .join("");
  $("#pack-continue").classList.add("hidden");
  $("#pack-hint").textContent = "Click a card to flip it.";
  $("#pack-row").onclick = (e) => {
    const wrap = e.target.closest(".pack-card");
    if (!wrap || wrap.classList.contains("flipped")) return;
    const i = +wrap.dataset.i;
    wrap.classList.add("flipped");
    wrap.innerHTML = cardHTML(packQueue[i]);
    const id = packQueue[i].id;
    if (!save.collection.includes(id)) save.collection.push(id);
    persist();
    openLesson(packQueue[i], () => {
      const all = [...$("#pack-row").children].every((x) => x.classList.contains("flipped"));
      if (all) {
        $("#pack-continue").classList.remove("hidden");
        $("#pack-hint").textContent = "You just learned five words. Now use them.";
      }
    });
  };
}

/* ---------- battle ---------- */
function deckForNow() {
  const beginner = (save.wins || 0) < 1;
  return beginner
    ? {
        deck: lesson1List(save.hero),
        enemy: lesson1Enemy(),
        enemyHp: 18,
      }
    : {
        deck: starterList(save.hero),
        enemy: enemyList(),
        enemyHp: 25,
      };
}

function startBattle() {
  const lists = deckForNow();
  const pDeck = shuffle(lists.deck.map((id) => cloneFrom(id, false)));
  const eDeck = shuffle(lists.enemy.map((id) => cloneFrom(id, true)));
  battle = {
    turn: "player",
    turnNum: 1,
    log: [],
    targeting: null,
    over: null,
    player: {
      hp: 30,
      maxHp: 30,
      mana: 1,
      maxMana: 1,
      deck: pDeck,
      hand: [],
      board: [],
      powerUsed: false,
      fatigue: 0,
    },
    enemy: {
      hp: lists.enemyHp,
      maxHp: lists.enemyHp,
      mana: 1,
      maxMana: 1,
      deck: eDeck,
      hand: [],
      board: [],
      powerUsed: false,
      fatigue: 0,
    },
  };
  draw(battle.player, 3);
  draw(battle.enemy, 4);
  log("Hassan looks up. You know almost nothing. That's the point.", "learn");
  log("New word? We teach it first. First use is open-book. After that we ask.", "learn");
  selectedMinion = null;
  pendingPlay = null;
  show("#screen-battle");
  teaching = true;
  renderBattle();
  teachNewInHand();
}

function draw(who, n) {
  for (let i = 0; i < n; i++) {
    if (!who.deck.length) {
      who.fatigue += 1;
      who.hp -= who.fatigue;
      log(`Fatigue for ${who === battle.player ? "you" : "Hassan"}: ${who.fatigue}`, "hit");
      continue;
    }
    if (who.hand.length >= 10) {
      who.deck.shift();
      continue;
    }
    who.hand.push(who.deck.shift());
  }
}

function log(msg, cls) {
  battle.log.unshift({ msg, cls: cls || "" });
}

function renderBattle() {
  if (!battle) return;
  const p = battle.player;
  const e = battle.enemy;
  const myTurn = battle.turn === "player" && !battle.over;

  $("#match-title").textContent = "Ahwa Hassan  ·  Turn " + battle.turnNum;
  $("#coach").textContent = battle.over
    ? battle.over === "win"
      ? "You paid, you ate, you talked. Victory."
      : "The cafe ate you. Rematch?"
    : battle.targeting
      ? "Choose a target."
      : myTurn
        ? teaching
          ? "Learn this word first."
          : "Click a card to speak. Right-click to study it again."
        : "Hassan is talking…";

  $("#log").innerHTML = battle.log
    .slice(0, 18)
    .map((x) => `<div class="${x.cls}">${x.msg}</div>`)
    .join("");

  $("#enemy-hero-img").src = "assets/enemy.jpg";
  $("#player-hero-img").src = save.hero === "f" ? "assets/hero-f.jpg" : "assets/hero-m.jpg";
  $("#enemy-hp").textContent = Math.max(0, e.hp);
  $("#player-hp").textContent = Math.max(0, p.hp);
  $("#player-name").textContent = save.hero === "f" ? "الغريبة" : "الغريب";

  $("#enemy-mana").innerHTML =
    manaHTML(e.mana, e.maxMana) + `<div class="mana-count">${e.mana}/${e.maxMana}</div>`;
  $("#player-mana").innerHTML =
    manaHTML(p.mana, p.maxMana) + `<div class="mana-count">${p.mana}/${p.maxMana}</div>`;

  $("#hero-power").disabled = !myTurn || p.powerUsed || p.mana < 2;

  $("#enemy-board").innerHTML = e.board
    .map((c) =>
      cardHTML(c, {
        small: true,
        selected: battle.targeting && selectedMinion,
      })
    )
    .join("") || `<span style="opacity:.4">empty table</span>`;
  $("#player-board").innerHTML = p.board
    .map((c) =>
      cardHTML(c, {
        small: true,
        ready: myTurn && !c.sick,
        selected: selectedMinion && selectedMinion.uid === c.uid,
      })
    )
    .join("") || `<span style="opacity:.4">your words land here</span>`;

  $("#hand").innerHTML = p.hand
    .map((c) => cardHTML(c, { playable: myTurn && c.cost <= p.mana }))
    .join("");

  const end = $("#end-turn");
  end.disabled = !myTurn || teaching;
  end.textContent = myTurn ? "End Turn" : "Wait…";

  $("#target-banner").classList.toggle("hidden", !battle.targeting);

  checkEnd();
}

function manaHTML(cur, max) {
  let s = '<div class="mana-row">';
  for (let i = 0; i < 10; i++) {
    s += `<div class="crystal ${i < cur ? "full" : ""}"></div>`;
  }
  s += "</div>";
  return s;
}

function checkEnd() {
  if (!battle || battle.over) return;
  if (battle.enemy.hp <= 0) {
    battle.over = "win";
    log("Hassan laughs, waves the bill away. خلاص.", "learn");
    setTimeout(() => endMatch(true), 900);
  } else if (battle.player.hp <= 0) {
    battle.over = "lose";
    log("You freeze. The cafe keeps moving without you.", "hit");
    setTimeout(() => endMatch(false), 900);
  }
}

function endMatch(win) {
  const learned = Object.keys(save.mastered);
  save.wins += win ? 1 : 0;
  save.xp += win ? 40 : 10;
  persist();
  show("#screen-end");
  $("#end-title").textContent = win ? "خلاص" : "مش كويس";
  $("#end-sub").textContent = win ? "You survived the ahwa." : "The words got away.";
  const top = learned
    .sort((a, b) => (save.mastered[b] || 0) - (save.mastered[a] || 0))
    .slice(0, 8)
    .map((id) => {
      const c = CARDS[id];
      return c ? `<strong>${c.nameAr}</strong> ${c.nameLat} — ${c.meaning}` : "";
    })
    .filter(Boolean)
    .join("<br>");
  $("#end-recap").innerHTML =
    (top || "No casts landed.") +
    `<br><br>XP ${save.xp} · Wins ${save.wins}`;
}

/* clicks */
function attemptPlay(card) {
  if (card.target === "minion") {
    pendingPlay = card;
    battle.targeting = true;
    log("Choose a minion.");
    renderBattle();
  } else {
    playCard(card, null);
  }
}

function onHandClick(uidStr) {
  if (!battle || battle.turn !== "player" || battle.over || teaching) return;
  const card = battle.player.hand.find((c) => c.uid === uidStr);
  if (!card) return;
  selectedMinion = null;
  if (card.cost > battle.player.mana) {
    log("Not enough mana.");
    renderBattle();
    return;
  }
  if (!isTaught(card.id)) {
    openLesson(card, () => attemptPlay(card));
    return;
  }
  const openBook = practiced(card.id) < 1 || isMastered(card.id);
  if (openBook) {
    attemptPlay(card);
  } else {
    openQuiz(card, () => attemptPlay(card));
  }
}

function onPlayerBoardClick(uidStr) {
  if (!battle || battle.turn !== "player" || battle.over) return;
  const c = battle.player.board.find((x) => x.uid === uidStr);
  if (!c) return;
  if (battle.targeting && pendingPlay) {
    resolveTargeted(pendingPlay, c);
    return;
  }
  if (c.sick) {
    log(`${c.nameLat} has summoning sickness.`);
    return;
  }
  selectedMinion = c;
  log(`${c.nameAr} is ready. Click an enemy.`);
  renderBattle();
}

function onEnemyBoardClick(uidStr) {
  if (!battle || battle.turn !== "player" || battle.over) return;
  const c = battle.enemy.board.find((x) => x.uid === uidStr);
  if (!c) return;
  if (battle.targeting && pendingPlay) {
    resolveTargeted(pendingPlay, c);
    return;
  }
  if (selectedMinion) {
    attack(selectedMinion, c);
  }
}

function onEnemyHeroClick() {
  if (!battle || battle.turn !== "player" || battle.over) return;
  if (battle.targeting) return;
  if (selectedMinion) {
    if (hasTaunt(battle.enemy.board)) {
      log("A Taunt is in the way.");
      return;
    }
    attackFace(selectedMinion);
  }
}

function hasTaunt(board) {
  return board.some((c) => c.taunt && !c.silenced);
}

function resolveTargeted(card, target) {
  battle.targeting = null;
  pendingPlay = null;
  playCard(card, target);
}

function playCard(card, target) {
  const p = battle.player;
  const i = p.hand.findIndex((c) => c.uid === card.uid);
  if (i < 0) return;
  if (card.cost > p.mana) return;
  p.mana -= card.cost;
  p.hand.splice(i, 1);
  save.practiced[card.id] = practiced(card.id) + 1;
  if (!save.collection.includes(card.id)) save.collection.push(card.id);
  persist();
  speak(card.nameAr);
  log(`You said ${card.nameAr} (${card.nameLat}) — ${card.meaning}`, "learn");
  if (card.notes) log(card.notes, "learn");

  if (card.type === "minion") {
    if (p.board.length < 7) {
      card.sick = true;
      p.board.push(card);
      if (card.battlecry && card.battlecry.type === "drawIfEmpty" && p.board.length === 1) {
        draw(p, 1);
        log("Empty doorway. You draw.", "learn");
      }
    }
  } else {
    applyEffect(card, p, battle.enemy, target);
  }
  selectedMinion = null;
  renderBattle();
}

function applyEffect(card, self, opp, target) {
  const fx = card.effect;
  if (!fx) return;
  if (fx.type === "healHero") {
    self.hp = Math.min(self.maxHp || 30, self.hp + fx.amount);
    log(`Restore ${fx.amount}.`, "heal");
  }
  if (fx.type === "hitEnemyHero") {
    opp.hp -= fx.amount;
    log(`Hit face for ${fx.amount}.`, "hit");
  }
  if (fx.type === "draw") draw(self, fx.amount);
  if (fx.type === "hitAndDraw") {
    opp.hp -= fx.amount;
    draw(self, 1);
    log(`Hit ${fx.amount} and draw.`, "hit");
  }
  if (fx.type === "healAndBuff") {
    self.hp = Math.min(self.maxHp || 30, self.hp + fx.amount);
    if (self.board.length) {
      const m = self.board[Math.floor(Math.random() * self.board.length)];
      m.attack += fx.buff[0];
      m.health += fx.buff[1];
      m.maxHealth += fx.buff[1];
      log(`${m.nameLat} gets +${fx.buff[0]}/+${fx.buff[1]}.`, "heal");
    } else log(`Restore ${fx.amount}.`, "heal");
  }
  if (fx.type === "silence" && target) {
    target.silenced = true;
    target.taunt = false;
    target.text = "";
    log(`${target.nameLat} silenced.`, "learn");
  }
  if (fx.type === "destroy" && target) {
    removeMinion(target);
    log(`${target.nameLat} is خلاص.`, "hit");
  }
}

function removeMinion(c) {
  battle.player.board = battle.player.board.filter((x) => x.uid !== c.uid);
  battle.enemy.board = battle.enemy.board.filter((x) => x.uid !== c.uid);
}

function attack(a, b) {
  if (hasTaunt(battle.enemy.board) && !(b.taunt && !b.silenced)) {
    log("A Taunt is in the way.");
    return;
  }
  log(`${a.nameAr} attacks ${b.nameAr}.`, "hit");
  b.health -= a.attack;
  a.health -= b.attack;
  a.sick = true;
  if (b.health <= 0) removeMinion(b);
  if (a.health <= 0) removeMinion(a);
  selectedMinion = null;
  renderBattle();
}

function attackFace(a) {
  battle.enemy.hp -= a.attack;
  a.sick = true;
  log(`${a.nameAr} goes face for ${a.attack}.`, "hit");
  selectedMinion = null;
  renderBattle();
}

function heroPower() {
  const p = battle.player;
  if (!battle || battle.turn !== "player" || p.powerUsed || p.mana < 2 || teaching) return;
  p.mana -= 2;
  p.powerUsed = true;
  if (!p.hand.length) {
    log("Hand is empty.");
    renderBattle();
    return;
  }
  log("اسمع — listen to your hand.", "learn");
  p.hand.forEach((c, i) => {
    setTimeout(() => speak(c.nameAr), i * 900);
  });
  renderBattle();
}

async function endTurn() {
  if (!battle || battle.turn !== "player" || battle.over || teaching) return;
  selectedMinion = null;
  battle.targeting = null;
  pendingPlay = null;
  battle.turn = "enemy";
  log("Hassan's turn.");
  renderBattle();
  await enemyTurn();
  if (battle.over) return;
  startPlayerTurn();
}

function startPlayerTurn() {
  const p = battle.player;
  battle.turn = "player";
  battle.turnNum += 1;
  p.maxMana = Math.min(10, p.maxMana + 1);
  p.mana = p.maxMana;
  p.powerUsed = false;
  p.board.forEach((c) => (c.sick = false));
  draw(p, 1);
  log("Your turn.");
  renderBattle();
  teachNewInHand();
}

async function enemyTurn() {
  const e = battle.enemy;
  e.maxMana = Math.min(10, battle.turnNum);
  e.mana = e.maxMana;
  e.board.forEach((c) => (c.sick = false));
  draw(e, 1);
  renderBattle();
  await delay(500);

  const playable = () =>
    e.hand
      .filter((c) => c.cost <= e.mana)
      .sort((a, b) => b.cost - a.cost);

  let safety = 0;
  while (playable().length && e.board.length < 7 && safety++ < 8) {
    const c = playable()[0];
    e.mana -= c.cost;
    e.hand = e.hand.filter((x) => x.uid !== c.uid);
    if (c.type === "minion") {
      c.sick = true;
      e.board.push(c);
      log(`Hassan plays ${c.nameAr} — ${c.meaning}.`);
    } else {
      applyEffect(c, e, battle.player, null);
      log(`Hassan casts ${c.nameAr} — ${c.meaning}.`);
    }
    renderBattle();
    await delay(550);
  }

  for (const m of [...e.board]) {
    if (m.sick) continue;
    if (!battle.enemy.board.find((x) => x.uid === m.uid)) continue;
    const taunts = battle.player.board.filter((x) => x.taunt && !x.silenced);
    if (taunts.length) {
      const t = taunts[0];
      t.health -= m.attack;
      m.health -= t.attack;
      m.sick = true;
      log(`${m.nameAr} hits ${t.nameAr}.`, "hit");
      if (t.health <= 0) removeMinion(t);
      if (m.health <= 0) removeMinion(m);
    } else {
      battle.player.hp -= m.attack;
      m.sick = true;
      log(`${m.nameAr} hits you for ${m.attack}.`, "hit");
    }
    renderBattle();
    await delay(400);
    if (battle.over) return;
  }
}

/* teach */
function openLesson(card, onDone) {
  teaching = true;
  save.taught[card.id] = true;
  persist();
  const ex = exampleOf(card);
  const modal = $("#modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="quiz lesson">
    <div>${cardHTML(card)}</div>
    <div>
      <h3>New word</h3>
      <div class="word">${card.nameAr}</div>
      <div class="sound">${card.nameLat} · ${card.say}</div>
      <div class="meaning">${card.meaning}</div>
      <div class="example">
        <div class="ar">${ex.ar}</div>
        <div>${ex.en}</div>
      </div>
      <p class="hint">${card.notes || card.flavor}</p>
      <p class="hint">You don't have to read the Arabic yet. Look at <strong>${card.nameLat}</strong>, hear it, remember it means <strong>${card.meaning}</strong>.</p>
      <div class="actions">
        <button class="hear" id="hear-btn">Hear it</button>
        <button class="hear" id="hear-ex">Hear the sentence</button>
        <button class="btn" id="got-it">Got it</button>
      </div>
      <p class="hint" id="hear-status">Click <strong>Hear it</strong>. A play bar appears at the bottom — unmute the tab if needed.</p>
    </div>
  </div>`;
  $("#hear-btn").onclick = () => speak(card.nameAr);
  $("#hear-ex").onclick = () => speak(ex.ar);
  const word = modal.querySelector(".word");
  if (word) {
    word.style.cursor = "pointer";
    word.title = "Click to hear";
    word.onclick = () => speak(card.nameAr);
  }
  $("#got-it").onclick = () => {
    modal.classList.add("hidden");
    teaching = false;
    if (onDone) onDone();
  };
}

function teachNewInHand() {
  if (!battle || battle.over) {
    teaching = false;
    return;
  }
  const unseen = battle.player.hand.filter((c) => !isTaught(c.id));
  if (!unseen.length) {
    teaching = false;
    renderBattle();
    return;
  }
  const unique = [];
  for (const c of unseen) {
    if (!unique.some((x) => x.id === c.id)) unique.push(c);
  }
  let i = 0;
  const next = () => {
    if (i >= unique.length) {
      teaching = false;
      renderBattle();
      return;
    }
    openLesson(unique[i++], next);
  };
  next();
}

/* quiz */
function openQuiz(card, onPass) {
  const bank = card.quizzes && card.quizzes.length ? card.quizzes : null;
  if (!bank) {
    onPass();
    return;
  }
  const q = bank[Math.floor(Math.random() * bank.length)];
  const order = q.choices.map((c, i) => ({ c, i }));
  const shuffled = shuffle(order);
  const modal = $("#modal");
  modal.classList.remove("hidden");
  modal.innerHTML = `<div class="quiz">
    <div>${cardHTML(card)}</div>
    <div>
      <h3>Cast ${card.nameLat}</h3>
      <div class="q">${q.q}</div>
      <div class="choices">
        ${shuffled
          .map(
            (o, n) =>
              `<button class="choice" data-i="${o.i}">${String.fromCharCode(65 + n)}. ${o.c}</button>`
          )
          .join("")}
      </div>
      <button class="hear" id="hear-btn">Hear ${card.nameAr}</button>
      <div class="say">Say it: <strong>${card.say}</strong></div>
    </div>
  </div>`;
  $("#hear-btn").onclick = () => speak(card.nameAr);
  modal.querySelectorAll(".choice").forEach((btn) => {
    btn.onclick = () => {
      const ok = +btn.dataset.i === q.answer;
      btn.classList.add(ok ? "correct" : "wrong");
      if (ok) {
        save.mastered[card.id] = (save.mastered[card.id] || 0) + 1;
        persist();
        setTimeout(() => {
          modal.classList.add("hidden");
          onPass();
        }, 280);
      } else {
        battle.player.hp -= 1;
        log(`Wrong. ${card.nameLat} means "${card.meaning}". Fizzle, -1 HP.`, "hit");
        const right = [...modal.querySelectorAll(".choice")].find(
          (b) => +b.dataset.i === q.answer
        );
        if (right) right.classList.add("correct");
        setTimeout(() => {
          modal.classList.add("hidden");
          renderBattle();
        }, 900);
      }
    };
  });
}

/* wire */
function bind() {
  $("#sound-test").onclick = async () => {
    setSoundStatus("Beep, then Ahlan…");
    try {
      ctx();
      beep();
      await delay(280);
      await speak("أهلا");
    } catch (err) {
      setSoundStatus("Sound error: " + (err && err.message ? err.message : err));
    }
  };
  $("#play-btn").onclick = () => {
    if (save.hero) startBattle();
    else goHero();
  };
  $("#continue-btn").onclick = () => startBattle();
  $("#collection-btn").onclick = goCollection;
  $("#back-title").onclick = goTitle;
  $("#pack-continue").onclick = startBattle;
  $("#again-btn").onclick = startBattle;
  $("#end-to-title").onclick = goTitle;
  $("#end-collection").onclick = goCollection;

  document.querySelectorAll(".hero-pick").forEach((el) => {
    el.onclick = () => {
      save.hero = el.dataset.hero;
      persist();
      goPrimer();
    };
  });
  $("#primer-go").onclick = openStarterPack;

  $("#collection-grid").addEventListener("click", (e) => {
    const wrap = e.target.closest("[data-id]");
    if (!wrap) return;
    const c = CARDS[wrap.dataset.id];
    if (c) openLesson(c, () => {});
  });

  $("#hand").addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (c) onHandClick(c.dataset.uid);
  });
  $("#hand").addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const el = e.target.closest(".card");
    if (!el || !battle) return;
    const card = battle.player.hand.find((x) => x.uid === el.dataset.uid);
    if (card) openLesson(card, () => renderBattle());
  });
  $("#player-board").addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (c) onPlayerBoardClick(c.dataset.uid);
  });
  $("#enemy-board").addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (c) onEnemyBoardClick(c.dataset.uid);
  });
  $("#enemy-hero").addEventListener("click", onEnemyHeroClick);
  $("#end-turn").onclick = endTurn;
  $("#hero-power").onclick = heroPower;
  $("#cancel-target").onclick = () => {
    battle.targeting = null;
    pendingPlay = null;
    renderBattle();
  };
}

window.addEventListener("load", () => {
  bind();
  document.addEventListener(
    "pointerdown",
    () => {
      try {
        ctx();
      } catch {
        /* ignore */
      }
    },
    { once: true }
  );
  goTitle();
});
