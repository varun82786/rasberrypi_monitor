#include "wifi_manager.h"
#include "data_processor.h"

extern RpiMetrics RpiData; // Global Variable to get store data

WebServer server(80);  // Initialize the web server on port 80

void initWiFi(const char* ssid, const char* password) {
    WiFi.begin(ssid, password);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nConnected to WiFi");
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
