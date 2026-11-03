// Direktextruder mit 28BYJ-48 und Dual-Drive-Zahnrädern
// =====================================================
//
// Parametrisches OpenSCAD-Modell. Alle Maße in mm.
//
// Aufbau (Blick von vorn, Filament läuft von oben nach unten):
//
//         Filament
//            |
//   Ritzel   |   Feder-Schraube ->
//      o  (A)|(B)  <- Spannhebel
//            |       o Drehpunkt
//         zum Hotend
//
//   - Der Motor sitzt hinten an der Rückwand, seine Welle ragt nach vorn.
//   - Auf der Welle sitzt ein gedrucktes Ritzel. Es treibt den Zahnkranz von
//     Antriebsrad A an. A dreht auf einer festen Achse im Gehäuse.
//   - Antriebsrad B sitzt im Spannhebel und greift in A ein. Eine Feder
//     drückt B gegen das Filament.
//
// WICHTIG: Die Werte im Abschnitt "MESSEN" sind Schätzungen aus dem Foto.
// Miss deine Zahnräder mit dem Messschieber nach, bevor du druckst.
//
// Druck: PETG, ABS oder ASA (PLA wird neben dem Hotend weich),
//        0,2 mm Schicht, 4 Wände, 40 % Füllung. Ritzel am besten mit
//        0,1 mm Schicht oder 0,2-mm-Düse drucken.

/* [Ausgabe] */
// Welches Teil rendern? "alle" zeigt den Zusammenbau.
teil = "alle"; // ["alle", "gehaeuse", "hebel", "ritzel", "plan"]

/* [MESSEN: Antriebsräder] */
// Zähne am schwarzen Zahnkranz eines Antriebsrads (zählen!)
rad_zaehne = 31;
// Außendurchmesser über die Zahnspitzen
rad_aussen_d = 16.5;
// Gesamtbreite eines Antriebsrads (Zahnkranz + Metall-Rändel)
rad_breite = 13.0;
// Breite nur des schwarzen Zahnkranzes
rad_zahnkranz_breite = 6.0;
// Durchmesser der Metall-Rändelscheibe (außen)
rad_raendel_d = 14.5;
// Bohrung im Rad (Innenring des Lagers) = Achsdurchmesser
achse_d = 3.0;

/* [Ritzel auf der Motorwelle] */
// 0 = automatisch: kleinstes Ritzel, das noch auf die 5-mm-Welle passt
ritzel_zaehne = 0;
// Spiel zwischen den Zähnen (größer = leichtgängiger)
zahnspiel = 0.10;
// Winkel, unter dem das Ritzel an Rad A sitzt (180 = links, 90 = oben)
ritzel_winkel = 135;

/* [Motor 28BYJ-48 (Datenblatt)] */
motor_d = 28.0;
motor_hoehe = 19.0;
// Abstand Welle zu Motormitte
motor_wellen_versatz = 8.0;
// Abstand der beiden Befestigungslaschen
motor_laschen_abstand = 35.0;
motor_laschen_loch_d = 4.2;
// Wellenbund (Ring um die Welle) Durchmesser und Höhe
motor_bund_d = 9.5;
motor_bund_h = 1.6;
// Welle: Durchmesser, Abstand der Abflachungen, Länge ab Motorfläche
welle_d = 5.0;
welle_flach = 3.0;
welle_laenge = 10.0;
// Lage des Motorkörpers: Richtung Welle -> Motormitte (Grad)
motor_richtung = 180;

/* [Gehäuse] */
rueckwand = 4.0;
vorderwand = 4.0;
filament_d = 1.75;
// Bohrung für PTFE-Schlauch oben (Einlauf) und unten (zum Hotend)
ptfe_d = 4.15;
ptfe_tiefe = 6.0;
// Befestigung unten: zwei M3-Löcher, Abstand
befestigung_abstand = 20.0;
befestigung_loch_d = 2.8;
// Federschraube M3 (Länge ca. 30 mm) und Feder
schraube_d = 3.3;
mutter_sw = 5.7;
mutter_h = 2.6;
spiel = 0.4;

$fn = 64;

// ---------------------------------------------------------------------
// Abgeleitete Größen
// ---------------------------------------------------------------------

modul = rad_aussen_d / (rad_zaehne + 2);
rad_teil_d = modul * rad_zaehne;            // Teilkreis
achsabstand_ab = rad_teil_d;                 // A und B kämmen miteinander

// kleinstes Ritzel, dessen Fußkreis noch 1,2 mm Wand um die Welle lässt
ritzel_z_auto = ceil((welle_d + 2 * 1.2) / modul + 2.5);
ritzel_z = ritzel_zaehne > 0 ? ritzel_zaehne : ritzel_z_auto;
ritzel_aussen_d = modul * (ritzel_z + 2);
achsabstand_ritzel = modul * (rad_zaehne + ritzel_z) / 2;

untersetzung = rad_zaehne / ritzel_z;

// Positionen in der XZ-Ebene (Y zeigt nach vorn, weg vom Motor)
pos_a = [-achsabstand_ab / 2, 0];
pos_b = [ achsabstand_ab / 2, 0];
pos_ritzel = pos_a + achsabstand_ritzel * [cos(ritzel_winkel), sin(ritzel_winkel)];
pos_motor = pos_ritzel + motor_wellen_versatz * [cos(motor_richtung), sin(motor_richtung)];
laschen_richtung = [-sin(motor_richtung), cos(motor_richtung)];
pos_lasche1 = pos_motor + motor_laschen_abstand / 2 * laschen_richtung;
pos_lasche2 = pos_motor - motor_laschen_abstand / 2 * laschen_richtung;

// Tiefe der Zahnradkammer: Rad + Spiel vorn und hinten
kammer = rad_breite + 1.0;
tiefe = kammer + vorderwand;                // Gehäuse vor der Rückwand
rad_y0 = 0.5;                                // Rückseite der Räder
// Filament läuft mittig über die Rändelscheibe
filament_y = rad_y0 + (rad_zahnkranz_breite + rad_breite) / 2;
// Ritzel: so weit vorn, wie die Welle reicht
ritzel_y0 = 0.3;
ritzel_breite = min(rad_zahnkranz_breite, welle_laenge - rueckwand - ritzel_y0 - 0.3);

rad_r = rad_aussen_d / 2;
feder_z = rad_r + 6;                         // Höhe der Federschraube
feder_y = tiefe - 4.0;                       // vorn, weit weg vom Filament
drehpunkt = [pos_b.x + 3.0, -(rad_r + 6)];   // Hebel-Drehpunkt
sockel_h = 6;                                // Sockel unten
oben = feder_z + 5.5 + ptfe_tiefe + 1.5;     // Oberkante
unten = drehpunkt.y - 4.5 - 1.0 - sockel_h;  // Unterkante
x_frei = 2.2;                                // rechte Kante des Blocks am Filament
hebel_x0 = x_frei + 0.8;                     // linke Kante des Hebels
hebel_spalt = 0.6;
// Spalt zwischen den Rändelscheiben; muss kleiner als das Filament sein
raendel_spalt = achsabstand_ab - rad_raendel_d;

echo(str("Modul: ", modul, " mm"));
echo(str("Ritzel: ", ritzel_z, " Zähne, Außen-Ø ", ritzel_aussen_d, " mm"));
echo(str("Untersetzung Ritzel -> Rad: ", untersetzung, " : 1"));
echo(str("Achsabstand Ritzel-A: ", achsabstand_ritzel, " mm, A-B: ", achsabstand_ab, " mm"));
echo(str("Spalt zwischen den Rändeln: ", raendel_spalt, " mm (Filament ", filament_d, " mm)"));
if (raendel_spalt >= filament_d)
    echo("WARNUNG: Rändel greifen das Filament nicht. Maße der Räder prüfen!");

// ---------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------

// Zylinder entlang Y, Grundfläche bei y0, Position [x, z]
module zyl_y(p, d, y0, h) {
    translate([p.x, y0, p.y]) rotate([-90, 0, 0]) cylinder(d = d, h = h);
}

// 2D-Form in der XZ-Ebene, extrudiert entlang Y von y0 bis y0+h
module platte_y(y0, h) {
    translate([0, y0 + h, 0]) rotate([90, 0, 0]) linear_extrude(h) children();
}

function inv(a) = tan(a) - a * PI / 180;     // Evolventenfunktion (rad)

// Evolventen-Stirnrad, 2D
module stirnrad_2d(z, m, eingriff = 20, spiel = 0) {
    rp = m * z / 2;
    rb = rp * cos(eingriff);
    ra = rp + m;
    rf = rp - 1.25 * m;
    // halbe Zahndicke als Winkel (rad), Spiel abgezogen
    halb = PI / (2 * z) - spiel / (2 * rp) + inv(eingriff);
    r0 = max(rb, rf);
    schritte = 8;
    flanke = [for (i = [0:schritte])
        let(r = r0 + (ra - r0) * i / schritte,
            t = halb - inv(acos(rb / r)))
        [r, t * 180 / PI]];
    unten_pts = [for (f = flanke) [f[0] * cos(-f[1]), f[0] * sin(-f[1])]];
    oben_pts  = [for (i = [len(flanke) - 1:-1:0])
        [flanke[i][0] * cos(flanke[i][1]), flanke[i][0] * sin(flanke[i][1])]];
    union() {
        circle(r = rf);
        for (k = [0:z - 1]) rotate(k * 360 / z)
            polygon(concat([[0, 0]], unten_pts, oben_pts));
    }
}

module m3_mutter() { cylinder(d = mutter_sw / cos(30), h = mutter_h, $fn = 6); }

// ---------------------------------------------------------------------
// Teile
// ---------------------------------------------------------------------

module ritzel() {
    difference() {
        linear_extrude(ritzel_breite) stirnrad_2d(ritzel_z, modul, spiel = zahnspiel);
        // Doppel-D-Bohrung für die Motorwelle (leichter Presssitz)
        translate([0, 0, -1]) linear_extrude(ritzel_breite + 2)
            intersection() {
                circle(d = welle_d + 0.1);
                square([welle_d + 1, welle_flach + 0.1], center = true);
            }
    }
}

// Umriss des Gehäuses (Rückwand) in der XZ-Ebene
module umriss_rueckwand() {
    hull() {
        translate(pos_lasche1) circle(d = motor_laschen_loch_d + 6);
        translate(pos_lasche2) circle(d = motor_laschen_loch_d + 6);
        translate(pos_ritzel) circle(d = motor_bund_d + 6);
        translate([pos_a.x - rad_r - 3, unten]) square([pos_b.x + rad_r + 9 - (pos_a.x - rad_r - 3), oben - unten]);
    }
}

// Umriss des vorderen Blocks (um Rad A, Ritzel, Filamentkanal)
module umriss_block() {
    hull() {
        translate(pos_a) circle(r = rad_r + 3);
        translate(pos_ritzel) circle(d = ritzel_aussen_d + 5);
        translate([pos_a.x - rad_r - 3, unten]) square([rad_r + 3 + achsabstand_ab / 2 + 4, 1]);
        translate([pos_a.x - rad_r - 3, oben - 1]) square([rad_r + 3 + 6, 1]);
    }
}

module gehaeuse() {
    difference() {
        union() {
            // Rückwand mit Motorflansch
            platte_y(-rueckwand, rueckwand) umriss_rueckwand();
            // Block vor der Rückwand
            platte_y(0, tiefe) umriss_block();
            // Steg oben rechts, durch den die Federschraube läuft
            // Sockel unten (Befestigung am Hotend/Schlitten), volle Breite
            platte_y(-rueckwand, tiefe + rueckwand)
                translate([pos_a.x - rad_r - 3, unten]) square([pos_b.x + rad_r + 9 - (pos_a.x - rad_r - 3), sockel_h]);
            // Lagerbock für den Hebel-Drehpunkt
            zyl_y(drehpunkt, 8, 0, 1.0);
        }

        // Kammer für Rad A und B (seitlich nach rechts offen zum Einsetzen)
        zyl_y(pos_a, rad_aussen_d + 2 * spiel + 1, 0, kammer);
        translate([pos_a.x, 0, -rad_r - spiel - 0.5])
            cube([achsabstand_ab + rad_r + 20, kammer, rad_aussen_d + 2 * spiel + 1]);
        // Kammer fürs Ritzel, vorn offen zum Aufstecken
        zyl_y(pos_ritzel, ritzel_aussen_d + 2 * spiel + 1, 0, tiefe + 1);
        // Motorwelle mit Bund
        zyl_y(pos_ritzel, motor_bund_d + 1, -rueckwand - 1, rueckwand + 2);
        // Laschenlöcher und Muttern vorn
        for (p = [pos_lasche1, pos_lasche2]) {
            zyl_y(p, 3.4, -rueckwand - 1, rueckwand + tiefe + 2);
        }
        // Achse A durch Rückwand und Vorderwand
        zyl_y(pos_a, achse_d - 0.05, -rueckwand + 1.0, tiefe + rueckwand);
        // Filamentkanal
        translate([0, filament_y, unten - 1]) cylinder(d = filament_d + 0.35, h = oben - unten + 2);
        translate([0, filament_y, oben - ptfe_tiefe]) cylinder(d = ptfe_d, h = ptfe_tiefe + 1);
        translate([0, filament_y, oben - ptfe_tiefe - 1.5]) cylinder(d1 = filament_d + 0.35, d2 = ptfe_d, h = 1.5);
        translate([0, filament_y, unten - 1]) cylinder(d = ptfe_d, h = ptfe_tiefe + 1);
        // Federschraube: Gewinde läuft in eine Mutter im Block
        translate([-12, feder_y, feder_z]) rotate([0, 90, 0]) cylinder(d = schraube_d, h = 40);
        translate([-8, feder_y, feder_z]) rotate([0, 90, 0]) rotate([0, 0, 30])
            translate([0, 0, -mutter_h / 2]) m3_mutter();
        translate([-8 - mutter_h / 2, feder_y, feder_z - mutter_sw / 2]) cube([mutter_h, tiefe, mutter_sw]);
        // Freiraum für den Hebel rechts vom Filament
        translate([x_frei, -0.01, unten + sockel_h]) cube([40, tiefe + 1, feder_z + 5.5 - unten - sockel_h]);
        // Drehpunkt-Bohrung (M3-Schraube von vorn, schneidet ins Plastik)
        zyl_y(drehpunkt, 2.8, -rueckwand - 1, tiefe + rueckwand + 2);
        // Befestigung unten: zwei Löcher für M3 (selbstschneidend) oder
        // Ø4 für Einschmelzmuttern -> befestigung_loch_d anpassen
        for (sx = [-1, 1]) translate([sx * befestigung_abstand / 2, filament_y, unten - 1])
            cylinder(d = befestigung_loch_d, h = sockel_h);
    }
}

module hebel() {
    difference() {
        union() {
            // Platte vor Rad B
            platte_y(kammer + hebel_spalt / 2, tiefe - kammer - hebel_spalt / 2)
                intersection() {
                    hull() {
                        translate(drehpunkt) circle(r = 4.5);
                        translate(pos_b) circle(r = rad_r - 1);
                        translate([hebel_x0, feder_z - 4]) square([pos_b.x + rad_r - hebel_x0, 8.5]);
                    }
                    translate([hebel_x0, -100]) square(200);
                }
            // Auge am Drehpunkt über die volle Tiefe
            zyl_y(drehpunkt, 9, 1.0 + hebel_spalt, tiefe - 1.0 - hebel_spalt);
            // Kopf oben über volle Tiefe, dort greift die Feder an
            translate([hebel_x0, 1.0 + hebel_spalt, feder_z - 4])
                cube([pos_b.x + rad_r - hebel_x0, tiefe - 1.0 - hebel_spalt, 8.5]);
        }
        // Radkammer B
        zyl_y(pos_b, rad_aussen_d + 2 * spiel + 1, -1, kammer + 1);
        // Achse B (Presssitz)
        zyl_y(pos_b, achse_d - 0.05, 0, tiefe + 1);
        // Drehpunkt
        zyl_y(drehpunkt, 3.4, 0, tiefe + 1);
        // Federschraube (Langloch, damit der Hebel schwenken kann)
        hull() for (dz = [-0.8, 0.8])
            translate([0, feder_y, feder_z + dz]) rotate([0, 90, 0]) cylinder(d = schraube_d + 0.4, h = 40);
        // Filament nicht berühren
        translate([0, filament_y, unten]) cylinder(d = 4, h = oben - unten);
    }
}

// Motor als graue Attrappe für den Zusammenbau
module motor_attrappe() {
    color("silver") {
        translate([pos_motor.x, -rueckwand, pos_motor.y]) rotate([90, 0, 0]) cylinder(d = motor_d, h = motor_hoehe);
        translate([0, -rueckwand - 0.8, 0]) rotate([-90, 0, 0]) linear_extrude(0.8) hull() {
            translate([pos_lasche1.x, -pos_lasche1.y]) circle(d = 7);
            translate([pos_lasche2.x, -pos_lasche2.y]) circle(d = 7);
        }
        zyl_y(pos_ritzel, welle_d, -rueckwand, welle_laenge);
    }
    color("royalblue")
        translate([pos_motor.x, -rueckwand - motor_hoehe / 2, pos_motor.y])
            rotate([0, -motor_richtung, 0]) translate([motor_d / 2 - 2, -motor_hoehe / 2 + 2, -7.5]) cube([6, motor_hoehe - 4, 15]);
}

module rad_attrappe(p) {
    color("dimgray") zyl_y(p, rad_aussen_d, rad_y0, rad_zahnkranz_breite);
    color("gainsboro") zyl_y(p, rad_raendel_d, rad_y0 + rad_zahnkranz_breite, rad_breite - rad_zahnkranz_breite);
}

module zusammenbau() {
    color("orange") gehaeuse();
    color("tomato") hebel();
    color("gold") translate([pos_ritzel.x, ritzel_y0, pos_ritzel.y]) rotate([-90, 0, 0]) ritzel();
    rad_attrappe(pos_a);
    rad_attrappe(pos_b);
    motor_attrappe();
    color("white") translate([0, filament_y, unten - 10]) cylinder(d = filament_d, h = oben - unten + 20);
}

// Druckbereit ausgerichtet: Gehäuse liegt auf der Rückwand, Hebel auf seiner
// Vorderseite, Ritzel flach.
module gehaeuse_druck() translate([0, 0, rueckwand]) rotate([90, 0, 0]) gehaeuse();
module hebel_druck() translate([0, 0, tiefe]) rotate([-90, 0, 0]) hebel();

module plan() {
    gehaeuse_druck();
    translate([45, 0, 0]) hebel_druck();
    translate([-45, 0, 0]) ritzel();
}

if (teil == "alle") zusammenbau();
else if (teil == "gehaeuse") gehaeuse_druck();
else if (teil == "hebel") hebel_druck();
else if (teil == "ritzel") ritzel();
else if (teil == "plan") plan();
