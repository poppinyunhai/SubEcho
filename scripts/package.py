"""Build a deterministic allowlisted Chrome Web Store archive, without credentials/tests."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
files = ['manifest.json', 'background.js', 'translation.js', 'core.js', 'content.js',
         'popup.html', 'popup.css', 'popup.js', 'privacy.html']
files += sorted(set(manifest['icons'].values()))
out = root / 'dist' / f'subecho-{manifest["version"]}.zip'
out.parent.mkdir(exist_ok=True)
with ZipFile(out, 'w', compression=ZIP_DEFLATED) as archive:
    for name in files:
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        archive.writestr(info, (root / name).read_bytes())
print(out)
