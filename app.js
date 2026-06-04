/* ==========================================================================
   TellMeWhatToDo - Core Application Logic
   ========================================================================== */

/**
 * APPLICATION STATE MANAGEMENT
 * We maintain a single source of truth for the application's data.
 * The state is loaded from localStorage on startup and saved back whenever it changes.
 */
let state = {
    tasks: [],       // Array of Task: { id, name, duration, priority, energy, location, category, createdAt }
    history: [],     // Array of HistoryItem: { id, taskId, name, duration, category, completedAt, method }
    settings: {
        username: "Productive User",
        dailyFocusTarget: 2.0, // in hours
        geminiApiKey: ""
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
        startedAt: null
    }
};

// Default preset tasks to give the user a quick starting point
const PRESET_TASKS = [
    { id: "preset-1", name: "Organize desktop files & clean keyboard", duration: 15, priority: "medium", energy: "low", location: "home", category: "Life", createdAt: Date.now() - 600000 },
    { id: "preset-2", name: "Read a technical blog post or newsletter", duration: 20, priority: "low", energy: "medium", location: "anywhere", category: "Study", createdAt: Date.now() - 500000 },
    { id: "preset-3", name: "Write code for core functional modules", duration: 60, priority: "high", energy: "high", location: "work", category: "Work", createdAt: Date.now() - 400000 },
    { id: "preset-4", name: "Full-body stretching & posture correction", duration: 10, priority: "medium", energy: "low", location: "anywhere", category: "Health", createdAt: Date.now() - 300000 },
    { id: "preset-5", name: "Review team pull requests and issues", duration: 30, priority: "high", energy: "medium", location: "work", category: "Work", createdAt: Date.now() - 200000 },
    { id: "preset-6", name: "Stock pantry items & run minor errands", duration: 45, priority: "low", energy: "medium", location: "errands", category: "Errands", createdAt: Date.now() - 100000 }
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
            state.settings = parsed.settings || { username: "Productive User", dailyFocusTarget: 2.0, geminiApiKey: "" };
            state.currentStreak = parsed.currentStreak || 0;
            state.bestStreak = parsed.bestStreak || 0;
        } else {
            // Seed defaults
            state.tasks = [...PRESET_TASKS];
            state.history = [];
            state.settings = {
                username: "Productive User",
                dailyFocusTarget: 2.0,
                geminiApiKey: ""
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
            geminiBtn.title = "Personalized recommendation by Gemini 1.5 Flash";
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
    // Filter out tasks that exceed time constraints
    const eligibleTasks = state.tasks.filter(t => t.duration <= timeAvailable);
    
    if (eligibleTasks.length === 0) return null;
    
    let scoredTasks = eligibleTasks.map(task => {
        let score = 0;
        
        // 1. Location / Context Score (+3 points if matches or is anywhere)
        if (task.location === locationContext || task.location === "anywhere") {
            score += 3.0;
        }
        
        // 2. Energy Fit Score (+2 points if exact matching)
        if (task.energy === energyLevel) {
            score += 2.0;
        } else if (
            (energyLevel === "medium" && (task.energy === "low" || task.energy === "high")) ||
            (energyLevel === "high" && task.energy === "medium") ||
            (energyLevel === "low" && task.energy === "medium")
        ) {
            // Soft energy proximity check (+0.75 points)
            score += 0.75;
        }
        
        // 3. Priority Weighting Score
        if (task.priority === "high") {
            score += 3.0;
        } else if (task.priority === "medium") {
            score += 1.5;
        } else {
            score += 0.0;
        }
        
        return { task, score };
    });
    
    // Sort descending by score. In case of ties, sort by priority, then creation date (newer first)
    scoredTasks.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        
        const priorityVal = { high: 3, medium: 2, low: 1 };
        const pDiff = priorityVal[b.task.priority] - priorityVal[a.task.priority];
        if (pDiff !== 0) return pDiff;
        
        return b.task.createdAt - a.task.createdAt;
    });
    
    return scoredTasks[0];
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

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
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
    
    // Initialize Timer Settings
    state.timer.duration = task.duration * 60; // Minutes to seconds
    state.timer.timeLeft = state.timer.duration;
    state.timer.isPaused = false;
    state.timer.startedAt = Date.now();
    
    // Toggle active containers
    document.getElementById("suggestion-result-container").classList.add("hidden");
    document.getElementById("timer-task-title").textContent = task.name;
    document.getElementById("focus-timer-container").classList.remove("hidden");
    
    // Update Timer Displays
    updateTimerUI();
    
    // Run Timer loop
    state.timer.intervalId = setInterval(timerTick, 1000);
    
    // Update Pause Button state (showing pause icon)
    setTimerPlayPauseIcon(true);
    
    showToast(`Timer started for "${task.name}". Happy focusing!`);
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
    
    const confirmQuit = confirm("Are you sure you want to quit this focus session? No progress will be saved to your logs.");
    if (!confirmQuit) return;
    
    // Clear Timer
    if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
    }
    
    state.focusedTask = null;
    
    // Hide Timer View, show CTA
    document.getElementById("focus-timer-container").classList.add("hidden");
    document.querySelector(".cta-card").classList.remove("hidden");
    
    renderAllViews();
    showToast("Session cancelled.");
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
        // Nothing view-specific besides stats
    } else if (state.activeView === "tasks") {
        renderTasksList();
        populateCategoryFilterDropdown();
    } else if (state.activeView === "history") {
        renderHistoryList();
        renderHistoryStats();
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
}

/**
 * TASKS MANAGER CONTROLS
 */
function handleAddTaskSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById("task-name").value.trim();
    const duration = parseInt(document.getElementById("task-duration").value, 10);
    const priority = document.getElementById("task-priority").value;
    const energy = document.getElementById("task-energy").value;
    const location = document.getElementById("task-location").value;
    const category = document.getElementById("task-category").value.trim() || "General";
    
    if (!name) return;
    
    const newTask = {
        id: "task-" + Date.now(),
        name,
        duration,
        priority,
        energy,
        location,
        category,
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
    
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;
    
    state.tasks[taskIndex] = {
        ...state.tasks[taskIndex],
        name,
        duration,
        priority,
        energy,
        location,
        category
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
}

function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const username = document.getElementById("settings-username").value.trim() || "Productive User";
    const dailyTarget = parseFloat(document.getElementById("settings-daily-target").value) || 2.0;
    const geminiKey = document.getElementById("settings-gemini-key").value.trim();
    
    state.settings.username = username;
    state.settings.dailyFocusTarget = dailyTarget;
    state.settings.geminiApiKey = geminiKey;
    
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
        indicator.textContent = "🔑 Gemini AI Active (Gemini 1.5 Flash)";
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
    reader.onload = function(event) {
        try {
            const importedState = JSON.parse(event.target.result);
            
            // Standard validation of schema structures
            if (importedState && Array.isArray(importedState.tasks) && Array.isArray(importedState.history) && importedState.settings) {
                state.tasks = importedState.tasks;
                state.history = importedState.history;
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
        settings: {
            username: "Productive User",
            dailyFocusTarget: 2.0,
            geminiApiKey: ""
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
            startedAt: null
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

// Start the application when the DOM is fully parsed and loaded
window.addEventListener("DOMContentLoaded", initApp);
