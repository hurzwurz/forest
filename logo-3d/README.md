# 457 Rooftop Events – Logo als 3D-Druck

Aus `logo.jpg` vektorisiert und als Relief-Schild aufgebaut:

| Datei | Inhalt |
|---|---|
| `457_logo.blend` | Blender-Datei (Objekte *Platte*, *Logo*, ausgeblendet *Komplett*), Einheit mm |
| `457_komplett.stl` | Ein Teil (Platte + Logo verschmolzen) – für einfarbigen Druck |
| `457_platte.stl` / `457_logo.stl` | Einzelteile für Mehrfarbdruck |
| `457_mehrfarbig.3mf` | Beide Teile zusammen in einer Datei (z. B. Bambu/Prusa/Orca: als ein Objekt mit zwei Teilen laden, Farben zuweisen) |
| `457_orca.3mf` | Für OrcaSlicer / Bambu Studio: ein Objekt, Platte = Filament 1, Logo = Filament 2 |
| `build_logo.py` | Skript zum Neuerzeugen (Maße oben im Skript anpassbar) |

**Maße:** Platte 90,4 × 189,9 × 5,0 mm, Logo 5,0 mm erhaben (Gesamthöhe 10,0 mm). Konturen um 0,12 mm verdickt (`BOLD_MM`).

**Zweifarbig ohne Mehrfarbdrucker:** `457_komplett.stl` flach drucken und bei
5,0 mm Höhe einen Filamentwechsel (rosa → schwarz) einfügen.

Hinweis: Die Adresszeile ist recht klein (Strichstärke ca. 0,8 mm) – mit 0,4-mm-Düse
druckbar, für bessere Lesbarkeit `MM_PER_PX` im Skript erhöhen.
