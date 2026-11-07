/** Cheap, deterministic PNG contact sheet: floor plan and actual exported GLB boxes. Python stdlib only. */
export const DESIGN_PREVIEW_SCRIPT = String.raw`
import zlib

def make_preview(glb):
    iw, ih = 1280, 720
    pixels = bytearray(bytes((247, 249, 251)) * (iw * ih))
    def pixel(x, y, color):
        x, y = int(x), int(y)
        if 0 <= x < iw and 0 <= y < ih:
            pos = (y * iw + x) * 3
            pixels[pos:pos+3] = bytes(color)
    def line(ax, ay, bx, by, color, width=1):
        ax, ay, bx, by = round(ax), round(ay), round(bx), round(by)
        dx, dy = abs(bx-ax), abs(by-ay)
        sx, sy = (1 if ax<bx else -1), (1 if ay<by else -1)
        err = dx-dy
        while True:
            for ox in range(-(width//2), width//2+1):
                for oy in range(-(width//2), width//2+1):
                    pixel(ax+ox, ay+oy, color)
            if ax == bx and ay == by: break
            e2 = err * 2
            if e2 > -dy: err -= dy; ax += sx
            if e2 < dx: err += dx; ay += sy
    def fill(poly, color):
        if len(poly) < 3: return
        low, high = max(0, int(min(p[1] for p in poly))), min(ih-1, int(max(p[1] for p in poly))+1)
        for y in range(low, high+1):
            crosses = []
            for a,b in zip(poly,poly[1:]+poly[:1]):
                if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                    crosses.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
            crosses.sort()
            for j in range(0,len(crosses)-1,2):
                x0,x1=max(0,int(crosses[j])),min(iw-1,int(crosses[j+1]))
                if x1 >= x0:
                    chunk = bytes(color) * (x1-x0+1)
                    start = (y*iw+x0)*3
                    pixels[start:start+len(chunk)] = chunk
    navy = (44, 62, 84)
    # Two independent visual checks: the semantic floor plan and the exported GLB geometry.
    line(640,30,640,700,(196,207,217),2)
    for x0,x1 in ((26,616),(666,1250)):
        line(x0,30,x1,30,navy,3)
        line(x0,695,x1,695,(196,207,217),2)
    scale = min(530/W,570/D)
    ox,oy=320-W*scale/2,375+D*scale/2
    def pp(x,y): return ox+x*scale,oy-y*scale
    fill([pp(0,0),pp(W,0),pp(W,D),pp(0,D)],(241,236,227))
    furniture_colors={"table":(169,114,74),"desk":(169,114,74),
        "chair":(90,152,188),"sofa":(83,149,175),"bed":(102,163,171),
        "cabinet":(164,149,121),"partition":(155,155,155)}
    for item in spec["furniture"]:
        pts=[pp(x,y) for x,y in plan_corners(item)]
        color=furniture_colors.get(item["kind"],(170,170,170))
        fill(pts,color)
        for a,b in zip(pts,pts[1:]+pts[:1]): line(*a,*b,navy,2)
    for wall,a,b,z0,z1 in wall_segments():
        if z0 > 1200 or z1 < 1200: continue
        if wall=="north": one,two=pp(a,D),pp(b,D)
        elif wall=="south": one,two=pp(a,0),pp(b,0)
        elif wall=="east": one,two=pp(W,a),pp(W,b)
        else: one,two=pp(0,a),pp(0,b)
        line(*one,*two,navy,5)
    for opening in spec["openings"]:
        a,b=opening["offset"],opening["offset"]+opening["width"]
        wall=opening["wall"]
        if wall=="north": p0,p1=pp(a,D),pp(b,D)
        elif wall=="south": p0,p1=pp(a,0),pp(b,0)
        elif wall=="east": p0,p1=pp(W,a),pp(W,b)
        else: p0,p1=pp(0,a),pp(0,b)
        if opening["kind"]=="window": line(*p0,*p1,(61,155,206),3)
        else: line(*p0,*p1,(205,151,93),1)
    # Parse the actual GLB JSON instead of reusing the room shape for the second view.
    json_length=struct.unpack_from("<I",glb,12)[0]
    gltf=json.loads(glb[20:20+json_length])
    nodes=gltf["nodes"]
    iso_scale=min(440/(W+D),400/(H+(W+D)*.45))
    def iso(x,y,z):
        return 940+(x-z)*iso_scale,500+(x+z)*iso_scale*.40-y*iso_scale*1.15
    faces=[([4,5,6,7],1.0),([1,2,6,5],.82),([2,3,7,6],.68)]
    corners=[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
             (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]
    palette={"floor":(210,216,211),"wall":(207,211,215),
             "wood":(157,113,75),"seat":(76,130,167),"plant":(64,137,84)}
    meshes=gltf.get("meshes",[])
    materials=gltf.get("materials",[])
    for node in sorted(nodes,key=lambda n:n["translation"][0]+n["translation"][2]):
        center=[v*1000 for v in node["translation"]]
        size=[v*1000 for v in node["scale"]]
        projected=[iso(center[0]+dx*size[0]/2,center[1]+dy*size[1]/2,
                       center[2]+dz*size[2]/2) for dx,dy,dz in corners]
        mesh_id=node.get("mesh",-1)
        mesh=meshes[mesh_id] if isinstance(mesh_id,int) and 0 <= mesh_id < len(meshes) else {}
        primitive=(mesh.get("primitives") or [{}])[0]
        material_id=primitive.get("material",-1)
        material=materials[material_id] if isinstance(material_id,int) and 0 <= material_id < len(materials) else {}
        kind=material.get("name","unknown")
        if kind=="wall":
            for a,b in ((0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),
                        (0,4),(1,5),(2,6),(3,7)):
                line(*projected[a],*projected[b],(164,174,185),1)
        else:
            for indices,shade in faces:
                col=tuple(round(k*shade) for k in palette.get(kind,(155,162,170)))
                points=[projected[i] for i in indices]
                fill(points,col)
                for a,b in zip(points,points[1:]+points[:1]):
                    line(*a,*b,(90,104,118),1)
    def chunk(kind,data):
        return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)
    rows=b"".join(b"\x00"+pixels[y*iw*3:(y+1)*iw*3] for y in range(ih))
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",iw,ih,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(rows,6))+chunk(b"IEND",b"")
`;
