import { LIDAR_LESSONS, LIDAR_LEARNING_PATH } from './lidar-lessons.js';

// Standalone pages use the same lesson content as the React applications.
export function mountLidarLearning(topic, { onExperiment, getWorkedExample }) {
  const lesson = LIDAR_LESSONS[topic];
  const panel = document.createElement('section');
  const base = new URL('../../', window.location.href);
  panel.className = 'lidar-learning';
  panel.setAttribute('aria-labelledby', `learning-${topic}`);
  panel.innerHTML = `<div class="lidar-learning-heading"><span class="lidar-learning-number">LiDAR · ${lesson.number} / 06</span><h2 id="learning-${topic}">${lesson.title}</h2><p>${lesson.objective}</p></div>
    <details class="lidar-guide"><summary>Working principle &amp; guided experiments <span>Predict → change → explain</span></summary>
    <ol class="lidar-working-steps">${lesson.steps.map(([title, text]) => `<li><h3>${title}</h3><p>${text}</p></li>`).join('')}</ol>
    <div class="lidar-experiments">${lesson.experiments.map(item => `<button type="button" data-experiment="${item.id}" aria-pressed="false">${item.title}</button>`).join('')}</div>
    <div class="lidar-experiment-result" hidden><strong>Predict:</strong> <span data-prediction></span><div class="lidar-experiments"><button type="button" data-apply>Apply experiment settings</button></div><details><summary>Reveal the expected explanation</summary><p data-result></p></details></div>
    <div class="lidar-worked-example"><strong>With the current inputs</strong><p data-example></p></div></details>
    <details class="lidar-guide"><summary>Check your understanding <span>One concept, with feedback</span></summary><p class="lidar-question">${lesson.question.prompt}</p>
    <div class="lidar-answers">${lesson.question.choices.map((choice, index) => `<button type="button" data-answer="${index}" aria-pressed="false">${choice}</button>`).join('')}</div><p class="lidar-answer-feedback" role="status" hidden></p></details>
    <details class="lidar-guide"><summary>Model assumptions &amp; further reading</summary><p>${lesson.assumptions}</p><ul class="lidar-references">${lesson.references.map(ref => `<li><a href="${ref.url}" target="_blank" rel="noreferrer">${ref.title} ↗</a></li>`).join('')}</ul></details>
    <nav class="lidar-learning-path" aria-label="LiDAR learning sequence">${LIDAR_LEARNING_PATH.map((item, index) => `<a href="${new URL(item.path, base)}"${item.topic === topic ? ' aria-current="page"' : ''}><span>${index + 1}</span>${item.title}</a>`).join('')}</nav>`;
  document.querySelector('.topbar').after(panel);
  let selectedExperiment = null;
  const update = () => { panel.querySelector('[data-example]').textContent = getWorkedExample(); };
  panel.addEventListener('click', event => {
    const experimentButton = event.target.closest('[data-experiment]');
    if (experimentButton) {
      const item = lesson.experiments.find(entry => entry.id === experimentButton.dataset.experiment);
      selectedExperiment = item.id;
      panel.querySelectorAll('[data-experiment]').forEach(button => button.setAttribute('aria-pressed', String(button === experimentButton)));
      panel.querySelector('.lidar-experiment-result').hidden = false;
      panel.querySelector('[data-prediction]').textContent = item.prediction;
      panel.querySelector('[data-result]').textContent = item.result;
      panel.querySelector('.lidar-experiment-result details').open = false;
    }
    if (event.target.closest('[data-apply]') && selectedExperiment) onExperiment(selectedExperiment);
    const answerButton = event.target.closest('[data-answer]');
    if (answerButton) {
      panel.querySelectorAll('[data-answer]').forEach(button => button.setAttribute('aria-pressed', String(button === answerButton)));
      const feedback = panel.querySelector('.lidar-answer-feedback');
      feedback.hidden = false;
      feedback.textContent = `${Number(answerButton.dataset.answer) === lesson.question.correct ? 'Correct.' : 'Reconsider.'} ${lesson.question.explanation}`;
    }
    update();
  });
  document.querySelector('.app').addEventListener('input', update);
  document.querySelector('.app').addEventListener('change', update);
  document.querySelector('.app').addEventListener('click', update);
  update();
  return { update };
}
