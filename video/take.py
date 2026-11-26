#!/usr/bin/env python3
"""The cedar-in-privilege-LAB take: a SAMPLE video of the lab's LIVE Story walk (headless, recorded by Playwright, labelled SAMPLE).

This lab is Mock-only (no Real mode, nothing live), so there is one cut and the take is a SAMPLE by definition. The take records the genuine
live Story: it turns Story on and then drives it the way a viewer would — Next for each slide and bubble, and for a run-done step the page's
own scenario button (an untrusted click, exactly like Play for me) followed by Next once the run's result is on the page. The engine draws
everything (the same bubbles, slides and hold formulas the live page uses), so the video cannot drift from the demo. The wording is checked
against this checkout's video/captions.md by the lab's sourceSha256 before recording.

Usage: python3 take.py <work_dir>       (work_dir gets result.json, take.log and film.mp4)
Env:   APP_URL (default http://127.0.0.1:7820) · PROFILE=monitor|laptop · REHEARSE=1 (fast dry run, no recording)
"""
import json, os, shutil, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
import captions

WORK = Path(sys.argv[1] if len(sys.argv) > 1 else "take-work").resolve()
PROFILE = os.environ.get("PROFILE", "monitor")
PROFILES = {"monitor": dict(width=1920, height=1080), "laptop": dict(width=1800, height=1169)}
_prof = PROFILES[PROFILE]
REHEARSE = os.environ.get("REHEARSE") == "1"
APP = os.environ.get("APP_URL", "http://127.0.0.1:7820")
# The walk: (key, kind, scenario-to-click-or-None). Mirrors web/src/storyScript.js; test/story.test.js checks the order.
WALK = [
    ("opening", "slide", None),
    ("banner", "bubble", None),
    ("hold_intro", "bubble", None), ("hold_run_held", "run", "hold-1-held"), ("hold_run_approved", "run", "hold-2-approve"),
    ("scope_intro", "bubble", None), ("scope_run_without", "run", "scope-1-without"), ("scope_run_with", "run", "scope-2-with"),
    ("actsub_intro", "bubble", None), ("actsub_run_gate", "run", "actsub-2-gate"), ("candidate", "run", "actsub-3-candidate"),
    ("actsub_baseline", "run", "actsub-1-baseline"),
    ("setup_guide", "bubble", None), ("is_is_not", "bubble", None), ("measured", "bubble", None),
    ("closing", "slide", None),
]

result = {"ok": True, "profile": PROFILE, "app": APP}

def log(*a):
    WORK.mkdir(parents=True, exist_ok=True)
    with (WORK / "take.log").open("a") as f:
        print(*a, flush=True, file=f)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": _prof["width"], "height": _prof["height"]},
                              **({"record_video_dir": str(WORK / "pw-video"), "record_video_size": {"width": _prof["width"], "height": _prof["height"]}} if not REHEARSE else {}))
    ctx.add_init_script("window.__pillText = " + json.dumps("SAMPLE: simulated runs, not a live tenant") + ";")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: (errors.append(str(e)), log("PAGEERROR:", e)))
    captions.load(APP, Path(__file__).resolve().parent.parent / "video" / "captions.md")   # wording freshness gate
    page.goto(APP + "/")
    page.wait_for_selector("[data-testid=story-toggle-story]")
    page.click("[data-testid=story-toggle-story]")
    page.wait_for_selector("[data-testid=story-bar]")
    page.wait_for_timeout(2000)
    log("sample recording started" if not REHEARSE else "rehearsal started")

    HOLD_BUBBLE_S = 7.5    # a numbered bubble's on-screen hold (words*0.30+2.2 would be ~5 s; the film holds longer so a viewer can read at ease)
    HOLD_SLIDE_S = 9.0
    HOLD_RUN_S = 9.0       # after a run finishes: hold the result (or the diagram animation) before the next bubble covers it
    def settle(ms=900):
        page.wait_for_timeout(int(ms * (0.04 if REHEARSE else 1)))

    try:
        for key, kind, scen in WALK:
            if kind == "run":
                btn = page.locator(f"[data-testid=scenario-{scen}]")
                btn.scroll_into_view_if_needed()
                btn.click()
                # The engine itself waits for the run; the bar leaves 'waiting'. Wait for the result, then the engine settles.
                page.wait_for_selector("[data-testid=run-status]:not(:has-text('Running the walk'))", timeout=30000)
                settle(HOLD_RUN_S * 1000)   # let the run's result (and the diagram animation) play out on screen before the next bubble
            settle((HOLD_SLIDE_S if kind == "slide" else HOLD_BUBBLE_S) * 1000)   # hold the engine-drawn step on screen for the video
            page.click("[data-testid=story-next]")
            settle(900)
            status = page.get_attribute("[data-testid=story-bar]", "data-status")
            if status == "error":
                raise RuntimeError(f"the story hit an error at {key}")
        # reached the end: the bar says done
        status = page.get_attribute("[data-testid=story-bar]", "data-status")
        result["end_status"] = status
        if status != "done":
            result["ok"] = False; log("the story did not reach done:", status)
        result["page_errors"] = errors
        if errors: result["ok"] = False
    except Exception as e:
        result["ok"] = False; result["error"] = str(e); log("TAKE FAILED:", e)
    finally:
        if not REHEARSE:
            v = page.video.path(); ctx.close()
            out = WORK / "take-sample.webm"
            shutil.move(str(v), out)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(out),
                            "-vf", f"scale={_prof['width']}:-2", "-c:v", "libx264", "-preset", "veryfast",
                            "-crf", "20", "-pix_fmt", "yuv420p", "-an", str(WORK / "film.mp4")], check=True)
            out.unlink()
            result["video"] = str(WORK / "film.mp4")
        browser.close()

(WORK / "result.json").write_text(json.dumps(result, indent=2) + "\n")
log("done:", json.dumps(result))
print(json.dumps(result, indent=2))
sys.exit(0 if result["ok"] else 1)
