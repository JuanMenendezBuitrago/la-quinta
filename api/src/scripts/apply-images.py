"""
Reduce las imagenes de api/generated-images/ (800px, JPEG), las copia al volumen de
uploads del contenedor api y asigna imageUrl a cada producto que aun no tenga foto.

Uso (desde la raiz del proyecto): python3 api/src/scripts/apply-images.py
"""
import glob, json, os, subprocess, tempfile, uuid
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "../../generated-images")
tmp = tempfile.mkdtemp()
mapping = {}

for png in sorted(glob.glob(os.path.join(SRC, "[0-9a-f]" * 24 + ".png"))):
    item_id = os.path.basename(png)[:-4]
    name = f"{uuid.uuid4()}.jpg"
    Image.open(png).convert("RGB").resize((800, 800), Image.LANCZOS).save(os.path.join(tmp, name), quality=82, optimize=True)
    mapping[item_id] = f"/uploads/{name}"

subprocess.run(["docker", "compose", "cp", f"{tmp}/.", "api:/app/uploads/"], check=True)

js = f"""
const map = {json.dumps(mapping)};
let n = 0;
for (const [id, url] of Object.entries(map)) {{
  const r = db.menuitems.updateOne(
    {{ _id: ObjectId(id), $or: [{{ imageUrl: {{ $exists: false }} }}, {{ imageUrl: null }}, {{ imageUrl: "" }}] }},
    {{ $set: {{ imageUrl: url }} }}
  );
  n += r.modifiedCount;
}}
print("actualizados " + n);
"""
subprocess.run(["docker", "compose", "exec", "-T", "mongo", "mongosh", "--quiet", "laquinta", "--eval", js], check=True)
