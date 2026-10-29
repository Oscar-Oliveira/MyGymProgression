# Training Progression and Workout Management Application

## 1. Project objective

Design and develop an application for managing strength-training programmes, recording workouts, applying double progression and analysing training performance for hypertrophy and strength development.

The application must help users plan workouts, execute them, record actual performance, understand progression recommendations and evaluate results over time.

The application must support different exercise measurement types. Not every exercise uses repetitions and load, and not every exercise requires progression.

**Important:** Do not begin implementation immediately. Follow the discovery, requirements analysis, planning, Web implementation, review and Android development workflow described below.

---

## 2. Mandatory development workflow

### Phase 1: Analyse and clarify

Before proposing an implementation:

1. Inspect the existing project, repository, documentation, development environment and available tools.
2. Identify the intended users, main workflows, functional requirements, constraints and assumptions.
3. Identify ambiguities, conflicting requirements, technical risks and missing decisions.
4. Ask focused questions whenever answers could materially affect architecture, functionality, usability or data integrity.
5. Group related questions and explain important trade-offs. Avoid asking questions whose answers can safely be handled by reversible defaults.
6. Suggest useful additional features when they provide meaningful value. Ask whether the user wants each significant optional feature included.
7. Record confirmed requirements, open questions, assumptions, exclusions and acceptance criteria.

Do not silently make consequential decisions or implement features that have not been agreed upon.

### Phase 2: Plan and obtain approval

Prepare a concrete development plan containing:

- Product requirements and prioritised user stories.
- Main workflows and navigation.
- Data model and relationships.
- Exercise measurement types and progression rules.
- Double-progression rules and edge cases.
- UI/UX approach, including workout logging.
- Architecture, technology choices and rationale.
- Data persistence, backup, import and export strategy.
- Security and privacy considerations.
- Testing strategy and measurable acceptance criteria.
- Implementation milestones and dependencies.
- Risks, unresolved decisions and proposed mitigations.

Distinguish the minimum viable product (MVP) from optional enhancements.

Present the proposed plan and ask for approval before starting implementation. Incorporate feedback and obtain renewed approval if the architecture or scope changes materially.

### Phase 3: Implement the Web MVP

Implement a complete, usable Web application rather than a static mock-up.

Work incrementally. For each milestone:

1. Explain the intended changes.
2. Implement the agreed functionality.
3. Run relevant automated tests and validation.
4. Check the actual user workflows.
5. Report completed work, limitations and remaining issues.

Maintain clear documentation, reproducible development instructions and an appropriate Git history.

### Phase 4: Demonstrate and review

Provide a running Web version that can be evaluated before any mobile implementation begins.

Demonstrate:

- Creating and editing exercises.
- Building and modifying training plans.
- Recording a workout and individual sets.
- Applying double progression where enabled.
- Recording exercises that use duration, distance or other metrics.
- Recording exercises that have no progression.
- Reviewing recommendations and historical performance.
- Analysing results.
- Exporting and importing data.

Provide clear instructions for running and testing the application. Where the environment permits, supply a working deployment or preview.

Collect feedback and resolve agreed issues. Do not start mobile development until the user has explicitly accepted the Web version and approved the next phase.

### Phase 5: Android-first mobile application

After Web approval:

1. Reassess the architecture and identify reusable components and services.
2. Propose the mobile architecture and obtain approval for material changes.
3. Prioritise Android usability and performance.
4. Optimise workout logging for use in the gym, including quick set entry and minimal interaction.
5. Define offline operation, local persistence, synchronisation and conflict handling as appropriate.
6. Validate data compatibility between Web and mobile.
7. Provide installation, testing and release instructions.

Do not assume that the Web interface can simply be scaled down for mobile. The mobile experience must be designed around the practical conditions of a training session.

---

## 3. Exercise library

Provide a searchable, reusable exercise library.

Each exercise should support:

- Exercise name and alternative names.
- Primary and secondary muscle groups.
- Equipment and exercise category.
- Exercise type, such as compound, isolation, cardio, warm-up or mobility.
- Instructions and technique notes.
- Optional images, video links and other external references.
- Exercise-specific parameters and safety notes.
- Default sets, repetition ranges, duration, distance, rest periods and optional RIR/RPE targets, as applicable.
- Preferred load increments and configurable progression rules.
- Personal notes and user-defined tags.
- Active/inactive status and user-defined variations.
- Measurement type and unit.
- Progression strategy, including an explicit no-progression option.

Images and external links are optional. Users must be able to create and use exercises without them.

Allow users to create custom exercises and, where appropriate, duplicate an existing exercise as a variation without losing the original.

Keep exercise definitions separate from their use in a particular training plan. Editing a library entry must not silently rewrite historical workout records.

---

## 4. Exercise measurement types and progression strategies

Not all exercises use repetitions and load as their primary performance measures. The application must support different exercise types, measurement units and progression strategies.

### 4.1 Measurement types

Each exercise must have a configurable measurement type. Examples include:

- **Repetitions and load:** Bench press, machine chest press, dumbbell curls.
- **Duration:** Plank, treadmill warm-up, stationary bike or other timed exercises.
- **Distance:** Running, walking, cycling or rowing.
- **Duration and distance:** Treadmill sessions, cycling and rowing workouts.
- **Speed and incline:** Treadmill running or walking.
- **Weight or resistance:** Exercises where resistance level is the primary variable.
- **Bodyweight repetitions:** Pull-ups, push-ups and other bodyweight exercises.
- **Time and repetitions:** Timed circuits or exercises performed for a specified duration and repetition count.
- **Other configurable metrics:** Exercises that do not fit the predefined categories.

Allow an exercise to use multiple metrics where appropriate. For example, a treadmill session may record duration, distance, speed, incline and estimated calories, while a plank may record duration only.

The exercise definition must determine which fields are relevant. Do not require users to enter repetitions or load for an exercise that does not use them.

Store measurements in structured fields with explicit units and validation rules. Avoid placing unrelated measurements into a single generic field without preserving their meaning.

### 4.2 Progression strategies

Progression must be configurable independently of the exercise measurement type.

Support at least:

- **Double progression:** Increase repetitions within a defined range before increasing load.
- **Duration progression:** Increase target duration, such as progressing from a 5-minute to a 10-minute plank.
- **Distance progression:** Increase target distance while keeping other parameters configurable.
- **Intensity progression:** Increase speed, incline, resistance or another relevant intensity variable.
- **Multi-variable progression:** Progress using a combination of variables, such as treadmill duration and incline.
- **Manual progression:** The user decides when and how to progress, with the application recording changes and performance.
- **No progression:** The exercise has a fixed prescription and is not expected to progress automatically.

Some exercises are used exclusively for warm-ups, mobility, recovery or preparation and may remain unchanged. The application must not assume that every exercise requires progression.

### 4.3 Example: treadmill warm-up without progression

Exercise: Treadmill warm-up  
Prescription: 5 minutes at a comfortable speed.

Record the actual duration and, if configured, speed, incline and distance. Mark the exercise as having no automatic progression.

The application should check whether the warm-up was completed as prescribed, but it must not recommend increasing the duration or intensity merely because the target was achieved.

### 4.4 Example: progressive treadmill training

Exercise: Treadmill walking  
Initial prescription: 10 minutes at 5 km/h and 2% incline.

Depending on the selected progression strategy, the application may recommend increasing duration, distance, speed or incline.

For example, a duration-based strategy could progress from 10 to 12 minutes while maintaining speed and incline. A multi-variable strategy could allow duration and incline to change according to explicitly defined rules.

The application must display which variable is being progressed and preserve the actual values recorded for each session.

### 4.5 Example: fixed-duration plank

Exercise: Plank  
Prescription: 3 sets of 30 seconds.

Record the duration of each set. If progression is enabled, the user may choose duration progression. If progression is disabled, the application only records completion and historical performance.

### 4.6 Exercise configuration and validation

The exercise and plan models must distinguish:

- Measurement type and unit.
- Prescribed target values and ranges.
- Actual values recorded for each set or exercise.
- Progression strategy, if any.
- Variables eligible for progression.
- Progression criteria and increments.
- Whether progression is recommendation-based, manual or governed by an explicitly approved automation rule.
- Whether the exercise is fixed, optional or intended as a warm-up.
- Relevant validation rules for each measurement type.

Do not apply irrelevant metrics, such as load-based volume, to exercises where they have no meaningful interpretation.

### 4.7 Analysis of exercises without progression

Exercises without progression must still appear in workout history and adherence reports. They must not be incorrectly flagged as stalled or regressing merely because their prescribed targets remain unchanged.

Analyse each exercise using metrics appropriate to its measurement type. Examples include:

- Repetitions, load and working-set volume for resistance exercises.
- Duration and distance for cardio exercises.
- Speed and incline trends for treadmill workouts.
- Duration per set for planks.
- Completion rate for fixed warm-ups and non-progressive exercises.

---

## 5. Training plan management

Allow users to create, duplicate, edit, archive and delete training plans.

A plan should support:

- A name, description, goal and optional training phase.
- Hypertrophy-focused, strength-focused or mixed training.
- Weekly schedules and training days.
- Ordered exercises and optional supersets or grouped exercises.
- Exercise-specific measurement types and progression strategies.
- Sets, repetition ranges, working loads, duration, distance, rest intervals and optional RIR/RPE targets, as applicable.
- Exercise-specific progression rules and load increments.
- Warm-up sets, working sets and optional back-off sets.
- Exercise substitutions and notes.
- Planned versus completed workouts.
- Plan versions or another mechanism that preserves the meaning of historical records.

Support different prescriptions for different exercises, including different repetition ranges, set counts, measurement types and progression criteria within the same plan.

Allow a workout to be started from a plan, modified for that session and recorded without unintentionally changing the underlying plan.

---

## 6. Double progression: method and rules

### 6.1 Concept

Double progression is a training method in which progression is achieved by increasing repetitions within a predefined range before increasing the load. It provides a structured way to apply progressive overload while maintaining control over exercise technique and training performance.

Each applicable exercise is assigned:

- A target repetition range, such as 8–12 repetitions.
- A working load, such as 30 kg.
- A target number of sets, such as 3.
- A target effort level, such as a specified number of repetitions in reserve (RIR), when applicable.

The athlete initially maintains the same load and attempts to increase the number of repetitions performed across sessions. Once the upper end of the repetition range is achieved in every prescribed set, with acceptable technique and the required effort level, the load can be increased.

After increasing the load, repetitions will usually decrease towards the lower end of the range. The process then repeats.

This method applies only to exercises configured to use double progression.

### 6.2 Step-by-step process

1. **Define the exercise prescription.** Set the target number of sets, repetition range, initial load, rest interval and, optionally, a target RIR or RPE.
2. **Record the completed workout.** For every set, record the actual load, completed repetitions and, optionally, RIR, RPE and notes.
3. **Evaluate performance.** Compare completed sets with the prescribed repetition range, technique requirements and effort target.
4. **Maintain or increase repetitions.** If the upper repetition limit has not been reached in every required set, retain the current load and aim to improve performance in a subsequent session.
5. **Increase the load when eligible.** When every prescribed set reaches the upper repetition limit and all configured progression criteria are satisfied, recommend a load increase.
6. **Reset towards the lower repetition limit.** After increasing the load, use the new load and aim to build repetitions again within the prescribed range.
7. **Review the trend.** Analyse performance across sessions to identify progress, stagnation, excessive fatigue or possible programming issues.

Progression should be based on completed performance, not on an automatic increase after a fixed number of sessions.

### 6.3 Hypertrophy example

Exercise: Machine Chest Press  
Prescription: 3 sets × 8–12 repetitions  
Initial load: 40 kg

| Session | Set 1 | Set 2 | Set 3 | Decision |
|---|---:|---:|---:|---|
| 1 | 10 | 9 | 8 | Keep 40 kg |
| 2 | 11 | 10 | 9 | Keep 40 kg |
| 3 | 12 | 11 | 10 | Keep 40 kg |
| 4 | 12 | 12 | 12 | Eligible for a load increase |
| 5 | 9 | 8 | 8 | Rebuild repetitions at the new load |

The load increases only after all three sets reach 12 repetitions. The next session starts building repetitions again with the new load.

This example assumes that the prescribed technique and effort requirements are satisfied. The load increase should be adjusted to the available equipment and the athlete's capabilities.

### 6.4 Strength-focused example

Exercise: Barbell Bench Press  
Prescription: 4 sets × 4–6 repetitions  
Initial load: 70 kg

| Session | Set 1 | Set 2 | Set 3 | Set 4 | Decision |
|---|---:|---:|---:|---:|---|
| 1 | 5 | 5 | 4 | 4 | Keep 70 kg |
| 2 | 5 | 5 | 5 | 4 | Keep 70 kg |
| 3 | 6 | 6 | 6 | 6 | Eligible for a load increase |
| 4 | 5 | 4 | 4 | 4 | Rebuild repetitions at the new load |

Strength-focused training typically uses lower repetition ranges and may require smaller load increments, longer rest periods and more conservative progression criteria than hypertrophy training.

Double progression is not the only suitable method for strength development. Some strength programmes use percentage-based loading, prescribed intensity, velocity targets or planned training cycles. The application should therefore support configurable progression rules rather than assume that one method is optimal for every exercise or goal.

### 6.5 Progression outcomes and exceptions

The application must distinguish between:

- **Completed as prescribed:** All sets satisfy the prescribed targets.
- **Repetition progress:** One or more sets improve without meeting the load-increase criteria.
- **Load increase recommended:** All progression criteria have been satisfied.
- **Load increased:** The athlete confirms the new working load.
- **Performance below target:** The completed workout does not meet the prescription.
- **Incomplete workout:** One or more prescribed sets were not completed.
- **Technique or effort restriction:** The repetition target was achieved, but technique, RIR or another required condition was not satisfied.
- **Manual adjustment:** The athlete overrides the recommendation and records the reason, when appropriate.
- **No progression configured:** The exercise is recorded and evaluated for completion, but no progression recommendation is generated.

Missed sessions, incomplete sets, exercise substitutions, pain and equipment limitations must not automatically trigger a load increase. Preserve the actual workout data and explain recommendations.

### 6.6 Strength-specific considerations

Support lower repetition ranges, smaller load increments, longer rest periods and configurable progression criteria for strength-focused training.

Where useful, allow estimated one-repetition maximum calculations. Label estimates clearly, document the chosen calculation method and avoid presenting estimates as actual measured maximums.

Do not force all training goals or exercise types into the same progression algorithm.

---

## 7. Workout execution and logging

Make workout recording fast, clear and practical, especially on mobile.

For each workout, record:

- Training date and time.
- Training plan and its applicable version.
- Exercises completed and their order.
- Prescribed versus completed sets.
- Actual load and repetitions for each relevant set.
- Actual duration, distance, speed, incline, resistance or other configured metrics, as applicable.
- Optional RIR/RPE, rest duration and notes.
- Skipped sets, substitutions and incomplete exercises.
- Pain, discomfort or technique issues when the user chooses to record them.
- Whether the workout was completed, partially completed or interrupted.
- Progression recommendations and the user's decisions.

Support different recording conventions, including kilograms or pounds and, where relevant, per-side loads or total loads.

Allow users to correct mistakes without erasing the history of meaningful changes. Preserve historical workouts even when the current plan is edited or archived.

Provide a clear distinction between planned, in-progress and completed workouts. Do not require irrelevant fields for a given exercise type.

---

## 8. Results analysis and reporting

Provide useful visualisations and summaries at exercise, workout, plan and overall training levels.

Include, where the available data supports them:

- Load and repetition trends.
- Progression history for each exercise.
- Working-set volume and total training volume.
- Personal records and best performances.
- Estimated strength trends.
- Progress towards repetition targets.
- Load-increase frequency and outcomes.
- Planned versus completed training.
- Training consistency and adherence.
- Exercises showing stagnation or declining performance, only where a relevant progression metric exists.
- Comparisons between training periods.
- Distribution of exercises and training volume across muscle groups.
- Duration, distance, speed and incline trends for relevant cardio exercises.
- Completion rates for fixed or non-progressive exercises.

Allow filtering by date range, exercise, plan, training goal and other relevant dimensions.

Clearly distinguish actual values, derived metrics and estimates. Explain metric definitions and avoid misleading comparisons when exercises, equipment, ranges or techniques differ.

Do not infer causation from simple performance correlations. Present recommendations as informative decision support, not as definitive diagnoses or guaranteed outcomes.

---

## 9. Data import, export and portability

Users must be able to export and import their data without becoming dependent on a single device or installation.

Support, at minimum:

- Exporting and importing exercise libraries.
- Exporting and importing training plans.
- Exporting and importing workout histories and progression records.
- A complete backup and restoration mechanism.
- A documented, versioned interchange format, preferably JSON.
- CSV export for suitable tabular records and analysis.
- Validation and clear error messages for invalid imports.
- Previewing imported records before committing changes.
- Duplicate detection and configurable conflict resolution.
- Schema-version handling and migration of older exports.
- Preservation of identifiers, timestamps, units and relationships.
- Export and import of relevant metadata and media references.

Define whether imports merge with existing data or replace it. Never silently overwrite user data.

Ensure that exported data can be understood and reused independently of the application's database implementation.

---

## 10. User experience and interface

Prioritise clarity, efficient workflows and a responsive interface.

The Web version should support desktop and mobile browsers. The later Android version should prioritise one-handed operation, large touch targets, quick set entry and minimal navigation during workouts.

Provide:

- A dashboard with the next planned workout and recent progress.
- Exercise library search and filtering.
- Plan creation and editing.
- An active-workout screen.
- Immediate visibility of prescribed versus actual performance.
- Relevant input fields for each exercise's measurement type.
- Clear progression recommendations and their reasons.
- Exercise history and performance charts.
- Import/export and backup controls.
- Settings for units, defaults and progression preferences.
- Accessible controls, useful validation and meaningful empty states.

Avoid excessive data entry, unnecessary confirmation steps and visual clutter. Use sensible defaults while allowing users to customise important training parameters.

---

## 11. Architecture and quality requirements

Propose the technology stack only after analysing the project context and user requirements.

Prioritise:

- Maintainable and well-tested code.
- A clear separation between presentation, domain logic and persistence.
- A progression engine that can be tested independently of the interface.
- A flexible measurement model with explicit units and validation.
- Separate exercise definitions, plan prescriptions and actual workout records.
- Reliable storage and explicit data migrations.
- Reusable exercise and training-plan models.
- Security, privacy and appropriate data protection.
- Responsive Web design.
- A practical path to Android without premature architectural complexity.
- Automated unit, integration and end-to-end tests where appropriate.
- Accessible interfaces and good error handling.
- Documentation of setup, architecture, data formats and decisions.

Avoid unnecessary infrastructure and abstractions for an MVP. Justify significant architectural decisions and identify trade-offs.

---

## 12. Testing and acceptance criteria

The Web MVP is acceptable only when the agreed core workflows work end to end.

At minimum, verify that:

1. Users can create, edit and reuse exercises.
2. Exercises can use different measurement types and units.
3. Users can create, modify and execute training plans.
4. Every prescribed set can be recorded independently where applicable.
5. Double progression follows the configured rules.
6. Load increases are recommended only when all required conditions are satisfied.
7. Incomplete sessions and manual overrides are handled correctly.
8. Fixed exercises can be recorded repeatedly without generating unwanted progression recommendations.
9. A treadmill warm-up prescribed for 5 minutes can be completed repeatedly without being flagged as stalled or recommended for progression when progression is disabled.
10. A treadmill exercise configured for duration progression can generate recommendations when its rules are satisfied.
11. Exercises using distance, duration, speed or incline record and analyse the relevant metrics correctly.
12. Historical records remain meaningful after plan changes.
13. Analysis uses actual recorded data and documented formulas.
14. Import/export round-trips preserve supported data correctly.
15. Invalid imports and conflicting records are handled safely.
16. The interface works on desktop and mobile browsers.
17. The application can be installed, configured, tested and run using documented instructions.

Create automated tests for boundary conditions, missing data, incomplete workouts, load increments, changing repetition ranges, exercise substitutions, non-progressive exercises, different measurement units and historical records.

---

## 13. Scope management and optional features

Keep the MVP focused on reliable training management, configurable exercise measurements, progression, workout logging, analysis and data portability.

Identify optional features separately, for example:

- Accounts and cloud synchronisation.
- Offline-first operation.
- Rest timers and workout reminders.
- Training templates and sharing.
- Wearable integration.
- Personalised recommendations.
- Advanced fatigue and plateau analysis.
- Body measurements and progress photographs.
- AI-assisted training analysis.

Do not implement optional features automatically. Ask whether significant additions should be included and explain their benefits, costs and implications.

Maintain a concise decision log and update requirements and the implementation plan when decisions change.

---

## 14. Immediate next action

Start with Phase 1 only.

Inspect the available project context, analyse the requirements, identify the important open questions and propose useful optional features.

Ask the questions needed to establish the product scope and technical direction. Then present a proposed MVP and implementation plan.

Do not begin coding until the user has reviewed and approved the plan.

After approval, implement the Web version first. Do not begin the Android phase until the user has evaluated and explicitly accepted the Web application.
