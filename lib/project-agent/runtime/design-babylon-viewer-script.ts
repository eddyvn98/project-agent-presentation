/** Babylon.js viewer embedded in the generated HTML; GLB data stays inline and the iframe keeps its opaque origin. */
export const DESIGN_BABYLON_VIEWER_SCRIPT = String.raw`def make_viewer(glb):
    data = base64.b64encode(glb).decode("ascii")
    title = html.escape(spec["title"], quote=True)
    return """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>""" + title + """ - BIM concept</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;font:14px system-ui,sans-serif;color:#e2e8f0;background:#0f172a}
body{display:flex;flex-direction:column}header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;background:#152238}
h1{font-size:15px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}header small{color:#94a3b8;font-size:11px}
main{position:relative;flex:1;min-height:0}canvas{display:block;width:100%;height:100%;touch-action:none;outline:0}
.controls{position:absolute;top:12px;left:12px;display:flex;flex-wrap:wrap;gap:6px;max-width:calc(100% - 24px)}
button{min-height:44px;padding:0 13px;border:1px solid #64748b;border-radius:9px;background:#152238e8;color:#f8fafc;font-weight:600;cursor:pointer}
button[aria-pressed=true]{background:#0369a1;border-color:#7dd3fc}button:focus-visible{outline:3px solid #fbbf24;outline-offset:2px}
#detail,#status{position:absolute;left:12px;right:12px;max-width:480px;background:#152238e8;padding:9px 12px;border-radius:9px;font-size:12px}
#detail{bottom:52px}#status{bottom:8px;color:#cbd5e1}#status[data-error=true]{color:#fecaca}
@media(max-width:420px){header small{display:none}h1{font-size:13px}.controls{top:8px;left:8px;gap:4px}button{padding:0 10px;font-size:12px}#detail,#status{left:8px;right:8px}}
</style></head><body>
<header><h1>""" + title + """</h1><small>Concept model · verify dimensions before construction</small></header>
<main><canvas id="scene" tabindex="0" aria-label="Interactive 3D building model"></canvas>
<nav class="controls" aria-label="Model viewer controls">
<button type="button" id="view-3d" aria-pressed="true">3D</button>
<button type="button" id="view-2d" aria-pressed="false">Plan 2D</button>
<button type="button" id="fit">Fit</button>
<button type="button" id="walls" aria-pressed="true">Walls</button>
</nav>
<div id="detail">Tap an element to inspect it. Drag to orbit; pinch or scroll to zoom.</div>
<div id="status" role="status" aria-live="polite">Loading Babylon.js preview...</div></main>
<script src="https://cdn.jsdelivr.net/npm/babylonjs@9.28.0/babylon.js"></script>
<script src="https://cdn.jsdelivr.net/npm/babylonjs-loaders@9.28.0/babylonjs.loaders.min.js"></script>
<script>
(function () {
  "use strict";
  const canvas = document.getElementById("scene");
  const status = document.getElementById("status");
  const detail = document.getElementById("detail");
  const threeD = document.getElementById("view-3d");
  const twoD = document.getElementById("view-2d");
  const wallsButton = document.getElementById("walls");
  const message = (text, error) => { status.textContent = text; status.dataset.error = error ? "true" : "false"; };
  if (!window.BABYLON || !BABYLON.SceneLoader) {
    message("3D preview unavailable: viewer library could not load. Use the PDF or GLB download.", true);
    return;
  }
  let engine;
  try {
    engine = new BABYLON.Engine(canvas, true, {stencil:false, preserveDrawingBuffer:false, powerPreference:"low-power"});
  } catch (_) {
    message("WebGL unavailable on this device. Use the PDF or GLB download.", true);
    return;
  }
  engine.setHardwareScalingLevel(Math.max(1, Math.min(window.devicePixelRatio || 1, 2)));
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.95, 0.97, 0.99, 1);
  const camera = new BABYLON.ArcRotateCamera("orbit", -Math.PI/4, Math.PI/3, 10, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.minZ = 0.01;
  camera.maxZ = 500;
  camera.lowerRadiusLimit = 0.2;
  camera.upperRadiusLimit = 200;
  camera.panningSensibility = 180;
  camera.wheelPrecision = 40;
  camera.pinchPrecision = 40;
  camera.inertia = 0.75;
  new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.65;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-1, -2, -1), scene);
  sun.intensity = 1.15;
  let modelBounds = null, mode = "3d", wallsVisible = true;
  function setOrtho() {
    if (!modelBounds) return;
    const dims = modelBounds.max.subtract(modelBounds.min);
    const aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1);
    const half = Math.max(dims.z * 0.65, dims.x * 0.65 / aspect, 1);
    camera.orthoTop = half; camera.orthoBottom = -half;
    camera.orthoLeft = -half * aspect; camera.orthoRight = half * aspect;
  }
  function fit() {
    if (!modelBounds) return;
    const size = modelBounds.max.subtract(modelBounds.min);
    const longest = Math.max(size.x, size.y, size.z, 1);
    camera.setTarget(BABYLON.Vector3.Center(modelBounds.min, modelBounds.max));
    camera.radius = longest * (mode === "2d" ? 2 : 1.8);
    if (mode === "2d") setOrtho();
  }
  function view(next) {
    mode = next;
    camera.mode = next === "2d" ? BABYLON.Camera.ORTHOGRAPHIC_CAMERA : BABYLON.Camera.PERSPECTIVE_CAMERA;
    camera.alpha = next === "2d" ? -Math.PI/2 : -Math.PI/4;
    camera.beta = next === "2d" ? 0.01 : Math.PI/3;
    camera.lowerBetaLimit = next === "2d" ? 0.01 : 0.1;
    camera.upperBetaLimit = next === "2d" ? 0.01 : Math.PI-0.1;
    threeD.setAttribute("aria-pressed", String(next === "3d"));
    twoD.setAttribute("aria-pressed", String(next === "2d"));
    fit();
  }
  threeD.addEventListener("click", () => view("3d"));
  twoD.addEventListener("click", () => view("2d"));
  document.getElementById("fit").addEventListener("click", fit);
  wallsButton.addEventListener("click", () => {
    wallsVisible = !wallsVisible;
    for (const mesh of scene.meshes) {
      if (mesh.name.toLowerCase().startsWith("wall:")) mesh.setEnabled(wallsVisible);
    }
    wallsButton.setAttribute("aria-pressed", String(wallsVisible));
  });
  scene.onPointerObservable.add(event => {
    const mesh = event.pickInfo && event.pickInfo.pickedMesh;
    if (mesh && event.pickInfo.hit && mesh.getTotalVertices() > 0) {
      detail.textContent = mesh.name || "Unnamed model element";
    }
  }, BABYLON.PointerEventTypes.POINTERPICK);
  const render = () => scene.render();
  engine.runRenderLoop(render);
  const resize = () => { engine.resize(); if (mode === "2d") setOrtho(); };
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) engine.stopRenderLoop();
    else engine.runRenderLoop(render);
  });
  window.addEventListener("pagehide", () => engine.dispose(), {once:true});
  const modelData = "data:model/gltf-binary;base64," + '""" + data + """';
  BABYLON.SceneLoader.Append("", modelData, scene, () => {
    modelBounds = scene.getWorldExtends();
    if (!Number.isFinite(modelBounds.min.x)) {
      message("The model has no visible geometry. Download the GLB file.", true);
      return;
    }
    fit();
    message("Model loaded · tap objects to inspect · use Plan 2D for a top view.");
  }, undefined, (_scene, error) => {
    message("3D model failed to load. Download GLB or view the PDF. " + String(error).slice(0, 140), true);
  }, ".glb");
})();
</script></body></html>"""
`;
