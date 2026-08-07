#include "sensor_manager.h"
#include <HTTPClient.h>
#include <WiFi.h>

namespace {
String buildEndpoint(const String& baseUrl) {
    return baseUrl + "/data";
}

String hostFromUrl(const String& url) {
    String host = url;
    int protoIdx = host.indexOf("://");
    if (protoIdx >= 0) {
        host = host.substring(protoIdx + 3);
    }

    int slashIdx = host.indexOf('/');
    if (slashIdx >= 0) {
        host = host.substring(0, slashIdx);
    }

    int portIdx = host.indexOf(':');
    if (portIdx >= 0) {
        host = host.substring(0, portIdx);
    }
    return host;
}

bool tryPostPayload(const String& endpoint, const String& payload) {
    HTTPClient http;
    http.setTimeout(4000);
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(payload);
    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("POST OK " + endpoint + " -> " + String(httpResponseCode));
        Serial.println("Response from Raspberry Pi: " + response);
        http.end();
        return true;
    }

    Serial.println(
        "POST fail " + endpoint +
        " code=" + String(httpResponseCode) +
        " err=" + HTTPClient::errorToString(httpResponseCode)
    );
    http.end();
    return false;
}
}  // namespace

void handleSensorData(float &sensorData, float sensorThreshold, bool &isSendingData, unsigned long &startTime) {
    // Simulate sensor reading
    sensorData += 1;  // Change sensor data dynamically for testing
    Serial.println("Simulated value of temp sensor: " + String(sensorData));
    
    // Check if condition is met (temperature exceeds threshold)
    if (sensorData > sensorThreshold && !isSendingData) {
        isSendingData = true;
        startTime = millis();  // Start the timer
        Serial.println("Condition met, starting to send data to Raspberry Pi...");
    }
}

void sendDataToRaspberryPi(const char* serverUrl, float Data) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected: skipping POST to Raspberry Pi");
        return;
    }

    String jsonPayload = "{\"sensor\":\"ESP32\",\"temperature\":" + String(Data) + "}";
    String primaryBase = String(serverUrl);
    String host = hostFromUrl(primaryBase);

    // Try configured endpoint first, then fallback ports used in this repo.
    String endpoints[3];
    int endpointCount = 0;
    endpoints[endpointCount++] = buildEndpoint(primaryBase);

    if (host.length() > 0) {
        String fallback5000 = "http://" + host + ":5000/data";
        String fallback6060 = "http://" + host + ":6060/data";

        if (fallback5000 != endpoints[0]) {
            endpoints[endpointCount++] = fallback5000;
        }
        if (fallback6060 != endpoints[0] && fallback6060 != endpoints[1]) {
            endpoints[endpointCount++] = fallback6060;
        }
    }

    for (int i = 0; i < endpointCount; i++) {
        if (tryPostPayload(endpoints[i], jsonPayload)) {
            return;
        }
    }

    Serial.println("All POST attempts to Raspberry Pi failed");
}
