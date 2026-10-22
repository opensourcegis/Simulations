import { useState } from "react";
import {
  LIDAR_LESSONS,
  LIDAR_LEARNING_PATH,
} from "../../games/shared/lidar-lessons.js";
import "./learning-panel.css";

export default function LidarLearningPanel({
  topic,
  workedExample,
  onExperiment,
}) {
  const lesson = LIDAR_LESSONS[topic];
  const [experiment, setExperiment] = useState(null);
  const [answer, setAnswer] = useState(null);
  return (
    <section
      className="lidar-learning lidar-learning-compact"
      aria-labelledby={`learning-${topic}`}
    >
      <div className="lidar-learning-heading">
        <h2 id={`learning-${topic}`}>Learning goal</h2>
        <p>{lesson.objective}</p>
      </div>
      <details className="lidar-learning-content">
        <summary>Theory, experiments &amp; self-check</summary>
        <h3>{lesson.title}</h3>
        <details className="lidar-guide">
          <summary>
            Working principle &amp; guided experiments{" "}
            <span>Predict → change → explain</span>
          </summary>
          <ol className="lidar-working-steps">
            {lesson.steps.map(([title, text]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <div className="lidar-experiments">
            {lesson.experiments.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={experiment === item.id}
                onClick={() => setExperiment(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
          {experiment && (
            <div className="lidar-experiment-result" key={experiment}>
              <strong>Predict:</strong>{" "}
              {
                lesson.experiments.find((item) => item.id === experiment)
                  .prediction
              }
              <div className="lidar-experiments">
                <button type="button" onClick={() => onExperiment(experiment)}>
                  Apply experiment settings
                </button>
              </div>
              <details>
                <summary>Reveal the expected explanation</summary>
                <p>
                  {
                    lesson.experiments.find((item) => item.id === experiment)
                      .result
                  }
                </p>
              </details>
            </div>
          )}
          <div className="lidar-worked-example">
            <strong>With the current inputs</strong>
            <p>{workedExample}</p>
          </div>
        </details>
        <details className="lidar-guide">
          <summary>
            Check your understanding <span>One concept, with feedback</span>
          </summary>
          <p className="lidar-question">{lesson.question.prompt}</p>
          <div className="lidar-answers">
            {lesson.question.choices.map((choice, index) => (
              <button
                type="button"
                key={choice}
                aria-pressed={answer === index}
                onClick={() => setAnswer(index)}
              >
                {choice}
              </button>
            ))}
          </div>
          {answer !== null && (
            <p className="lidar-answer-feedback" role="status">
              <strong>
                {answer === lesson.question.correct
                  ? "Correct. "
                  : "Reconsider. "}
              </strong>
              {lesson.question.explanation}
            </p>
          )}
        </details>
        <details className="lidar-guide">
          <summary>Model assumptions &amp; further reading</summary>
          <p>{lesson.assumptions}</p>
          <ul className="lidar-references">
            {lesson.references.map((reference) => (
              <li key={reference.url}>
                <a href={reference.url} target="_blank" rel="noreferrer">
                  {reference.title} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
        <nav
          className="lidar-learning-path"
          aria-label="LiDAR learning sequence"
        >
          {LIDAR_LEARNING_PATH.map((item, index) => (
            <a
              key={item.topic}
              href={`${import.meta.env.BASE_URL}${item.path}`}
              aria-current={item.topic === topic ? "page" : undefined}
            >
              <span>{index + 1}</span>
              {item.title}
            </a>
          ))}
        </nav>
      </details>
    </section>
  );
}
