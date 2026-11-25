// The editor's canvas and the shared drawing helpers bound to it.
import { createDrawingTools, createGameArt } from "../drawing.js";
import { createTerrainRenderer } from "../terrain-render.js";

export const $ = (id) => document.getElementById(id);

export const canvas = $("editor-canvas");

export const wrap = $("canvas-wrap");

export const ctx = canvas.getContext("2d");

export const art = createGameArt(ctx);

export const tools = createDrawingTools(ctx);

export const terrainArt = createTerrainRenderer();

