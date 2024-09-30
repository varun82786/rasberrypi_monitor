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
int smps_fan_timer = 1;
int smps_fan_off_timer = 1;

// variables for delays and other time purpose
unsigned long oneSecond = 1000;
unsigned long fiveSeconds = 5 * 1000;
unsigned long tenSeconds = 10 * 1000;
unsigned long halfMinute = 1 * 30 * 1000;
unsigned long oneMinutes = 1 * 60 * 1000;
unsigned long fiveMinutes = 5 * 60 * 1000;
unsigned long tenMinutes = 10 * 60 * 1000;
unsigned long fifteenMinutes = 15 * 60 * 1000;


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

    delay(fiveSeconds);
    SMPS_FAN.off();
    


        
}

void loop() {


    server.handleClient();  // Handle incoming client requests

    if (!nightMode){

        if(CpuTemp > 49 || CpuUsage >= 10 )
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
        else if (CpuTemp < 38 )
        {
            RPI_FAN.off();
            delay(tenSeconds);
            SMPS.off();
            SMPS.off();

        }


        if(smps_timer > fiveMinutes || sys_uptime > tenMinutes & smps_fan_off_timer == 1)
        {
            SMPS_FAN.on();
            smps_fan_timer++;
            
        }
        else if (smps_fan_timer > fiveMinutes)
        {
            SMPS_FAN.off();
            smps_fan_off_timer++;
        }

        if(smps_fan_off_timer > fifteenMinutes)
        {
           smps_fan_off_timer = 1;
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

    if(sys_uptime % halfMinute == 0){
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
        Serial.println("SMPS off for " + String(smps_ideal_timer) + " sec");
    }
    

    
    delay(oneSecond);

    // night mode
}

