import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Player from "../app/Player";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("InkTune root element was not found");

createRoot(root).render(
  <StrictMode>
    <Player />
  </StrictMode>,
);
