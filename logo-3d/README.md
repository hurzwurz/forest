# 457 Rooftop Events – Logo als 3D-Druck

Aus `logo.jpg` vektorisiert und als Relief-Schild aufgebaut:

| Datei | Inhalt |
|---|---|
| `457_logo.blend` | Blender-Datei (Objekte *Platte*, *Logo*, ausgeblendet *Komplett*), Einheit mm |
| `457_komplett.stl` | Ein Teil (Platte + Logo verschmolzen) – für einfarbigen Druck |
| `457_platte.stl` / `457_logo.stl` | Einzelteile für Mehrfarbdruck |
| `457_mehrfarbig.3mf` | Beide Teile zusammen in einer Datei (z. B. Bambu/Prusa/Orca: als ein Objekt mit zwei Teilen laden, Farben zuweisen) |
| `build_logo.py` | Skript zum Neuerzeugen (Maße oben im Skript anpassbar) |

**Maße:** Platte 90,4 × 189,9 × 2,4 mm, Logo 1,2 mm erhaben (Gesamthöhe 3,6 mm).

**Zweifarbig ohne Mehrfarbdrucker:** `457_komplett.stl` flach drucken und bei
2,4 mm Höhe einen Filamentwechsel (rosa → schwarz) einfügen.

Hinweis: Die Adresszeile ist recht klein (Strichstärke ca. 0,6 mm) – mit 0,4-mm-Düse
druckbar, für bessere Lesbarkeit `MM_PER_PX` im Skript erhöhen.
