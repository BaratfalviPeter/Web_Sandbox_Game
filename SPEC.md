# Hálózat & Gyár v3 – Specifikáció

> Ez a v3 felváltja az eredeti és a v2 specifikációt. A Mini Motorways-os irányt elvetjük.
> A játék egy komoly, OpenTTD-szerű közlekedési-gazdasági szimuláció, amelynek
> különlegessége, hogy a bányák és erdészetek belsejét a játékos építi meg egy
> beágyazott rácson, és ez határozza meg a termelést.

## 0. Szabályok a fejlesztéshez (olvasd el először)

1. Ez egy referencia-dokumentum. **Ne építsd meg egyben.** A 11. fejezet lépéseit egyenként kapod meg, mindig csak az aktuális lépést készítsd el.
2. Minden szám (költség, sebesség, ráta) egyetlen `src/constants.ts` fájlban éljen, hogy később könnyen hangolható legyen.
3. A játéklogika (`src/sim/`) tiszta TypeScript, független a Reacttől és a Canvastól. A renderer (`src/render/`) csak olvassa az állapotot. A UI (`src/ui/`) parancsokat küld a szimulációnak.
4. TypeScript strict mód. Nincsenek külső képek vagy asset-ek, minden kódból van rajzolva.
5. Ne adj hozzá nem kért funkciót, és ne írd át a korábbi lépések működését. Ha egy korábbi lépésben hibát találsz, előbb jelezd.
6. A régi Mini Motorways-os kód nagy része nem kell. Új ágon (branch) dolgozz. A mikro nézet rácsrajzolása újrahasznosítható, ha tiszta és érthető.
7. Minden lépés végén sorold fel, mit ellenőrizzek kézzel (a lépés „Kész, ha” pontjai alapján).

## 1. Vízió és hangulat

Egy 2D-s, felülnézetes, csempealapú (tile) közlekedési tycoon játék. A játékos egy szállítmányozó céget épít: iparágakat köt össze utakkal és állomásokkal, teherautókat vásárol, és profitot termel. A hangulat komoly és gazdasági: számok, grafikonok, havi elszámolás, hitel, csőd. Nincs „game over” visszaszámláló, csak csőd.

**Egyedi elem:** a primer iparágakba (bánya, erdészet) be lehet lépni. Belül egy kis rácson bányagépeket és futószalagokat építesz, és ezek mérik, mennyi nyersanyagot termel az iparág a külső gazdaságnak.

**Vizuális stílus:** visszafogott, komolyabb paletta. Világos, halk színű térkép, sötétszürke UI-keretek, kompakt panelek, számokhoz monospace betűtípus. Nem játékszerű, de nem is steril. Lapos formák, finom árnyék, nincs csillogás.

## 2. Technológia és struktúra

- React 18, TypeScript (strict), Vite, Tailwind CSS a UI-hoz.
- A térkép egy teljes képernyős `<canvas>`. A rajzolás `requestAnimationFrame`-ből fut, a szimuláció fix időlépéssel (lásd 4. fejezet), a renderer interpolál.
- Seedelt véletlenszám-generátor (pl. mulberry32), hogy ugyanabból a seedből ugyanaz a térkép jöjjön létre.
- `devicePixelRatio` kezelése, `ResizeObserver` az ablakméretezéshez.
- Javasolt mappák: `src/constants.ts`, `src/types.ts`, `src/sim/` (world, time, economy, industries, roads, stations, vehicles, micro, save), `src/render/` (mapRenderer, microRenderer), `src/ui/` (HUD, ablakok, eszköztár).

## 3. Világ és kamera

- Térkép: **96 × 96 csempe**, egy csempe 32 px alapméretben.
- Terep: fű és víz (a víz nem építhető be). Generálás seedelt value-noise-szal. A víz a térkép kb. 12–15%-a, összefüggő foltokban.
- Kamera: pásztázás jobb vagy középső egérgombbal húzva és WASD/nyilak billentyűkkel, zoom egérgörgővel (0.5×–3×), a zoom az egér pozíciója felé irányul. Csak a látható csempéket rajzold ki.
- A kijelölt csempe kiemelése (hover). Az aktív eszköz (út, állomás, bontás) előnézetet mutat.
- A térkép nem tágul és nem zoomol ki automatikusan.

## 4. Idő

- Naptár: kezdődátum 1950. január 1. 1 játéknap = 1 másodperc 1× sebességnél.
- Sebességek: szünet, 1×, 2×, 4×. Szünetben is lehet építeni.
- A szimuláció napi lépésekre épül (1 nap = 1 tick, a sebesség a valós időt skálázza). A járművek mozgása napon belül finomabb lépésekre bontott, hogy sima legyen.
- Hónap végén: havi elszámolás (költségek, kamat, bevétel archiválása).

## 5. Gazdaság

Pénznem: **Ft**. Alapértékek (mind `constants.ts`-ben, hangolhatók):

| Tétel | Érték |
|---|---|
| Kezdőtőke | 500 000 Ft |
| Maximális hitel | 1 000 000 Ft, éves kamat 8%, havonta számolva |
| Út építése | 200 Ft / csempe |
| Állomás | 5 000 Ft |
| Teherautó | 40 000 Ft |
| Bányagép (mikro nézet) | 8 000 Ft |
| Futószalag (mikro nézet) | 200 Ft |
| Útfenntartás | 2 Ft / csempe / hónap |
| Állomás fenntartás | 150 Ft / hónap |
| Jármű fenntartás | 600 Ft / hónap |
| Bontás | nincs visszatérítés a térképen; a mikro nézetben 100% |

**Fuvardíj** (szállított egység × távolság × díj × időfaktor):

- Távolság: a felvételi és a lerakó állomás közötti Manhattan-távolság csempében.
- Díj / egység / csempe: Szén 12, Érc 14, Fa 10, Acél 20, Áru 30 Ft.
- Időfaktor: 40 napig 100%, utána lineárisan csökken, de legalább 50%.
- Példa: 20 egység szén 30 csempére, gyors úton: 20 × 30 × 12 = 7 200 Ft.

**Csőd:** ha a pénz három egymást követő hónap végén negatív, és a hitel is a maximumon van, a játék véget ér. Figyelmeztetés jelenik meg már az első negatív hónap végén.

**Cégérték** = pénz + járművek és állomások értéke − hitel. Havonta rögzítve, grafikonon látható.

## 6. Iparágak és áruk

Áruk és színek (ez a színkód minden nézetben ugyanaz): Szén (sötétszürke), Érc (sárga), Fa (zöld), Acél (kék), Áru (narancs).

| Iparág | Típus | Elfogad | Termel |
|---|---|---|---|
| Szénbánya | primer | – | Szén |
| Ércbánya | primer | – | Érc |
| Erdészet | primer | – | Fa |
| Erőmű | másodlagos | Szén | – (csak fogyaszt) |
| Vasmű | másodlagos | Érc | Acél (1 Érc → 1 Acél) |
| Gyár | másodlagos | Acél + Fa | Áru (1 Acél + 1 Fa → 2 Áru) |
| Város | fogyasztó | Áru | – |

- Az iparágak 3×3 csempések, a városok 6–10 házból álló, összefüggő csoportok.
- Generálás induláskor: 3 szénbánya, 3 ércbánya, 3 erdészet, 1 erőmű, 2 vasmű, 2 gyár, 3 város. Szabály: nem vízen, minimum 4 csempe távolság egymástól.
- **Primer termelés / hónap** = alaptermelés (20 egység) + a mikro nézet kimenete (lásd 8. fejezet). A termelt egységek azonnal szétosztódnak a lefedettségi körzetben lévő állomások között (lásd 7. fejezet).
- **Másodlagos iparágak:** a leszállított áru a bemeneti készletbe kerül. A Gyár csak akkor termel, ha mindkét bemenetből van készlet. A kimenet ugyanúgy eljut a körzetben lévő állomásokhoz.
- **Város növekedése:** ha a hónapban legalább `népesség / 20` Áru érkezik, a város 5%-kal nő (több ház jelenik meg). Egyébként nem nő.

## 7. Közlekedés (az első verzióban csak közút)

**Út:** csempealapú, húzással építhető, a szomszédos útcsempék vizuálisan összekapcsolódnak (egyenes, kanyar, T, kereszt). Vízre nem építhető. Bontás eszközzel törölhető.

**Állomás:** meglévő útcsempére építhető (átmenő/drive-through), a járművek itt állnak meg. Lefedettségi körzet: a csempe körüli 7×7-es terület (3 csempe sugár), ez látható is az építés előnézetében.

- Az állomás körzetében lévő iparágak termelését az állomások osztják szét: egy iparág kimenetét egyenlő arányban kapják a körzetében lévő állomások.
- Az állomás **értékelése** (rating) a kimenetnek azt a hányadát adja, ami valóban az állomásra kerül, a többi elvész. Alap: 70%. Ha az elmúlt 20 napban egy jármű rakodott az állomáson: 85%. Ha 60 napja nem: fokozatosan csökken 40%-ig.
- Az állomás **elfogad** egy árut, ha a körzetében van olyan iparág vagy város, ami elfogadja. A leszállított áru elfogy (nem kerül vissza a készletbe), nem lehet „ide-oda pattogtatni”.
- Várakozó rakomány kapacitása árunként 200 egység, afelett elvész.

**Jármű (Teherautó):**

- Vásárláskor árut választasz (pl. Szén-teherautó), kapacitás 20 egység, sebesség 2 csempe/nap.
- A jármű az állomáson jelenik meg, ahová vásárolod.
- Parancsok (orders): legalább 2 megálló. Megállónként állítható: „Várj a teljes rakományra”.
- Megálló viselkedése: 1) lerakja az árut, ha az állomás elfogadja (bevétel), 2) felrakodik a várakozó rakományból a saját árutípusából.
- Útkeresés: BFS vagy A* az úthálón. Ha nincs út a következő megállóhoz, a jármű megáll, piros jelzést kap, és a járműlistában „Nincs útvonal” állapot látszik.
- Első verzióban a járművek nem ütköznek egymással (átmehetnek egymáson), és bármelyik csempén megfordulhatnak.
- Megjelenés: kis színes téglalap (az áru színében), sima mozgás a csempék közepe között, megfelelő irányba fordítva.

## 8. Mikro nézet (az iparág belseje)

Csak a **primer** iparágakra (szénbánya, ércbánya, erdészet). Megnyitás: az iparág ablakában a „Belső nézet” gombbal vagy duplakattintással az iparágra. Vissza: „Vissza a térképre” gomb vagy Esc.

- **Elrendezés:** 9×9-es rács, középre méretezve. Az eszköztár a rács **alatt** áll, soha nem takarja. A súgószöveg külön sávban jelenik meg, nem a rácson.
- **Nyersanyagcellák:** az iparág színében, 6–10 darab, seedelt módon elosztva. A Kimeneti Raktártól legalább 2 cella távolságra.
- **Kimeneti Raktár:** fix helyen, 2×2 cellás, mindig jól látható (pl. a rács alsó középső részén), nem törölhető. Rajta a számláló.
- **Bányagép:** csak nyersanyagcellára rakható (máshol piros szellemkép). Iránya van (nyíl), 0.5 egység/nap termelést ad a kimenete felé néző cellába. Ha a kimeneti cella nem fogad el semmit, a gépen piros „!” jelenik meg.
- **Futószalag:** egy cella, iránya van (fel/jobbra/le/balra). Húzáskor az irányt az egér útvonala adja, `R` billentyű forgat. Lapos sötétszürke csík, rajta az irány felé mozgó nyíl-mintázat. A szalag 2 cella/nap sebességű, cellánként max. 3 elem, torlódásnál visszaterjed a feltorlódás (backpressure). A Kimeneti Raktárba érve az elem bekerül.
- **Építési költség:** valódi pénz (5. fejezet), így a belső fejlesztés a cég pénzét költi. Bontáskor teljes visszatérítés.
- **Kezdő segítség:** minden iparág egy előre lerakott bányagéppel és rövid, működő szalaggal indul (ingyen).
- **Mérés:** a Kimeneti Raktárba érkezett egységek mozgóátlaga az elmúlt 30 napból, havi értékre átszámolva. Ez jelenik meg a UI-n és ez adja a termelés mikro-részét.
- **Háttérszimuláció:** minden primer iparág belseje folyamatosan szimulálódik, akkor is, ha a játékos nem nézi. A Kimeneti Raktárba érkezett egységek azonnal az iparág kimenetére kerülnek (7. fejezet szerint szétosztva az állomásoknak).
- A játék működjön a mikro nézet használata nélkül is (alaptermelés), a mikro nézet a mélység és a növekedés eszköze.

## 9. UI (komoly, informatív)

- **Felső sáv:** dátum, pénz (negatívnál piros), hitel, sebességgombok (szünet/1×/2×/4×), menü.
- **Bal oldali eszköztár:** Út, Állomás, Bontás, Jármű vásárlása, Kijelölés/Info.
- **Mozgatható ablakok:** Pénzügyek (havi bevétel/kiadás táblázat az utolsó 12 hónapról, cégérték-grafikon, hitel felvétele/törlesztése), Járműlista (név, útvonal, árutípus, éves profit, állapot), Jármű ablak (parancsok szerkesztése), Állomás ablak (várakozó rakomány árunként, értékelés, mit fogad el), Iparág ablak (termelés/hó, mennyit szállítanak el %-ban, „Belső nézet” gomb), Város ablak (népesség, a hónapban kapott áru).
- **Értesítések:** egy-egy sor a felső sáv alatt (új járműnek nincs útja, negatív hónap, stb.), kattintásra a térkép odaugrik.
- A térképen kattintással kijelölhető minden iparág, város, állomás és jármű, és megnyílik az ablaka.

## 10. Vesztés, mentés

- **Vesztés:** csőd (5. fejezet). Nincs nyerés, a cél a cégérték növelése. Később jöhetnek célkitűzések.
- **Mentés:** automatikus havi mentés `localStorage`-ba, verziózott JSON formátumban (a seed, az állapot, a mikro rácsok, a járművek). Betöltés a menüből, új játék gomb.

## 11. Lépések (sorrendben, egyenként)

### 1. lépés – Projektalap, térkép, kamera
„Dolgozz egy új ágon (v3). Hozd létre a projekt struktúráját a SPEC.md 2. fejezete szerint (constants.ts, types.ts, sim/, render/, ui/). Valósítsd meg a 3. fejezetet: 96×96-os seedelt térkép (fű és víz), teljes képernyős canvas, devicePixelRatio és ResizeObserver kezelés, pásztázás és zoom, hover-kiemelés. Csak a látható csempéket rajzold ki. Még nincs idő, pénz, iparág vagy út.”

**Kész, ha:** a térkép sima, nagyítható és mozgatható, a víz nincs szétszórva pontokban, ugyanaz a seed ugyanazt a térképet adja.

### 2. lépés – Idő, pénz, felső sáv
„Valósítsd meg a 4. fejezet idő-rendszerét (naptár, szünet/1×/2×/4×, napi tick fix időlépéssel) és az 5. fejezet pénz-alapjait (kezdőtőke, hitel felvétele/törlesztése). Készítsd el a felső sávot a dátummal, pénzzel, hitellel és sebességgombokkal. Készíts egy üres Pénzügyek ablakot, ami mozgatható. A havi elszámolás egyelőre csak a hitelkamatot vonja le.”

**Kész, ha:** a dátum a sebességnek megfelelően halad, a hónapváltáskor levonódik a kamat, a hitel kezelhető.

### 3. lépés – Iparágak és városok
„Generálj iparágakat és városokat a 6. fejezet szerint (darabszámok, minimum távolság, nem vízen). Rajzold ki őket a színkódoknak megfelelően, felirattal. Kattintásra nyíljon meg az Iparág és a Város ablak (egyelőre csak az alapadatokkal, termelés nélkül). Kamera ugrás az értesítésből még nem kell.”

**Kész, ha:** a térképen jól felismerhető iparágak és városok vannak, kattintásra az adataik látszanak.

### 4. lépés – Út építése és bontása
„Valósítsd meg az Út és Bontás eszközt a 7. fejezet szerint: húzással építhető út, az útcsempék vizuálisan kapcsolódnak (egyenes, kanyar, T, kereszt), vízre nem építhető, a költség és az útfenntartás működik. A havi elszámolás vonja le az útfenntartást. Mutass előnézetet és költséget építés közben.”

**Kész, ha:** az út szépen kapcsolódik, a pénz csökken építéskor, a havi elszámolásban látszik a fenntartás.

### 5. lépés – Állomások és áruelosztás
„Valósítsd meg az Állomást a 7. fejezet szerint: csak meglévő útcsempére építhető, látható a 7×7-es lefedettségi körzet, az iparágak termelése (egyelőre az alaptermelés: 20 egység/hó a primer iparágaknak) szétosztódik a körzetben lévő állomások között az értékelés szerint. Az Állomás ablakban látszik a várakozó rakomány árunként, az értékelés és hogy mit fogad el az állomás.”

**Kész, ha:** egy bánya melletti állomáson nő a várakozó rakomány a termelés ütemében, a rating a szabályok szerint változik.

### 6. lépés – Járművek és fuvardíj
„Valósítsd meg a Teherautót a 7. fejezet szerint: vásárlás árutípus szerint egy állomáson, parancsok szerkesztése (legalább 2 megálló, opcionális „várj a teljes rakományra”), útkeresés az úthálón, lerakodás és felrakodás, fuvardíj és időfaktor az 5. fejezet szerint. Készítsd el a Jármű ablakot és a Járműlistát. Ha nincs útvonal, a jármű piros jelzést kap és ez látszik a listában. Jármű fenntartás a havi elszámolásban.”

**Kész, ha:** egy bánya és egy erőmű közötti útvonalon a teherautó szenet szállít, a pénz nő, a járműlistán látszik a profit.

### 7. lépés – Ipari láncok és városnövekedés
„Valósítsd meg a másodlagos iparágakat a 6. fejezet szerint: bemeneti készlet, Vasmű (1 Érc → 1 Acél), Gyár (1 Acél + 1 Fa → 2 Áru), Erőmű (csak fogyaszt), a kimenet szétosztása az állomásoknak. A város növekedjen a hónapban kapott áru alapján, jelenjenek meg új házak. Az Iparág és Város ablak mutassa a készleteket és a termelést.”

**Kész, ha:** a teljes lánc (érc → acél, + fa → áru → város) végigvihető szállítással, és a város nő.

### 8. lépés – Pénzügyek, csőd
„Készítsd el a teljes Pénzügyek ablakot: havi bevétel/kiadás táblázat az utolsó 12 hónapról (út, állomás, jármű, kamat, fuvardíj), cégérték-grafikon, hitelkezelés. Valósítsd meg a csődöt az 5. fejezet szerint, figyelmeztetéssel az első negatív hónap végén és Game Over képernyővel.”

**Kész, ha:** a csőd feltétele működik és tesztelhető (pl. fejlesztői gombbal pénz levonása), a grafikon frissül.

### 9. lépés – Mikro nézet: elrendezés, nyersanyag, bányagép
„Valósítsd meg a Mikro nézet alapjait a 8. fejezet szerint: nézetváltás a primer iparágból (gomb és duplakattintás), Vissza gomb és Esc, 9×9-es rács középre méretezve, az eszköztár a rács alatt (nem takarja), súgó külön sávban, nyersanyagcellák az iparág színében, fix Kimeneti Raktár jól láthatóan, bányagép csak nyersanyagcellára rakható (piros szellemkép máshol), irány nyíllal. A költség a valódi pénzből vonódjon, bontáskor teljes visszatérítés. Még nincs szalag-szimuláció.”

**Kész, ha:** a rács nem takarható, a raktár látszik, a bányagép csak ércre rakható, a nézetváltás oda-vissza hibátlan.

### 10. lépés – Mikro nézet: futószalagok és áramlás
„Valósítsd meg a futószalagot a 8. fejezet szerint: egy cella, irány húzás közben az egér útvonalából, R forgat, lapos csík mozgó nyíl-mintázattal, az elemek 2 cella/nap sebességgel haladnak, cellánként max. 3 elem, backpressure, a raktárba érve az elem bekerül. A bányagép a kimenete felé néző cellába termel. Piros „!” a nem szállító gépen, szaggatott jelzés a raktárhoz nem érő szalagvégen. Minden iparág induljon egy előre lerakott működő géppel és szalaggal.”

**Kész, ha:** az ércek végigmennek a szalagon, a raktár számlálója nő, a szalag iránya a húzásból adódik.

### 11. lépés – Mikro–makro kapcsolat
„Kapcsold össze a két szintet a 6. és 8. fejezet szerint: minden primer iparág belseje folyamatosan szimulálódik háttérben is. A Kimeneti Raktárba érkező egységek azonnal az iparág kimenetére kerülnek, és szétosztódnak a körzetben lévő állomások között. A primer termelés = alaptermelés + mikro kimenet. Az Iparág ablak mutassa: alap, mikro-kimenet, összes/hó és hogy mennyit szállítanak el %-ban.”

**Kész, ha:** több bányagép építésével az állomás várakozó rakománya gyorsabban nő, és ez az Iparág ablakban is látszik.

### 12. lépés – Mentés és csiszolás
„Valósítsd meg az automatikus havi mentést localStorage-ba (verziózott JSON: seed, állapot, mikro rácsok, járművek), betöltést és új játékot. Értesítések kattintásra odaugró kamerával. Finomítsd a UI-t (kompakt panelek, monospace számok) és a térkép megjelenését, hogy komoly, informatív hatást keltsen.”

**Kész, ha:** oldalfrissítés után a játék onnan folytatható, ahol abbahagytad, és minden ablak és nézet helyesen töltődik vissza.

## 12. Későbbi bővítések (most ne építsd meg!)

Vasút és vonatok, terepmagasság, járműromlás és elavulás, versenytárs-vállalatok, mikro nézet a másodlagos iparágaknak (Vasmű, Gyár), izometrikus nézet, hangok, célkitűzések és küldetések, utasszállítás.
