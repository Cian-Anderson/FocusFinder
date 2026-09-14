// ADHD-Tailored Reminder System
// Based on research: hyperfocus management, time blindness, task initiation, emotional regulation

export interface Reminder {
  id: string;
  type:
  | "break"
  | "hydration"
  | "posture"
  | "task-switch"
  | "hyperfocus"
  | "time-check"
  | "reward"
  | "movement"
  | "focus-prep";
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  duration?: number; // How long to show (ms)
  windowMode?: "subtle" | "standard" | "assertive";
  currentApp?: string; // Current application name
  currentActivity?: string; // Current activity classification
  enableTTS?: boolean; // Enable text-to-speech for this reminder (default: true)
}

export type ReminderState =
  | "on_break"
  | "hyperfocus"
  | "normal_focus"
  | "drifting_idle"
  | "high_task_switching";

export interface ReminderContext {
  focusMinutes?: number; // continuous focus time in minutes
  taskSwitches?: number; // recent app/window switches count
  idleSeconds?: number; // current idle seconds
  currentTask?: string; // app or window title
  currentActivity?: string; // focused / productive / neutral / distracted
  timeOfDay?: "morning" | "midday" | "afternoon" | "evening";
}

const withDefaultDuration = (
  reminder: Omit<Reminder, "duration">,
): Reminder => ({
  ...reminder,
  duration:
    reminder.priority === "high"
      ? 20000
      : reminder.priority === "medium"
        ? 15000
        : 13000,
});

export const ADHD_REMINDERS: Reminder[] = ([
  // HYPERFOCUS
  {
    id: "hyp01",
    type: "hyperfocus",
    title: "Hyperfocus Check-In",
    message:
      "Quick check: what time is it, and do you still want to be doing this? Set an exit timer, just in case.",
    priority: "high",
  },
  {
    id: "hyp02",
    type: "hyperfocus",
    title: "90-Minute Reset",
    message:
      "You've been locked in for a while. Stand up, breathe, and decide: continue, switch, or take five minutes.",
    priority: "high",
  },
  {
    id: "hyp03",
    type: "hyperfocus",
    title: "Body Needs Check",
    message:
      "Quick scan: shoulders, jaw, bladder, water. Meet one need now, then return with less friction and more focus.",
    priority: "high",
  },
  {
    id: "hyp04",
    type: "hyperfocus",
    title: "Save Your Momentum",
    message:
      "Take a 2-minute break before you fade. Move, sip water, and write the next step on a sticky note.",
    priority: "high",
  },
  {
    id: "hyp05",
    type: "hyperfocus",
    title: "Stop-and-Plan Moment",
    message:
      "Pause and look at the clock. If this is not the priority, capture the thought and choose the right task.",
    priority: "high",
  },
  {
    id: "hyp06",
    type: "hyperfocus",
    title: "Gentle Exit Ramp",
    message:
      "Before you keep going, set a 15-minute timer as an exit ramp. When it rings, reassess kindly.",
    priority: "high",
  },

  // BREAK
  {
    id: "brk01",
    type: "break",
    title: "Microbreak, Big Payoff",
    message:
      "Take 60 seconds: eyes off screen, slow exhale, then stretch your hands and shoulders. Come back refreshed.",
    priority: "medium",
  },
  {
    id: "brk02",
    type: "break",
    title: "Five-Minute Reset",
    message:
      "Step away for five minutes. Walk, get daylight if possible, and let your brain defrag before the next block.",
    priority: "medium",
  },
  {
    id: "brk03",
    type: "break",
    title: "20-20-20 Eyes",
    message:
      "For eye comfort: look 6 metres away for 20 seconds, then blink slowly. Repeat after your next 20 minutes.",
    priority: "medium",
  },
  {
    id: "brk04",
    type: "break",
    title: "Tiny Break, Now",
    message:
      "Pause. Stand up, roll your shoulders, and unclench your jaw. Two minutes now prevents the slump later.",
    priority: "medium",
  },
  {
    id: "brk05",
    type: "break",
    title: "Reset Your Attention",
    message:
      "If you feel stuck, stop for one minute and breathe. Name the feeling, then pick one small next action.",
    priority: "medium",
  },
  {
    id: "brk06",
    type: "break",
    title: "Break With Purpose",
    message:
      "Choose a recovery activity: water, stretch, or tidy one surface. Keep it short, then restart with a timer.",
    priority: "medium",
  },

  // HYDRATION
  {
    id: "hyd01",
    type: "hydration",
    title: "Three-Sip Top-Up",
    message:
      "Take three sips of water. Put the bottle within reach so future sips happen automatically.",
    priority: "medium",
  },
  {
    id: "hyd02",
    type: "hydration",
    title: "Hydrate, Then Continue",
    message:
      "Before starting the next task, drink some water. Even mild dehydration can make focus feel harder.",
    priority: "medium",
  },
  {
    id: "hyd03",
    type: "hydration",
    title: "Water While Waiting",
    message:
      "While something loads or saves, take a sip. Pairing water with a cue makes it easier to remember.",
    priority: "low",
  },
  {
    id: "hyd04",
    type: "hydration",
    title: "Hydration Check-In",
    message:
      "Notice your mouth and head: dry or foggy? A quick drink now can improve energy and attention.",
    priority: "medium",
  },
  {
    id: "hyd05",
    type: "hydration",
    title: "Refill the Bottle",
    message:
      "If your bottle is empty, refill it now. Visible water reduces friction and supports steady sipping.",
    priority: "low",
  },
  {
    id: "hyd06",
    type: "hydration",
    title: "Tea Counts Too",
    message:
      "If water feels boring, make tea or add lemon. Enjoy the ritual, hydration plus a brief reset.",
    priority: "low",
  },

  // POSTURE
  {
    id: "pos01",
    type: "posture",
    title: "Shoulders Down, Breathe",
    message:
      "Drop your shoulders, unclench your jaw, and place both feet flat. Comfort helps you stay with the task.",
    priority: "low",
  },
  {
    id: "pos02",
    type: "posture",
    title: "Neutral Spine Check",
    message:
      "Sit tall, hips back, screen at eye height. Small adjustments reduce aches that quietly drain attention.",
    priority: "low",
  },
  {
    id: "pos03",
    type: "posture",
    title: "Hand and Wrist Reset",
    message:
      "Relax your grip on the mouse or trackpad. Shake out your hands for 10 seconds to reduce tension.",
    priority: "low",
  },
  {
    id: "pos04",
    type: "posture",
    title: "Posture Microbreak",
    message:
      "Stand up, stretch your chest, then sit back with elbows near 90 degrees. Your future neck will thank you.",
    priority: "low",
  },
  {
    id: "pos05",
    type: "posture",
    title: "Desk Ergonomics Moment",
    message:
      "Bring the screen closer, not your head. Adjust distance so you are not leaning forward without noticing.",
    priority: "low",
  },
  {
    id: "pos06",
    type: "posture",
    title: "Release the Tension",
    message:
      "Check: tongue resting, teeth apart, eyes soft. A relaxed face can lower stress and improve clarity.",
    priority: "low",
  },

  // MOVEMENT
  {
    id: "mov01",
    type: "movement",
    title: "Quick Movement Boost",
    message:
      "Stand and walk for two minutes. Even brief movement can sharpen attention and reduce sluggishness.",
    priority: "medium",
  },
  {
    id: "mov02",
    type: "movement",
    title: "Stairs or Stretch?",
    message:
      "Pick one: climb a flight of stairs, do ten squats, or stretch. Choose the easiest option and start.",
    priority: "medium",
  },
  {
    id: "mov03",
    type: "movement",
    title: "Move Between Blocks",
    message:
      "Before your next focus block, move your body. Pairing movement with transitions helps your brain switch gears.",
    priority: "medium",
  },
  {
    id: "mov04",
    type: "movement",
    title: "Reset With Daylight",
    message:
      "If possible, step outside for one minute and look at the sky. Light and movement can lift alertness.",
    priority: "low",
  },
  {
    id: "mov05",
    type: "movement",
    title: "Desk-to-Door Loop",
    message:
      "Do a quick loop: stand, walk to the door, touch the frame, return. Small movement can restart focus.",
    priority: "low",
  },
  {
    id: "mov06",
    type: "movement",
    title: "Stretch While Waiting",
    message:
      "During a pause, loading, exporting, compiling, stand and stretch your calves and hip flexors. Use idle time well.",
    priority: "low",
  },

  // TASK SWITCHING
  {
    id: "sw01",
    type: "task-switch",
    title: "One Tab Rule",
    message:
      "If you are opening a new tab, write the reason first. Then decide: is it for this task?",
    priority: "medium",
  },
  {
    id: "sw02",
    type: "task-switch",
    title: "Park It, Continue",
    message:
      "Brain hopping? Park the other ideas in a quick list, then do 10 minutes on one chosen task.",
    priority: "medium",
  },
  {
    id: "sw03",
    type: "task-switch",
    title: "Switching Cost Reminder",
    message:
      "Every switch has a cost. Choose one task, close the extras, and set a 15-minute timer to stay put.",
    priority: "high",
  },
  {
    id: "sw04",
    type: "task-switch",
    title: "Return Ticket",
    message:
      "Before you switch tasks, leave a return ticket: write the next step, so coming back is easy.",
    priority: "medium",
  },
  {
    id: "sw05",
    type: "task-switch",
    title: "Distraction Audit",
    message:
      "Ask: what pulled you away? Remove one trigger, mute, close, or move it, then restart where you left off.",
    priority: "medium",
  },
  {
    id: "sw06",
    type: "task-switch",
    title: "Choose the Next Block",
    message:
      "Pick the most important task for the next 20 minutes. Everything else can wait; you are not deleting it.",
    priority: "medium",
  },

  // TIME AWARENESS
  {
    id: "time01",
    type: "time-check",
    title: "Clock Anchor",
    message:
      "Check the time, then name your next milestone. Set a timer so time stays visible, not abstract.",
    priority: "medium",
  },
  {
    id: "time02",
    type: "time-check",
    title: "Next Appointment Scan",
    message:
      "What is coming up today? Look at your calendar for 30 seconds, then decide the next small step.",
    priority: "medium",
  },
  {
    id: "time03",
    type: "time-check",
    title: "Time Budget Check",
    message:
      "How long do you have? Choose a task that fits the time left, and stop when the timer ends.",
    priority: "high",
  },
  {
    id: "time04",
    type: "time-check",
    title: "Midpoint Reminder",
    message:
      "Halfway through your session, pause and reassess. Are you on track, or do you need to adjust?",
    priority: "medium",
  },
  {
    id: "time05",
    type: "time-check",
    title: "Time Blindness Nudge",
    message:
      "If time feels slippery, add a visible timer. External cues make it easier to switch tasks intentionally.",
    priority: "medium",
  },
  {
    id: "time06",
    type: "time-check",
    title: "End-of-Block Check",
    message:
      "When this block ends, write one sentence: what did you finish, and what is the next step?",
    priority: "medium",
  },

  // REWARD
  {
    id: "rew01",
    type: "reward",
    title: "Celebrate the Win",
    message:
      "You made progress, nice. Mark it done, then give yourself a small reward before starting the next step.",
    priority: "low",
  },
  {
    id: "rew02",
    type: "reward",
    title: "Immediate Reward Loop",
    message:
      "Finish one tiny task, then take a mini reward: tea, stretch, or one song. Immediate rewards build momentum.",
    priority: "low",
  },
  {
    id: "rew03",
    type: "reward",
    title: "Progress Snapshot",
    message:
      "Write one line about what you achieved in the last 30 minutes. Noticing progress increases motivation.",
    priority: "low",
  },
  {
    id: "rew04",
    type: "reward",
    title: "Kind Self-Talk",
    message:
      "Swap I should for I choose. A kinder tone reduces stress and makes restarting easier after a wobble.",
    priority: "low",
  },
  {
    id: "rew05",
    type: "reward",
    title: "Done List Boost",
    message:
      "Add what you just did to a done list. Small wins keep motivation alive when the goal feels far.",
    priority: "low",
  },
  {
    id: "rew06",
    type: "reward",
    title: "Permission to Rest",
    message:
      "You have earned a short break. Resting on purpose helps you return without guilt or doom-scrolling.",
    priority: "low",
  },

  // FOCUS PREP
  {
    id: "prep01",
    type: "focus-prep",
    title: "Define the First Step",
    message:
      "Before you begin, write the tiniest next action. Clear starts reduce procrastination and make focus feel possible.",
    priority: "medium",
  },
  {
    id: "prep02",
    type: "focus-prep",
    title: "Set Up Success",
    message:
      "Open only what you need, silence distractions, and set a 15-minute timer. Setup is the easiest productivity hack.",
    priority: "medium",
  },
  {
    id: "prep03",
    type: "focus-prep",
    title: "Two-Minute Launch",
    message:
      "Commit to just two minutes on the task. Starting is often the hard part; momentum can carry you.",
    priority: "medium",
  },
  {
    id: "prep04",
    type: "focus-prep",
    title: "If-Then Plan",
    message:
      "If you feel resistance, then do the smallest step for 60 seconds. You can stop after, but start now.",
    priority: "medium",
  },
  {
    id: "prep05",
    type: "focus-prep",
    title: "Clear the Runway",
    message:
      "Close anything unrelated, clear one clutter hotspot, and put your goal in view. Less visual noise helps focus.",
    priority: "medium",
  },
  {
    id: "prep06",
    type: "focus-prep",
    title: "Start With a Timer",
    message:
      "Pick one task and set a timer for 25 minutes. Time-boxing protects you from drifting or over-polishing.",
    priority: "medium",
  },
] as Omit<Reminder, "duration">[]).map(withDefaultDuration);

// Get a random reminder based on priority weights
export function getRandomReminder(): Reminder {
  const now = new Date().getHours();

  // Filter by time of day
  let pool = [...ADHD_REMINDERS];

  // Evening reminders (after 6pm)
  if (now >= 18) {
    pool = pool.filter(
      (r) =>
        r.type === "reward" ||
        r.type === "time-check" ||
        r.id.includes("evening"),
    );
  }

  // Weight by priority: high = 3x, medium = 2x, low = 1x
  const weighted: Reminder[] = [];
  pool.forEach((reminder) => {
    const weight =
      reminder.priority === "high" ? 3 : reminder.priority === "medium" ? 2 : 1;
    for (let i = 0; i < weight; i++) {
      weighted.push(reminder);
    }
  });

  const randomIndex = Math.floor(Math.random() * weighted.length);
  return weighted[randomIndex];
}

// Get reminders by type
export function getRemindersByType(type: Reminder["type"]): Reminder[] {
  return ADHD_REMINDERS.filter((r) => r.type === type);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function detectReminderState(context: ReminderContext): ReminderState {
  const classification = (context.currentActivity || "neutral").toLowerCase();
  const switches = context.taskSwitches || 0;
  const idleSeconds = context.idleSeconds || 0;

  if (classification === "neutral" && idleSeconds >= 180) {
    return "on_break";
  }
  if ((context.focusMinutes || 0) >= 90 || classification === "focused") {
    return "hyperfocus";
  }
  if (switches >= 4) {
    return "high_task_switching";
  }
  if (classification === "distracted" || idleSeconds >= 120) {
    return "drifting_idle";
  }
  return "normal_focus";
}

export function getRemindersForState(state: ReminderState): Reminder[] {
  switch (state) {
    case "on_break":
      return [
        ...getRemindersByType("break"),
        ...getRemindersByType("hydration"),
        ...getRemindersByType("movement"),
      ];
    case "hyperfocus":
      return [
        ...getRemindersByType("hyperfocus"),
        ...getRemindersByType("break"),
        ...getRemindersByType("time-check"),
      ];
    case "high_task_switching":
      return [
        ...getRemindersByType("task-switch"),
        ...getRemindersByType("focus-prep"),
        ...getRemindersByType("time-check"),
      ];
    case "drifting_idle":
      return [
        ...getRemindersByType("focus-prep"),
        ...getRemindersByType("time-check"),
        ...getRemindersByType("movement"),
      ];
    case "normal_focus":
    default:
      return [
        ...getRemindersByType("focus-prep"),
        ...getRemindersByType("reward"),
        ...getRemindersByType("hydration"),
      ];
  }
}

export function getContextualReminder(context: ReminderContext): Reminder {
  const state = detectReminderState(context);

  if (state === "hyperfocus") {
    return pickRandom(getRemindersForState("hyperfocus"));
  }

  if (state === "high_task_switching") {
    return pickRandom(getRemindersForState("high_task_switching"));
  }

  if (state === "drifting_idle") {
    return pickRandom(getRemindersForState("drifting_idle"));
  }

  if (state === "on_break") {
    return pickRandom(getRemindersForState("on_break"));
  }

  // Hyperfocus detected
  if (context.focusMinutes && context.focusMinutes >= 90) {
    const hyperfocusReminders = getRemindersByType("hyperfocus");
    return pickRandom(hyperfocusReminders);
  }

  // High task switching
  if (context.taskSwitches && context.taskSwitches >= 4) {
    const switches = getRemindersByType("task-switch");
    return pickRandom(switches);
  }

  // Idle time: if user has been idle for a bit, suggest re-engage
  if (typeof context.idleSeconds === "number") {
    if (context.idleSeconds >= 300) {
      // 5+ minutes
      const options = [
        ...getRemindersByType("focus-prep"),
        ...getRemindersByType("time-check"),
      ];
      return pickRandom(options);
    }
    if (context.idleSeconds >= 120) {
      // 2+ minutes
      const options = getRemindersByType("time-check");
      return pickRandom(options);
    }
  }

  // Current task heuristics: if likely-distracting app/site, nudge time awareness
  if (context.currentTask) {
    const t = context.currentTask.toLowerCase();
    const distractors = [
      "youtube",
      "tiktok",
      "discord",
      "twitter",
      "x.com",
      "reddit",
      "instagram",
      "steam",
      "netflix",
      "prime video",
      "spotify",
    ];
    if (distractors.some((k) => t.includes(k))) {
      const options = [
        ...getRemindersByType("time-check"),
        ...getRemindersByType("task-switch"),
      ];
      return pickRandom(options);
    }
  }

  // Evening time
  if (context.timeOfDay === "evening") {
    const eveningReminders = ADHD_REMINDERS.filter(
      (r) => r.type === "reward" || r.type === "time-check",
    );
    return pickRandom(eveningReminders);
  }

  // Default: random
  return getRandomReminder();
}
