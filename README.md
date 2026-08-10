# Azeroth Lite — Mobile Browser WoW-style 3D RPG

A lightweight, fully client-side 3D action RPG inspired by World of Warcraft and Hordes.io.  
Runs directly in modern mobile browsers (Android Chrome, iOS Safari) and desktop browsers.  
No install, no server required for single-player.

## Features

- **Third-person 3D** with free camera look (mouse or touch drag)
- **Stylized characters** — tries to load the official Three.js Soldier GLB (animated); falls back to procedural low-poly knight / monsters
- **Combat system**: melee attack, 5 hotbar skills (Strike, Fireball, Heal, Lightning, Shield)
- **Enemies**: Goblins, Wolves, Skeletons, Orcs that chase and attack
- **RPG progression**: HP / MP / XP bars, leveling, gold, kill counter
- **Mobile controls**: virtual joystick + action buttons + touch look
- **Desktop controls**: WASD + mouse look (pointer lock) + 1–5 skills + Space jump
- **HUD**: player frame, target frame, minimap, action bar, combat log
- **Procedural world**: rolling terrain, trees, rocks, ancient pillars

## How to Play

1. Unzip the project.
2. Serve the folder with any static server (required for ES modules + GLTF loading):

   ```bash
   # Python
   python -m http.server 8080

   # Node
   npx serve .

   # VS Code Live Server, etc.
   ```

3. Open `http://localhost:8080` on your phone or desktop.
4. On mobile: use the left joystick to move, right-side buttons to jump / attack / skill, drag on the right half of the screen to look around.
5. On desktop: click the canvas to capture the mouse, WASD to move, left-click to attack, 1–5 for skills.

## Upgrading to Real Character Models

The game already includes `GLTFLoader`. To use your own models:

1. Place `.glb` / `.gltf` files in an `assets/` folder (or host them with CORS headers).
2. In `js/main.js`, change the `modelUrl` inside `createPlayer()`:

```js
const modelUrl = './assets/my-knight.glb';
```

3. For animated models, name clips containing "idle", "walk", "run" — the code auto-detects them.

Recommended free CC0 sources:
- Quaternius packs (poly.pizza / quaternius.com)
- Kenney assets
- Polygonal Mind / open-source-3D-assets

## Tech Stack

- Three.js r160 (ES modules via importmap + jsDelivr CDN)
- Vanilla JS (no build step required)
- CSS for HUD / mobile UI
- Optional GLTFLoader for production assets

## Performance Notes

- Pixel ratio capped at 2
- Soft shadows at 1024²
- ~14 enemies + procedural trees
- Designed to stay smooth on mid-range Android phones

## License

Code: MIT  
Uses Three.js (MIT) and optionally the Soldier example model from the Three.js repository.

Enjoy the realm!
