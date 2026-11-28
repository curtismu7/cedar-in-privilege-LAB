#!/usr/bin/env python3
"""The cedar-in-privilege-LAB take: a SAMPLE video of the lab's LIVE Story walk (headless, recorded by Playwright, labelled SAMPLE).

This lab is Mock-only (no Real mode, nothing live), so there is one cut and the take is a SAMPLE by definition. The take records the genuine
live Story: it turns Story on and then drives it the way a viewer would — Next for each slide and bubble, and for a run-done step the page's
own scenario button (an untrusted click, exactly like Play for me) followed by Next once the run's result is on the page. The engine draws
everything (the same bubbles, slides and hold formulas the live page uses), so the video cannot drift from the demo. The wording is checked
against this checkout's video/captions.md by the lab's sourceSha256 before recording.

Usage: python3 take.py <work_dir>       (work_dir gets result.json, take.log and film.mp4)
Env:   APP_URL (default http://127.0.0.1:7820) · PROFILE=monitor|laptop · REHEARSE=1 (fast dry run, no recording)
       REHEARSE_SHOTS=<dir> (with REHEARSE=1: one still per step, to read before a real take)
"""
import json, os, shutil, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import captions

WORK = Path(sys.argv[1] if len(sys.argv) > 1 else "take-work").resolve()
PROFILE = os.environ.get("PROFILE", "monitor")
PROFILES = {"monitor": dict(width=1920, height=1080), "laptop": dict(width=1800, height=1169)}
_prof = PROFILES[PROFILE]
REHEARSE = os.environ.get("REHEARSE") == "1"
APP = os.environ.get("APP_URL", "http://127.0.0.1:7820")
SHOTS = Path(os.environ["REHEARSE_SHOTS"]) if os.environ.get("REHEARSE_SHOTS") else None
# The walk: (key, kind, press). Mirrors web/src/storyScript.js; test/story.test.js checks the order. `press` is what happens at the END of that step's hold, exactly
# as Play for me does it: the engine presses the button its step names (the step's `prompt.press`), the NEXT step waits for that run to finish and then shows
# the bubble that describes the result.
#   "scenario:<id>"   the page's own case button
#   "ask-send"        the Send button; the suggested prompt is TYPED into the box first, key by key, so the film shows a person typing
#   "ask-approve-btn" the approver's button
WALK = [
    ("opening", "slide", None),
    ("hold_intro", "bubble", "scenario:hold-1-held"), ("hold_run_held", "bubble", "scenario:hold-2-approve"), ("hold_run_approved", "bubble", None),
    ("scope_intro", "bubble", "scenario:scope-1-without"), ("scope_run_without", "bubble", "scenario:scope-2-with"), ("scope_run_with", "bubble", None),
    ("actsub_intro", "bubble", "scenario:actsub-2-gate"), ("actsub_run_gate", "bubble", "scenario:actsub-3-candidate"), ("candidate", "bubble", "scenario:actsub-1-baseline"),
    ("actsub_baseline", "bubble", "scenario:hold-2-approve"),
    ("ask_intro", "bubble", "ask-send"), ("ask_run_held", "bubble", "ask-approve-btn"), ("ask_run_approved", "bubble", None), ("ask_calls", "bubble", None),
    ("claims_intro", "bubble", "scenario:claims-1-without"),
    ("claims_run_without", "bubble", "scenario:claims-2-with"),
    ("claims_run_with", "bubble", "scenario:claims-3-forged"),
    ("claims_run_forged", "bubble", None),
    ("user_intro", "bubble", "scenario:user-1-other"),
    ("user_run_other", "bubble", "scenario:user-2-right"),
    ("user_run_right", "bubble", None),
    ("group_intro", "bubble", "scenario:group-1-wrong"),
    ("group_run_wrong", "bubble", "scenario:group-3-lookalike"),
    ("group_run_lookalike", "bubble", None),
    ("block_intro", "bubble", "scenario:block-1-blocked"),
    ("block_run_blocked", "bubble", "scenario:block-2-other"),
    ("block_run_other", "bubble", None),
    ("layered_intro", "bubble", "scenario:layered-1-scope"),
    ("layered_run_scope", "bubble", "scenario:layered-4-all"),
    ("layered_run_all", "bubble", None),
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
    t_page = time.time()      # the recording starts here; the opening slide shows a few seconds later (rule 29: the first frame must be the title)
    errors = []
    page.on("console", lambda m: log("CONSOLE", m.type, m.text) if m.type in ("warning", "error") else None)   # the engine says why a step stalled here
    page.on("pageerror", lambda e: (errors.append(str(e)), log("PAGEERROR:", e)))
    captions.load(APP, Path(__file__).resolve().parent.parent / "video" / "captions.md")   # wording freshness gate
    page.goto(APP + "/")
    # While a person "types" and presses a button the Story bubble steps aside, so the film shows the hands, then the bubble comes back with the result.
    page.add_style_tag(content="html.take-quiet .story-bub, html.take-quiet .story-hl, html.take-quiet .story-tail { visibility: hidden !important; }")
    page.wait_for_selector("[data-testid=story-toggle-story]")
    page.click("[data-testid=story-toggle-story]")
    page.wait_for_selector("[data-testid=story-bar]")
    page.wait_for_selector(".story-slide", state="visible")
    lead_in = max(0.0, time.time() - t_page - 0.3)   # trimmed off the front of the film below
    page.wait_for_timeout(2000)
    log("sample recording started" if not REHEARSE else "rehearsal started")

    HOLD_BUBBLE_S = 7.5    # a numbered bubble's on-screen hold (words*0.30+2.2 would be ~5 s; the film holds longer so a viewer can read at ease)
    HOLD_SLIDE_S = 9.0
    HOLD_RUN_S = 9.0       # after a run finishes: hold the result (or the diagram animation) before the next bubble covers it
    def settle(ms=900):
        page.wait_for_timeout(int(ms * (0.04 if REHEARSE else 1)))

    try:
        for key, kind, press in WALK:
            if key == "ask_intro":   # the case button is above the prompt box: bring the box to the middle of the screen
                page.evaluate("document.querySelector('[data-testid=ask-prompt]').scrollIntoView({block: 'center'})")
                settle(1200)
            if key == "ask_calls":    # the panel the bubble points at, at the top of the screen
                page.evaluate("document.querySelector('[data-testid=ask-calls]').scrollIntoView({block: 'start'})")
                settle(1200)
            settle((HOLD_SLIDE_S if kind == "slide" else HOLD_BUBBLE_S) * 1000)   # hold the engine-drawn step on screen for the video
            log(f"{key}: bar={page.get_attribute('[data-testid=story-bar]', 'data-status')} msg={page.inner_text('[data-testid=story-msg]')!r}")
            if SHOTS and REHEARSE:
                SHOTS.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(SHOTS / f"{key}.png"))
            if press:   # what Play for me does when the hold ends: press the button the step names, then the next step waits for the run
                if press.startswith("scenario:"):
                    btn = page.locator(f"[data-testid=scenario-{press.split(':', 1)[1]}]")
                    btn.scroll_into_view_if_needed()
                    btn.click()
                    page.wait_for_selector("[data-testid=run-status]:not(:has-text('Running the walk'))", timeout=30000)
                else:
                    page.evaluate("document.documentElement.classList.add('take-quiet')")   # the bubble steps aside while the hands work
                    if press == "ask-send":
                        box = page.locator("[data-testid=ask-prompt]")
                        box.scroll_into_view_if_needed()
                        text = box.input_value()          # the case's suggested prompt, typed again by "hand" so the film shows the typing
                        box.fill("")
                        box.click()
                        page.keyboard.type(text, delay=0 if REHEARSE else 45)
                        settle(900)
                        page.click("[data-testid=ask-send]")
                        page.wait_for_selector("[data-testid=ask-answer]", timeout=30000)
                    else:
                        page.click("[data-testid=ask-approve-btn]")
                        page.wait_for_selector("[data-testid=ask-approve]", state="detached", timeout=30000)
                    page.evaluate("document.documentElement.classList.remove('take-quiet')")
                settle(1200)
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
        try: page.screenshot(path=str(WORK / "failure.png"))   # what the page looked like when the take stopped
        except Exception: pass
    finally:
        if not REHEARSE:
            v = page.video.path(); ctx.close()
            out = WORK / "take-sample.webm"
            shutil.move(str(v), out)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{lead_in:.2f}", "-i", str(out),
                            "-vf", f"scale={_prof['width']}:-2", "-c:v", "libx264", "-preset", "veryfast",
                            "-crf", "20", "-pix_fmt", "yuv420p", "-an", str(WORK / "film.mp4")], check=True)
            out.unlink()
            result["video"] = str(WORK / "film.mp4")
            result["lead_in_trimmed_s"] = round(lead_in, 2)
        browser.close()

(WORK / "result.json").write_text(json.dumps(result, indent=2) + "\n")
log("done:", json.dumps(result))
print(json.dumps(result, indent=2))
sys.exit(0 if result["ok"] else 1)
