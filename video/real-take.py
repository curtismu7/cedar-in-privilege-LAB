#!/usr/bin/env python3
"""A short SAMPLE take of the owner-gated Real mode: switch Mode to Real, open the Real run panel, run the probe, hold on the verdicts."""
import json, os, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

WORK = Path(sys.argv[1]).resolve()
APP = os.environ.get("APP_URL", "http://127.0.0.1:7820")
result = {"ok": True, "app": APP}
def log(*a):
    (WORK / "take.log").open("a").write(" ".join(map(str, a)) + "\n")

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080},
        record_video_dir=str(WORK / "pw-video"), record_video_size={"width": 1920, "height": 1080})
    ctx.add_init_script("window.__pillText = " + json.dumps("SAMPLE: simulated runs, not a live tenant") + ";")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: (errors.append(str(e)), log("PAGEERROR:", e)))
    page.goto(APP + "/")
    page.wait_for_selector("[data-testid=mode-select]")
    page.select_option("[data-testid=mode-select]", "real")
    page.wait_for_selector("[data-testid=real-run]", timeout=15000)
    page.wait_for_timeout(7000)  # hold on the REAL mode hint + panel intro
    page.click("[data-testid=real-run-btn]")
    page.wait_for_selector("[data-testid=real-result]", timeout=60000)
    page.wait_for_timeout(12000)  # hold on the verdict table
    # open the token details too
    page.click(".real-token summary")
    page.wait_for_timeout(6000)
    result["page_errors"] = errors
    if errors: result["ok"] = False
    v = page.video.path(); ctx.close()
    out = WORK / "take-real.webm"; shutil.move(str(v), out)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(out),
        "-vf", "scale=1920:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-an", str(WORK / "real.mp4")], check=True)
    out.unlink(); result["video"] = str(WORK / "real.mp4")
    browser.close()
(WORK / "result.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
sys.exit(0 if result["ok"] else 1)
