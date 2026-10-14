# Hálózat & Gyár (v3)

Komoly, OpenTTD-szerű 2D közlekedési-gazdasági szimuláció. A primer iparágak
(bányák, erdészet) belsejét a játékos építi meg egy 9×9-es rácson, és ez növeli
a termelést. A teljes specifikáció: [`SPEC.md`](SPEC.md).

**Tech:** React 19 · TypeScript (strict) · Vite · Tailwind CSS · Canvas 2D — nincs külső asset.

## Futtatás

```bash
npm install
npm run dev      # fejlesztői szerver
npm run build    # tsc (strict) + production build
```

## Irányítás

| Művelet | Bemenet |
|---|---|
| Pásztázás | jobb / középső egérgomb húzás, WASD vagy nyilak |
| Zoom (0.5×–3×, az egér felé) | egérgörgő |
| Eszközök | bal eszköztár vagy `1` Info · `2` Út · `3` Állomás · `4` Bontás · `5` Jármű |
| Út | húzás (L alakú útvonal, előnézet + költség) |
| Bontás | kattintás vagy téglalap húzása (nincs visszatérítés) |
| Szünet / folytatás | szóköz vagy a felső sáv gombjai (1× / 2× / 4×) |
| Belső nézet | duplakattintás egy primer iparágra, vagy az Iparág ablak gombja |
| Mikro nézetben | bal klikk/húzás: lerakás · jobb klikk: bontás · `R`: forgatás · `Esc`: vissza |

## Struktúra

```
src/
├─ constants.ts      # minden hangolható szám és szín
├─ types.ts          # JSON-szerializálható adatmodell
├─ sim/              # tiszta TS játéklogika (React/Canvas nélkül)
│  ├─ rng.ts  world.ts  time.ts  economy.ts  notices.ts
│  ├─ roads.ts  stations.ts  industries.ts  vehicles.ts
│  ├─ micro.ts  game.ts (fix időlépés)  save.ts  defs.ts
├─ render/           # csak olvas: camera.ts, mapRenderer.ts, microRenderer.ts
├─ ui/               # React panelek: TopBar, Toolbar, Notices, Window, windows/*, MicroHud
└─ App.tsx           # canvas, input, rAF-loop, parancsok a szimulációnak
```

Mentés: automatikusan minden hónap végén és az oldal elhagyásakor a `localStorage`-ba
(verziózott JSON: seed, állapot, mikro rácsok, járművek, ablakok, kamera).
