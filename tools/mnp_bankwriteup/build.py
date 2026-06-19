"""
Build script — produces a single-file distributable.
Run: python build.py
Output: dist/MNP_BankWriteup  (Mac .app or Windows .exe)
"""

import subprocess
import sys
import os
from pathlib import Path

HERE = Path(__file__).parent


def main():
    assets = HERE / "assets"
    icon_mac = assets / "mnp_icon.icns"
    icon_win = assets / "mnp_icon.ico"

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--windowed",
        "--name", "MNP_BankWriteup",
        "--collect-all", "customtkinter",
        "--collect-all", "pdfplumber",
        "--collect-data", "certifi",
        "--hidden-import", "pdfplumber",
        "--hidden-import", "openpyxl",
        "--hidden-import", "openpyxl.cell._writer",
        "--hidden-import", "PIL",
        "--hidden-import", "PIL._tkinter_finder",
        "--hidden-import", "charset_normalizer",
        "--hidden-import", "charset_normalizer.md__mypyc",
        "--hidden-import", "ssl",
        "--hidden-import", "certifi",
    ]

    # Only bundle the assets folder if it actually contains files
    if assets.exists() and any(assets.iterdir()):
        cmd += ["--add-data", f"{assets}{os.pathsep}assets"]

    if sys.platform == "darwin" and icon_mac.exists():
        cmd += ["--icon", str(icon_mac)]
    elif sys.platform == "win32" and icon_win.exists():
        cmd += ["--icon", str(icon_win)]

    cmd.append("main.py")

    print("Running PyInstaller…")
    print(" ".join(cmd))
    result = subprocess.run(cmd, cwd=str(HERE))

    if result.returncode == 0:
        print("\n[OK] Build complete.")
        print(f"  Output: {HERE / 'dist' / 'MNP_BankWriteup'}")
    else:
        print("\n[FAIL] Build failed -- see output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
