# Hálózat & Fejlődés

Minimalista 2D logisztikai / városépítő puzzle játék — a "Mini Motorways" letisztult
hangulata nyersanyag-menedzsmenttel ötvözve.

**Tech stack:** React 19 · TypeScript · Vite · Tailwind CSS · HTML5 Canvas

## Játékmenet

- Középen a **Városközpont**. Körülötte véletlenszerűen **nyersanyag lelőhelyek** jelennek meg.
- **Húzz utakat** (egérrel, drag & drop a canvason) a lelőhelyektől a városig.
- Sikeres összekötés után kis **járművek** ingáznak az úton, és nyersanyagot
  szállítanak a városba.
- A beérkező nyersanyag tölti a város fejlődés-sávját. Ha betelik → **szintlépés**:
  a kamera kizoomol (nagyobb rács), bónusz utakat kapsz, és a város vizuálisan is nő.
- Ha egy lelőhely **megtelik** és nem viszik el időben, piros villogással
  visszaszámlálás indul. Ha lejár → **Game Over** (modal az eredménnyel + "Új játék").

### Irányítás

| Művelet | Hogyan |
|---|---|
| Út lerakása | Bal egérgomb lenyomva húzás üres cellákon |
| Út törlése | Jobb klikk, vagy kattintás meglévő útra és húzás |

## Fejlesztés

```bash
npm install
npm run dev      # fejlesztői szerver
npm run build    # típusellenőrzés (tsc) + production build
npm run preview  # a buildelt verzió kiszolgálása
```

## Architektúra

```
src/
├─ game/
│  ├─ types.ts      # Erős TS tipizálás: Cell, CityHub, ResourceNode, RoadSegment, Vehicle, GameState
│  ├─ config.ts     # Hangolható konstansok + pasztell színpaletta
│  ├─ engine.ts     # Állapot, BFS pathfinding, connectivity, szintlépés, per-frame tick
│  ├─ renderer.ts   # Canvas rajzolás (flat/pastel, lekerekített utak), zoom-transform
│  └─ input.ts      # Képernyő → grid cella konverzió
└─ components/
   ├─ GameCanvas.tsx   # requestAnimationFrame game loop, egér-interakció, zoom animáció
   ├─ StatsPanel.tsx   # Bal felső: szint + progress bar
   ├─ RoadsPanel.tsx   # Jobb alsó: elérhető út-csempék
   └─ GameOverModal.tsx
```

- A szimuláció állapota egy `useRef`-ben él (teljesítmény miatt a game loop
  helyben mutálja), a UI overlay pedig egy könnyű snapshotot kap `useState`-en
  keresztül (~10/mp frissítéssel).
- A megjelenítés egyetlen `<canvas>`-on történik, amit egy `useEffect`-ben futó
  `requestAnimationFrame` loop vezérel.
- A járművek pixel-pontos pozícióval mozognak, az útvonalukat BFS számolja a
  lerakott utakon (csak vízszintes/függőleges szomszédok).
