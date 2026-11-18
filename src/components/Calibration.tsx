// Loaded only for a finished project, so the main bundle does not carry it.

import type { Project } from "../data";
import { calibrationOf, calibrationText } from "../lib/calibration";
import "../styles/guess.css";

/** How many of the project's 90% ranges contained the date it was done, in plain words. */
export function CalibrationCard({ project }: { project: Project }) {
  if (project.completedAt === null || project.estimates.length === 0) return null;
  const calibration = calibrationOf(project.estimates, project.completedAt);
  const text = calibrationText(calibration);
  return (
    <section className="card section calibration" aria-labelledby="calibration-heading">
      <h2 id="calibration-heading">How calibrated were the estimates?</h2>
      <p className="calibration__score">
        <span className="calibration__dots" aria-hidden="true">
          {project.estimates.map((estimate, index) => {
            const hit = calibrationOf([estimate], project.completedAt ?? "").hits === 1;
            return (
              <span key={`${estimate.estimatedAt}-${String(index)}`} className={hit ? "calibration__dot calibration__dot--hit" : "calibration__dot"}>
                {hit ? "✓" : "✕"}
              </span>
            );
          })}
        </span>
        {text.headline}
      </p>
      <p className="small">{text.meaning}</p>
    </section>
  );
}
