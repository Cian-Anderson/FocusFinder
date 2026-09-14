# FocusFinder

> **An adaptive approach to improving user productivity based on behavioural feedback patterns.**

A local Windows desktop productivity support system that combines behavioural
monitoring, rule-based activity classification, and reinforcement learning to
deliver personalised focus interventions.

[![Final Year Project](https://img.shields.io/badge/Final%20Year%20Project-TU%20Dublin-blue)](./docs/FocusFinder_Final_Report.pdf)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org)
[![Electron](https://img.shields.io/badge/Electron-Desktop-blue.svg)](https://www.electronjs.org)

## What is FocusFinder?

FocusFinder is an **adaptive productivity support system** designed to help users
maintain attention and focus during computer-based work.

The system is particularly aimed at students and people in educational
environments, with an emphasis on supporting users with **ADHD and executive
dysfunction**.

FocusFinder continuously monitors desktop activity, including:

- Active applications
- Window context
- Idle behaviour
- Task switching

This activity is classified into behavioural states and stored locally on the
user's device.

Rather than relying on fixed reminders, FocusFinder uses a **Multi-Armed Bandit
reinforcement learning model** to adapt the timing and strategy of interventions
based on previous user responses and subsequent behaviour.

The aim is to move beyond passive productivity tracking towards a system that
can respond to changes in user behaviour over time.

---

## The Problem

Many productivity tools provide useful tracking, timers, gamification, or
distraction blocking, but their feedback strategies are often fixed.

Research conducted for this project identified a gap in systems that can:

- Observe behaviour automatically
- Respond to changing attention patterns
- Adjust feedback based on previous outcomes
- Reduce reliance on the user manually interpreting productivity statistics

FocusFinder explores a behaviour-responsive approach where feedback can adapt
over time based on recorded interaction and behavioural outcomes.

---

## Core Features

### Activity Monitoring

FocusFinder runs a continuous monitoring process that samples desktop activity
at **60-second intervals**.

The monitoring system records:

- Active application
- Active window title
- Idle duration
- Activity state
- Task-switching behaviour

Monitoring is handled through a Python backend using system-level libraries such
as `pygetwindow`, `pynput`, `psutil`, and `pywin32`.

### Behaviour Classification

Recorded activity is interpreted using a **rule-based classification system**.

The classifier evaluates application names, window titles, browser context, and
other activity information to categorise behaviour as:

- Focused
- Neutral
- Distracted

The system also includes an ADHD-focused interpretation layer for identifying
behavioural patterns such as:

- Hyperfocus
- Rapid task switching
- Task avoidance
- Time-of-day changes in behaviour

The activity classifier itself is heuristic and does **not** use machine
learning. Reinforcement learning is used separately for adaptive intervention
selection.

### Adaptive Reminder System

The central adaptive component is a **contextual Multi-Armed Bandit using an
Upper Confidence Bound (UCB) strategy**.

At each decision point, the model evaluates available reminder strategies using:

- Historical reward
- Exploration value
- Current behavioural context

The system balances:

**Exploration** — testing strategies that have been used less frequently

**Exploitation** — favouring strategies that have previously produced stronger
outcomes

Available strategies include:

- Soft nudges with longer intervals
- Focus prompts
- Break prompts
- Reminder suppression

This allows FocusFinder to change how it responds rather than repeatedly
delivering the same fixed reminder.

### Feedback-Driven Learning

The adaptive process follows a continuous feedback loop:

```text
Activity Monitoring
        ↓
Behaviour Classification
        ↓
Behavioural Context
        ↓
Multi-Armed Bandit
        ↓
Intervention Selection
        ↓
Reminder Delivered
        ↓
User Response
        ↓
Subsequent Behaviour
        ↓
Reward Signal
        ↓
Future Decisions Updated
        ↺
```

Immediate user responses provide one source of feedback, while subsequent
behaviour is also considered when evaluating the effectiveness of an
intervention.

This allows the system to consider whether a reminder is associated with
sustained focus rather than evaluating success only through a button press or
acknowledgement.

---

## Dashboard and Behavioural Insights

FocusFinder includes a React and TypeScript desktop interface for presenting
recorded activity and behavioural patterns.

### Overview Dashboard

The Overview dashboard provides a high-level summary of user activity,
including:

- Focus score
- Hourly behaviour
- Most-used applications
- Focus and distraction patterns
- Recent activity

### ADHD Metrics

The ADHD Metrics view focuses on patterns relevant to attention regulation,
including:

- Hyperfocus duration
- Task-switching frequency
- Distraction patterns
- Time-of-day performance

### Reports Centre

The Reports Centre provides longer-term summaries of recorded activity.

Reports can be generated locally using Electron's PDF functionality, allowing
users to review or retain structured summaries of their behaviour.

### Adaptive Notifications

Interventions are displayed through a dedicated desktop notification interface.

Prompts can be delivered visually and through auditory output using the
**Web Speech API**, reducing reliance on constant visual attention.

---

## Architecture

FocusFinder is implemented as a local desktop application combining an
Electron/React frontend with a Python backend.

```text
┌────────────────────────────────────┐
│          Electron Desktop          │
│                                    │
│  Application lifecycle             │
│  Window management                 │
│  Notifications                     │
│  PDF generation                    │
│  IPC                               │
└─────────────────┬──────────────────┘
                  │
          ┌───────┴────────┐
          │                │
          ▼                ▼
┌──────────────────┐   ┌──────────────────────┐
│ React +          │   │ Python Backend       │
│ TypeScript       │   │                      │
│                  │   │ Flask API            │
│ Dashboards       │   │ Activity Monitoring  │
│ Visualisations   │   │ Classification       │
│ User Controls    │   │ Bandit System        │
│ Notifications    │   │ Database Access      │
└─────────┬────────┘   └──────────┬───────────┘
          │                       │
          └──────── HTTP ─────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ SQLite          │
                         │ SQLAlchemy ORM  │
                         │                 │
                         │ Optional        │
                         │ SQLCipher       │
                         └─────────────────┘
```

The Electron main process launches the Python backend as a child process. The
React frontend communicates with the backend through a local Flask API, while
Electron handles desktop-specific functionality such as notifications,
application lifecycle management, IPC, and report generation.

For a deeper technical breakdown, see
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Technology Stack

| Area                         | Technology                           |
| ---------------------------- | ------------------------------------ |
| Desktop Application          | Electron                             |
| Frontend                     | React + TypeScript                   |
| Backend                      | Python                               |
| Local API                    | Flask                                |
| Database                     | SQLite                               |
| ORM                          | SQLAlchemy                           |
| Optional Database Encryption | SQLCipher                            |
| Encryption Key Protection    | Windows DPAPI                        |
| Activity Monitoring          | pygetwindow, pynput, psutil, pywin32 |
| Adaptive Decision-Making     | Contextual Multi-Armed Bandit / UCB  |
| Audio Prompts                | Web Speech API                       |
| Report Generation            | Electron `printToPDF()`              |

---

## Privacy-Focused Design

FocusFinder was designed around a **local-first architecture** because activity
monitoring can involve sensitive behavioural information.

All core activity data remains on the user's device.

The system:

- Uses local SQLite storage
- Does not require cloud storage
- Does not transmit activity data to an external service
- Restricts application communication to the local machine
- Supports optional SQLCipher database encryption
- Protects encryption keys using the Windows Data Protection API (DPAPI)
- Saves generated reports locally

If SQLCipher is unavailable, the application can continue using standard SQLite.

Keeping processing and storage local was an intentional design decision to
prioritise privacy over features such as cloud synchronisation.

---

## Research-Informed Design

The development of FocusFinder was informed by research across:

- ADHD and executive dysfunction
- Attention regulation
- Reward processing
- Behavioural psychology
- Feedback timing and tone
- Digital intervention design
- Reinforcement learning
- Human-computer interaction

This research influenced both the adaptive model and the way interventions are
presented to users.

The reminder system uses a predefined library of controlled prompts rather than
dynamically generated text. This was chosen to provide predictable and
supportive feedback while avoiding inconsistent or potentially inappropriate
messaging.

---

## Testing

FocusFinder was tested at three levels:

### Unit Testing

Automated backend tests were used to validate individual components including:

- Idle detection
- Active-window tracking
- Activity recording
- Rule-based classification
- Browser and keyword heuristics
- Database persistence
- Multi-Armed Bandit action selection
- Reward processing
- Repeated adaptation cycles
- Reminder content validation
- Key backend performance operations

### Integration Testing

Integration testing validated the flow of information between:

```text
Monitoring
    ↓
Classification
    ↓
Storage
    ↓
Adaptive Decision-Making
    ↓
Reminder Delivery
    ↓
Feedback
```

This was used to verify that captured activity moves correctly through the
system and that adaptive decisions and resulting interactions are recorded.

### End-to-End Validation

The complete monitoring and feedback loop was also tested using the live API.

Repeated decision-and-feedback cycles were used to verify that reminder
selection changes in response to recorded rewards.

User-interface interactions that were not practical to automate were validated
manually.

### Testing Limitations

Testing was strongest across the backend and adaptive pipeline.

The project had more limited coverage in:

- Automated frontend testing
- Formal usability evaluation
- Full-system CPU and memory profiling
- Large-scale user testing

These remain areas for future evaluation.

---

## Evaluation

FocusFinder was evaluated using automated testing, integration testing,
behavioural logs, and extended real-world use.

During development, the completed system recorded **more than 90 hours of
real-world usage**.

Across this period, the adaptive system demonstrated the intended
**exploration and exploitation behaviour**, adjusting reminder selection in
response to recorded outcomes.

The evaluation observed that the system progressively favoured reminder
strategies associated with more sustained focus and adapted its behaviour based
on the individual user's recorded patterns.

Recorded focus levels also improved during extended use, providing evidence that
the approach can influence behaviour within the evaluated individual context.

The application's visualisations additionally highlighted patterns such as:

- Time-of-day performance
- Sources of distraction
- Task-switching behaviour

These results demonstrate that the adaptive mechanism operates as intended.

### Evaluation Limitations

The evaluation was conducted primarily in a **single-user context** and over a
limited period.

The results therefore cannot establish that FocusFinder will produce the same
effects for a broader population.

In particular:

- Effectiveness across different users has not been established
- Long-term improvements in focus have not been validated
- Responses to interventions may vary significantly between users
- The current system relies on a fixed library of predefined prompts

A broader and longer-term study would be required before making general claims
about FocusFinder's effectiveness.

---

## Project Scope

FocusFinder was developed as my **Final Year Project for the BSc in Computer
Science at Technological University Dublin (TU857)**.

The project covered:

- Literature review and technology research
- Requirements gathering and analysis
- System modelling
- Architecture and design
- Activity-monitoring implementation
- Behaviour classification
- Local database design
- Reinforcement learning
- Adaptive intervention delivery
- Desktop and frontend development
- Privacy and security design
- Automated and manual testing
- System evaluation
- Technical documentation
- Desktop application packaging and deployment

The project's primary aim was to design and implement an adaptive productivity
support system capable of monitoring user behaviour and delivering personalised
interventions.

The final report concluded that all defined project objectives were achieved
through the design, implementation, and evaluation of FocusFinder.

For the complete research, requirements, design process, implementation,
testing, evaluation, and references, see the
[Final Project Report](./docs/FocusFinder_Final_Report.pdf).

---

## Deployment

The final FocusFinder system was packaged as a **standalone Windows desktop
application**.

The release package contains the core application components, including:

- The Electron desktop shell
- The compiled React frontend
- The Python backend
- Required runtime dependencies

This means an end user can install and run the finished application without
manually installing Python or Node.js or starting the frontend and backend as
separate processes.

When FocusFinder launches, the Electron main process automatically starts and
manages the Python backend internally.

### Windows Installer

### [Download FocusFinder for Windows]([YOUR-RELEASE-URL](https://github.com/Cian-Anderson/FocusFinder/releases/tag/v1.0.0))

The packaged Windows installer includes the Electron interface, compiled React
frontend, Python backend, and required runtime dependencies.

The installer is intended for users who want to run the finished application.
The source-code instructions below are intended for developers who want to
inspect, modify, or rebuild the project.

> **Note:** If the release executable is unsigned, Windows SmartScreen may show
> a warning when launching it for the first time.

### Building the Release

The Windows release is produced by:

1. Building the React frontend with Vite
2. Packaging the Electron desktop application
3. Bundling the Python backend and its required dependencies
4. Generating the Windows installer using `electron-builder` with an NSIS target

The relevant build configuration and packaging scripts are included with the
source code.

---

## Running from Source

Running FocusFinder from source is intended for development, testing, or code
inspection.

### Requirements

- Windows 10 or newer
- Python 3.10+
- Node.js 18+
- npm

### Automated Development Startup

From the repository root:

```powershell
.\start.ps1
```

The development startup process launches the Python backend and Electron desktop
interface.

For full installation instructions, development setup, configuration, and
troubleshooting, see:

### [Quick Start Guide](./QUICK_START.md)

---

## Documentation

| Document                                                       | Purpose                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| [README.md](./README.md)                                       | Project overview                                               |
| [QUICK_START.md](./QUICK_START.md)                             | Development installation and troubleshooting                   |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                           | Detailed system architecture and data flow                     |
| [TECH_STACK.md](./activity-monitoring-component/TECH_STACK.md) | Technical dependencies and implementation details              |
| [Final Project Report](./docs/FocusFinder_Final_Report.pdf)    | Full research, design, implementation, testing, and evaluation |

---

## Future Work

The final project evaluation identified five main areas for future development:

- **Large-scale user evaluation** — test the system with a broader and more
  diverse group of users over an extended period.

- **Enhanced adaptive model** — expand the Multi-Armed Bandit with additional
  contextual information to support more informed decisions.

- **Dynamic prompt generation** — move beyond the current fixed prompt library
  towards more flexible or evolving interventions.

- **Long-term behavioural analysis** — investigate whether observed
  improvements in focus remain over longer periods and as user behaviour
  changes.

- **User-interface refinement** — continue improving the clarity, usability,
  and interpretability of behavioural visualisations.

---

## Acknowledgements

I would like to thank **Dr. Svetlana Hensman, Brian Gillespie,
Ciarán O'Driscoll, and Sean O'Leary** for their guidance and support throughout
the Final Year Project process.

