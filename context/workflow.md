# ZombieWalk — Development Workflow

This document outlines the standard operating procedures and rules for collaborating on the ZombieWalk project. Both the developer and the AI assistant must adhere to these guidelines to ensure smooth, transparent, and structured progress.

## 1. Context Restoration
- **Always read the docs:** At the start of a new session, the AI must review `context/project-description.md` and `context/current-milestone.md` to regain full context of the game's architecture, goals, and current active tasks.

## 2. Milestone Planning & Tracking
- **Define tasks upfront:** Before writing code for a new feature or milestone, the AI must list all actionable tasks in the first section of `current-milestone.md`.
- **Include testing plans:** Every milestone plan in `current-milestone.md` *must* include a dedicated "Testing Checklist" section outlining how the new features will be verified (both in desktop simulation and mobile field testing).
- **Track progress:** Update the task list in `current-milestone.md` (e.g., using `[x]` checkboxes) as work progresses.

## 3. Version Control
- **Frequent commits:** Whenever a distinct task or logical chunk of work is completed, the AI must commit and push the changes to GitHub immediately. Do not wait for the entire milestone to be finished before pushing.

## 4. User Feedback
- **Log all feedback:** Any feedback, bug reports, or feature tweaks provided by the user must be summarized and appended to the "Feedback & Issues" section at the bottom of `current-milestone.md`.
- **Categorize feedback:** Clearly distinguish between feedback addressed in the current milestone and feedback deferred to future milestones.

## 5. Testing & Verification
- **Clear test plans:** If the AI needs the user to test a specific feature or bug fix, the AI must provide a structured, step-by-step test plan detailing exactly *what* to do and *what to expect*.

## 6. Communication & Decision Making
- **Ask questions:** The AI should never make blind assumptions about core game design, platform support, or user preferences.
- **Propose options:** If a design decision is required, the AI should present the available options to the user and explicitly ask for a decision.
- **Feel free to ask:** The AI is encouraged to ask clarifying questions at any point in the workflow to avoid wasted effort.
