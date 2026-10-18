"""Рисует server/static/video-placeholder.svg — единственную заглушку видео. Запуск: python3 server/tools/make_placeholder.py"""
import os

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="Видео готовится">
  <rect width="1280" height="720" fill="#e8eef2"/>
  <circle cx="640" cy="300" r="90" fill="#9db4c0"/>
  <path d="M615 250 L615 350 L700 300 Z" fill="#f6f9fb"/>
  <text x="640" y="470" text-anchor="middle" font-family="system-ui, sans-serif" font-size="48" fill="#4a6572">Видео готовится</text>
</svg>
"""

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "video-placeholder.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(SVG)
    print(os.path.abspath(out))
