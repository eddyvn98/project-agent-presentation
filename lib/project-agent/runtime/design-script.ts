/** Python standard-library-only headless exporter; intentionally no Blender, AutoCAD or LibreOffice dependency. */
export const DESIGN_SCRIPT = String.raw\`import base64, html, json, math, os, struct, sys, unicodedata

spec = json.load(open(sys.argv[1], encoding="utf-8"))
prefix = sys.argv[2]
output = "/work/outputs"
room = spec["room"]
W, D, H, T = (room[k] for k in ("width", "depth", "height", "wallThickness"))
files = []

def put(ext, content, binary=False):
    name = prefix + "." + ext
    with open(os.path.join(output, name), "xb" if binary else "x", **({} if binary else {"encoding": "utf-8"})) as stream:
        stream.write(content)
    files.append("outputs/" + name)

def ascii_text(value):
    value = str(value).replace("Đ", "D").replace("đ", "d")
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")

def plan_corners(item):
    w, d = item["width"], item["depth"]
    a = math.radians(item["rotation"])
    x, y = item["x"], item["y"]
    return [(x + dx * math.cos(a) - dy * math.sin(a),
             y + dx * math.sin(a) + dy * math.cos(a))
            for dx, dy in ((-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2))]

def wall_segments():
    for wall in ("south", "north", "west", "east"):
        length = W if wall in ("south", "north") else D
        openings = sorted((o for o in spec["openings"] if o["wall"] == wall), key=lambda o: o["offset"])
        cursor = 0
        for opening in openings:
            if cursor < opening["offset"]:
                yield (wall, cursor, opening["offset"], 0, H)
            start, end = opening["offset"], opening["offset"] + opening["width"]
            if opening["sill"]:
                yield (wall, start, end, 0, opening["sill"])
            top = opening["sill"] + opening["height"]
            if top < H:
                yield (wall, start, end, top, H)
            cursor = end
        if cursor < length:
            yield (wall, cursor, length, 0, H)

def draw_lines():
    for wall, a, b, z0, z1 in wall_segments():
        if z0 != 0 or z1 != H:
            continue
        if wall == "south": yield ((a, 0), (b, 0), "WALL")
        if wall == "north": yield ((a, D), (b, D), "WALL")
        if wall == "west": yield ((0, a), (0, b), "WALL")
        if wall == "east": yield ((W, a), (W, b), "WALL")
    for i, item in enumerate(spec["furniture"]):
        pts = plan_corners(item)
        for a, b in zip(pts, pts[1:] + pts[:1]):
            yield (a, b, "FURNITURE")

def dxf_pair(code, value):
    return str(code) + "\n" + str(value) + "\n"

def make_dxf():
    out = [dxf_pair(0, "SECTION"), dxf_pair(2, "HEADER"), dxf_pair(9, "$ACADVER"),
           dxf_pair(1, "AC1009"), dxf_pair(0, "ENDSEC"),
           dxf_pair(0, "SECTION"), dxf_pair(2, "ENTITIES")]
    for a, b, layer in draw_lines():
        out.append("".join([dxf_pair(0, "LINE"), dxf_pair(8, layer), dxf_pair(10, round(a[0], 3)),
          dxf_pair(20, round(a[1], 3)), dxf_pair(30, 0), dxf_pair(11, round(b[0], 3)),
          dxf_pair(21, round(b[1], 3)), dxf_pair(31, 0)]))
    for item in spec["furniture"]:
        out.append("".join([dxf_pair(0, "TEXT"), dxf_pair(8, "LABEL"),
          dxf_pair(10, item["x"]), dxf_pair(20, item["y"]), dxf_pair(30, 0),
          dxf_pair(40, max(80, min(W,D) / 65)), dxf_pair(1, ascii_text(item["label"])[:40])]))
    out.append(dxf_pair(0, "ENDSEC") + dxf_pair(0, "EOF"))
    return "".join(out)

def make_pdf():
    pagew, pageh = 1190, 842
    scale = min(950 / W, 640 / D)
    x0, y0 = (pagew - W * scale) / 2, (pageh - D * scale) / 2
    content = ["0 0 0 RG", "0.9 w"]
    for a, b, layer in draw_lines():
        content.append("%.3f %.3f m %.3f %.3f l S" % (x0 + a[0]*scale, y0 + a[1]*scale,
          x0 + b[0]*scale, y0 + b[1]*scale))
    def label(x, y, value, fontsize=10):
        escaped = ascii_text(value).replace("\\\\", "\\\\\\\\").replace("(", "\\\\(").replace(")", "\\\\)")
        content.append("BT /F1 %d Tf %.2f %.2f Td (%s) Tj ET" % (fontsize, x, y, escaped))
    label(50, 794, spec["title"], 21)
    label(50, 768, "INTERIOR CONCEPT | FLOOR PLAN | UNITS: mm", 10)
    label(50, 48, "CONCEPT ONLY - NOT VERIFIED FOR CONSTRUCTION", 11)
    label(x0 + W*scale/2-35, y0-30, str(round(W))+" mm", 11)
    label(x0-85, y0 + D*scale/2, str(round(D))+" mm", 11)
    for item in spec["furniture"]:
        label(x0 + item["x"]*scale - 12, y0 + item["y"]*scale, item["kind"][:9], 8)
    stream = "\n".join(content).encode("latin-1", "replace")
    objects = [
      b"<< /Type /Catalog /Pages 2 0 R >>",
      b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
      b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    pdf = bytearray(b"%PDF-1.4\n%\\xe2\\xe3\\xcf\\xd3\n")
    offsets = [0]
    for idx, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(("%d 0 obj\n" % idx).encode() + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(("xref\n0 %d\n0000000000 65535 f \n" % (len(objects)+1)).encode())
    for off in offsets[1:]:
        pdf.extend(("%010d 00000 n \n" % off).encode())
    pdf.extend(("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects)+1, xref)).encode())
    return bytes(pdf)

# One instanced cuboid per object, per-class materials. glTF 2.0 uses Y-up and metres.
def cubes():
    yield ("floor", W/2, D/2, -40, W, D, 80)
    for wall, a, b, z0, z1 in wall_segments():
        if wall in ("north", "south"):
            yield ("wall", (a+b)/2, D - T/2 if wall == "north" else T/2,
                   (z0+z1)/2, b-a, T, z1-z0)
        else:
            yield ("wall", W-T/2 if wall == "east" else T/2,
                   (a+b)/2, (z0+z1)/2, T, b-a, z1-z0)
    for item in spec["furniture"]:
        fw, fd = (item["depth"], item["width"]) if item["rotation"] in (90,270) else (item["width"], item["depth"])
        if item["kind"] in ("table", "desk"):
            yield ("wood", item["x"], item["y"], item["height"]-40, fw, fd, 80)
            for sx in (-1,1):
                for sy in (-1,1):
                    yield ("wood", item["x"] + sx*(fw/2-65), item["y"] + sy*(fd/2-65),
                           (item["height"]-80)/2, 70, 70, item["height"]-80)
        elif item["kind"] == "chair":
            seat = min(450, item["height"]*.57)
            yield ("seat", item["x"], item["y"], seat, fw, fd, 80)
            yield ("seat", item["x"], item["y"]+fd/2-55, (seat+item["height"])/2,
                   fw, 110, item["height"]-seat)
        else:
            yield ("seat" if item["kind"] in ("sofa", "bed") else "wood",
                   item["x"], item["y"], item["height"]/2, fw, fd, item["height"])

def make_glb():
    faces = [((0,0,-1), [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1)]),
             ((0,0,1), [(-1,-1,1),(-1,1,1),(1,1,1),(1,-1,1)]),
             ((0,-1,0), [(-1,-1,-1),(-1,-1,1),(1,-1,1),(1,-1,-1)]),
             ((0,1,0), [(-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1)]),
             ((-1,0,0), [(-1,-1,-1),(-1,1,-1),(-1,1,1),(-1,-1,1)]),
             ((1,0,0), [(1,-1,-1),(1,-1,1),(1,1,1),(1,1,-1)])]
    pos, normal, idx = [], [], []
    for normalvec, verts in faces:
        base = len(pos)//3
        for v in verts:
            pos.extend(k/2 for k in v)
            normal.extend(normalvec)
        idx.extend(base+i for i in (0,1,2,0,2,3))
    p = struct.pack("<%df" % len(pos), *pos)
    n = struct.pack("<%df" % len(normal), *normal)
    indices = struct.pack("<%dH" % len(idx), *idx)
    binary = p + n + indices
    while len(binary) % 4: binary += b"\x00"
    views = [{"buffer":0,"byteOffset":0,"byteLength":len(p)},
             {"buffer":0,"byteOffset":len(p),"byteLength":len(n)},
             {"buffer":0,"byteOffset":len(p)+len(n),"byteLength":len(indices)}]
    accessors = [{"bufferView":0,"componentType":5126,"count":len(pos)//3,"type":"VEC3","min":[-.5,-.5,-.5],"max":[.5,.5,.5]},
                 {"bufferView":1,"componentType":5126,"count":len(normal)//3,"type":"VEC3"},
                 {"bufferView":2,"componentType":5123,"count":len(idx),"type":"SCALAR"}]
    palette = [("floor",[.81,.83,.81,1]),("wall",[.94,.91,.85,1]),
               ("wood",[.58,.38,.22,1]),("seat",[.23,.42,.54,1])]
    materials = [{"name":name,"pbrMetallicRoughness":{"baseColorFactor":color,"metallicFactor":0,"roughnessFactor":.85},"doubleSided":True} for name,color in palette]
    meshes = [{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1},"indices":2,"material":i}]} for i in range(len(materials))]
    kinds = {name:i for i,(name,_) in enumerate(palette)}
    nodes = []
    for kind,cx,cy,cz,sx,sy,sz in cubes():
        if min(sx,sy,sz) <= 0: continue
        nodes.append({"mesh":kinds[kind],"translation":[cx/1000,cz/1000,cy/1000],
                      "scale":[sx/1000,sz/1000,sy/1000]})
    gltf = {"asset":{"version":"2.0","generator":"Project Agent Headless Design MVP"},
            "scene":0,"scenes":[{"nodes":list(range(len(nodes)))}],"nodes":nodes,
            "meshes":meshes,"materials":materials,"buffers":[{"byteLength":len(binary)}],
            "bufferViews":views,"accessors":accessors}
    encoded = json.dumps(gltf,separators=(",",":")).encode()
    while len(encoded) % 4: encoded += b" "
    return struct.pack("<4sII",b"glTF",2,12+8+len(encoded)+8+len(binary)) + struct.pack("<I4s",len(encoded),b"JSON") + encoded + struct.pack("<I4s",len(binary),b"BIN\x00") + binary

def make_viewer(glb):
    data = base64.b64encode(glb).decode()
    title = html.escape(spec["title"], quote=True)
    return """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>""" + title + """ - 3D concept</title>
<style>body{margin:0;background:#101827;color:#f1f5f9;font:15px system-ui}
header{padding:14px 20px;background:#1e293b}h1{margin:0;font-size:18px}
small{color:#cbd5e1}#scene{width:100%;height:calc(100vh - 75px);display:block}
#status{position:absolute;bottom:18px;left:20px;background:#1e293bcc;padding:10px;border-radius:7px}</style>
<header><h1>""" + title + """</h1><small>Orbit: drag | Zoom: scroll | Concept only (not verified for construction)</small></header>
<canvas id="scene"></canvas><div id="status">Loading lightweight 3D viewer...</div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>
<script type="module">
import * as THREE from "three";
import {OrbitControls} from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js";
import {GLTFLoader} from "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js";
const canvas=document.getElementById("scene"), msg=document.getElementById("status");
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf1f5f9);
const camera=new THREE.PerspectiveCamera(50,1,.02,1000);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x738292,2));
const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(9,16,10);scene.add(sun);
const raw=atob("""" + data + """");
const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
new GLTFLoader().parse(bytes.buffer,"",gltf=>{
 scene.add(gltf.scene);const bounds=new THREE.Box3().setFromObject(gltf.scene);
 const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const distance=Math.max(size.x,size.z,size.y)*1.4;
 camera.position.set(center.x+distance,center.y+distance*.9,center.z+distance);
 controls.target.copy(center);controls.update();
 msg.textContent="3D concept loaded | drag to rotate | PDF / DXF / GLB are separate deliverables";
},err=>{msg.textContent="Preview unavailable. Download the GLB file.";console.error(err)});
function draw(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);
 camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();controls.update();renderer.render(scene,camera)}
function frame(){draw();requestAnimationFrame(frame)}frame();
</script></html>"""

warnings = []
items = spec["furniture"]
for i in range(len(items)):
    a = items[i]
    pa = plan_corners(a)
    ax0,ax1 = min(p[0] for p in pa),max(p[0] for p in pa)
    ay0,ay1 = min(p[1] for p in pa),max(p[1] for p in pa)
    for j in range(i+1,len(items)):
        b = items[j]
        pb = plan_corners(b)
        bx0,bx1 = min(p[0] for p in pb),max(p[0] for p in pb)
        by0,by1 = min(p[1] for p in pb),max(p[1] for p in pb)
        if ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1:
            warnings.append("Possible furniture overlap: %d and %d" % (i+1,j+1))
put("design.json",json.dumps(spec,ensure_ascii=False,indent=2))
put("dxf",make_dxf())
put("pdf",make_pdf(),True)
model3d=make_glb()
put("glb",model3d,True)
put("web.html",make_viewer(model3d))
print(json.dumps({"files":files,"warnings":warnings[:12],"conceptOnly":True}))
\`;\n