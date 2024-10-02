#ifndef DATA_PROCESSOR_H
#define DATA_PROCESSOR_H

#include <ArduinoJson.h>

struct RpiMetrics {
    float cpu_usage;
    float cpu_temperature;
    bool night_mode;
    float past_avg_temp;
    float lowest_temp;
};

// Function to process received data
RpiMetrics processReceivedData(const String& jsonData);

#endif
