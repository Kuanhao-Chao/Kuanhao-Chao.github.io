import React from "react";
import ReactDOM from "react-dom";

import App from "./App";

const rootElement = document.getElementById("main_body");
ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  rootElement
);
