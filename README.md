# Hodgkin-Huxley Ion Channel Schematic

Open `index.html` with VS Code Live Server.

## Current features

- Sodium channel selector: closed, open, and inactivated.
- Potassium channel selector: closed and open.
- Leak channel selector: closed and open.
- Na+ particles flow inward only when the sodium channel is open.
- K+ particles flow outward only when the potassium channel is open.
- Leak particles use five random ion colors and move both inward and outward.
- Leak direction is stochastic, but it is biased by a simple simulated gradient that builds from Na+ and K+ flux.

This is a qualitative teaching schematic, not a full numerical Hodgkin-Huxley model.


PDF formula update:
- Left graph plots g_Na = 60 m^3 h and g_K = 48 n^4 in mS/cm^2.
- Right graph plots voltage-clamp total current: I_total = I_K + I_Na + I_C.
- I_K = (48 n^4)(V_m - (-90))/1000.
- I_Na = (60 m^3 h)(V_m - 60.6)/1000.
- I_C = (V_inf - V_m)/r_m, where V_m = (V_0 - V_inf) exp(-t/tau_c) + V_inf.
