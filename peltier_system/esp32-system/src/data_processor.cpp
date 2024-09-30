#include "data_processor.h"

RpiMetrics processReceivedData(const String& jsonData) {
    DynamicJsonDocument doc(256);  // Use DynamicJsonDocument

    RpiMetrics data;

    // Parse JSON
    DeserializationError error = deserializeJson(doc, jsonData);
    if (error) {
        Serial.println("Failed to parse JSON");
        return data;
    }

    // Extract values from JSON
    data.cpu_usage = doc["cpu_usage"];
    data.cpu_temperature = doc["cpu_temperature"];
    data.night_mode= doc["night_mode"];

    return data;
}
