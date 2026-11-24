# MusicLab

MusicLab je hudební pracovní stanice v češtině. V prohlížeči poskládáš pattern, seřadíš takty do aranže a k přehrávané skladbě můžeš živě přidávat akordy nebo zvukové vzorky. [Otevřít MusicLab](https://garon92.github.io/MusicLab/)

## Od patternu ke skladbě

1. V **Centrále** vyber u rytmického radaru banku A–D a v sekvenceru stopu **Drums**, **Bass** nebo **Lead**. Každá banka obsahuje jeden takt se 16 kroky. Kliknutím do mřížky přidáš úder či tón. Tlačítkem **Spustit** přehraješ všechny tři stopy společně.
2. V **Aranžéru** přiřaď každé sekci banku a počet opakování. Sekce můžeš kopírovat, přesouvat a odebírat. Kliknutím na sekci v časové ose spustíš skladbu od daného místa.
3. V transportu uprav tempo a swing. **Pauza** podrží pozici pro další přehrávání, **Stop** se vrátí na začátek.

## Nástroje

| Pracovní plocha | Co ovládá |
| --- | --- |
| Algoritmy | Generátor pulzů rozdělí údery mezi 16 kroků eukleidovským algoritmem nebo pomocí opakovatelné 16bitové posloupnosti. Rytmus můžeš otočit, invertovat a zapsat do zvolené bicí stopy. Dvě modulační jednotky (LFO) umí v rytmu měnit filtr, hlasitost, panoramu nebo úroveň efektu delay. |
| Harmonie | Výběr tóniny a stupnice, akordové stupně, obraty a septakordy. Vlastní progresi o 4–8 akordech lze přehrát s transportem jako akordy nebo arpeggio. |
| Syntezátor | Tvar vlny, filtr, rezonanci, náběh a dozvuk. Klaviatura a bicí pady reagují na myš i klávesnici. |
| Sampler | Import zvukového souboru, přímý odběr z mikrofonu nebo použití posledního vlastního záznamu WAV. Ořez, změna rychlosti a zpětné přehrávání. Osm řezů lze hrát z padů nebo přiřadit k šestnácti krokům. |
| Mixáž a FX | Hlasitost a polohu stop ve stereu, sólo, ztlumení, delay a třípásmový ekvalizér hlavního výstupu. |
| Analýza | Osciloskop, frekvenční spektrum, spektrogram a ladičku. Jako zdroj lze zvolit hlavní výstup nebo mikrofon. |
| MIDI a vstupy | Připojení MIDI vstupu a výstupu, export aranže do souboru MIDI a načtení prvních čtyř taktů souboru MIDI do bank A–D. |

Pro MIDI zařízení potřebuje prohlížeč podporu Web MIDI a povolení přístupu. Pro mikrofon otevři web přes HTTPS a povol jeho použití.

## Záznam a uložení

- **Stereo WAV.** Stiskni **REC** před úsekem, který chceš nahrát. Záznam snímá hlavní výstup včetně živé hry. Dalším stiskem **REC** nahrávání ukončíš a stáhneš WAV. **Stop** ukončí současně přehrávání i rozběhnutý záznam.
- **Rozpracovaný projekt.** Stanice průběžně ukládá patterny, aranž, nastavení nástrojů a mix v aktuálním profilu prohlížeče. Vlastní zvukový vzorek ukládá do místní databáze prohlížeče.
- **Přenosná kopie.** Přes **Projekt → Export projektu (.json)** stáhneš projekt včetně vloženého vlastního samplu. Přes **Projekt → Import projektu (.json)** jej znovu otevřeš i na jiném počítači.

## Spuštění bez internetu

Stáhni a rozbal celý repozitář. Ve složce `docs` otevři dvojklikem [index.html](./docs/index.html). Syntezátor, bicí, výchozí vzorek i písma jsou součástí projektu. Online a místní verze mají oddělená úložiště. Rozpracovanou skladbu mezi nimi přeneseš exportem a importem projektu.
