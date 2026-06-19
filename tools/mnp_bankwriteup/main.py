"""
MNP LLP — Bank Writeup Automation Tool
Entry point. Run with: python main.py
"""

import sys
import os
import traceback
from pathlib import Path

# Allow imports from project root when running as a PyInstaller bundle
if getattr(sys, "frozen", False):
    base = sys._MEIPASS
else:
    base = os.path.dirname(os.path.abspath(__file__))

if base not in sys.path:
    sys.path.insert(0, base)

LOG_PATH = Path.home() / ".mnp_bankwriteup" / "crash.log"


def _show_crash(tb: str):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(tb, encoding="utf-8")
    try:
        import tkinter
        import tkinter.messagebox as mb
        root = tkinter.Tk()
        root.withdraw()
        mb.showerror(
            "MNP Bank Writeup — Launch Error",
            f"The application failed to start.\n\n"
            f"A crash log has been saved to:\n{LOG_PATH}\n\n"
            f"Please send this file to your administrator.",
        )
        root.destroy()
    except Exception:
        pass


def main():
    from ui.app import MNPApp
    app = MNPApp()
    app.mainloop()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        _show_crash(traceback.format_exc())
