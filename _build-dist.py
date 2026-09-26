"""Build folder _dist/ dengan WHITELIST — hanya file yang boleh publik.

Jalankan: python _build-dist.py
Deploy  : npx wrangler pages deploy _dist --project-name=padel-kita-jogja --branch=main --commit-dirty=true

PENTING: JANGAN pernah `wrangler pages deploy .` — file internal
(.env.local, README.md, supabase-schema.sql, dsb) akan ikut ter-upload.
"""
import shutil
from pathlib import Path

SRC = Path(__file__).parent
DIST = SRC / "_dist"

# ── Whitelist: hanya ini yang boleh publik ────────────────────
FILES = [
    # Halaman
    "index.html", "checkout.html", "success.html", "404.html",
    # Cloudflare Pages config
    "_headers", "_redirects",
]
DIRS = [
    "assets",    # favicon, icon, logo, og-image, webmanifest
    "css",
    "js",
    "images",    # gambar teroptimasi untuk web
    "admin",
]

# ── Build ─────────────────────────────────────────────────────
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir()

count = 0
for f in FILES:
    s = SRC / f
    if s.exists():
        shutil.copy2(s, DIST / f)
        count += 1
        print(f"  file  {f}")
    else:
        print(f"  SKIP (tidak ada): {f}")

for d in DIRS:
    s = SRC / d
    if s.exists():
        shutil.copytree(s, DIST / d)
        n = sum(1 for x in (DIST / d).rglob("*") if x.is_file())
        count += n
        print(f"  dir   {d}/  ({n} file)")
    else:
        print(f"  SKIP (tidak ada): {d}/")

# ── Guard: pastikan tidak ada file sensitif lolos ─────────────
print()
print("=== GUARD: cek file sensitif ===")
BAD = [".env", ".env.local", "README.md", "AGENTS.md", "supabase-schema.sql",
       "wrangler.toml", ".gitignore", "_build-dist.py"]
leak = []
for b in BAD:
    if (DIST / b).exists():
        leak.append(b)
for p in DIST.rglob("*"):
    if p.is_file() and (p.suffix == ".py" or p.name.startswith(".env")):
        leak.append(str(p.relative_to(DIST)))

if leak:
    print("  🔴 BAHAYA — file sensitif ikut ter-build:")
    for x in leak:
        print(f"     {x}")
    raise SystemExit(1)
print("  ✅ bersih — tidak ada file sensitif")

print()
print(f"Total: {count} file")
print(f"Dist : {DIST}")
