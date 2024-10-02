#include <Arduino.h>
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

void setup() {
    Serial.begin(115200);
    
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
}

void loop() {
    // Handle client requests
    server.handleClient();

    // Check night mode and control SMPS and fans accordingly

    if (!nightMode) {
        manageCoolingSystem();
    } else {
        activateNightMode();
    }

    // Send data to Raspberry Pi periodically
    if (sys_uptime % 30 == 0) {
        sendDataToRaspberryPi(serverUrl, RoomTemp);
    }

    // Update SMPS and fan timers
    updateSMPSStatus();

    // Read sensor data
    RoomTemp = serverroom.readTemperature();
    RoomHumid = serverroom.readHumidity();
    CpuTemp = RpiData.cpu_temperature;
    CpuUsage = RpiData.cpu_usage;
    nightMode = RpiData.night_mode;
    upper_thresold_temp = RpiData.past_avg_temp;
    lower_thresold_temp = RpiData.lowest_temp;

    sys_uptime++;
    delay(oneSecond);
}

// Manage cooling system based on CPU temperature and usage
void manageCoolingSystem() {
    if (CpuTemp > (upper_thresold_temp + 5.0) || CpuUsage >= 50) {
        if (!SMPS.Status()) {
            SMPS.on();
        }
        if (!RPI_FAN.Status()) {
            RPI_FAN.on();
            
        }
        SMPS_FAN.on();
    } else if (CpuTemp < (lower_thresold_temp - 5.0)) {
        RPI_FAN.off();
        delay(3 * tenSeconds);
        SMPS_FAN.off();
        SMPS.off();
    }
}

// Activate night mode: keeps all systems running
void activateNightMode() {
    SMPS.on();
    RPI_FAN.on();
    SMPS_FAN.on();
    Serial.println("Night Mode activated");
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
