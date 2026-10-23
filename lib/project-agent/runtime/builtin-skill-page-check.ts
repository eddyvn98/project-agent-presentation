import type { BuiltinSkill } from "./builtin-skills";

export const PAGE_CHECK_SKILL: BuiltinSkill = {
	name: "page-check",
	description: "Open a web page or app you built (an .html file or a local server) in the sandbox's headless Chromium: console errors, failed requests, overflow, screenshots at desktop and phone size, click-through.",
	body: `PAGE CHECK: the sandbox has a headless Chromium. Use it whenever you built or changed a web page, dashboard, presentation or small app and must prove it works, instead of reading the code and guessing. The preview in the app cannot be opened from here, but this can.
RUN (one command, about 10 seconds):
  python3 /work/.tools/page_check.py outputs/<page>.html
  python3 /work/.tools/page_check.py http://127.0.0.1:8000/ --viewport mobile
A file path is served from its own folder, so relative scripts, styles and images load. For an app that needs a server, start it in the background first (nohup python3 -m http.server 8000 --directory outputs > /work/server.log 2>&1 &), then give the URL. Public https pages also work.
READ THE JSON: "ok" is false when there is any console error or warning, uncaught page error, failed request, HTTP 4xx or 5xx, horizontal scroll, broken image or an empty page. Fix every item (a missing CDN file or a typo in an id is the usual cause), run it again, and only say it works when "ok" is true or you can explain each remaining item.
LOOK AT IT: the screenshots are saved under /work/outputs/work/page-check (desktop-load.png and mobile-load.png). Send {"action":"render","path":"outputs/work/page-check/mobile-load.png"} and judge the picture: overlapping text, clipped content, unreadable contrast, empty areas. Judge both sizes.
INTERACT: repeat --step to click through it in order and screenshot the result:
  python3 /work/.tools/page_check.py outputs/deck.web.html --step "press:ArrowRight" --step "shot:scene2" --step "click:#menu-button" --step "shot:menu-open" --step "text:h1"
Steps: click:SELECTOR, press:KEY, type:SELECTOR=TEXT, wait:SECONDS, shot:NAME, text:SELECTOR (prints the element text). A step that fails is reported in "notes" instead of stopping. Add --wait-text "Loaded" for a page that renders late, --full-page for the whole scroll height, --viewport desktop|mobile to check one size.
LIMITS: never type passwords or payment data into a page; do not use it to browse sites for facts (use web_fetch and web_search). Screenshots and logs stay in the sandbox; list in the final action only files the user should receive.`,
};
