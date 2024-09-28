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
#define SMPS_PIN 21 // GPIO pin on ESP32
#define RPI_FAN_PIN 19
#define SMPS_FAN_PIN 18
#define PELITIER_PIN 5
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
Relay SMPS_FAN(SMPS_FAN_PIN);
Relay RPI_FAN(RPI_FAN_PIN);
Relay PELITIER(PELITIER_PIN);


void setup() {
    Serial.begin(115200);

    serverroom.init(); 
    
    SMPS.init();
    SMPS.off();
    
    SMPS_FAN.init();
    SMPS_FAN.off();

    RPI_FAN.init();
    RPI_FAN.off();

    /*Pelitier is not implemented */
    PELITIER.init();
    PELITIER.off();


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
        SMPS.on();
        SMPS_FAN.on();
        RPI_FAN.on();
        PELITIER.on();
    }
    else{
        SMPS.off();
        SMPS_FAN.off();
        RPI_FAN.off();
        PELITIER.off();
    }

    
    delay(1000);
}
