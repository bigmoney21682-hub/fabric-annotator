// FILE: fieldar.js
import Annotator from './modules/annotator.js';

console.log("[LOG] 🖥 Debug console initialized");

const canvas = document.getElementById("annotatorCanvas");
const annotator = new Annotator(canvas);

document.getElementById("undoBtn").addEventListener("click", () => {
    console.log("[BTN] Undo clicked");
    annotator.undo();
});

document.getElementById("redoBtn").addEventListener("click", () => {
    console.log("[BTN] Redo clicked");
    annotator.redo();
});

// Load an image when selected
document.getElementById("imageLoader").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => annotator.setBaseImage(img);
    img.src = URL.createObjectURL(file);
});