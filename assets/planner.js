(() => {
  "use strict";

  const DATA = window.INDOMITUS_PLANNER_DATA;
  if (!DATA?.nodes?.length) return;

  const STORAGE_KEY = "indomitus-tech-tree-planner-v1";
  const INITIAL_PARAMS = new URLSearchParams(window.location.search);
  const INITIAL_FACTION = INITIAL_PARAMS.get("faction");
  const INITIAL_RESEARCH = INITIAL_PARAMS.get("research");
  const STATUS_CLASSES = [
    "status-learned",
    "status-available",
    "status-path",
    "status-blocked",
    "status-missing",
  ];
  const STATUS_COLORS = {
    learned: "#58c985",
    available: "#62bce8",
    path: "#edc65d",
    blocked: "#677173",
    missing: "#e45d5d",
  };
  function normalize(value) {
    return value?.toLocaleLowerCase("en") || "";
  }

  const byKey = new Map(
    DATA.nodes.map((node) => [
      `${node.faction}:${normalize(node.id)}`,
      node,
    ]),
  );
  const edgeByKey = new Map(
    DATA.nodes.flatMap((node) =>
      node.requires.map((requirement) => [
        `${node.faction}:${node.id}-${requirement}`,
        {
          target: normalize(node.id),
          requirement: normalize(requirement),
        },
      ]),
    ),
  );
  const byFaction = {
    ig: DATA.nodes.filter((node) => node.faction === "ig"),
    tg: DATA.nodes.filter((node) => node.faction === "tg"),
  };
  const unlocks = new Map();
  const searchText = new Map();

  for (const node of DATA.nodes) {
    for (const requirement of node.requires) {
      const key = requirement.toLocaleLowerCase("en");
      if (!unlocks.has(key)) unlocks.set(key, []);
      unlocks.get(key).push(node);
    }

    searchText.set(
      `${node.faction}:${normalize(node.id)}`,
      [
        node.id,
        node.nameRu,
        node.nameEn,
        node.sectionRu,
        node.sectionEn,
        ...node.composition.items.flatMap((item) => [
          item.id,
          item.nameRu,
          item.nameEn,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ru"),
    );
  }

  function loadSavedState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  const saved = loadSavedState();
  const learned = {
    ig: new Set(Array.isArray(saved.learned?.ig) ? saved.learned.ig : []),
    tg: new Set(Array.isArray(saved.learned?.tg) ? saved.learned.tg : []),
  };
  const state = {
    planningEnabled: saved.planningEnabled !== false,
    compact: saved.compact === true,
    minimapCollapsed: saved.minimapCollapsed === true,
    viewport: saved.viewport || {},
    selectedId: null,
    selectionCleared: false,
    history: [],
    skipNextHistory: false,
    initialUrlApplied: false,
    initialUrlApplying: false,
    lastRestoredFaction: null,
    lastRestoredViewport: null,
    deferredInstallPrompt: null,
    scanQueued: false,
    searchActiveIndex: -1,
  };

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          planningEnabled: state.planningEnabled,
          compact: state.compact,
          minimapCollapsed: state.minimapCollapsed,
          learned: {
            ig: [...learned.ig],
            tg: [...learned.tg],
          },
          viewport: state.viewport,
        }),
      );
    } catch {
      // The tree remains fully usable when browser storage is unavailable.
    }
  }

  function isEnglish() {
    return Boolean(
      document.querySelector('.language-switch button[lang="en"].active'),
    );
  }

  function activeFaction() {
    const shell = document.querySelector(".app-shell");
    if (shell?.classList.contains("faction-tg")) return "tg";
    return "ig";
  }

  function nodeFor(id, faction = activeFaction()) {
    return byKey.get(`${faction}:${normalize(id)}`);
  }

  function labels() {
    return isEnglish()
      ? {
          planning: "Planning mode",
          planningNote: "Progress is saved in this browser",
          learned: "Learned",
          available: "Available now",
          path: "Target path",
          blocked: "Locked",
          missing: "Missing dependency",
          previous: "Previous",
          showAll: "Show all",
          showBranch: "Show branch",
          center: "Center selected",
          compact: state.compact ? "Expanded cards" : "Compact cards",
          minimap: "MINI-MAP",
          targetPlan: "Plan for selected research",
          targetPlanNote: "Every unique dependency is counted once",
          fullCost: "Full path",
          accounted: "Already learned",
          remaining: "Remaining",
          countedList: "Research included in this calculation",
          markLearned: "Mark learned",
          markUnlearned: "Mark unlearned",
          copyName: "Name",
          copyId: "ID",
          copyComposition: "Composition",
          copyLink: "Link",
          copied: "Copied",
          unlocks: "What this research unlocks",
          unlocksTag: "Direct unlocks",
          noUnlocks: "No research in this tree directly depends on this node.",
          results: "results",
          shown: "shown",
          steam: "Steam mod",
          install: "Install app",
          installFallback:
            "Open the browser menu and choose “Install app” or “Create shortcut”.",
          clearProgress: "Clear progress",
          clearConfirm: "Clear all learned research for this faction?",
          selectedCleared: "Selection cleared",
          statusLearned: "LEARNED",
          statusAvailable: "AVAILABLE",
          statusPath: "TARGET PATH",
          statusBlocked: "LOCKED",
          statusMissing: "MISSING DEP.",
          purchase: "Purchase",
        }
      : {
          planning: "Режим «Планирование»",
          planningNote: "Прогресс сохраняется в этом браузере",
          learned: "Изучено",
          available: "Доступно сейчас",
          path: "Путь к цели",
          blocked: "Заблокировано",
          missing: "Нет зависимости",
          previous: "Назад",
          showAll: "Показать всё",
          showBranch: "Показать ветку",
          center: "Центрировать выбранное",
          compact: state.compact ? "Расширенные карточки" : "Компактные карточки",
          minimap: "МИНИ-КАРТА",
          targetPlan: "План выбранного исследования",
          targetPlanNote: "Каждая уникальная зависимость учитывается один раз",
          fullCost: "Вся цепочка",
          accounted: "Уже изучено",
          remaining: "Осталось",
          countedList: "Исследования, учтённые в расчёте",
          markLearned: "Отметить изученным",
          markUnlearned: "Снять отметку",
          copyName: "Название",
          copyId: "ID",
          copyComposition: "Состав",
          copyLink: "Ссылка",
          copied: "Скопировано",
          unlocks: "Что открывает это исследование",
          unlocksTag: "Прямые продолжения",
          noUnlocks:
            "От этого узла напрямую не зависит другое исследование в дереве.",
          results: "найдено",
          shown: "показано",
          steam: "Мод в Steam",
          install: "Установить приложение",
          installFallback:
            "Откройте меню браузера и выберите «Установить приложение» или «Создать ярлык».",
          clearProgress: "Сбросить прогресс",
          clearConfirm: "Удалить отметки об изучении для этой фракции?",
          selectedCleared: "Выбор сброшен",
          statusLearned: "ИЗУЧЕНО",
          statusAvailable: "ДОСТУПНО",
          statusPath: "ПУТЬ К ЦЕЛИ",
          statusBlocked: "ЗАКРЫТО",
          statusMissing: "НЕТ ЗАВИС.",
          purchase: "Покупка",
        };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCardId(card) {
    if (!card) return "";
    if (card.dataset.researchId) return card.dataset.researchId;
    const fiberProperty = Object.keys(card).find((name) =>
      name.startsWith("__reactFiber$"),
    );
    const id = card[fiberProperty || ""]?.key;
    if (id) card.dataset.researchId = id;
    return id || "";
  }

  function cardFor(id) {
    const key = normalize(id);
    return [...document.querySelectorAll(".research-card")].find(
      (card) => normalize(getCardId(card)) === key,
    );
  }

  function selectedNode() {
    return nodeFor(state.selectedId);
  }

  function pathFor(id) {
    const result = new Set();
    const faction = activeFaction();
    const visit = (currentId) => {
      const key = normalize(currentId);
      if (result.has(key)) return;
      const node = nodeFor(key, faction);
      if (!node) return;
      result.add(key);
      node.requires.forEach(visit);
    };
    visit(id);
    return result;
  }

  function orderedPathFor(id) {
    const visited = new Set();
    const result = [];
    const faction = activeFaction();
    const visit = (currentId) => {
      const key = normalize(currentId);
      if (visited.has(key)) return;
      const node = nodeFor(key, faction);
      if (!node) return;
      visited.add(key);
      node.requires.forEach(visit);
      result.push(node);
    };
    visit(id);
    return result;
  }

  function hasMissingRequirement(node) {
    return node.requires.some(
      (requirement) =>
        !byKey.has(`${node.faction}:${normalize(requirement)}`),
    );
  }

  function statusFor(node, selectedPath) {
    const factionLearned = learned[node.faction];
    if (hasMissingRequirement(node)) return "missing";
    if (factionLearned.has(normalize(node.id))) return "learned";
    if (selectedPath.has(normalize(node.id))) return "path";
    if (
      node.requires.every((requirement) =>
        factionLearned.has(normalize(requirement)),
      )
    ) {
      return "available";
    }
    return "blocked";
  }

  function statusLabel(status, copy) {
    return {
      learned: copy.statusLearned,
      available: copy.statusAvailable,
      path: copy.statusPath,
      blocked: copy.statusBlocked,
      missing: copy.statusMissing,
    }[status];
  }

  function scheduleScan() {
    if (state.scanQueued) return;
    state.scanQueued = true;
    requestAnimationFrame(() => {
      state.scanQueued = false;
      scan();
    });
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function ensurePlanningBar() {
    const shell = document.querySelector(".app-shell.view-tree");
    const controlDeck = shell?.querySelector(".control-deck");
    const workspace = shell?.querySelector(".workspace");
    if (!shell || !controlDeck || !workspace) return;

    let bar = shell.querySelector(":scope > .planning-bar");
    if (!bar) {
      bar = document.createElement("section");
      bar.className = "planning-bar";
      bar.innerHTML = `
        <label class="planning-mode-toggle">
          <input type="checkbox" data-planner-action="toggle-planning">
          <span class="toggle-track" aria-hidden="true"></span>
          <span><strong data-planning-title></strong><small data-planning-note></small></span>
        </label>
        <div class="planning-progress" data-planning-progress></div>
        <div class="planning-status-legend">
          <span class="learned"><i></i><b data-legend-learned></b></span>
          <span class="available"><i></i><b data-legend-available></b></span>
          <span class="path"><i></i><b data-legend-path></b></span>
          <span class="blocked"><i></i><b data-legend-blocked></b></span>
          <span class="missing"><i></i><b data-legend-missing></b></span>
        </div>`;
      workspace.insertAdjacentElement("beforebegin", bar);
      const checkbox = bar.querySelector('input[type="checkbox"]');
      checkbox.addEventListener("change", () => {
        state.planningEnabled = checkbox.checked;
        persist();
        scheduleScan();
      });
    }

    const copy = labels();
    const faction = activeFaction();
    const factionLearned = learned[faction];
    const selectedPath = pathFor(state.selectedId);
    const accounted = [...selectedPath].reduce((sum, id) => {
      const node = nodeFor(id, faction);
      return sum + (node && factionLearned.has(id) ? node.cost : 0);
    }, 0);
    const checkbox = bar.querySelector('input[type="checkbox"]');
    checkbox.checked = state.planningEnabled;
    setText(bar.querySelector("[data-planning-title]"), copy.planning);
    setText(bar.querySelector("[data-planning-note]"), copy.planningNote);
    setText(
      bar.querySelector("[data-planning-progress]"),
      `${copy.learned}: ${factionLearned.size}/${byFaction[faction].length}` +
        (state.selectedId ? ` · ${copy.accounted}: ${accounted} RP` : ""),
    );
    setText(bar.querySelector("[data-legend-learned]"), copy.learned);
    setText(bar.querySelector("[data-legend-available]"), copy.available);
    setText(bar.querySelector("[data-legend-path]"), copy.path);
    setText(bar.querySelector("[data-legend-blocked]"), copy.blocked);
    setText(bar.querySelector("[data-legend-missing]"), copy.missing);
  }

  function ensureToolbar() {
    const toolbar = document.querySelector(".tree-toolbar");
    if (!toolbar) return;
    let nav = toolbar.querySelector(".planner-nav");
    if (!nav) {
      nav = document.createElement("div");
      nav.className = "planner-nav";
      nav.innerHTML = `
        <button type="button" data-planner-action="previous"></button>
        <button type="button" data-planner-action="show-all"></button>
        <button type="button" data-planner-action="show-branch"></button>
        <button type="button" data-planner-action="center"></button>
        <button type="button" class="card-mode-button" data-planner-action="toggle-cards"></button>`;
      toolbar.appendChild(nav);
    }

    const copy = labels();
    const actions = {
      previous: copy.previous,
      "show-all": copy.showAll,
      "show-branch": copy.showBranch,
      center: copy.center,
      "toggle-cards": copy.compact,
    };
    for (const [action, text] of Object.entries(actions)) {
      const button = nav.querySelector(`[data-planner-action="${action}"]`);
      setText(button, text);
    }
    const previous = nav.querySelector('[data-planner-action="previous"]');
    previous.disabled = state.history.length === 0;
    const modeButton = nav.querySelector(
      '[data-planner-action="toggle-cards"]',
    );
    modeButton.classList.toggle("active", state.compact);
  }

  function ensureSiteMeta() {
    const headerActions = document.querySelector(".header-actions");
    if (!headerActions) return;
    let meta = headerActions.querySelector(".site-meta-actions");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "site-meta-actions";
      meta.innerHTML = `
        <span class="site-version"></span>
        <a class="steam-link" target="_blank" rel="noopener noreferrer"></a>
        <button type="button" data-planner-action="install"></button>`;
      headerActions.appendChild(meta);
    }
    const copy = labels();
    const version = meta.querySelector(".site-version");
    const versionKey = `${isEnglish()}:${DATA.dataVersion}:${DATA.modVersion}`;
    const versionHtml = isEnglish()
      ? `Data <strong>${escapeHtml(DATA.dataVersion)}</strong> · Mod <strong>v${escapeHtml(DATA.modVersion)}</strong>`
      : `Данные <strong>${escapeHtml(DATA.dataVersion)}</strong> · Мод <strong>v${escapeHtml(DATA.modVersion)}</strong>`;
    if (version.dataset.versionKey !== versionKey) {
      version.dataset.versionKey = versionKey;
      version.innerHTML = versionHtml;
    }
    const steam = meta.querySelector(".steam-link");
    steam.href = DATA.steamUrl;
    setText(steam, copy.steam);
    setText(meta.querySelector('[data-planner-action="install"]'), copy.install);
  }

  function bindSearch() {
    const field = document.querySelector(".search-field");
    const input = field?.querySelector("input");
    if (!field || !input) return;

    let count = field.querySelector(".planner-search-count");
    if (!count) {
      count = document.createElement("span");
      count.className = "planner-search-count";
      field.appendChild(count);
    }

    let dropdown = field.querySelector(".planner-search-results");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.className = "planner-search-results";
      dropdown.hidden = true;
      field.appendChild(dropdown);
    }

    if (input.dataset.plannerSearchBound !== "true") {
      input.dataset.plannerSearchBound = "true";
      input.addEventListener("input", () => {
        state.searchActiveIndex = -1;
        updateSearchResults();
      });
      input.addEventListener("focus", updateSearchResults);
      input.addEventListener("keydown", (event) => {
        const buttons = [
          ...dropdown.querySelectorAll("button[data-research-id]"),
        ];
        if (!buttons.length) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          state.searchActiveIndex = Math.min(
            buttons.length - 1,
            state.searchActiveIndex + 1,
          );
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          state.searchActiveIndex = Math.max(0, state.searchActiveIndex - 1);
        } else if (event.key === "Enter" && state.searchActiveIndex >= 0) {
          event.preventDefault();
          buttons[state.searchActiveIndex].click();
          return;
        } else {
          return;
        }
        buttons.forEach((button, index) =>
          button.classList.toggle("active", index === state.searchActiveIndex),
        );
        buttons[state.searchActiveIndex]?.scrollIntoView({ block: "nearest" });
      });
      input.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (!field.contains(document.activeElement)) dropdown.hidden = true;
        }, 120);
      });
    }

    updateSearchResults();
  }

  function updateSearchResults() {
    const field = document.querySelector(".search-field");
    const input = field?.querySelector("input");
    const dropdown = field?.querySelector(".planner-search-results");
    const count = field?.querySelector(".planner-search-count");
    if (!input || !dropdown || !count) return;

    const query = input.value.trim().toLocaleLowerCase("ru");
    if (!query) {
      dropdown.hidden = true;
      setText(count, "");
      return;
    }

    const faction = activeFaction();
    const matches = byFaction[faction].filter((node) =>
      searchText.get(`${faction}:${normalize(node.id)}`).includes(query),
    );
    const visibleMatches = matches.slice(0, 18);
    const copy = labels();
    const key = `${faction}:${isEnglish()}:${query}:${matches.length}`;
    if (dropdown.dataset.resultsKey !== key) {
      dropdown.dataset.resultsKey = key;
      dropdown.innerHTML = `
        <div class="planner-search-summary">
          <span>${matches.length} ${escapeHtml(copy.results)}</span>
          <span>${visibleMatches.length} ${escapeHtml(copy.shown)}</span>
        </div>
        ${visibleMatches
          .map(
            (node) => `
            <button type="button" data-research-id="${escapeHtml(node.id)}">
              <span>
                <strong>${escapeHtml(isEnglish() ? node.nameEn : node.nameRu)}</strong>
                <small>${escapeHtml(node.id)} · ${escapeHtml(isEnglish() ? node.sectionEn : node.sectionRu)}</small>
              </span>
              <em>${node.cost} RP</em>
            </button>`,
          )
          .join("")}`;
      dropdown
        .querySelectorAll("button[data-research-id]")
        .forEach((button) => {
          button.addEventListener("mousedown", (event) =>
            event.preventDefault(),
          );
          button.addEventListener("click", () => {
            dropdown.hidden = true;
            navigateTo(button.dataset.researchId, {
              clearFilters: true,
              focus: true,
            });
          });
        });
    }
    setText(count, String(matches.length));
    dropdown.hidden = matches.length === 0;
  }

  function bindCards() {
    const copy = labels();
    for (const card of document.querySelectorAll(".research-card")) {
      const id = getCardId(card);
      const node = nodeFor(id);
      if (!node) continue;

      let toggle = card.querySelector(":scope > .planner-complete-toggle");
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "planner-complete-toggle";
        toggle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleLearned(getCardId(card));
        });
        card.appendChild(toggle);
      }
      const isLearned = learned[node.faction].has(normalize(node.id));
      setText(toggle, isLearned ? "✓" : "○");
      toggle.title = isLearned ? copy.markUnlearned : copy.markLearned;
      toggle.setAttribute(
        "aria-label",
        isLearned ? copy.markUnlearned : copy.markLearned,
      );

      const image = card.querySelector(":scope > .research-image");
      if (image && image.dataset.plannerImageBound !== "true") {
        image.dataset.plannerImageBound = "true";
        image.removeAttribute("aria-hidden");
        image.setAttribute("role", "button");
        image.setAttribute("tabindex", "0");
        image.setAttribute(
          "aria-label",
          isEnglish() ? "Open unit image" : "Открыть изображение юнита",
        );
        const open = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openImage(node);
        };
        image.addEventListener("click", open);
        image.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") open(event);
        });
      }

      for (const marker of card.querySelectorAll(".role-marker")) {
        if (!marker.dataset.plannerTooltip && marker.title) {
          marker.dataset.plannerTooltip = marker.title;
          marker.removeAttribute("title");
        }
      }
    }
  }

  function applyStatuses() {
    const copy = labels();
    const path = state.selectionCleared
      ? new Set()
      : pathFor(state.selectedId);
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    shell.classList.toggle("planner-active", state.planningEnabled);
    shell.classList.toggle("compact-cards", state.compact);
    shell.classList.toggle("minimap-collapsed", state.minimapCollapsed);
    shell.classList.toggle("selection-cleared", state.selectionCleared);

    for (const card of document.querySelectorAll(".research-card")) {
      const node = nodeFor(getCardId(card));
      if (!node) continue;
      const status = statusFor(node, path);
      card.classList.remove(...STATUS_CLASSES);
      card.classList.add(`status-${status}`);
      card.classList.toggle("planner-on-path", path.has(normalize(node.id)));
      card.dataset.plannerStatus = status;
      card.dataset.statusLabel = statusLabel(status, copy);
    }

    for (const pathElement of document.querySelectorAll(
      ".dependency-lines path",
    )) {
      if (pathElement.closest("marker")) continue;
      const fiberProperty = Object.keys(pathElement).find((name) =>
        name.startsWith("__reactFiber$"),
      );
      const key = pathElement[fiberProperty || ""]?.key || "";
      const relation = edgeByKey.get(`${activeFaction()}:${key}`);
      const onPath =
        relation &&
        path.has(relation.target) &&
        path.has(relation.requirement);
      pathElement.classList.toggle("planner-path-line", Boolean(onPath));
      pathElement.classList.toggle(
        "planner-learned-line",
        Boolean(
          onPath &&
            learned[activeFaction()].has(relation.requirement) &&
            learned[activeFaction()].has(relation.target),
        ),
      );
    }
  }

  function ensureInspector() {
    const inspector = document.querySelector(".inspector");
    const node = selectedNode();
    if (!inspector || !node || state.selectionCleared) return;

    ensurePlannerSummary(inspector, node);
    ensureCopyActions(inspector, node);
    updateDependencyCosts(inspector, node);
    ensureUnlocks(inspector, node);
  }

  function ensurePlannerSummary(inspector, node) {
    let panel = inspector.querySelector(".planner-summary");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "planner-summary";
      const anchor =
        inspector.querySelector(".purchase-cost-panel") ||
        inspector.querySelector(".id-row");
      anchor?.insertAdjacentElement("afterend", panel);
    }

    const copy = labels();
    const path = orderedPathFor(node.id);
    const factionLearned = learned[node.faction];
    const total = path.reduce((sum, item) => sum + item.cost, 0);
    const accounted = path.reduce(
      (sum, item) =>
        sum + (factionLearned.has(normalize(item.id)) ? item.cost : 0),
      0,
    );
    const remaining = total - accounted;
    const key = `${node.id}:${isEnglish()}:${[...factionLearned].join("|")}`;
    if (panel.dataset.summaryKey === key) return;
    panel.dataset.summaryKey = key;
    const selectedLearned = factionLearned.has(normalize(node.id));
    panel.innerHTML = `
      <div class="planner-summary-head">
        <div>
          <h3>${escapeHtml(copy.targetPlan)}</h3>
          <p>${escapeHtml(copy.targetPlanNote)}</p>
        </div>
        <button type="button" class="planner-action-button${selectedLearned ? " complete" : ""}" data-planner-action="toggle-selected">
          ${escapeHtml(selectedLearned ? copy.markUnlearned : copy.markLearned)}
        </button>
      </div>
      <div class="planner-metrics">
        <div><span>${escapeHtml(copy.fullCost)}</span><strong>${total} RP</strong></div>
        <div><span>${escapeHtml(copy.accounted)}</span><strong>${accounted} RP</strong></div>
        <div><span>${escapeHtml(copy.remaining)}</span><strong>${remaining} RP</strong></div>
      </div>
      <details class="planner-accounted" open>
        <summary>${escapeHtml(copy.countedList)} · ${path.length}</summary>
        <div class="planner-accounted-list">
          ${path
            .map((item) => {
              const done = factionLearned.has(normalize(item.id));
              return `
                <button type="button" class="${done ? "learned" : "remaining"}" data-planner-action="navigate" data-research-id="${escapeHtml(item.id)}">
                  <i>${done ? "✓" : "○"}</i>
                  <span>${escapeHtml(isEnglish() ? item.nameEn : item.nameRu)}</span>
                  <em>${item.cost} RP</em>
                </button>`;
            })
            .join("")}
        </div>
      </details>`;
  }

  function ensureCopyActions(inspector, node) {
    const idRow = inspector.querySelector(".id-row");
    if (!idRow) return;
    let actions = inspector.querySelector(".planner-copy-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "planner-copy-actions";
      idRow.insertAdjacentElement("afterend", actions);
    }
    const copy = labels();
    const key = `${node.id}:${isEnglish()}`;
    if (actions.dataset.copyKey === key) return;
    actions.dataset.copyKey = key;
    actions.innerHTML = [
      ["copy-name", copy.copyName],
      ["copy-id", copy.copyId],
      ["copy-composition", copy.copyComposition],
      ["copy-link", copy.copyLink],
    ]
      .map(
        ([action, text]) =>
          `<button type="button" data-planner-action="${action}">${escapeHtml(text)}</button>`,
      )
      .join("");
  }

  function updateDependencyCosts(inspector, node) {
    const sections = [
      ...inspector.querySelectorAll(
        ".inspector-section:not(.planner-unlocks)",
      ),
    ];
    const requiredSection = sections.find((section) =>
      section.querySelector(".prerequisite-list"),
    );
    if (!requiredSection) return;
    const buttons = requiredSection.querySelectorAll(
      ".prerequisite-list > button",
    );
    buttons.forEach((button, index) => {
      const requirement = nodeFor(node.requires[index], node.faction);
      let cost = button.querySelector(".planner-dependency-cost");
      if (!cost) {
        cost = document.createElement("span");
        cost.className = "planner-dependency-cost";
        const goTo = button.querySelector("em");
        button.insertBefore(cost, goTo || null);
      }
      setText(cost, requirement ? `${requirement.cost} RP` : "— RP");
    });
  }

  function ensureUnlocks(inspector, node) {
    let section = inspector.querySelector(".planner-unlocks");
    if (!section) {
      section = document.createElement("section");
      section.className = "inspector-section planner-unlocks";
      inspector.appendChild(section);
    }
    const direct = (unlocks.get(normalize(node.id)) || []).filter(
      (item) => item.faction === node.faction,
    );
    const key = `${node.id}:${isEnglish()}`;
    if (section.dataset.unlockKey === key) return;
    section.dataset.unlockKey = key;
    const copy = labels();
    section.innerHTML = `
      <div class="section-heading">
        <h3>${escapeHtml(copy.unlocks)}</h3>
        <span>${escapeHtml(copy.unlocksTag)}</span>
      </div>
      ${
        direct.length
          ? `<div class="prerequisite-list">${direct
              .map(
                (item) => `
                  <button type="button" data-planner-action="navigate" data-research-id="${escapeHtml(item.id)}">
                    <span>
                      <strong>${escapeHtml(isEnglish() ? item.nameEn : item.nameRu)}</strong>
                      <small>${escapeHtml(item.id)}</small>
                    </span>
                    <span class="planner-dependency-cost">${item.cost} RP</span>
                    <em>${isEnglish() ? "Go to →" : "Перейти →"}</em>
                  </button>`,
              )
              .join("")}</div>`
          : `<p class="empty-note">${escapeHtml(copy.noUnlocks)}</p>`
      }`;
  }

  function toggleLearned(id) {
    const node = nodeFor(id);
    if (!node) return;
    const key = normalize(node.id);
    const factionLearned = learned[node.faction];
    if (factionLearned.has(key)) factionLearned.delete(key);
    else factionLearned.add(key);
    persist();
    bindCards();
    applyStatuses();
    ensurePlanningBar();
    ensureInspector();
    drawMinimap();
    scheduleScan();
  }

  function syncSelection() {
    if (state.selectionCleared) return;
    const card = document.querySelector(".research-card.selected");
    const id = getCardId(card);
    if (!id || id === state.selectedId) return;

    if (
      state.selectedId &&
      !state.skipNextHistory &&
      normalize(state.selectedId) !== normalize(id)
    ) {
      state.history.push(state.selectedId);
      state.history = state.history.slice(-40);
    }
    state.skipNextHistory = false;
    state.selectedId = id;
    if (state.initialUrlApplied) updateUrl();
  }

  function updateUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("faction", activeFaction());
      if (state.selectedId && !state.selectionCleared) {
        url.searchParams.set("research", state.selectedId);
      } else {
        url.searchParams.delete("research");
      }
      history.replaceState(null, "", url);
    } catch {
      // Direct links are optional when the file is opened outside a browser URL.
    }
  }

  function setControlledValue(element, value) {
    if (!element) return;
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : null;
    const setter = prototype
      ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
      : null;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  }

  function resetTreeFilters() {
    const search = document.querySelector(".search-field input");
    if (search?.value) setControlledValue(search, "");
    for (const select of document.querySelectorAll(
      ".select-field select",
    )) {
      if (select.value !== "all") setControlledValue(select, "all");
    }
    const composition = document.querySelector(
      '.composition-toggle input[type="checkbox"]',
    );
    if (composition?.checked) composition.click();
  }

  function navigateTo(id, options = {}) {
    const node = nodeFor(id, options.faction || activeFaction());
    if (!node) return;
    state.selectionCleared = false;
    const faction = activeFaction();
    if (faction !== node.faction) {
      const buttons = document.querySelectorAll(".faction-switch button");
      const target = buttons[node.faction === "tg" ? 1 : 0];
      target?.click();
    }
    if (options.clearFilters) resetTreeFilters();

    let attempts = 0;
    const select = () => {
      const card = cardFor(node.id);
      if (!card && attempts++ < 45) {
        window.setTimeout(select, 70);
        return;
      }
      if (!card) return;
      card.click();
      window.setTimeout(() => {
        syncSelection();
        applyStatuses();
        ensureInspector();
        if (options.focus !== false) centerCard(card);
      }, 60);
    };
    window.setTimeout(select, faction === node.faction ? 20 : 120);
  }

  function centerCard(card) {
    const viewport = document.querySelector(".tree-viewport");
    if (!viewport || !card) return;
    const viewportRect = viewport.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    viewport.scrollTo({
      behavior: "smooth",
      left:
        viewport.scrollLeft +
        cardRect.left -
        viewportRect.left -
        (viewport.clientWidth - cardRect.width) / 2,
      top:
        viewport.scrollTop +
        cardRect.top -
        viewportRect.top -
        (viewport.clientHeight - cardRect.height) / 2,
    });
  }

  function readScale(viewport = document.querySelector(".tree-viewport")) {
    const transform =
      viewport?.querySelector(".tree-canvas")?.style.transform || "";
    const match = transform.match(/scale\(([\d.]+)\)/);
    return match ? Number(match[1]) : 1;
  }

  function setScale(target, done) {
    const viewport = document.querySelector(".tree-viewport");
    const buttons = document.querySelectorAll(".zoom-controls button");
    if (!viewport || buttons.length < 3) {
      done?.();
      return;
    }
    target = Math.max(0.5, Math.min(1.1, Number(target) || 0.78));
    let attempts = 0;
    const step = () => {
      const current = readScale(viewport);
      if (Math.abs(current - target) < 0.011 || attempts++ > 16) {
        done?.();
        return;
      }
      if (Math.abs(target - 0.78) < 0.011) buttons[2].click();
      else if (current < target) buttons[1].click();
      else buttons[0].click();
      requestAnimationFrame(step);
    };
    step();
  }

  let viewportSaveTimer = 0;
  function saveViewport() {
    const viewport = document.querySelector(".tree-viewport");
    if (!viewport) return;
    const faction = activeFaction();
    state.viewport[faction] = {
      scale: readScale(viewport),
      left: Math.round(viewport.scrollLeft),
      top: Math.round(viewport.scrollTop),
    };
    persist();
    drawMinimap();
  }

  function queueViewportSave() {
    window.clearTimeout(viewportSaveTimer);
    viewportSaveTimer = window.setTimeout(saveViewport, 180);
  }

  function bindViewport() {
    const viewport = document.querySelector(".tree-viewport");
    if (!viewport) return;
    if (viewport.dataset.plannerViewportBound !== "true") {
      viewport.dataset.plannerViewportBound = "true";
      viewport.addEventListener("scroll", queueViewportSave, {
        passive: true,
      });
      viewport.addEventListener("wheel", queueViewportSave, {
        passive: true,
      });
    }

    const faction = activeFaction();
    if (
      state.lastRestoredFaction === faction &&
      state.lastRestoredViewport === viewport
    ) {
      return;
    }
    state.lastRestoredFaction = faction;
    state.lastRestoredViewport = viewport;
    const savedView = state.viewport[faction];
    if (!savedView) return;
    window.setTimeout(() => {
      setScale(savedView.scale, () => {
        requestAnimationFrame(() => {
          viewport.scrollLeft = savedView.left || 0;
          viewport.scrollTop = savedView.top || 0;
          drawMinimap();
        });
      });
    }, 100);
  }

  function ensureMinimap() {
    const panel = document.querySelector(".tree-panel");
    if (!panel) return;
    let minimap = panel.querySelector(".planner-minimap");
    if (!minimap) {
      minimap = document.createElement("div");
      minimap.className = "planner-minimap";
      minimap.innerHTML = `
        <header><span></span><button type="button" data-planner-action="toggle-minimap">−</button></header>
        <canvas width="416" height="264" aria-label="Research tree mini-map"></canvas>`;
      panel.appendChild(minimap);
      minimap.querySelector("canvas").addEventListener("click", (event) => {
        const viewport = document.querySelector(".tree-viewport");
        const canvas = event.currentTarget;
        const treeCanvas = viewport?.querySelector(".tree-canvas");
        if (!viewport || !treeCanvas) return;
        const rect = canvas.getBoundingClientRect();
        const treeWidth = Number.parseFloat(treeCanvas.style.width);
        const treeHeight = Number.parseFloat(treeCanvas.style.height);
        const x = ((event.clientX - rect.left) / rect.width) * treeWidth;
        const y = ((event.clientY - rect.top) / rect.height) * treeHeight;
        const scale = readScale(viewport);
        viewport.scrollTo({
          left: x * scale - viewport.clientWidth / 2,
          top: y * scale - viewport.clientHeight / 2,
          behavior: "smooth",
        });
      });
    }
    setText(minimap.querySelector("header span"), labels().minimap);
    setText(
      minimap.querySelector("header button"),
      state.minimapCollapsed ? "+" : "−",
    );
    drawMinimap();
  }

  function drawMinimap() {
    const minimap = document.querySelector(".planner-minimap");
    const canvas = minimap?.querySelector("canvas");
    const viewport = document.querySelector(".tree-viewport");
    const treeCanvas = viewport?.querySelector(".tree-canvas");
    if (!canvas || !viewport || !treeCanvas || state.minimapCollapsed) return;
    const context = canvas.getContext("2d");
    const width = Number.parseFloat(treeCanvas.style.width) || 1;
    const height = Number.parseFloat(treeCanvas.style.height) || 1;
    const sx = canvas.width / width;
    const sy = canvas.height / height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0a1213";
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (const card of document.querySelectorAll(".research-card")) {
      const x = Number.parseFloat(card.style.left) || 0;
      const y = Number.parseFloat(card.style.top) || 0;
      const status = card.dataset.plannerStatus || "blocked";
      context.fillStyle = STATUS_COLORS[status];
      context.globalAlpha = status === "blocked" ? 0.48 : 0.9;
      context.fillRect(x * sx, y * sy, Math.max(2, 216 * sx), Math.max(2, 5));
    }
    context.globalAlpha = 1;

    const scale = readScale(viewport);
    const visibleX = (viewport.scrollLeft / scale) * sx;
    const visibleY = (viewport.scrollTop / scale) * sy;
    const visibleWidth = (viewport.clientWidth / scale) * sx;
    const visibleHeight = (viewport.clientHeight / scale) * sy;
    context.strokeStyle = "#f4d990";
    context.lineWidth = 3;
    context.strokeRect(
      visibleX,
      visibleY,
      Math.max(8, visibleWidth),
      Math.max(8, visibleHeight),
    );
  }

  function openImage(node) {
    document.querySelector(".planner-image-modal")?.remove();
    const mapping = window.INDOMITUS_RESEARCH_IMAGES?.[normalize(node.id)];
    if (!mapping) return;
    const [sheet, column, row, columns, rows] = mapping;
    const source = window.INDOMITUS_RESEARCH_SPRITES?.[sheet];
    if (!source) return;
    const cellWidth = 258;
    const cellHeight = 324;
    const modal = document.createElement("div");
    modal.className = "planner-image-modal";
    modal.innerHTML = `
      <div class="planner-image-dialog section-${escapeHtml(node.section)}" role="dialog" aria-modal="true">
        <button type="button" aria-label="${isEnglish() ? "Close" : "Закрыть"}">×</button>
        <h2>${escapeHtml(isEnglish() ? node.nameEn : node.nameRu)}</h2>
        <div class="planner-image-large" role="img" aria-label="${escapeHtml(isEnglish() ? node.nameEn : node.nameRu)}"></div>
      </div>`;
    const image = modal.querySelector(".planner-image-large");
    image.style.backgroundImage = `url("${source}")`;
    image.style.backgroundSize = `${columns * cellWidth}px ${rows * cellHeight}px`;
    image.style.backgroundPosition = `${column * -cellWidth}px ${row * -cellHeight}px`;
    const close = () => modal.remove();
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("button")) close();
    });
    document.body.appendChild(modal);
    modal.querySelector("button").focus();
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    if (button) {
      const original = button.textContent;
      button.textContent = labels().copied;
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("copied");
      }, 1200);
    }
  }

  function compositionText(node) {
    const english = isEnglish();
    const purchase = window.INDOMITUS_PURCHASE_COSTS?.[normalize(node.id)];
    const directUnlocks = unlocks.get(normalize(node.id)) || [];
    const lines = [
      english ? node.nameEn : node.nameRu,
      `ID: ${node.id}`,
      `${english ? "Research" : "Исследование"}: ${node.cost} RP`,
    ];
    if (purchase !== undefined) {
      lines.push(`${labels().purchase}: ${purchase} MP`);
    }
    lines.push(
      "",
      english ? "Composition:" : "Состав:",
      ...node.composition.items.map(
        (item) =>
          `${item.count} × ${english ? item.nameEn : item.nameRu} [${item.id}]`,
      ),
      "",
      `${english ? "Requires" : "Требуется"}: ${node.requires.join(", ") || "—"}`,
      `${english ? "Unlocks" : "Открывает"}: ${directUnlocks.map((item) => item.id).join(", ") || "—"}`,
    );
    return lines.join("\n");
  }

  function showToast(message) {
    document.querySelector(".planner-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "planner-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function previousSelection() {
    const id = state.history.pop();
    if (!id) return;
    state.skipNextHistory = true;
    navigateTo(id, { clearFilters: true, focus: true });
  }

  function showAll() {
    resetTreeFilters();
    state.selectionCleared = false;
    setScale(0.5, () => {
      const viewport = document.querySelector(".tree-viewport");
      viewport?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    });
  }

  function showBranch() {
    const node = selectedNode();
    if (!node) return;
    const sectionSelect = document.querySelector(".select-field select");
    if (sectionSelect) setControlledValue(sectionSelect, node.section);
    window.setTimeout(() => centerCard(cardFor(node.id)), 90);
  }

  function clearSelection() {
    state.selectionCleared = true;
    state.selectedId = null;
    updateUrl();
    applyStatuses();
    ensureToolbar();
    ensurePlanningBar();
    scheduleScan();
    showToast(labels().selectedCleared);
  }

  function handlePlannerAction(button) {
    const action = button.dataset.plannerAction;
    const node = selectedNode();
    if (action === "previous") previousSelection();
    else if (action === "show-all") showAll();
    else if (action === "show-branch") showBranch();
    else if (action === "center") centerCard(cardFor(state.selectedId));
    else if (action === "toggle-cards") {
      state.compact = !state.compact;
      persist();
      scheduleScan();
    } else if (action === "toggle-minimap") {
      state.minimapCollapsed = !state.minimapCollapsed;
      persist();
      scheduleScan();
    } else if (action === "toggle-selected" && node) {
      toggleLearned(node.id);
    } else if (action === "navigate") {
      navigateTo(button.dataset.researchId, {
        clearFilters: true,
        focus: true,
      });
    } else if (action === "copy-name" && node) {
      copyText(isEnglish() ? node.nameEn : node.nameRu, button);
    } else if (action === "copy-id" && node) {
      copyText(node.id, button);
    } else if (action === "copy-composition" && node) {
      copyText(compositionText(node), button);
    } else if (action === "copy-link" && node) {
      updateUrl();
      copyText(window.location.href, button);
    } else if (action === "install") {
      if (state.deferredInstallPrompt) {
        state.deferredInstallPrompt.prompt();
        state.deferredInstallPrompt = null;
      } else {
        showToast(labels().installFallback);
      }
    }
  }

  function applyInitialUrl() {
    if (
      state.initialUrlApplied ||
      state.initialUrlApplying ||
      !document.querySelector(".research-card")
    ) {
      return;
    }
    state.initialUrlApplying = true;
    const faction = INITIAL_FACTION;
    const initialFaction =
      INITIAL_FACTION === "ig" || INITIAL_FACTION === "tg"
        ? INITIAL_FACTION
        : activeFaction();
    const targetNode = nodeFor(INITIAL_RESEARCH, initialFaction);
    if (faction === "ig" || faction === "tg") {
      const buttons = document.querySelectorAll(".faction-switch button");
      if (activeFaction() !== faction) buttons[faction === "tg" ? 1 : 0]?.click();
    }
    window.setTimeout(() => {
      state.initialUrlApplied = true;
      state.initialUrlApplying = false;
      if (targetNode) {
        state.skipNextHistory = true;
        navigateTo(targetNode.id, {
          faction: targetNode.faction,
          clearFilters: true,
          focus: true,
        });
      } else {
        updateUrl();
      }
    }, faction && faction !== activeFaction() ? 260 : 80);
  }

  function scan() {
    syncSelection();
    ensurePlanningBar();
    ensureToolbar();
    ensureSiteMeta();
    bindSearch();
    bindCards();
    applyStatuses();
    ensureInspector();
    ensureMinimap();
    bindViewport();
    applyInitialUrl();
  }

  document.addEventListener("click", (event) => {
    const plannerAction = event.target.closest("[data-planner-action]");
    if (plannerAction) {
      if (plannerAction.dataset.plannerAction !== "toggle-planning") {
        event.preventDefault();
        handlePlannerAction(plannerAction);
      }
      return;
    }

    const card = event.target.closest(".research-card");
    if (card) {
      state.selectionCleared = false;
      window.setTimeout(() => {
        syncSelection();
        scheduleScan();
      }, 20);
    }

    if (
      event.target.closest(
        ".faction-switch button, .language-switch button, .view-switch button, .section-legend button, .clear-search",
      )
    ) {
      window.setTimeout(() => {
        state.lastRestoredFaction = null;
        syncSelection();
        updateUrl();
        scheduleScan();
      }, 50);
    }

    if (event.target.closest(".zoom-controls button")) {
      window.setTimeout(queueViewportSave, 80);
    }
  });

  document.addEventListener("pointerover", (event) => {
    const marker = event.target.closest(".role-marker[data-planner-tooltip]");
    if (!marker) return;
    document.querySelector(".planner-tooltip")?.remove();
    const tooltip = document.createElement("div");
    tooltip.className = "planner-tooltip";
    tooltip.textContent = marker.dataset.plannerTooltip;
    document.body.appendChild(tooltip);
    const rect = marker.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(window.innerWidth - tipRect.width - 8, rect.left)}px`;
    tooltip.style.top = `${Math.max(8, rect.top - tipRect.height - 7)}px`;
  });

  document.addEventListener("pointerout", (event) => {
    if (event.target.closest(".role-marker[data-planner-tooltip]")) {
      document.querySelector(".planner-tooltip")?.remove();
    }
  });

  document.addEventListener("keydown", (event) => {
    const editing =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      document.querySelector(".search-field input")?.focus();
      return;
    }
    if (!editing && event.key === "/") {
      event.preventDefault();
      document.querySelector(".search-field input")?.focus();
      return;
    }
    if (event.key === "Escape") {
      const modal = document.querySelector(".planner-image-modal");
      if (modal) modal.remove();
      else clearSelection();
      return;
    }
    if (!editing && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      document.querySelectorAll(".zoom-controls button")[1]?.click();
    } else if (!editing && event.key === "-") {
      event.preventDefault();
      document.querySelectorAll(".zoom-controls button")[0]?.click();
    }
  }, true);

  window.addEventListener("resize", drawMinimap);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
  });

  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  scan();
})();
