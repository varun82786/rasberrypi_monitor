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
#define SMPS_PIN 21     // brown jwire
#define RPI_FAN_PIN 19  // RED jwire
#define SMPS_FAN_PIN 18 // orange jwire
#define PELITIER_PIN 5  // yellow jwire
#define DHT_PIN 15      // white jwire
#define DHTSENSORTYPE  DHT11

#define ON true
#define OFF false
#define nightMode false

// FLAG Declarations
boolean SMPS_Status = OFF;
boolean DHT_Status = OFF;


// Sensor and communication variables
float sensorData = 25.0;            // Simulate sensor data (e.g., temperature)
float sensorThreshold = 20.0;       // Example threshold to trigger communication
bool isSendingData = false;
unsigned long startTime = 0;



// Variables
float RoomTemp = 0;
float RoomHumid = 0;
float CpuTemp = 60;  // intital value is set to starts cooling sys
float CpuUsage = 50; // intital value is set to starts cooling sys
int sys_uptime = 0;  // counter to calculate the sys_uptime
int smps_timer = 1;  // counter for the smps on time
int smps_ideal_timer = 1; // counter for the smps off time

DHTSensor serverroom(DHT_PIN, DHTSENSORTYPE);

Relay SMPS(SMPS_PIN);
Relay SMPS_FAN(SMPS_FAN_PIN);
Relay RPI_FAN(RPI_FAN_PIN);
Relay PELITIER(PELITIER_PIN);


void setup() {
    Serial.begin(115200);

    serverroom.init(); 
    
    SMPS.init();
    SMPS.on();
    
    SMPS_FAN.init();
    SMPS_FAN.on();

    RPI_FAN.init();
    RPI_FAN.on();

    /*Pelitier is not implemented */
    PELITIER.init();
    PELITIER.off();


    initWiFi(ssid, password);
    startWebServer();

    delay(10000);
    SMPS_FAN.off();
    


        
}

void loop() {


    server.handleClient();  // Handle incoming client requests

    if (!nightMode){

        if(CpuTemp > 45 || CpuUsage >= 10 )
        {

            if (!SMPS.Status())
            {
                SMPS.on();
            }
            if (!RPI_FAN.Status())
            {
                RPI_FAN.on();
            }
            // implement counter for smps fan

        }
        else if (CpuTemp < 36 )
        {
            RPI_FAN.off();
            delay(10000);
            SMPS.off();

        }
    }
    else
    {
        SMPS.on();
        RPI_FAN.on();
        SMPS_FAN.on();
    }
    
    
    

    


    RoomTemp = serverroom.readTemperature();
    RoomHumid = serverroom.readHumidity();
    CpuTemp  = RpiData.cpu_temperature;
    CpuUsage = RpiData.cpu_usage;

    sys_uptime++;

    if(sys_uptime % 30 == 0){
        sendDataToRaspberryPi(serverUrl, RoomTemp);
    }

    if(SMPS.Status()){
        smps_ideal_timer = 1;
        smps_timer++;
        Serial.println("SMPS on for " + String(smps_timer) + " sec");
    }
    else{
        smps_timer = 1;
        smps_ideal_timer++;
        Serial.println("SMPS on for " + String(smps_ideal_timer) + " sec");
    }
    

    
    delay(1000);

    // night mode
}

