// Y-Weiche mit Filamentsensor für den Wechsler
// ============================================
//
// Zwei Filamente kommen oben über PC4-M10-Steckkupplungen herein und laufen
// zu einem Kanal zusammen. Unten geht es über eine dritte Kupplung zum
// Extruder des Ender. Ein Mikroschalter direkt unter dem Zusammenlauf meldet,
// ob dort Filament liegt. Danach richtet sich der Wechsler beim Laden und
// Parken.
//
//      Eingang 0   Eingang 1
//            \     /
//             \   /
//              \ /    <- Zusammenlauf
//               |
//               |[]   <- Mikroschalter, Hebel ragt in den Kanal
//               |
//            Ausgang
//
// Druck: liegend (Vorderseite nach oben), PETG oder PLA, 0,2 mm, 4 Wände.
// Der Schalter wird von vorn eingelegt und mit zwei M2-Schrauben gehalten.

/* [Kanäle] */
filament_d = 1.75;
// Winkel jedes Eingangs gegen die Senkrechte
winkel = 15;
// Weg vom Zusammenlauf bis zum Boden der Eingangskupplung
eingang_l = 26;
// Weg vom Zusammenlauf bis zum Boden der Ausgangskupplung
ausgang_l = 28;
// Kernloch für PC4-M10
kupplung_d = 8.5;
kupplung_tiefe = 7;
// Dicke des Teils (Y)
dicke = 14;

/* [Mikroschalter (MESSEN)] */
// Üblicher kleiner Hebel-Mikroschalter, z. B. KW10 / wie der Endschalter am Ender
schalter_l = 12.8;     // Länge (entlang des Kanals)
schalter_h = 6.5;      // Höhe (vom Hebel weg)
schalter_b = 5.8;      // Dicke
schalter_loch_d = 1.9; // für M2, schneidet selbst
schalter_loch_abstand = 6.5;
// Abstand der Löcher von der Unterseite (der Seite gegenüber dem Hebel)
schalter_loch_rand = 1.5;
// Mitte des Schalters unter dem Zusammenlauf
schalter_abstand = 13;

/* [Befestigung] */
// Zwei M3-Löcher quer durch, z. B. für Winkel am Rahmen
befestigung_d = 3.3;

$fn = 48;

kanal_d = filament_d + 0.45;
fy = dicke / 2;                         // Filamentebene

// Richtung der Eingänge (Einheitsvektor in XZ, nach oben)
function richtung(s) = [s * sin(winkel), cos(winkel)];

function s_atan(r) = atan2(r.x, r.y);

module rohr(p0, r, l, d) {
    translate([p0.x, fy, p0.y]) rotate([0, s_atan(r), 0]) cylinder(h = l, d = d);
}

kupplung_wand = 3;
boss_d = kupplung_d + 2 * kupplung_wand;

module koerper() {
    intersection() {
    translate([-50, 0, -100]) cube([100, dicke, 200]);
    hull() {
        // Ausgang
        translate([0, 0, -ausgang_l - kupplung_tiefe]) translate([-boss_d / 2, 0, 0])
            cube([boss_d, dicke, 1]);
        // Eingänge
        for (s = [-1, 1]) rohr([0, 0] + (eingang_l + kupplung_tiefe - 1) * richtung(s), richtung(s), 1, boss_d);
        // Schalterbereich
        translate([-boss_d / 2, 0, -schalter_abstand - schalter_l / 2 - 2])
            cube([boss_d / 2 + kanal_d / 2 + 1.2 + schalter_h + 2.5, dicke, schalter_l + 4]);
    }
    }
}

module weiche() {
    difference() {
        koerper();
        // Eingänge: Kanal und Kupplung
        for (s = [-1, 1]) {
            rohr([0, 0], richtung(s), eingang_l + 1, kanal_d);
            rohr(eingang_l * richtung(s), richtung(s), kupplung_tiefe + 5, kupplung_d);
        }
        // Zusammenlauf: kleiner Trichter, damit das Filament sicher einfädelt
        translate([0, fy, -0.5]) cylinder(d1 = kanal_d, d2 = kanal_d + 1.0, h = 3);
        // gemeinsamer Kanal und Ausgang
        translate([0, fy, -ausgang_l - 0.5]) cylinder(d = kanal_d, h = ausgang_l + 1);
        translate([0, fy, -ausgang_l - kupplung_tiefe - 1]) cylinder(d = kupplung_d, h = kupplung_tiefe + 1);
        // Schalter: Tasche von vorn offen, Hebelseite zeigt zum Kanal
        sx0 = kanal_d / 2 + 1.2;
        translate([sx0, fy - schalter_b / 2 - 0.2, -schalter_abstand - schalter_l / 2 - 0.2])
            cube([schalter_h + 0.4, dicke, schalter_l + 0.4]);
        // Schlitz, durch den der Hebel in den Kanal ragt
        translate([-0.1, fy - 1.5, -schalter_abstand - schalter_l / 2 + 1])
            cube([sx0 + 0.2, 3, schalter_l - 2]);
        // Schraublöcher für den Schalter (von hinten nach vorn)
        for (dz = [-1, 1])
            translate([sx0 + schalter_h - schalter_loch_rand, -1, -schalter_abstand + dz * schalter_loch_abstand / 2])
                rotate([-90, 0, 0]) cylinder(d = schalter_loch_d, h = dicke + 2);
        // Befestigung
        for (z = [-ausgang_l + 4, -2])
            translate([-boss_d / 2 + 3, -1, z]) rotate([-90, 0, 0]) cylinder(d = befestigung_d, h = dicke + 2);
    }
}

module schalter_attrappe() {
    sx0 = kanal_d / 2 + 1.2;
    color("black") translate([sx0 + 0.2, fy - schalter_b / 2, -schalter_abstand - schalter_l / 2])
        cube([schalter_h, schalter_b, schalter_l]);
    color("silver") translate([0.3, fy - 1, -schalter_abstand - schalter_l / 2 + 1.5])
        rotate([0, -4, 0]) cube([0.4, 2, schalter_l - 3]);
}

teil = "alle"; // ["alle", "weiche"]

if (teil == "alle") {
    color("orange") weiche();
    schalter_attrappe();
    color("white") {
        for (s = [-1, 1]) rohr([0, 0], richtung(s), eingang_l + kupplung_tiefe + 10, filament_d);
    }
} else {
    // druckfertig: Vorderseite nach oben, Rückseite auf dem Bett
    rotate([90, 0, 0]) weiche();
}
