// FILE: fieldar.js
import Annotator from "./modules/annotator.js";

const dbg = document.getElementById("debugConsole");
function log(msg){ dbg.innerHTML += `[LOG] ${new Date().toLocaleTimeString()}: ${msg}<br>`; dbg.scrollTop = dbg.scrollHeight; console.log(msg); }
function error(msg){ dbg.innerHTML += `[ERROR] ${new Date().toLocaleTimeString()}: ${msg}<br>`; dbg.scrollTop = dbg.scrollHeight; console.error(msg); }

log("fieldar.js starting");

// instantiate annotator when DOM ready
window.addEventListener("DOMContentLoaded", async () => {
  const canvasEl = document.getElementById("annotatorCanvas");
  const annotator = new Annotator(canvasEl, { debugLog: log });

  // wire controls
  document.getElementById("undoBtn").addEventListener("click", () => {
    annotator.undo();
    log("Undo triggered");
  });

  document.getElementById("redoBtn").addEventListener("click", () => {
    annotator.redo();
    log("Redo triggered");
  });

  // Load base image from file input
  const imageLoader = document.getElementById("imageLoader");
  imageLoader.addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return error("No image file selected");
    const reader = new FileReader();
    reader.onload = (e) => {
      annotator.loadBaseImage(e.target.result);
      log(`Base image loaded (${f.name})`);
    };
    reader.readAsDataURL(f);
  });

  // ----- EXPORT overlays to JSON -----
  document.getElementById("exportBtn").addEventListener("click", () => {
    try {
      const payload = annotator.toJSON();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fieldar-overlays.json";
      a.click();
      URL.revokeObjectURL(url);
      log(`Exported overlays -- ${json.length} bytes`);
    } catch (err) {
      error("Export failed: " + err);
    }
  });

  // ----- IMPORT overlays from JSON file -----
  const importFile = document.getElementById("importFile");
  importFile.addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return error("No JSON file selected for import");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = JSON.parse(e.target.result);
        // allow both { overlays: [...], imageWidth:..., imageHeight:... } or canvas JSON
        annotator.loadFromJSON(obj);
        log(`Imported overlays from ${f.name}`);
      } catch (err) {
        error("Failed to parse import JSON: " + err);
      }
    };
    reader.readAsText(f);
  });

  // optional: restore autosave on init (if present)
  try {
    const ls = localStorage.getItem("fieldar_overlays");
    if (ls) {
      const parsed = JSON.parse(ls);
      annotator.loadFromJSON(parsed);
      log("Restored overlays from localStorage");
    }
  } catch (e) {
    /* ignore */
  }

  log("fieldar.js ready");
});