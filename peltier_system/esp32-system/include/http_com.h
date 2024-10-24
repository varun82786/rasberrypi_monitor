#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#if 0
const char* ssid = "your_SSID";               // Your Wi-Fi SSID
const char* password = "your_PASSWORD";        // Your Wi-Fi password
const char* serverUrl = "http://your_raspberry_pi_ip:5000";  // Raspberry Pi IP address

WebServer server(80);  // Initialize the web server on port 80

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

    // Send data to Raspberry Pi after starting the server
    sendDataToRaspberryPi();
}

void loop() {
    server.handleClient();  // Handle incoming client requests

    // You can call sendDataToRaspberryPi periodically or based on conditions
    delay(10000);  // Send data every 10 seconds
}

void sendDataToRaspberryPi() {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(serverUrl + String("/data"));  // POST request to Raspberry Pi

        String jsonPayload = "{\"sensor\":\"ESP32\",\"temperature\":24.5}";
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
#endif