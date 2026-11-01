"""Erzeugt aus logo.jpg ein druckbares 3D-Modell (Blender + STL + 3MF).

Aufruf:  python3 build_logo.py      (benötigt: bpy, opencv-python-headless,
                                      shapely, trimesh, manifold3d, mapbox_earcut)
"""
import os
import cv2
import numpy as np
import bpy
import trimesh
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "logo.jpg")

# ---- Parameter (mm) -------------------------------------------------------
MM_PER_PX = 0.22      # Maßstab des Originalbildes -> ca. 90 x 190 mm Platte
UPSCALE = 4           # für glattere Konturen
THRESH = 115          # Grauwert-Schwelle: dunkler = Logo
MARGIN_PX = 40        # Rand um das Logo (Originalpixel)
CORNER_R = 5.0        # Eckenradius Platte
PLATE_H = 2.4         # Dicke der Grundplatte
LOGO_H = 1.2          # Höhe des erhabenen Logos
MIN_AREA_MM2 = 0.05   # Störpixel ignorieren

# ---- 1. Bild vektorisieren -----------------------------------------------
img = cv2.imread(SRC, cv2.IMREAD_GRAYSCALE)
big = cv2.resize(img, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_CUBIC)
big = cv2.GaussianBlur(big, (5, 5), 0)
_, mask = cv2.threshold(big, THRESH, 255, cv2.THRESH_BINARY_INV)

contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
hier = hier[0]
s = MM_PER_PX / UPSCALE
H = img.shape[0]

def to_mm(c):
    c = cv2.approxPolyDP(c, 0.7, True).reshape(-1, 2).astype(float)
    return [(x * s, (H * UPSCALE - y) * s) for x, y in c]

polys = []
for i, c in enumerate(contours):
    if hier[i][3] != -1 or len(c) < 3:
        continue  # nur äußere Konturen, Löcher kommen über die Kinder
    holes = []
    j = hier[i][2]
    while j != -1:
        if len(contours[j]) >= 3:
            holes.append(to_mm(contours[j]))
        j = hier[j][0]
    p = Polygon(to_mm(c), [h for h in holes if len(h) >= 3]).buffer(0)
    if p.area >= MIN_AREA_MM2:
        polys.append(p)
logo = unary_union(polys)

# Logo so verschieben, dass die Platte bei (0,0) zentriert ist
ys, xs = np.where(img < THRESH)
x0, x1 = (xs.min() - MARGIN_PX) * MM_PER_PX, (xs.max() + MARGIN_PX) * MM_PER_PX
y0, y1 = (H - ys.max() - MARGIN_PX) * MM_PER_PX, (H - ys.min() + MARGIN_PX) * MM_PER_PX
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
from shapely import affinity
logo = affinity.translate(logo, -cx, -cy)
w, h = x1 - x0, y1 - y0
plate = box(-w / 2 + CORNER_R, -h / 2 + CORNER_R, w / 2 - CORNER_R, h / 2 - CORNER_R).buffer(CORNER_R, quad_segs=16)

# ---- 2. Extrudieren --------------------------------------------------------
def extrude(geom, height, z):
    geoms = getattr(geom, "geoms", [geom])
    meshes = [trimesh.creation.extrude_polygon(g, height) for g in geoms]
    m = trimesh.util.concatenate(meshes)
    m.apply_translation([0, 0, z])
    return m

plate_mesh = extrude(plate, PLATE_H, 0)
# Logo leicht in die Platte versenken (0.01 mm) -> sauberes Verschmelzen
logo_mesh = extrude(logo, LOGO_H + 0.01, PLATE_H - 0.01)
combined = trimesh.boolean.union([plate_mesh, logo_mesh], engine="manifold")

out = HERE
plate_mesh.export(os.path.join(out, "457_platte.stl"))
logo_mesh.export(os.path.join(out, "457_logo.stl"))
combined.export(os.path.join(out, "457_komplett.stl"))
scene = trimesh.Scene()
scene.add_geometry(plate_mesh, node_name="Platte_rosa", geom_name="Platte_rosa")
scene.add_geometry(logo_mesh, node_name="Logo_schwarz", geom_name="Logo_schwarz")
scene.export(os.path.join(out, "457_mehrfarbig.3mf"))

# ---- 3. Blender-Datei -------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = "METRIC"
sc.unit_settings.scale_length = 0.001
sc.unit_settings.length_unit = "MILLIMETERS"

def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = 0.6
    return m

def add_obj(name, tm, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(tm.vertices.tolist(), [], tm.faces.tolist())
    me.validate(); me.update()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob

pink = material("Rosa", (0.87, 0.28, 0.26))
black = material("Schwarz", (0.01, 0.01, 0.01))
add_obj("Platte", plate_mesh, pink)
add_obj("Logo", logo_mesh, black)
komplett = add_obj("Komplett (ein Teil)", combined, black)
komplett.hide_set(True); komplett.hide_render = True

# Kamera + Licht für eine schnelle Vorschau
cam = bpy.data.objects.new("Kamera", bpy.data.cameras.new("Kamera"))
sc.collection.objects.link(cam)
cam.location = (0, -260, 260); cam.rotation_euler = (np.radians(45), 0, 0)
sc.camera = cam
sun = bpy.data.objects.new("Sonne", bpy.data.lights.new("Sonne", "SUN"))
sun.data.energy = 3; sun.rotation_euler = (np.radians(30), np.radians(20), 0)
sc.collection.objects.link(sun)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "457_logo.blend"))

print(f"Platte: {w:.1f} x {h:.1f} x {PLATE_H} mm, Logo +{LOGO_H} mm")
print("watertight:", plate_mesh.is_watertight, logo_mesh.is_watertight, combined.is_watertight)
