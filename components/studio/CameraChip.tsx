"use client";

import { RefObject } from "react";

export type HandStatus = "off" | "loading" | "searching" | "pointing" | "pinching" | "holding" | "twohands" | "stretching";

const COPY: Record<HandStatus, string> = {
  off: "Camera off",
  loading: "Waking up the camera…",
  searching: "Show one hand to the camera",
  pointing: "Pointing",
  pinching: "Pinching",
  holding: "Holding · twist to turn",
  twohands: "Make an L with both hands to stretch petals",
  stretching: "Apart for more petals · closer for fewer",
};

interface Props {
  mode: "hands" | "touch";
  status: HandStatus;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onEnable: () => void;
  onDisable: () => void;
}

/** Small camera preview so people can see the tracking is working. */
export function CameraChip({ mode, status, videoRef, canvasRef, onEnable, onDisable }: Props) {
  const live = mode === "hands";
  return (
    <div className={`cam${live ? " is-live" : ""}`} data-status={status}>
      <div className="cam-view" aria-hidden={!live}>
        <video ref={videoRef} playsInline muted className="cam-video" />
        <canvas ref={canvasRef} width={160} height={120} className="cam-canvas" />
      </div>
      <div className="cam-meta">
        <span className="cam-status">
          <i className="cam-dot" />
          {live ? COPY[status] : "Using mouse & touch"}
        </span>
        {live ? (
          <button className="link-btn link-btn--quiet" onClick={onDisable}>
            Turn camera off
          </button>
        ) : (
          <button className="link-btn" onClick={onEnable}>
            Use hand gestures
          </button>
        )}
      </div>
    </div>
  );
}
