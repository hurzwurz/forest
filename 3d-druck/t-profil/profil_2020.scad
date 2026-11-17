// 2020-Nutprofil (Typ B, 6-mm-Nut) zum Hochkant-Drucken
// Hochkant gedruckt sind alle Waende senkrecht: keine Ueberhaenge, keine Stuetzen.

laenge     = 100;   // mm
anzahl     = 4;     // Stueck auf der Platte
abstand    = 10;    // Abstand zwischen den Teilen
a          = 20;    // Kantenlaenge
nut        = 6.2;   // Nutoeffnung
lippe      = 1.8;   // Wandstaerke an der Nut
nut_tiefe  = 6.1;   // Tiefe der Nut ab Aussenkante
kammer     = 11;    // Breite der Kammer hinter der Lippe
kern_loch  = 4.2;   // Kernloch (M5-Gewinde schneiden)

$fn = 48;

module querschnitt() {
    difference() {
        offset(r=0.5) offset(delta=-0.5) square(a, center=true);
        for (r = [0, 90, 180, 270]) rotate(r) {
            // Nutoeffnung
            translate([-nut/2, a/2 - lippe - 0.01]) square([nut, lippe + 1]);
            // T-Kammer (trapezfoermig, zum Kern hin schmaler)
            polygon([[-kammer/2, a/2 - lippe], [kammer/2, a/2 - lippe],
                     [nut/2, a/2 - nut_tiefe], [-nut/2, a/2 - nut_tiefe]]);
        }
        circle(d=kern_loch);
    }
}

for (i = [0:anzahl-1])
    translate([(i % 2) * (a + abstand), floor(i / 2) * (a + abstand), 0])
        linear_extrude(laenge) querschnitt();
