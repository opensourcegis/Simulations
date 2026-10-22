import { LESSON_BRIEFS } from "./lesson-briefs.js";
import "./lesson-brief.css";

export default function LessonBrief({ topic }) {
  const lesson = LESSON_BRIEFS[topic];
  return (
    <section className="lesson-brief" aria-label="Teaching objective">
      <p>
        <span>LEARNING GOAL</span>
        {lesson.objective}
      </p>
      <details>
        <summary>Try one experiment · read the model limits</summary>
        <div className="lesson-brief-grid">
          <div>
            <h2>Change one thing</h2>
            <p>{lesson.experiment}</p>
            <h2>Look for evidence</h2>
            <p>{lesson.evidence}</p>
          </div>
          <div>
            <h2>What this model does not claim</h2>
            <p>{lesson.limits}</p>
            <a href={lesson.reference[1]} target="_blank" rel="noreferrer">
              {lesson.reference[0]} ↗
            </a>
          </div>
        </div>
      </details>
    </section>
  );
}
