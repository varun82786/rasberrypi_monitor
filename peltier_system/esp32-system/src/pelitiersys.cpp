#include <Arduino.h>

#include "operations.h"
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


// FLAG Declarations
boolean SMPS_Status = OFF;
boolean DHT_Status = OFF;


// Sensor and communication variables
float sensorData = 25.0;            // Simulate sensor data (e.g., temperature)
float sensorThreshold = 20.0;       // Example threshold to trigger communication
bool isSendingData = false;
unsigned long startTime = 0;
bool nightMode = false; 
bool ComError = true; // variable to check COM error from RPI



// Variables
float RoomTemp = 0;
float RoomHumid = 0;
float CpuTemp = 60;  // intital value is set to starts cooling sys
float CpuUsage = 50; // intital value is set to starts cooling sys
int sys_uptime = 0;  // counter to calculate the sys_uptime
int smps_timer = 0;  // counter for the smps on time
int smps_ideal_timer = 0; // counter for the smps off time
int smps_fan_timer = 0;
int smps_fan_off_timer = 0;

// variables for delays and other time purpose
unsigned long oneSecond = 1000;
unsigned long fiveSeconds = 5 * 1000;
unsigned long tenSeconds = 10 * 1000;


// these variables will be used for validating counters so each counter will be called 1000millsec (1 sec) -> 60sec equals 1 minute
unsigned long halfMinute = 0.5 * 60;
unsigned long oneMinute = 1 * 60 ;   
unsigned long fiveMinutes = 5 * 60;
unsigned long tenMinutes = 10 * 60;
unsigned long fifteenMinutes = 15 * 60;
unsigned long threeHours = 3 * 60 * 60;



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

    delay(tenSeconds);
    SMPS_FAN.off();
     
}


void loop() {


    server.handleClient();  // Handle incoming client requests

    if (!nightMode){

        if(CpuTemp > 50 || CpuUsage >= 50 )
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
        else if (CpuTemp < 39 )
        {
            RPI_FAN.off();
            delay(tenSeconds);
            SMPS.off();

        }   
    }
    else
    {
        SMPS.on();
        RPI_FAN.on();
        SMPS_FAN.on();

        if (nightMode){
           Serial.println("Night Mode on");
        }
        
    }
    
    if(sys_uptime % 30 == 0){
        sendDataToRaspberryPi(serverUrl, RoomTemp);
    }

    if(SMPS.Status()){
        smps_ideal_timer = 0;
    
        Serial.println("SMPS on for " + String(smps_timer) + " sec");
        smps_timer++;

        if(SMPS_FAN.Status()){
            Serial.println("SMPS fan on for " + String(smps_fan_timer) + " sec");
            smps_fan_timer++;

        }
        else{
            Serial.println("SMPS fan off for " + String(smps_fan_off_timer) + " sec");
            smps_fan_off_timer++;
        }
    }
    else{
        Serial.println("SMPS off for " + String(smps_ideal_timer) + " sec");
        smps_ideal_timer++;
        smps_timer = 0;
    }
    

    RoomTemp = serverroom.readTemperature();
    RoomHumid = serverroom.readHumidity();
    CpuTemp  = RpiData.cpu_temperature;
    CpuUsage = RpiData.cpu_usage;
    nightMode = RpiData.night_mode;
    //ComError = RpiComStatus(CpuTemp);

    sys_uptime++;
    delay(oneSecond);

    // night mode
}

