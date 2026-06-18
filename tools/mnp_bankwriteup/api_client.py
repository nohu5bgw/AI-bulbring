"""
HTTP client for the bulbringai.com backend.

The desktop app delegates PDF parsing and AI categorization to the same
endpoint the web tool uses, so the Anthropic API key stays server-side
and the prompt/Excel output stay in lockstep with the website.
"""

import json
import os
import urllib.request
import urllib.error
import uuid
from pathlib import Path

API_BASE_DEFAULT = "https://bulbringai.com"
TOKEN_PATH       = Path.home() / ".mnp_bankwriteup" / "token.json"


def api_base() -> str:
    return os.environ.get("MNP_API_BASE", API_BASE_DEFAULT).rstrip("/")


# ── Token persistence ────────────────────────────────────────────────────────

def get_token() -> str | None:
    if not TOKEN_PATH.exists():
        return None
    try:
        return json.loads(TOKEN_PATH.read_text()).get("token")
    except Exception:
        return None


def save_token(token: str):
    TOKEN_PATH.parent.mkdir(exist_ok=True)
    TOKEN_PATH.write_text(json.dumps({"token": token}))


def clear_token():
    try:
        TOKEN_PATH.unlink()
    except FileNotFoundError:
        pass


# ── Auth ─────────────────────────────────────────────────────────────────────

class AuthError(Exception):
    pass


class ApiError(Exception):
    pass


def sign_in_with_pin(pin: str) -> str:
    """POST /api/auth/pin. Returns JWT on success, raises AuthError on failure."""
    body = json.dumps({"code": pin}).encode("utf-8")
    req = urllib.request.Request(
        f"{api_base()}/api/auth/pin",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode("utf-8")).get("error", "Sign-in failed")
        except Exception:
            err = f"HTTP {e.code}"
        raise AuthError(err)
    except urllib.error.URLError as e:
        raise AuthError(f"Could not reach {api_base()} — {e.reason}")

    token = data.get("token")
    if not token:
        raise AuthError("No token returned from server")
    save_token(token)
    return token


# ── PDF processing ───────────────────────────────────────────────────────────

def _build_multipart(pdf_paths: list[str], extra_fields: dict | None = None) -> tuple[bytes, str]:
    """Hand-roll a multipart/form-data body — no third-party deps."""
    boundary = f"----mnp{uuid.uuid4().hex}"
    crlf     = b"\r\n"
    parts: list[bytes] = []

    for field, value in (extra_fields or {}).items():
        parts.append(f"--{boundary}".encode())
        parts.append(f'Content-Disposition: form-data; name="{field}"'.encode())
        parts.append(b"")
        parts.append(str(value).encode("utf-8"))

    for path in pdf_paths:
        name = Path(path).name
        data = Path(path).read_bytes()
        parts.append(f"--{boundary}".encode())
        parts.append(
            f'Content-Disposition: form-data; name="statements"; filename="{name}"'.encode()
        )
        parts.append(b"Content-Type: application/pdf")
        parts.append(b"")
        parts.append(data)

    parts.append(f"--{boundary}--".encode())
    parts.append(b"")

    body = crlf.join(parts)
    return body, boundary


def process_statements(
    pdf_paths: list[str],
    token: str,
    output_type: str = "default",
    timeout: int = 180,
) -> tuple[bytes, dict]:
    """
    POST PDFs to /api/agent/process. Returns (xlsx_bytes, meta) where meta is
    a dict of {transaction_count, statement_count, period_start, period_end}.

    Raises AuthError on 401, ApiError on anything else.
    """
    body, boundary = _build_multipart(
        pdf_paths,
        extra_fields={"outputType": "tb_import" if output_type == "tb_import" else ""},
    )

    req = urllib.request.Request(
        f"{api_base()}/api/agent/process",
        data=body,
        headers={
            "Content-Type":  f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            xlsx = resp.read()
            headers = resp.headers
            meta = {
                "transaction_count": int(headers.get("X-Transaction-Count", 0) or 0),
                "statement_count":   int(headers.get("X-Statement-Count", len(pdf_paths)) or len(pdf_paths)),
                "period_start":      headers.get("X-Period-Start", ""),
                "period_end":        headers.get("X-Period-End", ""),
            }
            return xlsx, meta
    except urllib.error.HTTPError as e:
        if e.code == 401:
            clear_token()
            raise AuthError("Session expired — sign in again with your PIN.")
        try:
            err = json.loads(e.read().decode("utf-8")).get("error", f"HTTP {e.code}")
        except Exception:
            err = f"HTTP {e.code}"
        raise ApiError(err)
    except urllib.error.URLError as e:
        raise ApiError(f"Could not reach {api_base()} — {e.reason}")
