"""
app.py — SmartHarvest Flask application entry point.

Serves BOTH:
  • The static frontend (HTML/CSS/JS) from ../frontend/
  • The REST API (/api/*, /auth/*)

This means a single Render deployment hosts the entire application.
"""

import os
from pathlib import Path

from flask import Flask, jsonify, send_from_directory, send_file
from flask_login import LoginManager
from flask_cors import CORS

from config import Config
from database import get_db, init_db, close_db
from models import User

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
BACKEND_DIR  = Path(__file__).parent.resolve()
FRONTEND_DIR = (BACKEND_DIR.parent / "frontend").resolve()


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app(config_class=Config) -> Flask:
    app = Flask(
        __name__,
        static_folder=str(FRONTEND_DIR),   # serve /css, /js, etc. from frontend/
        static_url_path="",
    )

    # ── Config ────────────────────────────────────────────────────────────────
    app.config["SECRET_KEY"]              = config_class.SECRET_KEY
    app.config["DATABASE_URI"]            = config_class.DATABASE_PATH
    app.config["SESSION_COOKIE_HTTPONLY"] = config_class.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = config_class.SESSION_COOKIE_SAMESITE
    app.config["DEMO_MODE"]               = config_class.DEMO_MODE
    app.config["SENSOR_POLL_INTERVAL"]    = config_class.SENSOR_POLL_INTERVAL
    app.config["DEVICE_AUTH_TOKEN"]       = config_class.DEVICE_AUTH_TOKEN
    app.config["THRESHOLDS"]              = (
        config_class.CROP_THRESHOLDS
        if hasattr(config_class, "CROP_THRESHOLDS")
        else {}
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    # When frontend and backend are on the same domain (single Render deploy)
    # CORS is not needed at all — but we keep it for local dev and split-deploy.
    _raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
    _origins = (
        [o.strip() for o in _raw_origins.split(",")]
        if _raw_origins != "*"
        else "*"
    )
    CORS(
        app,
        resources={
            r"/api/*":  {"origins": _origins},
            r"/auth/*": {"origins": _origins},
            r"/health": {"origins": _origins},
        },
        supports_credentials=True,
    )

    # ── Flask-Login ───────────────────────────────────────────────────────────
    login_manager = LoginManager(app)
    login_manager.login_view = "auth.login"  # type: ignore[assignment]

    @login_manager.user_loader
    def load_user(user_id: str):
        return User.get_by_id(user_id)

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Authentication required."}), 401

    # ── Database lifecycle ────────────────────────────────────────────────────
    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()

    # ── Blueprints ────────────────────────────────────────────────────────────
    from auth import auth_bp
    from bookings import bookings_bp
    from slots import slots_bp
    from sensors import sensors_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(bookings_bp)
    app.register_blueprint(slots_bp)
    app.register_blueprint(sensors_bp)

    # ── Frontend page routes ──────────────────────────────────────────────────
    # These let Flask serve the HTML pages directly — no separate Vercel needed.
    # Works both locally and on Render.

    @app.route("/")
    def index():
        return send_file(FRONTEND_DIR / "index.html")

    @app.route("/booking")
    @app.route("/booking.html")
    def booking():
        return send_file(FRONTEND_DIR / "booking.html")

    @app.route("/dashboard")
    @app.route("/dashboard.html")
    def dashboard():
        return send_file(FRONTEND_DIR / "dashboard.html")

    # Serve any other static file (CSS, JS, images, _redirects, etc.)
    @app.route("/<path:filename>")
    def static_files(filename):
        # Don't intercept API or auth routes
        if filename.startswith(("api/", "auth/", "health")):
            return jsonify({"error": "Not found."}), 404
        try:
            return send_from_directory(str(FRONTEND_DIR), filename)
        except Exception:
            # SPA fallback — send index.html for unknown paths
            return send_file(FRONTEND_DIR / "index.html")

    # ── Error handlers ────────────────────────────────────────────────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request.", "detail": str(e)}), 400

    @app.errorhandler(401)
    def unauthorized_error(e):
        return jsonify({"error": "Authentication required."}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "You do not have permission."}), 403

    @app.errorhandler(404)
    def not_found(e):
        # For HTML requests return index.html; for API requests return JSON
        from flask import request
        if request.path.startswith(("/api/", "/auth/")):
            return jsonify({"error": "Not found."}), 404
        try:
            return send_file(FRONTEND_DIR / "index.html"), 200
        except Exception:
            return jsonify({"error": "Not found."}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error."}), 500

    # ── Health-check ──────────────────────────────────────────────────────────
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status":    "ok",
            "service":   "SmartHarvest API",
            "demo_mode": app.config["DEMO_MODE"],
            "frontend":  str(FRONTEND_DIR),
        })

    return app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

app = create_app()

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    print(f"SmartHarvest running at http://localhost:{port}")
    print(f"Serving frontend from: {FRONTEND_DIR}")
    app.run(host="0.0.0.0", port=port, debug=debug)
