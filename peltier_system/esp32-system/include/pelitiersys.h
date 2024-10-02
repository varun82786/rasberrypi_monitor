#ifndef PELITIERSYS_H
#define PELITIERSYS_H


// PIN Definitions
#define SMPS_PIN       21 // brown wire
#define RPI_FAN_PIN    19 // red wire
#define SMPS_FAN_PIN   18 // orange wire
#define PELTIER_PIN     5 // yellow wire
#define DHT_PIN        15 // white wire
#define DHTSENSORTYPE DHT11

// States
#define ON  true
#define OFF false

// Flag Declarations
bool SMPS_Status = OFF;
bool DHT_Status = OFF;
bool nightMode = false;
bool ComError = true;  // Communication error flag

// Sensor and Communication Variables
float sensorData = 25.0;
float sensorThreshold = 20.0;
bool isSendingData = false;
unsigned long startTime = 0;

// Room and CPU Metrics
float RoomTemp = 0;
float RoomHumid = 0;
float CpuTemp = 60;   // Default value to trigger cooling system
float CpuUsage = 50;  // Default value to trigger cooling system
float upper_thresold_temp = 50;
float lower_thresold_temp = 0;

// Timers
int sys_uptime = 0;          // System uptime counter
int smps_timer = 0;          // SMPS on-time counter
int smps_ideal_timer = 0;    // SMPS off-time counter
int smps_fan_timer = 0;      // SMPS fan on-time counter
int smps_fan_off_timer = 0;  // SMPS fan off-time counter

// Time Definitions (in milliseconds)
unsigned long oneSecond = 1000;
unsigned long tenSeconds = 10 * 1000;


void manageCoolingSystem();
void updateSMPSStatus();
void activateNightMode();


#endif