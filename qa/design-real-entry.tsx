import { createRoot } from "react-dom/client";
import { DesignRealQA } from "./design-real";
import "./agent-ui.css";

const root = document.getElementById("root");
if (!root) throw new Error("CAD/BIM QA entry root was not found.");
createRoot(root).render(<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6"><DesignRealQA /></main>);
