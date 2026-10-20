import { useState } from "react";
import GeoreferencingExperiment from "./GeoreferencingExperiment.jsx";
import LidarLearningPanel from "./LidarLearningPanel.jsx";
import { directGeoreference } from "./georeferencing-model.js";
import { BORESIGHT_STAGES, boresightLessonPreset } from "./boresight-lesson.js";
import "./simulation.css";
import "./native.css";
import "./boresight.css";
import "./survey-teaching.css";

export default function Boresight() {
  const [stage, setStage] = useState("lever"),
    [settings, setSettings] = useState(() => boresightLessonPreset("lever"));
  const change = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const preset = (id) => {
    setStage(BORESIGHT_STAGES.some((s) => s.id === id) ? id : "boresight");
    setSettings(boresightLessonPreset(id));
  };
  const shot = directGeoreference(settings);
  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>
          ← All simulators
        </a>
        <div className="title-block">
          <h1>Boresight &amp; lever arm</h1>
          <span className="sub">
            Locate the sensor. Orient the ray. Reconstruct the same observation.
          </span>
        </div>
      </header>
      <GeoreferencingExperiment
        settings={settings}
        onChange={change}
        stage={stage}
        onPreset={preset}
        shot={shot}
      />
      <LidarLearningPanel
        topic="boresight"
        workedExample={
          shot
            ? "This single observation has range " +
              shot.range.toFixed(3) +
              " m, horizontal error " +
              (shot.horizontal * 100).toFixed(2) +
              " cm and vertical error " +
              (shot.vertical * 100).toFixed(2) +
              " cm. Every view and readout uses this result."
            : "No forward ground intersection. Restore an above-ground sensor and a downward ray."
        }
        onExperiment={preset}
      />
    </div>
  );
}
