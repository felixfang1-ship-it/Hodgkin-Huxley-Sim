# Hodgkin-Huxley Ion Channel Schematic

This is a simple qualitative simulator for a BME 301-style Hodgkin-Huxley schematic.

## How to run

1. Open this folder in VS Code.
2. Right-click `index.html`.
3. Select **Open with Live Server**.

## What it does

- Sodium channel has three states:
  - Closed: activation gate closed
  - Open: activation and inactivation gates open
  - Inactivated: h-gate blocks the pore
- Potassium channel has two states:
  - Closed
  - Open
- The animation shows Na+ moving inward and K+ moving outward only when the selected channel is open.

This is a schematic only, not a numerical Hodgkin-Huxley ODE solver.
