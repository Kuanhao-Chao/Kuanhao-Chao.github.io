import React from "react";
// import "./styles.css";
import { Chrono } from "react-chrono";
import data from "./data";

export default function App() {
  return (
    <div className="App">
      <div style={{ width: "850px", height: "500px" }}>
        <Chrono items={data} mode="HORIZONTAL" />
      </div>
    </div>
  );
}
