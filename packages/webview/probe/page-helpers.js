"use strict";

/** Runs in the page; read through `window.__probe`. */
function pageHelpers() {
  const flowPosition = (element) => {
    const match = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
      element.style.transform,
    );
    return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
  };
  const centreOf = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const buttonByText = (text) =>
    [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === text,
    );
  window.__probe = {
    nodes() {
      const boxes = {};
      for (const element of document.querySelectorAll(".react-flow__node")) {
        const rect = element.getBoundingClientRect();
        boxes[element.dataset.id] = {
          ...flowPosition(element),
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          pinned: element.querySelector('[aria-label="Unpin"]') !== null,
          open: element.querySelector(".node-code") !== null,
          failureTop: element
            .querySelector(".node-failure")
            ?.getBoundingClientRect().top,
          entering: element.classList.contains("is-entering"),
          code: element.querySelector(".node-code")?.textContent ?? "",
          change: /\bchange-(added|modified)\b/.exec(
            element.querySelector(".node-box")?.className ?? "",
          )?.[1],
          test: element.querySelector(".node-box.is-test") !== null,
          opacity: Number(
            getComputedStyle(element.querySelector(".node-box")).opacity,
          ),
        };
      }
      return boxes;
    },
    edges() {
      return [...document.querySelectorAll(".react-flow__edge")].map(
        (element) => {
          const path = element.querySelector(".react-flow__edge-path");
          return {
            id: element.dataset.testid.replace(/^rf__edge-/, ""),
            d: path?.getAttribute("d"),
            length: path?.getTotalLength(),
            stroke: getComputedStyle(path).stroke,
            test: element.classList.contains("edge-test"),
            dash: getComputedStyle(path).strokeDasharray,
          };
        },
      );
    },
    zoom() {
      const viewport = document.querySelector(".react-flow__viewport");
      return Number(/scale\(([\d.]+)\)/.exec(viewport.style.transform)?.[1]);
    },
    centreOfNode: (id, selector) =>
      centreOf(
        document
          .querySelector(`.react-flow__node[data-id="${id}"]`)
          .querySelector(selector),
      ),
    centreOfButton: (text) => centreOf(buttonByText(text)),
    buttonState(text) {
      const button = buttonByText(text);
      return (
        button && { disabled: button.disabled, pressed: button.ariaPressed }
      );
    },
    canvasCentre: () => centreOf(document.querySelector(".graph-canvas")),
    windowSize: () => ({ width: innerWidth, height: innerHeight }),
    posted: () => window.__posted,
    savedState: () => JSON.parse(sessionStorage.getItem("probe-state")),
    problems: () => [...window.__violations, ...window.__errors],
    startRecording() {
      const recording = { running: true, series: [] };
      const sample = () => {
        if (!recording.running) return;
        const paths = document.querySelectorAll(".react-flow__edge-path");
        recording.series.push(
          [...paths].filter((path) => path.getAttribute("d")).length,
        );
        requestAnimationFrame(sample);
      };
      window.__recording = recording;
      requestAnimationFrame(sample);
    },
    stopRecording() {
      window.__recording.running = false;
      return window.__recording.series;
    },
  };
}

module.exports = { pageHelpers };
