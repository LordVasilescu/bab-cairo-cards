# BAB - Cairo Cards

**A browser card-battle game that teaches Egyptian Arabic from zero.**
Plain HTML, CSS and vanilla JavaScript - no framework, no build step.

Every card is a real Egyptian Arabic word. You hear it, see it transliterated in English letters, play it once "open book" with the meaning showing, and after that the game hides the meaning and quizzes you when you try to play it. Miss the quiz and you take damage; recall a word correctly three times and it is marked *mastered* in your collection.

## Features

- **Card battler** in a Cairo *ahwa* (coffee house): mana curve, minions with attack/health and taunt, spells, a hero power, and an AI opponent that takes its own turns.
- **25-word card pool** (`js/cards.js`) - greetings, pronouns, food, reactions - each with Arabic script, transliteration, pronunciation hint, meaning, cultural notes and multiple-choice quizzes. Card effects include damage, healing, buffs, card draw, silence and destroy.
- **Gendered speech** - choose a masculine or feminine hero; the game teaches the matching conjugations (e.g. *kwayyes* / *kwayyesa*).
- **Spaced recall** - per-card progress (taught -> 1/3 -> 2/3 -> mastered) persisted in `localStorage`.
- **Native audio** - every Arabic word and prompt has a pre-generated Egyptian-dialect voice clip, played through the Web Audio API.
- Painted card and character art (AI-assisted).

## Run it

Audio clips are loaded with `fetch`, so serve the folder over HTTP rather than opening the file directly:

```bash
python tools/serve.py        # then open http://127.0.0.1:8765/
```

(`PLAY.bat` opens `index.html` directly - fine for a quick look, but sound needs the server.)

## Tools

- `tools/gen_audio.py` - scans `js/cards.js` for every Arabic string, synthesises it with the `ar-EG-SalmaNeural` voice via [edge-tts](https://pypi.org/project/edge-tts/), names clips by content hash, and regenerates `js/audio-map.js`. Requires `pip install edge-tts`.
- `tools/serve.py` - tiny no-cache static server for local play.

## Layout

```
index.html        screens (title, hero pick, primer, collection, battle)
css/game.css      styling
js/cards.js       card definitions + quizzes
js/game.js        game loop, AI, lessons/quizzes, save system, audio
js/audio-map.js   generated text -> clip map
assets/           card art + audio clips
tools/            audio generator, local server
```

## License

© 2026 Mathew Vasilescu. All rights reserved. Public for viewing only - see [LICENSE](LICENSE).
