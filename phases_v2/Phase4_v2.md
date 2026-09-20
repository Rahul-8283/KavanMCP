# Phase 4: Process Manager - Sorting & Filtering

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 4
Having successfully fetched and displayed the raw process data in Phase 3, Phase 4 focuses on data organization. The objective is to empower the user to quickly identify resource hogs or specific application anomalies by sorting and filtering the vast table of processes.

By the end of Phase 4, the user will be able to click on column headers to sort by CPU/RAM usage (ascending and descending), use a dropdown to isolate specific Security Tiers, and instantly see the results.

### 1.2 Architectural Philosophy (Strictly Client-Side)
We explicitly avoid sending requests back to the FastMCP server for sorting or filtering (e.g., no `GET /api/list_processes?sort=cpu`). 
Because the initial fetch payload contains the complete array of all running processes, executing the sorting and filtering algorithms directly within the React Virtual DOM ensures absolute zero-latency interactions for the user and prevents unnecessary database/psutil strain on the Python backend.

---

## 2. State Management for Data Organization

To manage the transformations without mutating the original fetched data, the `<ProcessManager />` must implement local state for user preferences.

### 2.1 Sorting State
- **State Definition:** `const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);`
- **Supported Keys:** `name`, `cpu_percent`, `memory_mb`.

### 2.2 Filtering State
- **State Definition:** `const [filterTier, setFilterTier] = useState<number | 'ALL'>('ALL');`
- **Supported Tiers:** `1`, `2`, `3`, `4`, or `ALL`.

---

## 3. The Computation Pipeline (useMemo)

To prevent lagging the UI, the sorting and filtering logic must be wrapped in a `useMemo` hook. This ensures the algorithms only run when the raw data, the `sortConfig`, or the `filterTier` actually changes.

### 3.1 Step 1: The Filtering Algorithm
The pipeline must apply filtering *first* to reduce the size of the array before sorting.
```typescript
let processedData = rawProcesses;
if (filterTier !== 'ALL') {
  processedData = processedData.filter(process => process.tier === filterTier);
}
```

### 3.2 Step 2: The Sorting Algorithm
After filtering, apply the sorting logic using `Array.prototype.sort()`.
- **Numeric Sort (CPU/RAM):** Simply subtract `a[key] - b[key]` for ascending, or `b[key] - a[key]` for descending.
- **String Sort (Name):** Utilize `localeCompare()` to handle alphabetical sorting correctly across different character sets.

---

## 4. User Interface & Interactions

### 4.1 Interactive Column Headers
The `<thead>` elements in the `<ProcessTable />` must be upgraded to interactive buttons.
- **Click Event:** Clicking a header sets the `sortConfig.key`. Clicking the *same* header again toggles the `sortConfig.direction` between `asc` and `desc`.
- **Visual Feedback:** 
  - Render a small chevron icon (↑ or ↓) next to the currently active column header.
  - Apply a subtle background color or font-weight change to highlight which column is actively driving the sort.

### 4.2 The Tier Filter Dropdown
Above the table, implement a clean, stylized `<select>` dropdown or a row of toggle buttons.
- **Options:** "All Tiers", "Tier 1 (Critical)", "Tier 2 (Essential)", "Tier 3 (Optional)", "Tier 4 (Suspicious)".
- **Visual Feedback:** When a filter other than "All Tiers" is active, display a clear "Clear Filter" (X) button next to the dropdown to allow rapid resetting.

### 4.3 The Empty State (Post-Filter)
If a user selects "Tier 4" but there are zero Tier 4 processes running, the filtered array will be empty.
- The UI must distinguish between "Loading...", "No processes running at all" (Phase 3), and "No processes match your filter".
- Display a specific message: "No processes found in this Tier. [Clear Filter]".

---

## 5. Edge Cases & UX Enhancements

### 5.1 Tie-Breaking in Sorts
If two processes have the exact same CPU percentage (e.g., both are `0.0`), the sorting algorithm should fall back to a secondary key (like Alphabetical Name) to prevent random row jumping on subsequent renders.

### 5.2 Sticky Headers
If the process list requires scrolling, the `<thead>` containing the sort controls must be implemented with CSS `position: sticky; top: 0;`. If the user scrolls down 300 rows and decides to sort by RAM, they should not have to scroll all the way back to the top of the page to click the header.

---

## 6. Definition of Done (Success Criteria)

Phase 4 is considered complete when the following criteria are met:

1. **Sort Interactions:** Clicking the "CPU %" header successfully sorts the table, placing the highest CPU consumers at the absolute top. Clicking it again reverses the order perfectly.
2. **Sort UI:** An arrow icon clearly indicates which column is active and its current sort direction.
3. **Filter Interactions:** Selecting "Tier 1" from the dropdown immediately removes all non-Tier-1 rows from the table with zero network latency.
4. **Pipeline Integrity:** Activating both a Sort (e.g., CPU Descending) and a Filter (e.g., Tier 2) simultaneously works flawlessly. The resulting list is exclusively Tier 2 processes, sorted by CPU.
5. **Reset UI:** The user can quickly reset all filters and sorts to return to the raw, default view.
6. **Sticky Navigation:** The table headers remain visible and clickable even when scrolled to the bottom of the process list.

Once these checks pass, the user has total analytical control over their system data, and we are ready for **Phase 5: Alert Thresholds & Settings Panel**.
