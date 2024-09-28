#include <Arduino.h>

#include "Relay.h"
#include "dhtsensor.h"
#include "wifi_manager.h"
#include "sensor_manager.h"
#include "secrets.h"
#include "data_processor.h"

// extern variables 
RpiMetrics RpiData;

//PIN Declarations 
#define SMPS_PIN 2 // GPIO pin on ESP32
#define DHT_PIN 15
#define DHTSENSORTYPE  DHT11

#define ON true
#define OFF false

// FLAG Declarations
boolean SMPS_Status = OFF;
boolean DHT_Status = OFF;


// Sensor and communication variables
float sensorData = 25.0;            // Simulate sensor data (e.g., temperature)
float sensorThreshold = 28.0;       // Example threshold to trigger communication
bool isSendingData = false;
unsigned long startTime = 0;

// Variables
float RoomTemp = 0;


DHTSensor serverroom(DHT_PIN, DHTSENSORTYPE);
Relay SMPS(SMPS_PIN);


void setup() {
    Serial.begin(115200);

    serverroom.init();
    SMPS.init();
    SMPS.on(); // turn on cooling system on esp32 boot


    initWiFi(ssid, password);
    startWebServer();



    
}

void loop() {

    server.handleClient();  // Handle incoming client requests

    handleSensorData(sensorData, sensorThreshold, isSendingData, startTime);
    
    // Send data if condition is met
    if (isSendingData) {
        sendDataToRaspberryPi(serverUrl, sensorData);
        sensorData = 10.0;  // Reset sensor value for simulation
        isSendingData = false;
    }

    float RoomTemp = serverroom.readTemperature();
    Serial.println(RoomTemp);

    Serial.println(RpiData.cpu_temperature);
    if (RpiData.cpu_usage == 0.0){
        SMPS.off();
    }
    else{
        SMPS.on();
    }

    
    delay(1000);
}
