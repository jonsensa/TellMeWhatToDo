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
        geminiApiKey: "",
        favCharacter: "Yoda",
        motivationVibe: "stoic"
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
    updateDateDisplay();
    renderAllViews();
    checkAndUpdateStreak();
    
    // Update API indicator status on startup
    updateApiKeyIndicator();
    
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
                geminiApiKey: "",
                favCharacter: "Yoda",
                motivationVibe: "stoic",
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
                dailyFocusTarget: 2.0,
                geminiApiKey: "",
                favCharacter: "Yoda",
                motivationVibe: "stoic"
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
    setupOptionGridToggles("engine-options");

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
    document.getElementById("toggle-key-visibility").addEventListener("click", toggleApiKeyVisibility);

    // Backup & Data management triggers
    document.getElementById("export-data-btn").addEventListener("click", exportDataJSON);
    document.getElementById("import-data-trigger").addEventListener("click", () => {
        document.getElementById("import-data-file").click();
    });
    document.getElementById("import-data-file").addEventListener("change", importDataJSON);
    document.getElementById("factory-reset-btn").addEventListener("click", factoryResetData);
    
    // Weekly Tasks list
    document.getElementById("add-weekly-form").addEventListener("submit", handleAddWeeklySubmit);
    
    // Brainstorm/Research helper
    document.getElementById("brainstorm-trigger-btn").addEventListener("click", handleBrainstormSubmit);
    
    // Monthly Goals addition
    document.getElementById("add-monthly-goal-btn").addEventListener("click", handleAddMonthlyGoalSubmit);
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
        populateBrainstormTaskSelect();
    } else if (viewName === "tasks") {
        renderTasksList();
        renderWeeklyTasksList();
        populateCategoryFilterDropdown();
    } else if (viewName === "history") {
        renderHistoryList();
        renderHistoryStats();
        renderTrajectoryGraph();
    } else if (viewName === "settings") {
        loadSettingsToForm();
        renderMonthlyGoalsList();
    }
}

/**
 * MODAL MANAGER HELPERS
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // If it is the questionnaire, select default or match API status
    if (modalId === "questionnaire-modal") {
        const geminiBtn = document.getElementById("gemini-engine-btn");
        if (!state.settings.geminiApiKey) {
            geminiBtn.setAttribute("disabled", "true");
            geminiBtn.title = "Configure Gemini API key in Settings to activate AI mode";

            // Revert selection if it was somehow set to gemini
            const localBtn = document.querySelector('#engine-options [data-value="local"]');
            if (localBtn) {
                document.querySelectorAll("#engine-options .option-btn").forEach(b => b.classList.remove("active"));
                localBtn.classList.add("active");
            }
        } else {
            geminiBtn.removeAttribute("disabled");
            geminiBtn.title = "Personalized recommendation by Gemini 2.0 Flash";
        }
    }

    modal.classList.remove("hidden");
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
 * GEMINI API INTEGRATION (AI SUGGESTIONS)
 */
async function fetchGeminiSuggestion(timeAvailable, energyLevel, locationContext, eligibleTasks) {
    const apiKey = state.settings.geminiApiKey;
    if (!apiKey) {
        throw new Error("API Key missing. Enter key in Settings.");
    }

    // Format options context for prompt
    const contextPrompt = `Available Time: ${timeAvailable} minutes, Energy Level: ${energyLevel}, Location/Context: ${locationContext}.`;

    // Format tasks for LLM context
    const tasksData = eligibleTasks.map(t => ({
        id: t.id,
        name: t.name,
        duration: `${t.duration}m`,
        priority: t.priority,
        energy: t.energy,
        location: t.location,
        category: t.category
    }));

    const prompt = `You are a smart personal productivity system selector.
Based on the user's current situation:
- ${contextPrompt}

Here is a list of candidate tasks in JSON format:
${JSON.stringify(tasksData)}

Instructions:
1. Select the single best task for the user's situation from the list.
2. If multiple tasks fit well, prioritize higher importance/priority, location match, and the closest duration match.
3. You MUST return your choice in a strict JSON format with exactly two fields:
{
  "taskId": "the ID of the selected task",
  "reason": "A highly motivating, friendly sentence explaining why this fits their current status under 100 characters."
}
4. Do not wrap the JSON output in markdown blocks (e.g. do not write \`\`\`json). Return the raw JSON object string only.`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || `HTTP error ${response.status}`;
        throw new Error(`Gemini Server: ${message}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
        throw new Error("Empty response received from Gemini.");
    }

    // Sanitize in case Gemini wrapped response in markdown code fences
    let cleanJson = resultText.trim();
    if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```(json)?/, "").replace(/```$/, "").trim();
    }

    const selection = JSON.parse(cleanJson);

    if (!selection.taskId) {
        throw new Error("Response JSON did not contain 'taskId'.");
    }

    return selection;
}

/**
 * QUESTIONNAIRE SUBMISSION ROUTINE
 */
async function handleQuestionnaireSubmit(e) {
    e.preventDefault();

    const timeVal = parseInt(getSelectedOptionValue("time-options"), 10);
    const energyVal = getSelectedOptionValue("energy-options");
    const locationVal = getSelectedOptionValue("location-options");
    const engineVal = getSelectedOptionValue("engine-options");

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

    // Show temporary spinner placeholder
    showToast("Processing recommendations...");

    if (engineVal === "gemini") {
        try {
            const aiSuggestion = await fetchGeminiSuggestion(timeVal, energyVal, locationVal, eligibleTasks);
            const matchedTask = state.tasks.find(t => t.id === aiSuggestion.taskId);

            if (matchedTask) {
                displaySuggestion(matchedTask, aiSuggestion.reason, "Gemini AI");
            } else {
                // Fallback if AI picked invalid ID
                fallbackToHeuristic(timeVal, energyVal, locationVal, "Gemini selected invalid task ID.");
            }
        } catch (error) {
            console.error("AI Suggestion failed:", error);
            fallbackToHeuristic(timeVal, energyVal, locationVal, `AI Engine Error: ${error.message}. Loaded local match.`);
        }
    } else {
        // Run Local Heuristic
        const result = matchTaskHeuristic(timeVal, energyVal, locationVal);
        if (result) {
            displaySuggestion(result.task, getHeuristicReasonText(result.task, energyVal, locationVal), "Heuristic Match");
        } else {
            showToast("No tasks fit your criteria.", true);
        }
    }
}

function fallbackToHeuristic(timeVal, energyVal, locationVal, errorMessage) {
    showToast(errorMessage, true);
    const result = matchTaskHeuristic(timeVal, energyVal, locationVal);
    if (result) {
        displaySuggestion(result.task, getHeuristicReasonText(result.task, energyVal, locationVal) + " (AI Fallback)", "Heuristic Match");
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
    
    // Inject fictional companion quote block
    injectFictionalQuote(task);
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
    // Circumference = 603
    const circle = document.getElementById("timer-progress-ring");
    if (circle) {
        const offset = 603 - (603 * (state.timer.timeLeft / state.timer.duration));
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
    const elapsedMins = Math.max(1, Math.round(elapsedSeconds / 60)); // Minimum of 1 min for completed logs

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

    showToast(`Conquered: "${task.name}"! Logged ${elapsedMins}m focus time.`);
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
        populateBrainstormTaskSelect();
    } else if (state.activeView === "tasks") {
        renderTasksList();
        renderWeeklyTasksList();
        populateCategoryFilterDropdown();
    } else if (state.activeView === "history") {
        renderHistoryList();
        renderHistoryStats();
        renderTrajectoryGraph();
    } else if (state.activeView === "settings") {
        loadSettingsToForm();
        renderMonthlyGoalsList();
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
    const requiresTimer = document.getElementById("task-requires-timer").checked;

    // Explicit validation with user-facing feedback (instead of silent HTML5 blocks)
    if (!name) {
        showToast("Please enter a task name.", true);
        return;
    }

    if (isNaN(durationRaw) || durationRaw < 5 || durationRaw > 360) {
        showToast("Duration must be between 5 and 360 minutes.", true);
        return;
    }

    const duration = durationRaw;

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

    openModal("edit-task-modal");
}

function handleEditTaskSubmit(e) {
    e.preventDefault();

    const id = document.getElementById("edit-task-id").value;
    const name = document.getElementById("edit-task-name").value.trim();
    const duration = parseInt(document.getElementById("edit-task-duration").value, 10);
    const priority = document.getElementById("edit-task-priority").value;
    const energy = document.getElementById("edit-task-energy").value;
    const location = document.getElementById("edit-task-location").value;
    const category = document.getElementById("edit-task-category").value.trim() || "General";
    const requiresTimer = document.getElementById("edit-task-requires-timer").checked;

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
                <span>⏱️ +${item.duration}m</span>
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
    document.getElementById("settings-gemini-key").value = state.settings.geminiApiKey || "";
    document.getElementById("settings-fav-character").value = state.settings.favCharacter || "Yoda";
    document.getElementById("settings-motivation-vibe").value = state.settings.motivationVibe || "stoic";
}

function handleSettingsSubmit(e) {
    e.preventDefault();

    const username = document.getElementById("settings-username").value.trim() || "Productive User";
    const dailyTarget = parseFloat(document.getElementById("settings-daily-target").value) || 2.0;
    const geminiKey = document.getElementById("settings-gemini-key").value.trim();
    const favCharacter = document.getElementById("settings-fav-character").value.trim() || "Yoda";
    const motivationVibe = document.getElementById("settings-motivation-vibe").value;

    state.settings.username = username;
    state.settings.dailyFocusTarget = dailyTarget;
    state.settings.geminiApiKey = geminiKey;
    state.settings.favCharacter = favCharacter;
    state.settings.motivationVibe = motivationVibe;

    saveStateToStorage();

    // Update visual badge displays
    document.getElementById("sidebar-user-name").textContent = username;
    document.getElementById("sidebar-avatar").textContent = username.charAt(0).toUpperCase();

    // Update API Key Status
    updateApiKeyIndicator();

    // Rerender headers
    renderHeaderWidgets();
    renderDashboardStats();

    showToast("Settings updated successfully.");
}

function updateApiKeyIndicator() {
    const indicator = document.getElementById("key-status-indicator");
    if (!indicator) return;

    if (state.settings.geminiApiKey) {
        indicator.textContent = "🔑 Gemini AI Active (Gemini 2.0 Flash)";
        indicator.className = "api-key-status api-key-configured";
    } else {
        indicator.textContent = "🔑 Key not configured (local heuristics active)";
        indicator.className = "api-key-status";
    }
}

function toggleApiKeyVisibility() {
    const input = document.getElementById("settings-gemini-key");
    const btn = document.getElementById("toggle-key-visibility");

    if (input.type === "password") {
        input.type = "text";
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    } else {
        input.type = "password";
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
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
            geminiApiKey: "",
            favCharacter: "Yoda",
            motivationVibe: "stoic"
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
    state.weeklyTasks[idx].completed = !state.weeklyTasks[idx].completed;
    saveStateToStorage();
    renderWeeklyTasksList();
}

function deleteWeeklyTask(id) {
    state.weeklyTasks = state.weeklyTasks.filter(item => item.id !== id);
    saveStateToStorage();
    renderWeeklyTasksList();
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
        <!-- Gradients -->
        <defs>
            <linearGradient id="chart-gradient-indigo-purple" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="var(--color-accent-purple)" />
                <stop offset="100%" stop-color="var(--color-primary)" />
            </linearGradient>
            <linearGradient id="chart-gradient-cyan" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="var(--color-accent-cyan)" />
                <stop offset="100%" stop-color="var(--color-primary)" />
            </linearGradient>
        </defs>
        
        <!-- Y Axis Gridline (100% Target Goal) -->
        <line x1="${paddingLeft}" y1="${paddingTop}" x2="${svgWidth - paddingRight}" y2="${paddingTop}" stroke="rgba(99, 102, 241, 0.15)" stroke-dasharray="3,3" stroke-width="1" />
        <text x="${paddingLeft - 6}" y="${paddingTop + 4}" font-family="Outfit" font-size="9px" fill="var(--color-primary)" text-anchor="end">100%</text>
        
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
            // Filled bar (gradient fill)
            const fillGradient = pct >= 100 ? "url(#chart-gradient-cyan)" : "url(#chart-gradient-indigo-purple)";
            svgHtml += `
                <rect class="chart-bar-rect" x="${barLeft}" y="${barY}" width="${barWidth}" height="${fillHeight}" fill="${fillGradient}" rx="3" />
            `;
        }

        // Percentage text label above bar
        svgHtml += `
            <text class="chart-text-pct" x="${colCenter}" y="${barY - 6}" fill="${pct >= 100 ? 'var(--color-accent-cyan)' : 'var(--text-secondary)'}">${pct}%</text>
        `;

        // Weekday X-axis text label
        svgHtml += `
            <text class="chart-text-lbl" x="${colCenter}" y="${svgHeight - 4}">${label}</text>
        `;
    }

    svg.innerHTML = svgHtml;
}

// Fictional quotes for suggestion cards
async function injectFictionalQuote(task) {
    const quoteContainerId = "character-quote-container";
    
    // Remove previous quote box if any
    let quoteBox = document.getElementById(quoteContainerId);
    if (quoteBox) quoteBox.remove();

    // Create quote box
    quoteBox = document.createElement("div");
    quoteBox.id = quoteContainerId;
    quoteBox.className = "character-quote-box";
    quoteBox.innerHTML = `<strong>${state.settings.favCharacter || "Yoda"}</strong><em>"Loading words of wisdom..."</em>`;
    
    // Insert before the action buttons in the suggestion card
    const cardActions = document.querySelector(".suggestion-card .card-actions");
    cardActions.parentNode.insertBefore(quoteBox, cardActions);

    const character = state.settings.favCharacter || "Yoda";
    const vibe = state.settings.motivationVibe || "stoic";
    const apiKey = state.settings.geminiApiKey;

    if (!apiKey) {
        // Local fallback quotes if no API Key
        const localQuotes = {
            "yoda": `Do or do not. There is no try. Conquer "${task.name}", you must. Strong in the force, you will become!`,
            "batman": `It's not who I am underneath, but what I do that defines me. Stop procrastinating and complete "${task.name}". The city needs you.`,
            "gandalf": `All we have to decide is what to do with the time that is given us. Complete "${task.name}" now, my friend. A wizard is never late.`,
            "iron man": `Sometimes you gotta run before you can walk. Let's build something great. Starting with "${task.name}". Jarvis, cue the music.`
        };

        const charKey = character.toLowerCase();
        let fallbackText = `Focus on "${task.name}". It is the logical next step. Do not delay!`;
        
        for (const [key, quote] of Object.entries(localQuotes)) {
            if (charKey.includes(key)) {
                fallbackText = quote;
                break;
            }
        }

        quoteBox.innerHTML = `<strong>${character}</strong>"${fallbackText}"`;
        return;
    }

    try {
        const prompt = `Act as ${character}. Write a short, highly motivating quote or sentence in their exact voice/speech pattern encouraging the user to do their current task: "${task.name}".
The vibe style should be: "${vibe}".
Keep it under 110 characters. Do not wrap in quotation marks. Do not output anything else. Just the quote in character.`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (response.ok) {
            const data = await response.json();
            const quoteText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (quoteText) {
                quoteBox.innerHTML = `<strong>${character}</strong>"${quoteText.trim()}"`;
                return;
            }
        }
        quoteBox.innerHTML = `<strong>${character}</strong>"Focus, you must. Achieve "${task.name}"!"`;
    } catch (err) {
        console.warn("Fictional quote AI fetch failed:", err);
        quoteBox.innerHTML = `<strong>${character}</strong>"Focus, you must. Achieve "${task.name}"!"`;
    }
}

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
        date: dateStr
    };

    if (!state.monthlyGoals) state.monthlyGoals = [];
    state.monthlyGoals.push(newItem);
    saveStateToStorage();

    nameInput.value = "";
    dateInput.value = "";

    renderMonthlyGoalsList();
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

        const div = document.createElement("div");
        div.className = "goal-item";
        div.innerHTML = `
            <div class="goal-item-top">
                <span class="goal-item-name">${goal.name}</span>
                <span class="goal-item-days ${warningClass}">${daysStr}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                <span class="goal-item-date">📅 Target: ${deadline.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <button class="btn-action-icon delete-btn" style="width:24px; height:24px; color:var(--text-muted); border:none; padding:0; background:transparent;">
                    &times;
                </button>
            </div>
        `;

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

// Brainstorm Helper
function populateBrainstormTaskSelect() {
    const select = document.getElementById("brainstorm-task-select");
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = `<option value="">-- Choose a Task --</option>`;

    state.tasks.forEach(task => {
        select.innerHTML += `<option value="${task.id}">${task.name} (${task.duration}m)</option>`;
    });

    if (state.tasks.some(t => t.id === currentVal)) {
        select.value = currentVal;
    }
}

async function handleBrainstormSubmit() {
    const select = document.getElementById("brainstorm-task-select");
    const resultBox = document.getElementById("brainstorm-result-box");
    
    if (!select || !resultBox) return;

    const taskId = select.value;
    if (!taskId) {
        showToast("Please choose a task first.", true);
        return;
    }

    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    resultBox.innerHTML = "Thinking... Analyzing task breakdown...";
    resultBox.classList.remove("hidden");

    const apiKey = state.settings.geminiApiKey;

    if (!apiKey) {
        // Local mock brainstorm fallback
        setTimeout(() => {
            resultBox.innerHTML = `
                <div style="margin-bottom: 6px; font-weight: 600; color: var(--color-primary);">Offline Breakdown for "${task.name}":</div>
                <div class="brainstorm-item"><span class="brainstorm-item-num">1.</span> Split the task into 3 manageable chunks of 5-15 mins each.</div>
                <div class="brainstorm-item"><span class="brainstorm-item-num">2.</span> Clear your workspace, close social media tabs, and set a clean environment.</div>
                <div class="brainstorm-item"><span class="brainstorm-item-num">3.</span> Take the first action step immediately without overthinking.</div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; font-style: italic;">💡 Configure a Gemini API Key in Settings to get customized AI breakdowns.</div>
            `;
        }, 1000);
        return;
    }

    try {
        const prompt = `You are a personal productivity assistant. Break down the following task into 3-4 highly actionable, sequential, and bite-sized sub-steps:
Task Name: "${task.name}"
Category: "${task.category}"
Target Duration: ${task.duration} minutes
Priority: ${task.priority}

Please output the result in plain text format containing only the step lines. Format each line exactly like:
1. First action step
2. Second action step
Do not output any introductory or concluding text. Just the lines.`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.error?.message || `HTTP ${response.status}`;
            throw new Error(`Gemini Server: ${message}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("No text returned by API");
        }

        // Render steps
        const lines = text.trim().split("\n").filter(l => l.trim().length > 0);
        let html = `<div style="margin-bottom: 8px; font-weight: 600; color: var(--color-accent-cyan);">Action Steps for "${task.name}":</div>`;
        
        lines.forEach(line => {
            const cleaned = line.replace(/^\d+[\.\-\s]+/, "").trim();
            const num = line.match(/^\d+/);
            const numStr = num ? num[0] : "*";
            html += `<div class="brainstorm-item"><span class="brainstorm-item-num">${numStr}.</span> ${cleaned}</div>`;
        });

        resultBox.innerHTML = html;
    } catch (err) {
        console.error("Brainstorm failed:", err);
        resultBox.innerHTML = `<span style="color:var(--color-danger);">Failed to connect to AI: ${err.message}</span>`;
    }
}

// Start the application when the DOM is fully parsed and loaded
window.addEventListener("DOMContentLoaded", initApp);
