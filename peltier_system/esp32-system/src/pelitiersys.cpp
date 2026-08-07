#include <Arduino.h>
#include <math.h>
#include <Preferences.h>
#include "operations.h"
#include "Relay.h"
#include "dhtsensor.h"
#include "wifi_manager.h"
#include "sensor_manager.h"
#include "secrets.h"
#include "data_processor.h"
#include "pelitiersys.h"

// External Variables
RpiMetrics RpiData;



// Relays and Sensors
DHTSensor serverroom(DHT_PIN, DHTSENSORTYPE);
Relay SMPS(SMPS_PIN);
Relay SMPS_FAN(SMPS_FAN_PIN);
Relay RPI_FAN(RPI_FAN_PIN);
Relay PELTIER(PELTIER_PIN);

namespace {
enum class ControlState {
    Boot,
    Idle,
    Cooling,
    Night,
    Fault,
};

constexpr unsigned long STATE_HOLD_MS = 5000;
constexpr float CPU_USAGE_HIGH = 75.0f;
constexpr float CPU_USAGE_RECOVER = 45.0f;
constexpr float CPU_TREND_RISING = 2.0f;
constexpr float CPU_TREND_FALLING = 0.2f;

ControlState currentState = ControlState::Boot;
ControlState pendingState = ControlState::Boot;
unsigned long pendingSinceMs = 0;
bool filterInitialized = false;
float filteredCpuTemp = 0.0f;
float filteredRoomTemp = 0.0f;
float learnedCpuBaseline = 0.0f;
float learnedRoomBaseline = 0.0f;
bool baselineLoaded = false;
bool baselineDirty = false;
unsigned long lastBaselineSaveMs = 0;
Preferences preferences;

constexpr unsigned long BASELINE_SAVE_INTERVAL_MS = 60000;
constexpr float BASELINE_ALPHA = 0.02f;
constexpr float BASELINE_DRIFT_THRESHOLD = 0.5f;
constexpr unsigned long RPI_DATA_STALE_MS = 45000;
constexpr unsigned long STALE_FAILSAFE_MS = 90000;

bool remoteDataFresh = false;
unsigned long lastControlLogMs = 0;
unsigned long lastStaleLogMs = 0;

void logControlSnapshot(float adaptiveUpper, float adaptiveLower, float cpuTrend);

bool validReading(float value) {
    return !isnan(value) && !isinf(value) && value > -40.0f && value < 150.0f;
}

const char* stateName(ControlState state) {
    switch (state) {
        case ControlState::Boot: return "boot";
        case ControlState::Idle: return "idle";
        case ControlState::Cooling: return "cooling";
        case ControlState::Night: return "night";
        case ControlState::Fault: return "fault";
    }
    return "unknown";
}

void setRelaysForState(ControlState state) {
    if (RpiData.fan_mode_override == "on") {
        SMPS.on();
        RPI_FAN.off();
        PELTIER.off();
        SMPS_FAN.on();
        return;
    }

    if (RpiData.fan_mode_override == "off") {
        RPI_FAN.off();
        SMPS_FAN.off();
        SMPS.off();
        PELTIER.off();
        return;
    }

    switch (state) {
        case ControlState::Cooling:
            SMPS.on();
            RPI_FAN.on();
            SMPS_FAN.on();
            PELTIER.off();
            break;
        case ControlState::Night:
            SMPS.on();
            RPI_FAN.on();
            SMPS_FAN.on();
            PELTIER.off();
            break;
        case ControlState::Fault:
            SMPS.on();
            RPI_FAN.on();
            SMPS_FAN.on();
            PELTIER.off();
            break;
        case ControlState::Idle:
        case ControlState::Boot:
        default:
            RPI_FAN.off();
            SMPS_FAN.off();
            SMPS.off();
            PELTIER.off();
            break;
    }
}
    void loadLearningBaseline() {
        // Open in RW mode so first boot can create the namespace without warnings.
        preferences.begin("rpi-monitor", false);
        learnedCpuBaseline = preferences.getFloat("cpu_base", 0.0f);
        learnedRoomBaseline = preferences.getFloat("room_base", 0.0f);
        preferences.end();

        if (learnedCpuBaseline > 0.0f || learnedRoomBaseline > 0.0f) {
            baselineLoaded = true;
        }
    }

    void saveLearningBaseline(bool force = false) {
        const unsigned long now = millis();
        if (!force && (!baselineDirty || now - lastBaselineSaveMs < BASELINE_SAVE_INTERVAL_MS)) {
            return;
        }

        preferences.begin("rpi-monitor", false);
        preferences.putFloat("cpu_base", learnedCpuBaseline);
        preferences.putFloat("room_base", learnedRoomBaseline);
        preferences.end();

        baselineDirty = false;
        lastBaselineSaveMs = now;
        Serial.println("Saved learned temperature baseline");
    }

    void updateLearningBaseline() {
        if (!validReading(CpuTemp) || !validReading(RoomTemp)) {
            return;
        }

        if (!baselineLoaded) {
            learnedCpuBaseline = CpuTemp;
            learnedRoomBaseline = RoomTemp;
            baselineLoaded = true;
            baselineDirty = true;
            return;
        }

        // Learn only during stable non-cooling operation to avoid threshold runaway.
        const bool stableIdleSample =
            currentState == ControlState::Idle &&
            CpuUsage < CPU_USAGE_RECOVER &&
            CpuTemp < (upper_thresold_temp + 2.0f);

        if (!stableIdleSample) {
            return;
        }

        const float previousCpuBaseline = learnedCpuBaseline;
        const float previousRoomBaseline = learnedRoomBaseline;

        learnedCpuBaseline = (learnedCpuBaseline * (1.0f - BASELINE_ALPHA)) + (CpuTemp * BASELINE_ALPHA);
        learnedRoomBaseline = (learnedRoomBaseline * (1.0f - BASELINE_ALPHA)) + (RoomTemp * BASELINE_ALPHA);

        if (fabsf(learnedCpuBaseline - previousCpuBaseline) > BASELINE_DRIFT_THRESHOLD ||
            fabsf(learnedRoomBaseline - previousRoomBaseline) > BASELINE_DRIFT_THRESHOLD) {
            baselineDirty = true;
        }
    }


ControlState inferTargetState() {
    if (!remoteDataFresh && millisSinceLastRpiData() > STALE_FAILSAFE_MS) {
        return ControlState::Fault;
    }

    if (nightMode) {
        return ControlState::Night;
    }

    if (!validReading(CpuTemp) || !validReading(RoomTemp) || !validReading(CpuUsage)) {
        return ControlState::Fault;
    }

    if (!filterInitialized) {
        filteredCpuTemp = CpuTemp;
        filteredRoomTemp = RoomTemp;
        filterInitialized = true;
    }

    const float previousFilteredCpuTemp = filteredCpuTemp;
    filteredCpuTemp = (filteredCpuTemp * 0.8f) + (CpuTemp * 0.2f);
    filteredRoomTemp = (filteredRoomTemp * 0.8f) + (RoomTemp * 0.2f);
    updateLearningBaseline();

    const float cpuTrend = filteredCpuTemp - previousFilteredCpuTemp;
    const bool remoteThresholdsValid = upper_thresold_temp > 1.0f && lower_thresold_temp > 1.0f;
    const float remoteUpper = remoteThresholdsValid ? upper_thresold_temp + 5.0f : 0.0f;
    const float remoteLower = remoteThresholdsValid ? lower_thresold_temp + 1.5f : 0.0f;
    const float learnedUpper = learnedCpuBaseline > 0.0f ? learnedCpuBaseline + 8.0f : 0.0f;
    const float learnedLower = learnedRoomBaseline > 0.0f ? learnedRoomBaseline + 2.0f : 0.0f;

    const float adaptiveUpper = remoteThresholdsValid
        ? max(remoteUpper, filteredRoomTemp + 6.0f)
        : max(learnedUpper, filteredRoomTemp + 6.0f);

    const float adaptiveLower = remoteThresholdsValid
        ? max(remoteLower, filteredRoomTemp + 2.0f)
        : max(learnedLower, filteredRoomTemp + 2.0f);

    logControlSnapshot(adaptiveUpper, adaptiveLower, cpuTrend);

    if (filteredCpuTemp >= adaptiveUpper || CpuUsage >= CPU_USAGE_HIGH || cpuTrend > CPU_TREND_RISING) {
        return ControlState::Cooling;
    }

    if (filteredCpuTemp <= adaptiveLower - 2.0f && CpuUsage < CPU_USAGE_RECOVER && cpuTrend <= CPU_TREND_FALLING) {
        return ControlState::Idle;
    }

    return currentState == ControlState::Boot ? ControlState::Idle : currentState;
}

void settleState(ControlState targetState) {
    const unsigned long now = millis();

    if (currentState == ControlState::Boot) {
        currentState = targetState;
        pendingState = targetState;
        pendingSinceMs = now;
        Serial.println(String("Control state -> ") + stateName(currentState));
        setRelaysForState(currentState);
        return;
    }

    if (targetState != currentState) {
        if (pendingState != targetState) {
            pendingState = targetState;
            pendingSinceMs = now;
        } else if (now - pendingSinceMs >= STATE_HOLD_MS) {
            currentState = targetState;
            pendingState = currentState;
            pendingSinceMs = now;
            Serial.println(String("Control state -> ") + stateName(currentState));
        }
    } else {
        pendingState = currentState;
        pendingSinceMs = now;
    }

    setRelaysForState(currentState);
}

void logControlSnapshot(float adaptiveUpper, float adaptiveLower, float cpuTrend) {
    const unsigned long now = millis();
    if (now - lastControlLogMs < 10000) {
        return;
    }

    lastControlLogMs = now;
    Serial.println(
        String("CTRL state=") + stateName(currentState) +
        " mode=" + RpiData.fan_mode_override +
        " fresh=" + (remoteDataFresh ? "yes" : "no") +
        " cpu=" + String(CpuTemp, 1) +
        " room=" + String(RoomTemp, 1) +
        " usage=" + String(CpuUsage, 1) +
        " up=" + String(adaptiveUpper, 1) +
        " low=" + String(adaptiveLower, 1) +
        " trend=" + String(cpuTrend, 2)
    );
}
}  // namespace

void setup() {
    Serial.begin(115200);

    loadLearningBaseline();
    
    // Initialize sensors and relays
    serverroom.init();
    SMPS.init();
    SMPS_FAN.init();
    RPI_FAN.init();
    PELTIER.init();
    
    // Turn on essential components
    SMPS.on();
    SMPS_FAN.on();
    RPI_FAN.on();
    PELTIER.off();  // Peltier is not used, so keep it off
    
    // Initialize WiFi and web server
    initWiFi(ssid, password);
    startWebServer();
    
    delay(tenSeconds);
    SMPS_FAN.off();  // Turn off the SMPS fan after initial delay
    saveLearningBaseline(true);
}

void loop() {
    // Handle client requests
    server.handleClient();

    // Read sensor data first so the control logic uses fresh values.
    RoomTemp = serverroom.readTemperature();
    RoomHumid = serverroom.readHumidity();
    CpuTemp = RpiData.cpu_temperature;
    CpuUsage = RpiData.cpu_usage;
    nightMode = RpiData.night_mode;
    upper_thresold_temp = RpiData.past_avg_temp;
    lower_thresold_temp = RpiData.lowest_temp;

    remoteDataFresh = hasRecentRpiData(RPI_DATA_STALE_MS);
    if (!remoteDataFresh) {
        // Without fresh RPi telemetry, use conservative local fallback values.
        CpuTemp = RoomTemp + 10.0f;
        CpuUsage = 0.0f;
        upper_thresold_temp = RoomTemp + 8.0f;
        lower_thresold_temp = RoomTemp + 2.0f;

        unsigned long now = millis();
        if (now - lastStaleLogMs > 15000) {
            lastStaleLogMs = now;
            Serial.println(
                String("RPi data stale for ") + String(millisSinceLastRpiData() / 1000) +
                "s, using local thermal fallback"
            );
        }
    }

    manageCoolingSystem();

    // Send data to Raspberry Pi periodically
    if (sys_uptime % 30 == 0) {
        sendDataToRaspberryPi(serverUrl, RoomTemp);
    }

    // Update SMPS and fan timers
    updateSMPSStatus();

    saveLearningBaseline();

    sys_uptime++;
    delay(oneSecond);
}

// Manage cooling system based on CPU temperature and usage
void manageCoolingSystem() {
    if (RpiData.fan_mode_override == "on") {
        settleState(ControlState::Cooling);
        return;
    }

    if (RpiData.fan_mode_override == "off") {
        settleState(ControlState::Idle);
        return;
    }

    settleState(inferTargetState());
}

// Activate night mode: keeps all systems running
void activateNightMode() {
    settleState(ControlState::Night);
}

// Update SMPS and fan status and timers
void updateSMPSStatus() {
    if (SMPS.Status()) {
        smps_ideal_timer = 0;
        smps_timer++;
        Serial.println("SMPS on for " + String(smps_timer) + " seconds");

        if (SMPS_FAN.Status()) {
            smps_fan_timer++;
            Serial.println("SMPS fan on for " + String(smps_fan_timer) + " seconds");
        } else {
            smps_fan_off_timer++;
            Serial.println("SMPS fan off for " + String(smps_fan_off_timer) + " seconds");
        }
    } else {
        smps_timer = 0;
        smps_ideal_timer++;
        Serial.println("SMPS off for " + String(smps_ideal_timer) + " seconds");
    }
}
