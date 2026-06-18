"""
MNP LLP — Bank Writeup Automation Tool
Entry point. Run with: python main.py
"""

import sys
import os

# Allow imports from project root when running as a PyInstaller bundle
if getattr(sys, "frozen", False):
    base = sys._MEIPASS
else:
    base = os.path.dirname(os.path.abspath(__file__))

if base not in sys.path:
    sys.path.insert(0, base)

from ui.app import MNPApp


def main():
    app = MNPApp()
    app.mainloop()


if __name__ == "__main__":
    main()
