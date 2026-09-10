# Phase 7: End-to-End Testing & LLM Handshake

**Project:** KavanMCP (V1)
**Phase:** 7
**Status:** Ready for Execution
**Focus:** Quality Assurance, Unit Testing, and LLM Prompt Engineering

---

## 1. Executive Overview

With the core logic, databases, safety gates, and execution hooks built across Phases 1 through 6, KavanMCP is functionally complete. However, when working with Large Language Models, functional code is only half the battle. The LLM must thoroughly understand *how* to use the tools we've provided, and our safety gates must be mathematically proven to withstand LLM hallucinations.

Phase 7 focuses entirely on Quality Assurance (QA). We will construct a robust `pytest` suite to verify our Python logic, specifically targeting the Tier 1 zero-trust boundary. Furthermore, we will fine-tune the docstrings on our FastMCP tools—because in the MCP ecosystem, your docstrings act as the prompt instructions that govern the AI's behavior.

---

## 2. Goals & Objectives

1. **Classification Integrity:** Prove via unit tests that a Tier 1 process can NEVER be misclassified, regardless of casing or operating system anomalies.
2. **Stateful Verification:** Prove via unit tests that the Dual Confirmation Engine's TTL (Time-To-Live) successfully expires stale requests.
3. **Prompt Engineering:** Refine the MCP tool descriptions to mathematically eliminate LLM looping or tool hallucination.
4. **Dry Run Simulation:** Execute a full end-to-end integration test mocking the exact JSON-RPC calls Claude will make.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: Unit Testing the Classification Engine (`tests/test_classification.py`)

We must guarantee that critical Windows processes are protected.
- **Action:** Create `mcp-server/tests/test_classification.py`.
- **Implementation Note:**
  - Use `pytest`.
  - Write test cases for `classify_process()`.
  - **Test Case 1:** Pass `"explorer.exe"`. Assert result is `Tier 1`.
  - **Test Case 2:** Pass `"EXPLORER.EXE"` (testing case insensitivity). Assert result is `Tier 1`.
  - **Test Case 3:** Pass a dummy background process with >50% CPU. Assert result is `Tier 4` with `["HIGH_CPU_WARNING"]`.
  - **Test Case 4:** Pass `"Code.exe"` (assuming it is in the essential list). Assert result is `Tier 2`.

### Step 3.2: Unit Testing the Approval Engine (`tests/test_approval.py`)

The stateful memory cache must be heavily tested to ensure it doesn't leak memory or allow bypassed executions.
- **Action:** Create `mcp-server/tests/test_approval.py`.
- **Implementation Note:**
  - **Test Case 1:** Call `request_approval(9999, "notepad.exe", 3)`. Assert `is_approved(9999)` returns `True`.
  - **Test Case 2:** Mock the `time.time()` module to advance 6 minutes into the future. Assert `is_approved(9999)` now returns `False`.
  - **Test Case 3:** Attempt to call `execute_termination_logic` with a fake PID `8888`. Assert it raises an execution blocked error because it was never placed in the pending dictionary.

### Step 3.3: LLM Handshake & Prompt Engineering (`tools/*.py`)

In FastMCP, the docstring of the Python function is sent directly to the LLM as its operating instructions. If the instructions are vague, the AI might hallucinate.
- **Action:** Review and rewrite all tool docstrings.
- **Implementation Note:**
  - **`confirm_termination`:** Update to: *\"Use this tool to propose the termination of a process. You MUST NOT execute the termination yet. Present the returned warning to the user and ask for explicit confirmation. Only proceed if they type 'yes'.\"*
  - **`execute_termination`:** Update to: *\"Use this tool ONLY after the user has explicitly agreed to the confirmation prompt from confirm_termination. Pass the exact PID.\"*
  - **`analyze_system`:** Update to: *\"Use this tool to diagnose system lag. It returns the current CPU/RAM totals and the top resource hogs categorized by Security Tiers (1-4).\"*

### Step 3.4: Integration Simulation (`scripts/test_runner.bat`)

Before we plug into Claude Desktop, we simulate it.
- **Action:** Write `mcp-server/scripts/test_runner.bat`.
- **Implementation Note:**
  - This script will run `pytest tests/ -v`.
  - Ensure all 10+ unit tests pass with a 100% success rate.

---

## 4. Deliverables for Phase 7

By the end of Phase 7, the following artifacts must be physically present and functional:

1. `mcp-server/tests/test_classification.py` containing Tier 1 zero-trust proofs.
2. `mcp-server/tests/test_approval.py` containing TTL and stateful proofs.
3. Updated docstrings across all files in the `mcp-server/tools/` directory.
4. `mcp-server/scripts/test_runner.bat` to automate the QA process.

---

## 5. Testing & Verification Plan

### Gate 1: Pytest Suite Pass
- Execute `scripts\test_runner.bat`.
- **Validation:** All unit tests must pass. Any failure in the Classification or Approval modules is a blocker for launch.

### Gate 2: Claude Tool Discovery
- Launch the KavanMCP server and connect Claude Desktop.
- Prompt: *"Claude, what tools do you have available from KavanMCP?"*
- **Validation:** Claude should successfully list `analyze_system`, `list_processes`, `explain_process`, `confirm_termination`, `execute_termination`, and `rollback_last_action`, along with a perfect understanding of *when* to use them based on our updated docstrings.

### Gate 3: The End-to-End Stress Test
- Launch a heavy process (e.g., a stress tester or just a dozen browser tabs).
- Prompt: *"Optimize my PC."*
- **Validation:** 
  1. Claude analyzes the system.
  2. Claude identifies the heavy process.
  3. Claude asks for permission (Gate passed).
  4. User types "Yes".
  5. Claude kills the process (Gate passed).
  6. User types "Undo".
  7. Claude rolls back the process (Gate passed).

---

## 6. Proceeding to Next Phase

If Claude can successfully navigate Gate 3 without getting confused or bypassing safety rules, the core architecture is flawless. 

We will conclude the V1 build with **Phase 8: Final Hardening & Documentation**, where we will ensure global error handling is bulletproof and prepare the project for handoff or V2 Tauri integration.
