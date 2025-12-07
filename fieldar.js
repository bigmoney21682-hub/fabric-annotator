// FILE: fieldar.js
// Author: Oshane Bailey
// Purpose: Full FieldAR Annotator logic
// Features: Undo/Redo, Polygon Draw toggle, Image upload & resize, Import/Export overlays, Autosave, Debug console

// ----------------------------
// DEBUG CONSOLE UTILS
// ----------------------------
const debugConsole = document.createElement("div");
debugConsole.id = "debugConsole";
debugConsole.style.position = "fixed";
debugConsole.style.bottom = "0";
debugConsole.style.left = "0";
debugConsole.style.width = "100%";
debugConsole.style.maxHeight = "200px";
debugConsole.style.overflowY = "auto";
debugConsole.style.background = "#222";
debugConsole.style.color = "#0f0";
debugConsole.style.fontFamily = "monospace";
debugConsole.style.fontSize = "12px";
debugConsole.style.padding = "5px";
document.body.appendChild(debugConsole);

function log(msg) {
    console.log(msg);
    debugConsole.innerHTML += `[LOG] ${msg}<br>`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

function error(msg) {
    console.error(msg);
    debugConsole.innerHTML += `[ERROR] ${msg}<br>`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

log("🖥 Debug console initialized");

// ----------------------------
// GLOBAL VARIABLES
// ----------------------------
let canvas;
let undoStack = [];
let redoStack = [];
let polygonMode = false;
let pointArray = [];
let lineArray = [];
let activeLine = null;
let activeShape = null;

// ----------------------------
// INIT CANVAS
// ----------------------------
window.onload = function () {
    const canvasEl = document.getElementById("annotatorCanvas");
    canvas = new fabric.Canvas(canvasEl, {
        selection: true
    });

    log(`Canvas initialized: ${canvas.getWidth()}x${canvas.getHeight()}`);

    loadState();

    // Auto-save on change
    canvas.on('object:added', saveState);
    canvas.on('object:modified', saveState);
    canvas.on('object:removed', saveState);

    // ----------------------------
    // IMAGE UPLOAD
    // ----------------------------
    document.getElementById("imageLoader").onchange = function (e) {
        let reader = new FileReader();
        reader.onload = function (event) {
            fabric.Image.fromURL(event.target.result, function (img) {
                // Resize canvas to image size
                canvas.setWidth(img.width);
                canvas.setHeight(img.height);

                // Set background
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                    originX: 'left',
                    originY: 'top'
                });

                saveState();
                log(`Loaded image: ${img.width}x${img.height}`);
            });
        };
        reader.readAsDataURL(e.target.files[0]);
    };

    // ----------------------------
    // UNDO / REDO BUTTONS
    // ----------------------------
    document.getElementById("undoBtn").onclick = function () {
        if (undoStack.length > 0) {
            redoStack.push(JSON.stringify(canvas.toJSON()));
            const prev = undoStack.pop();
            canvas.loadFromJSON(prev, () => canvas.renderAll());
            log("Undo performed");
        } else {
            log("Nothing to undo");
        }
    };

    document.getElementById("redoBtn").onclick = function () {
        if (redoStack.length > 0) {
            undoStack.push(JSON.stringify(canvas.toJSON()));
            const next = redoStack.pop();
            canvas.loadFromJSON(next, () => canvas.renderAll());
            log("Redo performed");
        } else {
            log("Nothing to redo");
        }
    };

    // ----------------------------
    // POLYGON DRAW TOGGLE
    // ----------------------------
    const polyBtn = document.createElement("button");
    polyBtn.innerText = "Polygon Draw";
    polyBtn.onclick = function () {
        polygonMode = !polygonMode;
        log(`Polygon Mode: ${polygonMode ? "ON" : "OFF"}`);
    };
    document.getElementById("toolbar").appendChild(polyBtn);

    canvas.on("mouse:down", function (options) {
        if (polygonMode && options.pointer) {
            const pointer = canvas.getPointer(options.e);
            const circle = new fabric.Circle({
                left: pointer.x,
                top: pointer.y,
                radius: 5,
                fill: pointArray.length === 0 ? "red" : "white",
                originX: "center",
                originY: "center",
                selectable: false
            });
            const points = [pointer.x, pointer.y, pointer.x, pointer.y];
            const line = new fabric.Line(points, {
                stroke: "#999",
                strokeWidth: 2,
                selectable: false,
                evented: false
            });

            if (!activeShape) {
                activeShape = new fabric.Polygon([{ x: pointer.x, y: pointer.y }], {
                    stroke: "#333",
                    strokeWidth: 1,
                    fill: "rgba(200,200,200,0.3)",
                    selectable: false,
                    evented: false
                });
                canvas.add(activeShape);
            } else {
                const shapePoints = activeShape.get("points");
                shapePoints.push({ x: pointer.x, y: pointer.y });
                activeShape.set({ points: shapePoints });
            }

            pointArray.push(circle);
            lineArray.push(line);
            canvas.add(circle);
            canvas.add(line);
            canvas.renderAll();
        }
    });
};

// ----------------------------
// SAVE & LOAD STATE
// ----------------------------
function saveState() {
    undoStack.push(JSON.stringify(canvas.toJSON()));
    redoStack = [];
    localStorage.setItem("fieldar_overlays", JSON.stringify(canvas.toJSON()));
    log("State saved, undoStack length: " + undoStack.length);
}

function loadState() {
    const saved = localStorage.getItem("fieldar_overlays");
    if (saved) {
        canvas.loadFromJSON(saved, () => canvas.renderAll());
        log("Loaded saved overlays");
    }
}

// ----------------------------
// IMPORT / EXPORT
// ----------------------------
const exportBtn = document.createElement("button");
exportBtn.innerText = "Export";
exportBtn.onclick = function () {
    const json = JSON.stringify(canvas.toJSON());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fieldar-overlays.json";
    a.click();
    URL.revokeObjectURL(url);
    log("Export complete, JSON size: " + json.length);
};
document.getElementById("toolbar").appendChild(exportBtn);

const importBtn = document.createElement("button");
importBtn.innerText = "Import";
importBtn.onclick = function () {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return error("No file selected");
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const data = JSON.parse(ev.target.result);
                canvas.loadFromJSON(data, () => canvas.renderAll());
                saveState();
                log("Overlays imported: " + canvas.getObjects().length);
            } catch (err) {
                error("Failed to parse JSON");
            }
        };
        reader.readAsText(file);
    };
    fileInput.click();
};
document.getElementById("toolbar").appendChild(importBtn);