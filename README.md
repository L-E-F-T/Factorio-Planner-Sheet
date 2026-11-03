# Factorio Ratios

A one-screen ratio calculator for the Factorio base game (2.1), built to be used while playing.
Every number comes from the game's own prototype files, not from a wiki table.

## Run it

* **Online:** <https://l-e-f-t.github.io/Factorio-Planner-Sheet/> always has the latest version, on any PC
  or phone, with nothing to install. Your factory is saved in that browser, separately from a copy you
  run yourself.
* **Double-click `index.html`.** That is all. It works straight from the file, offline, in any browser.
* **Beside the game:** a chromeless window fits well next to Factorio:
  `chrome --app=file:///C:/path/to/factorioSheet/index.html --window-size=460,800`.
* **Phones and small windows:** below 700 px wide every table turns into one card per row, each value with
  its caption above it, and a chain's deeper rows step in. Below 900 px "Your base" folds into one line
  showing its choices as icons (tap it to open the full strip; it folds again when you go to another page),
  and the search suggestions stay on one line that scrolls sideways. On the ledger the tabs sit three to a
  row, "what uses it" rows tuck in under their item, and on a touch screen the short list is one line you
  swipe. On a phone the home cards sit two to a row and the reference tables wrap, with the first column
  pinned where a table still needs scrolling. Touch screens get bigger buttons, and picking a search result
  or adding a row puts the keyboard away. A machine picker opens above its button when there is no room
  below it.

## Host it

Three launchers. The server is a small PowerShell script (`serve.ps1`) that only serves this folder; it
runs as your normal user. Only the firewall change asks for Administrator, through the usual prompt.

* **`Start LOCAL.bat`**: serves `http://localhost:8765/` for this PC only. Nothing outside can reach it.
  (If a public session was left open, it notices and offers to close it.)
* **`Start PUBLIC.bat`**: one admin prompt, then it opens Windows Firewall for TCP 8765, serves on every
  interface, prints the address to give your friends, and lists each connection. The elevated helper stays
  in the background and removes the firewall rule the moment the session ends, whether you press **Q**,
  Ctrl+C, or close the window, so the PC is reachable only while the window is running.
* **`Close public access.bat`**: safety net for the unlikely case the helper was killed (a reboot
  mid-session, say). `Start LOCAL.bat` also checks and offers to remove a leftover rule.

Starting a launcher while another one is still running is harmless: the new window says the app is
already running (and since when), LOCAL opens the browser to it, and PUBLIC asks you to close the
other window first. If some other program holds port 8765, the window names that process.

What you set up once, outside the app: a DHCP reservation (or static address) for this PC, and a
router rule forwarding external TCP 8765 to this PC's address, port 8765. Friends then open
`http://<your public IP>:8765/`; the PUBLIC window prints that address. From inside your own network
use the LAN address it prints instead (most home routers do not loop a public address back in).
If your public IP changes often, a free dynamic-DNS name saves resending it. The server is plain HTTP,
which is fine for a calculator: there is no login and nothing is stored server-side; each visitor's
settings live in their own browser.

## Use it

Type what you are making. The best match is shown as you type; no Enter needed.

| You type | You get |
|---|---|
| `eng` | the engine unit chain |
| `5 gear` | gears with 5 assemblers |
| `5 gear > engine` | what 5 gear assemblers feed: 100 engine assemblers, 10 pipe assemblers, 60 steel furnaces |
| `5 iron plate > engine` | the same, counting every place iron plate is used in the chain (gears, pipes, steel) |
| `15 stone`, `2 lanes of stone` | the stone page with that many drills, or that much stone |
| `2 lanes of green circuits` | green circuits at that amount (also `1 belt`, `15/s`, `900/min`) |
| `10 steam engines`, `100 solar`, `2x2 reactor`, `8 stone furnaces`, `10 labs` | the matching power / mining / science card, set to that number |

The chain is a table with three columns: **Item**, **Machines making it** (a box with the count and the
machine type), and **Amount** in the unit named in the column header. The top row is the thing you are
making; the rows under "needs" are its ingredients. **Change any box** and everything else follows.
`2.4 build 3` means the exact answer is 2.4 machines, so build 3. Where a machine count is only shown,
not typed (on the power, mining and uranium pages, say), it is the other way round: the big number is
what to build and the small one says the exact count, as in `12 exactly 11.4`.

* **Your base** (the strip under the search box) is what the numbers assume: assembler tier, furnace,
  drill, belt colour, mining productivity. A fresh browser starts at the early game (assembler 1, stone
  furnace, burner drill, yellow belt, no research); after that it is simply whatever you chose last. There
  is nothing to reset: change it when your base changes.
* **Amounts in** picks the one unit used everywhere: lanes of your belt (default; a belt has two lanes,
  so a yellow lane is 7.5 items per second), full belts (15 per second for yellow), items per second,
  or items per minute. Fluids are always per second.
* Click the machine name in a row to try a different assembler or furnace for that row (a what-if; set your factory's machines on the ledger).
* Click an ingredient's name to make it the product, carrying its amount down the chain. ▸ opens one more level.
* **Whole chain** adds everything up: furnaces, drills, the refineries for the oil it needs (with the
  processing chosen on the Oil page), and electricity.
* **Home** (top left, on every page) goes back to the full list; **Factory** beside it opens the Your factory
  ledger; **←** goes back one step.
* **Raw resources** (stone, iron ore, copper ore, coal, wood, water) have a page of their own. The first row
  is the supply: drills on one side, amount on the other. Every item below it is sized as if all of that
  supply went to it, with its other ingredients under it, so changing any box moves the whole page. Links
  at the bottom go one step further. Open one by clicking the resource in any chain or typing its name; the
  mined ones also head the Intermediate products list.
* **Your factory** (the Factory button beside Home, or search "factory") is the one place that saves. It is
  a ledger in tabs: **Everything**, **Mining & smelting**, **Assembling**, **Oil & chemicals**, **Power** and
  **Science**. Each row sits in the tab of the machine that makes it. A new ledger starts with the basics at 0
  (drills on iron, copper, coal and stone, the smelting, gears, cable, circuits, boilers, steam engines, labs,
  red and green science). Each tab's dashed row at the bottom adds more, and only offers what belongs there:
  click it for the list of everything that tab can hold (Everything lists all of it, grouped by tab), or type
  to narrow it; pick one, type how many, Enter adds it. A tab shows a red count when something in it is short.
  * **Import a blueprint**: paste a blueprint or blueprint book string into the box under a tab and press
    Import. It counts the assemblers, chemical plants, refineries, labs, boilers, steam engines, solar panels,
    pumpjacks and offshore pumps in it (books inside books too) and overwrites those counts. Rows already in
    your ledger update at once; new ones are listed with a tick box and added when you press Add ticked.
    Furnaces and drills do not record what they smelt or mine, so the import asks how to split them; each
    line counts down how many of its machines are still unassigned as you type (red if you give out too
    many). When one
    item is made in mixed tiers, the tier with the most machines wins and the rest count as the same output
    in it. On a tab, the import only touches that tab: the rest is listed as "Not added here", by the tab
    it goes on, so import on that tab or on Everything to add it; on Everything it covers all of them.
    Modules and beacons are ignored.
  * An item row has the machines making it, what they make, what the rest of your factory uses, and what is
    left over: "short" in red, with how many machines close the gap, or "fulfilled" in green, with how much
    is left over. Type into any box and the page recounts as you type; empty or 0 takes the item out.
    **Remove** under a row's name does the same and also forgets its machine choice and any dismissal;
    the row stays until you leave the page, with **Put back** to bring it back as it was.
    Anything your machines use that you have not entered shows grey as "not entered", with how many
    machines to add, the same as a short row.
  * **The top of each tab** counts what is short, what is used but not entered (rows marked "not entered")
    and what is fulfilled; a count of 0 is left out, except short. Click a count to see only those rows
    (dismissed shortages stay out of **short**, as they do out of its count): a row you change meanwhile
    stays until you click the count again, which shows every row. Steam and Electricity have no box of
    their own, so they come with the boilers, steam engines and solar panels that make them. Under the
    counts, what is short is listed, biggest gap first: click a name to go to its row, or × to dismiss a
    shortage you are fine with. **Dismiss all** dismisses everything listed, and
    **Bring back N dismissed** lists them again.
    Both work on the tab you are on, so you can dismiss all the science on the Science tab; on Everything
    they cover every tab. Dismissing only takes a shortage out of that list, the short count and the tabs'
    red counts: its row below still shows it short. Dismissals are saved with your factory.
  * Every row has its own machine: click it to pick the assembler tier, furnace or drill (and the recipe,
    for the few items with a choice, like solid fuel). The count stays the same and the output follows. The
    choice is used on every page, and entering a row pins its machine, so changing "Your base" later does
    not change what you already have. "Your base" is only the default for things not in your factory.
  * **Power** has boilers, steam engines and solar panels, then a Steam row (boilers' 60 per second against
    engines' 30) and an Electricity row (engines and solar against everything electric you entered).
    Boilers' coal and water show on the Coal and Water rows.
  * **Science** has your labs, with the research time and lab speed they run at; they eat each science
    pack you make.
  * **Oil & chemicals** starts with crude oil: your pumpjacks against what your refineries take, running flat
    out like every other machine (20 per second each). Then your oil refineries (basic or advanced
    processing, with what each takes and makes) and heavy and light oil cracking plants, each set against
    what your factory's oil products need, with how busy they are. Refineries on Advanced and cracking
    plants also take water, which shows on the Water row. The
    petroleum gas, light oil and heavy oil rows show what your refineries really deliver with nothing
    backing up: a refinery stops once any of its outputs has nowhere to go, so too little cracking shows
    up as a shortage, with the reason on the refinery row. Plastic, sulfur and the other chemical plant
    items live here too.
  * **Clear all** at the bottom of Everything forgets everything, dismissals included, after asking. On any
    other tab the button reads **Clear this tab** and forgets only that tab: its rows' numbers, machine
    choices and dismissals, plus the research time and lab speed on Science or Basic/Advanced on Oil.
* **Oil processing** (home screen, or search "oil" or "10 refineries") is the oil calculator. It opens at
  what your factory's machines use of petroleum gas, light oil and heavy oil, and shows what that takes:
  refineries, cracking plants, crude oil, pumpjacks, water and electricity, for basic or advanced
  processing. Type a product to change that product, or a machine count to see what that many supply;
  the products then say how far short or over your factory's use they are. Oil that would be left over
  even with everything cracked is called out, since it backs up and stops the refineries. "Add to factory"
  puts the whole machines into your ledger.
* **Every other page is a scenario.** Item pages, resource pages and the cards open at your factory's numbers
  (an item at its ledger number, otherwise sized to the tightest factory component in its chain, with a line
  under the title saying which; labs and boilers at their ledger counts) and whatever you type there is a
  what-if for this visit only. A small ↺ appears beside any box you changed and drops the what-if. To keep a
  scenario, press **+ Add to factory** at the top of the page (it reads **Update in factory** when the item is
  already there at a different number, and **In your factory** when it matches). Things in your factory
  carry a gold border on the home screen.
* **Memory** lives in this browser, and only here: nothing is stored on the server, so on a hosted copy every
  visitor has their own memory and nobody else's changes can reach yours. The browser keeps the memory per
  address, so `http://localhost:8765/` and the LAN or public address are separate memories even on the same
  PC. Petroleum gas, crude oil, steam and uranium in a chain open their page set to that amount. Changing a
  "Your base" setting redraws the page where you are, without jumping to the top.
* Keyboard: type anywhere to search, **Tab** moves between boxes, **↑/↓** nudge a box by 1 (Shift: 10),
  **Esc** reverts a box, then goes back.

Not covered: modules, beacons, quality, Space Age.

## Rebuild the data (only if the game updates)

`tools/` holds the extractor. It needs a Python 3 and ImageMagick (`magick`) on the PATH, and the game
install folder:

```
python tools/lua_dump.py "<Factorio>/data/base/prototypes/recipe.lua" tools/raw/recipe.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/item.lua" tools/raw/item.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/fluid.lua" tools/raw/fluid.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/item-groups.lua" tools/raw/item-groups.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/technology.lua" tools/raw/technology.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/entity/entities.lua" tools/raw/entities.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/entity/mining-drill.lua" tools/raw/mining-drill.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/entity/transport-belts.lua" tools/raw/transport-belts.json
python tools/lua_dump.py "<Factorio>/data/base/prototypes/entity/resources.lua" tools/raw/resources.json
python tools/locale_dump.py "<Factorio>/data/base/locale/en/base.cfg" tools/raw/locale.json
python tools/build_data.py tools/raw icons data.js
```

Icons are the game's own, cropped to the 64 px layer with
`magick <icon>.png -crop 64x64+0+0 +repage icons/<icon>.png`.
