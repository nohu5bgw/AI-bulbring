"""
MNP LLP Bank Writeup Automation — redesigned UI
  • Top nav: Bank Writeup | Search Records
  • Dark green brand colour
  • Client Number instead of Period
  • Upload-focused Bank Writeup page (no transaction table)
  • Search page queries saved writeup history
"""

import os
import sys
import threading
import traceback
from pathlib import Path
from tkinter import filedialog, messagebox, StringVar
import tkinter as tk

try:
    import customtkinter as ctk
except ImportError:
    sys.exit("customtkinter not installed — run: pip install customtkinter")

# ── Brand ─────────────────────────────────────────────────────────────────────
MNP_GREEN  = "#1A5C38"   # dark green
MNP_GREEN2 = "#14472B"   # hover / darker shade
MNP_BLACK  = "#1A1A1A"
MNP_GREY   = "#F0F0F0"
MNP_LGREY  = "#FAFAFA"
TEXT_DIM   = "#888888"
COL_GREEN  = "#1E7B34"
COL_ORANGE = "#E65C00"
COL_RED    = "#C8102E"
WHITE      = "#FFFFFF"

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")


# ── Utility ───────────────────────────────────────────────────────────────────

def _trunc(s: str, n: int) -> str:
    return s if len(s) <= n else s[:n - 1] + "…"


def _open_file(path: str):
    import subprocess
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif sys.platform == "win32":
        os.startfile(path)
    else:
        subprocess.Popen(["xdg-open", path])


# ── File chip (shown in upload zone after adding files) ───────────────────────

class FileChip(ctk.CTkFrame):
    def __init__(self, parent, name: str, on_remove, **kwargs):
        super().__init__(parent, fg_color="#E8F5EE", corner_radius=6,
                         height=32, **kwargs)
        self.pack_propagate(False)

        ctk.CTkLabel(
            self, text="📄", font=ctk.CTkFont(size=13), fg_color="transparent",
        ).pack(side="left", padx=(8, 2))

        ctk.CTkLabel(
            self, text=_trunc(name, 40),
            font=ctk.CTkFont(family="Calibri", size=11),
            text_color=MNP_BLACK, fg_color="transparent", anchor="w",
        ).pack(side="left", fill="x", expand=True, padx=(0, 4))

        ctk.CTkButton(
            self, text="✕", width=22, height=22,
            fg_color="transparent", hover_color="#C8E6D4",
            text_color=TEXT_DIM, font=ctk.CTkFont(size=10),
            command=on_remove,
        ).pack(side="right", padx=4)


# ─────────────────────────────────────────────────────────────────────────────
# PAGE: Bank Writeup
# ─────────────────────────────────────────────────────────────────────────────

class WriteupPage(ctk.CTkFrame):

    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color=MNP_LGREY, **kwargs)
        self._files: list[str] = []       # file paths
        self._chips: dict[str, FileChip] = {}
        self._parse_lock = threading.Lock()
        self._build()

    def _build(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # ── Upload zone ───────────────────────────────────────────────────────
        zone_wrap = ctk.CTkFrame(self, fg_color=WHITE, corner_radius=10)
        zone_wrap.grid(row=0, column=0, sticky="nsew", padx=24, pady=(20, 12))
        zone_wrap.grid_rowconfigure(0, weight=1)
        zone_wrap.grid_columnconfigure(0, weight=1)

        # Dashed-border canvas (simulated with a frame + label)
        self._zone = ctk.CTkFrame(
            zone_wrap, fg_color="#F3FAF6", corner_radius=12,
            border_width=2, border_color="#A8D5B5",
        )
        self._zone.grid(row=0, column=0, sticky="nsew", padx=20, pady=20)
        self._zone.grid_columnconfigure(0, weight=1)
        self._zone.grid_rowconfigure(0, weight=1)

        # Empty state
        self._empty_frame = ctk.CTkFrame(self._zone, fg_color="transparent")
        self._empty_frame.grid(row=0, column=0)

        ctk.CTkLabel(
            self._empty_frame, text="⬆",
            font=ctk.CTkFont(size=40), text_color="#A8D5B5",
        ).pack(pady=(0, 4))

        ctk.CTkLabel(
            self._empty_frame,
            text="Upload your bank statements here",
            font=ctk.CTkFont(family="Calibri", size=16, weight="bold"),
            text_color=MNP_BLACK,
        ).pack()

        ctk.CTkLabel(
            self._empty_frame,
            text="PDF or Excel · any bank · up to 30 files at once",
            font=ctk.CTkFont(family="Calibri", size=11),
            text_color=TEXT_DIM,
        ).pack(pady=(4, 20))

        ctk.CTkButton(
            self._empty_frame,
            text="Browse Files",
            font=ctk.CTkFont(family="Calibri", size=13, weight="bold"),
            width=160, height=40,
            fg_color=MNP_GREEN, hover_color=MNP_GREEN2,
            command=self._browse,
        ).pack()

        # Filled state (hidden until files added)
        self._filled_frame = ctk.CTkFrame(self._zone, fg_color="transparent")
        self._chips_frame = ctk.CTkScrollableFrame(
            self._filled_frame, fg_color="transparent", height=220,
        )
        self._chips_frame.pack(fill="both", expand=True, padx=16, pady=(16, 8))
        self._chips_frame.grid_columnconfigure(0, weight=1)

        add_more = ctk.CTkButton(
            self._filled_frame, text="+ Add More Files",
            font=ctk.CTkFont(family="Calibri", size=11),
            height=28, width=140,
            fg_color="transparent", hover_color="#E8F5EE",
            text_color=MNP_GREEN, border_width=1, border_color=MNP_GREEN,
            command=self._browse,
        )
        add_more.pack(pady=(0, 12))

        # ── Footer: status + generate button ─────────────────────────────────
        footer = ctk.CTkFrame(self, fg_color=WHITE, corner_radius=10)
        footer.grid(row=1, column=0, sticky="ew", padx=24, pady=(0, 20))
        footer.grid_columnconfigure(1, weight=1)

        self._gen_btn = ctk.CTkButton(
            footer,
            text="Generate Writeup",
            font=ctk.CTkFont(family="Calibri", size=14, weight="bold"),
            width=200, height=42,
            fg_color=MNP_GREEN, hover_color=MNP_GREEN2,
            state="disabled",
            command=self._generate,
        )
        self._gen_btn.grid(row=0, column=0, padx=16, pady=12)

        self._progress = ctk.CTkProgressBar(
            footer, width=180, height=8,
            fg_color=MNP_GREY, progress_color=MNP_GREEN,
        )
        self._progress.set(0)
        self._progress.grid(row=0, column=1, padx=8, pady=12, sticky="w")
        self._progress.grid_remove()

        self._status_var = StringVar(value="Add statements to get started.")
        ctk.CTkLabel(
            footer, textvariable=self._status_var, anchor="e",
            font=ctk.CTkFont(family="Calibri", size=11), text_color=TEXT_DIM,
        ).grid(row=0, column=2, padx=16, pady=12)

    # ── File management ───────────────────────────────────────────────────────

    def _browse(self):
        paths = filedialog.askopenfilenames(
            title="Select bank statements",
            filetypes=[
                ("Supported", "*.pdf *.xlsx *.xls"),
                ("PDF", "*.pdf"),
                ("Excel", "*.xlsx *.xls"),
            ],
        )
        for p in paths:
            if p not in self._files:
                self._files.append(p)
                self._add_chip(p)
        self._refresh_zone()

    def _add_chip(self, path: str):
        name = Path(path).name
        chip = FileChip(
            self._chips_frame, name,
            on_remove=lambda p=path: self._remove_file(p),
        )
        chip.pack(fill="x", padx=4, pady=3)
        self._chips[path] = chip

    def _remove_file(self, path: str):
        if path in self._files:
            self._files.remove(path)
        if path in self._chips:
            self._chips[path].destroy()
            del self._chips[path]
        self._refresh_zone()

    def _refresh_zone(self):
        if self._files:
            self._empty_frame.grid_remove()
            self._filled_frame.grid(row=0, column=0, sticky="nsew")
            self._zone.grid_rowconfigure(0, weight=1)
            self._gen_btn.configure(state="normal")
            n = len(self._files)
            self._status_var.set(
                f"{n} file{'s' if n != 1 else ''} ready · click Generate Writeup"
            )
        else:
            self._filled_frame.grid_remove()
            self._empty_frame.grid(row=0, column=0)
            self._gen_btn.configure(state="disabled")
            self._status_var.set("Add statements to get started.")

    # ── Upload + AI pipeline (backend-powered) ────────────────────────────────

    def _generate(self):
        if not self._files:
            return

        save_path = filedialog.asksaveasfilename(
            title="Save Writeup Excel",
            initialfile="MNP_Writeup.xlsx",
            defaultextension=".xlsx",
            filetypes=[("Excel Workbook", "*.xlsx")],
            initialdir=str(Path.home() / "Desktop"),
        )
        if not save_path:
            return

        # Ensure we're signed in before uploading.
        import api_client
        if not api_client.get_token():
            if not self._prompt_pin():
                return

        self._gen_btn.configure(state="disabled")
        self._progress.set(0)
        self._progress.grid()
        self._status_var.set("Uploading statements to AI agent…")

        files = list(self._files)

        def worker():
            try:
                token = api_client.get_token()
                if not token:
                    self.after(0, lambda: self._fail("Not signed in"))
                    return

                xlsx_bytes, meta = api_client.process_statements(files, token)

                self.after(0, lambda p=0.85: self._progress.set(p))

                with open(save_path, "wb") as fh:
                    fh.write(xlsx_bytes)

                # Save to local record store
                import store
                fallback_name = Path(files[0]).stem if files else "Writeup"
                store.add_record(
                    client_name       = fallback_name,
                    client_number     = "",
                    file_path         = save_path,
                    statement_count   = meta.get("statement_count", len(files)),
                    transaction_count = meta.get("transaction_count", 0),
                )

                self.after(0, lambda: self._done(save_path, []))

            except api_client.AuthError as e:
                msg = str(e)
                self.after(0, lambda: self._auth_failed(msg))
            except api_client.ApiError as e:
                msg = str(e)
                self.after(0, lambda: self._fail(msg))
            except Exception as e:
                tb = traceback.format_exc()
                print(tb)
                msg = str(e) or "Unknown error"
                self.after(0, lambda: self._fail(msg))

        threading.Thread(target=worker, daemon=True).start()

    def _prompt_pin(self) -> bool:
        """Modal PIN entry. Returns True if a valid token was obtained."""
        import api_client
        dlg = ctk.CTkInputDialog(
            title="Sign in to Bulbring AI",
            text="Enter your PIN to use the AI agent:",
        )
        pin = dlg.get_input()
        if not pin:
            return False
        try:
            api_client.sign_in_with_pin(pin.strip())
            return True
        except api_client.AuthError as e:
            messagebox.showerror("Sign-in failed", str(e))
            return False

    def _auth_failed(self, msg: str):
        self._progress.grid_remove()
        self._gen_btn.configure(state="normal")
        self._status_var.set("Sign in required.")
        messagebox.showwarning("Sign-in required", msg)

    def _done(self, save_path: str, errors: list):
        self._progress.grid_remove()
        self._gen_btn.configure(state="normal")
        short = Path(save_path).name
        self._status_var.set(f"Saved: {short}")

        msg = f"Writeup saved to:\n{save_path}"
        if errors:
            msg += f"\n\n⚠ {len(errors)} file(s) had errors:\n" + "\n".join(errors)

        if messagebox.askyesno("Done", msg + "\n\nOpen now?"):
            _open_file(save_path)

    def _fail(self, err: str):
        self._progress.grid_remove()
        self._gen_btn.configure(state="normal")
        self._status_var.set(f"Error: {err}")
        messagebox.showerror("Export failed", err)


# ─────────────────────────────────────────────────────────────────────────────
# PAGE: Search Records
# ─────────────────────────────────────────────────────────────────────────────

class SearchPage(ctk.CTkFrame):

    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color=MNP_LGREY, **kwargs)
        self._build()

    def _build(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # ── Search bar ────────────────────────────────────────────────────────
        bar = ctk.CTkFrame(self, fg_color=WHITE, corner_radius=10)
        bar.grid(row=0, column=0, sticky="ew", padx=24, pady=(20, 12))
        bar.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            bar, text="🔍", font=ctk.CTkFont(size=18), fg_color="transparent",
        ).grid(row=0, column=0, padx=(16, 4), pady=14)

        self._query = StringVar()
        self._query.trace_add("write", lambda *_: self._search())

        ctk.CTkEntry(
            bar, textvariable=self._query,
            font=ctk.CTkFont(family="Calibri", size=13),
            height=38, border_width=0, fg_color=MNP_GREY,
            placeholder_text="Search by client name or client number…",
        ).grid(row=0, column=1, sticky="ew", padx=(0, 16), pady=14)

        # ── Results list ──────────────────────────────────────────────────────
        self._results_frame = ctk.CTkScrollableFrame(
            self, fg_color="transparent", corner_radius=0,
        )
        self._results_frame.grid(row=1, column=0, sticky="nsew", padx=24, pady=(0, 20))
        self._results_frame.grid_columnconfigure(0, weight=1)

        self._empty_lbl = ctk.CTkLabel(
            self._results_frame,
            text="No writeups generated yet.\nHead to Bank Writeup to create one.",
            font=ctk.CTkFont(family="Calibri", size=13),
            text_color=TEXT_DIM, justify="center",
        )
        self._empty_lbl.pack(pady=60)

        self._search()   # populate on load

    def on_show(self):
        """Called whenever this tab becomes visible — refresh results."""
        self._search()

    def _search(self):
        import store
        q       = self._query.get()
        records = store.search(q)
        self._render(records)

    def _render(self, records: list):
        for w in self._results_frame.winfo_children():
            w.destroy()

        if not records:
            lbl = ctk.CTkLabel(
                self._results_frame,
                text=(
                    "No results found." if self._query.get()
                    else "No writeups generated yet.\nHead to Bank Writeup to create one."
                ),
                font=ctk.CTkFont(family="Calibri", size=13),
                text_color=TEXT_DIM, justify="center",
            )
            lbl.pack(pady=60)
            return

        ctk.CTkLabel(
            self._results_frame,
            text=f"{len(records)} result{'s' if len(records) != 1 else ''}",
            font=ctk.CTkFont(family="Calibri", size=10),
            text_color=TEXT_DIM, anchor="w",
        ).pack(anchor="w", pady=(0, 6))

        for r in records:
            self._render_card(r)

    def _render_card(self, r: dict):
        card = ctk.CTkFrame(self._results_frame, fg_color=WHITE, corner_radius=3)
        card.pack(fill="x", pady=1)
        card.grid_columnconfigure(1, weight=1)

        ctk.CTkFrame(card, fg_color=MNP_GREEN, width=3, corner_radius=1).grid(
            row=0, column=0, sticky="ns", padx=(0, 6), pady=2,
        )

        name    = r.get("client_name") or "Unknown Client"
        num     = r.get("client_number") or ""
        gen     = r.get("generated_at", "")
        stmts   = r.get("statement_count", 0)
        txns    = r.get("transaction_count", 0)
        num_str = f"  #{num}" if num else ""
        meta    = f"{name}{num_str}  ·  {stmts} stmt · {txns} txns  ·  {gen}"

        ctk.CTkLabel(
            card, text=meta,
            font=ctk.CTkFont(family="Calibri", size=9),
            text_color=MNP_BLACK, anchor="w",
        ).grid(row=0, column=1, sticky="ew", padx=(0, 4), pady=2)

        path        = r.get("file_path", "")
        file_exists = Path(path).exists() if path else False

        ctk.CTkButton(
            card, text="Open",
            font=ctk.CTkFont(family="Calibri", size=9),
            width=42, height=18,
            fg_color=MNP_GREEN if file_exists else MNP_GREY,
            hover_color=MNP_GREEN2 if file_exists else MNP_GREY,
            text_color=WHITE if file_exists else TEXT_DIM,
            state="normal" if file_exists else "disabled",
            command=lambda p=path: _open_file(p),
        ).grid(row=0, column=2, padx=2, pady=2)

        ctk.CTkButton(
            card, text="📁",
            font=ctk.CTkFont(size=10),
            width=22, height=18,
            fg_color="transparent", hover_color=MNP_GREY,
            text_color=MNP_GREEN if file_exists else TEXT_DIM,
            state="normal" if file_exists else "disabled",
            command=lambda p=path: self._reveal(p),
        ).grid(row=0, column=3, padx=(0, 6), pady=2)

    def _reveal(self, path: str):
        import subprocess
        p = Path(path)
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(p)])
        elif sys.platform == "win32":
            subprocess.Popen(["explorer", "/select,", str(p)])
        else:
            subprocess.Popen(["xdg-open", str(p.parent)])


# ─────────────────────────────────────────────────────────────────────────────
# Main window
# ─────────────────────────────────────────────────────────────────────────────

class MNPApp(ctk.CTk):

    def __init__(self):
        super().__init__()
        self.title("MNP LLP — Bank Writeup")
        self.geometry("1100x760")
        self.minsize(900, 600)
        self.configure(fg_color=MNP_LGREY)
        self._build()

    def _build(self):
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self._build_nav()
        self._build_pages()
        self._show("writeup")

    # ── Top nav ───────────────────────────────────────────────────────────────

    def _build_nav(self):
        nav = ctk.CTkFrame(self, fg_color=MNP_BLACK, corner_radius=0, height=58)
        nav.grid(row=0, column=0, sticky="ew")
        nav.grid_propagate(False)
        nav.grid_columnconfigure(2, weight=1)

        # Wordmark
        ctk.CTkLabel(
            nav, text="MNP LLP",
            font=ctk.CTkFont(family="Calibri", size=22, weight="bold"),
            text_color=MNP_GREEN,
        ).grid(row=0, column=0, padx=(20, 32), pady=0, sticky="ns")

        # Nav buttons — packed close together
        self._nav_btns = {}
        btn_container = ctk.CTkFrame(nav, fg_color="transparent")
        btn_container.grid(row=0, column=1, padx=0, pady=0, sticky="ns")

        for key, label in [("writeup", "Bank Writeup"), ("search", "Search Records")]:
            btn = ctk.CTkButton(
                btn_container, text=label,
                font=ctk.CTkFont(family="Calibri", size=12),
                width=120, height=58,
                fg_color="transparent", hover_color="#2A2A2A",
                text_color="#CCCCCC", corner_radius=0,
                command=lambda k=key: self._show(k),
            )
            btn.pack(side="left", padx=0)
            self._nav_btns[key] = btn

    def _build_pages(self):
        self._pages = {}

        self._writeup_page = WriteupPage(self)
        self._pages["writeup"] = self._writeup_page

        self._search_page = SearchPage(self)
        self._pages["search"] = self._search_page

    def _show(self, key: str):
        for k, page in self._pages.items():
            page.grid_remove()

        self._pages[key].grid(row=1, column=0, sticky="nsew")

        # Update nav button active state
        for k, btn in self._nav_btns.items():
            if k == key:
                btn.configure(text_color=WHITE, fg_color="#2A2A2A")
            else:
                btn.configure(text_color="#CCCCCC", fg_color="transparent")

        # Refresh search results when switching to that tab
        if key == "search":
            self._search_page.on_show()
