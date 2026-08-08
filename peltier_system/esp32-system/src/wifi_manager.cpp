#include "wifi_manager.h"
#include "data_processor.h"

extern RpiMetrics RpiData; // Global Variable to get store data

WebServer server(8080);  // Initialize the web server on port 80
static unsigned long lastRpiDataMs = 0;
static bool hasRpiData = false;
static String lastRpiIp = "";
static String fanModeOverride = "auto";

void initWiFi(const char* ssid, const char* password) {
    WiFi.begin(ssid, password);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startTime < 20000) {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nConnected to WiFi");
        Serial.println("ESP32 IP: " + WiFi.localIP().toString());
    } else {
        Serial.println("\nWiFi connection timed out");
    }
}

void startWebServer() {
    // Define routes for the web server
    server.on("/", HTTP_GET, []() {
        server.send(200, "text/plain", "Hello from ESP32!");
    });

    server.on("/data", HTTP_POST, []() {
        String jsonData = server.arg("plain"); // Get the JSON data from Raspberry Pi
        RpiMetrics parsed = processReceivedData(jsonData);  // Parse JSON and store data in global variable
        // Keep manual fan override sticky unless /fan-control explicitly changes it.
        parsed.fan_mode_override = fanModeOverride;
        RpiData = parsed;
        lastRpiDataMs = millis();
        hasRpiData = true;
        lastRpiIp = server.client().remoteIP().toString();

        Serial.println("Data received from Raspberry Pi: " + jsonData);
        Serial.println("RPi source IP: " + lastRpiIp);
        server.send(200, "application/json", "{\"message\": \"Data received successfully!\"}");
    });

    server.on("/fan-control", HTTP_GET, []() {
        server.send(
            200,
            "application/json",
            "{\"mode\":\"" + fanModeOverride + "\"}"
        );
    });

    server.on("/fan-control", HTTP_POST, []() {
        String jsonData = server.arg("plain");
        RpiMetrics incoming = processReceivedData(jsonData);
        String requestedMode = incoming.fan_mode_override;

        if (requestedMode != "auto" && requestedMode != "on" && requestedMode != "off") {
            server.send(400, "application/json", "{\"message\":\"Invalid mode\"}");
            return;
        }

        fanModeOverride = requestedMode;
        lastRpiDataMs = millis();
        hasRpiData = true;
        lastRpiIp = server.client().remoteIP().toString();

        RpiData.fan_mode_override = fanModeOverride;
        Serial.println("Fan override mode set to: " + fanModeOverride);
        server.send(
            200,
            "application/json",
            "{\"message\":\"Fan mode updated\",\"mode\":\"" + fanModeOverride + "\"}"
        );
    });

    server.begin();
    Serial.println("Web server started");
}

bool hasRecentRpiData(unsigned long maxAgeMs) {
    if (!hasRpiData) {
        return false;
    }
    return (millis() - lastRpiDataMs) <= maxAgeMs;
}

unsigned long millisSinceLastRpiData() {
    if (!hasRpiData) {
        // No packet has arrived yet; treat age as time since boot.
        return millis();
    }
    return millis() - lastRpiDataMs;
}

String getLastRpiIp() {
    return lastRpiIp;
}
