import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/workspace" element={<Home initialPhase="upload" />} />
      <Route path="/demo" element={<Home initialPhase="done" initialJobId="demo-pacific-nw" />} />
      <Route path="/results/:jobId" element={<Home initialPhase="done" />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}