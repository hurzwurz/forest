// Obere Z-Achsen-Halterung: Kugellager (Gewindespindel) + glatte Fuehrungsstange
// Fuer 2020-Alu-Profil mit M5-Schrauben und Nutensteinen.
//
// Gedruckt wird der Arm FLACH auf dem Bett, die Rueckwand steht senkrecht.
// Keine Stuetzstrukturen noetig: Lagersitz offen nach oben, waagerechte
// Bohrungen als Tropfenform (druckt ohne Ueberhang).
//
// Eingebaut liegt die Bettseite oben: Oberkante Arm = Oberkante Profil,
// das Lager wird von unten eingepresst und liegt oben an einem Absatz an.

/* [Lage der Achsen] */
// Abstand Profil-Vorderseite -> Mitte Spindel/Stange (mm)
achs_abstand   = 30;
// Abstand Spindel-Mitte -> Stangen-Mitte (mm)
mitten_abstand = 22;
// Stange rechts (false) oder links (true) neben der Spindel - fuer zweite Seite
gespiegelt     = false;

/* [Kugellager] */
lager_d        = 22.2;  // 608: 22 mm + Spiel
lager_h        = 7;     // 608: 7 mm
spindel_loch   = 11;    // Durchgang Spindel (8 mm) mit Luft

/* [Fuehrungsstange] */
stange_d       = 8.2;   // 8 mm + Spiel
schlitz        = 1.5;   // Klemmschlitz
m3_d           = 3.4;
m3_mutter_sw   = 5.7;   // Schluesselweite M3-Mutter + Spiel
m3_mutter_h    = 2.6;

/* [Profil / Befestigung] */
profil         = 20;    // 2020
m5_d           = 5.5;
loch_abstand   = 0;     // 0 = automatisch (Loecher links und rechts neben dem Arm)

/* [Wandstaerken] */
arm_t          = 10;    // Dicke Arm (muss > lager_h + 2)
wand           = 4;     // Rand um Lager/Stange
rueck_t        = 5;     // Dicke Rueckwand
fluegel        = 14;    // Breite der Schraublaschen neben dem Arm

$fn = 72;
e = 0.01;

// ---------------------------------------------------------------
lx = 0;                                // Lager-Mitte X
sx = mitten_abstand;                   // Stangen-Mitte X
klemm_x = sx + stange_d/2 + wand + 3;  // Lage der Klemmschraube
x_min = lx - lager_d/2 - wand;
x_max = klemm_x + 3 + wand;
arm_w = x_max - x_min;
arm_l = achs_abstand + lager_d/2 + wand;   // Laenge in Y ab Profilflaeche
platte_w = arm_w + 2*fluegel;
loch_x = loch_abstand > 0 ? loch_abstand/2 : arm_w/2 + fluegel/2;
xc = (x_min + x_max)/2;

module tropfen(d, l) {   // waagerechte Bohrung entlang Y, Spitze nach +Z
    rotate([-90,0,0]) linear_extrude(l, center=true)
        union() {
            circle(d=d);
            rotate(45) square(d/2);
        }
}

module halter() {
    difference() {
        union() {
            // Arm (flach auf dem Bett)
            translate([x_min, 0, 0]) cube([arm_w, arm_l, arm_t]);
            // Rueckwand mit Schraublaschen
            translate([xc - platte_w/2, -rueck_t, 0]) cube([platte_w, rueck_t, profil]);
            // Rippen zwischen Arm und Rueckwand
            for (x = [x_min, x_max - wand])
                translate([x, 0, 0]) rotate([90,0,90])
                    linear_extrude(wand)
                        polygon([[0,0],[arm_l*0.6,0],[arm_l*0.6,arm_t],[0,profil]]);
        }
        // Lagersitz: von oben offen, Absatz unten
        translate([lx, achs_abstand, arm_t - lager_h]) cylinder(d=lager_d, h=lager_h + e);
        translate([lx, achs_abstand, -e]) cylinder(d=spindel_loch, h=arm_t + 2*e);
        // Stange durchgehend + Klemmschlitz zur Aussenkante
        translate([sx, achs_abstand, -e]) cylinder(d=stange_d, h=arm_t + 2*e);
        translate([sx, achs_abstand - schlitz/2, -e]) cube([x_max - sx + e, schlitz, arm_t + 2*e]);
        // Klemmschraube M3 quer zum Schlitz, von der Vorderkante eingesteckt (M3x16..20)
        translate([klemm_x, (achs_abstand - 8 + arm_l + 1)/2, arm_t/2])
            tropfen(m3_d, arm_l + 1 - (achs_abstand - 8));
        // Mutterschlitz M3 hinter dem Schlitz, von oben eingeschoben
        translate([klemm_x - m3_mutter_sw/2, achs_abstand - schlitz/2 - 2 - m3_mutter_h, arm_t/2 - m3_mutter_sw/2])
            cube([m3_mutter_sw, m3_mutter_h, arm_t]);
        // M5-Loecher in den Laschen
        for (s = [-1, 1])
            translate([xc + s*loch_x, -rueck_t/2, profil/2]) tropfen(m5_d, rueck_t + 2);
    }
}

if (gespiegelt) mirror([1,0,0]) halter(); else halter();
