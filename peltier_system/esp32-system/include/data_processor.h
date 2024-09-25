#ifndef DATA_PROCESSOR_H
#define DATA_PROCESSOR_H

#include <ArduinoJson.h>

struct RpiMetrics {
    float cpu_usage;
    float cpu_temperature;
};

// Function to process received data
RpiMetrics processReceivedData(const String& jsonData);

#endif
