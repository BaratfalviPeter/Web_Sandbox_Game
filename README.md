# Hálózat & Gyár

Minimalista 2D logisztikai játék két rétegben — **Makró** (világtérkép: városok,
utak, járművek, lelőhelyek) és **Mikró** (a bánya belseje: bányagépek,
futószalagok, helyi raktár). A két réteg össze van kötve: a mikró raktár
áteresztőképessége adja a makró lelőhely kimenetét.

**Tech stack:** React 19 · TypeScript · Vite · Tailwind CSS · HTML5 Canvas

🎮 **Élő verzió:** https://baratfalvipeter.github.io/Web_Sandbox_Game/

## Játékmenet

### Makró nézet (világtérkép)
- Középen 2×2 cellás **Városközpont**. 2 lelőhellyel indul, újak 25–40 mp-enként
  jelennek meg (a szinttel nő a maximum, min. 2 cella távolságra egymástól és a
  várostól).
- Típus = szín: **szürke = Szén, zöld = Fa, sárga = Érc** (ugyanez a szín a mikró
  nézetben is).
- **Húzz utakat** (vastag, lekerekített) a lelőhelytől a városig. Egy jármű jár a
  bekötött lelőhelyre, BFS-sel keres utat, 2 egység kapacitással hordja a várost.
- A lelőhely körüli **gyűrű** a helyi raktár töltöttségét mutatja. Ha megtelik,
  **30 mp-es visszaszámlálás** indul (piros, pulzáló gyűrű). Ha az elszállítás
  újraindul, az időzítő megáll. Ha lejár → **Game Over**.
- Szintlépéskor a rács nő és a **kamera 600 ms alatt kizoomol**, +10 útelem jár.
  Szintküszöb: `16 + 8 * (szint - 1)`.

### Mikró nézet (a bánya belseje)
- 9×9 rács, fix 2×2 **Lokális Raktár** (mindig látható, rajta a darabszám).
- **Bányagép** (5 alkatrész): csak ércre rakható, 1 egység/mp a kimenete felé néző
  cellába. Ha nincs hova termelnie, **piros „!”** jelenik meg rajta.
- **Futószalag** (1 alkatrész): irányított cella, lapos csík mozgó nyilakkal.
  Húzás közben az irányt az **egér útvonala** adja; **R** billentyű forgat. Az
  elemek 2 cella/mp sebességgel haladnak, max. 3 fér egy cellára (torlódás
  visszaterjed). Ha a lánc nem ér a raktárhoz, a vége szaggatott vonallal jelez.
- Minden új lelőhely egy **előre lerakott, működő** bányagép+szalag lánccal indul.
- Az „egység/mp” az utolsó 10 mp raktárba érkezett egységeinek átlaga.

### Nézetváltás
- Belépés a mikróba: **dupla kattintás** egy lelőhelyre, vagy **görgő befelé**
  fölötte. Kilépés: **„Vissza a világtérképre”** gomb, vagy **görgő kifelé**.
- A mikró szimuláció a háttérben is fut, váltáskor az állapot nem vész el.

## Fejlesztés

```bash
npm install
npm run dev      # fejlesztői szerver
npm run build    # tsc típusellenőrzés + production build
npm run preview  # a buildelt verzió kiszolgálása
```

## Architektúra (v2 — szimuláció és rajzolás szétválasztva)

```
src/
├─ types.ts            # Megosztott adatmodell (Macro/Micro/View)
├─ colors.ts           # EGYETLEN közös COLORS forrás (mindkét nézet ezt használja)
├─ config.ts           # Hangolható konstansok (fix 20 Hz szimuláció)
├─ sim/
│  ├─ macro.ts         # Világtérkép logika: node-ok, BFS, járművek, szintlépés, Game Over
│  └─ micro.ts         # Bánya logika: bányagép/szalag/raktár, torlódás, áteresztőképesség
├─ render/
│  ├─ transform.ts     # Safe-area → rács transzformáció + segédek
│  ├─ pick.ts          # Képernyő → cella (safe-area + DPR tudatos)
│  ├─ macroRenderer.ts # Csak olvassa az állapotot
│  └─ microRenderer.ts # Csak olvassa az állapotot
├─ ui/                 # React overlay (MacroHud, MicroHud, GameOverModal)
└─ App.tsx             # Teljes-képernyős canvas, ResizeObserver, fix időlépés + rAF, nézetváltás
```

- **Teljes-képernyős canvas**: `ResizeObserver` + `devicePixelRatio` (éles retina).
- **UI-réteg**: a konténer `pointer-events: none`, csak a gombok/kártyák kapják
  vissza. A rács egy számított **safe area**-re skálázódik, így semmilyen UI nem
  takarja a játékmezőt (mikróban a raktár mindig látszik).
- **Fix 20 Hz szimuláció**, a rajzolás `requestAnimationFrame`-ből történik; a
  logika tiszta TS modulokban él, a renderer csak olvassa az állapotot.
