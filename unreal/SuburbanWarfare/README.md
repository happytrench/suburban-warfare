# SUBURBAN WARFARE — Unreal Engine 5 version

The same game as the browser version (same six guns and numbers, same rules, same five Sullivan, IN maps),
rebuilt in Unreal Engine 5 so it can look like Hood Warfare 2 and ship on Steam.

**Status:** first version of the code, written without access to Unreal, so it has **not been compiled yet**.
Expect one round of build errors — send them over and they get fixed.

## What's in here

| Part | What it does |
|---|---|
| `Source/` (C++) | First-person player (walk, sprint, jump, aim down sights), 6 weapons with the browser game's damage, fire rate, spread, range falloff, headshots and learnable recoil patterns; server-authoritative shooting (no cheating by clients); reloads; spawn protection; FFA and Team Deathmatch with kill + time limits, 3-second respawns, spawn points away from enemies, kill feed, HOA announcements, kill cam, scoreboard (Tab), match end + map rotation; HUD |
| `Content/Python/build_maps.py` | Builds all 5 maps inside Unreal from the browser layouts: every building, wall, fence, car, prop, road and spawn point at the real positions, as coloured blocks with collision, lit by Unreal's sun + sky + clouds + fog |
| `Content/Python/maps/*.json` | The map layouts exported from the browser game (`node tools/export_unreal_maps.mjs`) |
| `Config/` | Lumen lighting, virtual shadows, controls (keyboard/mouse + controller) |

## Setup (one time, all free)

1. **Epic Games Launcher** → *Unreal Engine* tab → install **Unreal Engine 5** (latest 5.x). Big download — start it first.
2. **Visual Studio 2022 Community** (free) → in the installer tick **"Game development with C++"**. Unreal needs this to build the C++ code.
3. Get this folder onto your PC: in GitHub, switch to the `unreal` branch → *Code* → *Download ZIP*, unzip, open `unreal/SuburbanWarfare`.
4. Double-click **`SuburbanWarfare.uproject`**. Pick your Unreal version if asked. When it says *"modules are missing or built with a different engine version — rebuild?"* click **Yes**.
   - If it says the build failed: open `Saved/Logs/` (or the error popup), copy the error text and send it to Claude.
5. In the editor: **Tools → Execute Python Script…** → choose `Content/Python/build_maps.py`. It builds the five maps (takes a minute or two each) and opens the Cul-de-sac.
6. Press **Play** (Alt+P).

## Testing multiplayer

* **On one PC:** next to the Play button → ⋮ → *Number of Players: 2*, *Net Mode: Play As Listen Server* → Play. Two windows, both players.
* **With a friend:** *Platforms → Windows → Package Project*, zip the output, send it.
  The host presses **F1–F5** in the game (Cul-de-sac, Country Club, Farmstead, Fair, Lake) to host.
  The friend presses **~** and types `join <host IP>`.
  Easiest way over the internet with no router setup: both install **Tailscale** (free) and use the host's Tailscale IP.
  (Or forward UDP port 7777 on the host's router.)
* Team Deathmatch: press **~** and type `host culdesac tdm`. Options: `host lake ffa`, etc.

## Controls

WASD move · mouse look · left click shoot · right click aim · Shift sprint · Space jump · R reload · 1–6 / Q / scroll swap weapons · Tab scores · ~ console

## Making it look like Hood Warfare 2 (next steps, all free)

The blocks are placeholders in the right spots. Swap them for real models:

1. **Fab** (Epic's asset store, inside the launcher / fab.com): search *suburban houses*, *American houses*, *parking lot*, *gas station*, *cars*, *street props*, *chain link fence*, *grass*, *Megascans*. Filter by **Free**. Add to project.
2. **Lyra Starter Game** (free, Epic) — realistic guns, hit effects, sounds and animations to borrow.
3. **MetaHuman** (free with Unreal) — realistic people you can push into caricatures: beer gut, mullet, golf-dad, Karen bob. These replace the placeholder bodies.
4. Weapon models: put them in the character Blueprint's **Weapon Meshes** list (order: rifle, AK, SMG, shotgun, deer rifle, pistol).

Linking this chat to your PC through the Claude desktop app lets Claude run the editor, place models and fix errors directly instead of you relaying them.
