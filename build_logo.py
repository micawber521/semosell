import json, sys, math
src, out = sys.argv[1], sys.argv[2]
SEMO = {"Pemiscot","Dunklin","New Madrid","Mississippi","Scott","Stoddard","Cape Girardeau","Bollinger","Perry"}
d = json.load(open(src))
mo = [f for f in d["features"] if f["id"].startswith("29")]
names = {f["properties"]["NAME"] for f in mo}
missing = SEMO - names
assert not missing, missing
def rings(g):
    if g["type"] == "Polygon": return g["coordinates"]
    return [r for p in g["coordinates"] for r in p]
lat0 = math.radians(38.4)
def proj(lon, lat): return (lon*math.cos(lat0), -lat)
pts = [proj(*c) for f in mo for r in rings(f["geometry"]) for c in r]
minx=min(p[0] for p in pts); maxx=max(p[0] for p in pts); miny=min(p[1] for p in pts); maxy=max(p[1] for p in pts)
W=1000; s=W/(maxx-minx); H=(maxy-miny)*s; pad=8
def path(f):
    parts=[]
    for r in rings(f["geometry"]):
        xy=[((x-minx)*s+pad,(y-miny)*s+pad) for x,y in (proj(*c) for c in r)]
        parts.append("M"+"L".join(f"{x:.1f},{y:.1f}" for x,y in xy)+"Z")
    return "".join(parts)
black="".join(path(f) for f in mo if f["properties"]["NAME"] not in SEMO)
green="".join(path(f) for f in mo if f["properties"]["NAME"] in SEMO)
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W+2*pad:.0f} {H+2*pad:.0f}" role="img" aria-label="Missouri with the Southeast Missouri region highlighted">
<path d="{black}" fill="#111" stroke="#111" stroke-width="2.4" stroke-linejoin="round"/>
<path d="{green}" fill="#1f8a3b" stroke="#1f8a3b" stroke-width="2.4" stroke-linejoin="round"/>
</svg>'''
open(out,"w").write(svg)
print(len(mo),"counties; svg bytes",len(svg))
