#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>

const char* ssid = "Home-Sweet-Home";               // Your Wi-Fi SSID
const char* password = "EAVVballa@82786";        // Your Wi-Fi password
const char* serverUrl = "http://192.168.31.145:5000";  // Raspberry Pi IP address

WebServer server(80);  // Initialize the web server on port 80

float sensorData = 25.0;  // Simulate sensor data (e.g., temperature)
float sensorThreshold = 28.0;  // Example threshold to trigger communication
unsigned long dataSendingDuration = 30000;  // Send data for 30 seconds
bool isSendingData = false;
unsigned long startTime = 0;

void sendDataToRaspberryPi();

void setup() {
    Serial.begin(115200);
    WiFi.begin(ssid, password);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("Connected to WiFi");

    // Define routes for the web server
    server.on("/", HTTP_GET, []() {
        server.send(200, "text/plain", "Hello from ESP32!");
    });

    server.on("/data", HTTP_POST, []() {
        String jsonData = server.arg("plain");
        Serial.println("Data received from Raspberry Pi: " + jsonData);
        server.send(200, "application/json", "{\"message\": \"Data received successfully!\"}");
    });

    // Start the server
    server.begin();
    Serial.println("ESP32 Server started");
}

void loop() {
    server.handleClient();  // Handle incoming client requests
    
    // Simulate sensor reading
    sensorData += 0.01;  // Change sensor data dynamically for testing
    
    // Check if condition is met (temperature exceeds threshold)
    if (sensorData > sensorThreshold && !isSendingData) {
        isSendingData = true;
        startTime = millis();  // Start the timer
        Serial.println("Condition met, starting to send data to Raspberry Pi...");
    }

    // Send data if condition is met
    if (isSendingData) {
        sendDataToRaspberryPi();

        // Stop sending data after 30 seconds
        if (millis() - startTime >= dataSendingDuration) {
            isSendingData = false;
            Serial.println("Finished sending data to Raspberry Pi.");
        }
    }

    delay(1000);  // Adjust delay as necessary
}

void sendDataToRaspberryPi() {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(serverUrl + String("/data"));  // POST request to Raspberry Pi

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
