// FILE: fieldar.js
import { Annotator } from "./modules/annotator.js";

let annotator = null;

window.addEventListener("DOMContentLoaded", () => {
    const canvasEl = document.getElementById("annotatorCanvas");

    annotator = new Annotator(canvasEl);

    // --- Hook up buttons ---
    document.getElementById("undoBtn").addEventListener("click", () => {
        annotator.undo();
    });

    document.getElementById("redoBtn").addEventListener("click", () => {
        annotator.redo();
    });

    // Load user-selected base image
    document.getElementById("imageLoader").addEventListener("change", event => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            annotator.loadBaseImage(e.target.result);
        };
        reader.readAsDataURL(file);
    });
});