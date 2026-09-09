import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./App";
import "./styles.css";
class Boundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    void import("./lib/bridge").then((b) => b.request("stop")).catch(() => {});
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Интерфейс остановлен</h1>
        <p>Нажмите F9, проверьте черновик и перезапустите TyperX.</p>
        <button onClick={() => location.reload()}>
          Перезагрузить интерфейс
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </Boundary>
  </React.StrictMode>,
);
