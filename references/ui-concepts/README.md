# UI reference set

The five `concept-*` images compare the same editor in five visual systems.
`concept-02-canvas-first.png` is the selected direction.

The implementation references are:

1. `page-01-tracks.png` — example and saved-track library.
2. `page-02-editor.png` — fullscreen draft editor.
3. `page-03-simulation-idle.png` — honest single-baseline setup.
4. `page-04-simulation-running.png` — live training state.

## Extracted design system

- Canvas-first, pristine light interface.
- System sans-serif typography with an ordinary, readable hierarchy.
- White application chrome, `#f7f8fa` workspace, `#111318` primary text,
  `#68707d` secondary text, and one `#0b63f6` action color.
- Thin structural borders and restrained 8 px radii; no glow, gradients, glass,
  or nested card stacks.
- A roughly 72 px application header.
- Track editor: at least 80% of the viewport belongs to the canvas. Editing
  tools float over it in one stable vertical palette.
- Simulation: approximately 70% canvas and 30% controls.
- The draft state always says that progress is not calculated yet.
- During editing, only the two route endpoints may be shown. Raw samples,
  checkpoints, progress dots, cars, and fitness stay hidden.
- During training, one best car is blue and readable; the rest are neutral and
  visually subordinate.

## Product boundaries

- Visible primary sections: `Трассы` and `Симуляция`.
- Built-in examples are called examples, never generated tracks.
- The only implemented participant is `Базовый эволюционный алгоритм`.
- ChatGPT and Gemini appear only in the explanatory sentence that says they are
  not implemented yet.
- Algorithm comparison, fairness, CPU allocation, saved runs, replay library,
  and 3D controls stay out of the UI until those features are real.
