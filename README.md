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
  its caption above it, and a chain's deeper rows step in. A chain's amount (and a card's count) sits beside
  the name with the machines under both, and boxes, buttons and spacing are a size smaller, so more of a
  page fits. Below 900 px "Defaults" folds into one line
  showing its choices as icons (tap it to open the full strip; it folds again when you go to another page),
  and the search suggestions stay on one line that scrolls sideways. On the ledger the tabs sit three to a
  row, "made by" and "used by" rows tuck in under their item, and on a touch screen the short list is one line you
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

* **Defaults** (the strip under the search box) is what the numbers assume: assembler tier, furnace,
  drill, belt colour, mining productivity. An item your factory makes is on the ledger's machines instead,
  on every page (a row on two furnaces is on both there, in the same shares), and what you pick on a page
  wins over both for that visit. A fresh browser starts at the early game (assembler 1, stone
  furnace, burner drill, yellow belt, no research); after that it is simply whatever you chose last. There
  is nothing to reset: change it when your base changes. Changing mining productivity keeps your factory's
  drills and pumpjacks as many as you entered: what they mine changes.
* **Amounts in** picks the one unit used everywhere: lanes of your belt (default; a belt has two lanes,
  so a yellow lane is 7.5 items per second), full belts (15 per second for yellow), items per second,
  or items per minute. Fluids are per second, except water and crude oil, which are always counted in the
  offshore pumps and pumpjacks that pump them.
* Click the machine name in a row to try a different assembler, furnace or drill for that row; **+** at the
  end of its machines adds a line on another one, ready to type in, and **×** takes a line off (the row's
  other lines make its amount). A count typed on one line of a row leaves the other lines as they are, and
  the page follows. All of it is a what-if for this visit: the picker's last button goes back to your
  factory's machines (or Defaults), and Add to factory saves it.
* Click an ingredient's name to make it the product, carrying its amount down the chain. ▸ opens one more level.
* **Home** (top left, on every page) goes back to the full list; **Factory** beside it opens the Your factory
  ledger; **←** goes back one step.
* **Raw resources** (stone, iron ore, copper ore, coal, wood, water) have a page of their own. The first row
  is the supply: drills on one side, amount on the other. Every item below it is sized as if all of that
  supply went to it, with its other ingredients under it, so changing any box moves the whole page. Links
  at the bottom go one step further. Open one by clicking the resource in any chain or typing its name; the
  mined ones also head the Intermediate products list, the first list on the home page.
* **Your factory** (the Factory button beside Home, or search "factory") is the one place that saves. It is
  a ledger in tabs: **Everything**, **Mining & smelting**, **Assembling**, **Oil & chemicals**, **Power** and
  **Science**. Each row sits in the tab of the machine that makes it. A new ledger starts with the basics at 0
  (drills on iron, copper, coal and stone, the smelting, gears, cable, circuits, boilers, steam engines, labs,
  red and green science). Each tab's dashed row at the bottom adds more, and only offers what belongs there:
  click it for the list of everything that tab can hold (Everything lists all of it, grouped by tab), or type
  to narrow it; pick one, type how many, Enter adds it. Once picked, its machine is a picker (assembler tier,
  furnace, drill, recipe, the refineries' processing or the reactors' layout): if your factory has that item on that machine already,
  the button reads **Update**, the box shows the count you have, and what you type replaces it; otherwise
  **Add** puts it in as a line of its own. A tab shows a red count when something in it is short.
  * **Import a blueprint**: paste a blueprint or blueprint book string into the box under a tab and press
    Import. It counts the assemblers, chemical plants, refineries, labs, boilers, steam engines, solar panels,
    pumpjacks and offshore pumps in it (books inside books too) and overwrites those counts. Rows already in
    your ledger update at once; new ones are listed with a tick box and added when you press Add.
    What a blueprint does not say, the import asks: what furnaces smelt, what drills mine, and which
    processing refineries with no recipe run; each line counts down how many of its machines are still
    unassigned as you type (red if you give out too many). Assemblers with no recipe are listed as not
    counted. An item made on more than one machine or recipe (gears in assembler 1 and 2, solid fuel from
    two oils) gets a line for each, and each replaces only the line on the same machine and recipe. On a tab,
    the import only touches that tab: the rest is listed by the tab it goes on, so import on that tab or on
    Everything to add it; on Everything it covers all of them. Refineries are counted on each processing they
    run. Modules and beacons are ignored.
  * An item row has the machines making it, what they make (**Supply**), what the rest of your factory
    uses (**Demand**), and the verdict: "short" in red, with how many machines close the gap, or
    "fulfilled" in green, with how much is left over. The bar under it fills as what you make covers what
    your factory uses: full once it is fulfilled. Water and crude oil are counted in offshore pumps and
    pumpjacks. Type into any box and the page recounts as you type; empty or 0 takes the item out (its
    machine stays for this visit, so a new number goes back on it; after that the row is on Defaults).
    **Remove** under a row's name does the same and also forgets its machine choice and any dismissal;
    the row stays until you leave the page, with **Put back** to bring it back as it was.
    Anything your machines use that you have not entered shows grey as "missing", with how many
    machines to add, the same as a short row. **▸** opens a row: what makes it ("made by", with the
    amount under Supply) and what uses it ("used by", biggest first, with the amount under Demand),
    each with its machines, so you can see where a shortage comes from. The **−** before a line takes it out
    of your factory: just those machines when the item has other lines (as its × would), else the item
    itself, with Put back on its row (as Remove would); boilers, engines, refineries and the like the same way.
  * A row can have a line per machine and recipe: gears in assembler 1 and 2, iron plate in stone and steel
    furnaces, iron ore under burner and electric drills. Each line has its own count, picker and ×, and the row
    adds them up; switching a line to a machine another line uses joins the two. A row with machines entered
    has a **+** at the end of its machines while another machine, recipe or processing is free: it adds a
    line there at 0. Lines also come from the add row, a page's Add to factory or a blueprint. A line stays
    until its × takes it off, so after upgrading machines in game, take the old tier's line off (or set it
    to 0).
  * **The top of each tab** counts what is short, what is missing (rows marked "missing") and what is
    fulfilled; a count of 0 is left out, except short. Click a count to see only those rows (dismissed
    shortages stay out of **short**, as they do out of its count): a row you change meanwhile stays until
    you click the count again, which shows every row. Steam and Electricity have no box of their own, so
    they come with the boilers, steam engines, solar panels and reactors that make them. Under the counts,
    what is short is listed, biggest gap first: click a name to go to its row, or × to dismiss a shortage
    you are fine with; **Bring back N dismissed** lists them again. It works on the tab you are on; on
    Everything it covers every tab. Dismissing only takes a shortage out of that list, the short count and
    the tabs' red counts: its row below still shows it short. Dismissals are saved with your factory.
  * Every row has its own machine: click it to pick the assembler tier, furnace or drill (and the recipe,
    for the few items with a choice, like solid fuel). The count stays the same and the output follows.
    Entering a row pins its machine, so changing Defaults later does not change what you already have, and
    every page makes the item on the row's lines while it has a number (both machines, in their shares,
    when it has two). A row at 0 makes nothing, so the pages put that item on Defaults.
  * **Power** has boilers, steam engines, solar panels and nuclear reactors, then a Steam row (boilers' 60
    per second against engines' 30) and an Electricity row (engines, solar and reactors against everything
    electric you entered). Boilers burn the fuel you pick on their row (coal, wood, solid fuel, rocket fuel
    or nuclear fuel), which shows on that fuel's row, and their water shows on the Water row. Reactors are
    counted in blocks of a layout (1x1 to 2x8), a line per layout; their fuel cells show on the Uranium fuel
    cell row and their water on the Water row.
  * **Science** has your labs, with the research time and lab speed they run at; they eat each science
    pack you make.
  * **Oil & chemicals** follows the oil. First crude oil: your pumpjacks, at the yield you type on the row
    (the % the game shows on an oil field), against the pumpjacks your refineries take running flat out like
    every other machine, with coal, steam and water under it when your oil machines take them (the same
    rows as on Mining & smelting and Power). Then your oil refineries: a line per processing you run (Basic,
    Advanced or Coal liquefaction; **+** adds one, and each line's picker moves its refineries to another);
    on coal liquefaction they take coal and steam from your boilers instead of crude oil. Then your heavy
    and light oil cracking plants. Refineries and cracking each say in grey how many your factory
    needs ("needs 2.05 of your 3", "missing: add 2 × Chemical plant", or "idle" with why). Then heavy
    oil, light oil and petroleum gas: what your refineries make at full speed plus what cracking turns
    into each, against what your factory and the cracking use. A refinery stops once any of its oils has
    nowhere to go, so an oil is short when the refineries cannot deliver it with nothing backing up; its
    row says why and what to add ("light oil backs up: add 2 × light oil cracking"), and the oil with
    nowhere to go reads "backs up". Each gap is counted once, on the oil. Refineries on Advanced and
    cracking plants also take water, which shows on the Water row. Plastic, sulfur and the other chemical
    plant items live here too; uranium drills' sulfuric acid counts on the Sulfuric acid row.
  * **Clear all** at the bottom of Everything forgets everything, dismissals included, after asking
    ("Clear all? Yes / No"). On any other tab the button reads **Clear this tab** and forgets only that tab:
    its rows' numbers, machine choices and dismissals, plus the research time and lab speed on Science,
    the processing and pumpjack yield on Oil, or the boilers' fuel on Power.
* **Oil processing** (home screen, or search "oil", "10 refineries", "8 pumpjacks", "100 crude oil" or
  "3 light oil cracking") is the oil calculator. It leads with the processing and your refineries: type how
  many refineries (or cracking plants, pumpjacks, offshore pumps) and the rest follows, each machine with
  how many your factory has, then the petroleum gas, light oil and heavy oil they make, with what your
  factory uses of each. It opens at what your factory's machines use (with nothing using oil yet, at your
  own refineries). After a change the oils say how far short or over your factory's use they are, and a
  machine count you typed stays when you switch between Basic, Advanced and Coal liquefaction (that switch
  is what the page plans with and what new refineries in your factory run; on coal liquefaction the page
  lists the coal, the steam and the boilers for it).
  Oil that would be left over even with everything cracked is called out, since it backs up and stops the
  refineries. "Add to factory" puts the whole refineries (on the page's processing; any on another
  processing stay) and the cracking it needs into your ledger, plus the pumpjacks for their crude oil; it
  leaves cracking you have alone when it needs none.
* **Every other page is a scenario.** Item pages, resource pages and the cards open at your factory's numbers
  (an item at its ledger number, otherwise sized to the tightest factory component in its chain, with a line
  under the title saying which; labs, boilers, solar panels and reactor blocks at their ledger counts) and
  whatever you type there is a
  what-if for this visit only. A small ↺ appears beside any box you changed and drops the what-if. To keep a
  scenario, press **+ Add to factory** at the top of the page (it reads **Update in factory** when the item is
  already there at a different number or on other machines, and **In your factory** when it matches). The
  ledger row becomes the page's top row: a line for each of its machines, making what they make on the page
  (an item on two recipes, like solid fuel, keeps its other recipe's lines, and the page's take the rest). The Steam,
  Solar, Nuclear and Labs cards have it too (Nuclear puts the blocks of the card's layout into the ledger).
  Things in your factory carry a gold border on the home screen.
* **Memory** lives in this browser, and only here: nothing is stored on the server, so on a hosted copy every
  visitor has their own memory and nobody else's changes can reach yours. The browser keeps the memory per
  address, so `http://localhost:8765/` and the LAN or public address are separate memories even on the same
  PC. Tabs and windows open on the same address share it: Defaults or a factory change made in one show up
  in the others at once, so an older tab never saves over a newer change. Petroleum gas, crude oil, steam and uranium in a chain open their page set to that amount. Changing a
  Defaults setting redraws the page where you are, without jumping to the top.
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
