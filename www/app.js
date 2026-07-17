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
        dailyFocusTarget: 2.0, // in hours
        strictMode: true,
        dashboardOrder: [
            "focus-engine",
            "side-quest-container",
            "extracurricular-container",
            "anchors-container",
            "personal-bests-container",
            "trajectory-chart",
            "activity-heatmap"
        ],
        widgetSizes: {}
    },
    currentStreak: 0,
    bestStreak: 0,
    
    // Gamification & Mindfulness states
    xp: 0,
    level: 1,
    totalFocusedMinutes: 0,
    categoryKnowledge: {},
    customSideQuests: [],
    sideQuest: { name: "", completed: false, date: "" },
    personalBests: { maxStreak: 0, maxDailyFocusMins: 0, maxCompletionsInADay: 0 },
    extracurriculars: ["Guitar Practice", "Painting", "Creative Writing", "Gardening", "Cooking Experiment", "Reading Novels"],
    activeExtracurricular: "Guitar Practice",
    extracurricularDuration: 30,
    anchors: [
        "Set a 2-minute timer to just open the file.",
        "Clear everything off your desk except the computer.",
        "Put on noise-cancelling headphones and listen to brown noise.",
        "Write down the absolute next step in 3 words.",
        "Take 3 slow deep breaths before typing.",
        "Open a blank document and write gibberish for 1 minute.",
        "Stand up, stretch for 60 seconds, then immediately sit back down and start."
    ],
    activeAnchor: "",

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
    renderDashboardLayout();
    setupDragAndDrop();
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
                strictMode: true,
                 dashboardOrder: [
                    "focus-engine",
                    "side-quest-container",
                    "extracurricular-container",
                    "anchors-container",
                    "personal-bests-container",
                    "trajectory-chart",
                    "activity-heatmap",
                    "leveling-container"
                ],
                widgetSizes: {},
                ...(parsed.settings || {})
            };
            if (!state.settings.widgetSizes) {
                state.settings.widgetSizes = {};
            }
            if (state.settings.widgetSizes["leveling-container"] === "span-1") {
                state.settings.widgetSizes["leveling-container"] = "span-2";
            }

            // Sync dashboardOrder to ensure all default widgets are present and focus-status is removed
            const defaultWidgets = [
                "focus-engine",
                "side-quest-container",
                "extracurricular-container",
                "anchors-container",
                "personal-bests-container",
                "trajectory-chart",
                "activity-heatmap",
                "leveling-container"
            ];
            if (state.settings.dashboardOrder && Array.isArray(state.settings.dashboardOrder)) {
                state.settings.dashboardOrder = state.settings.dashboardOrder.filter(id => id !== "focus-status");
                defaultWidgets.forEach(wId => {
                    if (!state.settings.dashboardOrder.includes(wId)) {
                        state.settings.dashboardOrder.push(wId);
                    }
                });
            }
            
            // Fallback check if it was overwritten to undefined or is missing
            if (!state.settings.dashboardOrder || !Array.isArray(state.settings.dashboardOrder)) {
                state.settings.dashboardOrder = [
                    "focus-engine",
                    "side-quest-container",
                    "extracurricular-container",
                    "anchors-container",
                    "personal-bests-container",
                    "trajectory-chart",
                    "activity-heatmap",
                    "leveling-container"
                ];
            }
            
            state.currentStreak = parsed.currentStreak || 0;
            state.bestStreak = parsed.bestStreak || 0;

            // Load new gamification fields
            state.xp = parsed.xp || 0;
            state.level = parsed.level || 1;
            state.totalFocusedMinutes = parsed.totalFocusedMinutes || 0;
            state.categoryKnowledge = parsed.categoryKnowledge || {};
            state.customSideQuests = parsed.customSideQuests || [];
            state.sideQuest = parsed.sideQuest || { name: "", completed: false, date: "" };
            state.personalBests = parsed.personalBests || { maxStreak: parsed.bestStreak || 0, maxDailyFocusMins: 0, maxCompletionsInADay: 0 };
            state.extracurriculars = parsed.extracurriculars || ["Guitar Practice", "Painting", "Creative Writing", "Gardening", "Cooking Experiment", "Reading Novels"];
            state.activeExtracurricular = parsed.activeExtracurricular || "Guitar Practice";
            state.extracurricularDuration = parsed.extracurricularDuration || 30;
            state.anchors = parsed.anchors || [
                "Set a 2-minute timer to just open the file.",
                "Clear everything off your desk except the computer.",
                "Put on noise-cancelling headphones and listen to brown noise.",
                "Write down the absolute next step in 3 words.",
                "Take 3 slow deep breaths before typing.",
                "Open a blank document and write gibberish for 1 minute.",
                "Stand up, stretch for 60 seconds, then immediately sit back down and start."
            ];
            state.activeAnchor = parsed.activeAnchor || "";
        } else {
            // Seed defaults
            state.tasks = [...PRESET_TASKS];
            state.history = [];
            state.weeklyTasks = [];
            state.monthlyGoals = [];
            state.settings = {
                username: "Productive User",
                dailyFocusTarget: 2.0,
                strictMode: true,
                dashboardOrder: [
                    "focus-engine",
                    "side-quest-container",
                    "extracurricular-container",
                    "anchors-container",
                    "personal-bests-container",
                    "trajectory-chart",
                    "activity-heatmap",
                    "leveling-container"
                ]
            };
            state.xp = 0;
            state.level = 1;
            state.totalFocusedMinutes = 0;
            state.categoryKnowledge = {};
            state.sideQuest = { name: "", completed: false, date: "" };
            state.personalBests = { maxStreak: 0, maxDailyFocusMins: 0, maxCompletionsInADay: 0 };
            state.extracurriculars = ["Guitar Practice", "Painting", "Creative Writing", "Gardening", "Cooking Experiment", "Reading Novels"];
            state.activeExtracurricular = "Guitar Practice";
            state.extracurricularDuration = 30;
            state.anchors = [
                "Set a 2-minute timer to just open the file.",
                "Clear everything off your desk except the computer.",
                "Put on noise-cancelling headphones and listen to brown noise.",
                "Write down the absolute next step in 3 words.",
                "Take 3 slow deep breaths before typing.",
                "Open a blank document and write gibberish for 1 minute.",
                "Stand up, stretch for 60 seconds, then immediately sit back down and start."
            ];
            state.activeAnchor = "";
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
            bestStreak: state.bestStreak,
            
            // New fields
            xp: state.xp,
            level: state.level,
            totalFocusedMinutes: state.totalFocusedMinutes,
            categoryKnowledge: state.categoryKnowledge,
            customSideQuests: state.customSideQuests,
            sideQuest: state.sideQuest,
            personalBests: state.personalBests,
            extracurriculars: state.extracurriculars,
            activeExtracurricular: state.activeExtracurricular,
            extracurricularDuration: state.extracurricularDuration,
            anchors: state.anchors,
            activeAnchor: state.activeAnchor
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

    // Satisfying ripple effect on buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        
        const ripple = document.createElement('span');
        ripple.classList.add('ripple-effect');
        
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    });

    // Success pop on success buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-success');
        if (!btn) return;
        btn.classList.add('success-pop');
        btn.addEventListener('animationend', () => btn.classList.remove('success-pop'), { once: true });
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
    document.getElementById("timer-add-5-btn").addEventListener("click", () => addTimerMinutes(5));
    document.getElementById("timer-add-10-btn").addEventListener("click", () => addTimerMinutes(10));
    document.getElementById("timer-strict-toggle").addEventListener("change", (e) => {
        state.settings.strictMode = e.target.checked;
        const settingsStrict = document.getElementById("settings-strict-mode");
        if (settingsStrict) settingsStrict.checked = e.target.checked;
        saveStateToStorage();
        showToast(state.settings.strictMode ? "Strict mode enabled." : "Strict mode disabled.");
    });

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
    document.getElementById("settings-strict-mode").addEventListener("change", (e) => {
        state.settings.strictMode = e.target.checked;
        const timerStrict = document.getElementById("timer-strict-toggle");
        if (timerStrict) timerStrict.checked = e.target.checked;
        saveStateToStorage();
        showToast(state.settings.strictMode ? "Strict mode enabled." : "Strict mode disabled.");
    });

    // Custom Content Add Triggers inside Settings
    const addQuestBtn = document.getElementById("settings-add-quest-btn");
    if (addQuestBtn) {
        addQuestBtn.addEventListener("click", () => {
            const input = document.getElementById("settings-new-quest");
            const val = input.value.trim();
            if (val) {
                if (!state.customSideQuests) state.customSideQuests = [];
                if (state.customSideQuests.includes(val) || SIDE_QUESTS.includes(val)) {
                    showToast("Quest already exists!", true);
                    return;
                }
                state.customSideQuests.push(val);
                input.value = "";
                saveStateToStorage();
                renderCustomContentSettings();
                renderSideQuestCard();
                showToast("Custom side quest added.");
            }
        });
    }

    const addHobbyBtn = document.getElementById("settings-add-hobby-btn");
    if (addHobbyBtn) {
        addHobbyBtn.addEventListener("click", () => {
            const input = document.getElementById("settings-new-hobby");
            const val = input.value.trim();
            if (val) {
                if (state.extracurriculars.includes(val)) {
                    showToast("Hobby already exists!", true);
                    return;
                }
                state.extracurriculars.push(val);
                state.activeExtracurricular = val;
                input.value = "";
                saveStateToStorage();
                renderCustomContentSettings();
                renderExtracurricularCard();
                showToast(`Hobby "${val}" added.`);
            }
        });
    }

    const addAnchorBtn = document.getElementById("settings-add-anchor-btn");
    if (addAnchorBtn) {
        addAnchorBtn.addEventListener("click", () => {
            const input = document.getElementById("settings-new-anchor");
            const val = input.value.trim();
            if (val) {
                if (state.anchors.includes(val)) {
                    showToast("Anchor already exists in vault!", true);
                    return;
                }
                state.anchors.push(val);
                state.activeAnchor = val;
                input.value = "";
                saveStateToStorage();
                renderCustomContentSettings();
                renderAnchorsCard();
                showToast("New anchor added to vault.");
            }
        });
    }

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
    state.suggestedTask = null; // Clear suggestion once accepted
    startFocusOnTask(task);
}

function startFocusOnTask(task) {
    state.focusedTask = task;
    
    // Sync strict mode checkbox
    const strictToggle = document.getElementById("timer-strict-toggle");
    if (strictToggle) strictToggle.checked = !!state.settings.strictMode;

    // Toggle active containers
    document.getElementById("suggestion-result-container").classList.add("hidden");
    document.querySelector(".cta-card").classList.add("hidden");
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
        if (state.timer.intervalId) clearInterval(state.timer.intervalId);
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

    // Calculate XP
    let baseMultiplier = 1.0;
    if (task.priority === "high") baseMultiplier += 0.3;
    if (task.energy === "high") baseMultiplier += 0.2;
    
    let earnedXp = 0;
    if (elapsedMins > 0) {
        earnedXp = Math.round(elapsedMins * baseMultiplier * 10); // 10 XP per focus minute
    } else {
        earnedXp = 25; // flat XP reward for self-paced non-duration tasks (Errands, etc)
    }

    // Add item to completion history logs
    const historyItem = {
        id: "hist-" + Date.now(),
        taskId: task.id,
        name: task.name,
        duration: elapsedMins,
        category: task.category || "General",
        completedAt: Date.now(),
        method: isAutoCompleted ? "Timer Complete" : "Manual Complete",
        xpEarned: earnedXp
    };

    state.history.push(historyItem);
    
    // Add XP to state
    addXP(earnedXp, `Conquered "${task.name}"`, task.category || "General");

    // Delete original task from active lists (since it is completed)
    state.tasks = state.tasks.filter(t => t.id !== task.id);

    // Play tactile completion chime
    playCompletionChime();

    // Trigger checkmark completion animation on focus timer card
    const timerContainer = document.getElementById("focus-timer-container");
    if (timerContainer) {
        timerContainer.classList.add("completing");
    }

    // Delay view transitions to let the checkmark stamp animation shine
    setTimeout(() => {
        if (timerContainer) {
            timerContainer.classList.remove("completing");
        }

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
    }, 1000);
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
    triggerConfetti();
}

function quitFocusSession() {
    if (!state.focusedTask) return;

    const task = state.focusedTask;

    // If it's a self-paced task or strict mode is disabled, we don't activate the lock
    if (task.requiresTimer === false || !state.settings.strictMode) {
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

    updatePersonalBests();
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
        renderSideQuestCard();
        renderExtracurricularCard();
        renderAnchorsCard();
        renderPersonalBestsCard();
        renderLevelingCard();
        setupWidgetResizers();
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

    const todayCompletedCountEl = document.getElementById("today-completed-count");
    if (todayCompletedCountEl) todayCompletedCountEl.textContent = countToday;

    const todayFocusMinsEl = document.getElementById("today-focus-mins");
    if (todayFocusMinsEl) {
        if (minsToday >= 60) {
            todayFocusMinsEl.textContent = `${(minsToday / 60).toFixed(1)}h`;
        } else {
            todayFocusMinsEl.textContent = `${minsToday}m`;
        }
    }

    const totalPendingCountEl = document.getElementById("total-pending-count");
    if (totalPendingCountEl) totalPendingCountEl.textContent = pendingCount;

    // Dynamic motivational quotes based on activity
    const messageEl = document.getElementById("dashboard-motivational-msg");
    if (messageEl) {
        if (countToday === 0) {
            messageEl.textContent = `"The secret of getting ahead is getting started." Select or create a task to begin your focus streak today!`;
        } else if (minsToday < state.settings.dailyFocusTarget * 60) {
            messageEl.textContent = `Excellent job! You have logged ${minsToday}m of focus. You are ${Math.round((minsToday / (state.settings.dailyFocusTarget * 60)) * 100)}% of the way to hitting your target. Keep moving!`;
        } else {
            messageEl.textContent = `🎉 Daily Goal Conquered! You crossed your target focus goal. Treat yourself, or keep going if you are in the zone!`;
        }
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
            <div class="history-item-right" style="display: flex; align-items: center;">
                <div style="text-align: right; margin-right: 8px;">
                    <div style="font-size: 0.85rem; font-weight: 500;">${item.duration === 0 ? '🧘 Self-paced' : `⏱️ +${item.duration}m`}</div>
                    ${item.xpEarned ? `<div style="font-size: 0.7rem; color: var(--color-primary); font-weight: 600; margin-top: 1px;">✨ +${item.xpEarned} XP</div>` : ''}
                </div>
                <button class="btn-action-icon delete-btn" data-id="${item.id}" title="Remove Entry" style="width:24px; height:24px;">
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
    document.getElementById("settings-strict-mode").checked = !!state.settings.strictMode;
    renderCustomContentSettings();
}

function renderCustomContentSettings() {
    // 1. Render Side Quests List
    const questListEl = document.getElementById("settings-quest-list");
    if (questListEl) {
        if (!state.customSideQuests || state.customSideQuests.length === 0) {
            questListEl.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 10px 0;">No custom side quests yet.</li>`;
        } else {
            questListEl.innerHTML = state.customSideQuests.map((q, idx) => `
                <li style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary); padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${q}</span>
                    <button class="settings-delete-quest-btn" data-index="${idx}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 0.85rem; padding: 2px 6px;">✕</button>
                </li>
            `).join('');
            
            // Delete handlers
            questListEl.querySelectorAll(".settings-delete-quest-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const idx = parseInt(btn.getAttribute("data-index"), 10);
                    state.customSideQuests.splice(idx, 1);
                    saveStateToStorage();
                    renderCustomContentSettings();
                    renderSideQuestCard();
                    showToast("Custom side quest deleted.");
                });
            });
        }
    }

    // 2. Render Hobbies List
    const hobbyListEl = document.getElementById("settings-hobby-list");
    if (hobbyListEl) {
        if (!state.extracurriculars || state.extracurriculars.length === 0) {
            hobbyListEl.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 10px 0;">No hobbies in list.</li>`;
        } else {
            hobbyListEl.innerHTML = state.extracurriculars.map((h, idx) => `
                <li style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary); padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${h}</span>
                    <button class="settings-delete-hobby-btn" data-index="${idx}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 0.85rem; padding: 2px 6px;">✕</button>
                </li>
            `).join('');
            
            // Delete handlers
            hobbyListEl.querySelectorAll(".settings-delete-hobby-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const idx = parseInt(btn.getAttribute("data-index"), 10);
                    const deleted = state.extracurriculars.splice(idx, 1)[0];
                    if (state.activeExtracurricular === deleted) {
                        state.activeExtracurricular = state.extracurriculars.length > 0 ? state.extracurriculars[0] : "";
                    }
                    saveStateToStorage();
                    renderCustomContentSettings();
                    renderExtracurricularCard();
                    showToast("Hobby deleted.");
                });
            });
        }
    }

    // 3. Render Anchors Vault List
    const anchorListEl = document.getElementById("settings-anchor-list");
    if (anchorListEl) {
        if (!state.anchors || state.anchors.length === 0) {
            anchorListEl.innerHTML = `<li style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 10px 0;">Anchor vault is empty.</li>`;
        } else {
            anchorListEl.innerHTML = state.anchors.map((a, idx) => {
                const isUrl = isUrlString(a);
                const display = isUrl ? `🔗 ${a}` : a;
                return `
                    <li style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary); padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;" title="${a}">${display}</span>
                        <button class="settings-delete-anchor-btn" data-index="${idx}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 0.85rem; padding: 2px 6px;">✕</button>
                    </li>
                `;
            }).join('');
            
            // Delete handlers
            anchorListEl.querySelectorAll(".settings-delete-anchor-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const idx = parseInt(btn.getAttribute("data-index"), 10);
                    const deleted = state.anchors.splice(idx, 1)[0];
                    if (state.activeAnchor === deleted) {
                        state.activeAnchor = state.anchors.length > 0 ? state.anchors[0] : "";
                    }
                    saveStateToStorage();
                    renderCustomContentSettings();
                    renderAnchorsCard();
                    showToast("Anchor deleted from vault.");
                });
            });
        }
    }
}

function handleSettingsSubmit(e) {
    e.preventDefault();

    const username = document.getElementById("settings-username").value.trim() || "Productive User";
    const dailyTarget = parseFloat(document.getElementById("settings-daily-target").value) || 2.0;
    const strictMode = document.getElementById("settings-strict-mode").checked;

    state.settings.username = username;
    state.settings.dailyFocusTarget = dailyTarget;
    state.settings.strictMode = strictMode;

    // Sync other checkbox
    const timerStrict = document.getElementById("timer-strict-toggle");
    if (timerStrict) timerStrict.checked = strictMode;

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
            dailyFocusTarget: 2.0,
            strictMode: true,
            dashboardOrder: [
                "focus-engine",
                "side-quest-container",
                "extracurricular-container",
                "anchors-container",
                "personal-bests-container",
                "trajectory-chart",
                "activity-heatmap"
            ]
        },
        currentStreak: 0,
        bestStreak: 0,
        
        sideQuest: { name: "", completed: false, date: "" },
        personalBests: { maxStreak: 0, maxDailyFocusMins: 0, maxCompletionsInADay: 0 },
        extracurriculars: ["Guitar Practice", "Painting", "Creative Writing", "Gardening", "Cooking Experiment", "Reading Novels"],
        activeExtracurricular: "Guitar Practice",
        extracurricularDuration: 30,
        anchors: [
            "Set a 2-minute timer to just open the file.",
            "Clear everything off your desk except the computer.",
            "Put on noise-cancelling headphones and listen to brown noise.",
            "Write down the absolute next step in 3 words.",
            "Take 3 slow deep breaths before typing.",
            "Open a blank document and write gibberish for 1 minute.",
            "Stand up, stretch for 60 seconds, then immediately sit back down and start."
        ],
        activeAnchor: "",

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

    renderDashboardLayout();
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
        addXP(100, `Completed Weekly Goal: "${task.name}"`, "Weekly Goals");
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
        addXP(200, `Completed Monthly Goal: "${goal.name}"`, "Monthly Goals");
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

    const containerWidth = container.getBoundingClientRect().width || 700;
    const weekdayLabelWidth = 35;
    const gap = 2;
    const cellSize = Math.max(8, Math.min(14, (containerWidth - weekdayLabelWidth) / 53 - gap));

    // 1. Gather daily stats (focus minutes + 15m mindfulness credit per goal/weekly task)
    const dailyData = {};
    
    // Tasks
    state.history.forEach(item => {
        if (item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            if (!dailyData[dateStr]) dailyData[dateStr] = { focusMins: 0, taskCount: 0, goalCount: 0 };
            dailyData[dateStr].focusMins += item.duration || 0;
            dailyData[dateStr].taskCount += 1;
        }
    });

    // Weekly tasks completed
    state.weeklyTasks.forEach(item => {
        if (item.completed && item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            if (!dailyData[dateStr]) dailyData[dateStr] = { focusMins: 0, taskCount: 0, goalCount: 0 };
            dailyData[dateStr].focusMins += 15; // 15m credit
            dailyData[dateStr].goalCount += 1;
        }
    });

    // Monthly goals completed
    state.monthlyGoals.forEach(item => {
        if (item.completed && item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            if (!dailyData[dateStr]) dailyData[dateStr] = { focusMins: 0, taskCount: 0, goalCount: 0 };
            dailyData[dateStr].focusMins += 15; // 15m credit
            dailyData[dateStr].goalCount += 1;
        }
    });

    // 2. Setup date bounds: Start 52 weeks ago (Sunday), End current week Saturday
    const today = new Date();
    const todayDay = today.getDay();
    
    const startDate = new Date();
    startDate.setDate(today.getDate() - (52 * 7 + todayDay));
    startDate.setHours(0, 0, 0, 0);

    // 3. Generate columns of weeks
    let columnsHtml = '';
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthPositions = [];
    let lastMonth = -1;

    for (let w = 0; w < 53; w++) {
        let colCellsHtml = '';
        let colMonth = -1;

        for (let d = 0; d < 7; d++) {
            const cellDate = new Date(startDate);
            cellDate.setDate(startDate.getDate() + (w * 7 + d));
            
            const dateStr = getLocalDateString(cellDate);
            const stats = dailyData[dateStr] || { focusMins: 0, taskCount: 0, goalCount: 0 };
            const totalMins = stats.focusMins;
            
            // Determine level (0 to 5) based on focus minutes
            let level = 0;
            if (totalMins > 0) {
                if (totalMins <= 25) level = 1;
                else if (totalMins <= 50) level = 2;
                else if (totalMins <= 75) level = 3;
                else if (totalMins <= 100) level = 4;
                else level = 5;
            }
            
            const formattedDate = cellDate.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
            const tooltipText = `${totalMins} focus score mins (${stats.taskCount} tasks, ${stats.goalCount} goals) on ${formattedDate}`;

            const isFuture = cellDate > today;
            const currentLevel = isFuture ? 0 : level;

            colCellsHtml += `<div class="contrib-cell" data-level="${currentLevel}" title="${tooltipText}" style="width: ${cellSize}px; height: ${cellSize}px;"></div>`;
            
            if (d === 0) {
                colMonth = cellDate.getMonth();
            }
        }

        if (colMonth !== lastMonth) {
            monthPositions.push({ colIndex: w, name: months[colMonth] });
            lastMonth = colMonth;
        }

        columnsHtml += `<div class="contrib-column">${colCellsHtml}</div>`;
    }

    let monthsHtml = '';
    monthPositions.forEach((pos) => {
        const leftPercent = (pos.colIndex / 53) * 100;
        monthsHtml += `<span class="contrib-month-label" style="left: ${leftPercent}%">${pos.name}</span>`;
    });

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
            <span>Less Focus</span>
            <div class="contrib-legend-cells">
                <div class="contrib-legend-cell contrib-cell" data-level="0"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="1"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="2"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="3"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="4"></div>
                <div class="contrib-legend-cell contrib-cell" data-level="5"></div>
            </div>
            <span>More Focus</span>
        </div>
    `;
}

/**
 * ==========================================================================
 * ADDED GAMIFICATION & LAYOUT FEATURES LOGIC
 * ==========================================================================
 */

const SIDE_QUESTS = [
    "Talk to a stranger and ask them a friendly question.",
    "Do 10 deep, conscious breaths outside in the fresh air.",
    "Tidy up your workspace or desk for exactly 5 minutes.",
    "Drink a large glass of water right now to rehydrate.",
    "Send a quick, unsolicited appreciation text to a friend.",
    "Do a 90-second plank or stretch sequence.",
    "Write down 3 specific things you are grateful for today.",
    "Stand up and do a quick 3-minute physical reset/walk.",
    "Spend 5 minutes decluttering a physical file, folder, or drawer.",
    "Write down your absolute #1 priority for tomorrow on a sticky note."
];

function addTimerMinutes(mins) {
    if (!state.focusedTask) {
        showToast("No active focus session to extend.", true);
        return;
    }
    state.timer.timeLeft += mins * 60;
    state.timer.duration += mins * 60;
    updateTimerUI();
    showToast(`Added ${mins} minutes to focus timer.`);
}

function generateDailySideQuest() {
    const pool = (state.customSideQuests && state.customSideQuests.length > 0) ? state.customSideQuests : SIDE_QUESTS;
    const randomIdx = Math.floor(Math.random() * pool.length);
    state.sideQuest = {
        name: pool[randomIdx],
        completed: false,
        date: getLocalDateString(new Date())
    };
    saveStateToStorage();
}

function completeSideQuest() {
    if (state.sideQuest.completed) return;
    
    state.sideQuest.completed = true;
    
    // Log side quest in focus history for heatmap adjust
    const questHistoryItem = {
        id: "quest-" + Date.now(),
        taskId: "side-quest",
        name: "Side Quest: " + state.sideQuest.name,
        duration: 15, // 15 mins focus score reward
        category: "Health",
        completedAt: Date.now(),
        method: "Side Quest Complete"
    };
    state.history.push(questHistoryItem);
    
    saveStateToStorage();
    checkAndUpdateStreak();
    renderAllViews();
    showToast("Daily Side Quest completed! +15m focus score logged.");
}

function rerollSideQuest() {
    if (state.sideQuest.completed) return;
    
    const pool = (state.customSideQuests && state.customSideQuests.length > 0) ? state.customSideQuests : SIDE_QUESTS;
    let currentQuest = state.sideQuest.name;
    let nextQuest = currentQuest;
    
    if (pool.length > 1) {
        let attempts = 0;
        do {
            let randIdx = Math.floor(Math.random() * pool.length);
            nextQuest = pool[randIdx];
            attempts++;
        } while (nextQuest === currentQuest && attempts < 10);
    }
    
    state.sideQuest.name = nextQuest;
    saveStateToStorage();
    renderSideQuestCard();
    showToast("Quest rerolled.");
}

function startHobbyFocus() {
    const hobbyTask = {
        id: "hobby-" + Date.now(),
        name: "Hobby focus: " + state.activeExtracurricular,
        duration: state.extracurricularDuration || 30,
        priority: "low",
        energy: "low",
        location: "home",
        category: "Leisure",
        requiresTimer: true,
        createdAt: Date.now()
    };
    startFocusOnTask(hobbyTask);
}

function recalculatePersonalBests() {
    if (!state.personalBests) {
        state.personalBests = { maxStreak: 0, maxDailyFocusMins: 0, maxCompletionsInADay: 0 };
    }
    
    // 1. Streak
    state.personalBests.maxStreak = Math.max(state.bestStreak || 0, state.currentStreak || 0);
    
    const focusMinsByDay = {};
    const completionsByDay = {};
    
    // Tasks
    state.history.forEach(item => {
        const dateStr = getLocalDateString(new Date(item.completedAt));
        focusMinsByDay[dateStr] = (focusMinsByDay[dateStr] || 0) + item.duration;
        completionsByDay[dateStr] = (completionsByDay[dateStr] || 0) + 1;
    });
    
    // Weekly
    state.weeklyTasks.forEach(item => {
        if (item.completed && item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            completionsByDay[dateStr] = (completionsByDay[dateStr] || 0) + 1;
        }
    });
    
    // Monthly
    state.monthlyGoals.forEach(item => {
        if (item.completed && item.completedAt) {
            const dateStr = getLocalDateString(new Date(item.completedAt));
            completionsByDay[dateStr] = (completionsByDay[dateStr] || 0) + 1;
        }
    });
    
    let maxFocus = 0;
    let maxComps = 0;
    
    for (const day in focusMinsByDay) {
        if (focusMinsByDay[day] > maxFocus) maxFocus = focusMinsByDay[day];
    }
    for (const day in completionsByDay) {
        if (completionsByDay[day] > maxComps) maxComps = completionsByDay[day];
    }
    
    state.personalBests.maxDailyFocusMins = Math.max(state.personalBests.maxDailyFocusMins, maxFocus);
    state.personalBests.maxCompletionsInADay = Math.max(state.personalBests.maxCompletionsInADay, maxComps);
    
    saveStateToStorage();
}

function updatePersonalBests() {
    const todayStr = getLocalDateString(new Date());
    
    if (!state.personalBests) {
        recalculatePersonalBests();
        return;
    }
    
    // 1. Streak update
    state.personalBests.maxStreak = Math.max(state.personalBests.maxStreak, state.currentStreak, state.bestStreak || 0);
    
    // 2. Focus Mins update
    const todayFocusMins = state.history
        .filter(item => getLocalDateString(new Date(item.completedAt)) === todayStr)
        .reduce((sum, item) => sum + item.duration, 0);
    state.personalBests.maxDailyFocusMins = Math.max(state.personalBests.maxDailyFocusMins, todayFocusMins);
    
    // 3. Completions update
    const countToday = state.history.filter(h => getLocalDateString(new Date(h.completedAt)) === todayStr).length;
    const completedWeeklyToday = state.weeklyTasks.filter(item => item.completed && item.completedAt && getLocalDateString(new Date(item.completedAt)) === todayStr).length;
    const completedMonthlyToday = state.monthlyGoals.filter(item => item.completed && item.completedAt && getLocalDateString(new Date(item.completedAt)) === todayStr).length;
    const totalCompletionsToday = countToday + completedWeeklyToday + completedMonthlyToday;
    state.personalBests.maxCompletionsInADay = Math.max(state.personalBests.maxCompletionsInADay, totalCompletionsToday);
    
    saveStateToStorage();
}

/* RENDERING GAMIFICATION CARDS */

function renderSideQuestCard() {
    const container = document.getElementById("side-quest-container");
    if (!container) return;
    
    const todayStr = getLocalDateString(new Date());
    if (!state.sideQuest || state.sideQuest.date !== todayStr) {
        generateDailySideQuest();
    }
    
    const completedClass = state.sideQuest.completed ? "quest-completed" : "";
    
    container.innerHTML = `
        <div class="side-quest-header">
            <h3>🎯 Daily Side Quest</h3>
            ${!state.sideQuest.completed ? `<button class="btn btn-secondary btn-icon-sm" id="reroll-quest-btn" title="Reroll quest">🔄</button>` : ''}
        </div>
        <div class="side-quest-body ${completedClass}">
            <p class="quest-text" style="font-size: 0.95rem; margin-bottom: 12px; font-weight: 500;">${state.sideQuest.name}</p>
            ${state.sideQuest.completed 
                ? `<div class="quest-status-badge">✅ Quest Cleared! (+15m Score)</div>` 
                : `<button class="btn btn-success btn-sm btn-full" id="complete-quest-btn">Complete Quest</button>`
            }
        </div>
    `;
    
    if (!state.sideQuest.completed) {
        document.getElementById("complete-quest-btn").addEventListener("click", completeSideQuest);
        document.getElementById("reroll-quest-btn").addEventListener("click", rerollSideQuest);
    }
}

function renderExtracurricularCard() {
    const container = document.getElementById("extracurricular-container");
    if (!container) return;
    
    let buttonsHtml = '';
    state.extracurriculars.forEach(hobby => {
        const isActive = hobby === state.activeExtracurricular;
        const activeClass = isActive ? 'active' : '';
        buttonsHtml += `<button class="hobby-tag-btn ${activeClass}" data-value="${hobby}">${hobby}</button>`;
    });

    container.innerHTML = `
        <h3>🎨 Daily Hobby Slot</h3>
        <p class="description" style="margin-bottom: 12px;">Choose and track balanced extracurricular activities.</p>
        <div class="hobby-controls" style="display: flex; flex-direction: column; gap: 10px;">
            <div class="hobby-buttons-grid" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
                ${buttonsHtml}
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <label style="font-size: 0.8rem; color: var(--text-secondary);">Set Duration:</label>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="number" id="hobby-duration-input" min="5" max="180" value="${state.extracurricularDuration || 30}" style="width: 60px; text-align: center; padding: 4px; border-radius: var(--border-radius-sm); border: none; background: var(--color-bg-card-hover); color: var(--text-main);">
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">min</span>
                </div>
            </div>
            
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-primary btn-sm" id="start-hobby-btn" style="flex-grow: 1;">Focus on Hobby</button>
                <button class="btn btn-secondary btn-icon-sm" id="cycle-hobby-btn" title="Cycle hobby" style="padding: 0 10px;">🔄</button>
            </div>
        </div>
    `;
    
    // Add click listener for hobby buttons
    container.querySelectorAll(".hobby-tag-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const val = btn.getAttribute("data-value");
            state.activeExtracurricular = val;
            saveStateToStorage();
            renderExtracurricularCard();
        });
    });
    
    document.getElementById("cycle-hobby-btn").addEventListener("click", () => {
        const idx = state.extracurriculars.indexOf(state.activeExtracurricular);
        const nextIdx = (idx + 1) % state.extracurriculars.length;
        state.activeExtracurricular = state.extracurriculars[nextIdx];
        saveStateToStorage();
        renderExtracurricularCard();
    });
    
    document.getElementById("hobby-duration-input").addEventListener("change", (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 5) val = 5;
        if (val > 180) val = 180;
        state.extracurricularDuration = val;
        saveStateToStorage();
    });
    
    document.getElementById("start-hobby-btn").addEventListener("click", startHobbyFocus);
}

function isUrlString(str) {
    if (!str) return false;
    const trimmed = str.trim();
    if (/^https?:\/\//i.test(trimmed)) return true;
    const domainPattern = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,6}(:[0-9]{1,5})?(\/.*)?$/i;
    return domainPattern.test(trimmed);
}

function formatUrl(str) {
    const trimmed = str.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return 'https://' + trimmed;
}

function renderAnchorsCard() {
    const container = document.getElementById("anchors-container");
    if (!container) return;
    
    let anchorDisplayHtml = '';
    if (state.activeAnchor) {
        const isActiveUrl = isUrlString(state.activeAnchor);
        if (isActiveUrl) {
            const formattedUrl = formatUrl(state.activeAnchor);
            anchorDisplayHtml = `
                <div class="anchor-quote-box" style="margin: 10px 0; padding: 12px; border-radius: var(--border-radius-sm); background: var(--color-bg-card-hover); border-left: 3px solid var(--color-success); font-style: italic; font-size: 0.9rem; text-align: center;">
                    <a href="${formattedUrl}" target="_blank" style="color: var(--color-success); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
                        🔗 ${state.activeAnchor}
                    </a>
                </div>
            `;
        } else {
            anchorDisplayHtml = `<div class="anchor-quote-box" style="margin: 10px 0; padding: 12px; border-radius: var(--border-radius-sm); background: var(--color-bg-card-hover); border-left: 3px solid var(--color-success); font-style: italic; font-size: 0.9rem; color: var(--text-main); line-height: 1.4;">"${state.activeAnchor}"</div>`;
        }
    } else {
        anchorDisplayHtml = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; margin: 12px 0;">No active anchor. Press below to draw one!</p>`;
    }

    container.innerHTML = `
        <h3>⚓ Focus Anchors</h3>
        <p class="description">Ground yourself to start work when you are feeling stuck.</p>
        
        ${anchorDisplayHtml}
        
        <button class="btn btn-secondary btn-sm btn-full" id="draw-anchor-btn">Draw Anchor</button>
    `;
    
    document.getElementById("draw-anchor-btn").addEventListener("click", () => {
        if (state.anchors.length === 0) {
            showToast("Your anchor vault is empty!", true);
            return;
        }
        let randIdx;
        do {
            randIdx = Math.floor(Math.random() * state.anchors.length);
        } while (state.anchors.length > 1 && state.anchors[randIdx] === state.activeAnchor);
        
        state.activeAnchor = state.anchors[randIdx];
        saveStateToStorage();
        renderAnchorsCard();
        showToast("Anchor activated! Ground yourself on this.");
    });
}

function renderPersonalBestsCard() {
    const container = document.getElementById("personal-bests-container");
    if (!container) return;
    
    if (!state.personalBests) {
        recalculatePersonalBests();
    }
    
    const totalFocusMins = state.history.reduce((sum, item) => sum + item.duration, 0);
    const totalFocusHours = (totalFocusMins / 60).toFixed(1);

    container.innerHTML = `
        <h3>🏆 Personal Bests</h3>
        <p class="description">Your all-time milestone focus statistics.</p>
        <div class="personal-bests-list" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
                <span style="color: var(--text-secondary);">🔥 Streak:</span>
                <strong style="color: var(--color-warning);">${state.personalBests.maxStreak || state.bestStreak || 0} Days</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
                <span style="color: var(--text-secondary);">⏱️ Focus / Day:</span>
                <strong style="color: var(--color-success);">${state.personalBests.maxDailyFocusMins || 0} mins</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">
                <span style="color: var(--text-secondary);">🚀 Daily Items:</span>
                <strong>${state.personalBests.maxCompletionsInADay || 0} completed</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding-top: 2px;">
                <span style="color: var(--text-secondary);">🌟 Cumulative:</span>
                <strong>${totalFocusHours} hours</strong>
            </div>
        </div>
    `;
}

/**
 * DASHBOARD MODULAR LAYOUT & DRAG AND DROP
 */
function renderDashboardLayout() {
    const container = document.getElementById("dashboard-widgets-container");
    if (!container) return;

    const order = state.settings.dashboardOrder || [
        "focus-engine",
        "side-quest-container",
        "extracurricular-container",
        "anchors-container",
        "personal-bests-container",
        "trajectory-chart",
        "activity-heatmap"
    ];

    order.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            container.appendChild(el);
        }
    });
}

function setupDragAndDrop() {
    const container = document.getElementById("dashboard-widgets-container");
    if (!container) return;

    let draggedId = null;

    container.addEventListener("dragstart", (e) => {
        const interactiveSelectors = "input, select, button, textarea, a, .hobby-tag-btn, .btn, .widget-resizer-handle, .btn-delete-quest, .btn-delete-anchor, .btn-close-modal, option";
        if (e.target.closest(interactiveSelectors)) {
            e.preventDefault();
            return;
        }
        const target = e.target.closest(".draggable-block");
        if (target) {
            draggedId = target.id;
            target.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", target.id);
        }
    });

    container.addEventListener("dragend", (e) => {
        const target = e.target.closest(".draggable-block");
        if (target) {
            target.classList.remove("dragging");
        }
        document.querySelectorAll(".draggable-block").forEach(b => b.classList.remove("drag-over"));
    });

    container.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const target = e.target.closest(".draggable-block");
        if (target && target.id !== draggedId) {
            target.classList.add("drag-over");
        }
    });

    container.addEventListener("dragleave", (e) => {
        const target = e.target.closest(".draggable-block");
        if (target) {
            target.classList.remove("drag-over");
        }
    });

    container.addEventListener("drop", (e) => {
        e.preventDefault();
        const target = e.target.closest(".draggable-block");
        if (target && draggedId && target.id !== draggedId) {
            target.classList.remove("drag-over");
            
            const order = state.settings.dashboardOrder || [
                "focus-engine",
                "side-quest-container",
                "extracurricular-container",
                "anchors-container",
                "personal-bests-container",
                "trajectory-chart",
                "activity-heatmap",
                "leveling-container"
            ];

            const draggedIdx = order.indexOf(draggedId);
            const targetIdx = order.indexOf(target.id);

            if (draggedIdx !== -1 && targetIdx !== -1) {
                order[draggedIdx] = target.id;
                order[targetIdx] = draggedId;

                state.settings.dashboardOrder = order;
                saveStateToStorage();
                
                renderDashboardLayout();
                
                // Redraw line chart and heatmap to handle layout shifts cleanly
                renderTrajectoryGraph();
                renderContributionCalendar();
                showToast("Dashboard rearranged.");
            }
        }
    });
}

/**
 * Gamification levels progression mapping Levels 1 to 25 to focused hours.
 */
const FOCUS_LEVELS = [
    { level: 1, title: "Focus Initiate", minHours: 0, desc: "ADHD engine warmed up. Building core consistency." },
    { level: 2, title: "Stamina Recruit", minHours: 15, desc: "Resisting initial attention shifts." },
    { level: 3, title: "Cognitive Cadet", minHours: 35, desc: "Deep work habits are taking shape." },
    { level: 4, title: "Attention Builder", minHours: 55, desc: "Focus capacity is expanding." },
    { level: 5, title: "Worthy Candidate", minHours: 70, desc: "70+ Hours focused. Ready for standard tasks." },
    { level: 6, title: "Worthy Professional", minHours: 100, desc: "100+ Hours focused! Qualified to hold down a skilled job." },
    { level: 7, title: "Focus Specialist", minHours: 130, desc: "Deep study routines are solidifying." },
    { level: 8, title: "Elite Specialist", minHours: 160, desc: "Outstanding focus and attention capabilities." },
    { level: 9, title: "Hyperfocus Cadet", minHours: 200, desc: "Entering above-average cognitive ranges." },
    { level: 10, title: "Cognitive Professional", minHours: 250, desc: "250+ Hours. Stamina matches the top tier of learners." },
    { level: 11, title: "Deep Work Scholar", minHours: 300, desc: "300+ Hours. Focus flows naturally." },
    { level: 12, title: "Deep Work Specialist", minHours: 350, desc: "Excellent attention block stamina." },
    { level: 13, title: "Cognitive Craftsman", minHours: 400, desc: "Deep focus is second nature." },
    { level: 14, title: "Focus Adept", minHours: 450, desc: "Exceptional mastery of task focus." },
    { level: 15, title: "Concentration Champion", minHours: 500, desc: "500+ Hours focused. Stamina is elite." },
    { level: 16, title: "Attention Architect", minHours: 560, desc: "Structuring deep focus at will." },
    { level: 17, title: "Cognitive Master", minHours: 620, desc: "High-intensity cognitive stamina." },
    { level: 18, title: "Flow Runner", minHours: 680, desc: "Focus flows uninterrupted for hours." },
    { level: 19, title: "Focus Vanguard", minHours: 740, desc: "Leading the deep work revolution." },
    { level: 20, title: "Mindfulness Master", minHours: 800, desc: "800+ Hours. Calm, unwavering focus." },
    { level: 21, title: "Attention Specialist Elite", minHours: 850, desc: "Near limitless cognitive stamina." },
    { level: 22, title: "Hyperfocus Master", minHours: 900, desc: "Complete lock on complex, lengthy tasks." },
    { level: 23, title: "Cognitive Titan", minHours: 950, desc: "Massive mental bandwidth unlocked." },
    { level: 24, title: "Deep Work Grandmaster", minHours: 1000, desc: "1000+ Hours. Standout focused learner." },
    { level: 25, title: "Flow-State Legend", minHours: 1100, desc: "Legendary attention control. Focus state complete." }
];

function getFocusRank(hours) {
    let rank = FOCUS_LEVELS[0];
    for (let i = 0; i < FOCUS_LEVELS.length; i++) {
        if (hours >= FOCUS_LEVELS[i].minHours) {
            rank = FOCUS_LEVELS[i];
        } else {
            break;
        }
    }
    return rank;
}

function addXP(amount, reason, category = "General") {
    if (isNaN(amount) || amount <= 0) return;
    
    state.xp = (state.xp || 0) + amount;
    
    // Add to category knowledge
    if (!state.categoryKnowledge) state.categoryKnowledge = {};
    const catKey = category.toLowerCase().trim();
    state.categoryKnowledge[catKey] = (state.categoryKnowledge[catKey] || 0) + amount;
    
    // Check level up based on total hours
    const totalFocusMins = state.history.reduce((sum, item) => sum + item.duration, 0);
    const totalFocusHours = totalFocusMins / 60;
    const currentRank = getFocusRank(totalFocusHours);
    
    if (currentRank.level > (state.level || 1)) {
        state.level = currentRank.level;
        showToast(`🎉 LEVEL UP! You are now a "${currentRank.title}" (Level ${currentRank.level})!`, false);
        playLevelUpChime();
        triggerConfetti();
    }
    
    saveStateToStorage();
}

function playLevelUpChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const playTone = (freq, startTime, duration, volume) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, startTime);
            gainNode.gain.setValueAtTime(volume, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        
        // Upward arpeggio for Level Up triumph (C5 -> E5 -> G5 -> C6)
        playTone(523.25, ctx.currentTime, 0.15, 0.15);       // C5
        playTone(659.25, ctx.currentTime + 0.12, 0.15, 0.15);  // E5
        playTone(783.99, ctx.currentTime + 0.24, 0.15, 0.15);  // G5
        playTone(1046.50, ctx.currentTime + 0.36, 0.5, 0.2);   // C6
    } catch (e) {
        console.warn("Audio chime failed:", e);
    }
}

function renderLevelingCard() {
    const container = document.getElementById("leveling-container");
    if (!container) return;

    const totalFocusMins = state.history.reduce((sum, item) => sum + item.duration, 0);
    const totalFocusHours = totalFocusMins / 60;
    
    const currentRank = getFocusRank(totalFocusHours);
    let nextRank = null;
    const currentIdx = FOCUS_LEVELS.findIndex(r => r.level === currentRank.level);
    if (currentIdx !== -1 && currentIdx < FOCUS_LEVELS.length - 1) {
        nextRank = FOCUS_LEVELS[currentIdx + 1];
    }

    if (state.level !== currentRank.level) {
        state.level = currentRank.level;
        saveStateToStorage();
    }
    state.totalFocusedMinutes = totalFocusMins;

    // Calculate stamina progression percent
    let progressPercent = 100;
    let progressLabel = "MAX LEVEL";
    if (nextRank) {
        const range = nextRank.minHours - currentRank.minHours;
        const currentProgress = totalFocusHours - currentRank.minHours;
        progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
        progressLabel = `${totalFocusHours.toFixed(1)}h / ${nextRank.minHours}h to Lv. ${nextRank.level}`;
    }

    // Build skill trees
    const categories = Object.keys(state.categoryKnowledge || {});
    let skillListHtml = "";
    if (categories.length === 0) {
        skillListHtml = `
            <div style="text-align: center; font-size: 0.75rem; color: var(--text-muted); padding: 8px 0;">
                Complete tasks via Focus Timer to build knowledge skills.
            </div>
        `;
    } else {
        const sortedSkills = categories
            .map(cat => ({
                name: cat.charAt(0).toUpperCase() + cat.slice(1),
                xp: state.categoryKnowledge[cat] || 0
            }))
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 3); // top 3 skills for maximum vertical density

        skillListHtml = sortedSkills.map(skill => {
            const skillLevel = Math.floor(Math.sqrt(skill.xp / 40)) + 1;
            const nextSkillXp = Math.pow(skillLevel, 2) * 40;
            const prevSkillXp = Math.pow(skillLevel - 1, 2) * 40;
            const skillRange = nextSkillXp - prevSkillXp;
            const skillProgress = skill.xp - prevSkillXp;
            const skillPercent = Math.min(100, Math.max(0, Math.round((skillProgress / skillRange) * 100)));

            return `
                <div class="skill-row" style="margin-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 1px;">
                        <span style="color: var(--text-secondary); font-weight: 500;">📖 ${skill.name} (Lv. ${skillLevel})</span>
                        <strong style="color: var(--color-primary); font-size: 0.65rem;">${skill.xp} XP</strong>
                    </div>
                    <div class="widget-progress-bar" style="height: 4px; background-color: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden;">
                        <div class="widget-progress-fill" style="width: ${skillPercent}%; height: 100%; background: linear-gradient(90deg, var(--color-primary), var(--color-accent-purple)); border-radius: 2px;"></div>
                    </div>
                </div>
            `;
        }).join("");
    }

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h3 style="font-size: 0.95rem; margin: 0; font-weight: 700;">⚡ Rank & Level</h3>
            <span style="background: rgba(46, 170, 220, 0.12); color: var(--color-primary); padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; border: 1px solid rgba(46, 170, 220, 0.25);">
                Level ${currentRank.level}
            </span>
        </div>
        
        <!-- Prominent Rank Panel -->
        <div class="rank-panel" style="background: var(--color-bg-card-hover); padding: 12px 14px; border-radius: var(--border-radius-md); border: 1px solid var(--border-color); margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.15);">
            <div style="font-weight: 800; font-size: 1.05rem; color: var(--text-main); line-height: 1.2; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                👑 ${currentRank.title}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 10px; font-style: italic;">
                "${currentRank.desc}"
            </div>
            
            <!-- Prominent Progress Bar -->
            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500;">
                <span>Progression</span>
                <span>${progressLabel}</span>
            </div>
            <div class="widget-progress-bar" style="height: 8px; background-color: var(--color-bg-deep); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.03);">
                <div class="widget-progress-fill" id="level-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--color-accent-purple), var(--color-primary)); border-radius: 4px; box-shadow: 0 0 8px var(--color-primary-glow);"></div>
            </div>
        </div>

        <!-- Proficiencies -->
        <div class="proficiencies-list" style="display: flex; flex-direction: column; gap: 5px;">
            ${skillListHtml}
        </div>
    `;

    // Slide progress bar to actual value
    setTimeout(() => {
        const fillEl = document.getElementById("level-progress-fill");
        if (fillEl) fillEl.style.width = `${progressPercent}%`;
    }, 50);
}

function setupWidgetResizers() {
    const widgets = document.querySelectorAll(".draggable-block");
    widgets.forEach(widget => {
        const widgetId = widget.id;
        if (!widgetId) return;

        // Ensure relative positioning so controls absolute align correctly
        widget.style.position = "relative";

        // Read current size setting, defaulting logically if not yet set
        if (!state.settings.widgetSizes) state.settings.widgetSizes = {};
        let currentSize = state.settings.widgetSizes[widgetId];
        if (!currentSize) {
            if (widgetId === "activity-heatmap") {
                currentSize = "span-4";
            } else if (widgetId === "focus-engine" || widgetId === "trajectory-chart" || widgetId === "leveling-container") {
                currentSize = "span-2";
            } else {
                currentSize = "span-1";
            }
            state.settings.widgetSizes[widgetId] = currentSize;
        }

        // Apply grid-span class
        widget.classList.remove("grid-span-1", "grid-span-2", "grid-span-3", "grid-span-4");
        widget.classList.add(`grid-${currentSize}`);

        // Add resizer handle if not already present
        if (widget.querySelector(".widget-resizer-handle")) return;

        const handle = document.createElement("div");
        handle.className = "widget-resizer-handle";
        handle.setAttribute("draggable", "false"); // Prevent HTML5 Drag and Drop triggers

        handle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();

            handle.classList.add("resizing");
            
            // Get grid parameters
            const grid = document.getElementById("dashboard-widgets-container");
            if (!grid) return;
            const gridRect = grid.getBoundingClientRect();
            const totalWidth = gridRect.width;
            const gap = 24; // aligned with style.css gap
            const columnsCount = 4;
            const colWidth = (totalWidth - (gap * (columnsCount - 1))) / columnsCount;

            const startX = e.clientX;
            const initialWidth = widget.getBoundingClientRect().width;
            let lastSpan = parseInt(currentSize.split("-")[1]) || 1;

            const onMouseMove = (moveEvent) => {
                moveEvent.preventDefault();
                const dx = moveEvent.clientX - startX;
                const targetWidth = initialWidth + dx;
                
                // Determine new span count based on cursor position
                let candidateSpan = Math.round((targetWidth + gap/2) / (colWidth + gap));
                candidateSpan = Math.max(1, Math.min(4, candidateSpan));

                if (candidateSpan !== lastSpan) {
                    widget.classList.remove("grid-span-1", "grid-span-2", "grid-span-3", "grid-span-4");
                    widget.classList.add(`grid-span-${candidateSpan}`);
                    lastSpan = candidateSpan;
                }
            };

            const onMouseUp = () => {
                handle.classList.remove("resizing");
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);

                // Commit layout span
                const finalSize = `span-${lastSpan}`;
                state.settings.widgetSizes[widgetId] = finalSize;
                currentSize = finalSize;
                saveStateToStorage();

                // Scale charts immediately
                renderTrajectoryGraph();
                renderContributionCalendar();
            };

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });

        widget.appendChild(handle);
    });
}

function triggerConfetti() {
    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const colors = ["#2eaadc", "#9a6dd7", "#529e72", "#eb5757", "#df9b35", "#ff0055", "#00f2fe"];
    const particles = [];

    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height - height,
            r: Math.random() * 6 + 4,
            d: Math.random() * 150,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.random() * 10 - 5,
            tiltAngleIncremental: Math.random() * 0.07 + 0.02,
            tiltAngle: 0
        });
    }

    let animationId;
    let opacity = 1;

    function draw() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach((p, idx) => {
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
            p.x += Math.sin(p.tiltAngle);
            p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;

            ctx.beginPath();
            ctx.lineWidth = p.r;
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = opacity;
            ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
            ctx.stroke();
        });

        update();
    }

    function update() {
        let remaining = 0;
        particles.forEach(p => {
            if (p.y < height) remaining++;
        });

        if (remaining === 0) {
            opacity -= 0.02;
            if (opacity <= 0) {
                cancelAnimationFrame(animationId);
                canvas.remove();
                return;
            }
        }
        animationId = requestAnimationFrame(draw);
    }

    draw();
}

