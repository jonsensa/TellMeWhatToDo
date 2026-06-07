/* ==========================================================================
   TellMeWhatToDo - Core Application Logic
   ========================================================================== */

/**
 * APPLICATION STATE MANAGEMENT
 * We maintain a single source of truth for the application's data.
 * The state is loaded from localStorage on startup and saved back whenever it changes.
 */
let state = {
    tasks: [],       // Array of Task: { id, name, duration, priority, energy, location, category, requiresTimer, createdAt }
    history: [],     // Array of HistoryItem: { id, taskId, name, duration, category, completedAt, method }
    weeklyTasks: [], // Array of WeeklyTask: { id, name, completed }
    monthlyGoals: [],// Array of MonthlyGoal: { id, name, date }
    settings: {
        username: "Productive User",
        dailyFocusTarget: 2.0 // in hours
    },
    currentStreak: 0,
    bestStreak: 0,
    
    // Transient session state (non-persistent)
    activeView: "dashboard",
    suggestedTask: null,
    focusedTask: null,
    timer: {
        intervalId: null,
        timeLeft: 0,     // in seconds
        duration: 0,     // in seconds
        isPaused: true,
        startedAt: null,
        isQuitLocked: false,
        quitLockTimeLeft: 0,
        quitLockIntervalId: null
    }
};

// Default preset tasks to give the user a quick starting point
const PRESET_TASKS = [
    { id: "preset-1", name: "Organize desktop files & clean keyboard", duration: 15, priority: "medium", energy: "low", location: "home", category: "Life", requiresTimer: true, createdAt: Date.now() - 600000 },
    { id: "preset-2", name: "Read a technical blog post or newsletter", duration: 20, priority: "low", energy: "medium", location: "anywhere", category: "Study", requiresTimer: true, createdAt: Date.now() - 500000 },
    { id: "preset-3", name: "Write code for core functional modules", duration: 60, priority: "high", energy: "high", location: "work", category: "Work", requiresTimer: true, createdAt: Date.now() - 400000 },
    { id: "preset-4", name: "Full-body stretching & posture correction", duration: 10, priority: "medium", energy: "low", location: "anywhere", category: "Health", requiresTimer: false, createdAt: Date.now() - 300000 },
    { id: "preset-5", name: "Review team pull requests and issues", duration: 30, priority: "high", energy: "medium", location: "work", category: "Work", requiresTimer: true, createdAt: Date.now() - 200000 },
    { id: "preset-6", name: "Stock pantry items & run minor errands", duration: 45, priority: "low", energy: "medium", location: "errands", category: "Errands", requiresTimer: false, createdAt: Date.now() - 100000 }
];

// LocalStorage Keys
const STORAGE_KEY = "tellmewhattodo_state";

/**
 * INITIALIZATION & STORAGE ACTIONS
 */
function initApp() {
    loadStateFromStorage();
    setupEventListeners();
    
    // Load theme setting
    const savedTheme = localStorage.getItem("tellmewhattodo_theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
    } else {
        document.body.classList.remove("light-mode");
    }
    updateThemeToggleUI();

    updateDateDisplay();
    renderAllViews();
    checkAndUpdateStreak();
    
    // Setup recurring Priority Reminders check (every 30 seconds for test responsiveness, equivalent to 3 hours in practice)
    setInterval(checkPriorityTaskReminders, 30000);
}

/**
 * Loads the application state from local storage.
 * If no state exists, we seed it with empty arrays and default values.
 */
function loadStateFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            state.tasks = parsed.tasks || [];
            state.history = parsed.history || [];
            state.weeklyTasks = parsed.weeklyTasks || [];
            state.monthlyGoals = parsed.monthlyGoals || [];
            
            // Merge settings
            state.settings = {
                username: "Productive User",
                dailyFocusTarget: 2.0,
                ...(parsed.settings || {})
            };
            
            state.currentStreak = parsed.currentStreak || 0;
            state.bestStreak = parsed.bestStreak || 0;
        } else {
            // Seed defaults
            state.tasks = [...PRESET_TASKS];
            state.history = [];
            state.weeklyTasks = [];
            state.monthlyGoals = [];
            state.settings = {
                username: "Productive User",
                dailyFocusTarget: 2.0
            };
            saveStateToStorage();
        }
    } catch (e) {
        showToast("Error loading saved data. Resetting to defaults.", true);
        console.error("Storage load error:", e);
    }
}

/**
 * Persists current state fields to localStorage
 */
function saveStateToStorage() {
    try {
        const payload = {
            tasks: state.tasks,
            history: state.history,
            weeklyTasks: state.weeklyTasks,
            monthlyGoals: state.monthlyGoals,
            settings: state.settings,
            currentStreak: state.currentStreak,
            bestStreak: state.bestStreak
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.error("Storage save error:", e);
        showToast("Failed to save changes to browser memory.", true);
    }
}

/**
 * REUSABLE COMPONENTS: Notification Toast & Synthetic Audio Chime
 */
function showToast(message, isError = false) {
    const toast = document.getElementById("toast-notification");
    const textEl = document.getElementById("toast-message");

    textEl.textContent = message;

    if (isError) {
        toast.classList.add("toast-error");
    } else {
        toast.classList.remove("toast-error");
    }

    toast.classList.remove("hidden");

    // Clear any previous timeout if we click repeatedly
    if (toast.timeoutId) clearTimeout(toast.timeoutId);

    toast.timeoutId = setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

/**
 * Plays a premium, synthesized chime when the focus timer completes.
 * Uses Web Audio API to construct sound waves dynamically without dependencies.
 */
function playCompletionChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();

        // Two-tone chime (A5 -> E6) for a bright, positive resolution
        const playTone = (freq, startTime, duration, volume) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, startTime);

            gainNode.gain.setValueAtTime(volume, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        playTone(880, ctx.currentTime, 0.4, 0.15);      // A5
        playTone(1318.51, ctx.currentTime + 0.15, 0.6, 0.12); // E6
    } catch (err) {
        console.warn("Chime synth audio blocked or not supported:", err);
    }
}

/**
 * EVENT LISTENERS SETUP
 */
function setupEventListeners() {
    // Navigation / View Switching
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetView = btn.getAttribute("data-view");
            switchView(targetView);
        });
    });

    // Dashboard Triggers
    document.getElementById("suggest-trigger-btn").addEventListener("click", () => {
        openModal("questionnaire-modal");
    });

    document.getElementById("close-questionnaire-btn").addEventListener("click", () => {
        closeModal("questionnaire-modal");
    });

    document.getElementById("accept-task-btn").addEventListener("click", acceptSuggestedTask);
    document.getElementById("decline-task-btn").addEventListener("click", declineSuggestedTask);

    // Timer Control Triggers
    document.getElementById("timer-play-pause-btn").addEventListener("click", toggleTimer);
    document.getElementById("timer-reset-btn").addEventListener("click", resetTimer);
    document.getElementById("timer-complete-btn").addEventListener("click", completeFocusSession);
    document.getElementById("timer-quit-btn").addEventListener("click", quitFocusSession);

    // Modal Option Buttons (Multi-choice style toggles)
    setupOptionGridToggles("time-options");
    setupOptionGridToggles("energy-options");
    setupOptionGridToggles("location-options");

    // Questionnaire Form Submit
    document.getElementById("questionnaire-form").addEventListener("submit", handleQuestionnaireSubmit);

    // Tasks Management Triggers
    document.getElementById("add-task-form").addEventListener("submit", handleAddTaskSubmit);
    document.getElementById("load-presets-btn").addEventListener("click", () => {
        state.tasks = [...PRESET_TASKS];
        saveStateToStorage();
        renderAllViews();
        showToast("Loaded default preset tasks.");
    });

    // Task Filter and Search listeners
    document.getElementById("task-search-input").addEventListener("input", filterTasks);
    document.getElementById("task-filter-category").addEventListener("change", filterTasks);

    // Edit Task Modal Triggers
    document.getElementById("close-edit-modal-btn").addEventListener("click", () => closeModal("edit-task-modal"));
    document.getElementById("edit-task-form").addEventListener("submit", handleEditTaskSubmit);

    // Settings Form Triggers
    document.getElementById("settings-form").addEventListener("submit", handleSettingsSubmit);

    // Backup & Data management triggers
    document.getElementById("export-data-btn").addEventListener("click", exportDataJSON);
    document.getElementById("import-data-trigger").addEventListener("click", () => {
        document.getElementById("import-data-file").click();
    });
    document.getElementById("import-data-file").addEventListener("change", importDataJSON);
    document.getElementById("factory-reset-btn").addEventListener("click", factoryResetData);
    
    // Weekly Tasks list
    document.getElementById("add-weekly-form").addEventListener("submit", handleAddWeeklySubmit);
    
    // Monthly Goals addition
    document.getElementById("add-monthly-goal-form").addEventListener("submit", handleAddMonthlyGoalSubmit);

    // Completion Celebration modal triggers
    document.getElementById("close-completion-btn").addEventListener("click", () => closeModal("completion-modal"));

    // Theme toggle trigger
    document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);

    // Auto duration/timer behavior based on category input
    const setupCategoryListener = (catInputId, durationInputId, timerCheckboxId) => {
        const catInput = document.getElementById(catInputId);
        if (!catInput) return;
        
        const handler = () => {
            const durationInput = document.getElementById(durationInputId);
            const timerCheckbox = document.getElementById(timerCheckboxId);
            if (!durationInput || !timerCheckbox) return;

            const val = catInput.value.trim().toLowerCase();
            const noDurationCats = ["errands", "health", "leisure"];
            if (noDurationCats.includes(val)) {
                durationInput.disabled = true;
                durationInput.value = "0";
                timerCheckbox.checked = false;
                timerCheckbox.disabled = true;
            } else {
                durationInput.disabled = false;
                if (durationInput.value === "0" || durationInput.value === "") {
                    durationInput.value = "25";
                }
                timerCheckbox.disabled = false;
            }
        };

        catInput.addEventListener("input", handler);
        catInput.addEventListener("change", handler);
    };

    setupCategoryListener("task-category", "task-duration", "task-requires-timer");
    setupCategoryListener("edit-task-category", "edit-task-duration", "edit-task-requires-timer");
}

/**
 * SPA TAB ROUTING
 */
function switchView(viewName) {
    if (state.timer.intervalId && !state.timer.isPaused && viewName !== "dashboard") {
        const confirmLeave = confirm("Focus timer is currently running. Leaving the dashboard will pause the timer. Proceed?");
        if (!confirmLeave) return;
        pauseTimer();
    }

    state.activeView = viewName;

    // Toggle active classes on Navigation buttons
    document.querySelectorAll(".nav-btn").forEach(btn => {
        if (btn.getAttribute("data-view") === viewName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // Toggle active view panel
    document.querySelectorAll(".view-panel").forEach(panel => {
        if (panel.id === `${viewName}-view`) {
            panel.classList.add("active");
        } else {
            panel.classList.remove("active");
        }
    });

    // Rerender view specific content when navigating to it
    if (viewName === "dashboard") {
        renderDashboardStats();
    } else if (viewName === "tasks") {
        renderTasksList();
        renderWeeklyTasksList();
        renderMonthlyGoalsList();
        populateCategoryFilterDropdown();
    } else if (viewName === "history") {
        renderHistoryList();
        renderHistoryStats();
    } else if (viewName === "settings") {
        loadSettingsToForm();
    }
}

/**
 * MODAL MANAGER HELPERS
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("hidden");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("hidden");
}

/**
 * Handles highlight toggle inside multi-choice modal option grids
 */
function setupOptionGridToggles(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".option-btn");
        if (!btn || btn.disabled) return;

        // Remove active class from brothers
        grid.querySelectorAll(".option-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    });
}

function getSelectedOptionValue(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return null;
    const active = grid.querySelector(".option-btn.active");
    return active ? active.getAttribute("data-value") : null;
}

/**
 * HEURISTIC TASK SUGGESTION ALGORITHM
 * Scores tasks on parameters: location fit, energy levels, priority levels.
 */
function matchTaskHeuristic(timeAvailable, energyLevel, locationContext) {
    // TODO: Rebuild the Heuristic Task Matcher!
    // Follow the step-by-step instructions in our chat to implement this function.
    // It should:
    const eligibleTasks = state.tasks.filter(task => {
        return task.duration <= timeAvailable;
    });
    if (eligibleTasks.length === 0) {
        return null;
    }
    let bestTask = null;
    let highestScore = -1; //we start at -1 so any positive score beats it. This allows us to select the best task.
    for (const task of eligibleTasks) {
        let score = 0;

        // 1. Location Match: Add 3 points if task location matches user location, or is "anywhere"
        if (task.location === locationContext || task.location === "anywhere") {
            score += 3;
        }

        // 2. Energy Match: Add 2 points if task energy requirements match user's current energy
        if (task.energy === energyLevel) {
            score += 2;
        }

        // 3. Priority Bonus: Add points based on task priority
        if (task.priority === "high") {
            score += 3;
        } else if (task.priority === "medium") {
            score += 1.5;
        }

        // 4. Track the best task
        if (score > highestScore) {
            highestScore = score;
            bestTask = task;
        }
    }
    return bestTask ? { task: bestTask } : null;
}

/**
 * QUESTIONNAIRE SUBMISSION ROUTINE
 */
async function handleQuestionnaireSubmit(e) {
    e.preventDefault();

    const timeVal = parseInt(getSelectedOptionValue("time-options"), 10);
    const energyVal = getSelectedOptionValue("energy-options");
    const locationVal = getSelectedOptionValue("location-options");

    closeModal("questionnaire-modal");

    if (state.tasks.length === 0) {
        showToast("No tasks available. Add some in the Tasks tab first!", true);
        return;
    }

    const eligibleTasks = state.tasks.filter(t => t.duration <= timeVal);
    if (eligibleTasks.length === 0) {
        showToast(`No tasks found that can be finished in ${timeVal} mins.`, true);
        return;
    }

    // Run Local Heuristic
    const result = matchTaskHeuristic(timeVal, energyVal, locationVal);
    if (result) {
        displaySuggestion(result.task, getHeuristicReasonText(result.task, energyVal, locationVal), "Heuristic Match");
    } else {
        showToast("No tasks fit your criteria.", true);
    }
}

function getHeuristicReasonText(task, userEnergy, userLocation) {
    let components = [];
    if (task.location === userLocation) components.push("matches your location");
    if (task.energy === userEnergy) components.push("matches your energy");
    if (task.priority === "high") components.push("is of high priority");

    if (components.length > 0) {
        return `We picked this because it ${components.join(", and ")} and fits your available duration perfectly.`;
    }
    return "This is the optimal task fitting inside your available time window.";
}

/**
 * DISPLAY SUGGESTION ON DASHBOARD
 */
function displaySuggestion(task, reason, sourceName) {
    state.suggestedTask = task;

    // Update suggestion card DOM elements
    document.getElementById("suggested-task-title").textContent = task.name;
    document.getElementById("suggested-task-duration").textContent = `${task.duration} mins`;
    document.getElementById("suggested-task-energy").textContent = `${task.energy.charAt(0).toUpperCase() + task.energy.slice(1)} Energy`;
    document.getElementById("suggested-task-location").textContent = task.location.charAt(0).toUpperCase() + task.location.slice(1);
    document.getElementById("suggested-task-reason").textContent = reason;

    // Category Badge
    const categoryBadge = document.getElementById("suggested-category-badge");
    categoryBadge.textContent = task.category;
    categoryBadge.className = "badge badge-category";

    // Priority Badge
    const priorityBadge = document.getElementById("suggested-priority-badge");
    priorityBadge.textContent = `${task.priority} Priority`;
    priorityBadge.className = `badge badge-priority-${task.priority}`;

    // Source Badge
    const sourceBadge = document.getElementById("suggestion-source-badge");
    sourceBadge.textContent = sourceName;
    sourceBadge.className = `badge badge-source`;

    // Show card, hide CTA
    document.getElementById("suggestion-result-container").classList.remove("hidden");
    document.querySelector(".cta-card").classList.add("hidden");
    
    // Local suggestion complete
}

function declineSuggestedTask() {
    state.suggestedTask = null;
    document.getElementById("suggestion-result-container").classList.add("hidden");
    document.querySelector(".cta-card").classList.remove("hidden");
}

function acceptSuggestedTask() {
    if (!state.suggestedTask) return;

    const task = state.suggestedTask;
    state.focusedTask = task;
    state.suggestedTask = null; // Clear suggestion once accepted

    // Toggle active containers
    document.getElementById("suggestion-result-container").classList.add("hidden");
    document.getElementById("timer-task-title").textContent = task.name;
    document.getElementById("focus-timer-container").classList.remove("hidden");

    const displayWrapper = document.querySelector(".timer-display-wrapper");
    const playPauseBtn = document.getElementById("timer-play-pause-btn");
    const resetBtn = document.getElementById("timer-reset-btn");
    
    // Remove any previous self-paced messages
    let noTimerMsg = document.getElementById("timer-no-timer-msg");
    if (noTimerMsg) noTimerMsg.remove();

    if (task.requiresTimer === false) {
        // Timerless Task: Hide clock & control buttons
        displayWrapper.style.display = "none";
        playPauseBtn.style.display = "none";
        resetBtn.style.display = "none";
        
        // Inject a simple motivational message block
        noTimerMsg = document.createElement("div");
        noTimerMsg.id = "timer-no-timer-msg";
        noTimerMsg.style.textAlign = "center";
        noTimerMsg.style.margin = "35px 0";
        noTimerMsg.style.fontSize = "1.05rem";
        noTimerMsg.style.color = "var(--text-secondary)";
        noTimerMsg.innerHTML = `🧘 <strong>Self-Paced Focus Mode</strong><br><span style="font-size: 0.85rem; color: var(--text-muted);">No timer active. Listen to music and complete at your own pace!</span>`;
        displayWrapper.parentNode.insertBefore(noTimerMsg, playPauseBtn.parentNode);
        
        state.timer.duration = task.duration * 60; // Keep track of duration for history logs
        state.timer.timeLeft = 0; // Completed manually
        state.timer.isPaused = true;
        state.timer.intervalId = null;
        
        showToast(`Self-paced focus session active for "${task.name}".`);
    } else {
        // Standard Focus Timer: Show clock & control buttons
        displayWrapper.style.display = "flex";
        playPauseBtn.style.display = "inline-flex";
        resetBtn.style.display = "inline-flex";
        
        // Initialize Timer Settings
        state.timer.duration = task.duration * 60; // Minutes to seconds
        state.timer.timeLeft = state.timer.duration;
        state.timer.isPaused = false;
        state.timer.startedAt = Date.now();

        // Update Timer Displays
        updateTimerUI();

        // Run Timer loop
        state.timer.intervalId = setInterval(timerTick, 1000);

        // Update Pause Button state (showing pause icon)
        setTimerPlayPauseIcon(true);

        showToast(`Timer started for "${task.name}". Happy focusing!`);
    }
}

/**
 * COUNTDOWN TIMER LOGIC
 */
function timerTick() {
    if (state.timer.isPaused) return;

    state.timer.timeLeft--;
    updateTimerUI();

    if (state.timer.timeLeft <= 0) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
        playCompletionChime();
        completeFocusSession(true); // Auto complete
    }
}

function updateTimerUI() {
    const mins = Math.floor(state.timer.timeLeft / 60);
    const secs = state.timer.timeLeft % 60;

    // Update Digital Display
    document.getElementById("timer-time-display").textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Update SVG progress circle
    // Circumference = 440
    const circle = document.getElementById("timer-progress-ring");
    if (circle) {
        const offset = 440 - (440 * (state.timer.timeLeft / state.timer.duration));
        circle.style.strokeDashoffset = offset;
    }
}

function toggleTimer() {
    if (!state.timer.intervalId) return;

    state.timer.isPaused = !state.timer.isPaused;
    setTimerPlayPauseIcon(!state.timer.isPaused);

    if (state.timer.isPaused) {
        showToast("Focus session paused.");
    } else {
        showToast("Focus session resumed.");
    }
}

function pauseTimer() {
    if (state.timer.intervalId && !state.timer.isPaused) {
        state.timer.isPaused = true;
        setTimerPlayPauseIcon(false);
    }
}

function setTimerPlayPauseIcon(isPlaying) {
    const btn = document.getElementById("timer-play-pause-btn");
    if (!btn) return;

    if (isPlaying) {
        // Pause icon SVG
        btn.innerHTML = `<svg id="play-pause-svg" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        btn.title = "Pause Focus";
    } else {
        // Play icon SVG
        btn.innerHTML = `<svg id="play-pause-svg" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        btn.title = "Resume Focus";
    }
}

function resetTimer() {
    if (!state.focusedTask) return;

    const confirmReset = confirm("Are you sure you want to restart the timer back to its initial duration?");
    if (!confirmReset) return;

    state.timer.timeLeft = state.timer.duration;
    state.timer.isPaused = true;
    setTimerPlayPauseIcon(false);
    updateTimerUI();
    showToast("Timer reset to beginning.");
}

function completeFocusSession(isAutoCompleted = false) {
    if (!state.focusedTask) return;

    // Clear Timer
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
    }

    const task = state.focusedTask;

    // Calculate elapsed focus minutes
    const elapsedSeconds = state.timer.duration - state.timer.timeLeft;
    let elapsedMins = Math.max(1, Math.round(elapsedSeconds / 60)); // Minimum of 1 min for completed logs

    // Exclude Errands, Health, and Leisure from focus duration logging
    const noDurationCats = ["errands", "health", "leisure"];
    const taskCategory = (task.category || "").trim().toLowerCase();
    if (noDurationCats.includes(taskCategory)) {
        elapsedMins = 0;
    }

    // Add item to completion history logs
    const historyItem = {
        id: "hist-" + Date.now(),
        taskId: task.id,
        name: task.name,
        duration: elapsedMins,
        category: task.category || "General",
        completedAt: Date.now(),
        method: isAutoCompleted ? "Timer Complete" : "Manual Complete"
    };

    state.history.push(historyItem);

    // Delete original task from active lists (since it is completed)
    state.tasks = state.tasks.filter(t => t.id !== task.id);

    // Clear Timer state
    state.focusedTask = null;

    // Hide Timer View, show CTA Card
    document.getElementById("focus-timer-container").classList.add("hidden");
    document.querySelector(".cta-card").classList.remove("hidden");

    // Save to storage
    saveStateToStorage();

    // Re-calculate streaks and update DOM views
    checkAndUpdateStreak();
    renderAllViews();

    // Show custom Celebration Modal
    showCompletionCelebration(task.name);

    showToast(`Conquered: "${task.name}"! Logged ${elapsedMins}m focus time.`);
}

/**
 * Shows the completion celebration modal with a random, non-cliche motivational quote.
 */
function showCompletionCelebration(taskName) {
    const displayEl = document.getElementById("completion-task-display");
    const quoteEl = document.getElementById("completion-quote-text");
    const modal = document.getElementById("completion-modal");
    
    if (displayEl) displayEl.textContent = taskName;
    if (quoteEl) {
        const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
        quoteEl.textContent = `"${MOTIVATIONAL_QUOTES[randomIndex]}"`;
    }
    
    if (modal) modal.classList.remove("hidden");
}

function quitFocusSession() {
    if (!state.focusedTask) return;

    const task = state.focusedTask;

    // If it's a self-paced task, we don't activate the lock
    if (task.requiresTimer === false) {
        const confirmQuit = confirm("Are you sure you want to cancel this focus session? No progress will be saved.");
        if (!confirmQuit) return;
        
        state.focusedTask = null;
        document.getElementById("focus-timer-container").classList.add("hidden");
        document.querySelector(".cta-card").classList.remove("hidden");
        renderAllViews();
        showToast("Session cancelled.");
        return;
    }

    // Trigger "Don't Let Me Quit" Mode
    if (state.timer.isQuitLocked) return;

    const confirmQuit = confirm("Are you sure you want to quit this focus session? No progress will be saved.");
    if (!confirmQuit) return;

    // Pause the active focus timer
    pauseTimer();

    // Initialize Lock State
    state.timer.isQuitLocked = true;
    state.timer.quitLockTimeLeft = 60; // 60 seconds cooldown lock

    // Show locked overlay screen
    document.getElementById("quit-lock-overlay").classList.add("active");
    updateQuitLockTimerUI();

    // Start lock interval countdown
    state.timer.quitLockIntervalId = setInterval(quitLockTick, 1000);
}

function quitLockTick() {
    state.timer.quitLockTimeLeft--;
    updateQuitLockTimerUI();

    if (state.timer.quitLockTimeLeft <= 0) {
        clearInterval(state.timer.quitLockIntervalId);
        state.timer.quitLockIntervalId = null;

        // Play synthetic tone indicating lock cleared
        playCompletionChime();

        // Ask final validation after a micro delay to let browser finish UI render
        setTimeout(() => {
            const stillQuit = confirm("60 seconds have passed! Do you still want to quit your focus session?");
            if (stillQuit) {
                releaseQuitLock(true); // Exit session
            } else {
                releaseQuitLock(false); // Resume session
                showToast("Fantastic choice! Keep pushing.");
            }
        }, 100);
    }
}

function updateQuitLockTimerUI() {
    const display = document.getElementById("quit-lock-timer-display");
    if (!display) return;
    
    const mins = Math.floor(state.timer.quitLockTimeLeft / 60);
    const secs = state.timer.quitLockTimeLeft % 60;
    display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function releaseQuitLock(shouldActuallyQuit) {
    state.timer.isQuitLocked = false;
    state.timer.quitLockTimeLeft = 0;
    
    if (state.timer.quitLockIntervalId) {
        clearInterval(state.timer.quitLockIntervalId);
        state.timer.quitLockIntervalId = null;
    }

    // Hide lock overlay screen
    document.getElementById("quit-lock-overlay").classList.remove("active");

    if (shouldActuallyQuit) {
        // Clear primary focus timer
        if (state.timer.intervalId) {
            clearInterval(state.timer.intervalId);
            state.timer.intervalId = null;
        }
        state.focusedTask = null;
        document.getElementById("focus-timer-container").classList.add("hidden");
        document.querySelector(".cta-card").classList.remove("hidden");
        renderAllViews();
        showToast("Session cancelled.");
    } else {
        // Resume primary focus timer
        state.timer.isPaused = false;
        setTimerPlayPauseIcon(true);
        if (!state.timer.intervalId) {
            state.timer.intervalId = setInterval(timerTick, 1000);
        }
    }
}

/**
 * ANALYTICS & STREAKS LOGIC
 * Computes streaks based on completions on consecutive days (YYYY-MM-DD format).
 */
function checkAndUpdateStreak() {
    if (state.history.length === 0) {
        state.currentStreak = 0;
        saveStateToStorage();
        return;
    }

    // Extract unique dates of completion sorted descending
    const dates = state.history.map(item => {
        const d = new Date(item.completedAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // Deduplicate
    const uniqueDates = Array.from(new Set(dates)).sort((a, b) => new Date(b) - new Date(a));

    if (uniqueDates.length === 0) {
        state.currentStreak = 0;
        saveStateToStorage();
        return;
    }

    const todayStr = getLocalDateString(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    const newestDate = uniqueDates[0];

    // If the last completed task was not today or yesterday, streak is broken
    if (newestDate !== todayStr && newestDate !== yesterdayStr) {
        state.currentStreak = 0;
        saveStateToStorage();
        return;
    }

    let streakCount = 1;
    let expectedDate = new Date(newestDate);

    for (let i = 1; i < uniqueDates.length; i++) {
        expectedDate.setDate(expectedDate.getDate() - 1);
        const expectedDateStr = getLocalDateString(expectedDate);

        if (uniqueDates[i] === expectedDateStr) {
            streakCount++;
        } else {
            break;
        }
    }

    state.currentStreak = streakCount;
    if (streakCount > state.bestStreak) {
        state.bestStreak = streakCount;
    }

    saveStateToStorage();
}

function getLocalDateString(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

/**
 * RENDERING FUNCTIONS
 */
function renderAllViews() {
    renderHeaderWidgets();
    renderDashboardStats();

    if (state.activeView === "dashboard") {
        // Dashboard views updated
    } else if (state.activeView === "tasks") {
        renderTasksList();
        renderWeeklyTasksList();
        renderMonthlyGoalsList();
        populateCategoryFilterDropdown();
    } else if (state.activeView === "history") {
        renderHistoryList();
        renderHistoryStats();
        renderTrajectoryGraph();
    } else if (state.activeView === "settings") {
        loadSettingsToForm();
    }
}

function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById("current-date-display").textContent = new Date().toLocaleDateString('en-US', options);
}

function renderHeaderWidgets() {
    // 1. Streak Displays
    const streakStr = state.currentStreak === 1 ? "1 Day" : `${state.currentStreak} Days`;
    document.getElementById("streak-count-display").textContent = streakStr;

    // 2. Goal Progress Displays
    const today = new Date();
    const todayStr = getLocalDateString(today);

    // Get total minutes focused today
    const minsToday = state.history
        .filter(item => getLocalDateString(new Date(item.completedAt)) === todayStr)
        .reduce((sum, item) => sum + item.duration, 0);

    const targetMins = state.settings.dailyFocusTarget * 60;

    // Format displays
    let progressText = "";
    if (minsToday >= 60) {
        progressText = `${(minsToday / 60).toFixed(1)}h / ${state.settings.dailyFocusTarget}h`;
    } else {
        progressText = `${minsToday}m / ${state.settings.dailyFocusTarget * 60}m`;
    }

    document.getElementById("goal-progress-text").textContent = progressText;

    const percentage = Math.min(100, Math.round((minsToday / targetMins) * 100));
    document.getElementById("goal-progress-fill").style.width = `${percentage}%`;
}

function renderDashboardStats() {
    const todayStr = getLocalDateString(new Date());
    const todayItems = state.history.filter(h => getLocalDateString(new Date(h.completedAt)) === todayStr);

    const countToday = todayItems.length;
    const minsToday = todayItems.reduce((sum, h) => sum + h.duration, 0);
    const pendingCount = state.tasks.length;

    document.getElementById("today-completed-count").textContent = countToday;

    if (minsToday >= 60) {
        document.getElementById("today-focus-mins").textContent = `${(minsToday / 60).toFixed(1)}h`;
    } else {
        document.getElementById("today-focus-mins").textContent = `${minsToday}m`;
    }

    document.getElementById("total-pending-count").textContent = pendingCount;

    // Dynamic motivational quotes based on activity
    const messageEl = document.getElementById("dashboard-motivational-msg");
    if (countToday === 0) {
        messageEl.textContent = `"The secret of getting ahead is getting started." Select or create a task to begin your focus streak today!`;
    } else if (minsToday < state.settings.dailyFocusTarget * 60) {
        messageEl.textContent = `Excellent job! You have logged ${minsToday}m of focus. You are ${Math.round((minsToday / (state.settings.dailyFocusTarget * 60)) * 100)}% of the way to hitting your target. Keep moving!`;
    } else {
        messageEl.textContent = `🎉 Daily Goal Conquered! You crossed your target focus goal. Treat yourself, or keep going if you are in the zone!`;
    }

    // 1. Update Streaks Card on Dashboard
    const streakStr = state.currentStreak === 1 ? "1 Day" : `${state.currentStreak} Days`;
    const streakCountEl = document.getElementById("dashboard-streak-count");
    if (streakCountEl) streakCountEl.textContent = streakStr;

    const bestStreakEl = document.getElementById("dashboard-best-streak");
    if (bestStreakEl) bestStreakEl.textContent = `Best: ${state.bestStreak} Days`;

    // Calculate completions across daily, weekly, and monthly tasks/goals today
    const completedWeeklyToday = state.weeklyTasks.filter(item => item.completed && item.completedAt && getLocalDateString(new Date(item.completedAt)) === todayStr).length;
    const completedMonthlyToday = state.monthlyGoals.filter(item => item.completed && item.completedAt && getLocalDateString(new Date(item.completedAt)) === todayStr).length;
    const totalCompletionsToday = countToday + completedWeeklyToday + completedMonthlyToday;

    const streakMsgEl = document.getElementById("dashboard-streak-message");
    if (streakMsgEl) {
        if (totalCompletionsToday > 0) {
            streakMsgEl.textContent = `Streak active! You completed ${totalCompletionsToday} item${totalCompletionsToday === 1 ? '' : 's'} today. Keep the momentum going! 🔥`;
        } else {
            streakMsgEl.textContent = `Your streak is at risk. Complete a task or check off a goal today to keep it alive! ⚡`;
        }
    }

    // 2. Rerender Trajectory Graph and Heatmap
    renderTrajectoryGraph();
    renderContributionCalendar();
}

/**
 * TASKS MANAGER CONTROLS
 */
function handleAddTaskSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("task-name").value.trim();
    const durationRaw = parseInt(document.getElementById("task-duration").value, 10);
    const priority = document.getElementById("task-priority").value;
    const energy = document.getElementById("task-energy").value;
    const location = document.getElementById("task-location").value;
    const category = document.getElementById("task-category").value.trim() || "General";
    
    // Explicit validation with user-facing feedback (instead of silent HTML5 blocks)
    if (!name) {
        showToast("Please enter a task name.", true);
        return;
    }

    const noDurationCats = ["errands", "health", "leisure"];
    const isNoDuration = noDurationCats.includes(category.toLowerCase());
    
    let duration = 0;
    let requiresTimer = false;
    
    if (isNoDuration) {
        duration = 0;
        requiresTimer = false;
    } else {
        if (isNaN(durationRaw) || durationRaw < 5 || durationRaw > 360) {
            showToast("Duration must be between 5 and 360 minutes.", true);
            return;
        }
        duration = durationRaw;
        requiresTimer = document.getElementById("task-requires-timer").checked;
    }

    const newTask = {
        id: "task-" + Date.now(),
        name,
        duration,
        priority,
        energy,
        location,
        category,
        requiresTimer,
        createdAt: Date.now()
    };

    state.tasks.push(newTask);
    saveStateToStorage();

    // Reset Form
    document.getElementById("add-task-form").reset();
    document.getElementById("task-duration").disabled = false;
    document.getElementById("task-requires-timer").disabled = false;

    // Re-render
    renderAllViews();
    showToast(`Task "${name}" added successfully.`);
}

function renderTasksList(filteredTasks = null) {
    const listContainer = document.getElementById("tasks-list-container");
    const tasksToRender = filteredTasks || state.tasks;

    if (tasksToRender.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>${state.tasks.length === 0 ? "No tasks added yet. Create one to populate your list!" : "No tasks match your search filters."}</p>
                ${state.tasks.length === 0 ? '<button class="btn btn-secondary btn-sm" id="load-presets-btn-empty">Load Demo Tasks</button>' : ''}
            </div>
        `;

        // Re-bind preset trigger inside empty state dynamically
        const presetBtn = document.getElementById("load-presets-btn-empty");
        if (presetBtn) {
            presetBtn.addEventListener("click", () => {
                state.tasks = [...PRESET_TASKS];
                saveStateToStorage();
                renderAllViews();
                showToast("Loaded default preset tasks.");
            });
        }
        return;
    }

    listContainer.innerHTML = "";

    tasksToRender.forEach(task => {
        const item = document.createElement("div");
        item.className = "task-item";

        const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
        const energyLabel = task.energy === "high" ? "High 🔥" : task.energy === "medium" ? "Medium ⚡" : "Low 🔋";
        const locationLabel = task.location.charAt(0).toUpperCase() + task.location.slice(1);

        item.innerHTML = `
            <div class="task-item-left">
                <span class="task-item-title" title="${task.name}">${task.name}</span>
                <div class="task-item-details">
                    <span class="detail-tag">🏷️ ${task.category}</span>
                    <span class="detail-tag">⏳ ${task.duration}m</span>
                    <span class="detail-tag">⚡ ${energyLabel}</span>
                    <span class="detail-tag">📍 ${locationLabel}</span>
                    <span class="detail-tag ${task.priority === 'high' ? 'badge-priority-high' : task.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'}" style="padding: 1px 6px; border-radius: 4px; font-size: 0.65rem;">
                        ${priorityLabel}
                    </span>
                </div>
            </div>
            <div class="task-item-actions">
                <button class="btn-action-icon edit-btn" data-id="${task.id}" title="Edit Task">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="btn-action-icon delete-btn" data-id="${task.id}" title="Delete Task">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
        `;

        // Wire Action Events
        item.querySelector(".edit-btn").addEventListener("click", () => openEditTaskModal(task.id));
        item.querySelector(".delete-btn").addEventListener("click", () => deleteTask(task.id));

        listContainer.appendChild(item);
    });
}

function populateCategoryFilterDropdown() {
    const dropdown = document.getElementById("task-filter-category");
    if (!dropdown) return;

    const currentVal = dropdown.value;

    // Extract unique categories from tasks list
    const categories = Array.from(new Set(state.tasks.map(t => t.category))).sort();

    dropdown.innerHTML = `<option value="all">All Categories</option>`;
    categories.forEach(cat => {
        dropdown.innerHTML += `<option value="${cat}">${cat}</option>`;
    });

    // Retain previous value if still exists
    if (categories.includes(currentVal)) {
        dropdown.value = currentVal;
    } else {
        dropdown.value = "all";
    }
}

function filterTasks() {
    const searchVal = document.getElementById("task-search-input").value.toLowerCase();
    const categoryVal = document.getElementById("task-filter-category").value;

    const filtered = state.tasks.filter(task => {
        const matchesSearch = task.name.toLowerCase().includes(searchVal);
        const matchesCategory = categoryVal === "all" || task.category === categoryVal;
        return matchesSearch && matchesCategory;
    });

    renderTasksList(filtered);
}

/**
 * EDIT TASK ACTION ROUTINES
 */
function openEditTaskModal(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById("edit-task-id").value = task.id;
    document.getElementById("edit-task-name").value = task.name;
    document.getElementById("edit-task-duration").value = task.duration;
    document.getElementById("edit-task-priority").value = task.priority;
    document.getElementById("edit-task-energy").value = task.energy;
    document.getElementById("edit-task-location").value = task.location;
    document.getElementById("edit-task-category").value = task.category;
    document.getElementById("edit-task-requires-timer").checked = task.requiresTimer !== false;

    // Trigger state check on open
    const durationInput = document.getElementById("edit-task-duration");
    const timerCheckbox = document.getElementById("edit-task-requires-timer");
    const val = (task.category || "").trim().toLowerCase();
    const noDurationCats = ["errands", "health", "leisure"];
    if (noDurationCats.includes(val)) {
        durationInput.disabled = true;
        timerCheckbox.checked = false;
        timerCheckbox.disabled = true;
    } else {
        durationInput.disabled = false;
        timerCheckbox.disabled = false;
    }

    openModal("edit-task-modal");
}

function handleEditTaskSubmit(e) {
    e.preventDefault();

    const id = document.getElementById("edit-task-id").value;
    const name = document.getElementById("edit-task-name").value.trim();
    const durationRaw = parseInt(document.getElementById("edit-task-duration").value, 10);
    const priority = document.getElementById("edit-task-priority").value;
    const energy = document.getElementById("edit-task-energy").value;
    const location = document.getElementById("edit-task-location").value;
    const category = document.getElementById("edit-task-category").value.trim() || "General";

    if (!name) {
        showToast("Please enter a task name.", true);
        return;
    }

    const noDurationCats = ["errands", "health", "leisure"];
    const isNoDuration = noDurationCats.includes(category.toLowerCase());
    
    let duration = 0;
    let requiresTimer = false;
    
    if (isNoDuration) {
        duration = 0;
        requiresTimer = false;
    } else {
        if (isNaN(durationRaw) || durationRaw < 5 || durationRaw > 360) {
            showToast("Duration must be between 5 and 360 minutes.", true);
            return;
        }
        duration = durationRaw;
        requiresTimer = document.getElementById("edit-task-requires-timer").checked;
    }

    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    state.tasks[taskIndex] = {
        ...state.tasks[taskIndex],
        name,
        duration,
        priority,
        energy,
        location,
        category,
        requiresTimer
    };

    saveStateToStorage();
    closeModal("edit-task-modal");
    renderAllViews();
    showToast("Task updated successfully.");
}

function deleteTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const confirmDelete = confirm(`Are you sure you want to delete "${task.name}"?`);
    if (!confirmDelete) return;

    state.tasks = state.tasks.filter(t => t.id !== taskId);

    // Handle cleanup of deleted selection if active
    if (state.suggestedTask && state.suggestedTask.id === taskId) {
        declineSuggestedTask();
    }

    saveStateToStorage();
    renderAllViews();
    showToast("Task deleted.");
}

/**
 * HISTORY LOGS RENDER
 */
function renderHistoryList() {
    const container = document.getElementById("history-list-container");

    if (state.history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">⌛</span>
                <p>No completed tasks in your logs. Finish tasks using the Focus Timer to see them here!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    // Sort history descending by completed timestamp
    const sorted = [...state.history].sort((a, b) => b.completedAt - a.completedAt);

    // Group history items by Calendar Day
    let currentDayStr = "";

    sorted.forEach(item => {
        const itemDate = new Date(item.completedAt);
        const dayLabelStr = itemDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        if (dayLabelStr !== currentDayStr) {
            currentDayStr = dayLabelStr;
            const header = document.createElement("div");
            header.className = "history-group-header";
            header.textContent = dayLabelStr;
            container.appendChild(header);
        }

        const timeStr = itemDate.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
        const histEl = document.createElement("div");
        histEl.className = "history-item";

        histEl.innerHTML = `
            <div class="history-item-left">
                <span class="history-item-title">${item.name}</span>
                <div class="history-item-meta">
                    <span>🏷️ ${item.category}</span>
                    <span>🕒 Completed at ${timeStr}</span>
                    <span>🤖 via ${item.method || "timer"}</span>
                </div>
            </div>
            <div class="history-item-right">
                <span>${item.duration === 0 ? '🧘 Self-paced' : `⏱️ +${item.duration}m`}</span>
                <button class="btn-action-icon delete-btn" data-id="${item.id}" title="Remove Entry" style="width:24px; height:24px; margin-left:8px;">
                    &times;
                </button>
            </div>
        `;

        // Wire history log delete button
        histEl.querySelector(".delete-btn").addEventListener("click", () => deleteHistoryLog(item.id));

        container.appendChild(histEl);
    });
}

function deleteHistoryLog(logId) {
    const confirmDelete = confirm("Are you sure you want to delete this completion log entry? This will adjust your streaks and goal metrics.");
    if (!confirmDelete) return;

    state.history = state.history.filter(h => h.id !== logId);
    saveStateToStorage();

    // Recalculate and update views
    checkAndUpdateStreak();
    renderAllViews();
    showToast("History log removed.");
}

function renderHistoryStats() {
    // Total Tasks
    document.getElementById("stats-total-completed").textContent = state.history.length;

    // Total Hours
    const totalMinutes = state.history.reduce((sum, h) => sum + h.duration, 0);
    const hours = (totalMinutes / 60).toFixed(1);
    document.getElementById("stats-total-hours").textContent = `${hours}h`;

    // Completed this week
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const thisWeekCount = state.history.filter(h => h.completedAt >= oneWeekAgo).length;
    document.getElementById("stats-weekly-avg").textContent = thisWeekCount;

    // Best Streak
    document.getElementById("stats-best-streak").textContent = `${state.bestStreak}d`;
}

/**
 * SETTINGS MANAGER CONTROLS
 */
function loadSettingsToForm() {
    document.getElementById("settings-username").value = state.settings.username;
    document.getElementById("settings-daily-target").value = state.settings.dailyFocusTarget;
}

function handleSettingsSubmit(e) {
    e.preventDefault();

    const username = document.getElementById("settings-username").value.trim() || "Productive User";
    const dailyTarget = parseFloat(document.getElementById("settings-daily-target").value) || 2.0;

    state.settings.username = username;
    state.settings.dailyFocusTarget = dailyTarget;

    saveStateToStorage();

    // Update visual badge displays
    document.getElementById("sidebar-user-name").textContent = username;
    document.getElementById("sidebar-avatar").textContent = username.charAt(0).toUpperCase();

    // Rerender headers
    renderHeaderWidgets();
    renderDashboardStats();

    showToast("Settings updated successfully.");
}

/**
 * DATA MANAGEMENT (EXPORT / IMPORT / RESET)
 */
function exportDataJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);

    const dateStamp = getLocalDateString(new Date());
    downloadAnchor.setAttribute("download", `tellmewhattodo_backup_${dateStamp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Data exported successfully.");
}

function importDataJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const importedState = JSON.parse(event.target.result);

            // Standard validation of schema structures
            if (importedState && Array.isArray(importedState.tasks) && Array.isArray(importedState.history) && importedState.settings) {
                state.tasks = importedState.tasks;
                state.history = importedState.history;
                state.weeklyTasks = importedState.weeklyTasks || [];
                state.monthlyGoals = importedState.monthlyGoals || [];
                state.settings = {
                    ...state.settings,
                    ...importedState.settings
                };
                state.currentStreak = importedState.currentStreak || 0;
                state.bestStreak = importedState.bestStreak || 0;

                saveStateToStorage();
                checkAndUpdateStreak();
                renderAllViews();

                // Update username displays
                document.getElementById("sidebar-user-name").textContent = state.settings.username;
                document.getElementById("sidebar-avatar").textContent = state.settings.username.charAt(0).toUpperCase();
                updateApiKeyIndicator();

                showToast("Data backup loaded successfully!");
            } else {
                showToast("Invalid data structure in backup file.", true);
            }
        } catch (err) {
            console.error("Import parsing failed:", err);
            showToast("Failed to parse JSON file.", true);
        }
    };
    reader.readAsText(file);

    // Clear input to allow re-upload of same file name
    e.target.value = "";
}

function factoryResetData() {
    const confirmReset = confirm("CRITICAL ACTION: This will delete ALL tasks, focus history logs, streaks, and settings configuration. This action CANNOT be undone. Proceed?");
    if (!confirmReset) return;

    localStorage.removeItem(STORAGE_KEY);

    // Stop timers if any
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
    }

    // Re-seed default state
    state = {
        tasks: [...PRESET_TASKS],
        history: [],
        weeklyTasks: [],
        monthlyGoals: [],
        settings: {
            username: "Productive User",
            dailyFocusTarget: 2.0
        },
        currentStreak: 0,
        bestStreak: 0,
        activeView: "dashboard",
        suggestedTask: null,
        focusedTask: null,
        timer: {
            intervalId: null,
            timeLeft: 0,
            duration: 0,
            isPaused: true,
            startedAt: null,
            isQuitLocked: false,
            quitLockTimeLeft: 0,
            quitLockIntervalId: null
        }
    };

    saveStateToStorage();

    // Reset inputs and indicators
    document.getElementById("sidebar-user-name").textContent = state.settings.username;
    document.getElementById("sidebar-avatar").textContent = state.settings.username.charAt(0).toUpperCase();

    // Hide active timer element
    document.getElementById("focus-timer-container").classList.add("hidden");
    document.getElementById("suggestion-result-container").classList.add("hidden");
    document.querySelector(".cta-card").classList.remove("hidden");

    switchView("dashboard");
    initApp();
    showToast("Application reset to default state.");
}

// Weekly tasks submit handler
function handleAddWeeklySubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById("weekly-task-name");
    const name = nameInput.value.trim();
    if (!name) return;

    const newItem = {
        id: "weekly-" + Date.now(),
        name: name,
        completed: false
    };

    if (!state.weeklyTasks) state.weeklyTasks = [];
    state.weeklyTasks.push(newItem);
    saveStateToStorage();
    nameInput.value = "";
    renderWeeklyTasksList();
    showToast("Added weekly goal.");
}

function renderWeeklyTasksList() {
    const container = document.getElementById("weekly-tasks-list-container");
    if (!container) return;

    if (!state.weeklyTasks || state.weeklyTasks.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 15px 5px; color: var(--text-muted); font-size: 0.8rem;">
                No weekly goals yet.
            </div>
        `;
        return;
    }

    container.innerHTML = "";
    state.weeklyTasks.forEach(item => {
        const div = document.createElement("div");
        div.className = `weekly-item ${item.completed ? 'completed' : ''}`;
        
        div.innerHTML = `
            <div class="weekly-item-left">
                <input type="checkbox" class="weekly-item-checkbox" ${item.completed ? 'checked' : ''}>
                <span class="weekly-item-title" title="${item.name}">${item.name}</span>
            </div>
            <button class="btn-action-icon delete-btn" style="width:24px; height:24px; color:var(--text-muted); padding:0; border:none; background:transparent;">
                &times;
            </button>
        `;

        // Checkbox event
        div.querySelector(".weekly-item-checkbox").addEventListener("change", () => {
            toggleWeeklyTask(item.id);
        });

        // Delete event
        div.querySelector(".delete-btn").addEventListener("click", () => {
            deleteWeeklyTask(item.id);
        });

        container.appendChild(div);
    });
}

function toggleWeeklyTask(id) {
    const idx = state.weeklyTasks.findIndex(item => item.id === id);
    if (idx === -1) return;
    const task = state.weeklyTasks[idx];
    task.completed = !task.completed;
    if (task.completed) {
        task.completedAt = Date.now();
    } else {
        delete task.completedAt;
    }
    saveStateToStorage();
    renderWeeklyTasksList();
    renderAllViews();
}

function deleteWeeklyTask(id) {
    state.weeklyTasks = state.weeklyTasks.filter(item => item.id !== id);
    saveStateToStorage();
    renderWeeklyTasksList();
    renderAllViews();
}

// SVG Trajectory Graph
function renderTrajectoryGraph() {
    const svg = document.getElementById("trajectory-svg-chart");
    if (!svg) return;

    // Get past 7 days: [6 days ago, ..., today]
    const days = [];
    const dateLabels = [];
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(getLocalDateString(d));
        // Label format e.g. "Thu 6/4"
        dateLabels.push(`${weekdays[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`);
    }

    const targetMins = state.settings.dailyFocusTarget * 60;

    // Calculate completions for each day
    const percentages = days.map(dayStr => {
        const minsCompleted = state.history
            .filter(item => getLocalDateString(new Date(item.completedAt)) === dayStr)
            .reduce((sum, item) => sum + item.duration, 0);
        
        if (targetMins <= 0) return 0;
        return Math.round((minsCompleted / targetMins) * 100);
    });

    const svgWidth = svg.clientWidth || 450;
    const svgHeight = 150;
    const barCount = 7;
    const paddingLeft = 30;
    const paddingRight = 10;
    const paddingTop = 25;
    const paddingBottom = 20;
    
    const chartWidth = svgWidth - paddingLeft - paddingRight;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    const colWidth = chartWidth / barCount;
    const barWidth = Math.max(16, colWidth * 0.4);

    let svgHtml = `
        <!-- Y Axis Gridline (100% Target Goal) -->
        <line x1="${paddingLeft}" y1="${paddingTop}" x2="${svgWidth - paddingRight}" y2="${paddingTop}" stroke="var(--border-color)" stroke-dasharray="3,3" stroke-width="1" />
        <text x="${paddingLeft - 6}" y="${paddingTop + 4}" font-family="var(--font-sans)" font-size="9px" fill="var(--text-secondary)" text-anchor="end">100%</text>
        
        <!-- Base line -->
        <line x1="${paddingLeft}" y1="${svgHeight - paddingBottom}" x2="${svgWidth - paddingRight}" y2="${svgHeight - paddingBottom}" stroke="var(--border-color)" stroke-width="1" />
    `;

    for (let i = 0; i < barCount; i++) {
        const pct = percentages[i];
        const label = dateLabels[i];
        
        const colCenter = paddingLeft + (i * colWidth) + (colWidth / 2);
        const barLeft = colCenter - (barWidth / 2);
        
        // Calculate Y scale where 100% target maps to chartHeight
        const fillHeight = Math.min(chartHeight * 1.2, chartHeight * (pct / 100)); // Cap render height at 120%
        const barY = svgHeight - paddingBottom - fillHeight;
        
        // Backdrop background column
        svgHtml += `
            <rect class="chart-bar-bg" x="${barLeft}" y="${paddingTop}" width="${barWidth}" height="${chartHeight}" />
        `;

        if (fillHeight > 0) {
            // Filled bar (solid green color)
            const fillCol = "var(--color-success)";
            svgHtml += `
                <rect class="chart-bar-rect" x="${barLeft}" y="${barY}" width="${barWidth}" height="${fillHeight}" fill="${fillCol}" rx="2" />
            `;
        }

        // Percentage text label above bar
        svgHtml += `
            <text class="chart-text-pct" x="${colCenter}" y="${barY - 6}" fill="var(--text-secondary)" font-family="var(--font-sans)">${pct}%</text>
        `;

        // Weekday X-axis text label
        svgHtml += `
            <text class="chart-text-lbl" x="${colCenter}" y="${svgHeight - 4}" font-family="var(--font-sans)">${label}</text>
        `;
    }

    svg.innerHTML = svgHtml;
}

const MOTIVATIONAL_QUOTES = [
    "Well done. You chose action over distraction. Keep this momentum.",
    "One down. The version of you that did this is stronger than the one that hesitated.",
    "You didn't feel like starting, but you did it anyway. That's discipline.",
    "The resistance was real, but you broke it. Respect the effort.",
    "No fanfare needed. You showed up, did the work, and got it done. Next.",
    "Decisions shape destiny. You made the right choice for the last focus block.",
    "Discipline is choosing between what you want now and what you want most. You chose the latter.",
    "Another brick in the wall of your competence. Keep building.",
    "The sweat of execution is sweeter than the comfort of procrastination. Well finished.",
    "Excellent. You resisted the urge to quit. That's how resilience is built.",
    "You conquered this task. Every finished job is a promise kept to yourself.",
    "Concentration is the secret of strength. You proved your strength today.",
    "The best way to finish is simply to begin, and you've successfully completed the circle."
];

// Monthly Goals logic
function handleAddMonthlyGoalSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById("goal-input-name");
    const dateInput = document.getElementById("goal-input-date");

    const name = nameInput.value.trim();
    const dateStr = dateInput.value;

    if (!name || !dateStr) {
        showToast("Please enter a goal and a valid target date.", true);
        return;
    }

    const newItem = {
        id: "goal-" + Date.now(),
        name: name,
        date: dateStr,
        completed: false,
        completedAt: null
    };

    if (!state.monthlyGoals) state.monthlyGoals = [];
    state.monthlyGoals.push(newItem);
    saveStateToStorage();

    nameInput.value = "";
    dateInput.value = "";

    renderMonthlyGoalsList();
    renderAllViews();
    showToast("Added monthly goal!");
}

function renderMonthlyGoalsList() {
    const container = document.getElementById("settings-goals-list");
    if (!container) return;

    if (!state.monthlyGoals || state.monthlyGoals.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 15px 5px; color: var(--text-muted); font-size: 0.8rem;">
                No monthly goals added yet.
            </div>
        `;
        return;
    }

    container.innerHTML = "";
    state.monthlyGoals.forEach(goal => {
        const deadline = new Date(goal.date);
        const today = new Date();
        
        // Zero out times for date-only calculations
        deadline.setHours(0,0,0,0);
        today.setHours(0,0,0,0);

        const diffMs = deadline - today;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        let daysStr = "";
        let warningClass = "";

        if (diffDays < 0) {
            daysStr = "Overdue ⚠️";
            warningClass = "goal-warning-high";
        } else if (diffDays === 0) {
            daysStr = "Due Today 🔥";
            warningClass = "goal-warning-high";
        } else if (diffDays === 1) {
            daysStr = "1 day left ⚠️";
            warningClass = "goal-warning-high";
        } else {
            daysStr = `${diffDays} days left`;
            if (diffDays <= 3) {
                warningClass = "goal-warning-high";
            } else if (diffDays <= 7) {
                warningClass = "goal-warning-medium";
            }
        }

        const isCompleted = goal.completed === true;

        const div = document.createElement("div");
        div.className = `goal-item ${isCompleted ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="goal-item-top">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <input type="checkbox" class="goal-item-checkbox" ${isCompleted ? 'checked' : ''}>
                    <span class="goal-item-name" style="${isCompleted ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${goal.name}</span>
                </div>
                <span class="goal-item-days ${isCompleted ? '' : warningClass}">${isCompleted ? 'Completed 🎉' : daysStr}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                <span class="goal-item-date">📅 Target: ${deadline.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <button class="btn-action-icon delete-btn" style="width:24px; height:24px; color:var(--text-muted); border:none; padding:0; background:transparent;">
                    &times;
                </button>
            </div>
        `;

        // Checkbox event
        div.querySelector(".goal-item-checkbox").addEventListener("change", () => {
            toggleMonthlyGoal(goal.id);
        });

        // Delete event
        div.querySelector(".delete-btn").addEventListener("click", () => {
            deleteMonthlyGoal(goal.id);
        });

        container.appendChild(div);
    });
}

function deleteMonthlyGoal(id) {
    state.monthlyGoals = state.monthlyGoals.filter(goal => goal.id !== id);
    saveStateToStorage();
    renderMonthlyGoalsList();
    renderAllViews();
}

// Priority Task Reminders check
function checkPriorityTaskReminders() {
    // Look for High priority tasks that are older than 3 hours
    // 3 hours = 3 * 60 * 60 * 1000 ms = 10800000 ms
    const thresholdMs = 3 * 60 * 60 * 1000;
    const now = Date.now();

    const neglectedTasks = state.tasks.filter(t => t.priority === "high" && (now - t.createdAt) > thresholdMs);

    if (neglectedTasks.length === 0) return;

    // Trigger Notification for the first neglected task
    const task = neglectedTasks[0];
    const alertMessage = `⚠️ High Priority Alert: "${task.name}" has been sitting for over 3 hours! Let's get to focus.`;

    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            new Notification("TellMeWhatToDo - Focus Reminder", {
                body: alertMessage
            });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification("TellMeWhatToDo - Focus Reminder", {
                        body: alertMessage
                    });
                }
            });
        }
    }
    
    // Always trigger visual overlay toast regardless of browser notifications
    showToast(alertMessage, true);
}

// AI Brainstorm Helper removed

// Start the application when the DOM is fully parsed and loaded
window.addEventListener("DOMContentLoaded", initApp);

// ==========================================================================
// Theme Toggles, Monthly Goals checklists & Heatmap helpers
// ==========================================================================

function toggleTheme() {
    if (document.body.classList.contains("light-mode")) {
        document.body.classList.remove("light-mode");
        localStorage.setItem("tellmewhattodo_theme", "dark");
    } else {
        document.body.classList.add("light-mode");
        localStorage.setItem("tellmewhattodo_theme", "light");
    }
    updateThemeToggleUI();
}

function updateThemeToggleUI() {
    const btn = document.getElementById("theme-toggle-btn");
    const icon = document.getElementById("theme-toggle-icon");
    const text = document.getElementById("theme-toggle-text");
    if (!btn) return;

    if (document.body.classList.contains("light-mode")) {
        if (icon) icon.textContent = "🌙";
        if (text) text.textContent = "Dark Mode";
        btn.title = "Switch to Dark Mode";
    } else {
        if (icon) icon.textContent = "☀️";
        if (text) text.textContent = "Light Mode";
        btn.title = "Switch to Light Mode";
    }
}

function toggleMonthlyGoal(id) {
    const idx = state.monthlyGoals.findIndex(g => g.id === id);
    if (idx === -1) return;
    const goal = state.monthlyGoals[idx];
    goal.completed = !goal.completed;
    if (goal.completed) {
        goal.completedAt = Date.now();
    } else {
        delete goal.completedAt;
    }
    saveStateToStorage();
    renderMonthlyGoalsList();
    renderAllViews();
}

function renderContributionCalendar() {
    const container = document.getElementById("contrib-calendar-wrapper");
    if (!container) return;

    // 1. Gather completions by date
    const completions = {};
    
    // Daily completed tasks
    state.history.forEach(item => {
        if (item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            completions[dateStr] = (completions[dateStr] || 0) + 1;
        }
    });

    // Weekly tasks completed
    state.weeklyTasks.forEach(item => {
        if (item.completed && item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            completions[dateStr] = (completions[dateStr] || 0) + 1;
        }
    });

    // Monthly goals completed
    state.monthlyGoals.forEach(item => {
        if (item.completed && item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            completions[dateStr] = (completions[dateStr] || 0) + 1;
        }
    });

    // 2. Setup date bounds: Start 52 weeks ago (Sunday), End current week Saturday (total 53 weeks = 371 cells)
    const today = new Date();
    const todayDay = today.getDay(); // 0 is Sunday, 6 is Saturday
    
    // Start date is 52 weeks ago aligning to Sunday
    const startDate = new Date();
    startDate.setDate(today.getDate() - (52 * 7 + todayDay));
    startDate.setHours(0, 0, 0, 0);

    // 3. Generate the columns of weeks
    let columnsHtml = '';
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthPositions = []; // Array of { colIndex, name }
    let lastMonth = -1;

    for (let w = 0; w < 53; w++) {
        let colCellsHtml = '';
        let colMonth = -1;

        for (let d = 0; d < 7; d++) {
            const cellDate = new Date(startDate);
            cellDate.setDate(startDate.getDate() + (w * 7 + d));
            
            const dateStr = getLocalDateString(cellDate);
            const count = completions[dateStr] || 0;
            
            // Determine level (0 to 5)
            let level = 0;
            if (count > 0) {
                level = Math.min(5, count);
            }
            
            const formattedDate = cellDate.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
            const tooltipText = count === 1 
                ? `1 completion on ${formattedDate}`
                : `${count} completions on ${formattedDate}`;

            // We only show coloring for dates <= today. Future dates remain level 0.
            const isFuture = cellDate > today;
            const currentLevel = isFuture ? 0 : level;

            colCellsHtml += `<div class="contrib-cell" data-level="${currentLevel}" title="${tooltipText}"></div>`;
            
            if (d === 0) {
                colMonth = cellDate.getMonth();
            }
        }

        // Track month label position
        if (colMonth !== lastMonth) {
            monthPositions.push({ colIndex: w, name: months[colMonth] });
            lastMonth = colMonth;
        }

        columnsHtml += `<div class="contrib-column">${colCellsHtml}</div>`;
    }

    // Render month labels row
    let monthsHtml = '';
    monthPositions.forEach((pos, idx) => {
        // Only render month labels that don't overlap too closely
        const leftPercent = (pos.colIndex / 53) * 100;
        monthsHtml += `<span class="contrib-month-label" style="left: ${leftPercent}%">${pos.name}</span>`;
    });

    // 4. Assemble full wrapper
    container.innerHTML = `
        <div class="contrib-grid-wrapper">
            <div class="contrib-wdays">
                <span></span>
                <span>Mon</span>
                <span></span>
                <span>Wed</span>
                <span></span>
                <span>Fri</span>
                <span></span>
            </div>
            <div class="contrib-heatmap-body">
                <div class="contrib-months">
                    ${monthsHtml}
                </div>
                <div class="contrib-columns-container">
                    ${columnsHtml}
                </div>
            </div>
        </div>
        <div class="contrib-legend">
            <span>Less</span>
            <div class="contrib-legend-cells">
                <div class="contrib-legend-cell contrib-cell" data-level="0"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="1"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="2"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="3"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="4"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="5"></div>
            </div>
            <span>More</span>
        </div>
    `;
}
