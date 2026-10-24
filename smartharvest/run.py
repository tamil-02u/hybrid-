#!/usr/bin/env python3
"""
SmartHarvest – Launcher Script
Run this from the project root: python run.py  (or: py run.py)
"""
import subprocess
import sys
import os
import shutil


def find_python():
    """Return a working python executable path."""
    # Try common names in order
    for cmd in [sys.executable, "python", "python3", "py"]:
        try:
            r = subprocess.run([cmd, "--version"], capture_output=True, timeout=3)
            if r.returncode == 0:
                return cmd
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return sys.executable  # fallback to whatever launched this script


def main():
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")

    print("=" * 56)
    print("  🌾  SmartHarvest – IoT Smart Storage System")
    print("=" * 56)
    print()

    # Copy .env.example → .env if missing
    env_path     = os.path.join(backend_dir, ".env")
    env_example  = os.path.join(backend_dir, ".env.example")
    if not os.path.exists(env_path) and os.path.exists(env_example):
        shutil.copy(env_example, env_path)
        print("✅  Created backend/.env from .env.example")

    python = find_python()
    print(f"🐍  Python  : {python}")
    print(f"📁  Backend : {backend_dir}")
    print()
    print("📡  API     : http://localhost:5000")
    print("🌐  Frontend: Open  frontend/index.html  in your browser")
    print("🔬  Demo    : Simulated sensor data is ON by default")
    print()
    print("  After the server starts, visit:")
    print("  ➜  http://localhost:5000/api/sensors/demo/start")
    print("     …to activate the live demo sensor feed.")
    print()
    print("-" * 56)
    print("  Press  Ctrl+C  to stop the server.")
    print("-" * 56)
    print()

    os.chdir(backend_dir)
    subprocess.run([python, "app.py"])


if __name__ == "__main__":
    main()
