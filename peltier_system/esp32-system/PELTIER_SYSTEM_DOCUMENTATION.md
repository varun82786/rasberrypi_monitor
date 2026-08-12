# Peltier System Documentation

## Table of Contents
1. [Overview](#overview)
2. [Hardware Configuration](#hardware-configuration)
3. [System Architecture](#system-architecture)
4. [Control States](#control-states)
5. [Temperature Management](#temperature-management)
6. [Adaptive Control Algorithm](#adaptive-control-algorithm)
7. [Safety Features](#safety-features)
8. [API Reference](#api-reference)
9. [Configuration Parameters](#configuration-parameters)
10. [Monitoring and Diagnostics](#monitoring-and-diagnostics)

---

## Overview

The Peltier System is an ESP32-based intelligent thermal management solution designed to monitor and control cooling systems for a Raspberry Pi server. The system uses adaptive algorithms, learned baselines, and state-machine control to efficiently manage multiple cooling components while preventing thermal runaway and ensuring system reliability.

### Key Features
- **Adaptive temperature control** with learned baseline adjustment
- **Multi-state control system** (Boot, Idle, Cooling, Night, Fault)
- **Remote data integration** from Raspberry Pi metrics
- **Sensor-based monitoring** using DHT11 for ambient conditions
- **Multiple relay control** for SMPS, fans, and peltier modules
- **Failsafe mechanisms** for communication loss and sensor failures
- **Non-volatile memory** for learned temperature baselines
- **User-configurable overrides** via web interface

---

## Hardware Configuration

### Pin Definitions

| Component | GPIO Pin | Wire Color | Description |
|-----------|----------|------------|-------------|
| SMPS | 21 | Brown | Main power supply control |
| RPI_FAN | 19 | Red | Raspberry Pi cooling fan |
| SMPS_FAN | 18 | Orange | SMPS cooling fan |
| PELTIER | 5 | Yellow | Peltier module control (currently unused) |
| DHT11 | 15 | White | Temperature & humidity sensor |

### Hardware Components

#### Relays
- **SMPS Relay**: Controls the main Switched-Mode Power Supply
- **RPI_FAN Relay**: Controls the Raspberry Pi server fan
- **SMPS_FAN Relay**: Controls the SMPS cooling fan
- **PELTIER Relay**: Reserved for future peltier module control (currently disabled)

#### Sensors
- **DHT11 Sensor**: Monitors ambient room temperature and humidity
  - Temperature range: 0-50°C (±2°C accuracy)
  - Humidity range: 20-90% RH (±5% accuracy)
  - Sampling rate: 1Hz (1 second intervals)

---

## System Architecture

### Component Hierarchy

```
┌─────────────────────────────────────────┐
│         ESP32 Main Controller           │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   State Machine Controller        │  │
│  │   - Boot → Idle → Cooling        │  │
│  │   - Night Mode                    │  │
│  │   - Fault Detection               │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Adaptive Control Algorithm      │  │
│  │   - Temperature filtering         │  │
│  │   - Baseline learning             │  │
│  │   - Trend analysis                │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Data Integration Layer          │  │
│  │   - WiFi communication            │  │
│  │   - RPi metrics reception         │  │
│  │   - Web server                    │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
          │           │           │
    ┌─────┴──┐   ┌───┴────┐   ┌──┴─────┐
    │ Relays │   │ DHT11  │   │ NVS    │
    │        │   │ Sensor │   │ Storage│
    └────────┘   └────────┘   └────────┘
```

### Data Flow

```
RPi Metrics (via HTTP) ──┐
                          ├──> Control Logic ──> State Machine ──> Relay Control
DHT11 Sensor ────────────┘
```

---

## Control States

The system operates using a finite state machine with five distinct states:

### 1. Boot State
- **Initial state** when the system powers up
- All critical components are activated:
  - SMPS: ON
  - RPI_FAN: ON
  - SMPS_FAN: ON (for 10 seconds, then OFF)
  - PELTIER: OFF
- Loads learned temperature baselines from NVS
- Initializes sensors and network components
- Transitions to target state after initialization

### 2. Idle State
- **Normal operating state** when cooling is not required
- Active when CPU temperature is below lower threshold
- Component status:
  - SMPS: OFF
  - RPI_FAN: ON (if `SERVER_FAN_ALWAYS_ON` flag is true)
  - SMPS_FAN: OFF
  - PELTIER: OFF
- Continues to monitor temperatures and learn baselines

### 3. Cooling State
- **Active cooling state** triggered when thermal thresholds are exceeded
- Activated when:
  - CPU temperature ≥ adaptive upper threshold, OR
  - CPU usage ≥ 75%, OR
  - CPU temperature trend > 2.0°C/sample
- Component status:
  - SMPS: ON
  - RPI_FAN: ON
  - SMPS_FAN: ON
  - PELTIER: OFF

### 4. Night Mode
- **User-activated state** for continuous operation
- Keeps all cooling systems running regardless of temperature
- Component status: Same as Cooling State
- Activated via RPi metrics (`night_mode` flag)

### 5. Fault State
- **Safety state** triggered by system errors
- Activated when:
  - RPi data is stale (>90 seconds old)
  - Invalid sensor readings detected
  - Communication errors persist
- Component status: Same as Cooling State (safe default)
- Uses conservative local fallback values

### State Transition Logic

```
Boot ──> Idle (default startup transition)
  │
Idle ──┬──> Cooling (temp/usage/trend threshold exceeded)
  │    └──> Night (user activates night mode)
  │    └──> Fault (sensor error or stale data)
  │
Cooling ──┬──> Idle (conditions return to normal)
  │       └──> Fault (sensor error or stale data)
  │
Night ──┬──> Idle (user deactivates night mode)
  │     └──> Fault (sensor error or stale data)
  │
Fault ──> Idle (conditions normalize)
```

### State Hold Time
- **Debounce period**: 5 seconds (`STATE_HOLD_MS`)
- Prevents rapid state oscillation
- Target state must be stable for 5 seconds before transition occurs

---

## Temperature Management

### Temperature Sources

#### 1. Local Ambient Temperature
- Measured by DHT11 sensor
- Provides `RoomTemp` and `RoomHumid`
- Updated every second
- Used for adaptive threshold calculation

#### 2. Remote CPU Temperature
- Retrieved from Raspberry Pi via HTTP
- Provides `CpuTemp` and `CpuUsage`
- Should update every 30 seconds
- Stale data triggers failsafe mode after 45 seconds

### Temperature Filtering

The system employs exponential moving average (EMA) filtering:

```cpp
filteredCpuTemp = (filteredCpuTemp × 0.8) + (CpuTemp × 0.2)
filteredRoomTemp = (filteredRoomTemp × 0.8) + (RoomTemp × 0.2)
```

**Benefits:**
- Reduces sensor noise
- Smooths rapid fluctuations
- Provides stable control signal
- Alpha = 0.2 provides good balance between responsiveness and stability

### Learned Baseline System

The system continuously learns and adapts to the thermal baseline of the environment.

#### Baseline Learning
- **CPU Baseline**: Learned average CPU temperature during stable idle operation
- **Room Baseline**: Learned average room temperature during stable idle operation
- **Learning Rate**: α = 0.02 (2% weight for new samples)
- **Learning Conditions**:
  - System must be in Idle state
  - CPU usage < 45%
  - CPU temperature < (upper_threshold + 2°C)

#### Baseline Storage
- Stored in ESP32 Non-Volatile Storage (NVS)
- Namespace: "rpi-monitor"
- Keys: "cpu_base", "room_base"
- Auto-save interval: 60 seconds
- Saved only when drift > 0.5°C detected

#### Baseline Usage
- Used as fallback when remote thresholds are unavailable
- Provides adaptive upper and lower thresholds
- Helps system adapt to seasonal changes

---

## Adaptive Control Algorithm

### Overview
The adaptive control algorithm dynamically adjusts cooling thresholds based on multiple factors to optimize performance and prevent thermal runaway.

### Threshold Calculation

#### Upper Threshold (Cooling Activation)
```cpp
adaptiveUpper = max(remoteUpper, filteredRoomTemp + 6.0°C)
```

Where:
- `remoteUpper = upper_thresold_temp + 5.0°C` (from RPi)
- Minimum offset: 6°C above room temperature
- Prevents cooling in already-warm rooms

**Fallback (when remote data unavailable):**
```cpp
adaptiveUpper = max(learnedUpper, filteredRoomTemp + 6.0°C)
learnedUpper = learnedCpuBaseline + 8.0°C
```

#### Lower Threshold (Cooling Deactivation)
```cpp
adaptiveLower = max(remoteLower, filteredRoomTemp + 2.0°C)
```

Where:
- `remoteLower = lower_thresold_temp + 1.5°C` (from RPi)
- Minimum offset: 2°C above room temperature

**Fallback (when remote data unavailable):**
```cpp
adaptiveLower = max(learnedLower, filteredRoomTemp + 2.0°C)
learnedLower = learnedRoomBaseline + 2.0°C
```

### Hysteresis
- **Cooling activation**: `filteredCpuTemp ≥ adaptiveUpper`
- **Cooling deactivation**: `filteredCpuTemp ≤ adaptiveLower - 2.0°C`
- Provides 2°C dead-band to prevent oscillation

### CPU Trend Analysis

The system calculates temperature trend to predict thermal events:

```cpp
cpuTrend = filteredCpuTemp - previousFilteredCpuTemp
```

**Thresholds:**
- **Rising trend**: > 2.0°C/sample → Activate cooling immediately
- **Falling trend**: ≤ 0.2°C/sample → Cooling can be deactivated

### CPU Usage Integration

CPU usage is used as a secondary trigger:
- **High usage**: ≥ 75% → Activate cooling
- **Recovery threshold**: < 45% → Required for deactivation
- Provides proactive cooling before temperature rises

### Control Decision Logic

```
IF (stale_data_for > 90s)
    → Fault State

ELSE IF (night_mode_enabled)
    → Night State

ELSE IF (invalid_readings)
    → Fault State

ELSE IF (cpuTemp ≥ adaptiveUpper OR cpuUsage ≥ 75% OR cpuTrend > 2.0)
    → Cooling State

ELSE IF (cpuTemp ≤ adaptiveLower - 2.0 AND cpuUsage < 45% AND cpuTrend ≤ 0.2)
    → Idle State

ELSE
    → Maintain current state
```

---

## Safety Features

### 1. Communication Monitoring
- **Freshness check**: RPi data must be < 45 seconds old
- **Stale data timeout**: 90 seconds triggers Fault state
- **Fallback values**: Conservative local values when data is stale
  ```cpp
  CpuTemp = RoomTemp + 10.0°C
  CpuUsage = 0.0%
  upper_thresold_temp = RoomTemp + 8.0°C
  lower_thresold_temp = RoomTemp + 2.0°C
  ```

### 2. Sensor Validation
All sensor readings are validated:
```cpp
bool validReading(float value) {
    return !isnan(value) && 
           !isinf(value) && 
           value > -40.0°C && 
           value < 150.0°C;
}
```
Invalid readings trigger Fault state.

### 3. Relay Safety Interlock
**Critical Rule**: SMPS fan cannot run when SMPS is off
```cpp
if (!SMPS.Status()) {
    SMPS_FAN.off();  // Force off regardless of other logic
}
```

### 4. Server Fan Protection
- `SERVER_FAN_ALWAYS_ON` flag keeps RPI_FAN running continuously
- Prevents server overheating even during controller faults
- Can be disabled for energy savings if server has independent cooling

### 5. State Hold Debouncing
- 5-second state hold prevents rapid state changes
- Avoids relay stress and power cycling
- Ensures stable operation

### 6. Peltier Module Protection
- Peltier module kept OFF by default
- Prevents reverse heating scenarios
- Reserved for future controlled implementation

---

## API Reference

### Core Functions

#### `void setup()`
**Description**: Initializes the peltier system on boot.

**Operations**:
1. Starts serial communication at 115200 baud
2. Loads learned baseline from NVS
3. Initializes all sensors (DHT11)
4. Initializes all relays (SMPS, fans, peltier)
5. Activates boot state relay configuration
6. Initializes WiFi connection
7. Starts web server
8. Delays 10 seconds for stabilization
9. Saves initial baseline to NVS

**Initial Relay State**:
- SMPS: ON
- RPI_FAN: ON
- SMPS_FAN: ON (turns OFF after 10s)
- PELTIER: OFF

---

#### `void loop()`
**Description**: Main control loop executed continuously.

**Execution Frequency**: ~1 Hz (1-second delay)

**Operations** (in order):
1. Handle web client requests
2. Read DHT11 sensor (RoomTemp, RoomHumid)
3. Update from RPi metrics (CpuTemp, CpuUsage, etc.)
4. Check data freshness
5. Execute adaptive control algorithm
6. Send data to RPi every 30 seconds
7. Update SMPS status timers
8. Save learned baseline (if needed)
9. Increment system uptime counter
10. Delay 1 second

---

#### `void manageCoolingSystem()`
**Description**: Executes the adaptive control algorithm.

**Process**:
1. Calls `inferTargetState()` to determine desired state
2. Calls `settleState()` to transition with debouncing
3. Updates relay states via `setRelaysForState()`

**Called By**: `loop()` every second

---

### Internal Functions

#### `ControlState inferTargetState()`
**Description**: Determines the target control state based on current conditions.

**Returns**: One of: `Boot`, `Idle`, `Cooling`, `Night`, `Fault`

**Logic**:
1. Check for stale data → Fault
2. Check night mode → Night
3. Validate sensor readings → Fault if invalid
4. Initialize filters on first run
5. Update temperature filters
6. Learn baseline if conditions are stable
7. Calculate adaptive thresholds
8. Calculate CPU temperature trend
9. Apply control decision logic
10. Log control snapshot every 10 seconds

**Dependencies**:
- Global variables: `CpuTemp`, `RoomTemp`, `CpuUsage`, `nightMode`
- `validReading()`, `updateLearningBaseline()`, `logControlSnapshot()`

---

#### `void settleState(ControlState targetState)`
**Description**: Manages state transitions with debouncing.

**Parameters**:
- `targetState`: Desired control state

**Behavior**:
- **Boot state**: Immediate transition to target
- **State change**: Requires 5-second stable hold
- **Same state**: Resets pending timer
- Always calls `setRelaysForState()` after logic

**State Transition Variables**:
- `currentState`: Active control state
- `pendingState`: Target state being held
- `pendingSinceMs`: Timestamp when pending started

---

#### `void setRelaysForState(ControlState state)`
**Description**: Configures all relay outputs for the given state.

**Parameters**:
- `state`: Control state to apply

**Relay Configurations**:

| State | SMPS | RPI_FAN | SMPS_FAN | PELTIER |
|-------|------|---------|----------|---------|
| Boot | OFF | Config* | OFF | OFF |
| Idle | OFF | Config* | OFF | OFF |
| Cooling | ON | ON | ON | OFF |
| Night | ON | ON | ON | OFF |
| Fault | ON | ON | ON | OFF |

*Config: ON if `SERVER_FAN_ALWAYS_ON` is true, otherwise OFF

**Override Handling**:
- Applies `RpiData.fan_mode_override` ("on" or "off")
- Override affects SMPS_FAN only
- Safety interlock enforced: SMPS_FAN cannot run if SMPS is OFF

---

#### `void updateSMPSStatus()`
**Description**: Updates SMPS and fan operation timers for monitoring.

**Timers Updated**:
- `smps_timer`: Seconds SMPS has been ON
- `smps_ideal_timer`: Seconds SMPS has been OFF
- `smps_fan_timer`: Seconds SMPS_FAN has been ON
- `smps_fan_off_timer`: Seconds SMPS_FAN has been OFF

**Output**: Prints timer status to Serial every second

---

#### `void activateNightMode()`
**Description**: Forces the system into Night state.

**Implementation**:
```cpp
void activateNightMode() {
    settleState(ControlState::Night);
}
```

**Note**: Currently unused; night mode is controlled via `RpiData.night_mode` flag.

---

### Utility Functions

#### `bool validReading(float value)`
**Description**: Validates sensor readings for sanity.

**Parameters**:
- `value`: Temperature or sensor value to validate

**Returns**: `true` if value is valid, `false` otherwise

**Validation Checks**:
- Not NaN (Not a Number)
- Not Infinity
- Within range: -40°C to 150°C

---

#### `const char* stateName(ControlState state)`
**Description**: Converts control state enum to human-readable string.

**Returns**: String representation of state

| State | String |
|-------|--------|
| Boot | "boot" |
| Idle | "idle" |
| Cooling | "cooling" |
| Night | "night" |
| Fault | "fault" |

---

#### `void logControlSnapshot(float adaptiveUpper, float adaptiveLower, float cpuTrend)`
**Description**: Logs detailed control status to Serial.

**Frequency**: Every 10 seconds

**Output Format**:
```
CTRL state=idle mode=auto fresh=yes cpu=42.5 room=25.3 usage=12.5 up=48.0 low=40.0 trend=0.05
```

**Fields**:
- `state`: Current control state
- `mode`: Fan override mode from RPi
- `fresh`: Whether RPi data is fresh
- `cpu`: Current CPU temperature
- `room`: Current room temperature
- `usage`: CPU usage percentage
- `up`: Adaptive upper threshold
- `low`: Adaptive lower threshold
- `trend`: CPU temperature trend (°C/sample)

---

### Baseline Management Functions

#### `void loadLearningBaseline()`
**Description**: Loads learned temperature baselines from NVS.

**Storage Location**: NVS namespace "rpi-monitor"

**Keys**:
- `cpu_base`: Learned CPU baseline temperature
- `room_base`: Learned room baseline temperature

**Behavior**:
- Opens NVS in read-write mode
- Reads stored values (defaults to 0.0°C if not set)
- Sets `baselineLoaded = true` if valid data found

---

#### `void saveLearningBaseline(bool force = false)`
**Description**: Saves learned baselines to NVS.

**Parameters**:
- `force`: If true, bypasses interval and dirty checks

**Conditions for Save** (if not forced):
- `baselineDirty` must be true
- At least 60 seconds since last save

**Side Effects**:
- Resets `baselineDirty` flag
- Updates `lastBaselineSaveMs` timestamp
- Prints confirmation to Serial

---

#### `void updateLearningBaseline()`
**Description**: Incrementally learns temperature baselines during stable operation.

**Learning Algorithm**:
```cpp
learnedCpuBaseline = (learnedCpuBaseline × 0.98) + (CpuTemp × 0.02)
learnedRoomBaseline = (learnedRoomBaseline × 0.98) + (RoomTemp × 0.02)
```

**Learning Rate**: α = 0.02 (BASELINE_ALPHA)

**Learning Conditions**:
- System in Idle state
- CPU usage < 45%
- CPU temp < (upper_threshold + 2°C)
- Valid temperature readings

**Initialization**:
- First valid reading sets initial baseline
- Subsequent readings update incrementally

**Drift Detection**:
- If baseline changes > 0.5°C, sets `baselineDirty` flag
- Triggers periodic save

---

## Configuration Parameters

### Threshold Constants

```cpp
// Control State
constexpr unsigned long STATE_HOLD_MS = 5000;  // 5 seconds

// CPU Usage Thresholds
constexpr float CPU_USAGE_HIGH = 75.0f;        // Cooling activation
constexpr float CPU_USAGE_RECOVER = 45.0f;     // Cooling deactivation

// Temperature Trend Thresholds
constexpr float CPU_TREND_RISING = 2.0f;       // Rapid rise detection
constexpr float CPU_TREND_FALLING = 0.2f;      // Stable/falling

// Data Freshness
constexpr unsigned long RPI_DATA_STALE_MS = 45000;      // 45 seconds
constexpr unsigned long STALE_FAILSAFE_MS = 90000;      // 90 seconds

// Baseline Learning
constexpr unsigned long BASELINE_SAVE_INTERVAL_MS = 60000;  // 60 seconds
constexpr float BASELINE_ALPHA = 0.02f;                      // 2% learning rate
constexpr float BASELINE_DRIFT_THRESHOLD = 0.5f;             // 0.5°C
```

### Global Flags

```cpp
bool SMPS_Status = OFF;               // SMPS relay status
bool DHT_Status = OFF;                // DHT sensor status
bool nightMode = false;               // Night mode flag
bool ComError = true;                 // Communication error flag
bool SERVER_FAN_ALWAYS_ON = true;     // Keep RPI_FAN always running
```

### Temperature Variables

```cpp
float sensorData = 25.0;              // Generic sensor data
float sensorThreshold = 20.0;         // Generic threshold
float RoomTemp = 0;                   // Ambient room temperature
float RoomHumid = 0;                  // Ambient humidity
float CpuTemp = 60;                   // CPU temperature (default triggers cooling)
float CpuUsage = 50;                  // CPU usage percentage (default triggers cooling)
float upper_thresold_temp = 45;       // Upper control threshold
float lower_thresold_temp = 38;       // Lower control threshold
```

### Timing Variables

```cpp
int sys_uptime = 0;                   // System uptime counter (seconds)
int smps_timer = 0;                   // SMPS on-time counter
int smps_ideal_timer = 0;             // SMPS off-time counter
int smps_fan_timer = 0;               // SMPS fan on-time counter
int smps_fan_off_timer = 0;           // SMPS fan off-time counter

unsigned long oneSecond = 1000;       // 1 second in milliseconds
unsigned long tenSeconds = 10000;     // 10 seconds in milliseconds
```

---

## Monitoring and Diagnostics

### Serial Output

The system provides comprehensive serial logging at **115200 baud**.

#### Startup Sequence
```
[DHT11 initialization messages]
[WiFi connection status]
[Web server started]
Saved learned temperature baseline
```

#### Runtime Logging (Every 10 seconds)
```
CTRL state=cooling mode=auto fresh=yes cpu=52.3 room=26.5 usage=68.2 up=48.0 low=40.0 trend=0.15
SMPS on for 145 seconds
SMPS fan on for 145 seconds
```

#### Stale Data Warning (Every 15 seconds when stale)
```
RPi data stale for 62s, using local thermal fallback
```

#### Baseline Updates
```
Saved learned temperature baseline
```

### Timer Monitoring

Four independent timers track component operation:

1. **System Uptime** (`sys_uptime`)
   - Counts seconds since boot
   - Incremented every loop iteration
   - Used for periodic tasks (e.g., data transmission every 30s)

2. **SMPS Timer** (`smps_timer`)
   - Counts seconds SMPS has been ON
   - Resets to 0 when SMPS turns OFF
   - Useful for tracking cooling cycles

3. **SMPS Idle Timer** (`smps_ideal_timer`)
   - Counts seconds SMPS has been OFF
   - Resets to 0 when SMPS turns ON
   - Tracks idle duration

4. **SMPS Fan Timers**
   - `smps_fan_timer`: Seconds fan has been ON
   - `smps_fan_off_timer`: Seconds fan has been OFF
   - Independent tracking of fan operation

### Data Transmission

The system periodically sends data to the Raspberry Pi:

**Frequency**: Every 30 seconds (when `sys_uptime % 30 == 0`)

**Transmitted Data**:
- Room temperature (`RoomTemp`)

**Endpoint**: Configured via `serverUrl` in `secrets.h`

### Web Interface Integration

The system integrates with a web server providing:
- Real-time sensor readings
- Control state visualization
- Manual fan override controls
- System uptime display
- Historical data logging

**User Controls**:
- **Fan Mode Override**: "on", "off", or "auto"
  - Affects SMPS_FAN only
  - Subject to safety interlock
- **Night Mode**: Continuous cooling operation

---

## Troubleshooting Guide

### Issue: System Stuck in Fault State

**Symptoms**:
- All cooling components running continuously
- Serial log shows "state=fault"

**Possible Causes**:
1. RPi communication lost (>90 seconds)
2. Invalid sensor readings
3. DHT11 sensor failure

**Solutions**:
1. Check network connectivity between ESP32 and RPi
2. Verify DHT11 sensor wiring and power
3. Check Serial output for specific error messages
4. Restart ESP32 to reinitialize

---

### Issue: Cooling Not Activating

**Symptoms**:
- CPU temperature rising but system stays in Idle
- Serial shows "state=idle" despite high temps

**Possible Causes**:
1. Adaptive thresholds too high (room too warm)
2. RPi data not updating
3. State hold time (5s) not elapsed

**Solutions**:
1. Check control snapshot log for threshold values
2. Verify RPi data freshness: "fresh=yes"
3. Wait 5 seconds for state transition
4. Lower `upper_thresold_temp` on RPi side

---

### Issue: Rapid State Oscillation

**Symptoms**:
- Frequent state changes
- Relays clicking repeatedly

**Note**: This should be prevented by the 5-second state hold, but if occurring:

**Possible Causes**:
1. Thresholds too close together
2. Sensor noise
3. Bug in state machine

**Solutions**:
1. Increase hysteresis (currently 2°C)
2. Check sensor connections
3. Review control snapshot logs
4. Verify `STATE_HOLD_MS` is 5000

---

### Issue: SMPS Fan Won't Start

**Symptoms**:
- Cooling state active but SMPS_FAN remains OFF
- Serial shows "SMPS fan off"

**Possible Causes**:
1. SMPS relay is OFF (safety interlock)
2. Fan override set to "off"
3. Relay hardware failure

**Solutions**:
1. Verify SMPS relay is ON first
2. Check `RpiData.fan_mode_override` value
3. Test relay with direct GPIO control
4. Check relay wiring and power

---

### Issue: Baseline Not Saving

**Symptoms**:
- Resets to default thresholds after reboot
- No "Saved learned temperature baseline" message

**Possible Causes**:
1. NVS partition not initialized
2. `baselineDirty` flag not being set
3. Never in stable idle conditions

**Solutions**:
1. Verify ESP32 NVS partition in platform.ini
2. Force save with `saveLearningBaseline(true)` in code
3. Ensure system spends time in Idle state with low CPU usage
4. Check Serial for drift detection messages

---

## Best Practices

### Deployment Recommendations

1. **Initial Setup**
   - Deploy with `SERVER_FAN_ALWAYS_ON = true` for safety
   - Monitor for 24 hours to verify stable operation
   - Check baseline learning progress

2. **Network Configuration**
   - Ensure reliable WiFi connection
   - Use static IP for ESP32 if possible
   - Minimize network latency (<500ms)

3. **Physical Installation**
   - Mount DHT11 sensor away from heat sources
   - Ensure good airflow around sensor
   - Secure all relay wiring
   - Label wires according to color code

4. **Monitoring**
   - Review Serial logs daily initially
   - Check for stale data warnings
   - Verify state transitions are logical
   - Monitor timer values for anomalies

### Maintenance

1. **Weekly**
   - Check Serial logs for errors
   - Verify web interface functionality
   - Test manual overrides

2. **Monthly**
   - Clean DHT11 sensor
   - Verify relay operation
   - Check learned baseline values
   - Test failsafe modes

3. **Seasonal**
   - Review and adjust thresholds for seasonal changes
   - Verify learned baselines have adapted
   - Test night mode if used

### Performance Tuning

1. **Aggressive Cooling** (for high-performance workloads)
   ```cpp
   CPU_USAGE_HIGH = 65.0f;
   CPU_TREND_RISING = 1.5f;
   upper_thresold_temp -= 3.0;  // Via RPi configuration
   ```

2. **Energy Saving** (for light workloads)
   ```cpp
   CPU_USAGE_HIGH = 85.0f;
   CPU_USAGE_RECOVER = 35.0f;
   SERVER_FAN_ALWAYS_ON = false;  // Only if server has backup cooling
   ```

3. **Stable Operation** (minimize state changes)
   ```cpp
   STATE_HOLD_MS = 10000;  // 10 seconds
   CPU_TREND_RISING = 3.0f;
   ```

---

## Integration with Raspberry Pi

### Expected RPi Metrics

The system expects the following data structure from the Raspberry Pi:

```cpp
struct RpiMetrics {
    float cpu_temperature;     // Current CPU temp in °C
    float cpu_usage;           // Current CPU usage in %
    bool night_mode;           // User-activated continuous cooling
    float past_avg_temp;       // Historical average (used as upper threshold)
    float lowest_temp;         // Historical minimum (used as lower threshold)
    String fan_mode_override;  // "on", "off", or "auto"
};
```

### Communication Protocol

**Direction**: ESP32 → Raspberry Pi

**Frequency**: Every 30 seconds

**Data Sent**: Room temperature

**Implementation**: See `sensor_manager.h` and `http_com.h`

---

**Direction**: Raspberry Pi → ESP32

**Frequency**: Should be every 15-30 seconds

**Data Received**: `RpiMetrics` structure

**Freshness Threshold**: 45 seconds (warning), 90 seconds (failsafe)

---

## Future Enhancements

### Planned Features

1. **Peltier Module Integration**
   - Active heating/cooling control
   - Polarity switching logic
   - Temperature differential monitoring

2. **Advanced Learning**
   - Multi-season baseline tracking
   - Time-of-day patterns
   - Workload prediction

3. **Enhanced Diagnostics**
   - Relay cycle counting
   - Energy consumption estimation
   - Predictive maintenance alerts

4. **Cloud Integration**
   - Remote monitoring dashboard
   - Historical trend analysis
   - Alert notifications

5. **Multi-Zone Control**
   - Multiple DHT sensors
   - Zone-specific cooling
   - Load balancing

---

## Appendix

### Dependencies

**Arduino Libraries**:
- `Arduino.h` - Core Arduino framework
- `math.h` - Mathematical functions
- `Preferences.h` - ESP32 NVS library
- `DHT.h` - DHT sensor library

**Custom Libraries**:
- `operations.h` - System operations
- `Relay.h` - Relay control class
- `dhtsensor.h` - DHT sensor wrapper
- `wifi_manager.h` - WiFi connectivity
- `sensor_manager.h` - Sensor data management
- `secrets.h` - WiFi credentials and endpoints
- `data_processor.h` - Data processing utilities
- `pelitiersys.h` - Main header file

### Version History

**Current Version**: 2.0 (Adaptive Control with Learning)

**Key Changes from v1.x**:
- Added state machine control
- Implemented adaptive threshold calculation
- Added baseline learning with NVS storage
- Integrated CPU trend analysis
- Added comprehensive failsafe mechanisms
- Improved logging and diagnostics

### License and Contact

Refer to project root LICENSE file for licensing information.

For technical support or contributions, refer to the project repository.

---

**Document Version**: 1.0  
**Last Updated**: 2026-08-12  
**Target Hardware**: ESP32 DevKit  
**Firmware Version**: 2.0+
