import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import App from "./App";
import "./styles.css";

// The built page already shows the title page and the list
// (scripts/build-static-pages.mjs), so a phone paints before this script
// arrives. The application replaces that markup with the same structure in
// one synchronous render, keeping anything already typed into the search.
const container = document.getElementById("root")!;
const staticSearch = container.querySelector<HTMLInputElement>(".search input");
const initialQuery = staticSearch?.value ?? "";
const searchHadFocus = Boolean(staticSearch) && document.activeElement === staticSearch;

const root = createRoot(container);
flushSync(() => {
  root.render(
    <StrictMode>
      <App initialQuery={initialQuery} />
    </StrictMode>,
  );
});
if (searchHadFocus) container.querySelector<HTMLInputElement>(".search input")?.focus();
