const milestones = [
  { name: "Bronze", miles: 50, color: "var(--bronze)" },
  { name: "Silver", miles: 100, color: "var(--silver)" },
  { name: "Gold", miles: 150, color: "var(--gold)" },
  { name: "Platinum", miles: 200, color: "var(--platinum)" },
  { name: "Champion", miles: 250, color: "var(--champion)" },
];

const demoRunners = [
  {
    id: "runner-maya",
    name: "Maya Chen",
    age: 34,
    stravaConnected: true,
    active: true,
    runs: [
      { date: "2026-06-02", miles: 12.4, minutes: 102, source: "Strava" },
      { date: "2026-06-08", miles: 18.2, minutes: 151, source: "Strava" },
      { date: "2026-06-15", miles: 15.6, minutes: 128, source: "Manual" },
      { date: "2026-06-23", miles: 21.3, minutes: 184, source: "Strava" },
      { date: "2026-07-01", miles: 12.9, minutes: 108, source: "Strava" },
    ],
  },
  {
    id: "runner-luis",
    name: "Luis Ortega",
    age: 41,
    stravaConnected: true,
    active: true,
    runs: [
      { date: "2026-06-04", miles: 10.1, minutes: 88, source: "Strava" },
      { date: "2026-06-11", miles: 14.8, minutes: 130, source: "Strava" },
      { date: "2026-06-18", miles: 19.5, minutes: 168, source: "Strava" },
      { date: "2026-06-26", miles: 13.7, minutes: 118, source: "Manual" },
      { date: "2026-07-02", miles: 16.1, minutes: 141, source: "Strava" },
    ],
  },
  {
    id: "runner-nia",
    name: "Nia Brooks",
    age: 29,
    stravaConnected: false,
    active: true,
    runs: [
      { date: "2026-06-06", miles: 7.4, minutes: 71, source: "Manual" },
      { date: "2026-06-14", miles: 11.6, minutes: 106, source: "Manual" },
      { date: "2026-06-22", miles: 9.8, minutes: 93, source: "Manual" },
      { date: "2026-06-30", miles: 13.2, minutes: 123, source: "Manual" },
    ],
  },
  {
    id: "runner-eli",
    name: "Eli Patterson",
    age: 37,
    stravaConnected: true,
    active: true,
    runs: [
      { date: "2026-06-01", miles: 20.2, minutes: 178, source: "Strava" },
      { date: "2026-06-10", miles: 17.1, minutes: 154, source: "Strava" },
      { date: "2026-06-19", miles: 16.4, minutes: 149, source: "Strava" },
      { date: "2026-06-28", miles: 20.9, minutes: 187, source: "Strava" },
    ],
  },
];

const storageKey = "milestoneRaceTracker.runners.v1";
const apiBase = "/api";
const apiAvailable = location.protocol !== "file:";
const today = new Date().toISOString().slice(0, 10);
let usingApi = apiAvailable;
let runners = apiAvailable ? [] : loadRunners();
let selectedRunnerId = null;

const els = {
  activeCount: document.querySelector("#activeCount"),
  closeDialog: document.querySelector("#closeDialog"),
  connectStrava: document.querySelector("#connectStrava"),
  dialogBackdrop: document.querySelector("#runnerDialog"),
  dialogLastRun: document.querySelector("#dialogLastRun"),
  dialogMeta: document.querySelector("#dialogMeta"),
  dialogMiles: document.querySelector("#dialogMiles"),
  dialogRank: document.querySelector("#dialogRank"),
  dialogTime: document.querySelector("#dialogTime"),
  dialogTitle: document.querySelector("#dialogTitle"),
  disconnectButton: document.querySelector("#disconnectButton"),
  disconnectedList: document.querySelector("#disconnectedList"),
  heroLeadMeta: document.querySelector("#heroLeadMeta"),
  heroLeader: document.querySelector("#heroLeader"),
  leaderboard: document.querySelector("#leaderboard"),
  manualForm: document.querySelector("#manualRunForm"),
  manualHours: document.querySelector("#manualHours"),
  manualMiles: document.querySelector("#manualMiles"),
  manualMinutes: document.querySelector("#manualMinutes"),
  milestoneList: document.querySelector("#milestoneList"),
  nextPrize: document.querySelector("#nextPrize"),
  resetButton: document.querySelector("#resetButton"),
  runnerAge: document.querySelector("#runnerAge"),
  runnerForm: document.querySelector("#runnerForm"),
  runnerGrid: document.querySelector("#runnerGrid"),
  runnerName: document.querySelector("#runnerName"),
  syncButton: document.querySelector("#syncButton"),
  totalMedals: document.querySelector("#totalMedals"),
  totalMiles: document.querySelector("#totalMiles"),
};

function loadRunners() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return cloneDemoRunners();

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : cloneDemoRunners();
  } catch {
    return cloneDemoRunners();
  }
}

function cloneDemoRunners() {
  return JSON.parse(JSON.stringify(demoRunners));
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `runner-${globalThis.crypto.randomUUID()}`;
  }

  return `runner-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveRunners() {
  if (usingApi) return;
  localStorage.setItem(storageKey, JSON.stringify(runners));
}

async function init() {
  if (apiAvailable) {
    try {
      await refreshFromApi();
    } catch (error) {
      usingApi = false;
      runners = loadRunners();
      console.warn("Using local demo data because the API is unavailable.", error);
    }
  }

  updateModeControls();
  render();
}

function updateModeControls() {
  els.resetButton.textContent = usingApi ? "Reload data" : "Reset demo";
}

async function refreshFromApi() {
  applyApiState(await apiFetch("/state"));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "API request failed");
  return data;
}

function applyApiState(data) {
  if (Array.isArray(data.runners)) {
    runners = data.runners;
  }
}

function getRunnerTotals(runner) {
  const miles = runner.runs.reduce((sum, run) => sum + Number(run.miles), 0);
  const minutes = runner.runs.reduce((sum, run) => sum + Number(run.minutes), 0);
  const lastRun = runner.runs
    .map((run) => run.date)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  const earned = milestones.filter((milestone) => miles >= milestone.miles);
  const nextMilestone = milestones.find((milestone) => miles < milestone.miles) ?? null;

  return {
    miles,
    minutes,
    lastRun,
    earned,
    nextMilestone,
  };
}

function getSortedActiveRunners() {
  return runners
    .filter((runner) => runner.active)
    .map((runner) => ({ runner, totals: getRunnerTotals(runner) }))
    .sort((a, b) => {
      if (b.totals.miles !== a.totals.miles) return b.totals.miles - a.totals.miles;
      return a.totals.minutes - b.totals.minutes;
    });
}

function formatMiles(miles) {
  return `${miles.toFixed(1)} mi`;
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function formatDate(dateString) {
  if (!dateString) return "No runs yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${dateString}T12:00:00`),
  );
}

function getPaceLabel(minutes, miles) {
  if (!miles) return "No pace yet";
  const pace = minutes / miles;
  const paceMinutes = Math.floor(pace);
  const paceSeconds = Math.round((pace - paceMinutes) * 60);
  return `${paceMinutes}:${String(paceSeconds).padStart(2, "0")} / mi`;
}

function render() {
  renderMilestones();
  renderSummary();
  renderLeaderboard();
  renderRunnerCards();
  renderDisconnected();
  if (selectedRunnerId) renderDialog();
  saveRunners();
}

function renderMilestones() {
  els.milestoneList.innerHTML = milestones
    .map(
      (milestone) => `
        <article class="milestone-item">
          <span class="milestone-swatch" style="background:${milestone.color}"></span>
          <div>
            <strong>${milestone.name}</strong>
            <span>${milestone.miles} miles</span>
          </div>
          <span>${milestone.miles} mi</span>
        </article>
      `,
    )
    .join("");
}

function renderSummary() {
  const active = getSortedActiveRunners();
  const activeTotals = active.map(({ totals }) => totals);
  const totalMiles = activeTotals.reduce((sum, totals) => sum + totals.miles, 0);
  const medalCount = activeTotals.reduce((sum, totals) => sum + totals.earned.length, 0);
  const leader = active[0];
  const nextPrize = milestones.find((milestone) =>
    activeTotals.some((totals) => totals.miles < milestone.miles),
  );

  els.activeCount.textContent = active.length;
  els.totalMiles.textContent = totalMiles.toFixed(1);
  els.totalMedals.textContent = medalCount;
  els.nextPrize.textContent = nextPrize ? nextPrize.name : "Complete";

  if (leader) {
    els.heroLeader.textContent = leader.runner.name;
    els.heroLeadMeta.textContent = `${formatMiles(leader.totals.miles)} in ${formatTime(
      leader.totals.minutes,
    )}`;
  } else {
    els.heroLeader.textContent = "No active runners";
    els.heroLeadMeta.textContent = "Add a runner to start the race";
  }
}

function renderLeaderboard() {
  const active = getSortedActiveRunners();

  if (!active.length) {
    els.leaderboard.innerHTML = `<div class="empty-state">No active runners on the dashboard.</div>`;
    return;
  }

  els.leaderboard.innerHTML = active
    .map(({ runner, totals }, index) => {
      const medalLabel = totals.earned.length
        ? `${totals.earned.length} medal${totals.earned.length === 1 ? "" : "s"}`
        : "No medals yet";
      const next = totals.nextMilestone
        ? `${Math.max(totals.nextMilestone.miles - totals.miles, 0).toFixed(1)} mi to ${
            totals.nextMilestone.name
          }`
        : "Champion reached";

      return `
        <article class="leader-row">
          <span class="rank-badge">#${index + 1}</span>
          <div class="leader-name">
            <strong>${runner.name}</strong>
            <span class="leader-meta">Age ${runner.age} · ${medalLabel} · ${next}</span>
          </div>
          <div class="leader-stat">
            <strong>${formatMiles(totals.miles)}</strong>
            <span>Distance</span>
          </div>
          <div class="leader-stat">
            <strong>${formatTime(totals.minutes)}</strong>
            <span>Tiebreak time</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRunnerCards() {
  const active = getSortedActiveRunners();

  if (!active.length) {
    els.runnerGrid.innerHTML = "";
    return;
  }

  els.runnerGrid.innerHTML = active
    .map(({ runner, totals }, index) => {
      const progress = Math.min((totals.miles / milestones.at(-1).miles) * 100, 100);
      const next = totals.nextMilestone
        ? `${Math.max(totals.nextMilestone.miles - totals.miles, 0).toFixed(1)} miles to ${
            totals.nextMilestone.name
          }`
        : "Champion distance complete";

      return `
        <article class="runner-card">
          <div class="runner-card-header">
            <div>
              <span class="mini-label">#${index + 1}</span>
              <h3>${runner.name}</h3>
              <p>Age ${runner.age} · ${next}</p>
            </div>
            <span class="status-pill ${runner.stravaConnected ? "connected" : "manual"}">
              ${runner.stravaConnected ? "Strava linked" : "Manual"}
            </span>
          </div>

          <div class="progress-track" aria-label="${runner.name} progress to Champion">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>

          <div class="runner-stats">
            <article>
              <span>Miles</span>
              <strong>${formatMiles(totals.miles)}</strong>
            </article>
            <article>
              <span>Time</span>
              <strong>${formatTime(totals.minutes)}</strong>
            </article>
            <article>
              <span>Last run</span>
              <strong>${formatDate(totals.lastRun)}</strong>
            </article>
          </div>

          <div class="medal-row">
            ${milestones
              .map(
                (milestone) => `
                  <span class="medal-chip ${milestone.name.toLowerCase()} ${
                    totals.miles >= milestone.miles ? "earned" : ""
                  }"
                    style="${totals.miles >= milestone.miles ? `background:${milestone.color}` : ""}">
                    ${milestone.name}
                  </span>
                `,
              )
              .join("")}
          </div>

          <div class="runner-actions">
            <button class="details-button" type="button" data-open-runner="${runner.id}">Edit</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDisconnected() {
  const disconnected = runners.filter((runner) => !runner.active);

  if (!disconnected.length) {
    els.disconnectedList.innerHTML = `<div class="empty-state">No disconnected runners.</div>`;
    return;
  }

  els.disconnectedList.innerHTML = disconnected
    .map(
      (runner) => `
        <div class="disconnected-runner">
          <strong>${runner.name}</strong>
          <button type="button" data-reconnect-runner="${runner.id}">Reconnect</button>
        </div>
      `,
    )
    .join("");
}

function renderDialog() {
  const sorted = getSortedActiveRunners();
  const activeIndex = sorted.findIndex(({ runner }) => runner.id === selectedRunnerId);
  const runner = runners.find((item) => item.id === selectedRunnerId);

  if (!runner) {
    closeDialog();
    return;
  }

  const totals = getRunnerTotals(runner);
  els.dialogRank.textContent = activeIndex >= 0 ? `#${activeIndex + 1}` : "Off";
  els.dialogTitle.textContent = runner.name;
  els.dialogMeta.textContent = `Age ${runner.age} · ${
    runner.stravaConnected ? "Strava account connected" : "Manual logging only"
  } · ${getPaceLabel(totals.minutes, totals.miles)}`;
  els.dialogMiles.textContent = formatMiles(totals.miles);
  els.dialogTime.textContent = formatTime(totals.minutes);
  els.dialogLastRun.textContent = formatDate(totals.lastRun);
  els.disconnectButton.disabled = !runner.active;
  els.disconnectButton.textContent = runner.active
    ? "Disconnect from dashboard"
    : "Already disconnected";
}

function openDialog(runnerId) {
  selectedRunnerId = runnerId;
  renderDialog();
  els.dialogBackdrop.classList.add("is-open");
  els.dialogBackdrop.setAttribute("aria-hidden", "false");
  els.manualMiles.focus();
}

function closeDialog() {
  selectedRunnerId = null;
  els.dialogBackdrop.classList.remove("is-open");
  els.dialogBackdrop.setAttribute("aria-hidden", "true");
  els.manualForm.reset();
  els.manualHours.value = "0";
  els.manualMinutes.value = "30";
}

function addRun(runnerId, miles, minutes, source) {
  const runner = runners.find((item) => item.id === runnerId);
  if (!runner) return;
  runner.runs.push({ date: today, miles: Number(miles), minutes: Number(minutes), source });
  render();
}

function createRunner(name, age, stravaConnected) {
  return {
    id: createId(),
    name: name.trim(),
    age: Number(age),
    stravaConnected,
    active: true,
    runs: [],
  };
}

function simulateStravaSync() {
  const candidates = runners.filter((runner) => runner.active && runner.stravaConnected);
  if (!candidates.length) return;

  candidates.forEach((runner, index) => {
    const miles = Number((2.4 + ((index + runner.name.length) % 5) * 0.7).toFixed(1));
    const minutes = Math.round(miles * (8.2 + (index % 3) * 0.6));
    runner.runs.push({ date: today, miles, minutes, source: "Strava" });
  });

  render();
}

async function resetDemo() {
  if (usingApi) {
    try {
      await refreshFromApi();
      closeDialog();
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  runners = cloneDemoRunners();
  closeDialog();
  render();
}

els.runnerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = els.runnerName.value.trim();
  if (!name) return;

  if (usingApi) {
    try {
      const data = await apiFetch("/runners", {
        method: "POST",
        body: JSON.stringify({
          name,
          age: els.runnerAge.value,
          connectStrava: els.connectStrava.checked,
        }),
      });

      if (data.connectUrl) {
        window.location.href = data.connectUrl;
        return;
      }

      applyApiState(data);
      els.runnerForm.reset();
      els.connectStrava.checked = true;
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  runners.push(createRunner(name, els.runnerAge.value, els.connectStrava.checked));
  els.runnerForm.reset();
  els.connectStrava.checked = true;
  render();
});

els.runnerGrid.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-runner]");

  if (openButton) {
    openDialog(openButton.dataset.openRunner);
  }
});

els.disconnectedList.addEventListener("click", async (event) => {
  const reconnectButton = event.target.closest("[data-reconnect-runner]");
  if (!reconnectButton) return;

  if (usingApi) {
    try {
      applyApiState(
        await apiFetch(`/runners/${reconnectButton.dataset.reconnectRunner}/reconnect`, {
          method: "POST",
        }),
      );
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const runner = runners.find((item) => item.id === reconnectButton.dataset.reconnectRunner);
  if (!runner) return;
  runner.active = true;
  render();
});

els.manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedRunnerId) return;

  const miles = Number(els.manualMiles.value);
  const minutes = Number(els.manualHours.value) * 60 + Number(els.manualMinutes.value);
  if (!miles || minutes <= 0) return;

  if (usingApi) {
    try {
      applyApiState(
        await apiFetch(`/runners/${selectedRunnerId}/manual`, {
          method: "POST",
          body: JSON.stringify({ miles, minutes }),
        }),
      );
      render();
      els.manualForm.reset();
      els.manualHours.value = "0";
      els.manualMinutes.value = "30";
      els.manualMiles.focus();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  addRun(selectedRunnerId, miles, minutes, "Manual");
  els.manualForm.reset();
  els.manualHours.value = "0";
  els.manualMinutes.value = "30";
  els.manualMiles.focus();
});

els.disconnectButton.addEventListener("click", async () => {
  const runner = runners.find((item) => item.id === selectedRunnerId);
  if (!runner) return;

  if (usingApi) {
    try {
      applyApiState(
        await apiFetch(`/runners/${selectedRunnerId}/disconnect`, {
          method: "POST",
        }),
      );
      closeDialog();
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  runner.active = false;
  closeDialog();
  render();
});

els.closeDialog.addEventListener("click", closeDialog);
els.dialogBackdrop.addEventListener("click", (event) => {
  if (event.target === els.dialogBackdrop) closeDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.dialogBackdrop.classList.contains("is-open")) {
    closeDialog();
  }
});

els.syncButton.addEventListener("click", async () => {
  if (usingApi) {
    try {
      applyApiState(await apiFetch("/sync", { method: "POST" }));
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  simulateStravaSync();
});
els.resetButton.addEventListener("click", resetDemo);

init();
