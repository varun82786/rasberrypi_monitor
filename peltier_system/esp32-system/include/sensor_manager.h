#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

void handleSensorData(float &sensorData, float sensorThreshold, bool &isSendingData, unsigned long &startTime);
void sendDataToRaspberryPi(const char* serverUrl, float sensorData);

#endif
