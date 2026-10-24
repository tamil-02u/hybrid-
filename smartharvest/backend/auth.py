"""
auth.py — Authentication blueprint for SmartHarvest.
Prefix: /auth
"""

import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

from database import get_db
from models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

# ---------------------------------------------------------------------------
# In-memory password-reset token store  {token: {user_id, expires_at}}
# In production this should be persisted (e.g. a db table).
# ---------------------------------------------------------------------------
_reset_tokens: Dict[str, dict] = {}
_TOKEN_TTL_SECONDS = 3600  # 1 hour


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_ok(data: dict, status: int = 200):
    return jsonify({"success": True, "data": data}), status


def _json_err(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _validate_email(email: str) -> bool:
    return "@" in email and "." in email.split("@")[-1]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a new user account."""
    body = request.get_json(silent=True) or {}

    name             = (body.get("name") or "").strip()
    phone            = (body.get("phone") or "").strip()
    email            = (body.get("email") or "").strip().lower()
    password         = body.get("password") or ""
    confirm_password = body.get("confirm_password") or ""

    # ── Validation ────────────────────────────────────────────────────────────
    if not name:
        return _json_err("Name is required.")
    if not email or not _validate_email(email):
        return _json_err("A valid email address is required.")
    if not password:
        return _json_err("Password is required.")
    if len(password) < 6:
        return _json_err("Password must be at least 6 characters.")
    if password != confirm_password:
        return _json_err("Passwords do not match.")

    db = get_db()

    # ── Check duplicate email ────────────────────────────────────────────────
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        return _json_err("An account with this email already exists.", 409)

    # ── Insert ────────────────────────────────────────────────────────────────
    pw_hash = generate_password_hash(password)
    cursor = db.execute(
        "INSERT INTO users (name, phone, email, password_hash) VALUES (?, ?, ?, ?)",
        (name, phone, email, pw_hash),
    )
    db.commit()

    user = User.get_by_id(cursor.lastrowid)
    login_user(user)

    return _json_ok({"user": user.to_dict(), "message": "Account created successfully."}, 201)


@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate user and create a session."""
    body = request.get_json(silent=True) or {}

    email    = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    remember = bool(body.get("remember", False))

    if not email or not password:
        return _json_err("Email and password are required.")

    user = User.get_by_email(email)
    if user is None or not check_password_hash(user.password_hash, password):
        return _json_err("Invalid email or password.", 401)

    login_user(user, remember=remember)
    return _json_ok({"user": user.to_dict(), "message": "Logged in successfully."})


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    """End the current user session."""
    logout_user()
    return _json_ok({"message": "Logged out successfully."})


@auth_bp.route("/me", methods=["GET"])
def me():
    """Return the currently authenticated user, or 401."""
    if not current_user.is_authenticated:
        return _json_err("Not authenticated.", 401)
    return _json_ok({"user": current_user.to_dict()})


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    Issue a password-reset token.
    In demo mode the token is returned directly in the response so the
    front-end (or Postman) can use it without needing an email service.
    """
    body  = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    if not email:
        return _json_err("Email is required.")

    user = User.get_by_email(email)
    if user is None:
        # Don't reveal whether the email exists.
        return _json_ok({
            "message": "If that email is registered you will receive a reset link."
        })

    token = secrets.token_urlsafe(32)
    _reset_tokens[token] = {
        "user_id":    user.id,
        "expires_at": time.time() + _TOKEN_TTL_SECONDS,
    }

    response_data: dict = {
        "message": "Password reset token generated.",
    }
    # In demo mode expose the token so it can be used without a mail server.
    if current_app.config.get("DEMO_MODE", True):
        response_data["reset_token"] = token
        response_data["note"] = "DEMO MODE: token returned in response. Do not do this in production."

    return _json_ok(response_data)


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """Validate a reset token and update the user's password."""
    body             = request.get_json(silent=True) or {}
    token            = (body.get("token") or "").strip()
    new_password     = body.get("new_password") or ""
    confirm_password = body.get("confirm_password") or ""

    if not token:
        return _json_err("Reset token is required.")
    if not new_password:
        return _json_err("New password is required.")
    if len(new_password) < 6:
        return _json_err("Password must be at least 6 characters.")
    if new_password != confirm_password:
        return _json_err("Passwords do not match.")

    token_data = _reset_tokens.get(token)
    if token_data is None:
        return _json_err("Invalid or expired reset token.", 400)
    if time.time() > token_data["expires_at"]:
        _reset_tokens.pop(token, None)
        return _json_err("Reset token has expired.", 400)

    db = get_db()
    pw_hash = generate_password_hash(new_password)
    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (pw_hash, token_data["user_id"]),
    )
    db.commit()

    # Consume the token so it cannot be reused.
    _reset_tokens.pop(token, None)

    return _json_ok({"message": "Password updated successfully."})
