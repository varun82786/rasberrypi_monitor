#include "sensor_manager.h"
#include <HTTPClient.h>
#include <WiFi.h>

void handleSensorData(float &sensorData, float sensorThreshold, bool &isSendingData, unsigned long &startTime) {
    // Simulate sensor reading
    sensorData += 0.1;  // Change sensor data dynamically for testing
    Serial.println("Simulated value of temp sensor: " + String(sensorData));
    
    // Check if condition is met (temperature exceeds threshold)
    if (sensorData > sensorThreshold && !isSendingData) {
        isSendingData = true;
        startTime = millis();  // Start the timer
        Serial.println("Condition met, starting to send data to Raspberry Pi...");
    }
}

void sendDataToRaspberryPi(const char* serverUrl, float sensorData) {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(serverUrl) + "/data");  // POST request to Raspberry Pi

        String jsonPayload = "{\"sensor\":\"ESP32\",\"temperature\":" + String(sensorData) + "}";
        http.addHeader("Content-Type", "application/json");

        int httpResponseCode = http.POST(jsonPayload);

        if (httpResponseCode > 0) {
            String response = http.getString();
            Serial.println("Response from Raspberry Pi: " + response);
        } else {
            Serial.println("Error in sending POST to Raspberry Pi: " + String(httpResponseCode));
        }

        http.end();
    }
}
