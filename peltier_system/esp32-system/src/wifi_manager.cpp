#include "wifi_manager.h"
#include "data_processor.h"

extern RpiMetrics RpiData; // Global Variable to get store data

WebServer server(8080);  // Initialize the web server on port 80

void initWiFi(const char* ssid, const char* password) {
    WiFi.begin(ssid, password);

    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startTime < 20000) {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nConnected to WiFi");
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
        RpiData = processReceivedData(jsonData);  // Parse JSON and store data in global variable

        Serial.println("Data received from Raspberry Pi: " + jsonData);
        server.send(200, "application/json", "{\"message\": \"Data received successfully!\"}");
    });

    server.begin();
    Serial.println("Web server started");
}
