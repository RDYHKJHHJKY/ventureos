import os
import zipfile

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
zip_path = os.path.join(root, 'ventureos-full.zip')
exclude = {'node_modules', 'pgdata', '.git', 'ventureos-full.zip'}

if os.path.exists(zip_path):
    os.remove(zip_path)

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir == '.':
            rel_dir = ''
        parts = rel_dir.split(os.sep) if rel_dir else []
        if any(p in exclude for p in parts):
            continue
        for filename in filenames:
            if filename == 'ventureos-full.zip':
                continue
            rel_file = os.path.normpath(os.path.join(rel_dir, filename))
            if any(p in exclude for p in rel_file.split(os.sep)):
                continue
            path = os.path.join(dirpath, filename)
            z.write(path, rel_file)

print('created', zip_path)
